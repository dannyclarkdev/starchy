#!/usr/bin/env node
'use strict';

/**
 * starchy — keep your layout crisp at every width.
 *
 * Finds every width where a page's layout actually changes, and flags the bugs.
 *
 * 1. Load the page at a max width and fingerprint its layout structure.
 * 2. Step down; when the fingerprint changes, bisect to the exact pixel.
 * 3. Snapshot before/after, describe what changed, and classify it:
 *      breakpoint — matches a media query in your CSS (expected)
 *      fluid      — layout changed with no media query (wrap, auto-fit…) → review
 *      problem    — a new overflow / overlap / clipped text / tiny text appeared
 * 4. Repeat down to a min width, for each viewport height requested.
 * 5. Write an HTML report + a JSON fingerprint you can diff against later.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { chromium } = require('playwright');
const { fingerprint, stressText, mediaConditions } = require('./src/fingerprint');
const { keyOf, parseBreakpoints, diffStates, issueRanges, groupRanges, uniqueProblems } = require('./src/analyze');
const { renderReport, KIND } = require('./src/report');
const { compareBaseline, sinceLast } = require('./src/baseline');

const HELP = `
Usage: starchy <url-or-file>... [options]

  e.g. starchy https://example.com
       starchy ./index.html --min 360 --heights 900,600
       starchy example.com example.com/about     (several pages, one report)
       starchy https://example.com/sitemap.xml   (every page in the sitemap)
       starchy *.html                            (every page in this folder)

  --max <px>          widest width to test             (default 1920)
  --min <px>          narrowest width to test          (default 320)
  --step <px>         coarse step before bisecting      (default 8)
  --heights <list>    viewport heights, comma-separated (default 900)
  --dpr <n>           device pixel ratio                (default 1)
  --min-font <px>     smallest acceptable text size     (default 12)
  --ignore <sels>     comma-separated selectors to skip (carousels, ads…)
  --settle <ms>       extra wait after each resize      (default 0)
  --out <dir>         output folder                     (default ./starchy-report)
  --baseline <file>   compare against an earlier fingerprint.json
  --fail-on <mode>    exit 1 on: none | problems | new  (default none)
  --no-screenshots    skip before/after images (faster)
  --no-overview       skip the overview images of each page at 1440/1024/768/390px
  --problem-shots     add a screenshot of each problem at its first failing width
  --stress            double the text in repeated items (lists, cards, grids)
                      to find layouts that only hold with short content
  --storage-state <f> load cookies/storage saved by Playwright, to check pages
                      behind a login. The file holds a live session: never commit it.
  --short             print only the problems and the summary
  --workers <n>       pages to sweep at once (default: from CPU cores and memory,
                      at most 8, or 4 for remote URLs). 1 sweeps on one page.
  --origin <url>      check the pages a sitemap lists on this origin instead,
                      e.g. a dev server: --origin http://localhost:3000
`;

function parseArgs(argv) {
  const o = {
    max: 1920, min: 320, step: 8, heights: [900], dpr: 1, minFont: 12, ignore: [],
    settle: 0, out: 'starchy-report', baseline: null, failOn: 'none', screenshots: true,
    problemShots: false, overview: true, stress: false, storageState: null, workers: 0, short: false, urls: [],
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i], next = () => argv[++i];
    switch (a) {
      case '-h': case '--help': console.log(HELP); process.exit(0); break;
      case '-v': case '--version': console.log(require('./package.json').version); process.exit(0); break;
      case '--max': o.max = parseInt(next(), 10); break;
      case '--min': o.min = parseInt(next(), 10); break;
      case '--step': o.step = Math.max(1, parseInt(next(), 10)); break;
      case '--heights': o.heights = next().split(',').map((h) => parseInt(h, 10)).filter(Boolean); break;
      case '--dpr': o.dpr = parseFloat(next()); break;
      case '--min-font': o.minFont = parseFloat(next()); break;
      case '--ignore': o.ignore = next().split(',').map((s) => s.trim()).filter(Boolean); break;
      case '--settle': o.settle = parseInt(next(), 10); break;
      case '--out': o.out = next(); break;
      case '--baseline': o.baseline = next(); break;
      case '--fail-on': o.failOn = next(); break;
      case '--no-screenshots': o.screenshots = false; break;
      case '--no-overview': o.overview = false; break;
      case '--problem-shots': o.problemShots = true; break;
      case '--stress': o.stress = true; break;
      case '--storage-state': o.storageState = next(); break;
      case '--short': o.short = true; break;
      case '--workers': o.workers = Math.max(1, parseInt(next(), 10) || 1); break;
      case '--origin': o.origin = next(); break;
      default:
        if (a.startsWith('--')) { console.error('Unknown option ' + a); process.exit(2); }
        o.urls.push(toUrl(a));
    }
  }
  if (!o.urls.length) { console.log(HELP); process.exit(2); }
  if (o.min >= o.max) { console.error('--min must be below --max'); process.exit(2); }
  if (o.storageState && !fs.existsSync(o.storageState)) { console.error(`Storage state file not found: ${o.storageState}`); process.exit(2); }
  if (o.origin) {
    let x;
    try { x = new URL(/^[a-z]+:\/\//i.test(o.origin) ? o.origin : (/^(localhost|127\.)/i.test(o.origin) ? 'http://' : 'https://') + o.origin); } catch { x = null; }
    if (!x || !/^https?:$/.test(x.protocol) || x.pathname !== '/' || x.search) { console.error(`--origin takes a scheme, host and port only, e.g. http://localhost:3000 (got ${o.origin})`); process.exit(2); }
    if (!o.urls.some((u) => /\.xml$/i.test(new URL(u).pathname))) { console.error('--origin only changes the pages a sitemap lists; pass a sitemap (*.xml) too'); process.exit(2); }
    o.origin = x.origin;
  }
  return o;
}

function toUrl(a) {
  const u = a.replace(/^<|>$/g, ''); // tolerate copied placeholder brackets
  if (/^[a-z]+:\/\//i.test(u)) return u;
  if (fs.existsSync(u)) return 'file://' + path.resolve(u);
  if (/^(localhost|[\w-]+(\.[\w-]+)+)(:\d+)?(\/|$)/i.test(u)) {
    return (/^localhost|^127\./i.test(u) ? 'http://' : 'https://') + u;
  }
  console.error(`Not a URL or an existing file: ${u}`);
  process.exit(2);
}

/**
 * Replace each sitemap URL (*.xml) with the pages it lists; follows sitemap index files.
 * With an origin, http(s) entries move to it, so a production sitemap checks a dev server.
 */
