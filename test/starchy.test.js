'use strict';

// Run with `npm test`. Unit tests need no browser; end-to-end tests run the real CLI
// (Playwright + Chromium) against a local server that serves the fixtures.

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const http = require('http');
const path = require('path');
const { execFile } = require('child_process');
const { parseBreakpoints, groupRanges, uniqueProblems, smallRanges } = require('../src/analyze');
const { compareBaseline } = require('../src/baseline');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'test-report');
const read = (f) => fs.readFileSync(path.join(__dirname, f), 'utf8');

// ---------- helpers ----------

/** Run the CLI; resolves with { code, stdout, stderr } and never rejects on a non-zero exit. */
function cli(args) {
  return new Promise((resolve) => {
    execFile(process.execPath, [path.join(ROOT, 'cli.js'), ...args], { cwd: ROOT, timeout: 240000 }, (err, stdout, stderr) => {
      resolve({ code: err ? (typeof err.code === 'number' ? err.code : 1) : 0, stdout, stderr });
    });
  });
}
const fp = (name) => JSON.parse(fs.readFileSync(path.join(OUT, name, 'fingerprint.json'), 'utf8'));
const html = (name) => fs.readFileSync(path.join(OUT, name, 'report.html'), 'utf8');
const text = (s) => s.replace(/<[^>]+>/g, ' ').replace(/&quot;/g, '"').replace(/\s+/g, ' ');
const find = (problems, kind, label) => problems.filter((p) => p.kind === kind && p.labels.some((l) => l.includes(label)));
/** The "Problems by width range" list of each page section, keyed by page name. */
function pageProblemLists(report) {
  const out = {};
  for (const part of report.split('<h2 class="page-h">').slice(1)) {
    const name = part.slice(0, part.indexOf('<'));
    out[name] = text(part.split('Problems by width range')[1].split('Every layout change')[0]);
  }
  return out;
}

// a fake issue range, as issueRanges() makes them
const range = (key, kind, label, from, to, detail = 'd') => ({ from, to, issue: { key, kind, labels: [label], detail, paths: [key] } });

// ---------- unit tests ----------

describe('parseBreakpoints', () => {
  test('turns media queries into the first width where the layout differs', () => {
    const hi = (t) => parseBreakpoints([t]).map((b) => b.hi);
    assert.deepEqual(hi('(max-width: 767px)'), [768]);
    assert.deepEqual(hi('(min-width: 48em)'), [768]);
    assert.deepEqual(hi('(width >= 600px)'), [600]);
    assert.deepEqual(hi('(width < 40rem)'), [640]);
    assert.deepEqual(hi('(400px <= width)'), [400]);
  });
});

describe('groupRanges', () => {
  test('merges identical problems on repeated elements', () => {
    const g = groupRanges([
      range('a', 'tiny-text', 'span.tag', 1920, 320), range('b', 'tiny-text', 'span.tag', 1920, 320), range('c', 'tiny-text', 'span.tag', 1920, 320),
    ]);
    assert.equal(g.length, 1);
    assert.equal(g[0].count, 3);
    assert.deepEqual(g[0].paths, ['a', 'b', 'c']);
  });
  test('keeps one element with two separate ranges as two problems with different ids', () => {
    const g = groupRanges([range('a', 'text-clipped', 'button.cta', 1048, 1024), range('a', 'text-clipped', 'button.cta', 784, 320)]);
    assert.equal(g.length, 2);
    assert.notEqual(g[0].id, g[1].id);
  });
  test('keeps different details apart', () => {
    const g = groupRanges([range('a', 'tiny-text', 'span', 1920, 320, '9px'), range('b', 'tiny-text', 'span', 1920, 320, '11px')]);
    assert.equal(g.length, 2);
  });
});

// a fake transition, as sweepHeight() makes them: `hi` keeps the old layout, `lo` has the new one
const change = (hi, { regrouped = [], hidden = [], shown = [] } = {}) => ({ hi, lo: hi - 1, diff: { regrouped, hidden, shown } });
const rows = (path, from, to) => ({ path, label: path, from, to });

