// gear-mesh-lab core: pure involute gear geometry, no three.js, no DOM, no I/O.
// All lengths are in the same unit as `module`; every tolerance is RELATIVE to module
// so that results are invariant under uniform scaling.

export const TAU = Math.PI * 2;

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

/** involute function inv(a) = tan(a) - a */
export function inv(a) {
  return Math.tan(a) - a;
}

/** Wrap an angle into (-PI, PI]. */
export function wrapPi(a) {
  let x = (a + Math.PI) % TAU;
  if (x < 0) x += TAU;
  return x - Math.PI;
}

/**
 * Derive all radii / flags of one spur gear.
 * @param {{teeth:number, module?:number, pressureAngleDeg?:number,
 *          profileShift?:number, addendumCoeff?:number, dedendumCoeff?:number}} o
 */
export function gearParams(o = {}) {
  const teeth = o.teeth ?? 20;
  if (!Number.isFinite(teeth) || teeth < 6) throw new Error('teeth must be a number >= 6');
  const m = o.module ?? 2;
  if (!(m > 0)) throw new Error('module must be > 0');
  const alphaDeg = o.pressureAngleDeg ?? 20;
  const alpha = (alphaDeg * Math.PI) / 180;
  const x = o.profileShift ?? 0;
  const ha = o.addendumCoeff ?? 1;
  const hf = o.dedendumCoeff ?? 1.25;

  const rp = (m * teeth) / 2;
  const rb = rp * Math.cos(alpha);
  const ra = rp + m * (ha + x);
  const rf = Math.max(rp - m * (hf - x), m * 0.35);
  // Undercut limit for profile-shifted standard cutters: z_min = 2*(ha* - x)/sin^2(a)
  const undercutLimit = (2 * (ha - x)) / Math.sin(alpha) ** 2;
  const undercut = teeth < undercutLimit;
  // Half tooth thickness angle at the pitch circle: s = m*(PI/2 + 2x*tan a), angle = s/(2 rp)
  const pitchHalf = Math.PI / (2 * teeth) + (2 * x * Math.tan(alpha)) / teeth;
  if (pitchHalf <= 0) throw new Error('invalid tooth thickness (pitchHalf <= 0)');

  return { teeth, module: m, alpha, alphaDeg, x, ha, hf, rp, rb, ra, rf, pitchHalf, undercutLimit, undercut };
}

/** Half angular tooth thickness at radius r (involute), local frame, tooth 0 centered at 0. */
export function halfAngleAt(g, r) {
  if (r <= g.rb) return g.pitchHalf + inv(g.alpha);
  const ar = Math.acos(clamp(g.rb / r, -1, 1));
  return g.pitchHalf + inv(g.alpha) - inv(ar);
}

/**
 * Closed CCW outline of the whole gear (teeth + root arcs), plus per-tooth point spans.
 * @returns {{points:number[][], spans:{i:number,start:number,end:number}[], hRoot:number, hA:number}}
 */