async function expandSitemaps(context, urls, origin, warned = new Set()) {
  const out = [];
  for (const u of urls) {
    if (!/\.xml$/i.test(new URL(u).pathname)) { out.push(u); continue; }
    let xml;
    if (u.startsWith('file:')) xml = fs.readFileSync(new URL(u), 'utf8');
    else {
      const res = await context.request.get(u);
      if (!res.ok()) throw new Error(`Could not read sitemap ${u}: HTTP ${res.status()}`);
      xml = await res.text();
    }
    const locs = Array.from(xml.matchAll(/<loc>\s*([^<]+?)\s*<\/loc>/gi), (m) => {
      const loc = new URL(m[1].replace(/&amp;/g, '&'), u); // relative entries resolve against the sitemap
      if (!origin || !/^https?:$/.test(loc.protocol)) return loc.href;
      return origin + loc.pathname + loc.search + loc.hash;
    });
    if (!locs.length) throw new Error(`No <loc> entries in sitemap ${u}`);
    const elsewhere = /^https?:/.test(u) && !origin && locs.map((l) => new URL(l)).find((l) => /^https?:$/.test(l.protocol) && l.origin !== new URL(u).origin);
    if (elsewhere && !warned.has(elsewhere.origin)) {
      warned.add(elsewhere.origin);
      console.warn(`  warning: the sitemap at ${new URL(u).origin} lists pages on ${elsewhere.origin}; add --origin ${new URL(u).origin} to check them there`);
    }
    out.push(...(/<sitemapindex/i.test(xml) ? await expandSitemaps(context, locs, origin, warned) : locs));
  }
  return [...new Set(out)];
}

