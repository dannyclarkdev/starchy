'use strict';

const { describeSig, uniqueProblems } = require('./analyze');

const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const KIND = {
  'page-overflow': 'Horizontal scroll',
  overlap: 'Overlap',
  'container-overflow': 'Escapes container',
  'text-clipped': 'Clipped text',
  'link-wrapped': 'Wrapped link',
  'tiny-text': 'Tiny text',
};
const CAT = {
  problem: { name: 'Problem', cls: 'c-problem' },
  fluid: { name: 'Fluid change', cls: 'c-fluid' },
  breakpoint: { name: 'Media query', cls: 'c-bp' },
  fixed: { name: 'Resolved', cls: 'c-fixed' },
};

const capList = (items, n = 8) => {
  if (items.length <= n) return items.join('');
  return items.slice(0, n).join('') + `<li class="more">and ${items.length - n} more</li>`;
};
const code = (s) => `<code>${esc(s)}</code>`;

function ruler(run, opts, breakpoints) {
  const { max, min } = opts;
  const pos = (w) => ((max - w) / (max - min)) * 100;
  const bands = run.ranges
    .filter((r) => r.issue.kind !== 'tiny-text')
    .map((r) => `<span class="band" style="left:${pos(r.from)}%;width:${Math.max(0.4, pos(r.to) - pos(r.from))}%"></span>`).join('');
  const marks = run.transitions.map((t) =>
    `<a class="mark ${CAT[t.diff.category].cls}" href="#${run.id}-w${t.hi}" style="left:${pos(t.hi)}%" title="${t.hi}px · ${CAT[t.diff.category].name}"></a>`).join('');
  const ticks = breakpoints.filter((b) => b.hi <= max && b.hi >= min)
    .map((b) => `<span class="tick" style="left:${pos(b.hi)}%" title="${esc(b.text)}"></span>`).join('');
  const scale = [max, Math.round(max - (max - min) / 3), Math.round(max - (2 * (max - min)) / 3), min]
    .map((w, i) => `<span style="left:${[0, 33.33, 66.66, 100][i]}%">${w}</span>`).join('');
  return `<div class="ruler" role="img" aria-label="Layout changes from ${max}px to ${min}px">
    <div class="track">${bands}${marks}</div><div class="ticks">${ticks}</div><div class="scale">${scale}</div></div>`;
}

function problemList(groups, empty = 'No problems detected at any width.') {
  if (!groups.length) return `<p class="ok">${empty}</p>`;
  const rows = groups.map((g) => `<li>
      <span class="kind k-${g.kind}">${KIND[g.kind]}</span>
      <span class="who">${g.labels.map(code).join(' ↔ ')}${g.count > 1 ? ` <b class="times">×${g.count}</b>` : ''}</span>
      <span class="detail">${esc(g.detail)}${g.from !== g.to ? ` <span class="at">at ${g.to}px</span>` : ''}${g.urls ? ` · on ${g.urls.length} pages` : ''}</span>
      <span class="range">${g.from === g.to ? g.from + 'px' : `${g.from} → ${g.to}px`}</span>
      ${g.shot ? `<details class="shot"><summary>Screenshot at ${g.from}px</summary><img loading="lazy" src="data:image/jpeg;base64,${g.shot.data}" alt="${esc(KIND[g.kind])} at ${g.from}px"></details>` : ''}
    </li>`);
  return `<ul class="problems">${capList(rows, 30)}</ul>`;
}

