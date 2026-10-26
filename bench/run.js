#!/usr/bin/env node
'use strict';

// Benchmark: an agent fixing a planted-bug site with starchy vs. without it.
// Usage: node bench/run.js [--bench single|multi] [--results <dir name>]
//                          [--models sonnet,opus] [--arms starchy,control] [--trials 3]
//                          [--concurrency 2] [--budget 5] [--timeout-min 30] [--only <run-id>,...]
//                          [--starchy-tgz <npm pack file>]   (starchy arm uses this build instead of the npm release)
// Each run gets a fresh temp copy of the site (outside this repo, so the path
// doesn't name the tool or lead to the answer key) and one headless Claude Code
// session on the logged-in subscription, with user settings, hooks and MCP off.

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn, execFileSync } = require('child_process');

const MODELS = { sonnet: 'claude-sonnet-5-5', opus: 'claude-opus-5-5' };
const PROMPTS = {
  single: {
    task: 'This folder has a small bakery website: index.html, style.css and hero.svg. Customers say the layout looks broken on some screen sizes. Find and fix the responsive layout problems at every viewport width from 320px to 1920px. Keep the design the same where it already works, and do not change the page\'s text or class names. When you are done, list what you fixed in FIXES.md.',
    starchy: ' The starchy CLI is available for this: `npx starchy index.html` sweeps every width from 1920px to 320px and reports layout changes and problems (`npx starchy --help` lists the options).',
  },
  // a customer report: it names no widths, so the agent has to decide how to look
  multi: {
    task: 'This folder has the website of a small bakery: six HTML pages with shared stylesheets in css/ and images in img/. Customers say parts of the site look broken on some phones and tablets. Find and fix the layout problems. Keep the design the same where it already works, and do not change the page text or class names. When you are done, list what you fixed in FIXES.md.',
    starchy: ' The starchy CLI is available for this: `npx starchy <files or URLs>` checks pages at every width from 1920px to 320px and reports layout changes and problems (`npx starchy --help` lists the options).',
  },
};
// tools that reach other sessions or schedule work outside the run
const BLOCKED = ['SendMessage', 'ListAgents', 'Workflow', 'RemoteTrigger', 'CronCreate', 'CronDelete', 'CronList', 'ScheduleWakeup', 'PushNotification'];

const args = Object.fromEntries(process.argv.slice(2).reduce((a, x, i, all) => (x.startsWith('--') ? [...a, [x.slice(2), all[i + 1]]] : a), []));
const models = (args.models || 'sonnet,opus').split(',');
const arms = (args.arms || 'starchy,control').split(',');
const trials = +(args.trials || 3), concurrency = +(args.concurrency || 2), budget = +(args.budget || 5), timeoutMin = +(args['timeout-min'] || 30);
const BENCH = args.bench || 'single';
const BASE = path.join(__dirname, BENCH);
const { grade } = require(path.join(BASE, 'grade'));
const RESULTS = path.join(BASE, args.results || 'results');

const runs = [];
for (let t = 1; t <= trials; t++) for (const m of models) for (const a of arms) runs.push({ id: `${m}-${a}-${t}`, model: m, arm: a });
const todo = args.only ? runs.filter((r) => args.only.split(',').includes(r.id)) : runs;