describe('smallRanges', () => {
  test('flags a layout that holds for 5px or fewer, and not one that holds for 6px', () => {
    const five = smallRanges([change(800, { regrouped: [rows('div.a', '3', '2+1')] }), change(795, { regrouped: [rows('div.a', '2+1', '1+1+1')] })]);
    assert.equal(five.length, 1);
    assert.deepEqual([five[0].from, five[0].to, five[0].issue.detail], [799, 795, '"2+1" layout holds for only 5px']);
    const six = smallRanges([change(800, { regrouped: [rows('div.a', '3', '2+1')] }), change(794, { regrouped: [rows('div.a', '2+1', '1+1+1')] })]);
    assert.equal(six.length, 0);
  });
  test('flags an element that is visible for only a few px', () => {
    const r = smallRanges([change(703, { shown: [{ path: 'div.promo', label: 'div.promo' }] }), change(700, { hidden: [{ path: 'div.promo', label: 'div.promo' }] })]);
    assert.deepEqual(r.map((x) => [x.issue.key, x.from, x.to, x.issue.detail]), [['small-range|div.promo', 702, 700, 'visible for only 3px']]);
  });
  test('reports a child that appears for a few px once, not again through the rows of its parent', () => {
    const promo = { path: 'body > div.promo', label: 'div.promo' };
    const r = smallRanges([
      change(703, { regrouped: [rows('body', '1+1', '1+1+1')], shown: [promo] }),
      change(700, { regrouped: [rows('body', '1+1+1', '1+1')], hidden: [promo] }),
    ]);
    assert.deepEqual(r.map((x) => x.issue.labels[0]), ['div.promo']);
  });
  test('flags an element hidden in a middle range but shown on both sides of it', () => {
    const cta = { path: 'a.order', label: 'a.order' };
    const r = smallRanges([change(900, { hidden: [cta] }), change(700, { shown: [cta] })]);
    assert.deepEqual(r.map((x) => [x.issue.kind, x.from, x.to, x.issue.detail]), [['hidden-range', 899, 700, 'shown on both sides of this range, hidden for 200px in between']]);
    assert.equal(smallRanges([change(900, { hidden: [cta] })]).length, 0, 'hidden down to the end of the sweep is a normal mobile layout');
  });
  test('ignores changes to different containers, and states cut off by the sweep', () => {
    assert.equal(smallRanges([change(800, { regrouped: [rows('div.a', '3', '2+1')] }), change(799, { regrouped: [rows('div.b', '2', '1+1')] })]).length, 0);
    assert.equal(smallRanges([change(800, { regrouped: [rows('div.a', '2+1', '3')] })]).length, 0);
  });
});

describe('uniqueProblems', () => {
  test('lists a problem found on two pages once, with both pages', () => {
    const page = (url, ranges) => ({ url, runs: [{ height: 900, problems: groupRanges(ranges) }] });
    const u = uniqueProblems([
      page('https://x.com/', [range('hdr', 'link-wrapped', 'a.book', 845, 320), range('main', 'overlap', 'div', 899, 320)]),
      page('https://x.com/about', [range('hdr', 'link-wrapped', 'a.book', 845, 320)]),
    ]);
    assert.equal(u.length, 2);
    assert.deepEqual(u.find((g) => g.kind === 'link-wrapped').urls, ['https://x.com/', 'https://x.com/about']);
    assert.deepEqual(u.find((g) => g.kind === 'overlap').urls, ['https://x.com/']);
  });
  test('keeps the same problem at two heights apart', () => {
    const r = groupRanges([range('a', 'overlap', 'div', 900, 320)]);
    const u = uniqueProblems([{ url: 'u', runs: [{ height: 900, problems: r }, { height: 600, problems: r }] }]);
    assert.equal(u.length, 2);
  });
});

