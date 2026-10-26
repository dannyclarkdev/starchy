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
 *             content escaping its container, clipped text, tiny text).
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

module.exports = { fingerprint, mediaConditions };
