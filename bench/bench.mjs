// Timing harness: warmup + 7 samples, cold start recorded, brute-force baseline per step.
import { writeFileSync } from 'node:fs';
import { gearParams, gearOutline, meshSweep, analyticContactRatio } from '../src/core.mjs';

function stats(samples) {
  const s = [...samples].sort((a, b) => a - b);
  const n = s.length;
  const mean = s.reduce((a, b) => a + b, 0) / n;
  const sd = Math.sqrt(s.reduce((a, b) => a + (b - mean) ** 2, 0) / n);
  const q = (p) => s[Math.min(n - 1, Math.floor(p * n))];
  return { min: s[0], median: q(0.5), p95: q(0.95), max: s[n - 1], mean, stddev: sd, relStddev: sd / mean };
}
function time(fn) {
  const t = process.hrtime.bigint();
  fn();
  return Number(process.hrtime.bigint() - t) / 1e6;
}

const SWEEP_STEPS = 360, SAMPLES = 7, BRUTE_STEPS = 24, MODULE = 2;
const A = gearParams({ teeth: 12, module: MODULE });
const B = gearParams({ teeth: 40, module: MODULE });
const oA = gearOutline(A), oB = gearOutline(B);

meshSweep(A, B, { steps: SWEEP_STEPS, outlineA: oA, outlineB: oB }); // warmup
const cold = time(() => meshSweep(A, B, { steps: SWEEP_STEPS, outlineA: oA, outlineB: oB }));
const fine = [];
for (let i = 0; i < SAMPLES; i++) fine.push(time(() => meshSweep(A, B, { steps: SWEEP_STEPS, outlineA: oA, outlineB: oB })));

meshSweep(A, B, { steps: BRUTE_STEPS, outlineA: oA, outlineB: oB, brute: true }); // warmup
const brute = [];
for (let i = 0; i < 3; i++) brute.push(time(() => meshSweep(A, B, { steps: BRUTE_STEPS, outlineA: oA, outlineB: oB, brute: true })));

const fineStats = stats(fine);
const bruteStats = stats(brute);
const finePerStep = fineStats.median / SWEEP_STEPS;
const brutePerStep = bruteStats.median / BRUTE_STEPS;
const coarseSteps = Math.max(2, Math.round(360 / A.teeth / 5));
const coarse = time(() => meshSweep(A, B, { steps: coarseSteps, outlineA: oA, outlineB: oB }));
const ref = meshSweep(A, B, { steps: SWEEP_STEPS, outlineA: oA, outlineB: oB });
const coarseRef = meshSweep(A, B, { steps: coarseSteps, outlineA: oA, outlineB: oB });

const result = {
  generated_by: 'bench/bench.mjs',
  config: { pinion: { teeth: A.teeth, module: MODULE }, wheel: { teeth: B.teeth, module: MODULE }, sweepSteps: SWEEP_STEPS, bruteSteps: BRUTE_STEPS, samples: SAMPLES },
  warmup: 1,
  coldStartMs: Number(cold.toFixed(3)),
  fineSweepMs: { ...Object.fromEntries(Object.entries(fineStats).map(([k, v]) => [k, Number(v.toFixed(3))])), perStep: Number(finePerStep.toFixed(4)) },
  bruteForceMs: { ...Object.fromEntries(Object.entries(bruteStats).map(([k, v]) => [k, Number(v.toFixed(3))])), perStep: Number(brutePerStep.toFixed(4)) },
  speedupBruteVsPruned: Number((brutePerStep / finePerStep).toFixed(2)),
  coarseSweepMs: Number(coarse.toFixed(3)),
  accuracy: {
    analyticContactRatio: Number(analyticContactRatio(A, B).toPrecision(6)),
    sweepContactRatio: Number(ref.contactRatio.toPrecision(6)),
    absError: Number(Math.abs(ref.contactRatio - analyticContactRatio(A, B)).toPrecision(4)),
    interferenceStepsFine: ref.interferenceSteps,
    interferenceStepsCoarse5deg: coarseRef.interferenceSteps,
    coarseMissRate: Number((1 - coarseRef.interferenceSteps / ref.interferenceSteps).toPrecision(4)),
  },
};
writeFileSync(new URL('./result.json', import.meta.url), JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify(result, null, 2));