function changeCard(run, t) {
  const d = t.diff, c = CAT[d.category];
  const items = [
    ...d.newIssues.map((x) => `<li class="bad"><b>${KIND[x.kind]}:</b> ${x.labels.map(code).join(' ↔ ')} — ${esc(x.detail)}</li>`),
    ...d.regrouped.map((x) => `<li>${code(x.label)} ${esc(describeSig(x.from))} → <b>${esc(describeSig(x.to))}</b></li>`),
    ...d.hidden.map((x) => `<li>${code(x.label)} hidden</li>`),
    ...d.shown.map((x) => `<li>${code(x.label)} appears</li>`),
    ...d.resolved.map((x) => `<li class="good">Resolved: ${KIND[x.kind]} on ${x.labels.map(code).join(' ↔ ')}</li>`),
  ];
  const why = d.matched.length
    ? `<p class="why">Matches ${d.matched.map((m) => code('@media ' + m.text)).join(', ')}</p>`
    : (d.category === 'fluid' ? '<p class="why">No media query here — caused by wrapping, auto-fit, or content size. Confirm it\'s intended.</p>' : '');
  const shots = t.before && t.after ? `<div class="shots">
      <figure><img loading="lazy" src="data:image/jpeg;base64,${t.before.data}" alt="Layout at ${t.hi}px"><figcaption>${t.hi}px</figcaption></figure>
      <figure><img loading="lazy" src="data:image/jpeg;base64,${t.after.data}" alt="Layout at ${t.lo}px"><figcaption>${t.lo}px</figcaption></figure>
    </div>` : '';
  return `<article class="change" id="${run.id}-w${t.hi}">
    <header><span class="w">${t.hi}<small>→${t.lo}px</small></span><span class="cat ${c.cls}">${c.name}</span></header>
    ${why}<ul class="what">${capList(items)}</ul>${shots}</article>`;
}

/**
 * Collapse consecutive fluid changes to the same container(s) into one entry,
 * e.g. a nav that rewraps 7 times is one thing to review, not seven.
 */
function groupTransitions(transitions) {
  const items = [];
  const sigOf = (t) => (t.diff.category === 'fluid' && !t.diff.hidden.length && !t.diff.shown.length
    ? t.diff.regrouped.map((x) => x.path).sort().join('|') : null);
  for (const t of transitions) {
    const s = sigOf(t), last = items[items.length - 1];
    if (s && last && last.sig === s) last.series.push(t);
    else items.push({ sig: s, series: [t] });
  }
  return items;
}

function seriesCard(run, item) {
  const s = item.series, first = s[0], last = s[s.length - 1];
  const steps = s.map((t) => t.diff.regrouped.map((x) => `<li><span class="sw">${t.hi}px</span> ${code(x.label)} <b>${esc(x.to)}</b> <span class="muted">(${esc(describeSig(x.to))})</span></li>`).join(''));
  const who = first.diff.regrouped.map((x) => code(x.label)).join(', ');
  const shots = first.before && last.after ? `<div class="shots">
      <figure><img loading="lazy" src="data:image/jpeg;base64,${first.before.data}" alt="Layout at ${first.hi}px"><figcaption>${first.hi}px</figcaption></figure>
      <figure><img loading="lazy" src="data:image/jpeg;base64,${last.after.data}" alt="Layout at ${last.lo}px"><figcaption>${last.lo}px</figcaption></figure>
    </div>` : '';
  return `<article class="change" id="${run.id}-w${first.hi}">
    <header><span class="w">${first.hi}<small>→${last.lo}px</small></span><span class="cat c-fluid">Fluid change ×${s.length}</span></header>
    <p class="why">${who} rewraps ${s.length} times with no media query, starting as ${esc(first.diff.regrouped[0].from)} (${esc(describeSig(first.diff.regrouped[0].from))}). Uneven rows like 5+1 usually mean it needs a breakpoint or a grid.</p>
    <ul class="what steps">${steps.join('')}</ul>${shots}</article>`;
}

function baselineBlock(cmp, multi) {
  if (!cmp) return '';
  const on = (x) => (multi ? ` <span class="muted">${esc(pageName(x.url))}</span>` : '');
  const li = (arr, fmt) => arr.length ? `<ul>${arr.map(fmt).join('')}</ul>` : '<p class="muted">None</p>';
  return `<section class="baseline"><h2>Compared with baseline <small>${esc(cmp.baselineDate)}</small></h2>
    <div class="cols">
      <div><h3>New problems</h3>${li(cmp.newProblems, (p) => `<li><span class="kind k-${p.kind}">${KIND[p.kind]}</span> ${p.labels.map(code).join(' ↔ ')} <span class="range">${p.from} → ${p.to}px</span>${on(p)}</li>`)}</div>
      <div><h3>Fixed problems</h3>${li(cmp.fixedProblems, (p) => `<li>${KIND[p.kind]} ${p.labels.map(code).join(' ↔ ')}${on(p)}</li>`)}</div>
      <div><h3>New layout changes</h3>${li(cmp.newChanges, (c) => `<li>${c.at}px · ${CAT[c.category].name}${on(c)}</li>`)}</div>
      <div><h3>Changes no longer happening</h3>${li(cmp.goneChanges, (c) => `<li>${c.at}px · ${CAT[c.category].name}${on(c)}</li>`)}</div>
    </div></section>`;
}

