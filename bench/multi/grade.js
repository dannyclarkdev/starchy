#!/usr/bin/env node
'use strict';

// Grade a copy of bench/multi/site: which planted bugs are fixed, and is the design kept?
// Usage: node bench/multi/grade.js <site-dir>   → prints JSON. Independent of starchy on purpose.

const path = require('path');
const { chromium } = require('playwright');

const ORIGINAL = path.join(__dirname, 'site');
const PAGES = ['index', 'menu', 'cakes', 'catering', 'about', 'visit'];
const ALL = PAGES.join(',');

// id → [pages it is checked on, what "fixed" means]
const BUGS = {
  M1: [ALL, 'header items fit and do not overlap'],
  M2: [ALL, '"Order online" is visible at every width'],
  M3: [ALL, 'footer columns stay on the screen'],
  M4: [ALL, 'footer legal text is 12px or larger'],
  M5: ['index', 'hero image fits the screen'],
  M6: ['index', 'hero button labels stay on one line'],
  M7: ['index', "Today's bakes grid has 2+ columns from 769px up (1022px off-by-one)"],
  M8: ['index,menu', 'price badges do not cover product titles'],
  M9: ['menu', 'loaf price table fits the page'],
  M10: ['menu', 'dietary tags stay inside their card'],
  M11: ['cakes', 'order form fields stay inside the form'],
  M12: ['cakes', 'cake request button label is not clipped'],
  M13: ['catering', 'catering packages fit the page'],
  M14: ['catering', '"Most popular" ribbon shows at every width from 700px up'],
  M15: ['about', 'team photos keep their shape'],
  M16: ['about', 'timeline entries do not overlap'],
  M17: ['visit', 'map fits the screen'],
  M18: ['visit', 'hours table stays inside its box'],
  M19: ['visit', 'email address stays inside its box'],
  // held out: outside what starchy checks (fixed elements, vertical clipping, elements hidden on purpose)
  M20: [ALL, 'page titles are not hidden under the header on phones (held out)'],
  M21: ['about', 'customer quotes are not cut off (held out)'],
  M22: ['cakes', 'cake request button shows on phones (held out)'],
};