export function gearOutline(g, opts = {}) {
  const N = opts.flankSamples ?? 40;
  const tipSamples = opts.tipSamples ?? 8;
  const rootSamples = opts.rootSamples ?? 8;
  const pitch = TAU / g.teeth;
  const hRoot = Math.min(g.pitchHalf + inv(g.alpha), pitch * 0.94);
  const hBase = g.pitchHalf + inv(g.alpha);
  const hA = Math.max(hBase - inv(Math.acos(clamp(g.rb / g.ra, -1, 1))), 2e-3);

  const points = [];
  const spans = [];
  for (let i = 0; i < g.teeth; i++) {
    const base = i * pitch;
    const start = points.length;
    points.push([g.rf * Math.cos(base - hRoot), g.rf * Math.sin(base - hRoot)]);
    points.push([g.rb * Math.cos(base - hBase), g.rb * Math.sin(base - hBase)]);
    const leftStart = points.length; // flank on the lower-angle side (root -> tip)
    for (let k = 1; k <= N; k++) {
      const r = g.rb + ((g.ra - g.rb) * k) / N;
      const a = base - halfAngleAt(g, r);
      points.push([r * Math.cos(a), r * Math.sin(a)]);
    }
    const leftEnd = points.length;
    for (let k = 1; k <= tipSamples; k++) {
      const a = base - hA + (2 * hA * k) / (tipSamples + 1);
      points.push([g.ra * Math.cos(a), g.ra * Math.sin(a)]);
    }
    const rightStart = points.length; // flank on the higher-angle side (tip -> root)
    for (let k = N; k >= 0; k--) {
      const r = g.rb + ((g.ra - g.rb) * k) / N;
      if (k === N) continue; // already added as the last tip-arc neighbour
      const a = base + halfAngleAt(g, r);
      points.push([r * Math.cos(a), r * Math.sin(a)]);
    }
    const rightEnd = points.length;
    points.push([g.rf * Math.cos(base + hRoot), g.rf * Math.sin(base + hRoot)]);
    for (let k = 1; k <= rootSamples; k++) {
      const a = base + hRoot + ((pitch - 2 * hRoot) * k) / (rootSamples + 1);
      points.push([g.rf * Math.cos(a), g.rf * Math.sin(a)]);
    }
    spans.push({ i, start, end: points.length, leftStart, leftEnd, rightStart, rightEnd });
  }
  return { points, spans, hRoot, hA };
}