describe('compareBaseline', () => {
  const run = (ranges) => ({ height: 900, transitions: [], ranges });
  const baseRun = (keys) => ({ height: 900, changes: [], problems: keys.map((key) => ({ key, kind: 'overlap', labels: ['x'], from: 900, to: 320 })) });

  test('reads a 0.1.x single-page baseline and matches "x.com" to "x.com/"', () => {
    const result = { pages: [{ url: 'https://x.com/', runs: [run([range('old', 'overlap', 'x', 900, 320), range('new', 'overlap', 'y', 900, 320)])] }] };
    const cmp = compareBaseline(result, { url: 'https://x.com', generated: 'g', runs: [baseRun(['old', 'gone'])] });
    assert.deepEqual(cmp.newProblems.map((p) => p.labels[0]), ['y']);
    assert.deepEqual(cmp.fixedProblems.map((p) => p.key), ['gone']);
  });
  test('matches pages by URL when there are several, and skips pages the baseline lacks', () => {
    const result = { pages: [
      { url: 'https://x.com/', runs: [run([range('a', 'overlap', 'x', 900, 320)])] },
      { url: 'https://x.com/new-page', runs: [run([range('b', 'overlap', 'x', 900, 320)])] },
    ] };
    const cmp = compareBaseline(result, { generated: 'g', pages: [{ url: 'https://x.com', runs: [baseRun(['a'])] }] });
    assert.equal(cmp.newProblems.length, 0);
  });
  test('compares one page with one page even when the URLs differ (staging vs. local)', () => {
    const result = { pages: [{ url: 'http://localhost:8000/', runs: [run([range('a', 'overlap', 'x', 900, 320)])] }] };
    const cmp = compareBaseline(result, { generated: 'g', pages: [{ url: 'https://staging.x.com/', runs: [baseRun([])] }] });
    assert.equal(cmp.newProblems.length, 1);
  });
});

// ---------- argument errors (exit before the browser starts) ----------

describe('arguments', () => {
  test('no URL prints help and exits 2', async () => {
    const r = await cli([]);
    assert.equal(r.code, 2);
    assert.match(r.stdout, /Usage: starchy/);
  });
  test('an unknown option exits 2', async () => {
    const r = await cli(['x.com', '--bogus']);
    assert.equal(r.code, 2);
    assert.match(r.stderr, /Unknown option --bogus/);
  });
  test('a missing --storage-state file exits 2', async () => {
    const r = await cli(['x.com', '--storage-state', 'no-such-file.json']);
    assert.equal(r.code, 2);
    assert.match(r.stderr, /Storage state file not found/);
  });
  test('--min above --max exits 2', async () => {
    const r = await cli(['x.com', '--min', '2000']);
    assert.equal(r.code, 2);
  });
});

// ---------- end to end ----------

