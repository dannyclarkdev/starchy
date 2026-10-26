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
const path = require('path');
const { chromium } = require('playwright');
const { fingerprint, mediaConditions } = require('./src/fingerprint');
const { keyOf, parseBreakpoints, diffStates, issueRanges } = require('./src/analyze');
const { renderReport } = require('./src/report');
const { compareBaseline } = require('./src/baseline');

const HELP = `
Usage: starchy <url-or-file> [options]

  e.g. starchy https://example.com
       starchy ./index.html --min 360 --heights 900,600

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
`;

function parseArgs(argv) {
  const o = {
    max: 1920, min: 320, step: 8, heights: [900], dpr: 1, minFont: 12, ignore: [],
    settle: 0, out: 'starchy-report', baseline: null, failOn: 'none', screenshots: true, url: null,
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
      default:
        if (a.startsWith('--')) { console.error('Unknown option ' + a); process.exit(2); }
        o.url = a;
    }
  }
  if (!o.url) { console.log(HELP); process.exit(2); }
  o.url = o.url.replace(/^<|>$/g, ''); // tolerate copied placeholder brackets
  if (!/^[a-z]+:\/\//i.test(o.url)) {
    if (fs.existsSync(o.url)) o.url = 'file://' + path.resolve(o.url);
    else if (/^(localhost|[\w-]+(\.[\w-]+)+)(:\d+)?(\/|$)/i.test(o.url)) {
      o.url = (/^localhost|^127\./i.test(o.url) ? 'http://' : 'https://') + o.url;
    } else { console.error(`Not a URL or an existing file: ${o.url}`); process.exit(2); }
  }
  if (o.min >= o.max) { console.error('--min must be below --max'); process.exit(2); }
  return o;
}

async function settle(page, ms) {
  // two animation frames = style + layout have run after the resize
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  if (ms) await page.waitForTimeout(ms);
}

async function collectBreakpoints(page, context) {
  const { out, blocked } = await page.evaluate(mediaConditions);
  const texts = out.slice();
  for (const href of blocked) {
    try {
      const res = await context.request.get(href);
      const css = await res.text();
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

async function sweepHeight(page, height, breakpoints, o) {
  const cache = new Map();
  let evals = 0;
  const at = async (w) => {
    if (cache.has(w)) return cache.get(w);
    await page.setViewportSize({ width: w, height });
    await settle(page, o.settle);
    const fp = await page.evaluate(fingerprint, { ignore: o.ignore, minFont: o.minFont });
    fp.width = w;
    fp.key = keyOf(fp);
    cache.set(w, fp);
    evals++;
    return fp;
  };

  const first = await at(o.max);
  const transitions = [];
  let cur = first;
  while (cur.width > o.min) {
    const nextW = Math.max(o.min, cur.width - o.step);
    const next = await at(nextW);
    if (next.key === cur.key) { cur = next; continue; }
    // bisect to the exact pixel where the layout stops matching `cur`
    let hi = cur.width, lo = nextW;
    while (hi - lo > 1) {
      const mid = (hi + lo) >> 1;
      if ((await at(mid)).key === cur.key) hi = mid; else lo = mid;
    }
    const before = await at(hi), after = await at(lo);
    const diff = diffStates(before, after, breakpoints, hi);
    transitions.push({ hi, lo, diff, issuesBefore: before.issues });
    process.stdout.write(`  ${String(hi).padStart(5)}px  ${diff.category}\n`);
    cur = after;
  }

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

  return { height, first: { width: first.width, issues: first.issues }, transitions, ranges: issueRanges(first, transitions, o.min, cur), evals };
}

async function main() {
  const o = parseArgs(process.argv.slice(2));
  const started = Date.now();
  const browser = await chromium.launch();
  const context = await browser.newContext({ deviceScaleFactor: o.dpr });
  const page = await context.newPage();

  console.log(`starchy ${o.url}\n  widths ${o.max}→${o.min}px, heights ${o.heights.join(', ')}px`);
  await page.setViewportSize({ width: o.max, height: o.heights[0] });
  await page.goto(o.url, { waitUntil: 'networkidle' });
  await page.evaluate(() => document.fonts && document.fonts.ready);
  // freeze animations/transitions so they can't masquerade as layout changes
  await page.addStyleTag({ content: '*,*::before,*::after{transition:none!important;animation:none!important;caret-color:transparent!important}' });

  const breakpoints = await collectBreakpoints(page, context);
  console.log(`  media-query breakpoints found: ${breakpoints.map((b) => b.hi).join(', ') || 'none'}`);

  const runs = [];
  for (const h of o.heights) {
    console.log(`\n  height ${h}px`);
    runs.push(await sweepHeight(page, h, breakpoints, o));
  }
  await browser.close();

  const result = {
    url: o.url, generated: new Date().toISOString(), seconds: Math.round((Date.now() - started) / 100) / 10,
    options: { max: o.max, min: o.min, step: o.step, heights: o.heights, dpr: o.dpr, minFont: o.minFont, ignore: o.ignore },
    breakpoints, runs,
  };

  let comparison = null;
  if (o.baseline) comparison = compareBaseline(result, JSON.parse(fs.readFileSync(o.baseline, 'utf8')));

  fs.mkdirSync(o.out, { recursive: true });
  const fingerprintJson = toFingerprint(result);
  fs.writeFileSync(path.join(o.out, 'fingerprint.json'), JSON.stringify(fingerprintJson, null, 2));
  fs.writeFileSync(path.join(o.out, 'report.html'), renderReport(result, comparison));

  const all = runs.flatMap((r) => r.transitions);
  const problems = runs.reduce((n, r) => n + r.ranges.length, 0);
  console.log(`\n  ${all.length} layout changes · ${problems} problem${problems === 1 ? '' : 's'} · ${result.seconds}s`);
  console.log(`  report → ${path.join(o.out, 'report.html')}`);

  if (o.failOn === 'problems' && problems > 0) process.exit(1);
  if (o.failOn === 'new' && comparison && (comparison.newProblems.length || comparison.newChanges.length)) process.exit(1);
}

/** Compact, screenshot-free record for baselines and CI diffs. */
function toFingerprint(result) {
  return {
    url: result.url, generated: result.generated, options: result.options,
    runs: result.runs.map((r) => ({
      height: r.height,
      changes: r.transitions.map((t) => ({
        at: t.hi, category: t.diff.category,
        regrouped: t.diff.regrouped.map((x) => ({ path: x.path, from: x.from, to: x.to })),
        hidden: t.diff.hidden.map((x) => x.path), shown: t.diff.shown.map((x) => x.path),
      })),
      problems: r.ranges.map((x) => ({ key: x.issue.key, kind: x.issue.kind, labels: x.issue.labels, detail: x.issue.detail, from: x.from, to: x.to })),
    })),
  };
}

main().catch((e) => { console.error(e); process.exit(1); });
