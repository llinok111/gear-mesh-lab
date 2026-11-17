// Baseline (real-world naive practice): sample the mesh only every 5 degrees of pinion
// rotation. This is what an animation-frame or "eyeball it" workflow actually does.
import { gearParams, gearOutline, meshSweep, analyticContactRatio } from '../src/core.mjs';

const A = gearParams({ teeth: 12, module: 2 });
const B = gearParams({ teeth: 40, module: 2 });
const pitchDeg = 360 / A.teeth;
const steps = Math.max(2, Math.round(pitchDeg / 5));
const oA = gearOutline(A);
const oB = gearOutline(B);
const coarse = meshSweep(A, B, { steps, outlineA: oA, outlineB: oB });

console.log(JSON.stringify({
  baseline: 'uniform 5deg sampling',
  steps,
  stepAngleDeg: coarse.stepAngleDeg,
  contactRatio: coarse.contactRatio,
  interferenceSteps: coarse.interferenceSteps,
  analyticContactRatio: analyticContactRatio(A, B),
}, null, 2));
