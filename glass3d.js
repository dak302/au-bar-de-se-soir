/*
 * Au Bar de ce Soir — verre à cocktail en 3D (three.js)
 *
 * Une coupe en verre qui tourne doucement, qu'on fait pivoter du doigt (suivi 1:1 + élan),
 * et qui se remplit de la couleur d'un cocktail.
 *
 * Utilisation depuis index.html :
 *   Glass.attach(elementConteneur, { color: '#B3261E', fill: 0.8, animate: true })
 * Un seul <canvas> est réutilisé : il se déplace dans le conteneur demandé.
 * Le rendu s'arrête tout seul quand le verre n'est plus à l'écran.
 */
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

const BG = new THREE.Color('#F7F3EC');
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ---------- Scène ---------- */
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'low-power' });
renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.localClippingEnabled = true;
renderer.setClearColor(BG, 1);
const canvas = renderer.domElement;
canvas.className = 'glass-canvas';
canvas.setAttribute('aria-hidden', 'true');

const scene = new THREE.Scene();
scene.background = BG;
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

const camera = new THREE.PerspectiveCamera(26, 1, 0.1, 50);
camera.position.set(0, 1.55, 5.6);
camera.lookAt(0, 0.92, 0);

const key = new THREE.DirectionalLight(0xffffff, 1.2);
key.position.set(2.5, 4, 3);
scene.add(key, new THREE.AmbientLight(0xffffff, 0.35));

const glass = new THREE.Group();
scene.add(glass);

/* ---------- La coupe (profil tourné autour de l'axe) ---------- */
// Profil extérieur (bas → lèvre) puis intérieur (lèvre → fond du bol) : une paroi fermée et fine.
const outer = [[0,0],[.58,0],[.6,.018],[.58,.036],[.13,.075],[.06,.2],[.05,.9],[.07,1.04],[.2,1.15],
  [.5,1.25],[.8,1.42],[.95,1.6],[1.0,1.75]];
const inner = [[.975,1.758],[.925,1.6],[.775,1.445],[.48,1.29],[.2,1.205],[0,1.19]];
const profile = outer.concat(inner).map(([x, y]) => new THREE.Vector2(x, y));
const glassMat = new THREE.MeshPhysicalMaterial({
  // Verre transparent + reflets (plus léger pour un téléphone que la « transmission » physique).
  color: 0xffffff, metalness: 0, roughness: 0.03, transparent: true, opacity: 0.22, depthWrite: false,
  clearcoat: 1, clearcoatRoughness: 0.02, envMapIntensity: 1.6, specularIntensity: 1, side: THREE.DoubleSide
});
const glassMesh = new THREE.Mesh(new THREE.LatheGeometry(profile, 96), glassMat);
glassMesh.renderOrder = 2; // dessiné après le liquide
glass.add(glassMesh);

// Fins filets noirs sur la lèvre et le pied : le « contour noir » de la carte.
const ink = new THREE.MeshBasicMaterial({ color: 0x1C1A17 });
const lip = new THREE.Mesh(new THREE.TorusGeometry(0.988, 0.007, 8, 128), ink);
lip.rotation.x = Math.PI / 2; lip.position.y = 1.756;
const foot = new THREE.Mesh(new THREE.TorusGeometry(0.6, 0.006, 8, 128), ink);
foot.rotation.x = Math.PI / 2; foot.position.y = 0.018;
glass.add(lip, foot);

/* ---------- Le liquide ---------- */
// Rayon intérieur du bol à une hauteur donnée (pour la surface du liquide).
const wall = inner.slice().reverse(); // du fond vers la lèvre
function radiusAt(y){
  if (y <= wall[0][1]) return 0;
  for (let i = 1; i < wall.length; i++){
    const [x0, y0] = wall[i - 1], [x1, y1] = wall[i];
    if (y <= y1) return (x0 + (x1 - x0) * (y - y0) / (y1 - y0)) * 0.985;
  }
  return wall[wall.length - 1][0] * 0.985;
}
const BOTTOM = 1.195, TOP = 1.70;
const liquidPts = [new THREE.Vector2(0, BOTTOM)];
for (let y = BOTTOM + 0.005; y <= TOP + 0.03; y += 0.01) liquidPts.push(new THREE.Vector2(radiusAt(y), y));
const clip = new THREE.Plane(new THREE.Vector3(0, -1, 0), BOTTOM);
const liquidMat = new THREE.MeshStandardMaterial({ color: 0xD9A441, roughness: 0.25, metalness: 0, emissive: 0x000000, clippingPlanes: [clip], side: THREE.DoubleSide });
const liquid = new THREE.Mesh(new THREE.LatheGeometry(liquidPts, 96), liquidMat);
const surfMat = new THREE.MeshStandardMaterial({ color: 0xE8C070, roughness: 0.12, metalness: 0 });
const surface = new THREE.Mesh(new THREE.CircleGeometry(1, 96), surfMat);
surface.rotation.x = -Math.PI / 2;
glass.add(liquid, surface);

/* ---------- Le zeste (asymétrique : c'est lui qui montre la rotation) ---------- */
const twistPts = [];
for (let i = 0; i <= 40; i++){
  const t = i / 40, a = -0.5 + t * 1.3;
  twistPts.push(new THREE.Vector3(Math.cos(a) * (0.99 + Math.sin(t * Math.PI * 3) * 0.05),
    1.80 - t * 0.42 + Math.sin(t * Math.PI) * 0.12, Math.sin(a) * (0.99 + Math.sin(t * Math.PI * 3) * 0.05)));
}
const peel = new THREE.Mesh(
  new THREE.TubeGeometry(new THREE.CatmullRomCurve3(twistPts), 80, 0.035, 10, false),
  new THREE.MeshStandardMaterial({ color: 0xE9B53A, roughness: 0.45 })
);
peel.scale.set(1, 1, 1);
glass.add(peel);