/** Runs in the page: true for each bug (of `ids`) that is present at this width. */
function check({ w, ids }) {
  const q = (s) => document.querySelector(s), qa = (s) => [...document.querySelectorAll(s)];
  const r = (el) => el.getBoundingClientRect();
  const vw = document.documentElement.clientWidth;
  const shown = (el) => { if (!el) return false; const s = getComputedStyle(el), b = r(el); return s.display !== 'none' && s.visibility !== 'hidden' && b.width > 0 && b.height > 0; };
  const hit = (a, b) => a.left < b.right - 1 && b.left < a.right - 1 && a.top < b.bottom - 1 && b.top < a.bottom - 1;
  const textRects = (el) => { const g = document.createRange(); g.selectNodeContents(el); return [...g.getClientRects()].filter((x) => x.width > 0); };
  const contentRight = (el) => { const s = getComputedStyle(el); return r(el).right - parseFloat(s.paddingRight) - parseFloat(s.borderRightWidth); };
  const inside = (el, box) => !!el && !!box && r(el).right <= contentRight(box) + 1 && r(el).right <= vw + 1;
  const firstRow = (el) => (el && el.children.length ? [...el.children].filter((c) => Math.abs(r(c).top - r(el.children[0]).top) < 2).length : 0);
  const pairsOverlap = (els) => els.some((a, i) => els.slice(i + 1).some((b) => hit(r(a), r(b))));

  const checks = {
    M1: () => { const kids = [...(q('.site-header') || { children: [] }).children].filter(shown); return !kids.length || kids.some((c) => r(c).right > vw + 1 || r(c).left < -1) || pairsOverlap(kids); },
    M2: () => { const o = q('.order-btn'); return !shown(o) || r(o).right > vw + 1; },
    M3: () => { const f = q('.footer-cols'); return !f || [...f.children].some((c) => !inside(c, f)); },
    M4: () => { const l = q('.legal'); return !l || parseFloat(getComputedStyle(l).fontSize) < 12; },
    M5: () => { const i = q('.hero-img'); return !shown(i) || r(i).right > vw + 1; },
    M6: () => { const b = qa('.hero .btn'); return b.length < 2 || b.some((x) => new Set(textRects(x).map((t) => Math.round(t.top))).size > 1); },
    M7: () => w >= 769 && firstRow(q('.bakes')) < 2,
    M8: () => { const c = qa('.card'); return !c.length || c.some((x) => { const p = x.querySelector('.price'), h = x.querySelector('h3'); return !shown(p) || !h || textRects(h).some((t) => hit(t, r(p))); }); },
    M9: () => { const t = q('.price-list'); return !t || !inside(t, t.parentElement); },
    M10: () => { const t = qa('.tags'); return t.length < 4 || t.some((x) => [...x.children].some((s) => !inside(s, x.parentElement))); },
    M11: () => { const f = q('.order-form'); return !f || r(f).right > vw + 1 || [...f.children].some((c) => !inside(c, f)); },
    // measured while shown even where M22 hides it: the clipping comes back as soon as the button does
    M12: () => {
      const b = q('.order-form button');
      if (!b) return true;
      const hidden = []; for (let a = b; a; a = a.parentElement) if (getComputedStyle(a).display === 'none') { hidden.push([a, a.style.display]); a.style.display = 'block'; }
      const clipped = b.scrollWidth > b.clientWidth + 1;
      for (const [a, d] of hidden) a.style.display = d;
      return clipped;
    },
    M13: () => { const p = qa('.package'); return p.length < 3 || p.some((x) => !inside(x, q('main .page'))); },
    M14: () => w >= 700 && !shown(q('.ribbon')),
    M15: () => { const i = qa('.team img'); return i.length < 3 || i.some((x) => { const fit = getComputedStyle(x).objectFit; return !['cover', 'contain'].includes(fit) && Math.abs(r(x).width / r(x).height - 1) > 0.03; }); },
    M16: () => { const y = qa('.timeline .year'); return y.length < 3 || pairsOverlap(y); },
    M17: () => { const m = q('.map'); return !shown(m) || r(m).right > vw + 1; },
    M18: () => { const t = q('.hours table'); return !t || !inside(t, t.parentElement); },
    M19: () => { const e = q('.email'), box = e && e.closest('.box'); return !e || !box || textRects(e).some((t) => t.right > contentRight(box) + 1 || t.right > vw + 1); },
    M20: () => { const h = q('.site-header'), t = q('main h1'); return !h || !t || (['fixed', 'absolute'].includes(getComputedStyle(h).position) && r(h).bottom > r(t).top + 1); },
    M21: () => { const x = qa('.quote'); return x.length < 3 || x.some((b) => b.scrollHeight > b.clientHeight + 1); },
    M22: () => { const b = q('.order-form button'); return !shown(b) || r(b).right > vw + 1; },
  };
  return Object.fromEntries(ids.map((id) => [id, checks[id]()]));
}

/**
 * Runs in the page: generic problems, keyed by element, to find regressions (problems
 * the original page didn't have). Written separately from starchy on purpose.
 */