async function settle(page, ms) {
  // a task queued from an animation frame runs after that whole frame: resize and
  // media-query listeners, rAF callbacks, layout and ResizeObserver callbacks
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0))));
  if (ms) await page.waitForTimeout(ms);
}

async function collectBreakpoints(page, context) {
  const { out, blocked } = await page.evaluate(mediaConditions);
  const texts = out.slice();
  for (const href of blocked) {
    try {
      // Chrome won't let a file:// page read another file's rules, and the request API can't fetch file:// URLs
      const css = href.startsWith('file:') ? fs.readFileSync(new URL(href), 'utf8') : await (await context.request.get(href)).text();
      const re = /@media([^{]+)\{/g;
      let m;
      while ((m = re.exec(css))) texts.push(m[1]);
    } catch (e) { /* unreachable stylesheet: its breakpoints show as "fluid" */ }
  }
  return parseBreakpoints(texts);
}

async function shoot(page, width, height, paths, o) {
  await page.setViewportSize({ width, height });
  await settle(page, o.settle);
  const info = await page.evaluate((paths) => {
    let u = null;
    for (const p of paths) {
      let el = null;
      try { el = document.querySelector(p); } catch (e) { /* skip */ }
      if (!el) continue;
      el.setAttribute('data-ls-hl', '');
      const r = el.getBoundingClientRect();
      const x = r.left + scrollX, y = r.top + scrollY;
      u = u ? { x1: Math.min(u.x1, x), y1: Math.min(u.y1, y), x2: Math.max(u.x2, x + r.width), y2: Math.max(u.y2, y + r.height) }
        : { x1: x, y1: y, x2: x + r.width, y2: y + r.height };
    }
    if (!document.getElementById('ls-hl-style')) {
      const s = document.createElement('style');
      s.id = 'ls-hl-style';
      s.textContent = '[data-ls-hl]{outline:3px solid #e5484d!important;outline-offset:-3px!important}';
      document.head.appendChild(s);
    }
    return { u, docH: document.documentElement.scrollHeight, docW: document.documentElement.scrollWidth };
  }, paths.slice(0, 25));

  const MAXH = 1000, PAD = 40;
  const clipW = Math.min(info.docW, width + 480); // show what spills off-screen
  let y = 0, h = Math.min(info.docH, 700);
  if (info.u) {
    y = Math.max(0, Math.floor(info.u.y1 - PAD));
    h = Math.min(MAXH, Math.ceil(info.u.y2 - info.u.y1 + PAD * 2), info.docH - y);
  }
  const buf = await page.screenshot({
    fullPage: true, type: 'jpeg', quality: 62,
    clip: { x: 0, y, width: clipW, height: Math.max(40, h) },
  });
  await page.evaluate(() => document.querySelectorAll('[data-ls-hl]').forEach((e) => e.removeAttribute('data-ls-hl')));
  return { data: buf.toString('base64'), viewport: width, clipW };
}

/** A cached fingerprint of `page` at a width. */
function measurer(page, height, o) {
  const cache = new Map();
  const at = async (w) => {
    if (cache.has(w)) return cache.get(w);
    await page.setViewportSize({ width: w, height });
    await settle(page, o.settle);
    const fp = await page.evaluate(fingerprint, { ignore: o.ignore, minFont: o.minFont });
    fp.width = w;
    fp.key = keyOf(fp);
    cache.set(w, fp);
    return fp;
  };
  at.cache = cache;
  return at;
}

/** Sweep from width `top` down to `bottom` on one page, bisecting each change to the exact pixel. */
async function sweepRange(at, top, bottom, breakpoints, o) {
  // also stop on both sides of every media-query boundary, so a layout that only
  // lives between two nearby queries can't fall between two steps
  const stops = breakpoints.flatMap((b) => [b.hi, b.hi - 1]);
  const first = await at(top);
  const transitions = [];
  let cur = first;
  while (cur.width > bottom) {
    const nextW = Math.max(bottom, cur.width - o.step, ...stops.filter((s) => s < cur.width));
    const next = await at(nextW);
    if (next.key === cur.key) { cur = next; continue; }
    // bisect to the exact pixel where the layout stops matching `cur`
    let hi = cur.width, lo = nextW;
    while (hi - lo > 1) {
      const mid = (hi + lo) >> 1;
      if ((await at(mid)).key === cur.key) hi = mid; else lo = mid;
    }
    const before = await at(hi), after = await at(lo);
    transitions.push({ hi, lo, diff: diffStates(before, after, breakpoints, hi), issuesBefore: before.issues });
    cur = after;
  }
  return { first, last: cur, transitions };
}

async function sweepHeight(pages, height, breakpoints, o, shotIds) {
  const ats = pages.map((p) => measurer(p, height, o));
  // one slice of the width range per page; neighbours measure the width where their slices meet
  const cuts = ats.map((_, i) => Math.round(o.max - ((o.max - o.min) * i) / ats.length)).concat(o.min);
  let parts = await Promise.all(ats.map((at, i) => sweepRange(at, cuts[i], cuts[i + 1], breakpoints, o)));
  if (parts.some((part, i) => i && part.first.key !== parts[i - 1].last.key)) {
    // A/B tests, random content…: slices from different loads can't be joined
    console.log('  warning: this page renders differently between loads, so it was swept again on one page.\n           If it has animated or random content, --ignore that part to keep the faster parallel sweep.');
    parts = [await sweepRange(ats[0], o.max, o.min, breakpoints, o)];
  }
  const first = parts[0].first, cur = parts[parts.length - 1].last;
  const transitions = parts.flatMap((part) => part.transitions);
  if (!o.short) for (const t of transitions) process.stdout.write(`  ${String(t.hi).padStart(5)}px  ${t.diff.category}\n`);

  const page = pages[0];
  if (o.screenshots) {
    for (const t of transitions) {
      const d = t.diff;
      const paths = [...new Set([
        ...d.newIssues.flatMap((x) => x.paths), ...d.resolved.flatMap((x) => x.paths),
        ...d.regrouped.map((x) => x.path), ...d.hidden.map((x) => x.path), ...d.shown.map((x) => x.path),
      ])];
      t.before = await shoot(page, t.hi, height, paths, o);
      t.after = await shoot(page, t.lo, height, paths, o);
    }
  }

  const ranges = issueRanges(first, transitions, o.min, cur);
  const problems = groupRanges(ranges);
  if (o.problemShots) {
    for (const g of problems) {
      // a problem already shot on an earlier page (shared header, footer…) is shown from there
      if (shotIds.has(height + '#' + g.id)) continue;
      shotIds.add(height + '#' + g.id);
      g.shot = await shoot(page, g.from, height, g.paths, o);
    }
  }

  // an overlap's cause can sit on either element of the pair
  for (const g of problems) for (const sel of g.paths.slice(0, 2)) g.source = g.source || await cssSource(page, g.from, height, sel, g.kind);

  const evals = ats.reduce((n, at) => n + at.cache.size, 0);
  return { height, first: { width: first.width, issues: first.issues }, transitions, ranges, problems, evals };
}

// the properties that usually cause each kind of problem
const CAUSES = {
  'page-overflow': ['width', 'min-width', 'flex', 'flex-basis', 'flex-shrink', 'white-space', 'grid-template-columns', 'margin', 'margin-left', 'margin-right', 'left', 'right', 'transform'],
  overlap: ['margin', 'margin-top', 'margin-bottom', 'margin-left', 'margin-right', 'transform', 'top', 'bottom', 'left', 'right', 'position'],
  'text-clipped': ['white-space', 'text-overflow', 'overflow', 'overflow-x', 'width', 'max-width', 'height', 'flex', 'flex-basis'],
  'link-wrapped': ['width', 'max-width', 'flex', 'flex-basis', 'white-space'],
  'tiny-text': ['font-size', 'font'],
  'small-range': ['grid-template-columns', 'display', 'flex-direction', 'flex-wrap', 'flex'],
  'hidden-range': ['display', 'visibility'],
  'text-overflow': ['white-space', 'overflow-wrap', 'word-break', 'width', 'max-width', 'font-size'],
  'image-distorted': ['width', 'height', 'max-width', 'max-height', 'aspect-ratio', 'object-fit'],
  'covered-text': ['position', 'top', 'right', 'bottom', 'left', 'inset', 'transform'],
  'text-cut': ['height', 'max-height', 'overflow', 'overflow-y'],
  'hidden-submit': ['display', 'visibility'],
};
CAUSES['container-overflow'] = CAUSES['page-overflow'];

/**
 * The CSS that most likely causes a problem, e.g. `.hero-img { width: 560px } (style.css:30)`:
 * the winning declarations of the relevant properties, from DevTools' matched rules at that width.
 */
async function cssSource(page, width, height, selector, kind) {
  if (!CAUSES[kind] || !selector) return null;
  const cdp = await page.context().newCDPSession(page);
  try {
    await page.setViewportSize({ width, height });
    await settle(page, 0);
    const sheets = new Map();
    cdp.on('CSS.styleSheetAdded', (e) => sheets.set(e.header.styleSheetId, e.header));
    await cdp.send('DOM.enable');
    await cdp.send('CSS.enable');
    const { root } = await cdp.send('DOM.getDocument', { depth: 0 });
    const { nodeId } = await cdp.send('DOM.querySelector', { nodeId: root.nodeId, selector });
    if (!nodeId) return null;
    const { matchedCSSRules = [], inlineStyle } = await cdp.send('CSS.getMatchedStylesForNode', { nodeId });
    // highest precedence first: the style attribute, then rules in reverse order
    const rules = [...(inlineStyle ? [{ style: inlineStyle, inline: true }] : []),
      ...matchedCSSRules.map((m) => m.rule).filter((r) => r.origin === 'regular').reverse()];
    const seen = new Set(), found = [];
    for (const r of rules) {
      // `range` marks a declaration written in the source (not a longhand implied by a shorthand)
      const decls = (r.style.cssProperties || []).filter((d) => d.range && !d.disabled && CAUSES[kind].includes(d.name) && !seen.has(d.name));
      if (!decls.length) continue;
      decls.forEach((d) => seen.add(d.name));
      const h = sheets.get(r.style.styleSheetId);
      const file = h && h.sourceURL && (path.basename(new URL(h.sourceURL).pathname) || new URL(h.sourceURL).pathname);
      const where = file ? ` (${file}:${h.startLine + decls[0].range.startLine + 1})` : '';
      const media = r.media && r.media.length ? ` in @media ${r.media[0].text}` : '';
      found.push(`${r.inline ? 'style=""' : r.selectorList.text} { ${decls.map((d) => `${d.name}: ${d.value}`).join('; ')} }${media}${where}`);
      if (found.length === 2) break;
    }
    return found.join(', ') || null;
  } catch (e) {
    return null; // a source hint is a bonus: never fail the run over it
  } finally {
    await cdp.detach().catch(() => {});
  }
}

// widths most people see the page at, for the overview images
const LOOK = [1440, 1024, 768, 390];
const TILE = 1500; // px: an image viewer, or a model, shrinks taller images until the text is unreadable

/** Full-page screenshots of `url` at the LOOK widths, cut into tiles, shared out over the loaded copies. */
async function overview(pages, url, o, used) {
  const u = new URL(url);
  let slug = (u.protocol === 'file:' ? path.basename(u.pathname).replace(/\.html?$/i, '') : u.pathname.replace(/^\/+|\/+$/g, '').replace(/[^\w-]+/g, '-')) || 'home';
  for (let i = 2; used.has(slug); i++) slug = slug.replace(/-\d+$/, '') + '-' + i;
  used.add(slug);
  const dir = path.join(o.out, 'overview');
  const widths = LOOK.filter((w) => w >= o.min && w <= o.max);
  await Promise.all(pages.map(async (page, i) => {
    for (const w of widths.filter((_, j) => j % pages.length === i)) {
      await page.setViewportSize({ width: w, height: o.heights[0] });
      await settle(page, o.settle);
      const h = Math.min(await page.evaluate(() => document.documentElement.scrollHeight), 6 * TILE);
      for (let y = 0, n = 1; y < h; y += TILE, n++) {
        await page.screenshot({ path: path.join(dir, `${slug}-${w}-${n}.jpg`), type: 'jpeg', quality: 70, fullPage: true, clip: { x: 0, y, width: w, height: Math.min(TILE, h - y) } });
      }
    }
  }));
  return slug;
}

/** Load `url` in `page` and get it ready to measure. */
async function prepare(page, url, o) {
  await page.setViewportSize({ width: o.max, height: o.heights[0] });
  const res = await page.goto(url, { waitUntil: 'load' });
  if (res && res.status() >= 400) throw new Error(`HTTP ${res.status()}`);
  // pages with live connections (payment widgets, chat, analytics) never go network-idle; a local file has nothing to wait for
  if (!url.startsWith('file:')) await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
  await page.evaluate(() => document.fonts && document.fonts.ready);
  const stressed = o.stress ? await page.evaluate(stressText) : 0;
  // freeze animations/transitions so they can't masquerade as layout changes
  await page.addStyleTag({ content: '*,*::before,*::after{transition:none!important;animation:none!important;caret-color:transparent!important}' });
  return stressed;
}

/** How many copies of the page to sweep at once. */
function workerCount(o, url) {
  if (o.workers) return o.workers;
  const cores = (os.availableParallelism ? os.availableParallelism() : os.cpus().length) - 1;
  // one page per 2 GB: os.freemem() leaves out the file cache, so on macOS it reports almost nothing
  const byMemory = Math.floor(os.totalmem() / 2e9);
  // each copy of a remote page is a full page load on someone's server
  const local = /^(file:|https?:\/\/(localhost|127\.0\.0\.1)(:|\/|$))/.test(url);
  // slices under 100px aren't worth a page load
  const byRange = Math.floor((o.max - o.min) / 100);
  return Math.max(1, Math.min(local ? 8 : 4, cores, byMemory, byRange));
}

async function scanPage(context, url, o, shotIds, slugs) {
  const pages = [await context.newPage()];
  try {
    const page = pages[0];
    const workers = workerCount(o, url);
    console.log(`\nstarchy ${url}\n  widths ${o.max}→${o.min}px, heights ${o.heights.join(', ')}px${workers > 1 ? `, ${workers} pages at a time` : ''}`);
    const stressed = await prepare(page, url, o);
    // a login redirect (e.g. an expired --storage-state session) would otherwise be checked silently
    const redirectedTo = new URL(page.url()).href !== new URL(url).href ? page.url() : null;
    if (redirectedTo) console.log(`  warning: redirected to ${redirectedTo}`);
    if (o.stress) console.log(`  stress: doubled ${stressed} text runs in repeated items`);

    const breakpoints = await collectBreakpoints(page, context);
    console.log(`  media-query breakpoints found: ${breakpoints.map((b) => b.hi).join(', ') || 'none'}`);

    // extra copies that fail to load (rate limits…) are dropped; the sweep just uses fewer pages
    const extra = await Promise.all(Array.from({ length: workers - 1 }, async () => {
      const p = await context.newPage();
      pages.push(p);
      try { await prepare(p, url, o); return p; } catch (e) { return null; }
    }));
    const sweepers = [page, ...extra.filter(Boolean)];

    const runs = [];
    for (const h of o.heights) {
      if (!o.short) console.log(`\n  height ${h}px`);
      runs.push(await sweepHeight(sweepers, h, breakpoints, o, shotIds));
    }
    const look = o.overview ? await overview(sweepers, url, o, slugs) : null;
    return { url, redirectedTo, breakpoints, runs, look };
  } finally {
    await Promise.all(pages.map((p) => p.close()));
  }
}

async function main() {
  const o = parseArgs(process.argv.slice(2));
  const started = Date.now();
  // no 60fps cap: each width waits for one frame, so frames are most of the sweep time
  const browser = await chromium.launch({ args: ['--disable-frame-rate-limit', '--disable-gpu-vsync'] });
  const context = await browser.newContext({ deviceScaleFactor: o.dpr, storageState: o.storageState || undefined });

  const urls = await expandSitemaps(context, o.urls, o.origin);
  if (urls.length > 1) console.log(`starchy: ${urls.length} pages`);
  const pages = [], failed = [], shotIds = new Set(), slugs = new Set();
  // images from an earlier run of other pages would look like part of this one
  if (o.overview) { fs.rmSync(path.join(o.out, 'overview'), { recursive: true, force: true }); fs.mkdirSync(path.join(o.out, 'overview'), { recursive: true }); }
  for (const url of urls) {
    try {
      pages.push(await scanPage(context, url, o, shotIds, slugs));
    } catch (e) {
      const error = e.message.split('\n')[0];
      console.error(`  skipped ${url}: ${error}`);
      failed.push({ url, error });
    }
  }
  await browser.close();

  const result = {
    generated: new Date().toISOString(), seconds: Math.round((Date.now() - started) / 100) / 10,
    options: { max: o.max, min: o.min, step: o.step, heights: o.heights, dpr: o.dpr, minFont: o.minFont, ignore: o.ignore, stress: o.stress },
    pages, failed,
  };

  let comparison = null;
  if (o.baseline) comparison = compareBaseline(result, JSON.parse(fs.readFileSync(o.baseline, 'utf8')));
  // re-running into the same folder (fix, re-check, fix…) shows what the last edit changed
  let since = null;
  const lastPath = path.join(o.out, 'fingerprint.json');
  if (!o.baseline && fs.existsSync(lastPath)) {
    try { since = sinceLast(result, JSON.parse(fs.readFileSync(lastPath, 'utf8'))); } catch (e) { /* unreadable: treat as a first run */ }
  }

  fs.mkdirSync(o.out, { recursive: true });
  const fingerprintJson = toFingerprint(result);
  fs.writeFileSync(path.join(o.out, 'fingerprint.json'), JSON.stringify(fingerprintJson, null, 2));
  fs.writeFileSync(path.join(o.out, 'report.html'), renderReport(result, comparison));

  const changes = pages.reduce((n, p) => n + p.runs.reduce((m, r) => m + r.transitions.length, 0), 0);
  const unique = uniqueProblems(pages);
  const elements = unique.reduce((n, g) => n + g.count, 0);
  // the element and range for each problem, so nobody has to open the report or parse fingerprint.json to act on it
  if (unique.length) console.log('\n  problems');
  // one line per element pair and kind: the same badge over six titles, or a tag row that escapes at
  // four separate ranges, is one thing to fix
  const lines = [];
  let starred = false;
  for (const g of unique) {
    const k = [g.kind, g.labels.join('|'), g.height, g.urls.join(' ')].join('#');
    const same = lines.find((x) => x.k === k);
    if (same) { same.more.push(g); continue; }
    lines.push({ k, g, more: [] });
  }
  for (const { g: first, more } of lines) {
    const all = [first, ...more];
    const g = { ...first, count: all.reduce((n, x) => n + x.count, 0), detail: first.detail + (more.length ? ` (and ${more.length} more like it)` : '') };
    const split = new Set(all.map((x) => x.from + '-' + x.to)).size > 1;
    const span = `${Math.max(...all.map((x) => x.from))}→${Math.min(...all.map((x) => x.to))}px${split ? '*' : ''}`;
    if (split) starred = true;
    // a local file by its name, a site page by its path: the full URL on every line is just noise
    const short = (u) => { const x = new URL(u); return x.protocol === 'file:' ? path.basename(x.pathname) : x.pathname + x.search; };
    const where = [pages.length > 1 && (g.urls.length > 1 ? `${g.urls.length} pages` : short(g.urls[0])), o.heights.length > 1 && `${g.height}px tall`].filter(Boolean).join(', ');
    console.log(`   ${span.padEnd(12)} ${KIND[g.kind].padEnd(19)} ${g.labels.join(' ↔ ')}${g.count > 1 ? ` ×${g.count}` : ''}: ${g.detail}${where ? ` (${where})` : ''}`);
    if (g.source) console.log(`                ${' '.repeat(19)} css: ${g.source}`);
  }
  if (starred) console.log('   * several separate ranges in this span: the report lists each one');
  if (since) {
    const fixed = new Set(since.fixedProblems.map((x) => x.key)).size, added = since.newProblems.length;
    const moved = since.newChanges.length + since.goneChanges.length;
    console.log(`\n  since last run: ${fixed} problem${fixed === 1 ? '' : 's'} fixed, ${added} new${moved ? `, ${moved} layout change${moved === 1 ? '' : 's'} moved, added or removed` : ''}`);
    for (const x of since.newProblems) console.log(`    new: ${KIND[x.kind]} on ${x.labels.join(' ↔ ')} at ${x.from}→${x.to}px`);
    for (const x of since.nowHidden) console.log(`    now hidden: ${x}`);
  }
  console.log(`\n  ${pages.length > 1 ? pages.length + ' pages · ' : ''}${changes} layout changes · ${unique.length} problem${unique.length === 1 ? '' : 's'}${elements > unique.length ? ` (${elements} elements)` : ''} · ${result.seconds}s`);
  if (failed.length) console.log(`  ${failed.length} page${failed.length === 1 ? '' : 's'} could not be checked`);
  console.log(`  report → ${path.join(o.out, 'report.html')}`);
  // 0 problems is not "the page is fine": say what the sweep can't see
  console.log('  not checked: what fixed bars cover while scrolling, whether an element (other than a submit button) that hides below some width should stay hidden, what images show, color and contrast.');
  const looks = pages.map((p) => p.look).filter(Boolean);
  if (looks.length) {
    const widths = LOOK.filter((w) => w >= o.min && w <= o.max);
    console.log(`  look: ${path.join(o.out, 'overview')}/ has ${looks.length > 1 ? 'every page' : 'the page'} at ${widths.join(', ')}px (${looks[0]}-${widths[widths.length - 1]}-1.jpg …). Open a few: starchy can't see everything.`);
  } else console.log('  Look at the page as well.');

  if (!pages.length) process.exit(1);
  if (o.failOn === 'problems' && unique.length > 0) process.exit(1);
  if (o.failOn === 'new' && comparison && (comparison.newProblems.length || comparison.newChanges.length)) process.exit(1);
}

/** Compact, screenshot-free record for baselines and CI diffs. */
function toFingerprint(result) {
  return {
    generated: result.generated, options: result.options,
    pages: result.pages.map((p) => ({
      url: p.url, redirectedTo: p.redirectedTo,
      runs: p.runs.map((r) => ({
        height: r.height,
        changes: r.transitions.map((t) => ({
          at: t.hi, category: t.diff.category,
          regrouped: t.diff.regrouped.map((x) => ({ path: x.path, from: x.from, to: x.to })),
          hidden: t.diff.hidden.map((x) => x.path), shown: t.diff.shown.map((x) => x.path),
        })),
        problems: r.ranges.map((x) => ({ key: x.issue.key, kind: x.issue.kind, labels: x.issue.labels, detail: x.issue.detail, from: x.from, to: x.to })),
      })),
    })),
    failed: result.failed,
  };
}

main().catch((e) => { console.error(e); process.exit(1); });