/** Ray-casting point-in-polygon on a closed outline. */
export function pointInOutline(poly, px, py) {
  const p = poly;
  let inside = false;
  for (let i = 0, j = p.length - 1; i < p.length; j = i++) {
    const xi = p[i][0], yi = p[i][1], xj = p[j][0], yj = p[j][1];
    if ((yi > py) !== (yj > py) && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

export function segDist(ax, ay, bx, by, px, py) {
  const dx = bx - ax, dy = by - ay;
  const l2 = dx * dx + dy * dy;
  let t = l2 > 0 ? ((px - ax) * dx + (py - ay) * dy) / l2 : 0;
  t = clamp(t, 0, 1);
  const qx = ax + t * dx, qy = ay + t * dy;
  return Math.hypot(px - qx, py - qy);
}

function minDistToPolyline(poly, from, to, px, py) {
  let best = Infinity;
  for (let i = from; i < to - 1; i++) {
    const d = segDist(poly[i][0], poly[i][1], poly[i + 1][0], poly[i + 1][1], px, py);
    if (d < best) best = d;
  }
  return best;
}

/** Transform the point span [start,end) of a local outline into world space. */
function transformSpan(local, span, cx, cy, rot, out) {
  const c = Math.cos(rot), s = Math.sin(rot);
  let n = 0;
  for (let k = span.start; k < span.end; k++) {
    const [x, y] = local[k];
    out[n * 2] = cx + c * x - s * y;
    out[n * 2 + 1] = cy + s * x + c * y;
    n++;
  }
  return n;
}

function toXY(buf) {
  const out = new Array(buf.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = [buf[i * 2], buf[i * 2 + 1]];
  return out;
}

/** Candidate tooth spans whose angular sector is near `dir` (world angle from the gear centre). */
export function candidateSpans(g, rot, dir, sectorPitch = 1.5) {
  const pitch = TAU / g.teeth;
  const out = [];
  for (let i = 0; i < g.teeth; i++) {
    if (Math.abs(wrapPi(rot + i * pitch - dir)) <= sectorPitch * pitch) out.push(i);
  }
  return out;
}

/**
 * State of one gear pair at pinion rotation `theta`.
 * @returns {{pairs:number, minDist:number, intrusions:number, maxPenetration:number}}
 */
export function contactState(gA, gB, theta, o = {}) {
  const oA = o.outlineA, oB = o.outlineB;
  const a = gA.rp + gB.rp;
  const rotA = theta;
  const rotB = Math.PI - Math.PI / gB.teeth - (theta * gA.teeth) / gB.teeth;
  const tol = (o.contactTol ?? 2e-3) * (o.module ?? gA.module);
  const brute = o.brute === true;

  const spA = brute
    ? oA.spans.map((s) => s.i)
    : candidateSpans(gA, rotA, 0, o.sectorPitch ?? 1.5);
  const spB = brute
    ? oB.spans.map((s) => s.i)
    : candidateSpans(gB, rotB, Math.PI, o.sectorPitch ?? 1.5);

  const cA = Math.cos(rotA), sA = Math.sin(rotA), cB = Math.cos(rotB), sB = Math.sin(rotB);
  // Distance is measured on the DRIVING flank only (tip arc + the higher-angle flank),
  // which is the contiguous index run [leftEnd, rightEnd) built by gearOutline.
  const worldRun = (pts, from, to, cx, cy, c, s) => {
    const n = to - from;
    const out = new Float64Array(n * 2);
    for (let k = 0; k < n; k++) {
      const x = pts[from + k][0], y = pts[from + k][1];
      out[k * 2] = cx + c * x - s * y;
      out[k * 2 + 1] = cy + s * x + c * y;
    }
    return out;
  };
  const wA = new Map();
  for (const i of spA) {
    const span = oA.spans[i];
    wA.set(i, worldRun(oA.points, span.leftEnd, span.rightEnd, 0, 0, cA, sA));
  }
  const wB = new Map();
  for (const j of spB) {
    const span = oB.spans[j];
    wB.set(j, worldRun(oB.points, span.leftEnd, span.rightEnd, a, 0, cB, sB));
  }

  // Full world outlines, transformed once per step, used for the intrusion test only.
  const fullA = toXY(worldRun(oA.points, 0, oA.points.length, 0, 0, cA, sA));
  const fullB = toXY(worldRun(oB.points, 0, oB.points.length, a, 0, cB, sB));

  let pairs = 0;
  let minDist = Infinity;
  let intrusions = 0;
  let maxPenetration = 0;

  for (const i of spA) {
    const A = wA.get(i);
    const nA = A.length / 2;
    for (const j of spB) {
      const B = wB.get(j);
      const nB = B.length / 2;
      let pairMin = Infinity;
      for (let p = 0; p < nA; p++) {
        const px = A[p * 2], py = A[p * 2 + 1];
        for (let q = 0; q < nB; q++) {
          const qn = (q + 1) % nB;
          const d = segDist(B[q * 2], B[q * 2 + 1], B[qn * 2], B[qn * 2 + 1], px, py);
          if (d < pairMin) pairMin = d;
        }
      }
      if (pairMin < minDist) minDist = pairMin;
      if (pairMin <= tol) pairs++;
    }
  }
  // Intrusion: every sampled point of the candidate teeth against the other gear's full body.
  for (const i of spA) {
    const span = oA.spans[i];
    for (let k = span.start; k < span.end; k++) {
      const x = oA.points[k][0], y = oA.points[k][1];
      const px = cA * x - sA * y, py = sA * x + cA * y;
      if (pointInOutline(fullB, px, py)) {
        intrusions++;
        const dep = minDistToPolyline(fullB, 0, fullB.length, px, py);
        if (dep > maxPenetration) maxPenetration = dep;
      }
    }
  }
  for (const j of spB) {
    const span = oB.spans[j];
    for (let k = span.start; k < span.end; k++) {
      const x = oB.points[k][0], y = oB.points[k][1];
      const px = a + cB * x - sB * y, py = sB * x + cB * y;
      if (pointInOutline(fullA, px, py)) {
        intrusions++;
        const dep = minDistToPolyline(fullA, 0, fullA.length, px, py);
        if (dep > maxPenetration) maxPenetration = dep;
      }
    }
  }
  return { pairs, minDist, intrusions, maxPenetration };
}

/**
 * Analytic transverse contact ratio for a standard-centre (a = rp1 + rp2) pair.
 * eps = (sqrt(ra1^2-rb1^2) + sqrt(ra2^2-rb2^2) - a sin a) / (PI m cos a)
 */
export function analyticContactRatio(gA, gB) {
  const a = gA.rp + gB.rp;
  const t1 = Math.sqrt(Math.max(gA.ra ** 2 - gA.rb ** 2, 0));
  const t2 = Math.sqrt(Math.max(gB.ra ** 2 - gB.rb ** 2, 0));
  return (t1 + t2 - a * Math.sin(gA.alpha)) / (Math.PI * gA.module * Math.cos(gA.alpha));
}

/** Classic tip/root interference margin: positive means the mating tip reaches past the base tangent point. */
export function interferenceMargin(gA, gB) {
  const a = gA.rp + gB.rp;
  const limit = a * Math.sin(gA.alpha);
  return {
    limit,
    gearATipBeyond: Math.sqrt(Math.max(gA.ra ** 2 - gA.rb ** 2, 0)) - limit,
    gearBTipBeyond: Math.sqrt(Math.max(gB.ra ** 2 - gB.rb ** 2, 0)) - limit,
  };
}

/**
 * Rotation sweep over exactly one pinion angular pitch.
 * @returns {{contactRatio:number, minPairs:number, maxPairs:number, contactSteps:number,
 *            interferenceSteps:number, maxPenetration:number, minDist:number, noContactSteps:number,
 *            steps:number, stepAngleDeg:number, module:number}}
 */
export function meshSweep(gA, gB, o = {}) {
  const steps = o.steps ?? 720;
  const module_ = o.module ?? gA.module;
  const outlineA = o.outlineA ?? gearOutline(gA, o.outlineOpts);
  const outlineB = o.outlineB ?? gearOutline(gB, o.outlineOpts);
  const pitch = TAU / gA.teeth;
  const ctx = {
    outlineA, outlineB, module: module_, contactTol: o.contactTol, brute: o.brute,
    sectorPitch: o.sectorPitch,
  };
  let sum = 0, minPairs = Infinity, maxPairs = 0, contactSteps = 0, noContact = 0;
  let interferenceSteps = 0, maxPen = 0, minD = Infinity;
  for (let s = 0; s < steps; s++) {
    const theta = (pitch * s) / steps;
    const st = contactState(gA, gB, theta, ctx);
    sum += st.pairs;
    if (st.pairs < minPairs) minPairs = st.pairs;
    if (st.pairs > maxPairs) maxPairs = st.pairs;
    if (st.pairs > 0) contactSteps++;
    else noContact++;
    if (st.intrusions > 0) interferenceSteps++;
    if (st.maxPenetration > maxPen) maxPen = st.maxPenetration;
    if (st.minDist < minD) minD = st.minDist;
  }
  return {
    contactRatio: sum / steps,
    minPairs, maxPairs, contactSteps, noContactSteps: noContact,
    interferenceSteps, maxPenetration: maxPen, minDist: minD,
    steps, stepAngleDeg: (pitch / steps) * (180 / Math.PI), module: module_,
  };
}

/** Deterministic fingerprint of the sampled outline (used for reproducibility checks). */
export function outlineFingerprint(points) {
  // FNV-1a over the quantised coordinates (1e-9 relative quantisation).
  let h = 0x811c9dc5;
  const feed = (v) => {
    const q = Math.round(v * 1e9);
    for (let k = 0; k < 4; k++) {
      h ^= (q >>> (k * 8)) & 0xff;
      h = Math.imul(h, 0x01000193) >>> 0;
    }
  };
  for (const [x, y] of points) { feed(x); feed(y); }
  return h.toString(16).padStart(8, '0');
}

/** Validate the structural sanity of a gear design (used by the page and by tests). */
export function validateDesign(gA, gB) {
  const issues = [];
  if (gA.undercut) issues.push({ code: 'UNDERCUT', gear: 'A', limit: gA.undercutLimit, teeth: gA.teeth });
  if (gB.undercut) issues.push({ code: 'UNDERCUT', gear: 'B', limit: gB.undercutLimit, teeth: gB.teeth });
  const im = interferenceMargin(gA, gB);
  if (im.gearATipBeyond > 0) issues.push({ code: 'TIP_ROOT_INTERFERENCE', gear: 'A', beyond: im.gearATipBeyond });
  if (im.gearBTipBeyond > 0) issues.push({ code: 'TIP_ROOT_INTERFERENCE', gear: 'B', beyond: im.gearBTipBeyond });
  if (analyticContactRatio(gA, gB) <= 1) issues.push({ code: 'CONTACT_RATIO_LE_1', value: analyticContactRatio(gA, gB) });
  return issues;
}
