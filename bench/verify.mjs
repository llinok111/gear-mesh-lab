// Node-only assertions on the real core. Every assertion prints its measured value.
import { gearParams, gearOutline, analyticContactRatio, interferenceMargin, meshSweep, outlineFingerprint, validateDesign } from '../src/core.mjs';

let passed = 0, failed = 0;
const near = (a, b, tol) => Math.abs(a - b) <= tol;
function check(id, name, ok, detail) {
  if (ok) passed++; else failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'} ${id} ${name} :: ${detail}`);
}

const P = (o) => gearParams({ module: 2, ...o });
const BASE = [P({ teeth: 12 }), P({ teeth: 40 })];
const R1 = [P({ teeth: 12 }), P({ teeth: 40, addendumCoeff: 0.7 })];
const R2 = [P({ teeth: 18 }), P({ teeth: 40 })];

// A1 radii
{
  const A = BASE[0];
  const ok = near(A.rp, 12, 1e-12) && near(A.rb, 12 * Math.cos(Math.PI / 9), 1e-12) && near(A.ra, 14, 1e-12) && near(A.rf, 9.5, 1e-12);
  check('A1', 'involute radii', ok, `rp=${A.rp} rb=${A.rb.toFixed(6)} ra=${A.ra} rf=${A.rf}`);
}
// A2 undercut flag + limit
{
  const ok = BASE[0].undercut === true && R2[0].undercut === false && near(BASE[0].undercutLimit, 17.0973, 1e-3);
  check('A2', 'undercut flag 12T vs 18T', ok, `12T=${BASE[0].undercut} limit=${BASE[0].undercutLimit.toFixed(4)} 18T=${R2[0].undercut}`);
}
// A3 interference margin
{
  const im = interferenceMargin(...BASE), im1 = interferenceMargin(...R1);
  const ok = im.gearBTipBeyond > 0 && im1.gearBTipBeyond < 0;
  check('A3', 'tip/root interference margin', ok, `base B tipBeyond=${im.gearBTipBeyond.toFixed(4)} repair=${im1.gearBTipBeyond.toFixed(4)}`);
}
// A4 analytic contact ratio
{
  const eB = analyticContactRatio(...BASE), e1 = analyticContactRatio(...R1), e2 = analyticContactRatio(...R2);
  const ok = near(eB, 1.5669, 1e-4) && near(e1, 1.3321, 1e-4) && near(e2, 1.6216, 1e-4);
  check('A4', 'analytic contact ratio', ok, `base=${eB.toFixed(4)} haB0.7=${e1.toFixed(4)} 18_40=${e2.toFixed(4)}`);
}
// A5/A6 sweep vs analytic on the two clean designs
{
  const s1 = meshSweep(...R1, { steps: 360 });
  const d1 = Math.abs(s1.contactRatio - analyticContactRatio(...R1));
  check('A5', 'sweep eps matches analytic (haB=0.7)', d1 <= 0.02, `sweep=${s1.contactRatio.toFixed(4)} analytic=${analyticContactRatio(...R1).toFixed(4)} |d|=${d1.toFixed(4)}`);
  const s2 = meshSweep(...R2, { steps: 360 });
  const d2 = Math.abs(s2.contactRatio - analyticContactRatio(...R2));
  check('A6', 'sweep eps matches analytic (18/40)', d2 <= 0.01, `sweep=${s2.contactRatio.toFixed(4)} analytic=${analyticContactRatio(...R2).toFixed(4)} |d|=${d2.toFixed(4)}`);
}
// A7 the base design really interferes, with real penetration depth
{
  const s = meshSweep(...BASE, { steps: 360 });
  const ok = s.interferenceSteps >= 50 && s.maxPenetration > 0;
  check('A7', 'base 12/40 interference detected', ok, `steps=${s.interferenceSteps}/360 maxPen=${s.maxPenetration.toExponential(3)}`);
}
// A8 repairs remove interference
{
  const s1 = meshSweep(...R1, { steps: 360 }), s2 = meshSweep(...R2, { steps: 360 });
  const ok = s1.interferenceSteps === 0 && s2.interferenceSteps === 0 && s1.maxPenetration === 0 && s2.maxPenetration === 0;
  check('A8', 'repairs clear interference', ok, `haB0.7=${s1.interferenceSteps} steps 18/40=${s2.interferenceSteps} steps`);
}
// A9 bounded pair count => the driving-flank filter is meaningful
{
  const s1 = meshSweep(...R1, { steps: 360 });
  const ok = s1.minPairs >= 1 && s1.maxPairs <= 2;
  check('A9', 'pairs in contact bounded to [1,2]', ok, `minPairs=${s1.minPairs} maxPairs=${s1.maxPairs}`);
}
// A10 scale invariance across six orders of magnitude (module 2e-3 .. 2e3)
{
  const rows = [2e-3, 2, 2e3].map((m) => meshSweep(gearParams({ teeth: 12, module: m }), gearParams({ teeth: 40, module: m }), { steps: 360 }));
  const eps = rows.map((r) => r.contactRatio.toFixed(6));
  const int = rows.map((r) => r.interferenceSteps);
  const ok = new Set(eps).size === 1 && new Set(int).size === 1 && rows.every((r) => r.minPairs === 1 && r.maxPairs === 2);
  check('A10', 'scale invariance (1e-3/1/1e3)', ok, `eps=${eps.join(',')} interferenceSteps=${int.join(',')}`);
}
// A11 coarse 5deg sampling misses the interference window
{
  const fine = meshSweep(...BASE, { steps: 720 });
  const coarse = meshSweep(...BASE, { steps: 6 });
  const missRate = 1 - coarse.interferenceSteps / fine.interferenceSteps;
  const ok = missRate >= 0.95;
  check('A11', 'coarse sampling misses interference', ok, `coarse=${coarse.interferenceSteps} fine720=${fine.interferenceSteps} missRate=${(missRate * 100).toFixed(1)}%`);
}
// A12 candidate pruning agrees with the brute-force all-pairs reference
{
  const A = R1[0], B = R1[1], oA = gearOutline(A), oB = gearOutline(B);
  const fast = meshSweep(A, B, { steps: 24, outlineA: oA, outlineB: oB });
  const brute = meshSweep(A, B, { steps: 24, outlineA: oA, outlineB: oB, brute: true });
  const ok = near(fast.contactRatio, brute.contactRatio, 1e-9) && fast.interferenceSteps === brute.interferenceSteps;
  check('A12', 'pruned sweep == brute force', ok, `fast=${fast.contactRatio.toFixed(6)} brute=${brute.contactRatio.toFixed(6)} steps=${fast.interferenceSteps}/${brute.interferenceSteps}`);
}
// A13 determinism of the sampled profile
{
  const f1 = outlineFingerprint(gearOutline(P({ teeth: 12 })).points);
  const f2 = outlineFingerprint(gearOutline(P({ teeth: 12 })).points);
  const ok = f1 === f2 && f1 === 'c6077bed';
  check('A13', 'outline fingerprint deterministic', ok, `f1=${f1} f2=${f2}`);
}
// A14 design validator reports the real defects
{
  const base = validateDesign(...BASE).map((i) => i.code).sort();
  const clean = validateDesign(...R2);
  const ok = base.includes('UNDERCUT') && base.includes('TIP_ROOT_INTERFERENCE') && clean.length === 0;
  check('A14', 'design validator', ok, `base=[${base.join(',')}] 18/40=[${clean.map((i) => i.code).join(',')}]`);
}

console.log(`\n${passed} passed / ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
