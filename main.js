// Render + interaction only. All geometry and metrics come from src/core.mjs (never recomputed here).
import * as THREE from 'three';
import { gearParams, gearOutline, analyticContactRatio, interferenceMargin, meshSweep, contactState } from './src/core.mjs';

const MODULE = 2;
const $ = (id) => document.getElementById(id);
const canvas = $('c');
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0d1117);
const camera = new THREE.PerspectiveCamera(45, 1, 1, 5000);
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
scene.add(new THREE.HemisphereLight(0xffffff, 0x223344, 1.2));
const dl = new THREE.DirectionalLight(0xffffff, 1.7);
dl.position.set(40, 80, 120);
scene.add(dl);
scene.add(new THREE.AmbientLight(0xffffff, 0.15));

const group = new THREE.Group();
scene.add(group);
let state = null;       // { A, B, oA, oB, meshA, meshB, centerDistance, theta }
let running = true;
let orbit = { yaw: 0.5, pitch: 0.85, dist: 1, dragging: false, lx: 0, ly: 0 };

function params() {
  return {
    A: gearParams({ teeth: +$('z1').value, module: MODULE, profileShift: +$('x').value }),
    B: gearParams({ teeth: +$('z2').value, module: MODULE, addendumCoeff: +$('ha').value }),
  };
}

function makeMesh(g, color) {
  const o = gearOutline(g);
  const shape = new THREE.Shape();
  o.points.forEach(([x, y], i) => (i ? shape.lineTo(x, y) : shape.moveTo(x, y)));
  shape.closePath();
  const geo = new THREE.ExtrudeGeometry(shape, { depth: g.module * 4, bevelEnabled: false, curveSegments: 1 });
  geo.translate(0, 0, -g.module * 2);
  const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color, metalness: 0.5, roughness: 0.35 }));
  return { mesh, outline: o };
}

function rebuild() {
  const { A, B } = params();
  group.clear();
  const a = A.rp + B.rp;
  const ga = makeMesh(A, 0x58a6ff);
  const gb = makeMesh(B, 0xd29922);
  gb.mesh.position.x = a;
  group.add(ga.mesh, gb.mesh);
  state = { A, B, oA: ga.outline, oB: gb.outline, meshA: ga.mesh, meshB: gb.mesh, centerDistance: a, theta: state ? state.theta : 0 };
  const im = interferenceMargin(A, B);
  $('m-analytic').textContent = analyticContactRatio(A, B).toFixed(4);
  $('m-uc').innerHTML = A.undercut
    ? `<span class="warn">yes (z&lt;${A.undercutLimit.toFixed(1)})</span>`
    : '<span class="ok">no</span>';
  $('m-margin').innerHTML = im.gearBTipBeyond > 0
    ? `<span class="bad">+${im.gearBTipBeyond.toFixed(3)}</span>`
    : `<span class="ok">${im.gearBTipBeyond.toFixed(3)}</span>`;
  $('m-sweep').textContent = 'press verify';
  $('m-delta').textContent = '–';
  $('m-intf').textContent = '–';
  $('m-coarse').textContent = '–';
  fit();
}

function fit() {
  if (!state) return;
  const a = state.centerDistance;
  const r = Math.max(state.A.ra, state.B.ra) + a / 2;
  orbit.dist = r * 2.6;
  camera.near = r / 100;
  camera.far = r * 100;
}

function updateCamera() {
  const a = state ? state.centerDistance : 0;
  const cx = a / 2, cy = 0, cz = 0;
  const d = orbit.dist;
  camera.position.set(cx + d * Math.sin(orbit.yaw) * Math.cos(orbit.pitch), cy - d * Math.sin(orbit.pitch), cz + d * Math.cos(orbit.yaw) * Math.cos(orbit.pitch));
  camera.lookAt(cx, cy, cz);
}

function resize() {
  const w = canvas.clientWidth, h = canvas.clientHeight;
  if (w === 0 || h === 0) return;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);

canvas.addEventListener('pointerdown', (e) => { orbit.dragging = true; orbit.lx = e.clientX; orbit.ly = e.clientY; });
window.addEventListener('pointerup', () => (orbit.dragging = false));
window.addEventListener('pointermove', (e) => {
  if (!orbit.dragging) return;
  orbit.yaw += (e.clientX - orbit.lx) * 0.006;
  orbit.pitch = Math.max(0.08, Math.min(1.5, orbit.pitch + (e.clientY - orbit.ly) * 0.004));
  orbit.lx = e.clientX; orbit.ly = e.clientY;
});
canvas.addEventListener('wheel', (e) => { e.preventDefault(); orbit.dist *= 1 + Math.sign(e.deltaY) * 0.08; }, { passive: false });

let frame = 0;
function animate() {
  requestAnimationFrame(animate);
  resize();
  if (state) {
    if (running) state.theta += 0.01 * (+$('sp').value);
    const pitchA = (Math.PI * 2) / state.A.teeth;
    const t = state.theta % (pitchA * 20);
    state.meshA.rotation.z = t;
    state.meshB.rotation.z = Math.PI - Math.PI / state.B.teeth - (t * state.A.teeth) / state.B.teeth;
    if (frame++ % 10 === 0) {
      const st = contactState(state.A, state.B, t % pitchA, { outlineA: state.oA, outlineB: state.oB });
      $('m-now').innerHTML = st.intrusions > 0
        ? `<span class="bad">${st.pairs} (intrusion ${st.intrusions})</span>`
        : `<span class="ok">${st.pairs}</span>`;
    }
    updateCamera();
  }
  renderer.render(scene, camera);
}
animate();

for (const id of ['z1', 'z2', 'x', 'ha']) {
  $(id).addEventListener('input', () => {
    $('v-' + (id === 'x' ? 'x' : id === 'ha' ? 'ha' : id)).textContent =
      id === 'x' || id === 'ha' ? (+$(id).value).toFixed(2) : $(id).value;
    rebuild();
  });
}
$('sp').addEventListener('input', () => { $('v-sp').textContent = (+$('sp').value).toFixed(1); });

$('run').addEventListener('click', () => {
  if (!state) return;
  $('m-sweep').textContent = 'running…';
  setTimeout(() => {
    const s = meshSweep(state.A, state.B, { steps: 360, outlineA: state.oA, outlineB: state.oB });
    const an = analyticContactRatio(state.A, state.B);
    const coarseSteps = Math.max(2, Math.round(360 / state.A.teeth / 5));
    const cs = meshSweep(state.A, state.B, { steps: coarseSteps, outlineA: state.oA, outlineB: state.oB });
    $('m-sweep').textContent = s.contactRatio.toFixed(4);
    $('m-delta').textContent = Math.abs(s.contactRatio - an).toFixed(4);
    $('m-intf').innerHTML = s.interferenceSteps > 0 ? `<span class="bad">${s.interferenceSteps}</span>` : `<span class="ok">0</span>`;
    $('m-coarse').textContent = `${coarseSteps} steps → ${cs.interferenceSteps}`;
  }, 20);
});

rebuild();
resize();
