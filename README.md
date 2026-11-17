# gear-mesh-lab

**Promise:** for a 12-tooth / 40-tooth, module-2, 20° involute spur pair the analytic transverse contact ratio is **ε=1.5669**; an independent polygon rotation sweep over one pinion pitch returns **ε=1.5444** (|Δ|=0.0225, the residual coming from the design's own interference) and finds **56 interfering poses out of 360** (112 out of 720); sampling the same pair only every 5° (6 poses — what a frame-by-frame eyeball check does) finds **1 of 112**, i.e. **99.1% of the interference window is missed** (1 of 56 at 360 steps → 98.2%). Two truncation repairs — wheel addendum 0.7 and pinion 18 teeth — clear interference to **0/360 poses** while keeping ε≥1.33.

Upstream: none

## What it is

A browser + node workbench for involute spur gears. The core is pure geometry in `src/core.mjs` (no three.js, no DOM): it builds the real involute profile, computes the analytic contact ratio, and *independently* verifies it by rotating the two polygon profiles through one pitch and counting tooth pairs whose driving flanks touch. It also runs a point-in-polygon intrusion test against the mating gear body to detect tip/root interference and measures the penetration depth.

Two oracles, one number: the closed-form ε and the swept ε are computed by different code paths, and they must agree — disagreement is surfaced, not hidden.

## How to run

Requires **node ≥ 20** (developed on v24). No dependencies, no build step.

```bash
node tools/gen-sample.mjs     # regenerate data/gears.json (deterministic)
node bench/verify.mjs         # 14 assertions, prints every measured value
node bench/bench.mjs          # timing + creates bench/result.json
```

Interactive page (single file + CDN importmap, three.js r170 pinned):

```bash
python3 -m http.server 4173
# open http://localhost:4173 — drag to orbit, wheel to zoom
```

The page imports the *same* `src/core.mjs`; the "Run 360-step verification" button recomputes ε by sweep in your browser, so the on-screen number is the one node asserts.

## Evidence

`bench/result.json` (real run, warmup 1 + 7 samples on the 12/40 pair):

| metric | value |
| --- | --- |
| analytic ε | 1.5669 |
| swept ε (360 steps) | 1.5444 |
| \|swept − analytic\| | 0.0225 (interfering design) |
| interference poses, 360-step sweep | 56 |
| interference poses, 5° sampling | 1 |
| coarse miss rate (360-step ref) | 98.2% (1 of 56); 99.1% at 720 steps |
| cold start (first run) | 2585 ms |
| sweep 360 steps, median (7 samples) | 2472 ms → 6.87 ms/step, relSD 1.0% |
| brute-force all-pairs, median (24 steps) | 1851 ms → 77.14 ms/step, relSD 6.1% |
| candidate pruning speedup | 11.23× per step |
| 5° coarse sweep | 41.7 ms |

Timing rows are wall-clock from the committed `bench/result.json` run (warmup 1 + 7 samples; `relSD` is in the file). Wall-clock re-runs on the same machine vary: an independent re-run measured median 2486 ms (6.91 ms/step, relSD 0.7%), brute 1621 ms (67.52 ms/step, relSD 0.2%) and speedup **9.78×**. The correctness numbers (`accuracy` block) reproduced exactly.

Clean-pair oracle agreement (from `node bench/verify.mjs`):

| design | analytic ε | swept ε | \|Δ\| | interference poses / 360 |
| --- | --- | --- | --- | --- |
| 12/40, wheel addendum 0.7 | 1.3321 | 1.3389 | 0.0068 | 0 |
| 18/40 | 1.6216 | 1.6222 | 0.0006 | 0 |
| 12/40 standard (defective) | 1.5669 | 1.5444 | 0.0225 | 56 |

Reproducibility: `data/gears.json` is byte-stable across runs, and `outlineFingerprint` for the 12-tooth profile is `c6077bed` both times.

## Known limitations

* **Absolute tolerance:** contact uses `contactTol = 2e-3 · module` and the undercut/interference margins are absolute lengths in the same unit as `module`. Valid for the unit-scale (mm-like) range used here; because both the tolerance and the geometry scale with `module`, results are **scale-invariant** — verified at module 2×10⁻³, 2 and 2×10³ (identical ε=1.544444 and identical 56 interference poses, penetration scaling proportionally).
* **Profile shift at standard centre distance:** the tool keeps the standard centre distance `a = rp₁+rp₂`. A positive pinion shift then *thickens* the tooth and the pair jams — this is a real, reproduced finding (`jam_xA05` in `data/gears.json`: ε_sweep 0.5833 against analytic 1.6022, 360/360 poses interfering, max penetration 0.499953, 177/360 poses with no contact at all). Proper shifted meshes need a recalculated operating centre distance, which this version does not implement.
* **No backlash model:** the sweep measures the geometric contact of zero-backlash profiles, so the driving-flank filter (index run `[leftEnd, rightEnd)`) is required; the whole-tooth min-distance metric over-counts trailing-flank proximity.
* **2D transverse plane:** spur gears only; no helix, no axial overlap, no load/strength analysis, no manufacturing tolerance.
* **Sampling resolution** is the subject of the resolution table, not a hidden knob: 6/24/120/360/720 poses per pitch find 1/4/19/56/112 interference poses respectively.

## 本轮创新

**B 档.** The first workbench in this line that treats the *analytic* contact ratio and an *independent polygon rotation sweep* as mutually-checking oracles and surfaces their disagreement, and that quantifies the sampling-resolution → interference-miss-rate curve (5° sampling misses 99.1% of the interfering window; only 360 poses per pitch — 0.0833°, far finer than any interactive sampling — find all 56, while 0.5°/60 poses find just 9). Prior art in this cluster is either an involute profile *generator* or a desktop Python library (py_gearworks computes a contact ratio but does not cross-check it); a `gh search repos` for `gear contact ratio` / `undercut gear` returns 0 repositories, and the browser tools found (Otvinta, Evolvent Design) emit geometry or strength numbers with no interference verdict at all. The browser and node share one core module, so the number on screen is the number asserted in CI.