function generic(withHidden) {
  const vw = document.documentElement.clientWidth, out = [];
  const key = (el) => { const parts = []; for (let e = el; e && e !== document.body; e = e.parentElement) { let i = 1, x = e; while ((x = x.previousElementSibling)) if (x.tagName === e.tagName) i++; parts.unshift(e.tagName.toLowerCase() + ':' + i); } return parts.join('>'); };
  const clipped = (el) => { for (let a = el.parentElement; a && a !== document.documentElement; a = a.parentElement) if (getComputedStyle(a).overflowX !== 'visible') return true; return false; };
  for (const el of document.body.querySelectorAll('*')) {
    const s = getComputedStyle(el);
    if (s.display === 'none' || s.visibility !== 'visible' || ['SCRIPT', 'STYLE'].includes(el.tagName)) continue;
    const b = el.getBoundingClientRect();
    if (b.width < 1 || b.height < 1) continue;
    if (b.right > vw + 1 && !clipped(el)) out.push('off-screen|' + key(el));
    // page content only: a nav that collapses into a menu button at another width is a design choice
    if (withHidden && el.closest('main')) out.push('shown|' + key(el));
  }
  const tw = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let n; (n = tw.nextNode());) {
    if (!n.textContent.trim()) continue;
    let blk = n.parentElement;
    while (blk && blk !== document.body && getComputedStyle(blk).display === 'inline') blk = blk.parentElement;
    const s = getComputedStyle(blk);
    if (s.overflowX !== 'visible' || clipped(blk)) continue;
    const g = document.createRange(); g.selectNodeContents(n);
    const right = blk.getBoundingClientRect().right - parseFloat(s.paddingRight) - parseFloat(s.borderRightWidth);
    if ([...g.getClientRects()].some((x) => x.width > 0 && x.right > right + 1)) out.push('text-out|' + key(blk));
  }
  return out;
}

/** Runs in the page: facts about the intended design at this width. */
function design() {
  const q = (s) => document.querySelector(s), qa = (s) => [...document.querySelectorAll(s)];
  const shown = (el) => !!el && getComputedStyle(el).display !== 'none' && el.getBoundingClientRect().width > 0;
  const firstRow = (s) => { const el = q(s); if (!el || !el.children.length) return 0; const t = el.children[0].getBoundingClientRect().top; return [...el.children].filter((c) => Math.abs(c.getBoundingClientRect().top - t) < 2).length; };
  const copy = q('.hero-copy'), img = q('.hero-img');
  const body = document.body.cloneNode(true);
  body.querySelectorAll('script,style,noscript,template').forEach((e) => e.remove());
  return {
    navLinks: qa('.nav a').filter(shown).length, menuBtn: shown(q('.menu-btn')),
    footerCols: firstRow('.footer-cols'), bakes: firstRow('.bakes'), menuItems: firstRow('.menu-items'),
    packages: firstRow('.packages'), team: firstRow('.team'), timeline: firstRow('.timeline'), visit: firstRow('.visit-grid'),
    heroSideBySide: !!(copy && img) && img.getBoundingClientRect().left >= copy.getBoundingClientRect().right - 1,
    images: qa('img').filter(shown).length, cards: qa('.card').filter(shown).length,
    hiddenOverflow: ['html', 'body', 'main', '.page', '.site-header', '.site-footer', '.footer-cols']
      .flatMap((s) => qa(s)).some((el) => ['hidden', 'clip'].includes(getComputedStyle(el).overflowX)),
    text: body.textContent.replace(/\s+/g, ' ').trim(),
  };
}

const EXPECT = {
  all: (d) => ({
    'all 5 nav links show at 1400px': d[1400].navLinks === 5,
    'menu button hidden at 1400px, shown at 500px': !d[1400].menuBtn && d[500].menuBtn,
    'nav links hidden at 500px': d[500].navLinks === 0,
    'footer is 4 columns at 1400px': d[1400].footerCols === 4,
    'no overflow-x: hidden/clip on the page, header or footer': !d[1400].hiddenOverflow && !d[500].hiddenOverflow,
  }),
  index: (d) => ({
    'bakes grid is 3/2/1 columns at 1400/900/500px': d[1400].bakes === 3 && d[900].bakes === 2 && d[500].bakes === 1,
    'hero image beside the text at 1400px, below it at 500px': d[1400].heroSideBySide && !d[500].heroSideBySide,
    'all 6 product cards and the hero image show': d[1400].cards === 6 && d[500].cards === 6 && d[1400].images === 1,
  }),
  menu: (d) => ({ 'menu items are 2 columns at 1400px, 1 at 500px': d[1400].menuItems === 2 && d[500].menuItems === 1 }),
  catering: (d) => ({ 'packages are 3 in a row at 1400px, stacked at 500px': d[1400].packages === 3 && d[500].packages === 1 }),
  about: (d) => ({
    'team is 3 across at 1400px, stacked at 500px': d[1400].team === 3 && d[500].team === 1,
    'timeline is one row at 1400px': d[1400].timeline === 3,
    'all 3 team photos show': d[1400].images === 3,
  }),
  visit: (d) => ({ 'hours and contact side by side at 1400px, stacked at 500px': d[1400].visit === 2 && d[500].visit === 1 }),
  cakes: () => ({}),
};