/* ---------- Ombre douce au sol ---------- */
const sh = document.createElement('canvas'); sh.width = sh.height = 128;
const g = sh.getContext('2d'), grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
grd.addColorStop(0, 'rgba(28,26,23,.32)'); grd.addColorStop(1, 'rgba(28,26,23,0)');
g.fillStyle = grd; g.fillRect(0, 0, 128, 128);
const shadow = new THREE.Mesh(new THREE.PlaneGeometry(1.9, 1.9),
  new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(sh), transparent: true, depthWrite: false }));
shadow.rotation.x = -Math.PI / 2; shadow.position.y = -0.001;
scene.add(shadow);

/* ---------- Remplissage et couleur ---------- */
const state = { level: 0, from: 0, to: 0, t0: 0, dur: 0, cFrom: new THREE.Color(0xD9A441), cTo: new THREE.Color(0xD9A441), color: new THREE.Color(0xD9A441) };
const easeOut = t => 1 - Math.pow(1 - t, 3);
function applyLiquid(){
  const y = BOTTOM + (TOP - BOTTOM) * state.level;
  const on = state.level > 0.01;
  liquid.visible = surface.visible = on;
  clip.constant = y;
  const r = radiusAt(y);
  surface.position.y = y; surface.scale.set(r, r, 1);
  liquidMat.color.copy(state.color);
  liquidMat.emissive.copy(state.color).multiplyScalar(0.22);
  surfMat.color.copy(state.color).lerp(new THREE.Color(0xffffff), 0.18);
}
function setLiquid(color, fill, animate, now){
  const c = new THREE.Color(color || '#D9A441');
  if (!animate || reduceMotion){
    state.level = state.from = state.to = fill; state.dur = 0;
    state.color.copy(c); state.cFrom.copy(c); state.cTo.copy(c);
  } else {
    state.from = 0; state.level = 0; state.to = fill; state.t0 = now; state.dur = 1100;
    state.cFrom.copy(c); state.cTo.copy(c); state.color.copy(c);
  }
  applyLiquid();
}

/* ---------- Rotation : lente au repos, 1:1 au doigt, élan au lâcher ---------- */
const IDLE = reduceMotion ? 0 : 0.35;           // rad/s
let angle = -0.6, vel = IDLE, drag = null, last = 0, running = false;
glass.rotation.x = 0.06;

canvas.addEventListener('pointerdown', e => {
  canvas.setPointerCapture(e.pointerId);
  drag = { x: e.clientX, a: angle, hist: [{ x: e.clientX, t: e.timeStamp }] };
  start();
});
canvas.addEventListener('pointermove', e => {
  if (!drag) return;
  const w = canvas.clientWidth || 300;
  angle = drag.a + (e.clientX - drag.x) / w * Math.PI * 1.4;
  drag.hist.push({ x: e.clientX, t: e.timeStamp }); if (drag.hist.length > 5) drag.hist.shift();
});
const release = () => {
  if (!drag) return;
  const h = drag.hist, a = h[0], b = h[h.length - 1], w = canvas.clientWidth || 300;
  const pxPerMs = (b.x - a.x) / Math.max(1, b.t - a.t);
  vel = pxPerMs * 1000 / w * Math.PI * 1.4;     // l'élan du doigt devient la vitesse de rotation
  drag = null;
};
canvas.addEventListener('pointerup', release);
canvas.addEventListener('pointercancel', release);

/* ---------- Boucle ---------- */
function visible(){
  return canvas.isConnected && !document.hidden && !!canvas.closest('.view.active');
}
function frame(now){
  if (!visible()){ running = false; return; }
  const dt = Math.min(0.05, (now - (last || now)) / 1000); last = now;
  if (!drag){
    vel += (IDLE - vel) * (1 - Math.exp(-dt * 2.2)); // l'élan retombe doucement vers la rotation de repos
    angle += vel * dt;
  }
  glass.rotation.y = angle;
  if (state.dur){
    const t = Math.min(1, (now - state.t0) / state.dur);
    state.level = state.from + (state.to - state.from) * easeOut(t);
    if (t >= 1) state.dur = 0;
    applyLiquid();
  }
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}
function start(){
  if (running || !visible()) return;
  running = true; last = 0;
  requestAnimationFrame(frame);
}
function resize(){
  const p = canvas.parentElement; if (!p) return;
  const w = p.clientWidth, h = p.clientHeight;
  if (!w || !h) return;
  renderer.setSize(w, h, false);
  canvas.style.width = w + 'px'; canvas.style.height = h + 'px';
  camera.aspect = w / h; camera.updateProjectionMatrix();
}
addEventListener('resize', () => { resize(); start(); });
document.addEventListener('visibilitychange', start);
// La vue devient active avec un léger délai (transition) : on relance quand elle l'est.
new MutationObserver(start).observe(document.querySelector('main') || document.body, { subtree: true, attributes: true, attributeFilter: ['class'] });

/* ---------- API ---------- */
window.Glass = {
  attach(el, opts){
    opts = opts || {};
    if (!el) return;
    el.appendChild(canvas);
    resize();
    setLiquid(opts.color, opts.fill == null ? 0.82 : opts.fill, !!opts.animate, performance.now());
    if (!opts.keepAngle){ vel = opts.animate && !reduceMotion ? 3.2 : IDLE; } // petit tour d'entrée quand il se remplit
    renderer.render(scene, camera);
    el.classList.add('ready');
    start();
  }
};
if (window.__glassReq) window.Glass.attach(window.__glassReq.el, window.__glassReq.opts);
