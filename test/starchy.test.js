'use strict';

// Run with `npm test`. Unit tests need no browser; end-to-end tests run the real CLI
// (Playwright + Chromium) against a local server that serves the fixtures.

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const http = require('http');
const path = require('path');
const { execFile } = require('child_process');
const { parseBreakpoints, groupRanges, uniqueProblems } = require('../src/analyze');
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
  let server, base, basic;

  before(async () => {
    server = http.createServer((req, res) => {
      const send = (code, body, type = 'text/html') => { res.writeHead(code, { 'content-type': type }); res.end(body); };
      const sitemap = (locs, tag) => `<?xml version="1.0"?><${tag}>${locs.map((l) => `<${tag === 'urlset' ? 'url' : 'sitemap'}><loc>${base}${l}</loc></${tag === 'urlset' ? 'url' : 'sitemap'}>`).join('')}</${tag}>`;
      switch (req.url) {
        case '/': return send(200, read('fixture.html'));
        case '/about': return send(200, read('fixture-about.html'));
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