async function one(run) {
  const dir = path.join(RESULTS, run.id);
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  const ws = fs.mkdtempSync(path.join(os.tmpdir(), 'site-'));
  fs.cpSync(path.join(BASE, 'site'), ws, { recursive: true });
  execFileSync('git', ['init', '-q'], { cwd: ws });
  execFileSync('git', ['-c', 'user.name=bench', '-c', 'user.email=bench@example.com', 'commit', '-qam', 'start', '--allow-empty'], { cwd: ws });
  execFileSync('git', ['add', '-A'], { cwd: ws });
  execFileSync('git', ['-c', 'user.name=bench', '-c', 'user.email=bench@example.com', 'commit', '-qm', 'site'], { cwd: ws });

  if (run.arm === 'starchy' && args['starchy-tgz']) {
    // npx prefers a local install, so the agent runs this build with the same command
    execFileSync('npm', ['install', '--no-save', '--silent', '--no-audit', '--no-fund', path.resolve(args['starchy-tgz'])], { cwd: ws });
    fs.appendFileSync(path.join(ws, '.git', 'info', 'exclude'), 'node_modules/\n');
  }
  const prompt = PROMPTS[BENCH].task + (run.arm === 'starchy' ? PROMPTS[BENCH].starchy : '');
  const cmd = ['-p', prompt, '--model', MODELS[run.model], '--setting-sources', 'project', '--strict-mcp-config', '--mcp-config', '{"mcpServers":{}}',
    '--output-format', 'stream-json', '--verbose', '--max-budget-usd', String(budget), '--permission-mode', 'bypassPermissions', '--disallowedTools', ...BLOCKED];
  const transcript = fs.createWriteStream(path.join(dir, 'transcript.jsonl'));
  const started = Date.now();
  console.log(`start  ${run.id}  ${ws}`);
  const exit = await new Promise((resolve) => {
    const p = spawn('claude', cmd, { cwd: ws, stdio: ['ignore', 'pipe', 'pipe'] });
    const timer = setTimeout(() => p.kill('SIGTERM'), timeoutMin * 60000);
    p.stdout.pipe(transcript);
    p.stderr.on('data', (d) => fs.appendFileSync(path.join(dir, 'stderr.txt'), d));
    p.on('close', (code, signal) => { clearTimeout(timer); resolve(signal ? `killed (${signal})` : code); });
  });
  await new Promise((r) => transcript.end(r));

  const events = fs.readFileSync(path.join(dir, 'transcript.jsonl'), 'utf8').split('\n').filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
  const result = events.filter((e) => e.type === 'result').pop() || {};
  const toolUses = events.filter((e) => e.type === 'assistant').flatMap((e) => (e.message.content || []).filter((c) => c.type === 'tool_use'));
  const inputs = toolUses.map((u) => JSON.stringify(u.input));
  const graded = await grade(ws);
  if (fs.existsSync(path.join(ws, 'FIXES.md'))) fs.copyFileSync(path.join(ws, 'FIXES.md'), path.join(dir, 'FIXES.md'));
  fs.writeFileSync(path.join(dir, 'diff.patch'), execFileSync('git', ['diff', 'HEAD'], { cwd: ws }));

  const summary = {
    id: run.id, model: run.model, arm: run.arm, workspace: ws, exit,
    fixed: graded.fixed, total: Object.keys(graded.bugs).length, bugIds: Object.keys(graded.bugs), designKept: graded.designKept,
    bugsFixed: Object.entries(graded.bugs).filter(([, b]) => b.fixed).map(([k]) => k),
    designFailures: Object.entries(graded.design).filter(([, ok]) => !ok).map(([k]) => k),
    costUsd: result.total_cost_usd, minutes: Math.round((Date.now() - started) / 6000) / 10, turns: result.num_turns,
    stopReason: result.subtype, toolCalls: toolUses.length,
    starchyCalls: inputs.filter((s) => /starchy/i.test(s)).length,
    // anything that reaches back into this repo (the answer key lives here)
    outsideReads: inputs.filter((s) => s.includes(path.dirname(__dirname))).length,
    tokens: tokensOf(dir),
  };
  fs.writeFileSync(path.join(dir, 'grade.json'), JSON.stringify(graded, null, 2));
  fs.writeFileSync(path.join(dir, 'summary.json'), JSON.stringify(summary, null, 2));
  console.log(`done   ${run.id}  fixed ${summary.fixed}/${summary.total}  design ${summary.designKept ? 'kept' : 'BROKEN'}  $${(summary.costUsd || 0).toFixed(2)}  ${summary.minutes} min  starchy calls ${summary.starchyCalls}`);
  return summary;
}

/** Tokens from a run's final result event; modelUsage also counts subagents and other models. */
function tokensOf(dir) {
  const lines = fs.readFileSync(path.join(dir, 'transcript.jsonl'), 'utf8').split('\n').filter((l) => l.includes('"type":"result"'));
  const result = lines.length ? JSON.parse(lines.pop()) : {};
  const per = Object.values(result.modelUsage || {});
  const sum = (k, k2) => (per.length ? per.reduce((n, m) => n + (m[k] || 0), 0) : (result.usage || {})[k2] || 0);
  const t = { input: sum('inputTokens', 'input_tokens'), output: sum('outputTokens', 'output_tokens'), cacheRead: sum('cacheReadInputTokens', 'cache_read_input_tokens'), cacheWrite: sum('cacheCreationInputTokens', 'cache_creation_input_tokens') };
  return { ...t, total: t.input + t.output + t.cacheRead + t.cacheWrite, apiSeconds: Math.round((result.duration_api_ms || 0) / 1000) };
}

