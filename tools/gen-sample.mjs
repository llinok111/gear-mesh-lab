// Deterministic sample generator: writes data/gears.json (no timestamps, byte-stable).
import { writeFileSync, mkdirSync } from 'node:fs';
import { gearParams, gearOutline, analyticContactRatio, interferenceMargin, meshSweep, outlineFingerprint, validateDesign } from '../src/core.mjs';

const CONFIGS = {
  base12_40: { A: { teeth: 12 }, B: { teeth: 40 } },
  repair_haB07: { A: { teeth: 12 }, B: { teeth: 40, addendumCoeff: 0.7 } },
  repair_18_40: { A: { teeth: 18 }, B: { teeth: 40 } },
  jam_xA05: { A: { teeth: 12, profileShift: 0.5 }, B: { teeth: 40, addendumCoeff: 0.7 } },
};
const SWEEP_STEPS = 360;
const MODULE = 2;
const r6 = (v) => (typeof v === 'number' ? Number(v.toPrecision(6)) : v);

const out = {
  schema: 'gear-mesh-lab/1',
  module: MODULE,
  sweepSteps: SWEEP_STEPS,
  configs: {},
};
for (const [name, cfg] of Object.entries(CONFIGS)) {
  const A = gearParams({ module: MODULE, ...cfg.A });
  const B = gearParams({ module: MODULE, ...cfg.B });
  const oA = gearOutline(A);
  const oB = gearOutline(B);
  const sweep = meshSweep(A, B, { steps: SWEEP_STEPS, outlineA: oA, outlineB: oB });
  const coarseSteps = Math.max(2, Math.round(360 / A.teeth / 5));
  const coarse = meshSweep(A, B, { steps: coarseSteps, outlineA: oA, outlineB: oB });
  out.configs[name] = {
    A: { teeth: A.teeth, module: A.module, profileShift: A.x, addendumCoeff: A.ha, rp: r6(A.rp), rb: r6(A.rb), ra: r6(A.ra), rf: r6(A.rf), undercut: A.undercut, undercutLimit: r6(A.undercutLimit), outlinePoints: oA.points.length, fingerprint: outlineFingerprint(oA.points) },
    B: { teeth: B.teeth, module: B.module, profileShift: B.x, addendumCoeff: B.ha, rp: r6(B.rp), rb: r6(B.rb), ra: r6(B.ra), rf: r6(B.rf), undercut: B.undercut, undercutLimit: r6(B.undercutLimit), outlinePoints: oB.points.length, fingerprint: outlineFingerprint(oB.points) },
    analyticContactRatio: r6(analyticContactRatio(A, B)),
    interferenceMargin: { limit: r6(interferenceMargin(A, B).limit), tipsBeyond: [r6(interferenceMargin(A, B).gearATipBeyond), r6(interferenceMargin(A, B).gearBTipBeyond)] },
    sweep: { contactRatio: r6(sweep.contactRatio), minPairs: sweep.minPairs, maxPairs: sweep.maxPairs, interferenceSteps: sweep.interferenceSteps, maxPenetration: r6(sweep.maxPenetration), noContactSteps: sweep.noContactSteps, steps: sweep.steps, stepAngleDeg: r6(sweep.stepAngleDeg) },
    coarseSweep: { steps: coarseSteps, stepAngleDeg: r6(coarse.stepAngleDeg), contactRatio: r6(coarse.contactRatio), interferenceSteps: coarse.interferenceSteps },
    issues: validateDesign(A, B).map((i) => i.code + ':' + (i.gear ?? 'pair')),
  };
}
mkdirSync(new URL('../data/', import.meta.url), { recursive: true });
writeFileSync(new URL('../data/gears.json', import.meta.url), JSON.stringify(out, null, 2) + '\n');
console.log('wrote data/gears.json configs=' + Object.keys(out.configs).length);