function pageName(url) {
  try { const u = new URL(url); return u.protocol === 'file:' ? u.pathname.split('/').pop() : u.host + u.pathname; } catch (e) { return url; }
}

function renderReport(result, comparison) {
  const o = result.options;
  const multi = result.pages.length + result.failed.length > 1;
  const allRuns = result.pages.flatMap((p) => p.runs);
  const all = allRuns.flatMap((r) => r.transitions);
  const grouped = new Map(allRuns.map((r) => [r, groupTransitions(r.transitions)]));
  const count = (cat) => [...grouped.values()].flat().filter((g) => g.series[0].diff.category === cat).length;
  const unique = uniqueProblems(result.pages);
  const shared = unique.filter((g) => g.urls.length > 1);
  const sharedIds = new Set(shared.map((g) => g.height + '#' + g.id));
  const host = multi ? `${result.pages.length} pages` : pageName((result.pages[0] || result.failed[0]).url);

  const pages = result.pages.map((page, pi) => `
    <section class="page">
      ${multi ? `<h2 class="page-h">${esc(pageName(page.url))}</h2>` : ''}
      <p class="sub">Breakpoints read from the CSS: ${page.breakpoints.map((b) => b.hi + 'px').join(', ') || 'none'}</p>
      ${page.redirectedTo ? `<p class="warn">Redirected to ${code(page.redirectedTo)}. If that is a login page, the session in <code>--storage-state</code> is missing or expired.</p>` : ''}
      ${page.runs.map((run) => {
        run.id = `p${pi}-h${run.height}`;
        return `
      <section class="run">
        ${page.runs.length > 1 ? `<h2>Height ${run.height}px</h2>` : ''}
        ${ruler(run, o, page.breakpoints)}
        <div class="legend"><span class="c-problem">Problem</span><span class="c-fluid">Fluid change</span><span class="c-bp">Media query</span><span class="c-fixed">Resolved</span><span class="lg-band">Problem range</span><span class="lg-tick">Your breakpoints</span></div>
        <h3>Problems by width range</h3>
        ${problemList(run.problems.filter((g) => !sharedIds.has(run.height + '#' + g.id)), shared.length ? 'No problems found only on this page.' : undefined)}
        <h3>Every layout change, widest first</h3>
        ${run.transitions.length ? grouped.get(run).map((g) => (g.series.length > 1 ? seriesCard(run, g) : changeCard(run, g.series[0]))).join('') : '<p class="ok">Layout never changes in this range.</p>'}
      </section>`;
      }).join('')}
    </section>`).join('');
  const sharedBlock = shared.length ? `<section class="shared"><h2>On more than one page</h2>
    <p class="sub">Usually a shared header or footer. Listed once here, not under each page.</p>
    ${problemList(o.heights.length > 1 ? shared.map((g) => ({ ...g, detail: `${g.detail} · ${g.height}px tall` })) : shared)}</section>` : '';
  const failedBlock = result.failed.length ? `<section class="failed"><h2>Not checked</h2><ul class="problems">${result.failed.map((f) =>
    `<li><span class="kind">Skipped</span><span class="who">${code(f.url)}</span><span class="detail">${esc(f.error)}</span></li>`).join('')}</ul></section>` : '';

  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Starchy Report</title>
<style>
:root{--bg:#f7f7f5;--card:#fff;--ink:#1b1b1a;--muted:#6b6a66;--line:#e4e3df;--code:#f0efeb;
--red:#d93a3f;--amber:#c98a06;--green:#2f8f5b;--gray:#8a8984;--accent:#3b5bdb}
@media (prefers-color-scheme:dark){:root:not([data-theme=light]){--bg:#141413;--card:#1d1d1b;--ink:#ecebe7;--muted:#9b9a95;--line:#2e2e2b;--code:#262624;--red:#f0656a;--amber:#e3a826;--green:#53b582;--gray:#77766f;--accent:#7c95f0}}
:root[data-theme=dark]{--bg:#141413;--card:#1d1d1b;--ink:#ecebe7;--muted:#9b9a95;--line:#2e2e2b;--code:#262624;--red:#f0656a;--amber:#e3a826;--green:#53b582;--gray:#77766f;--accent:#7c95f0}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--ink);font:15px/1.5 ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif}
main{max-width:1080px;margin:0 auto;padding:28px 16px 64px}
h1{font-size:26px;letter-spacing:-.02em;margin:0 0 4px}h1 .tag{font-size:13px;font-weight:500;letter-spacing:0;color:var(--muted);margin-left:6px}footer a{color:inherit}
h2{font-size:19px;margin:36px 0 12px}h2 small{color:var(--muted);font-weight:400;font-size:13px}
h3{font-size:12px;text-transform:uppercase;letter-spacing:.08em;color:var(--muted);margin:28px 0 10px}
.sub{color:var(--muted);margin:0 0 18px;word-break:break-all}
code{font:12.5px/1.4 ui-monospace,SFMono-Regular,Menlo,monospace;background:var(--code);padding:1px 5px;border-radius:4px;word-break:break-all}
.stats{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin:18px 0 8px}
.stat{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:12px 14px}
.stat b{display:block;font-size:26px;line-height:1.1;font-variant-numeric:tabular-nums}
.stat span{color:var(--muted);font-size:12.5px}
.stat.s-problem b{color:var(--red)}.stat.s-fluid b{color:var(--amber)}.stat.s-bp b{color:var(--green)}
.ruler{margin:22px 0 6px}
.track{position:relative;height:34px;background:var(--card);border:1px solid var(--line);border-radius:8px;overflow:hidden}
.band{position:absolute;top:0;bottom:0;background:color-mix(in srgb,var(--red) 16%,transparent)}
.mark{position:absolute;top:5px;bottom:5px;width:4px;margin-left:-2px;border-radius:2px}
.ticks{position:relative;height:9px}.tick{position:absolute;top:2px;width:2px;height:7px;margin-left:-1px;background:var(--accent)}
.scale{position:relative;height:18px;font-size:11px;color:var(--muted);font-variant-numeric:tabular-nums}
.scale span{position:absolute;transform:translateX(-50%)}.scale span:first-child{transform:none}.scale span:last-child{transform:translateX(-100%)}
.legend{display:flex;flex-wrap:wrap;gap:6px 14px;font-size:12px;color:var(--muted);margin-top:6px}
.legend span::before{content:"";display:inline-block;width:9px;height:9px;border-radius:2px;margin-right:5px;vertical-align:-1px}
.mark.c-problem,.legend .c-problem::before{background:var(--red)}
.mark.c-fluid,.legend .c-fluid::before{background:var(--amber)}
.mark.c-bp,.legend .c-bp::before{background:var(--green)}
.mark.c-fixed,.legend .c-fixed::before{background:var(--gray)}
.legend .lg-band::before{background:color-mix(in srgb,var(--red) 25%,transparent)}
.legend .lg-tick::before{background:var(--accent);width:3px}
.problems{list-style:none;padding:0;margin:0;background:var(--card);border:1px solid var(--line);border-radius:10px}
.problems li{display:grid;grid-template-columns:auto 1fr auto;gap:4px 12px;padding:10px 14px;border-top:1px solid var(--line);align-items:baseline}
.problems li:first-child{border-top:0}
.problems .detail{grid-column:2;color:var(--muted);font-size:13px}
.problems .range{grid-column:3;grid-row:1;font-variant-numeric:tabular-nums;font-size:13px;white-space:nowrap}
.problems .more{display:block;color:var(--muted)}.times{font-size:13px;color:var(--muted)}
.problems .shot{grid-column:1/-1;font-size:13px;color:var(--muted)}.shot summary{cursor:pointer}.shot img{display:block;max-width:100%;margin-top:8px;border:1px solid var(--line);border-radius:6px;background:#fff}
.warn{background:color-mix(in srgb,var(--amber) 14%,transparent);border-radius:8px;padding:8px 12px;font-size:13px}
.page-h{font-size:22px;margin-top:48px;padding-top:16px;border-top:1px solid var(--line);word-break:break-all}.problems .kind{justify-self:start}.at{opacity:.75}
.kind{font-size:11.5px;font-weight:600;padding:2px 8px;border-radius:99px;white-space:nowrap;color:var(--red);background:color-mix(in srgb,var(--red) 12%,transparent)}
.k-text-clipped,.k-link-wrapped,.k-tiny-text{color:var(--amber);background:color-mix(in srgb,var(--amber) 14%,transparent)}
.ok{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:12px 14px;color:var(--green);margin:0}
.change{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:14px 16px;margin:0 0 12px;scroll-margin-top:12px}
.change header{display:flex;align-items:center;justify-content:space-between;gap:10px}
.w{font-size:20px;font-weight:650;font-variant-numeric:tabular-nums;letter-spacing:-.01em}
.w small{font-size:12px;font-weight:400;color:var(--muted);margin-left:4px}
.cat{font-size:12px;font-weight:600;padding:3px 10px;border-radius:99px}
.cat.c-problem{color:var(--red);background:color-mix(in srgb,var(--red) 13%,transparent)}
.cat.c-fluid{color:var(--amber);background:color-mix(in srgb,var(--amber) 15%,transparent)}
.cat.c-bp{color:var(--green);background:color-mix(in srgb,var(--green) 14%,transparent)}
.cat.c-fixed{color:var(--muted);background:var(--code)}
.why{margin:6px 0 0;font-size:13px;color:var(--muted)}
.what{margin:10px 0 0;padding-left:18px}.what li{margin:3px 0}
.steps{list-style:none;padding:0}.steps li{display:flex;flex-wrap:wrap;gap:6px;align-items:baseline}.sw{font-variant-numeric:tabular-nums;color:var(--muted);min-width:52px;font-size:13px}
.what .bad{color:var(--red)}.what .bad code{color:var(--ink)}.what .good{color:var(--green)}.what .more{list-style:none;color:var(--muted)}
.shots{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:14px;align-items:start}
figure{margin:0}figure img{display:block;width:100%;height:auto;max-height:420px;object-fit:contain;object-position:top left;border:1px solid var(--line);border-radius:6px;background:#fff}
figcaption{font-size:12px;color:var(--muted);margin-top:4px;font-variant-numeric:tabular-nums}
.baseline .cols{display:grid;grid-template-columns:1fr 1fr;gap:12px}
.baseline .cols>div{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:2px 14px 10px}
.baseline ul{padding-left:18px;margin:0}.muted{color:var(--muted);margin:0}
footer{margin-top:40px;color:var(--muted);font-size:12.5px}
@media (max-width:640px){.stats{grid-template-columns:repeat(2,1fr)}.shots,.baseline .cols{grid-template-columns:1fr}
.problems li{grid-template-columns:1fr auto}.problems .who,.problems .detail{grid-column:1/-1}.problems .range{grid-column:2;grid-row:1}}
</style></head><body><main>
<h1>Starchy <span class="tag">layout report</span></h1>
<p class="sub">${esc(host)} · ${o.max}→${o.min}px${o.heights.length > 1 ? ' · heights ' + o.heights.join(', ') + 'px' : ' · ' + o.heights[0] + 'px tall'}${o.stress ? ' · stress mode (repeated text doubled)' : ''} · ${new Date(result.generated).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })}</p>
<div class="stats">
  <div class="stat s-problem"><b>${unique.length}</b><span>problems</span></div>
  <div class="stat s-fluid"><b>${count('fluid')}</b><span>fluid changes to review</span></div>
  <div class="stat s-bp"><b>${count('breakpoint')}</b><span>media-query changes</span></div>
  <div class="stat"><b>${all.length}</b><span>layout changes total</span></div>
</div>
${baselineBlock(comparison, multi)}
${failedBlock}
${sharedBlock}
${pages}
<footer><a href="https://starchy.dev">starchy</a> · swept in ${result.seconds}s · ${allRuns.reduce((n, r) => n + r.evals, 0)} widths fingerprinted</footer>
</main></body></html>`;
}

module.exports = { renderReport };