describe('end to end', { concurrency: true }, () => {
  let server, base, basic, loads = 0, evolving = 0;

  before(async () => {
    server = http.createServer((req, res) => {
      const send = (code, body, type = 'text/html') => { res.writeHead(code, { 'content-type': type }); res.end(body); };
      const sitemap = (locs, tag) => `<?xml version="1.0"?><${tag}>${locs.map((l) => `<${tag === 'urlset' ? 'url' : 'sitemap'}><loc>${base}${l}</loc></${tag === 'urlset' ? 'url' : 'sitemap'}>`).join('')}</${tag}>`;
      switch (req.url) {
        case '/': return send(200, read('fixture.html'));
        case '/about': return send(200, read('fixture-about.html'));
        case '/small-range': return send(200, read('fixture-small-range.html'));
        case '/js-layout': return send(200, read('fixture-js.html'));
        case '/blind': return send(200, read('fixture-blind.html'));
        // the first load overflows; later loads "fix" it by hiding the image on narrow screens
        case '/evolving': return send(200, `<!doctype html><style>img { display: block; width: 700px; height: 20px }${++evolving > 1 ? ' @media (max-width: 719px) { img { display: none } }' : ''}</style><img src="data:image/gif;base64,R0lGODlhAQABAAAAACw="><p>Menu</p>`);
        // every other load adds a banner, like an A/B test
        case '/varies': return send(200, `<!doctype html><body style="margin:0">${++loads % 2 ? '' : '<div style="padding:20px">Spring sale</div>'}<p style="display:flex;gap:8px"><b>One</b><b>Two</b></p>`);
        case '/login': return send(200, '<!doctype html><title>Log in</title><h1>Log in</h1>');
        case '/private':
          if (/(^|;\s*)session=ok(;|$)/.test(req.headers.cookie || '')) return send(200, read('fixture-about.html'));
          res.writeHead(302, { location: '/login' }); return res.end();
        case '/sitemap.xml': return send(200, sitemap(['/', '/about', '/missing', '/private'], 'urlset'), 'application/xml');
        case '/sitemap-index.xml': return send(200, sitemap(['/sitemap.xml'], 'sitemapindex'), 'application/xml');
        default: return send(404, 'not found');
      }
    });
    await new Promise((r) => server.listen(0, '127.0.0.1', r));
    base = `http://127.0.0.1:${server.address().port}`;
    fs.rmSync(OUT, { recursive: true, force: true });
    // shared by the "basic" and "baseline" tests
    basic = cli([base + '/', '--problem-shots', '--out', path.join(OUT, 'basic')]);
  });
  after(() => server.close());

  test('finds every planted bug on the fixture, with screenshots and grouping', async () => {
    const r = await basic;
    assert.equal(r.code, 0, r.stderr);
    const page = fp('basic').pages[0];
    const p = page.runs[0].problems;

    assert.equal(find(p, 'page-overflow', 'div.card').length, 1, 'hero/pricing horizontal scroll');
    assert.equal(find(p, 'overlap', 'div.stats').length, 1, 'stats overlap');
    assert.equal(find(p, 'text-clipped', 'button.cta').length, 2, 'clipped CTA, two separate ranges');
    const book = find(p, 'link-wrapped', 'a.book');
    assert.equal(book.length, 1, 'wrapped "Book now"');
    assert.equal(book[0].detail, '"Book now" wraps onto 2 lines');
    assert.equal(book[0].to, 320);
    assert.equal(find(p, 'tiny-text', 'footer').length, 1, 'tiny footer text');
    assert.equal(find(p, 'tiny-text', 'div.tags').length, 3, 'three tiny tags (raw, before grouping)');
    assert.equal(find(p, 'container-overflow', 'div.row').length, 0, 'menu only breaks under --stress');
    assert.equal(p.length, 9);

    const changes = page.runs[0].changes;
    for (const at of [1024, 768]) assert.equal(changes.find((c) => c.at === at)?.category, 'breakpoint', `media query at ${at}px`);

    const report = html('basic');
    assert.match(text(report), /span in div\.tags ×3/);
    assert.equal((report.match(/<details class="shot">/g) || []).length, 7, 'one screenshot per grouped problem');
    assert.match(r.stdout, /7 problems \(9 elements\)/);
    // each problem is printed with its range, element and detail, then a re-check hint and what the sweep can't see
    assert.match(r.stdout, /845→320px\s+Wrapped link\s+a\.book: "Book now" wraps onto 2 lines/);
    assert.match(r.stdout, /Tiny text\s+span in div\.tags ×3: font-size 11px/);
    assert.match(r.stdout, /not checked: fixed and sticky elements over content/);
    // the CSS behind a problem, with its line in the page's <style> block
    assert.match(r.stdout, /Tiny text\s+p in footer: font-size 9px \(min 12px\)\n\s+css: footer p \{ font-size: clamp\(9px, 1\.2vw, 14px\) \} \(\/:57\)/);
  });

  test('flags layouts that only hold for a few px, such as a media-query off-by-one', async () => {
    const r = await cli([base + '/small-range', '--max', '900', '--min', '600', '--no-screenshots', '--out', path.join(OUT, 'small-range')]);
    assert.equal(r.code, 0, r.stderr);
    const p = fp('small-range').pages[0].runs[0].problems.filter((x) => x.kind === 'small-range');
    const grid = find(p, 'small-range', 'div.grid');
    assert.deepEqual(grid.map((x) => [x.from, x.to, x.detail]), [[768, 768, '"2+1" layout holds for only 1px']]);
    const promo = find(p, 'small-range', 'div.promo');
    assert.deepEqual(promo.map((x) => [x.from, x.to, x.detail]), [[702, 700, 'visible for only 3px']]);
    assert.equal(p.length, 2, 'the tiles reflow over wide ranges, so they are not flagged');
    const call = fp('small-range').pages[0].runs[0].problems.filter((x) => x.kind === 'hidden-range');
    assert.deepEqual(call.map((x) => [x.labels[0], x.from, x.to]), [['div.call', 849, 751]]);
    assert.match(r.stdout, /Hidden in a range\s+div\.call: shown on both sides/);
    assert.match(r.stdout, /css: \.call \{ display: none \} in @media \(min-width: 751px\) and \(max-width: 849px\) \(small-range:\d+\)/);
    assert.match(text(html('small-range')), /Small-range layout/);
  });

  test('waits for resize listeners and ResizeObservers before it measures', async () => {
    const r = await cli([base + '/js-layout', '--max', '1000', '--min', '600', '--no-screenshots', '--out', path.join(OUT, 'js-layout')]);
    assert.equal(r.code, 0, r.stderr);
    // .panel is 60% of (width - 40px body padding): 500.4px at 874px, 499.8px at 873px. `at` is the last width before the change
    const at = fp('js-layout').pages[0].runs[0].changes.map((c) => c.at);
    assert.deepEqual(at, [874, 700]);
  });

  test('finds text running out of its box, stretched images and badges over text, not the look-alikes', async () => {
    const r = await cli([base + '/blind', '--min', '600', '--max', '900', '--short', '--no-screenshots', '--out', path.join(OUT, 'blind')]);
    assert.equal(r.code, 0, r.stderr);
    const p = fp('blind').pages[0].runs[0].problems;
    assert.deepEqual(find(p, 'text-overflow', 'p.contact').map((x) => x.detail), ['"reservations@averyveryverylongdomainnam…" runs 163px outside p.contact']);
    assert.deepEqual(p.filter((x) => x.kind === 'image-distorted').map((x) => x.labels[0]), ['img.stretch'], 'object-fit: cover and SVG keep their shape');
    assert.deepEqual(p.filter((x) => x.kind === 'covered-text').map((x) => x.labels.join(' ↔ ')), ['span.price ↔ h3 in div.card', 'span.price ↔ h3 in div.card'],
      'the transparent stretched link and the background image cover nothing');
    assert.equal(p.length, 4);
    // two badges over two titles print as one line; the second title is only covered once the cards shrink (643px)
    assert.match(r.stdout, /900→600px\*\s+Covered text\s+span\.price ↔ h3 in div\.card ×2: covers part of "[^"]+" \(and 1 more like it\)\n\s+css: \.price \{ position: absolute; top: 12px; right: 12px \}/);
    assert.match(r.stdout, /\* several separate ranges in this span/);
  });

  test('a second run into the same folder says what the last edit changed; --short leaves out the layout changes', async () => {
    const args = [base + '/evolving', '--workers', '1', '--short', '--min', '600', '--max', '900', '--no-screenshots', '--out', path.join(OUT, 'evolving')];
    const first = await cli(args);
    assert.equal(first.code, 0, first.stderr);
    assert.doesNotMatch(first.stdout, /since last run/);
    assert.doesNotMatch(first.stdout, /height 900px|\d+px {2}(problem|fluid|breakpoint)/, '--short prints no layout change lines');
    assert.match(first.stdout, /Horizontal scroll\s+img/);
    const second = await cli(args);
    assert.match(second.stdout, /since last run: 1 problem fixed, 0 new/);
    assert.match(second.stdout, /now hidden: img hides below 720px/);
    const other = await cli([base + '/blind', ...args.slice(1)]);
    assert.doesNotMatch(other.stdout, /since last run/, 'a folder reused for another page is not a last run');
  });

  test('--workers 1 gives the same result as sweeping several pages at once', async () => {
    const one = await cli([base + '/', '--workers', '1', '--no-screenshots', '--out', path.join(OUT, 'workers-1')]);
    const many = await cli([base + '/', '--workers', '4', '--no-screenshots', '--out', path.join(OUT, 'workers-4')]);
    assert.equal(one.code, 0, one.stderr);
    assert.equal(many.code, 0, many.stderr);
    assert.doesNotMatch(one.stdout, /pages at a time/);
    assert.match(many.stdout, /4 pages at a time/);
    const runOf = (name) => fp(name).pages[0].runs[0];
    assert.deepEqual(runOf('workers-4').changes, runOf('workers-1').changes);
    assert.deepEqual(runOf('workers-4').problems, runOf('workers-1').problems);
  });

  test('a page that renders differently between loads is swept again on one page', async () => {
    const r = await cli([base + '/varies', '--workers', '2', '--no-screenshots', '--out', path.join(OUT, 'varies')]);
    assert.equal(r.code, 0, r.stderr);
    assert.match(r.stdout, /renders differently between loads, so it was swept again on one page/);
    // one load throughout: the banner never appears or disappears as a layout change
    assert.equal(fp('varies').pages[0].runs[0].changes.filter((c) => c.hidden.length || c.shown.length).length, 0);
  });

  test('--stress doubles repeated text and finds the menu that only holds with short names', async () => {
    const r = await cli([base + '/', '--stress', '--max', '1100', '--no-screenshots', '--out', path.join(OUT, 'stress')]);
    assert.equal(r.code, 0, r.stderr);
    assert.match(r.stdout, /stress: doubled \d+ text runs in repeated items/);
    const f = fp('stress');
    assert.equal(f.options.stress, true);
    assert.ok(find(f.pages[0].runs[0].problems, 'container-overflow', 'div.row').length > 0, 'menu row overflow');
    assert.match(html('stress'), /stress mode/);
  });

  test('a sitemap index expands to every page; shared, skipped and redirected pages are reported', async () => {
    const r = await cli([base + '/sitemap-index.xml', '--max', '1100', '--no-screenshots', '--out', path.join(OUT, 'sitemap')]);
    assert.equal(r.code, 0, r.stderr);
    assert.match(r.stdout, /starchy: 4 pages/);
    assert.match(r.stdout, /warning: redirected to .*\/login/);

    const f = fp('sitemap');
    assert.deepEqual(f.pages.map((p) => new URL(p.url).pathname), ['/', '/about', '/private']);
    assert.match(f.pages[2].redirectedTo, /\/login$/);
    assert.deepEqual(f.failed, [{ url: base + '/missing', error: 'HTTP 404' }]);

    const report = html('sitemap');
    const shared = text(report.split('<section class="shared">')[1].split('</section>')[0]);
    assert.match(shared, /a\.book "Book now" wraps onto 2 lines .*on 2 pages/);
    const lists = pageProblemLists(report);
    assert.match(lists[`127.0.0.1:${server.address().port}/`], /button\.cta/, 'page-only problem stays under its page');
    assert.doesNotMatch(lists[`127.0.0.1:${server.address().port}/`], /a\.book/, 'shared problem is not repeated under the page');
    assert.doesNotMatch(lists[`127.0.0.1:${server.address().port}/about`], /wraps onto/, 'shared problem is not repeated under the second page');
    assert.match(text(report), /Not checked .*\/missing HTTP 404/);
    assert.match(text(report), /Redirected to .*\/login/);
  });

  test('--storage-state sends the saved session, so a page behind a login is checked', async () => {
    const state = path.join(OUT, 'session.storage.json');
    fs.mkdirSync(OUT, { recursive: true });
    fs.writeFileSync(state, JSON.stringify({
      cookies: [{ name: 'session', value: 'ok', domain: '127.0.0.1', path: '/', expires: -1, httpOnly: false, secure: false, sameSite: 'Lax' }],
      origins: [],
    }));
    const r = await cli([base + '/private', '--storage-state', state, '--max', '1100', '--no-screenshots', '--out', path.join(OUT, 'private')]);
    assert.equal(r.code, 0, r.stderr);
    assert.doesNotMatch(r.stdout, /redirected/);
    const page = fp('private').pages[0];
    assert.equal(page.redirectedTo, null);
    assert.equal(find(page.runs[0].problems, 'link-wrapped', 'a.book').length, 1, 'checked the real page, not the login page');
  });

  test('a missing sitemap fails with a clear error', async () => {
    const r = await cli([base + '/no-sitemap.xml', '--out', path.join(OUT, 'no-sitemap')]);
    assert.equal(r.code, 1);
    assert.match(r.stderr, /Could not read sitemap .*HTTP 404/);
  });

  test('baseline: no false alarms on an unchanged page; a 0.1.x baseline still finds a new problem', async () => {
    await basic;
    const current = fp('basic');
    const same = path.join(OUT, 'baseline-same.json');
    fs.writeFileSync(same, JSON.stringify(current));
    // 0.1.x format (single page, top-level runs) with the "Book now" problem removed
    const old = path.join(OUT, 'baseline-old.json');
    const p0 = current.pages[0];
    fs.writeFileSync(old, JSON.stringify({ url: base, generated: current.generated, options: current.options,
      runs: p0.runs.map((r) => ({ ...r, problems: r.problems.filter((x) => !x.labels.includes('a.book')) })) }));

    const [a, b] = await Promise.all([
      cli([base + '/', '--baseline', same, '--fail-on', 'new', '--no-screenshots', '--out', path.join(OUT, 'baseline-same')]),
      cli([base + '/', '--baseline', old, '--fail-on', 'new', '--no-screenshots', '--out', path.join(OUT, 'baseline-old')]),
    ]);
    assert.equal(a.code, 0, 'unchanged page: nothing new');
    assert.match(text(html('baseline-same')), /New problems None Fixed problems None New layout changes None/);
    assert.equal(b.code, 1, '--fail-on new exits 1');
    const cmp = text(html('baseline-old').split('<section class="baseline">')[1].split('</section>')[0]);
    assert.match(cmp, /New problems Wrapped link a\.book \d+ → 320px Fixed problems None New layout changes None/);
  });
});