function report() {
  const all = fs.readdirSync(RESULTS).filter((d) => fs.existsSync(path.join(RESULTS, d, 'summary.json')))
    .map((d) => ({ ...JSON.parse(fs.readFileSync(path.join(RESULTS, d, 'summary.json'), 'utf8')), tokens: tokensOf(path.join(RESULTS, d)) }));
  const k = (n) => `${Math.round(n / 1000)}k`;
  const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
  const ids = (all[0] && all[0].bugIds) || ['B1', 'B2', 'B3', 'B4', 'B5', 'B6', 'B7', 'B8', 'B9', 'B10'];
  const rows = [];
  for (const m of Object.keys(MODELS)) for (const a of ['starchy', 'control']) {
    const g = all.filter((s) => s.model === m && s.arm === a);
    if (!g.length) continue;
    const per = Object.fromEntries(ids.map((b) => [b, g.filter((s) => s.bugsFixed.includes(b)).length]));
    rows.push(`| ${m} | ${a} | ${g.length} | ${mean(g.map((s) => s.fixed)).toFixed(1)} / ${ids.length} | ${g.filter((s) => s.designKept).length} / ${g.length} | $${mean(g.map((s) => s.costUsd || 0)).toFixed(2)} | ${mean(g.map((s) => s.minutes)).toFixed(1)} | ${mean(g.map((s) => s.turns || 0)).toFixed(0)} | ${k(mean(g.map((s) => s.tokens.output)))} | ${k(mean(g.map((s) => s.tokens.total)))} | ${Object.entries(per).map(([b, n]) => `${b}:${n}`).join(' ')} |`);
  }
  const md = ['| Model | Arm | Runs | Bugs fixed (mean) | Design kept | Cost (mean) | Minutes (mean) | Turns (mean) | Output tokens (mean) | All tokens (mean) | Runs that fixed each bug |', '|---|---|---|---|---|---|---|---|---|---|---|', ...rows, '',
    '| Run | Fixed | Design | Cost | Min | Turns | Input | Output | Cache read | Cache write | starchy calls | Outside reads | Exit |', '|---|---|---|---|---|---|---|---|---|---|---|---|---|',
    ...all.sort((a, b) => a.id.localeCompare(b.id)).map((s) => `| ${s.id} | ${s.fixed} | ${s.designKept ? 'kept' : s.designFailures.join('; ')} | $${(s.costUsd || 0).toFixed(2)} | ${s.minutes} | ${s.turns} | ${k(s.tokens.input)} | ${k(s.tokens.output)} | ${k(s.tokens.cacheRead)} | ${k(s.tokens.cacheWrite)} | ${s.starchyCalls} | ${s.outsideReads} | ${s.exit} |`)].join('\n');
  fs.writeFileSync(path.join(RESULTS, 'summary.md'), md + '\n');
  console.log('\n' + md);
}

(async () => {
  fs.mkdirSync(RESULTS, { recursive: true });
  if ('report' in args || process.argv.includes('--report')) return report();
  if (process.argv.includes('--regrade')) {
    // grade the saved workspaces again after a grader change, without new agent runs
    for (const d of fs.readdirSync(RESULTS).filter((x) => fs.existsSync(path.join(RESULTS, x, 'summary.json')))) {
      const f = path.join(RESULTS, d, 'summary.json'), s = JSON.parse(fs.readFileSync(f, 'utf8'));
      const g = await grade(s.workspace);
      Object.assign(s, { fixed: g.fixed, designKept: g.designKept, bugsFixed: Object.entries(g.bugs).filter(([, b]) => b.fixed).map(([k]) => k), designFailures: Object.entries(g.design).filter(([, ok]) => !ok).map(([k]) => k) });
      fs.writeFileSync(path.join(RESULTS, d, 'grade.json'), JSON.stringify(g, null, 2));
      fs.writeFileSync(f, JSON.stringify(s, null, 2));
    }
    return report();
  }
  const queue = [...todo];
  await Promise.all(Array.from({ length: Math.min(concurrency, queue.length) }, async () => {
    while (queue.length) {
      const run = queue.shift();
      try { await one(run); } catch (e) { console.error(`failed ${run.id}: ${e.message}`); }
    }
  }));
  report();
})();
