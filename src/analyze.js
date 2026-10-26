'use strict';

const crypto = require('crypto');

/** Hash of everything that counts as "the layout changed". */
function keyOf(fp) {
  const g = Object.keys(fp.groups).sort().map((k) => k + '=' + fp.groups[k]).join(';');
  const v = fp.visible.slice().sort().join(';');
  const i = fp.issues.map((x) => x.key).sort().join(';');
  return crypto.createHash('sha1').update(g + '\n' + v + '\n' + i).digest('hex');
}

/**
 * Turn media-query condition texts into the exact sweep boundary each one
 * should cause. A boundary is reported as `hi`: the layout differs between
 * width `hi` and `hi - 1`.
 */
function parseBreakpoints(texts) {
  const toPx = (n, unit) => (unit === 'px' ? n : n * 16);
  const found = new Map();
  const push = (hi, text) => { if (hi > 0 && !found.has(hi)) found.set(hi, text.trim()); };
  for (const t of texts) {
    let m;
    const re1 = /(min|max)-width\s*:\s*([\d.]+)\s*(px|em|rem)/gi;
    while ((m = re1.exec(t))) {
      const px = toPx(parseFloat(m[2]), m[3].toLowerCase());
      push(m[1].toLowerCase() === 'min' ? Math.ceil(px) : Math.floor(px) + 1, t);
    }
    const re2 = /\bwidth\s*(>=|<=|>|<)\s*([\d.]+)\s*(px|em|rem)/gi;
    while ((m = re2.exec(t))) {
      const px = toPx(parseFloat(m[2]), m[3].toLowerCase());
      push(m[1] === '>=' || m[1] === '<' ? Math.ceil(px) : Math.floor(px) + 1, t);
    }
    const re3 = /([\d.]+)\s*(px|em|rem)\s*(>=|<=|>|<)\s*width\b/gi;
    while ((m = re3.exec(t))) {
      const px = toPx(parseFloat(m[1]), m[2].toLowerCase());
      // "X < width" == "width > X", "X <= width" == "width >= X"
      push(m[3] === '<=' || m[3] === '>' ? Math.ceil(px) : Math.floor(px) + 1, t);
    }
  }
  return Array.from(found, ([hi, text]) => ({ hi, text })).sort((a, b) => b.hi - a.hi);
}

/** Paths in `list` that don't have an ancestor also in `list`. */
function roots(list) {
  const set = new Set(list);
  return list.filter((p) => {
    let i = p.lastIndexOf(' > ');
    while (i > 0) {
      const anc = p.slice(0, i);
      if (set.has(anc)) return false;
      i = anc.lastIndexOf(' > ');
    }
    return true;
  });
}

/** What changed between the state just above a boundary and just below it. */
function diffStates(a, b, breakpoints, hi) {
  const va = new Set(a.visible), vb = new Set(b.visible);

  const regrouped = [];
  for (const p of new Set([...Object.keys(a.groups), ...Object.keys(b.groups)])) {
    if (!(va.has(p) || p === 'body') || !(vb.has(p) || p === 'body')) continue;
    const from = a.groups[p] || '1', to = b.groups[p] || '1';
    if (from !== to) regrouped.push({ path: p, label: a.labels[p] || b.labels[p] || p, from, to });
  }
  const hidden = roots(a.visible.filter((p) => !vb.has(p))).map((p) => ({ path: p, label: a.labels[p] }));
  const shown = roots(b.visible.filter((p) => !va.has(p))).map((p) => ({ path: p, label: b.labels[p] }));

  const ia = new Map(a.issues.map((x) => [x.key, x])), ib = new Map(b.issues.map((x) => [x.key, x]));
  const newIssues = b.issues.filter((x) => !ia.has(x.key));
  const resolved = a.issues.filter((x) => !ib.has(x.key));

  const matched = breakpoints.filter((bp) => Math.abs(bp.hi - hi) <= 1);
  const layoutChanged = regrouped.length || hidden.length || shown.length;

  let category;
  if (newIssues.length) category = 'problem';
  else if (layoutChanged && matched.length) category = 'breakpoint';
  else if (layoutChanged) category = 'fluid';
  else category = 'fixed';

  return { category, matched, regrouped, hidden, shown, newIssues, resolved };
}

/** Width ranges over which each issue is present. */
function issueRanges(first, transitions, min, last) {
  const open = new Map();
  const done = [];
  for (const x of first.issues) open.set(x.key, { issue: x, from: first.width });
  for (const t of transitions) {
    for (const x of t.diff.resolved) {
      const o = open.get(x.key);
      if (o) {
        const atEnd = (t.issuesBefore || []).find((y) => y.key === x.key);
        done.push({ ...o, issue: atEnd || o.issue, to: t.hi });
        open.delete(x.key);
      }
    }
    for (const x of t.diff.newIssues) if (!open.has(x.key)) open.set(x.key, { issue: x, from: t.lo });
  }
  for (const o of open.values()) {
    const atEnd = last && last.issues.find((y) => y.key === o.issue.key);
    done.push({ ...o, issue: atEnd || o.issue, to: min });
  }
  const rank = { 'page-overflow': 0, overlap: 1, 'container-overflow': 2, 'text-clipped': 3, 'link-wrapped': 4, 'tiny-text': 5 };
  return done.sort((a, b) => rank[a.issue.kind] - rank[b.issue.kind] || b.from - a.from);
}

/** Merge problems that differ only by which repeated element they hit, e.g. 7 identical tiny labels. */
function groupRanges(ranges) {
  const groups = new Map();
  for (const r of ranges) {
    const k = [r.issue.kind, r.issue.labels.join('|'), r.issue.detail, r.from, r.to].join('#');
    const g = groups.get(k);
    if (g) { g.count++; g.keys.push(r.issue.key); g.paths.push(...r.issue.paths); }
    else groups.set(k, { kind: r.issue.kind, labels: r.issue.labels, detail: r.issue.detail, from: r.from, to: r.to, count: 1, keys: [r.issue.key], paths: [...r.issue.paths] });
  }
  // the range is part of the id: one element can have the same problem over two separate ranges
  for (const g of groups.values()) g.id = `${g.kind}|${g.from}-${g.to}|${g.keys.slice().sort().join(',')}`;
  return [...groups.values()];
}

/** Every distinct problem group across pages, with the pages it was seen on (shared header, footer…). */
function uniqueProblems(pages) {
  const seen = new Map();
  for (const p of pages) {
    for (const r of p.runs) {
      for (const g of r.problems) {
        const k = r.height + '#' + g.id;
        if (!seen.has(k)) seen.set(k, { ...g, height: r.height, urls: [] });
        seen.get(k).urls.push(p.url);
      }
    }
  }
  return [...seen.values()];
}

const describeSig = (s) => {
  const parts = s.split('+').map(Number);
  const rows = parts.length, max = Math.max(...parts);
  if (rows === 1) return `${max} side by side`;
  if (max === 1) return `${rows} stacked`;
  return `${rows} rows, up to ${max} across`;
};

module.exports = { keyOf, parseBreakpoints, diffStates, issueRanges, groupRanges, uniqueProblems, describeSig, roots };
