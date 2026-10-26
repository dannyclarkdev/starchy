'use strict';

/**
 * Runs INSIDE the page (via page.evaluate). Must be self-contained.
 *
 * Returns a structural fingerprint of the current layout:
 *  - groups:  for every container with 2+ in-flow children, its row signature,
 *             e.g. "3+3+1" = three rows holding 3, 3 and 1 items.
 *  - visible: paths of every rendered layout unit (block-level boxes + replaced
 *             elements like img/svg/button). Inline text runs are deliberately
 *             ignored, because text reflows at nearly every pixel.
 *  - issues:  things that are almost always bugs (page overflow, overlap,
 *             content escaping its container, clipped or overflowing text,
 *             tiny text, wrapped links, stretched images, covered or cut-off text,
 *             hidden submit buttons).
 */
function fingerprint(opts) {
  const SKIP = new Set(['SCRIPT', 'STYLE', 'LINK', 'META', 'HEAD', 'TITLE', 'NOSCRIPT',
    'TEMPLATE', 'BR', 'WBR', 'SOURCE', 'TRACK']);
  const REPLACED = new Set(['IMG', 'SVG', 'VIDEO', 'CANVAS', 'IFRAME', 'INPUT', 'BUTTON',
    'SELECT', 'TEXTAREA', 'OBJECT', 'EMBED', 'METER', 'PROGRESS']);

  let ignored = [];
  if (opts.ignore && opts.ignore.length) {
    try { ignored = Array.from(document.querySelectorAll(opts.ignore.join(','))); } catch (e) { /* bad selector */ }
  }
  const vw = document.documentElement.clientWidth;

  // ---- stable element paths (usable as CSS selectors) ----
  const pathCache = new Map();
  const getPath = (el) => {
    if (pathCache.has(el)) return pathCache.get(el);
    let p;
    if (el === document.body) p = 'body';
    else {
      const tag = el.tagName.toLowerCase();
      let seg;
      if (el.id && /^[A-Za-z][\w-]*$/.test(el.id)) seg = `${tag}#${el.id}`;
      else {
        let i = 1, s = el;
        while ((s = s.previousElementSibling)) if (s.tagName === el.tagName) i++;
        seg = `${tag}:nth-of-type(${i})`;
      }
      p = getPath(el.parentElement) + ' > ' + seg;
    }
    pathCache.set(el, p);
    return p;
  };
  const label = (el) => {
    if (el === document.body) return 'body';
    let s = el.tagName.toLowerCase();
    if (el.id) s += '#' + el.id;
    const cls = (typeof el.className === 'string' ? el.className : '').trim().split(/\s+/).filter(Boolean).slice(0, 2);
    if (cls.length) s += '.' + cls.join('.');
    else if (!el.id && el.parentElement && el.parentElement !== document.body) {
      const pe = el.parentElement, pc = (typeof pe.className === 'string' ? pe.className : '').trim().split(/\s+/).filter(Boolean)[0];
      s += ' in ' + pe.tagName.toLowerCase() + (pe.id ? '#' + pe.id : pc ? '.' + pc : '');
    }
    return s;
  };
  const hasDirectText = (el) => {
    for (const n of el.childNodes) if (n.nodeType === 3 && n.textContent.trim()) return true;
    return false;
  };

  // ---- collect layout units ----
  const units = new Map();
  for (const el of document.body.querySelectorAll('*')) {
    const TAG = el.tagName.toUpperCase();
    if (SKIP.has(TAG)) continue;
    if (el.ownerSVGElement) continue; // inside an <svg>
    if (ignored.length && ignored.some((ig) => ig.contains(el))) continue;
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.display === 'contents') continue;
    if (cs.visibility === 'hidden' || cs.visibility === 'collapse') continue;
    if (cs.display === 'inline' && !REPLACED.has(TAG)) continue;
    const r = el.getBoundingClientRect();
    if (r.width <= 1 || r.height <= 1) continue; // empty or sr-only
    units.set(el, {
      el, cs, r, path: getPath(el), label: label(el),
      inFlow: cs.position !== 'absolute' && cs.position !== 'fixed',
    });
  }

  // nearest ancestor that is itself a unit
  const children = new Map();
  for (const u of units.values()) {
    let p = u.el.parentElement;
    while (p && p !== document.body && !units.has(p)) p = p.parentElement;
    u.parent = p && units.has(p) ? units.get(p) : null;
    const key = u.parent ? u.parent.path : 'body';
    if (!children.has(key)) children.set(key, []);
    children.get(key).push(u);
  }

  // ---- row/column signature per container ----
  const groups = {};
  for (const [pkey, kids] of children) {
    const flow = kids.filter((k) => k.inFlow);
    if (flow.length < 2) continue;
    const sorted = flow.slice().sort((a, b) => a.r.top - b.r.top || a.r.left - b.r.left);
    const rows = [];
    let cur = null;
    for (const k of sorted) {
      if (cur && k.r.top < cur.bottom - 1) { cur.n++; cur.bottom = Math.max(cur.bottom, k.r.bottom); }
      else { cur = { n: 1, bottom: k.r.bottom }; rows.push(cur); }
    }
    groups[pkey] = rows.map((r) => r.n).join('+');
  }

  // ---- issue detection ----
  const issues = [];
  const add = (kind, us, detail) => issues.push({
    kind, paths: us.map((u) => u.path), labels: us.map((u) => u.label), detail,
    key: kind + '|' + us.map((u) => u.path).join('|'),
  });
  const clippedByAncestor = (el) => {
    for (let a = el.parentElement; a && a !== document.documentElement; a = a.parentElement) {
      if (getComputedStyle(a).overflowX !== 'visible') return true;
    }
    return false;
  };

  // 1. page overflows horizontally -> blame the deepest element(s) poking out,
  //    i.e. the ones actually forcing the width, not the wrapper they stretch.
  const pageOverflow = new Set();
  if (document.documentElement.scrollWidth > vw + 1) {
    // "passive" = only this wide because it fills its parent's content box
    const passive = (u) => {
      const p = u.parent;
      if (!p || !u.inFlow || u.cs.float !== 'none') return false;
      const inner = p.r.width - parseFloat(p.cs.paddingLeft) - parseFloat(p.cs.paddingRight)
        - parseFloat(p.cs.borderLeftWidth) - parseFloat(p.cs.borderRightWidth);
      const own = u.r.width + parseFloat(u.cs.marginLeft) + parseFloat(u.cs.marginRight);
      return Math.abs(own - inner) <= 1;
    };
    const out = Array.from(units.values()).filter((u) => u.r.right > vw + 1 && !clippedByAncestor(u.el));
    out.forEach((u) => pageOverflow.add(u.path));
    const active = out.filter((u) => !passive(u));
    // Ask the page directly: does removing this element shrink the scroll width?
    // That separates real causes from elements merely carried along by a
    // stretched parent. Deepest candidates first, capped for big pages.
    const depth = (u) => u.path.split(' > ').length;
    const baseSW = document.documentElement.scrollWidth;
    const deepFirst = (a, b) => depth(b) - depth(a);
    const tested = [...active.slice().sort(deepFirst), ...out.filter((u) => passive(u)).sort(deepFirst)].slice(0, 60);
    const shrinks = tested.filter((u) => {
      const prev = u.el.getAttribute('style');
      u.el.style.setProperty('display', 'none', 'important');
      const sw = document.documentElement.scrollWidth;
      if (prev === null) u.el.removeAttribute('style'); else u.el.setAttribute('style', prev);
      return sw < baseSW - 1;
    });
    // the cause is the deepest element whose removal helps; if none helps on its
    // own (two equally wide offenders), fall back to the deepest active elements
    const pool = shrinks.length ? shrinks : active;
    const causes = pool.filter((u) => !pool.some((v) => v !== u && v.path.startsWith(u.path + ' > ')));
    const byParent = new Map();
    for (const u of causes) {
      const k = u.parent ? u.parent.path : 'body';
      if (!byParent.has(k)) byParent.set(k, []);
      byParent.get(k).push(u);
    }
    for (const [pk, us] of byParent) {
      const worst = Math.round(Math.max(...us.map((u) => u.r.right)) - vw);
      const names = [...new Set(us.map((u) => u.label))];
      issues.push({
        kind: 'page-overflow', paths: us.map((u) => u.path),
        labels: names.length === 1 && us.length > 1 ? [`${names[0]} ×${us.length}`] : names,
        detail: `pushes the page ${worst}px wider than the screen`,
        key: 'page-overflow|' + pk + '|' + names.join(','),
      });
    }
  }

  for (const u of units.values()) {
    // 2. content escaping its container
    const p = u.parent;
    if (p && u.inFlow && p.cs.overflowX === 'visible' && !pageOverflow.has(u.path)) {
      const over = u.r.right - p.r.right;
      if (over > 1) add('container-overflow', [u, p], `extends ${Math.round(over)}px outside ${p.label}`);
    }
    // 3. text cut off by overflow:hidden
    if ((u.cs.overflowX === 'hidden' || u.cs.overflowX === 'clip') && hasDirectText(u.el) &&
        u.el.scrollWidth > u.el.clientWidth + 1) {
      const ell = u.cs.textOverflow === 'ellipsis';
      add('text-clipped', [u], ell ? 'text truncated with an ellipsis' : `${u.el.scrollWidth - u.el.clientWidth}px of text hidden`);
    }
    // 4. text below the minimum readable size
    if (hasDirectText(u.el)) {
      const fs = parseFloat(u.cs.fontSize);
      if (fs < opts.minFont) add('tiny-text', [u], `font-size ${+fs.toFixed(2)}px (min ${opts.minFont}px)`);
    }
  }

  // 5. in-flow siblings overlapping each other
  for (const kids of children.values()) {
    const flow = kids.filter((k) => (k.cs.position === 'static' || k.cs.position === 'relative') && k.cs.transform === 'none');
    if (flow.length < 2 || flow.length > 120) continue;
    for (let i = 0; i < flow.length; i++) {
      for (let j = i + 1; j < flow.length; j++) {
        const a = flow[i].r, b = flow[j].r;
        const ix = Math.min(a.right, b.right) - Math.max(a.left, b.left);
        const iy = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
        if (ix > 2 && iy > 2 && ix * iy > 16) {
          add('overlap', [flow[i], flow[j]], `overlap ${Math.round(ix)}×${Math.round(iy)}px`);
        }
      }
    }
  }

  // 6. short link/button labels broken onto 2+ lines. Skips links in running text and
  //    headings, and only counts wrapping inside one text node, so <br>/block lines pass.
  for (const el of document.body.querySelectorAll('a[href], button, [role="button"]')) {
    if (ignored.length && ignored.some((ig) => ig.contains(el))) continue;
    const text = el.textContent.trim().replace(/\s+/g, ' ');
    if (!text || text.split(' ').length > 5 || el.closest('h1, h2, h3, h4, h5, h6')) continue;
    const cs = getComputedStyle(el);
    if (cs.visibility !== 'visible' || el.getClientRects().length === 0) continue;
    if (cs.display === 'inline' && el.parentElement && el.parentElement.textContent.trim().replace(/\s+/g, ' ') !== text) continue;
    let lines = 0;
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    for (let n; (n = walker.nextNode());) {
      if (!n.textContent.trim()) continue;
      const range = document.createRange();
      range.selectNodeContents(n);
      const tops = Array.from(range.getClientRects(), (r) => (r.width > 0 ? r.top : null)).filter((t) => t !== null).sort((a, b) => a - b);
      const half = parseFloat(getComputedStyle(n.parentElement).fontSize) / 2;
      lines = Math.max(lines, tops.filter((t, i) => i === 0 || t - tops[i - 1] > half).length);
    }
    if (lines > 1) add('link-wrapped', [{ path: getPath(el), label: label(el) }], `"${text}" wraps onto ${lines} lines`);
  }

  // text runs, each with the layout unit that lays it out (inline elements aren't units)
  const runs = [];
  const tw = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let n; (n = tw.nextNode());) {
    if (!n.textContent.trim() || (ignored.length && ignored.some((ig) => ig.contains(n)))) continue;
    let a = n.parentElement;
    while (a && a !== document.body && !units.has(a)) a = a.parentElement;
    if (!a || !units.has(a)) continue;
    const range = document.createRange();
    range.selectNodeContents(n);
    const rects = Array.from(range.getClientRects()).filter((r) => r.width > 0 && r.height > 0);
    if (rects.length) runs.push({ n, u: units.get(a), rects });
  }
  const snippet = (n) => { const t = n.textContent.trim().replace(/\s+/g, ' '); return t.length > 40 ? t.slice(0, 39) + '…' : t; };

  // 7. text running out of its box (a long word, URL or email, or nowrap text). Inline text
  //    isn't a unit, so the overflow checks above can't see it, even when it widens the page.
  const textOver = new Set();
  for (const t of runs) {
    const u = t.u;
    if (textOver.has(u.path) || u.cs.overflowX !== 'visible' || clippedByAncestor(u.el)) continue;
    const inner = u.r.right - parseFloat(u.cs.paddingRight) - parseFloat(u.cs.borderRightWidth);
    const over = Math.max(...t.rects.map((r) => r.right)) - inner;
    if (over > 1) {
      textOver.add(u.path);
      const word = t.n.textContent.trim().split(/\s+/).reduce((a, b) => (b.length > a.length ? b : a), '');
      add('text-overflow', [u], `"${word.length > 40 ? word.slice(0, 39) + '…' : word}" runs ${Math.round(over)}px outside ${u.label}`);
    }
  }

  // 8. raster images drawn at a different shape than they are. SVG keeps its own aspect
  //    ratio inside an <img>, and object-fit cover/contain/none never stretch.
  for (const u of units.values()) {
    const img = u.el;
    if (img.tagName !== 'IMG' || !img.complete || !img.naturalWidth || !img.naturalHeight) continue;
    if (/\.svg([?#]|$)|^data:image\/svg/i.test(img.currentSrc || img.src) || !['fill', 'scale-down'].includes(u.cs.objectFit)) continue;
    const w = img.clientWidth - parseFloat(u.cs.paddingLeft) - parseFloat(u.cs.paddingRight);
    const h = img.clientHeight - parseFloat(u.cs.paddingTop) - parseFloat(u.cs.paddingBottom);
    if (w < 8 || h < 8) continue;
    if (Math.abs((w / h) / (img.naturalWidth / img.naturalHeight) - 1) > 0.03) {
      add('image-distorted', [u], `drawn at ${Math.round(w)}×${Math.round(h)}px, the image is ${img.naturalWidth}×${img.naturalHeight}`);
    }
  }

  // 9. an absolutely positioned box (badge, ribbon, label) drawn over another element's text.
  //    Media is left out (usually a background under the text), and so are boxes that draw
  //    nothing (a transparent link stretched over a card).
  const MEDIA = new Set(['IMG', 'SVG', 'VIDEO', 'CANVAS', 'IFRAME', 'OBJECT', 'EMBED', 'PICTURE']);
  const draws = (u) => u.el.textContent.trim() || !/^(transparent|rgba\(.*,\s*0\))$/.test(u.cs.backgroundColor) ||
    u.cs.backgroundImage !== 'none' || parseFloat(u.cs.borderTopWidth) > 0;
  const covers = Array.from(units.values()).filter((u) => u.cs.position === 'absolute' && !MEDIA.has(u.el.tagName.toUpperCase()) &&
    parseFloat(u.cs.opacity) > 0.1 && draws(u));
  for (const c of covers) {
    const seen = new Set();
    for (const t of runs) {
      // its own text, or text of a box it sits inside of, is a design choice
      if (seen.has(t.u.path) || c.el.contains(t.n) || t.u.el.contains(c.el)) continue;
      const hitText = t.rects.some((r) => {
        const ix = Math.min(r.right, c.r.right) - Math.max(r.left, c.r.left), iy = Math.min(r.bottom, c.r.bottom) - Math.max(r.top, c.r.top);
        return ix > 2 && iy > 2 && ix * iy > 16;
      });
      if (hitText) { seen.add(t.u.path); add('covered-text', [c, t.u], `covers part of "${snippet(t.n)}"`); }
    }
  }

  // 10. a bar fixed to the top of the screen over text at scroll 0: nothing scrolls that text
  //     into view. Bars at the bottom (cookie notices, chat) only hide what scrolling reveals,
  //     and a full-screen overlay is a dialog or an open menu.
  const vh = document.documentElement.clientHeight;
  for (const c of units.values()) {
    if (c.cs.position !== 'fixed' || c.r.top > 1 || c.r.height > vh / 2 || parseFloat(c.cs.opacity) <= 0.1 || !draws(c)) continue;
    const seen = new Set();
    for (const t of runs) {
      if (seen.has(t.u.path) || c.el.contains(t.n)) continue;
      const hitText = t.rects.some((r) => Math.min(r.bottom, c.r.bottom) - Math.max(r.top, c.r.top) > 2 && Math.min(r.right, c.r.right) - Math.max(r.left, c.r.left) > 2);
      if (hitText) { seen.add(t.u.path); add('covered-text', [c, t.u], `covers part of "${snippet(t.n)}" at the top of the page, where scrolling can't reveal it`); }
    }
  }

  // 11. text cut off at the bottom of a box with a fixed height and overflow: hidden. Only text
  //     counts (a cropped photo is a choice), and line-clamp truncates on purpose.
  for (const u of units.values()) {
    if (!['hidden', 'clip'].includes(u.cs.overflowY) || (u.cs.webkitLineClamp && u.cs.webkitLineClamp !== 'none')) continue;
    const bottom = u.r.bottom - parseFloat(u.cs.borderBottomWidth);
    const cut = runs.filter((t) => u.el.contains(t.n) && t.rects.some((r) => r.bottom > bottom + 1));
    if (cut.length) {
      const px = Math.round(Math.max(...cut.flatMap((t) => t.rects.map((r) => r.bottom))) - bottom);
      add('text-cut', [u], `text runs ${px}px past the bottom of ${u.label} and is cut off`);
    }
  }

  // 12. a visible form whose submit controls are all hidden at this width
  for (const f of units.values()) {
    if (f.el.tagName !== 'FORM') continue;
    const submits = Array.from(f.el.querySelectorAll('button:not([type]), button[type="submit"], input[type="submit"], input[type="image"]'));
    if (!submits.length || submits.some((b) => b.getClientRects().length && getComputedStyle(b).visibility === 'visible')) continue;
    // name the element whose own display: none hides the button
    let h = submits[0];
    for (let a = h; a && a !== f.el; a = a.parentElement) if (getComputedStyle(a).display === 'none') h = a;
    add('hidden-submit', [{ path: getPath(h), label: label(h) }, f], `${f.label} has no visible submit button at this width`);
  }

  const labels = {};
  for (const u of units.values()) labels[u.path] = u.label;
  labels.body = 'body';

  return {
    viewportWidth: vw,
    docWidth: document.documentElement.scrollWidth,
    groups,
    visible: Array.from(units.values(), (u) => u.path),
    labels,
    issues,
  };
}

/**
 * Runs inside the page: double the text of repeated items (3+ siblings that share
 * tag and class) to mimic long real-world content. Button and nav labels stay as they are.
 */
function stressText() {
  const texts = new Set();
  for (const el of document.body.querySelectorAll('*')) {
    if (el.children.length < 3) continue;
    const sig = (k) => k.tagName + '.' + (k.getAttribute('class') || '');
    const counts = new Map();
    for (const k of el.children) counts.set(sig(k), (counts.get(sig(k)) || 0) + 1);
    for (const k of el.children) {
      if (counts.get(sig(k)) < 3) continue;
      const walker = document.createTreeWalker(k, NodeFilter.SHOW_TEXT);
      for (let t; (t = walker.nextNode());) texts.add(t);
    }
  }
  let n = 0;
  for (const t of texts) {
    const s = t.textContent.trim();
    if (!/\p{L}/u.test(s)) continue;
    if (t.parentElement.closest('button, [role="button"], nav, script, style, template, noscript, svg')) continue;
    t.textContent = t.textContent + ' ' + s;
    n++;
  }
  return n;
}

/** Runs inside the page: list media-query condition texts it can read. */
function mediaConditions() {
  const out = [], blocked = [];
  const walk = (rules) => {
    for (const r of rules) {
      if (typeof CSSMediaRule !== 'undefined' && r instanceof CSSMediaRule) out.push(r.conditionText || r.media.mediaText);
      if (r.cssRules) { try { walk(r.cssRules); } catch (e) { /* ignore */ } }
    }
  };
  for (const s of document.styleSheets) {
    try {
      if (s.media && s.media.mediaText) out.push(s.media.mediaText);
      walk(s.cssRules);
    } catch (e) {
      if (s.href) blocked.push(s.href); // cross-origin sheet; fetched from Node instead
    }
  }
  return { out, blocked };
}

module.exports = { fingerprint, stressText, mediaConditions };
