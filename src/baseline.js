'use strict';

/**
 * Compare a fresh sweep against an earlier fingerprint.json.
 * A change "matches" the baseline if one exists within ±4px touching the same
 * containers; a problem matches if the same issue key exists at any width.
 */
function compareBaseline(result, base) {
  const newChanges = [], goneChanges = [], newProblems = [], fixedProblems = [];
  const sig = (c) => [...c.regrouped.map((x) => x.path), ...c.hidden, ...c.shown].sort().join('|');

  for (const run of result.runs) {
    const b = (base.runs || []).find((r) => r.height === run.height);
    if (!b) continue;
    const cur = run.transitions.map((t) => ({
      at: t.hi, category: t.diff.category,
      sig: sig({ regrouped: t.diff.regrouped, hidden: t.diff.hidden.map((x) => x.path), shown: t.diff.shown.map((x) => x.path) }),
    }));
    const old = b.changes.map((c) => ({ at: c.at, category: c.category, sig: sig(c) }));
    const match = (x, list) => list.some((y) => Math.abs(y.at - x.at) <= 4 && y.sig === x.sig);
    for (const x of cur) if (x.sig && !match(x, old)) newChanges.push({ height: run.height, ...x });
    for (const x of old) if (x.sig && !match(x, cur)) goneChanges.push({ height: run.height, ...x });

    const oldKeys = new Set(b.problems.map((p) => p.key));
    const curKeys = new Set(run.ranges.map((r) => r.issue.key));
    for (const r of run.ranges) if (!oldKeys.has(r.issue.key)) newProblems.push({ height: run.height, kind: r.issue.kind, labels: r.issue.labels, from: r.from, to: r.to });
    for (const p of b.problems) if (!curKeys.has(p.key)) fixedProblems.push({ height: run.height, ...p });
  }
  return { baselineDate: base.generated, newChanges, goneChanges, newProblems, fixedProblems };
}

module.exports = { compareBaseline };