async function grade(dir) {
  const browser = await chromium.launch();
  const out = { bugs: {}, design: {}, regressions: [] };
  const failing = Object.fromEntries(Object.keys(BUGS).map((k) => [k, {}]));
  try {
    for (const name of PAGES) {
      const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
      const facts = async (file) => {
        await page.goto('file://' + file);
        await page.evaluate(() => document.fonts.ready);
        const d = {};
        for (const w of [1400, 900, 500]) { await page.setViewportSize({ width: w, height: 900 }); d[w] = await page.evaluate(design); }
        return d;
      };
      const orig = await facts(path.join(ORIGINAL, name + '.html'));
      const d = await facts(path.resolve(dir, name + '.html'));
      for (const [k, ok] of Object.entries({ ...EXPECT.all(d), ...EXPECT[name](d), 'page text unchanged': d[1400].text === orig[1400].text })) {
        out.design[`${name}: ${k}`] = ok;
      }
      // regressions: generic problems in the result that the original never had, at any sampled width
      const sweepGeneric = async (file) => {
        await page.goto('file://' + file);
        const seen = new Set();
        for (let w = 1920; w >= 320; w -= 4) {
          await page.setViewportSize({ width: w, height: 900 });
          for (const k of await page.evaluate(generic, false)) seen.add(k);
        }
        // elements shown at a width in the original but hidden there in the result ("fixed" by hiding)
        for (const w of [1400, 1000, 800, 600, 400]) {
          await page.setViewportSize({ width: w, height: 900 });
          for (const k of await page.evaluate(generic, true)) if (k.startsWith('shown|')) seen.add(k + '@' + w);
        }
        return seen;
      };
      const before = await sweepGeneric(path.join(ORIGINAL, name + '.html'));
      const after = await sweepGeneric(path.resolve(dir, name + '.html'));
      for (const k of after) if (!k.startsWith('shown|') && !before.has(k)) out.regressions.push(`${name}: ${k}`);
      for (const k of before) if (k.startsWith('shown|') && !after.has(k)) out.regressions.push(`${name}: hidden ${k.slice(6)}`);

      await page.goto('file://' + path.resolve(dir, name + '.html'));
      const ids = Object.keys(BUGS).filter((k) => BUGS[k][0].split(',').includes(name));
      for (let w = 1920; w >= 320; w--) {
        await page.setViewportSize({ width: w, height: 900 });
        const res = await page.evaluate(check, { w, ids });
        for (const k of ids) if (res[k]) (failing[k][name] = failing[k][name] || []).push(w);
      }
      await page.close();
    }
  } finally {
    await browser.close();
  }
  for (const [k, [, name]] of Object.entries(BUGS)) {
    const where = Object.entries(failing[k]).map(([p, ws]) => `${p}: ${ranges(ws).join(', ')}`);
    out.bugs[k] = { name, fixed: where.length === 0, failing: where };
  }
  out.fixed = Object.values(out.bugs).filter((b) => b.fixed).length;
  out.total = Object.keys(BUGS).length;
  out.designKept = Object.values(out.design).every(Boolean);
  return out;
}

/** [1920,1919,…] → ["1919–1900", …] */
function ranges(ws) {
  const out = [];
  for (let i = 0; i < ws.length; i++) {
    let j = i;
    while (j + 1 < ws.length && ws[j + 1] === ws[j] - 1) j++;
    out.push(i === j ? String(ws[i]) : `${ws[i]}–${ws[j]}`);
    i = j;
  }
  return out;
}

if (require.main === module) {
  grade(process.argv[2] || ORIGINAL)
    .then((r) => console.log(JSON.stringify(r, null, 2)))
    .catch((e) => { console.error(e); process.exit(1); });
}
module.exports = { grade };
