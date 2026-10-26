'use strict';

/**
 * Compare a fresh sweep against an earlier fingerprint.json.
 * A change "matches" the baseline if one exists within ±4px touching the same
 * containers; a problem matches if the same issue key exists at any width.
 */
function compareBaseline(result, base) {
  const newChanges = [], goneChanges = [], newProblems = [], fixedProblems = [];
  const sig = (c) => [...c.regrouped.map((x) => x.path), ...c.hidden, ...c.shown].sort().join('|');
  const basePages = base.pages || [{ url: base.url, runs: base.runs }]; // 0.1.x baselines are single-page

  const norm = (u) => { try { return new URL(u).href; } catch (e) { return u; } }; // "x.com" === "x.com/"

  for (const page of result.pages) {
    // one page against one page matches even when the URL differs (e.g. staging vs. local)
    const bp = basePages.find((p) => norm(p.url) === norm(page.url))
      || (basePages.length === 1 && result.pages.length === 1 ? basePages[0] : null);
    if (!bp) continue;
    const url = page.url;
    for (const run of page.runs) {
      const b = (bp.runs || []).find((r) => r.height === run.height);
      if (!b) continue;
      const cur = run.transitions.map((t) => ({
        at: t.hi, category: t.diff.category,
        sig: sig({ regrouped: t.diff.regrouped, hidden: t.diff.hidden.map((x) => x.path), shown: t.diff.shown.map((x) => x.path) }),
      }));
      const old = b.changes.map((c) => ({ at: c.at, category: c.category, sig: sig(c) }));
      const match = (x, list) => list.some((y) => Math.abs(y.at - x.at) <= 4 && y.sig === x.sig);
      for (const x of cur) if (x.sig && !match(x, old)) newChanges.push({ url, height: run.height, ...x });
      for (const x of old) if (x.sig && !match(x, cur)) goneChanges.push({ url, height: run.height, ...x });

      const oldKeys = new Set(b.problems.map((p) => p.key));
      const curKeys = new Set(run.ranges.map((r) => r.issue.key));
      for (const r of run.ranges) if (!oldKeys.has(r.issue.key)) newProblems.push({ url, height: run.height, kind: r.issue.kind, labels: r.issue.labels, from: r.from, to: r.to });
      for (const p of b.problems) if (!curKeys.has(p.key)) fixedProblems.push({ url, height: run.height, ...p });
    }
  }
  return { baselineDate: base.generated, newChanges, goneChanges, newProblems, fixedProblems };
}

/**
 * What changed since the previous run into the same --out folder: the same
 * comparison as a baseline, plus elements that now hide somewhere they didn't
 * (a "fix" that only hides the problem). Null when the sweep options differ.
 */
function sinceLast(result, prev) {
  const keys = ['max', 'min', 'heights', 'stress', 'ignore', 'minFont'];
  if (!prev.options || keys.some((k) => JSON.stringify(prev.options[k]) !== JSON.stringify(result.options[k]))) return null;
  // a folder reused for other pages is not a "last run" of these pages
  const urls = (pages) => (pages || []).map((p) => { try { return new URL(p.url).href; } catch (e) { return p.url; } }).sort().join(' ');
  if (urls(prev.pages) !== urls(result.pages)) return null;
  const cmp = compareBaseline(result, prev);
  const wasHidden = new Set((prev.pages || []).flatMap((p) => p.runs.flatMap((r) => r.changes.flatMap((c) => c.hidden))));
  const nowHidden = new Set();
  for (const p of result.pages) for (const r of p.runs) for (const t of r.transitions) {
    for (const x of t.diff.hidden) if (!wasHidden.has(x.path)) nowHidden.add(`${x.label} hides below ${t.hi}px`);
  }
  return { ...cmp, nowHidden: [...nowHidden] };
}

module.exports = { compareBaseline, sinceLast };
