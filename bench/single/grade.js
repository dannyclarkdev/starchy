#!/usr/bin/env node
'use strict';

// Grade a copy of bench/site: which planted bugs are fixed, and is the design kept?
// Usage: node bench/grade.js <site-dir>   → prints JSON. Independent of starchy on purpose.

const path = require('path');
const { chromium } = require('playwright');

const ORIGINAL = path.join(__dirname, 'site', 'index.html');

const BUGS = {
  B1: 'hero image fits the screen',
  B2: 'header items fit and do not overlap',
  B3: 'product grid has 2+ columns from 769px up (1024px off-by-one)',
  B4: 'price badge does not cover the product title',
  B5: 'newsletter button label is not clipped',
  B6: 'hero button labels stay on one line',
  B7: 'footer text is 12px or larger',
  B8: 'hours table stays inside its card',
  B9: '"Order online" is visible at every width',
  B10: 'product tags stay inside the card',
};

/** Runs in the page: true for each bug that is present at this width. */
function check(w) {
  const q = (s) => document.querySelector(s), qa = (s) => [...document.querySelectorAll(s)];
  const r = (el) => el.getBoundingClientRect();
  const vw = document.documentElement.clientWidth;
  const shown = (el) => { const s = getComputedStyle(el), b = r(el); return s.display !== 'none' && s.visibility !== 'hidden' && b.width > 0 && b.height > 0; };
  const hit = (a, b) => a.left < b.right - 1 && b.left < a.right - 1 && a.top < b.bottom - 1 && b.top < a.bottom - 1;
  const textRects = (el) => { const g = document.createRange(); g.selectNodeContents(el); return [...g.getClientRects()].filter((x) => x.width > 0); };
  const contentRight = (el) => { const s = getComputedStyle(el); return r(el).right - parseFloat(s.paddingRight) - parseFloat(s.borderRightWidth); };
  const missing = (...els) => els.some((e) => !e);

  const img = q('.hero-img'), header = q('.site-header'), grid = q('.grid'), legal = q('.legal');
  const button = q('.newsletter button'), table = q('.hours table'), order = q('.order-btn');
  const kids = header ? [...header.children].filter(shown) : [];
  const firstRow = grid ? [...grid.children].filter((c) => Math.abs(r(c).top - r(grid.children[0]).top) < 2) : [];

  return {
    B1: missing(img) || !shown(img) || r(img).right > vw + 1,
    B2: missing(header) || kids.some((c) => r(c).right > vw + 1 || r(c).left < -1) || kids.some((a, i) => kids.slice(i + 1).some((b) => hit(r(a), r(b)))),
    B3: missing(grid) || (w >= 769 && firstRow.length < 2),
    B4: qa('.card').length < 6 || qa('.card').some((c) => {
      const p = c.querySelector('.price'), h = c.querySelector('h3');
      return missing(p, h) || !shown(p) || textRects(h).some((x) => hit(x, r(p)));
    }),
    B5: missing(button) || button.scrollWidth > button.clientWidth + 1,
    B6: qa('.hero-actions .btn').length < 2 || qa('.hero-actions .btn').some((b) => new Set(textRects(b).map((x) => Math.round(x.top))).size > 1),
    B7: missing(legal) || parseFloat(getComputedStyle(legal).fontSize) < 12,
    B8: missing(table) || r(table).right > contentRight(table.parentElement) + 1,
    B9: missing(order) || !shown(order) || r(order).right > vw + 1,
    B10: qa('.tags').length < 6 || qa('.tags').some((t) => [...t.children].some((s) => r(s).right > contentRight(t.parentElement) + 1)),
  };
}

/** Runs in the page: facts about the intended design at this width. */
function design() {
  const q = (s) => document.querySelector(s), qa = (s) => [...document.querySelectorAll(s)];
  const shown = (el) => !!el && getComputedStyle(el).display !== 'none' && el.getBoundingClientRect().width > 0;
  const grid = q('.grid'), copy = q('.hero-copy'), img = q('.hero-img');
  const top0 = grid && grid.children[0] ? grid.children[0].getBoundingClientRect().top : 0;
  return {
    cols: grid ? [...grid.children].filter((c) => Math.abs(c.getBoundingClientRect().top - top0) < 2).length : 0,
    navLinks: qa('.nav a').filter(shown).length,
    menuBtn: shown(q('.menu-btn')),
    heroSideBySide: !!(copy && img) && img.getBoundingClientRect().left >= copy.getBoundingClientRect().right - 1,
    cards: qa('.card').filter(shown).length,
    overflowX: [getComputedStyle(document.documentElement).overflowX, getComputedStyle(document.body).overflowX],
    // scripts and styles aren't page text: an agent that wires up the menu button with a <script> changed no copy
    text: (() => { const c = document.body.cloneNode(true); c.querySelectorAll('script,style,noscript,template').forEach((e) => e.remove()); return c.textContent.replace(/\s+/g, ' ').trim(); })(),
  };
}

async function grade(dir) {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1920, height: 900 } });
  const out = { bugs: {}, design: {} };
  try {
    await page.goto('file://' + ORIGINAL);
    const originalText = (await page.evaluate(design)).text;

    await page.goto('file://' + path.resolve(dir, 'index.html'));
    await page.evaluate(() => document.fonts.ready);
    const failing = Object.fromEntries(Object.keys(BUGS).map((k) => [k, []]));
    for (let w = 1920; w >= 320; w--) {
      await page.setViewportSize({ width: w, height: 900 });
      const res = await page.evaluate(check, w);
      for (const k in res) if (res[k]) failing[k].push(w);
    }
    for (const [k, name] of Object.entries(BUGS)) {
      out.bugs[k] = { name, fixed: failing[k].length === 0, failingWidths: ranges(failing[k]) };
    }

    const at = async (w) => { await page.setViewportSize({ width: w, height: 900 }); return page.evaluate(design); };
    const [d1400, d900, d500] = [await at(1400), await at(900), await at(500)];
    const expect = {
      'grid is 3 columns at 1400px': d1400.cols === 3,
      'grid is 2 columns at 900px': d900.cols === 2,
      'grid is 1 column at 500px': d500.cols === 1,
      'all 5 nav links show at 1400px': d1400.navLinks === 5,
      'menu button hidden at 1400px': !d1400.menuBtn,
      'menu button shows at 500px': d500.menuBtn,
      'nav links hidden at 500px': d500.navLinks === 0,
      'hero image beside the text at 1400px': d1400.heroSideBySide,
      'hero image below the text at 500px': !d500.heroSideBySide,
      'all 6 product cards show': d1400.cards === 6 && d500.cards === 6,
      'no overflow-x: hidden/clip on html or body': d1400.overflowX.every((v) => v !== 'hidden' && v !== 'clip'),
      'page text unchanged': d1400.text === originalText,
    };
    for (const [k, ok] of Object.entries(expect)) out.design[k] = ok;
  } finally {
    await browser.close();
  }
  out.fixed = Object.values(out.bugs).filter((b) => b.fixed).length;
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
  grade(process.argv[2] || path.join(__dirname, 'site'))
    .then((r) => console.log(JSON.stringify(r, null, 2)))
    .catch((e) => { console.error(e); process.exit(1); });
}
module.exports = { grade };
