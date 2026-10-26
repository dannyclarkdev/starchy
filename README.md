# starchy

**Keep your layout crisp at every width.**

starchy finds every screen width where your page's layout actually changes, and
flags the changes that are bugs.

```bash
npx starchy https://example.com
```

Most responsive testing screenshots a handful of fixed breakpoints, such as 375,
768 and 1440, so a bug that only appears at 912px goes unnoticed. starchy sweeps
the whole range and lets the page show it where the layout shifts:

1. Load the page at a max width (default 1920px) and fingerprint the layout:
   for every container, how its children sit in rows (for example `3+3+1`),
   which elements are visible, and any problems.
2. Step down 8px at a time. When the fingerprint changes, binary-search to the
   exact pixel.
3. Take before/after screenshots with the changed elements outlined, and
   classify the change:
   - **Media query**: the width matches a `@media` breakpoint in your CSS, so
     the change is expected.
   - **Fluid change**: the layout changed with no media query. It came from
     flex-wrap, auto-fit, or content size, so check that it's intended.
   - **Problem**: something broke at this width.
4. Continue down to the min width (default 320px), once for each viewport
   height you list.
5. Write `report.html` and a `fingerprint.json` you can compare against later.

## What counts as a problem

| Problem | What it means |
|---|---|
| Horizontal scroll | The page is wider than the screen. starchy names the element *causing* it by briefly hiding each candidate and checking whether the scroll width shrinks. |
| Overlap | In-flow sibling elements overlap each other. |
| Escapes container | An element sticks out of its parent's box. |
| Clipped text | Text is cut off by `overflow: hidden`. |
| Wrapped link | A link or button label of 5 words or fewer breaks onto 2+ lines. Links inside running text and headings are skipped. |
| Tiny text | Text is below `--min-font` (default 12px). |

## Install

```bash
npm install -g starchy
npx playwright install chromium
```

## Usage

```bash
starchy https://example.com
starchy example.com                      # https:// is assumed
starchy ./index.html --min 360 --heights 900,600
```

| Option | Default | |
|---|---|---|
| `--max` / `--min` | 1920 / 320 | Width range to sweep |
| `--step` | 8 | Coarse step before bisecting. Lower is slower but more thorough. |
| `--heights` | 900 | Comma-separated viewport heights, each swept separately |
| `--dpr` | 1 | Device pixel ratio (affects images/hairlines, not layout) |
| `--min-font` | 12 | Smallest acceptable text size in px |
| `--ignore` | | Selectors to skip, e.g. `.carousel,.ad-slot` |
| `--settle` | 0 | Extra ms to wait after each resize, for JS-driven layouts |
| `--out` | `starchy-report` | Output folder |
| `--baseline` | | An earlier `fingerprint.json` to compare against |
| `--fail-on` | none | `problems` or `new` makes starchy exit 1, for CI |
| `--no-screenshots` | | Faster runs, report without images |

## In CI

```bash
# once, on a known-good build:
starchy https://staging.example.com --out baseline

# on every pull request:
starchy https://staging.example.com --baseline baseline/fingerprint.json --fail-on new
```

The comparison is structural, not pixel-based, so it doesn't suffer the
font-rendering noise that makes screenshot diffs flaky. The report lists new
problems, fixed problems, and layout changes that appeared or disappeared.

## Try it

`test/fixture.html` is a sample landing page with six planted bugs, listed in
the comments at the top of the file:

```bash
npm test
open test-report/report.html
```

## Known limitations

- **Change-and-revert inside one step is missed.** If the layout changes and
  then changes back within 8px, the sweep won't see it. Use `--step 1` for an
  exhaustive pass.
- **Container queries show up as "fluid".** Only `@media` widths are matched
  to breakpoints.
- **Worst offender first.** When two elements both cause horizontal scroll,
  the widest one is named. The other surfaces once the first is fixed.
- **Some content isn't inspected.** Shadow DOM and iframes are skipped.
  Auto-rotating carousels and other animated elements need `--ignore`.
- **Inline text reflow is ignored on purpose.** It changes at almost every
  pixel. Text is checked through the clipped-text, wrapped-link and tiny-text rules
  instead.
- **Chromium only for now.**

## Project layout

```
cli.js              CLI, sweep loop, bisection, screenshots
src/fingerprint.js  runs in the page: layout units, row signatures, problem checks
src/analyze.js      fingerprint hashing, media-query parsing, diff + classification
src/baseline.js     compare against an earlier fingerprint.json
src/report.js       HTML report
```

## License

MIT
