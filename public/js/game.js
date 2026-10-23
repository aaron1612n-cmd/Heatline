// Heatline: plan it, sneak or shoot your way to the money, then outrun the cops.
import { THREE, PAL, createView, buildWorld, makeHuman, poseHuman, makeCar, createFx, makeMark, makeBag, makeCamera, yaw } from './gfx.js';
import { LEVELS } from './levels.js';
import { sfx } from './audio.js';

const $ = id => document.getElementById(id);
const TAU = Math.PI * 2;
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const lerp = (a, b, t) => a + (b - a) * t;
const dist = (ax, ay, bx, by) => Math.hypot(bx - ax, by - ay);
const angDiff = (a, b) => { let d = a - b; while (d > Math.PI) d -= TAU; while (d < -Math.PI) d += TAU; return d; };
const turn = (a, target, rate) => { const d = angDiff(target, a); return a + clamp(d, -rate, rate); };
const store = { get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }, set(k, v) { try { localStorage.setItem(k, v); } catch (e) { } } };
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const money = n => '$' + Math.round(n).toLocaleString('en-US');

// ---------- Tuning ----------
const VIEW_R = 8.5, VIEW_HALF = .62;     // guard sight: flashlight reach and half-angle
const CAM_R = 7.5, CAM_HALF = .42;
const PLAYER_R = .28, GUARD_R = .3;
const MAG = 10;

// ---------- Device ----------
const coarse = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
const lowEnd = coarse || (navigator.hardwareConcurrency || 8) <= 4;
const view = createView($('game'), lowEnd);
const fx = createFx(view);
const ray = new THREE.Raycaster(), ndc = new THREE.Vector2(), aimPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -.9), hitPt = new THREE.Vector3();

// Spotlights for flashlights are pooled so the shader never recompiles mid-game.
const SPOTS = [];
for (let i = 0; i < (lowEnd ? 3 : 5); i++) {
  const s = new THREE.SpotLight(0xfff0d0, 0, VIEW_R + 1, VIEW_HALF * .8, .45, 1.3);
  if (!lowEnd && i < 3) { s.castShadow = true; s.shadow.mapSize.set(512, 512); s.shadow.bias = -.002; s.shadow.camera.near = .3; }
  view.scene.add(s, s.target); SPOTS.push(s);
}
const HEAD = new THREE.SpotLight(0xfff1cf, 0, 16, .55, .5, 1.1);
view.scene.add(HEAD, HEAD.target);
const SIRENS = [];
for (let i = 0; i < (lowEnd ? 1 : 3); i++) { const p = new THREE.PointLight(0xd6312b, 0, 7, 1.5); view.scene.add(p); SIRENS.push(p); }

// ---------- Input ----------
const input = { mode: coarse ? 'touch' : 'keys', keys: new Set(), mouse: { x: 0, y: 0, down: false, used: false, right: false }, stick: { id: null, ox: 0, oy: 0, x: 0, y: 0 },
  fire: false, act: false, actHeld: false, crouchToggle: false, boost: false, brake: false, firePressed: false, actPressed: false };
function setInput(m) {
  if (input.mode === m) return;
  input.mode = m;
  document.body.dataset.input = m;
  refreshLayers();
  if (G?.tut) showTutStep(true);
}
document.body.dataset.input = input.mode;
addEventListener('keydown', e => {
  if (e.repeat) return;
  setInput('keys');
  sfx.unlock();
  input.keys.add(e.code);
  if (e.code === 'Escape' || e.code === 'KeyP') { if (G && G.mode !== 'menu' && !G.over) pause(!G.paused); }
  if (e.code === 'KeyE' || e.code === 'Enter') { input.actPressed = true; }
  if (e.code === 'KeyF') input.firePressed = true;
  if (e.code === 'KeyC') input.crouchToggle = !input.crouchToggle;
  if (e.code === 'KeyR' && G?.player) startReload();
  if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code) && G && G.mode !== 'menu') e.preventDefault();
});
addEventListener('keyup', e => input.keys.delete(e.code));
addEventListener('blur', () => { input.keys.clear(); input.mouse.down = false; });
const cv = $('game');
cv.addEventListener('mousemove', e => { if (e.movementX || e.movementY) { input.mouse.used = true; if (input.mode !== 'keys' && !e.sourceCapabilities?.firesTouchEvents) setInput('keys'); } input.mouse.x = e.clientX; input.mouse.y = e.clientY; });
cv.addEventListener('mousedown', e => {
  if (input.mode === 'touch') return;
  sfx.unlock(); input.mouse.used = true;
  if (e.button === 0) { input.mouse.down = true; input.firePressed = true; }
  if (e.button === 2) input.mouse.right = true;
});
addEventListener('mouseup', e => { if (e.button === 0) input.mouse.down = false; if (e.button === 2) input.mouse.right = false; });
cv.addEventListener('contextmenu', e => e.preventDefault());

// touch: floating stick on the left, buttons on the right
const stickEl = $('stick'), stickKnob = stickEl.querySelector('i');
const stickR = () => Math.min(70, innerWidth * .12 + 20);
$('stickZone').addEventListener('pointerdown', e => {
  if (e.pointerType === 'mouse') return;
  setInput('touch'); sfx.unlock();
  const S = input.stick; S.id = e.pointerId; S.ox = e.clientX; S.oy = e.clientY; S.x = S.y = 0;
  stickEl.style.left = e.clientX + 'px'; stickEl.style.top = e.clientY + 'px'; stickEl.hidden = false; stickKnob.style.transform = '';
  $('stickZone').setPointerCapture(e.pointerId);
});
$('stickZone').addEventListener('pointermove', e => {
  const S = input.stick; if (e.pointerId !== S.id) return;
  let dx = e.clientX - S.ox, dy = e.clientY - S.oy; const r = stickR(), m = Math.hypot(dx, dy);
  if (m > r) { dx *= r / m; dy *= r / m; }
  S.x = dx / r; S.y = dy / r;
  stickKnob.style.transform = `translate(${dx}px,${dy}px)`;
});
const endStick = e => { const S = input.stick; if (e.pointerId !== S.id) return; S.id = null; S.x = S.y = 0; stickEl.hidden = true; };
$('stickZone').addEventListener('pointerup', endStick); $('stickZone').addEventListener('pointercancel', endStick);
function holdBtn(el, on, off) {
  el.addEventListener('pointerdown', e => { e.preventDefault(); setInput('touch'); sfx.unlock(); el.classList.add('on'); el.setPointerCapture(e.pointerId); on(); });
  const up = () => { el.classList.remove('on'); off && off(); };
  el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up);
}
holdBtn($('bFire'), () => { input.fire = true; input.firePressed = true; }, () => { input.fire = false; });
holdBtn($('bAct'), () => { input.act = true; input.actPressed = true; }, () => { input.act = false; });
holdBtn($('bCrouch'), () => { if (G?.mode === 'drive') input.brake = true; else input.crouchToggle = !input.crouchToggle; }, () => { input.brake = false; });
function vibrate(ms) { if (input.mode === 'touch' && navigator.vibrate) try { navigator.vibrate(ms); } catch (e) { } }

// screen-space stick or keys -> world direction. Screen right = world (+x,-y), screen up = world (-x,-y).
function moveInput() {
  let sx = 0, sy = 0;
  if (input.mode === 'touch') { sx = input.stick.x; sy = -input.stick.y; }
  else {
    const k = input.keys;
    sx = (k.has('KeyD') || k.has('ArrowRight') ? 1 : 0) - (k.has('KeyA') || k.has('ArrowLeft') ? 1 : 0);
    sy = (k.has('KeyW') || k.has('ArrowUp') ? 1 : 0) - (k.has('KeyS') || k.has('ArrowDown') ? 1 : 0);
    const m = Math.hypot(sx, sy); if (m > 1) { sx /= m; sy /= m; }
  }
  const m = Math.hypot(sx, sy);
  return { x: (sx - sy) / Math.SQRT2, y: (-sx - sy) / Math.SQRT2, m: Math.min(1, m) };
}
const actHeld = () => input.act || input.keys.has('KeyE') || input.keys.has('Enter');
const fireHeld = () => input.fire || input.mouse.down || input.keys.has('KeyF');
const crouching = () => input.crouchToggle !== (input.keys.has('ShiftLeft') || input.keys.has('ShiftRight'));

// ---------- Game state ----------
let G = null;
const SOLID_FOOT = '#Bklhtc';
function tileAt(x, y) { const ix = Math.floor(x), iy = Math.floor(y); if (iy < 0 || ix < 0 || iy >= G.h || ix >= G.w) return 'B'; return G.grid[iy][ix]; }
function doorAt(x, y) { return G.doorAt[Math.floor(y)]?.[Math.floor(x)]; }
function footSolid(x, y) {
  const c = tileAt(x, y);
  if (SOLID_FOOT.includes(c) || c === 'X') return true;
  if (c === 'w') return !G.winAt[Math.floor(y)][Math.floor(x)].broken;
  if (c === 'd' || c === 'D' || c === 'Q') return !doorAt(x, y).isOpen;
  return false;
}
function sightBlock(x, y, low) {
  const c = tileAt(x, y);
  if (c === '#' || c === 'B') return true;
  if ((c === 'd' || c === 'D' || c === 'Q') && !doorAt(x, y).isOpen) return true;
  if (low && (c === 'k' || c === 'c')) return true;
  return false;
}
function los(ax, ay, bx, by, low) {
  const d = dist(ax, ay, bx, by), n = Math.ceil(d / .2);
  for (let i = 1; i < n; i++) { const t = i / n; if (sightBlock(ax + (bx - ax) * t, ay + (by - ay) * t, low && t > .5)) return false; }
  return true;
}
const OFFS = [[1, 0], [-1, 0], [0, 1], [0, -1], [.7, .7], [.7, -.7], [-.7, .7], [-.7, -.7]];
function hits(x, y, r, solid) { for (const o of OFFS) if (solid(x + o[0] * r, y + o[1] * r)) return true; return false; }
function moveCircle(o, dx, dy, r, solid, opener) {
  const tryOpen = (x, y) => { if (!opener) return; const d = doorAt(x, y); if (d && d.kind === 'd' && !d.isOpen) openDoor(d, o); };
  if (!hits(o.x + dx, o.y, r, solid)) o.x += dx; else { tryOpen(o.x + dx + Math.sign(dx) * r, o.y); }
  if (!hits(o.x, o.y + dy, r, solid)) o.y += dy; else { tryOpen(o.x, o.y + dy + Math.sign(dy) * r); }
}
function openDoor(d, by) {
  if (d.isOpen) return;
  d.isOpen = true;
  // swing away from whoever opened it
  const side = d.horiz ? Math.sign((by?.y ?? d.y) - d.y) || 1 : Math.sign((by?.x ?? d.x) - d.x) || 1;
  d.target = (d.horiz ? -side : side) * Math.PI / 2 * .92;
  sfx.door(d.kind !== 'd');
}

// BFS on the tile grid for guards. Doors are walkable for them: they have keys.
function guardPass(x, y) {
  const c = G.grid[y]?.[x];
  if (c === undefined || SOLID_FOOT.includes(c) || c === 'X') return false;
  if (c === 'w') return G.winAt[y][x].broken;
  return true;
}
function findPath(fx0, fy0, tx, ty) {
  const sx = Math.floor(fx0), sy = Math.floor(fy0), ex = Math.floor(tx), ey = Math.floor(ty);
  if (sx === ex && sy === ey) return [[tx, ty]];
  const W = G.w, prev = new Int32Array(W * G.h).fill(-1), q = [sy * W + sx];
  prev[sy * W + sx] = sy * W + sx;
  let found = false;
  for (let qi = 0; qi < q.length && qi < 4000; qi++) {
    const cur = q[qi], cx = cur % W, cy = (cur / W) | 0;
    if (cx === ex && cy === ey) { found = true; break; }
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
      const nx = cx + dx, ny = cy + dy, ni = ny * W + nx;
      if (nx < 0 || ny < 0 || nx >= W || ny >= G.h || prev[ni] !== -1 || !guardPass(nx, ny)) continue;
      if (dx && dy && (!guardPass(cx + dx, cy) || !guardPass(cx, cy + dy))) continue;
      prev[ni] = cur; q.push(ni);
    }
  }
  if (!found) return null;
  const out = [];
  let cur = ey * W + ex;
  while (prev[cur] !== cur) { out.push([cur % W + .5, ((cur / W) | 0) + .5]); cur = prev[cur]; }
  out.reverse();
  if (out.length) out[out.length - 1] = [tx, ty];
  return out;
}

// ---------- Level loading ----------
const FLOORS = '.mv';
function floorNear(rows, x, y) {
  for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [1, 1]]) { const c = rows[y + dy]?.[x + dx]; if (c && FLOORS.includes(c)) return c; }
  return '.';
}
function load(key, mode = 'play') {
  if (G) unload();
  const L = LEVELS[key];
  const rows = L.map.map(r => [...r]);
  const h = rows.length, w = rows[0].length;
  const lights = [], loot = [], camTiles = [];
  let start = { x: 2.5, y: 2.5 }, vanPos = { x: 4.5, y: 4.5 };
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const c = rows[y][x];
    if (c === 'P') { start = { x: x + .5, y: y + .5 }; rows[y][x] = '_'; }
    else if (c === 'V') { vanPos = { x: x + .5, y: y + .5 }; rows[y][x] = ','; }
    else if (c === 'L') { loot.push({ x: x + .5, y: y + .5 }); rows[y][x] = floorNear(L.map, x, y); }
    else if (c === 'o') { lights.push([x + .5, y + .5]); rows[y][x] = floorNear(L.map, x, y); }
    else if (c === 'C') { camTiles.push([x + .5, y + .5]); rows[y][x] = floorNear(L.map, x, y); }
  }
  const group = new THREE.Group(); view.scene.add(group);
  G = { key, L, mode, w, h, grid: rows, group, t: 0, paused: false, over: false,
    doorAt: rows.map(r => r.map(() => null)), winAt: rows.map(r => r.map(() => null)),
    guards: [], cams: [], loot: [], bodies: [], pickups: [], cops: [], props: [], thrown: [],
    alarm: false, alarmT: 0, stored: 0, kills: 0, kos: 0, shots: 0, expo: 0, hitstop: 0, flash: 0, hurt: 0,
    stats: { start: performance.now() }, ctx: null, hold: 0, tut: null, field: null, fieldT: 0, bustT: 0, sandbox: !!L.sandbox };
  G.world = buildWorld(view, { w, h, grid: rows, lights });
  for (const d of G.world.doors) { d.isOpen = false; G.doorAt[d.ty][d.tx] = d; }
  for (const win of G.world.windows) G.winAt[win.ty][win.tx] = win;
  G.props = G.world.smash;

  // player
  const pm = makeHuman('crook', 7);
  group.add(pm.root);
  const backBags = [makeBag(), makeBag()];
  backBags.forEach((b, i) => { b.scale.setScalar(.8); b.position.set(i ? .12 : -.12, .1 + i * .05, -.26); b.rotation.set(0, Math.PI / 2, i * .3); b.visible = false; pm.torso.add(b); });
  G.player = { x: start.x, y: start.y, a: -Math.PI * .75, aimA: -Math.PI * .75, hp: 100, crouch: false, speed: 0, carry: 0, ammo: MAG, reserve: L.sandbox ? 999 : 30,
    fireCd: 0, reload: 0, busy: null, busyT: 0, target: null, drag: null, hurtT: 9, stepT: 0, recoil: 0, aimHold: 0, model: pm, backBags, lastFire: -9, inVan: false };
  G.checkpoint = { x: start.x, y: start.y };

  // guards
  L.guards.forEach((gd, i) => {
    const m = makeHuman('guard', i + 1);
    group.add(m.root);
    const marks = { sus: makeMark('sus'), alert: makeMark('alert'), radio: makeMark('radio'), ko: makeMark('ko') };
    for (const k in marks) { marks[k].visible = false; group.add(marks[k]); }
    const [x, y] = gd.path[0];
    G.guards.push({ i, x, y, a: gd.face ?? 0, face0: gd.face ?? 0, path: gd.path, wp: gd.path.length > 1 ? 1 : 0, still: !!gd.still, waitBase: gd.wait ?? .5,
      unarmed: !!gd.unarmed, state: 'patrol', sus: 0, hp: 100, down: null, downT: 0, stun: 0, wait: 0, lastSeen: null, lostT: 0, react: 0, radioT: 0, focus: 0,
      fireCd: 0, burst: 0, strafe: 1, strafeT: 0, route: null, routeTo: null, routeT: 0, searchT: 0, seeP: false, speed: 0, model: m, marks, alertFlash: 0, torchOn: true, bodySeen: false, recoil: 0, look: 0 });
  });

  // cameras
  const camSpots = L.camAt || camTiles;
  camSpots.forEach((p, i) => {
    const cfg = L.cams[i] || { a: 0, sweep: .6 };
    const c = makeCamera();
    // mount on the nearest wall
    let mx = p[0], my = p[1];
    for (const [dx, dy] of [[0, -1], [-1, 0], [1, 0], [0, 1]]) if (rows[Math.floor(p[1]) + dy]?.[Math.floor(p[0]) + dx] === '#') { mx += dx * .38; my += dy * .38; break; }
    c.g.position.set(mx, 1.85, my);
    group.add(c.g);
    const cone = makeCone(CAM_R, CAM_HALF, 0xd6312b);
    cone.position.set(mx, .13, my); group.add(cone);
    G.cams.push({ x: mx, y: my, a: cfg.a, a0: cfg.a, sweep: cfg.sweep, t: i * 2.3, sus: 0, dead: false, model: c, cone, tutorial: !!cfg.tutorial });
  });

  // loot
  for (const l of loot) {
    const b = makeBag(); b.position.set(l.x, .1, l.y); b.rotation.y = Math.random() * TAU; group.add(b);
    G.loot.push({ ...l, taken: false, model: b, bob: Math.random() * 6 });
  }

  // van
  const vanA = nearestRoadAngle(vanPos.x, vanPos.y);
  const vm = makeCar('van', false); group.add(vm.root);
  G.van = { x: vanPos.x, y: vanPos.y, a: vanA, vx: 0, vy: 0, w: 0, hp: 100, boost: 1, boosting: false, model: vm, skidT: 0, steer: 0, thr: 0 };

  // objective marker
  G.marker = makeMarker(); group.add(G.marker);
  G.marker.visible = false;
  if (L.tutorial && mode === 'play') G.tut = { step: 0, shown: -1, caughtT: 0 };

  view.size = baseZoom();
  view.resize();
  G.camPos = { x: start.x, y: start.y };
  G.world.follow(start.x, start.y);
  G.world.updateLights(start.x, start.y);
  G.world.cutaway(start.x, start.y, 1);
  return G;
}
function unload() {
  if (!G) return;
  G.world.dispose();
  view.scene.remove(G.group);
  G.group.traverse(o => { if (o.geometry) o.geometry.dispose(); });
  fx.clear();
  SPOTS.forEach(s => s.intensity = 0);
  SIRENS.forEach(s => s.intensity = 0);
  sfx.stopLoops();
  G = null;
}
function nearestRoadAngle(x, y) {
  // vans point along the road they are parked on
  const c = (dx, dy) => { const t = G.grid[Math.floor(y + dy)]?.[Math.floor(x + dx)]; return t === ',' || t === 'X'; };
  return c(2, 0) && c(-2, 0) ? 0 : c(0, 2) && c(0, -2) ? Math.PI / 2 : 0;
}
function makeCone(r, half, color) {
  const shape = new THREE.Shape();
  shape.moveTo(0, 0);
  for (let i = 0; i <= 12; i++) { const a = -half + half * 2 * i / 12; shape.lineTo(Math.cos(a) * r, Math.sin(a) * r); }
  shape.lineTo(0, 0);
  const geo = new THREE.ShapeGeometry(shape); geo.rotateX(Math.PI / 2);
  const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: .12, depthWrite: false }));
  return m;
}
function makeMarker() {
  const g = new THREE.Group();
  const m = new THREE.Mesh(new THREE.OctahedronGeometry(.18, 0), new THREE.MeshBasicMaterial({ color: PAL.sodium }));
  m.scale.y = 1.6; m.position.y = 1.9; g.add(m);
  const ring = new THREE.Mesh(new THREE.RingGeometry(.42, .5, 24).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: PAL.sodium, transparent: true, opacity: .8 }));
  ring.position.y = .14; g.add(ring);
  g.userData = { m, ring };
  return g;
}
function baseZoom() {
  const portrait = innerHeight > innerWidth;
  const small = Math.min(innerWidth, innerHeight) < 560;
  if (G?.mode === 'menu') return portrait ? 20 : 24;
  if (G?.mode === 'drive') return portrait ? 15 : small ? 16 : 19;
  return portrait ? 10.5 : small ? 11 : 14;
}
addEventListener('resize', () => { if (G) { view.size = baseZoom(); view.resize(); } });

// ---------- Light & noise ----------
function exposureAt(x, y) {
  let e = .06;
  for (const s of G.world.sources()) {
    const d = dist(x, y, s.x, s.y);
    if (d > s.r) continue;
    if (!los(s.x, s.y, x, y, false)) continue;
    e += s.i * Math.pow(1 - d / s.r, 1.3) * .95;
  }
  return clamp(e, 0, 1);
}
function noise(x, y, r, loud) {
  for (const g of G.guards) {
    if (g.down || g.state === 'choked') continue;
    const d = dist(g.x, g.y, x, y);
    const through = los(g.x, g.y, x, y, false) ? 1 : .55;
    if (d > r * through) continue;
    if (g.state === 'alert') { if (loud) g.lastSeen = { x, y }; continue; }
    g.sus = Math.max(g.sus, loud ? .85 : .45);
    g.lastSeen = { x, y };
    g.state = 'search'; g.searchT = loud ? 7 : 4; g.route = null;
    g.look = Math.atan2(y - g.y, x - g.x);
  }
}
function raiseAlarm() {
  if (G.alarm) return;
  G.alarm = true; G.alarmT = 0;
  sfx.alarm(true);
  $('alarm').hidden = false;
  for (const t of G.world.tubes) { t.color = PAL.siren; t.mesh.material = t.mesh.material.clone(); t.mesh.material.color.setHex(0xff5a4a); }
  for (const g of G.guards) {
    if (g.down || g.state === 'alert' || g.state === 'choked') continue;
    g.state = 'search'; g.sus = .8; g.lastSeen = { x: G.player.x + (Math.random() - .5) * 4, y: G.player.y + (Math.random() - .5) * 4 }; g.searchT = 12; g.route = null;
  }
}

// ---------- Player ----------
function startReload() {
  const P = G?.player;
  if (!P || P.reload > 0 || P.ammo >= MAG || P.reserve <= 0 || P.inVan) return;
  P.reload = 1.05; sfx.reload();
}
function aimAngle() {
  const P = G.player;
  if (input.mode === 'keys' && input.mouse.used) {
    ndc.set(input.mouse.x / innerWidth * 2 - 1, -(input.mouse.y / innerHeight) * 2 + 1);
    ray.setFromCamera(ndc, view.camera);
    if (ray.ray.intersectPlane(aimPlane, hitPt)) return { a: Math.atan2(hitPt.z - P.y, hitPt.x - P.x), x: hitPt.x, y: hitPt.z, free: true };
  }
  // touch / keys-only: snap to the best threat in front of us
  const t = autoTarget(P.a, input.mode === 'touch' ? 2.6 : .7, 11);
  if (t) return { a: Math.atan2(t.y - P.y, t.x - P.x), x: t.x, y: t.y, target: t };
  return { a: P.a, x: P.x + Math.cos(P.a) * 5, y: P.y + Math.sin(P.a) * 5 };
}
function autoTarget(facing, cone, range) {
  const P = G.player;
  let best = null, bs = 1e9;
  for (const g of G.guards) {
    if (g.down || g.state === 'choked') continue;
    const d = dist(P.x, P.y, g.x, g.y);
    if (d > range) continue;
    const da = Math.abs(angDiff(Math.atan2(g.y - P.y, g.x - P.x), facing));
    if (da > cone) continue;
    if (!los(P.x, P.y, g.x, g.y, false)) continue;
    const s = d + da * 3 - (g.state === 'alert' ? 4 : 0);
    if (s < bs) { bs = s; best = g; }
  }
  for (const c of G.cams) {
    if (c.dead) continue;
    const d = dist(P.x, P.y, c.x, c.y);
    if (d > range) continue;
    const da = Math.abs(angDiff(Math.atan2(c.y - P.y, c.x - P.x), facing));
    if (da > cone || !los(P.x, P.y, c.x, c.y, false)) continue;
    const s = d + da * 3 + 2;
    if (s < bs) { bs = s; best = c; }
  }
  return best;
}
function canTakedown(g) {
  const P = G.player;
  if (g.down || g.state === 'choked') return false;
  const d = dist(P.x, P.y, g.x, g.y);
  if (d > 1.35) return false;
  if (g.stun > 0) return true;
  if (g.state === 'alert') return false;
  const behind = Math.abs(angDiff(Math.atan2(P.y - g.y, P.x - g.x), g.a));
  return behind > 1.75 || (g.state === 'patrol' && g.sus < .3 && behind > 1.2);
}
function findContext() {
  const P = G.player;
  if (P.busy) return null;
  if (P.drag) return { kind: 'drop' };
  for (const g of G.guards) if (canTakedown(g)) return { kind: 'choke', g };
  for (const g of G.guards) if (!g.down && g.state === 'alert' && dist(P.x, P.y, g.x, g.y) < 1.15) return { kind: 'shove', g };
  for (const d of G.world.doors) if (!d.isOpen && d.kind !== 'd' && dist(P.x, P.y, d.x, d.y) < 1.15) return { kind: 'pick', d, time: d.kind === 'Q' ? 3.6 : 1.4 };
  if (P.carry < 2) for (const l of G.loot) if (!l.taken && dist(P.x, P.y, l.x, l.y) < .95) return { kind: 'take', l };
  if (dist(P.x, P.y, G.van.x, G.van.y) < 2.1) return { kind: 'van' };
  for (const b of G.guards) if (b.down && !b.dragged && dist(P.x, P.y, b.x, b.y) < 1.0) return { kind: 'drag', g: b };
  return null;
}
function updatePlayer(dt) {
  const P = G.player;
  P.fireCd -= dt; P.hurtT += dt; P.recoil = Math.max(0, P.recoil - dt * 8);
  if (P.reload > 0) { P.reload -= dt; if (P.reload <= 0) { const n = Math.min(MAG - P.ammo, P.reserve); P.ammo += n; P.reserve -= n; } }
  if (P.hurtT > 4 && P.hp < 100) P.hp = Math.min(100, P.hp + dt * 9);

  // locked into a takedown
  if (P.busy) {
    P.busyT -= dt;
    const g = P.target;
    if (P.busy === 'choke') {
      g.x = P.x + Math.cos(P.a) * .42; g.y = P.y + Math.sin(P.a) * .42; g.a = P.a;
      if (P.busyT < 1.1 && !P.chokeNoise) { P.chokeNoise = true; noise(P.x, P.y, 2.2, false); }
      if (P.busyT <= 0) { knockOut(g, P.a); P.busy = null; P.chokeNoise = false; }
    } else if (P.busy === 'stab') {
      if (P.busyT <= .2 && !g.down) kill(g, P.a, 'knife');
      if (P.busyT <= 0) P.busy = null;
    }
    return;
  }

  const mv = moveInput();
  P.crouch = crouching();
  const aim = aimAngle();
  P.aimA = aim.a; P.aimInfo = aim;
  let spd = (P.crouch ? 1.75 : 3.2) * (1 - P.carry * .12);
  if (P.drag) spd = 1.25;
  if (P.aimHold > 0 && !P.crouch) spd *= .8;
  const vx = mv.x * spd * mv.m, vy = mv.y * spd * mv.m;
  const ox = P.x, oy = P.y;
  moveCircle(P, vx * dt, vy * dt, PLAYER_R, footSolid, true);
  P.speed = dist(ox, oy, P.x, P.y) / dt;
  P.moving = P.speed > .3;
  P.aimHold = Math.max(0, P.aimHold - dt);
  const facingAim = (input.mode === 'keys' && input.mouse.used) || P.aimHold > 0;
  if (facingAim && !P.drag) P.a = turn(P.a, P.aimA, dt * 18);
  else if (mv.m > .15) P.a = turn(P.a, Math.atan2(mv.y, mv.x), dt * 12);
  if (P.moving && !P.crouch) {
    P.stepT -= dt;
    if (P.stepT <= 0) { P.stepT = .34; noise(P.x, P.y, 2.3, false); sfx.step(); }
  }

  // drag a body behind us
  if (P.drag) {
    const b = P.drag, bx = P.x - Math.cos(P.a) * .75, by = P.y - Math.sin(P.a) * .75;
    b.x = lerp(b.x, bx, Math.min(1, dt * 8)); b.y = lerp(b.y, by, Math.min(1, dt * 8));
  }

  // context actions
  G.ctx = findContext();
  const c = G.ctx;
  if (c && c.kind === 'pick') {
    if (actHeld()) { G.hold += dt / c.time; if (Math.random() < dt * 6) sfx.pick(c.d.kind === 'Q'); if (c.d.kind === 'Q' && Math.random() < dt * 2) noise(P.x, P.y, 3.5, false); }
    else G.hold = Math.max(0, G.hold - dt * 2);
    if (G.hold >= 1) { G.hold = 0; openDoor(c.d, P); c.d.kind = 'd'; }
  } else G.hold = 0;
  if (input.actPressed && c) {
    if (c.kind === 'choke') { P.busy = 'choke'; P.busyT = 1.7; P.target = c.g; c.g.state = 'choked'; c.g.route = null; P.a = Math.atan2(c.g.y - P.y, c.g.x - P.x); sfx.grab(); vibrate(30); }
    else if (c.kind === 'shove') { c.g.stun = 1.6; c.g.state = 'alert'; const a = Math.atan2(c.g.y - P.y, c.g.x - P.x); moveCircle(c.g, Math.cos(a) * .5, Math.sin(a) * .5, GUARD_R, footSolid); sfx.punch(); view.shake = .25; G.hitstop = .05; fx.burst('solid', c.g.x, c.g.y, 1.3, 4, 2, 0xcfc6b2, .3, .05); }
    else if (c.kind === 'take') { c.l.taken = true; c.l.model.visible = false; P.carry++; sfx.pickup(); vibrate(20); }
    else if (c.kind === 'van') { enterVan(); }
    else if (c.kind === 'drag') { P.drag = c.g; c.g.dragged = true; sfx.grab(); }
    else if (c.kind === 'drop') { P.drag.dragged = false; P.drag = null; }
  }

  // fire
  if (input.firePressed || (fireHeld() && P.fireCd <= -.25)) tryFire();
  P.backBags.forEach((b, i) => b.visible = P.carry > i);

  // bags fly into the van when you walk up to it
  if (P.carry > 0 && dist(P.x, P.y, G.van.x, G.van.y) < 1.9) {
    for (let i = 0; i < P.carry; i++) {
      const b = makeBag(); b.position.set(P.x, 1, P.y); G.group.add(b);
      G.thrown.push({ m: b, x0: P.x, y0: P.y, t: -i * .15 });
    }
    P.carry = 0; sfx.toss();
  }

  // pickups
  for (const p of G.pickups) if (!p.taken && dist(P.x, P.y, p.x, p.y) < .7) { p.taken = true; p.m.visible = false; P.reserve += p.n; sfx.pickup(); }

  G.expo = lerp(G.expo, exposureAt(P.x, P.y) * (P.crouch ? .75 : 1), Math.min(1, dt * 6));
}
function tryFire() {
  const P = G.player;
  if (P.busy || P.drag || P.fireCd > 0 || P.reload > 0) return;
  // up close behind someone: knife instead of a shot
  const c = G.ctx;
  if (c && c.kind === 'choke') {
    P.busy = 'stab'; P.busyT = .45; P.target = c.g; c.g.state = 'choked'; P.a = Math.atan2(c.g.y - P.y, c.g.x - P.x); sfx.knife(); return;
  }
  if (P.ammo <= 0) { sfx.dry(); P.fireCd = .3; startReload(); return; }
  P.ammo--; P.fireCd = .2; P.lastFire = G.t; P.aimHold = 1.2; P.recoil = 1; G.stats.shots = (G.stats.shots || 0) + 1;
  P.a = P.aimA;
  const spread = (P.moving ? .07 : .025) * (P.crouch ? .6 : 1);
  const a = P.aimA + (Math.random() - .5) * spread;
  const mz = muzzle(P.model);
  shoot(mz.x, mz.y, mz.z, a, 15, 55, 'player');
  sfx.shotQuiet();
  fx.flash(mz.x, mz.y, mz.z, .6, 0xffd9a0);
  fx.burst('glow', mz.x + Math.cos(a) * .1, mz.y + Math.sin(a) * .1, mz.z, 4, 3, 0xffd28a, .06, .05, { dir: a, spread: .6, g: 0, up: 0 });
  fx.spawn('solid', mz.x, mz.y, mz.z, Math.cos(a + 1.6) * 1.5, Math.sin(a + 1.6) * 1.5, 2.5, 1.2, .045, 0xb08a3a, { stick: true }); // brass
  view.kick.set(-Math.cos(a) * .12, -Math.sin(a) * .12);
  view.shake = Math.max(view.shake, .05);
  noise(P.x, P.y, 4.5, false);
  if (P.ammo === 0) startReload();
}
const _v = new THREE.Vector3();
function muzzle(h) { h.muzzle.getWorldPosition(_v); return { x: _v.x, y: _v.z, z: _v.y }; }

// Hitscan with a little travel: walls stop it, glass shatters, flesh bleeds.
function shoot(x, y, z, a, range, dmg, from) {
  const cx = Math.cos(a), cy = Math.sin(a);
  let ex = x + cx * range, ey = y + cy * range, hit = null;
  for (let d = .1; d < range; d += .08) {
    const px = x + cx * d, py = y + cy * d;
    const c = tileAt(px, py);
    if (c === 'w') { const win = G.winAt[Math.floor(py)][Math.floor(px)]; if (!win.broken) breakWindow(win, a); }
    const low = from === 'guard' && G.player.crouch;
    if (sightBlock(px, py, low && dist(px, py, G.player.x, G.player.y) < 1.4)) {
      ex = px - cx * .05; ey = py - cy * .05;
      fx.burst('glow', ex, ey, z, 5, 2.2, 0xffcf8a, .18, .04, { dir: a + Math.PI, spread: 1.6 });
      fx.burst('solid', ex, ey, z, 3, 1.5, 0x8d877a, .5, .05, { dir: a + Math.PI, spread: 1.2 });
      sfx.ricochet(); break;
    }
    if (from === 'player') {
      for (const g of G.guards) {
        if (g.down || dist(px, py, g.x, g.y) > GUARD_R + .05) continue;
        hit = g; break;
      }
      if (!hit) for (const cam of G.cams) if (!cam.dead && dist(px, py, cam.x, cam.y) < .35) { hit = cam; break; }
      if (!hit) for (const p of G.props) if (!p.hit && !p.heavy && dist(px, py, p.x, p.y) < .3) { knockProp(p, cx * 3, cy * 3, 2); }
    } else {
      const P = G.player;
      if (!P.inVan && P.hp > 0 && dist(px, py, P.x, P.y) < PLAYER_R + .04) { hit = P; }
    }
    if (hit) { ex = px; ey = py; break; }
  }
  fx.tracer(x, y, z, ex, ey, hit ? z : z - .2);
  if (!hit) return;
  if (hit === G.player) { hurtPlayer(dmg, a); return; }
  if (hit.model?.eye) { // camera
    hit.dead = true; hit.cone.visible = false; hit.model.eye.material = hit.model.eye.material.clone(); hit.model.eye.material.color.setHex(0x222222);
    hit.model.head.rotation.x = 1.3;
    fx.burst('glow', hit.x, hit.y, 1.8, 14, 3, 0xffd28a, .4, .05);
    fx.burst('solid', hit.x, hit.y, 1.8, 6, 2, 0x9a958a, .8, .06);
    sfx.spark(); view.shake = .1; return;
  }
  // guard hit
  hit.hp -= dmg;
  hit.recoil = 1;
  fx.burst('solid', ex, ey, 1.05, 9, 3.2, PAL.blood, .6, .06, { dir: a, spread: .9, stick: true });
  fx.burst('solid', ex, ey, 1.05, 4, 1.4, 0x7a1010, .5, .05, { dir: a + Math.PI, spread: 1 });
  sfx.hit();
  moveCircle(hit, cx * .22, cy * .22, GUARD_R, footSolid);
  if (hit.hp <= 0) { kill(hit, a, 'shot'); G.hitstop = .07; view.shake = .18; vibrate(40); }
  else {
    G.hitstop = .03;
    if (hit.state !== 'alert' && !hit.unarmed) becomeAlert(hit);
    hit.lastSeen = { x: G.player.x, y: G.player.y };
  }
}
function hurtPlayer(dmg, a) {
  const P = G.player;
  if (G.tut) return;
  P.hp -= dmg; P.hurtT = 0; G.hurt = 1;
  fx.burst('solid', P.x, P.y, 1, 7, 2.4, PAL.blood, .5, .06, { dir: a, spread: 1, stick: true });
  view.shake = Math.max(view.shake, .3); vibrate(60);
  sfx.hurt();
  if (P.hp <= 0) {
    P.hp = 0; P.dead = true; P.downT = 0; P.model.fallDir = 1;
    fx.decal(P.x, P.y, .6);
    setTimeout(() => endGame(false, 'down'), 1400);
  }
}
function breakWindow(win, a) {
  win.broken = true; win.pane.visible = false;
  fx.burst('solid', win.x, win.y, 1.3, 22, 3.5, PAL.glass, 1.2, .05, { dir: a, spread: 1.6, up: 3, stick: true });
  sfx.glass();
  noise(win.x, win.y, 7, true);
}
function kill(g, a, how) {
  g.down = 'dead'; g.downT = 0; g.hp = 0; g.state = 'down';
  g.model.fallDir = Math.abs(angDiff(a, g.a)) < Math.PI / 2 ? -1 : 1;
  g.a = a + (g.model.fallDir < 0 ? 0 : Math.PI);
  G.kills++;
  fx.decal(g.x + Math.cos(a) * .2, g.y + Math.sin(a) * .2, .55 + Math.random() * .2);
  if (how === 'knife') fx.burst('solid', g.x, g.y, 1.2, 12, 2.6, PAL.blood, .6, .06, { stick: true });
  dropStuff(g);
  if (G.tut && G.tut.step === 2) G.tut.killed = true;
}
function knockOut(g, a) {
  g.down = 'ko'; g.downT = 0; g.state = 'down';
  g.model.fallDir = -1; g.a = a;
  G.kos++;
  sfx.thud(); view.shake = .12; vibrate(25);
  dropStuff(g);
}
function dropStuff(g) {
  if (g.unarmed) return;
  const m = new THREE.Group();
  const mag = new THREE.Mesh(new THREE.BoxGeometry(.12, .05, .2), new THREE.MeshLambertMaterial({ color: 0x2a2a2a }));
  const band = new THREE.Mesh(new THREE.BoxGeometry(.13, .055, .05), new THREE.MeshBasicMaterial({ color: PAL.sodium }));
  m.add(mag, band); m.position.set(g.x + .4, .14, g.y + .2); G.group.add(m);
  G.pickups.push({ x: g.x + .4, y: g.y + .2, n: 8, m, taken: false });
}

// ---------- Guards ----------
function becomeAlert(g) {
  if (g.unarmed) { g.state = 'alert'; return; }
  const was = g.state;
  g.state = 'alert'; g.sus = 1; g.react = was === 'alert' ? 0 : .5; g.focus = 0; g.alertFlash = 1.4; g.route = null;
  if (!G.alarm && g.radioT === 0) g.radioT = .001;
  sfx.spotted();
}
function goTo(g, tx, ty, speed, dt) {
  if (!g.route || !g.routeTo || dist(g.routeTo[0], g.routeTo[1], tx, ty) > .8 || g.routeT <= 0) {
    g.route = findPath(g.x, g.y, tx, ty) || [[tx, ty]]; g.routeTo = [tx, ty]; g.routeT = 1.2;
  }
  g.routeT -= dt;
  let [nx, ny] = g.route[0];
  if (dist(g.x, g.y, nx, ny) < .25 && g.route.length > 1) { g.route.shift(); [nx, ny] = g.route[0]; }
  const d = dist(g.x, g.y, nx, ny);
  if (d < .08) return true;
  const a = Math.atan2(ny - g.y, nx - g.x), s = Math.min(d, speed * dt);
  moveCircle(g, Math.cos(a) * s, Math.sin(a) * s, GUARD_R, (x, y) => { const c = tileAt(x, y); return SOLID_FOOT.includes(c) || c === 'X' || (c === 'w' && !G.winAt[Math.floor(y)][Math.floor(x)].broken); });
  const door = doorAt(g.x + Math.cos(a) * .5, g.y + Math.sin(a) * .5); if (door && !door.isOpen) openDoor(door, g);
  g.a = turn(g.a, a, dt * 7);
  return g.route.length <= 1 && d < .3;
}
function guardSees(g) {
  const P = G.player;
  if (P.inVan || P.dead) return false;
  const d = dist(g.x, g.y, P.x, P.y);
  const range = (g.state === 'alert' ? 13 : VIEW_R) * (G.alarm ? 1.15 : 1);
  if (d > range) return false;
  const da = Math.abs(angDiff(Math.atan2(P.y - g.y, P.x - g.x), g.a));
  const sense = d < 1.3 && !P.crouch && P.moving;
  if (da > (g.state === 'alert' ? 1.3 : VIEW_HALF) && !sense) return false;
  return los(g.x, g.y, P.x, P.y, P.crouch);
}
function updateGuard(g, dt) {
  const P = G.player;
  g.alertFlash = Math.max(0, g.alertFlash - dt);
  g.recoil = Math.max(0, g.recoil - dt * 6);
  if (g.down) {
    g.downT += dt;
    if (G.sandbox && g.downT > 25 && dist(g.x, g.y, G.player.x, G.player.y) > 9) respawn(g);
    return;
  }
  if (g.state === 'choked') { g.speed = 0; return; }
  const ox = g.x, oy = g.y;
  if (g.stun > 0) { g.stun -= dt; g.speed = 0; g.seeP = false; return; }
  const seeP = guardSees(g);
  g.seeP = seeP;
  const d = dist(g.x, g.y, P.x, P.y);

  // bodies give the game away
  if (!g.bodySeen && g.state !== 'alert') for (const b of G.guards) {
    if (!b.down || b === g || b.dragged) continue;
    const db = dist(g.x, g.y, b.x, b.y);
    if (db < 6.5 && Math.abs(angDiff(Math.atan2(b.y - g.y, b.x - g.x), g.a)) < VIEW_HALF && los(g.x, g.y, b.x, b.y, false)) {
      g.bodySeen = true; g.state = 'search'; g.sus = .9; g.lastSeen = { x: b.x, y: b.y }; g.searchT = 8; g.route = null;
      if (!G.alarm && !g.unarmed) g.radioT = .001;
      g.alertFlash = 1; sfx.spotted();
    }
  }

  if (g.state !== 'alert') {
    if (seeP) {
      const rate = (2.0 * (1 - d / VIEW_R) + .35) * (P.crouch ? .55 : 1) * (.3 + 1.2 * G.expo) * (G.alarm ? 1.7 : 1) * (d < 2.2 ? 3 : 1) * (g.state === 'search' ? 1.4 : 1);
      g.sus = Math.min(1, g.sus + rate * dt);
      g.lastSeen = { x: P.x, y: P.y };
      if (g.state === 'patrol' && g.sus > .12) { g.state = 'sus'; g.route = null; }
      if (g.sus >= 1) {
        if (G.tut) { tutCaught(); return; }
        becomeAlert(g);
      }
    } else if (g.state === 'sus') {
      g.sus = Math.max(0, g.sus - dt * .3);
      if (g.sus < .3 && g.lastSeen) { g.state = 'search'; g.searchT = 4; g.route = null; }
      else if (g.sus <= 0) g.state = 'patrol';
    }
  }

  if (g.radioT > 0 && !G.alarm) {
    g.radioT += dt;
    if (g.radioT > 3.4) { g.radioT = 0; raiseAlarm(); }
  }

  switch (g.state) {
    case 'patrol': {
      if (g.still) {
        g.wait += dt;
        g.a = turn(g.a, g.face0 + Math.sin(g.wait * .5) * .55, dt * 2);
        const [hx, hy] = g.path[0];
        if (dist(g.x, g.y, hx, hy) > .2) goTo(g, hx, hy, 1.5, dt);
        break;
      }
      if (g.wait > 0) { g.wait -= dt; g.a = turn(g.a, g.look, dt * 3); break; }
      const [tx, ty] = g.path[g.wp];
      if (goTo(g, tx, ty, 1.45, dt)) {
        g.wp = (g.wp + 1) % g.path.length; g.wait = g.waitBase;
        const [nx, ny] = g.path[g.wp]; g.look = Math.atan2(ny - g.y, nx - g.x);
      }
      break;
    }
    case 'sus': {
      if (g.lastSeen) g.a = turn(g.a, Math.atan2(g.lastSeen.y - g.y, g.lastSeen.x - g.x), dt * 4);
      break;
    }
    case 'search': {
      if (g.lastSeen && dist(g.x, g.y, g.lastSeen.x, g.lastSeen.y) > .6) {
        if (goTo(g, g.lastSeen.x, g.lastSeen.y, G.alarm ? 2.4 : 1.9, dt)) g.lastSeen = null;
      } else {
        g.lastSeen = null;
        g.searchT -= dt; g.wait += dt;
        g.a += Math.sin(g.wait * 1.7) * dt * 2.2;
        if (g.searchT <= 0) { g.state = 'patrol'; g.sus = 0; g.route = null; g.wait = 0; g.look = g.a; }
      }
      break;
    }
    case 'alert': {
      if (g.unarmed) { // training guard just stares
        g.a = turn(g.a, Math.atan2(P.y - g.y, P.x - g.x), dt * 5); break;
      }
      if (seeP) { g.lastSeen = { x: P.x, y: P.y }; g.lostT = 0; g.focus = Math.min(1, g.focus + dt * .55); }
      else { g.lostT += dt; g.focus = Math.max(0, g.focus - dt * .5); }
      if (seeP) {
        g.a = turn(g.a, Math.atan2(P.y - g.y, P.x - g.x), dt * 6);
        // keep a fighting distance and side-step
        g.strafeT -= dt; if (g.strafeT <= 0) { g.strafeT = .8 + Math.random(); g.strafe = Math.random() < .5 ? -1 : 1; }
        let mx = 0, my = 0;
        const pa = Math.atan2(P.y - g.y, P.x - g.x);
        if (d > 7.5) { mx += Math.cos(pa); my += Math.sin(pa); }
        else if (d < 2.5) { mx -= Math.cos(pa) * .8; my -= Math.sin(pa) * .8; }
        mx += Math.cos(pa + Math.PI / 2) * g.strafe * .6; my += Math.sin(pa + Math.PI / 2) * g.strafe * .6;
        moveCircle(g, mx * 1.4 * dt, my * 1.4 * dt, GUARD_R, footSolid, true);
        g.react -= dt;
        g.fireCd -= dt;
        if (g.react <= 0 && g.fireCd <= 0) {
          if (g.burst <= 0) g.burst = 3;
          guardFire(g);
          g.burst--;
          g.fireCd = g.burst > 0 ? .16 : .75 + Math.random() * .5;
        }
      } else if (g.lastSeen) {
        if (goTo(g, g.lastSeen.x, g.lastSeen.y, 2.7, dt) && g.lostT > 2.5) { g.state = 'search'; g.searchT = 6; g.sus = .8; g.lastSeen = null; }
      } else if (g.lostT > 2) { g.state = 'search'; g.searchT = 6; g.sus = .8; }
      break;
    }
  }
  g.speed = dist(ox, oy, g.x, g.y) / Math.max(dt, 1e-4);
}
function respawn(g) {
  const [x, y] = g.path[0];
  Object.assign(g, { x, y, a: g.face0, hp: 100, down: null, downT: 0, state: 'patrol', sus: 0, radioT: 0, stun: 0, route: null, bodySeen: false, dragged: false, wp: g.path.length > 1 ? 1 : 0 });
  g.model.hips.rotation.set(0, 0, 0);
}
function guardFire(g) {
  const P = G.player;
  const mz = muzzle(g.model);
  const spread = lerp(.3, .07, g.focus) + (P.moving ? .06 : 0) + (P.crouch ? .03 : 0);
  const a = Math.atan2(P.y - mz.y, P.x - mz.x) + (Math.random() - .5) * spread * 2;
  shoot(mz.x, mz.y, mz.z, a, 16, 11 + Math.random() * 6, 'guard');
  g.recoil = 1;
  fx.flash(mz.x, mz.y, mz.z, 1, 0xffc070);
  fx.burst('glow', mz.x, mz.y, mz.z, 5, 3.5, 0xffd28a, .07, .06, { dir: a, spread: .7, g: 0, up: 0 });
  fx.spawn('solid', mz.x, mz.y, mz.z, Math.cos(a + 1.6) * 1.5, Math.sin(a + 1.6) * 1.5, 2.5, 1.2, .045, 0xb08a3a, { stick: true });
  sfx.shotLoud(dist(P.x, P.y, g.x, g.y));
  view.shake = Math.max(view.shake, .06);
  noise(g.x, g.y, 11, true);
}
function updateCams(dt) {
  const P = G.player;
  for (const c of G.cams) {
    if (c.dead) continue;
    c.t += dt;
    c.a = c.a0 + Math.sin(c.t * .6) * c.sweep;
    c.model.head.rotation.y = yaw(c.a) - c.model.g.rotation.y;
    c.cone.rotation.y = -c.a;
    let sees = false;
    if (!P.inVan && !P.dead) {
      const d = dist(c.x, c.y, P.x, P.y);
      if (d < CAM_R && Math.abs(angDiff(Math.atan2(P.y - c.y, P.x - c.x), c.a)) < CAM_HALF && los(c.x, c.y, P.x, P.y, P.crouch)) sees = true;
      if (sees) { c.sus += dt * (1.1 * (1 - d / CAM_R) + .5) * (.5 + G.expo); c.a0 = turn(c.a0, Math.atan2(P.y - c.y, P.x - c.x), dt * .8); }
      else c.sus = Math.max(0, c.sus - dt * .4);
    }
    c.cone.material.opacity = .1 + c.sus * .25;
    c.cone.material.color.setHex(c.sus > .02 ? PAL.siren : 0x8a2a24);
    if (c.sus >= 1) {
      c.sus = 0;
      if (G.tut) tutCaught();
      else raiseAlarm();
    }
  }
}

// ---------- Van & drive ----------
function enterVan() {
  const P = G.player;
  if (P.drag) { P.drag.dragged = false; P.drag = null; }
  P.inVan = true; P.model.root.visible = false;
  G.stored += P.carry; P.carry = 0;
  G.mode = 'drive';
  view.size = baseZoom(); view.resize();
  sfx.door(true); sfx.engine(true);
  // police
  const n = G.tut ? 0 : G.L.police + (G.alarm ? 2 : 0) + (G.kills >= 3 ? 1 : 0);
  spawnCops(n);
  refreshLayers();
}
function driveable(x, y) { const c = tileAt(x, y); return c === ',' || c === '_' || c === 'X' || c === 'l' || c === 'h' || c === 't' || c === 'c'; }
function vanSolid(x, y) {
  if (x < 0 || y < 0 || x >= G.w || y >= G.h) return G.grid[clamp(Math.floor(y), 0, G.h - 1)][clamp(Math.floor(x), 0, G.w - 1)] !== 'X';
  const c = tileAt(x, y); return c === '#' || c === 'B' || c === 'k' || c === 'w' || c === 'd' || c === 'D' || c === 'Q';
}
function spawnCops(n) {
  // some cops sit across the exits as roadblocks, the rest come hunting
  const exits = []; for (let y = 0; y < G.h; y++) for (let x = 0; x < G.w; x++) if (G.grid[y][x] === 'X') exits.push([x + .5, y + .5]);
  const spots = [], blocks = [];
  for (let y = 1; y < G.h - 1; y++) for (let x = 1; x < G.w - 1; x++) {
    if (G.grid[y][x] !== ',') continue;
    const d = dist(x + .5, y + .5, G.van.x, G.van.y);
    const de = Math.min(...exits.map(e => dist(e[0], e[1], x + .5, y + .5)));
    if (de > 3 && de < 7 && d > 14) blocks.push([x + .5, y + .5]);
    else if (d > 13 && d < 30 && de > 8) spots.push([x + .5, y + .5]);
  }
  spots.sort(() => Math.random() - .5); blocks.sort(() => Math.random() - .5);
  for (let i = 0; i < n; i++) {
    const roadblock = i % 3 === 1 && blocks.length;
    const pos = roadblock ? blocks.pop() : spots.pop();
    if (!pos) break;
    const [x, y] = pos;
    const m = makeCar(0x1d2330, true); G.group.add(m.root);
    G.cops.push({ x, y, a: roadblock ? Math.random() * TAU : Math.atan2(G.van.y - y, G.van.x - x), vx: 0, vy: 0, w: 0, hp: 100, model: m, stuckT: 0, revT: 0,
      delay: roadblock ? 99 : 1.2 + i * 1.3, roadblock: !!roadblock, dead: false, smokeT: 0, skidT: 0, steer: 0, thr: 0 });
  }
  sfx.siren(G.cops.length > 0);
}
function carStep(c, thr, steer, brake, boost, dt, maxV) {
  const fxv = Math.cos(c.a), fyv = Math.sin(c.a);
  let vF = c.vx * fxv + c.vy * fyv, vR = -c.vx * fyv + c.vy * fxv;
  const acc = thr > 0 ? 11 : 7;
  vF += thr * acc * dt + (boost ? 16 * dt : 0);
  const top = boost ? maxV * 1.55 : maxV;
  if (vF > top) vF = lerp(vF, top, Math.min(1, dt * 3));
  if (vF < -maxV * .45) vF = -maxV * .45;
  vF *= 1 - (thr === 0 ? 1.3 : .25) * dt;
  const grip = brake ? 1.4 : 7.5;
  vR *= Math.exp(-grip * dt);
  const steerAmt = clamp(vF / 3.2, -1, 1);
  c.w = lerp(c.w, steer * 2.6 * steerAmt * (brake ? 1.35 : 1), Math.min(1, dt * 10));
  c.a += c.w * dt;
  c.vx = vF * fxv - vR * fyv; c.vy = vF * fyv + vR * fxv;
  c.vF = vF; c.vR = vR;
}
// three circles along the car body push it out of buildings
function carCollide(c, len) {
  let impact = 0;
  for (const off of [-len * .32, 0, len * .32]) {
    const px = c.x + Math.cos(c.a) * off, py = c.y + Math.sin(c.a) * off, r = .55;
    for (let ty = Math.floor(py - r); ty <= Math.floor(py + r); ty++) for (let tx = Math.floor(px - r); tx <= Math.floor(px + r); tx++) {
      if (!vanSolid(tx + .5, ty + .5)) continue;
      const nx = clamp(px, tx, tx + 1), ny = clamp(py, ty, ty + 1);
      let dx = px - nx, dy = py - ny, dd = Math.hypot(dx, dy);
      if (dd >= r) continue;
      if (dd < 1e-4) { dx = px - (tx + .5); dy = py - (ty + .5); dd = Math.hypot(dx, dy) || 1; }
      const nX = dx / dd, nY = dy / dd, push = r - dd;
      c.x += nX * push; c.y += nY * push;
      const vn = c.vx * nX + c.vy * nY;
      if (vn < 0) { c.vx -= 1.3 * vn * nX; c.vy -= 1.3 * vn * nY; impact = Math.max(impact, -vn); c.hitX = nx; c.hitY = ny; }
    }
  }
  return impact;
}
function crashFx(x, y, power) {
  fx.burst('glow', x, y, .5, Math.min(24, 6 + power * 2), 3 + power * .4, 0xffc070, .35, .05, { up: 3 });
  fx.burst('solid', x, y, .5, Math.min(10, 2 + power), 2.5, 0x3a3d40, .9, .07, { up: 3 });
  sfx.crash(power);
  view.shake = Math.max(view.shake, Math.min(.6, power * .05));
  vibrate(Math.min(80, power * 8));
}
function knockProp(p, vx, vy, up) {
  if (p.hit) return;
  p.hit = true; p.vx = vx; p.vy = vy; p.vz = up; p.spin = (Math.random() - .5) * 14;
  G.grid[Math.floor(p.y)][Math.floor(p.x)] = tileAt(p.x, p.y) === 'c' ? ',' : '_';
  if (p.kind === 'lamp') { p.light.i = 0; p.obj.children[3].visible = false; p.fall = 0; p.fallA = Math.atan2(vy, vx); p.vx *= .1; p.vy *= .1; p.vz = 0; }
  if (p.kind === 'hydrant') p.water = 5;
  sfx.clang();
}
function updateProps(dt) {
  for (const p of G.props) {
    if (p.water > 0) {
      p.water -= dt;
      for (let i = 0; i < 2; i++) fx.spawn('solid', p.x0 ?? p.x, p.y0 ?? p.y, .4, (Math.random() - .5) * 1.2, (Math.random() - .5) * 1.2, 5 + Math.random() * 2, .9, .07, 0x9fb8c4);
    }
    if (!p.hit || p.rest) continue;
    if (p.x0 === undefined) { p.x0 = p.x; p.y0 = p.y; }
    if (p.kind === 'lamp') {
      // poles topple over instead of flying
      p.fall = Math.min(Math.PI / 2, p.fall + dt * (1 + p.fall * 5));
      if (p.baseY === undefined) p.baseY = p.obj.rotation.y;
      p.obj.rotation.set(0, p.baseY, 0);
      p.obj.rotateOnWorldAxis(new THREE.Vector3(-Math.sin(p.fallA), 0, Math.cos(p.fallA)).normalize(), -p.fall);
      if (p.fall >= Math.PI / 2) { p.rest = true; view.shake = Math.max(view.shake, .15); fx.burst('glow', p.x + Math.cos(p.fallA) * 3, p.y + Math.sin(p.fallA) * 3, .2, 10, 3, 0xffd08a, .4, .05); }
      continue;
    }
    p.vz -= 14 * dt;
    p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
    if (p.z < .1) { p.z = .1; p.vz *= -.35; p.vx *= .7; p.vy *= .7; p.spin *= .6; if (Math.abs(p.vz) < .5 && Math.hypot(p.vx, p.vy) < .3) p.rest = true; }
    p.obj.position.set(p.x, p.heavy ? 0 : p.z, p.y);
    if (p.heavy) { p.obj.rotation.y += p.spin * dt * .3; }
    else { p.obj.rotation.x += p.spin * dt; p.obj.rotation.z += p.spin * dt * .6; }
  }
}
function updateDrive(dt) {
  const V = G.van;
  // input
  let thr = 0, steer = 0, brake = false, boost = false;
  if (input.mode === 'touch') {
    const S = input.stick, m = Math.min(1, Math.hypot(S.x, S.y));
    if (m > .2) {
      const sx = S.x, sy = -S.y;
      const want = Math.atan2((-sx - sy), (sx - sy));
      const da = angDiff(want, V.a);
      if (Math.abs(da) > 2.4 && Math.abs(V.vF || 0) < 3) { thr = -m; steer = -Math.sign(da); }
      else { thr = m; steer = clamp(da * 2, -1, 1); }
    }
    brake = input.brake; boost = input.fire;
  } else {
    const k = input.keys;
    thr = (k.has('KeyW') || k.has('ArrowUp') ? 1 : 0) - (k.has('KeyS') || k.has('ArrowDown') ? 1 : 0);
    steer = (k.has('KeyD') || k.has('ArrowRight') ? 1 : 0) - (k.has('KeyA') || k.has('ArrowLeft') ? 1 : 0);
    brake = k.has('ShiftLeft') || k.has('ShiftRight');
    boost = k.has('Space') || input.mouse.down;
  }
  V.boosting = boost && V.boost > .05;
  V.boost = V.boosting ? Math.max(0, V.boost - dt * .45) : Math.min(1, V.boost + dt * .12);
  carStep(V, thr, steer, brake, V.boosting, dt, 9.5);
  V.x += V.vx * dt; V.y += V.vy * dt;
  const imp = carCollide(V, 3);
  if (imp > 2.2) { crashFx(V.hitX, V.hitY, imp); V.hp -= imp * 1.6; }
  const spd = Math.hypot(V.vx, V.vy);
  // run things over
  for (const p of G.props) if (!p.hit && dist(V.x + Math.cos(V.a) * .9, V.y + Math.sin(V.a) * .9, p.x, p.y) < .5 + p.r && spd > 1.5) {
    knockProp(p, V.vx * (p.heavy ? .6 : 1.3) + (Math.random() - .5) * 2, V.vy * (p.heavy ? .6 : 1.3) + (Math.random() - .5) * 2, p.heavy ? 0 : 3 + spd * .3);
    fx.burst('glow', p.x, p.y, .4, 8, 3, 0xffc070, .25, .05);
    if (p.heavy) { V.vx *= .6; V.vy *= .6; V.hp -= 6; view.shake = .3; }
    else { V.vx *= .93; V.vy *= .93; view.shake = Math.max(view.shake, .12); }
  }
  for (const g of G.guards) if (!g.down && dist(V.x, V.y, g.x, g.y) < .9 && spd > 3) { kill(g, Math.atan2(V.vy, V.vx), 'car'); fx.burst('solid', g.x, g.y, .8, 14, 4, PAL.blood, .7, .07, { stick: true }); view.shake = .3; sfx.thud(); }
  // juice: skids, smoke, boost flame
  V.skidT -= dt;
  const sliding = Math.abs(V.vR || 0) > 2.2 || (brake && spd > 3);
  if (sliding && V.skidT <= 0) {
    V.skidT = .025;
    for (const s of [-.45, .45]) {
      const bx = V.x - Math.cos(V.a) * .85 - Math.sin(V.a) * s, by = V.y - Math.sin(V.a) * .85 + Math.cos(V.a) * s;
      fx.skid(bx, by, V.a);
      if (Math.random() < .5) fx.spawn('smoke', bx, by, .2, (Math.random() - .5), (Math.random() - .5), .6, .9, .25, 0x9a9690, { g: -.4, grow: 2.2, drag: 2 });
    }
    sfx.skid(true);
  } else if (!sliding) sfx.skid(false);
  if (V.boosting) {
    const bx = V.x - Math.cos(V.a) * 1.35, by = V.y - Math.sin(V.a) * 1.35;
    for (let i = 0; i < 3; i++) fx.spawn('glow', bx, by, .35, -Math.cos(V.a) * 4 + (Math.random() - .5) * 2, -Math.sin(V.a) * 4 + (Math.random() - .5) * 2, .3, .18, .12, i ? PAL.sodium : 0xfff0c0, { g: 0 });
    view.shake = Math.max(view.shake, .04);
  }
  if (V.hp < 40 && Math.random() < dt * (60 - V.hp) * .3) fx.spawn('smoke', V.x + Math.cos(V.a) * 1.1, V.y + Math.sin(V.a) * 1.1, 1, 0, 0, 1, 1.4, .3, V.hp < 20 ? 0x222222 : 0x777777, { g: -1, grow: 3, drag: 1 });
  sfx.engineSpeed(spd / 14, V.boosting);

  // police
  G.fieldT -= dt;
  if (G.fieldT <= 0) { G.fieldT = .35; G.field = streetField(V.x, V.y); }
  for (const c of G.cops) updateCop(c, dt);
  // cars bump each other
  const cars = [V, ...G.cops];
  for (let i = 0; i < cars.length; i++) for (let j = i + 1; j < cars.length; j++) {
    const A = cars[i], B = cars[j];
    const d = dist(A.x, A.y, B.x, B.y);
    if (d > 1.6 || d < 1e-3) continue;
    const nx = (B.x - A.x) / d, ny = (B.y - A.y) / d, push = (1.6 - d) / 2;
    A.x -= nx * push; A.y -= ny * push; B.x += nx * push; B.y += ny * push;
    const rv = (B.vx - A.vx) * nx + (B.vy - A.vy) * ny;
    if (rv < 0) {
      const j2 = -rv * .9;
      A.vx -= j2 * nx * .5; A.vy -= j2 * ny * .5; B.vx += j2 * nx * .5; B.vy += j2 * ny * .5;
      const power = -rv;
      if (power > 2) {
        crashFx((A.x + B.x) / 2, (A.y + B.y) / 2, power);
        // whoever hits harder wins; boosting into a cop is a takedown
        const aDrive = A.vx * nx + A.vy * ny, bDrive = -(B.vx * nx + B.vy * ny);
        const dmgB = power * (aDrive > bDrive ? 9 : 4) * (A === V && V.boosting ? 2.4 : 1);
        const dmgA = power * (bDrive > aDrive ? 7 : 3) * (A === V ? .45 : 1);
        if (!A.dead) A.hp -= dmgA; if (!B.dead) B.hp -= dmgB;
        if (A === V) G.hitstop = Math.min(.08, power * .008);
      }
    }
  }
  for (const c of G.cops) if (!c.dead && c.hp <= 0) wreck(c);
  // sirens: pooled lights ride the nearest cops
  const live = G.cops.filter(c => !c.dead).sort((a, b) => dist(a.x, a.y, V.x, V.y) - dist(b.x, b.y, V.x, V.y));
  SIRENS.forEach((s, i) => {
    const c = live[i];
    if (!c) { s.intensity = 0; return; }
    const red = Math.floor(G.t * 6 + i) % 2 === 0;
    s.color.setHex(red ? 0xd6312b : 0x2a5bd7); s.intensity = 9; s.position.set(c.x, 1.6, c.y);
  });
  for (const c of G.cops) if (!c.dead) { const bar = c.model.root.userData.bar; const on = Math.floor(G.t * 6) % 2; bar[0].visible = !!on; bar[1].visible = !on; }
  sfx.sirenNear(live.length ? dist(live[0].x, live[0].y, V.x, V.y) : 99);

  // busted: boxed in by police
  const near = live.some(c => dist(c.x, c.y, V.x, V.y) < 2.4 && Math.hypot(c.vx, c.vy) < 2.5);
  if (near && spd < 1.2) G.bustT += dt; else G.bustT = Math.max(0, G.bustT - dt * 2);
  if (G.bustT > 2.6 || V.hp <= 0) { if (V.hp <= 0) { wreck(V); } endGame(false, V.hp <= 0 ? 'wrecked' : 'busted'); return; }
  const nose = [V.x + Math.cos(V.a) * 1.2, V.y + Math.sin(V.a) * 1.2];
  if (tileAt(V.x, V.y) === 'X' || tileAt(nose[0], nose[1]) === 'X' || V.x < 0 || V.y < 0 || V.x >= G.w || V.y >= G.h) endGame(true, 'escaped');
}
function streetField(vx, vy) {
  const W = G.w, H = G.h, f = new Float32Array(W * H).fill(1e9);
  const sx = clamp(Math.floor(vx), 0, W - 1), sy = clamp(Math.floor(vy), 0, H - 1);
  const q = [sy * W + sx]; f[q[0]] = 0;
  for (let qi = 0; qi < q.length; qi++) {
    const cur = q[qi], cx = cur % W, cy = (cur / W) | 0;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = cx + dx, ny = cy + dy, ni = ny * W + nx;
      if (nx < 0 || ny < 0 || nx >= W || ny >= H || f[ni] < 1e9 || !driveable(nx + .5, ny + .5)) continue;
      f[ni] = f[cur] + 1; q.push(ni);
    }
  }
  return f;
}
function updateCop(c, dt) {
  if (c.dead) {
    c.smokeT -= dt;
    if (c.smokeT <= 0) { c.smokeT = .12; fx.spawn('smoke', c.x, c.y, 1, (Math.random() - .5) * .4, (Math.random() - .5) * .4, 1.2, 2.2, .35, 0x1a1a1a, { g: -1.2, grow: 3, drag: 1 }); if (Math.random() < .5) fx.spawn('glow', c.x + (Math.random() - .5) * .8, c.y + (Math.random() - .5) * .8, .9, 0, 0, 1.5, .4, .14, Math.random() < .5 ? 0xff8a2a : PAL.sodium, { g: -1 }); }
    c.vx *= 1 - dt * 2; c.vy *= 1 - dt * 2; c.x += c.vx * dt; c.y += c.vy * dt; carCollide(c, 2.2);
    return;
  }
  const V = G.van;
  c.delay -= dt;
  if (c.roadblock && c.delay > 0 && dist(c.x, c.y, V.x, V.y) < 11) c.delay = 0;
  let thr = 0, steer = 0;
  if (c.delay <= 0) {
    let tx = V.x + V.vx * .35, ty = V.y + V.vy * .35;
    if (!losCar(c.x, c.y, V.x, V.y) && G.field) {
      // walk downhill on the distance field
      const W = G.w, cx = Math.floor(c.x), cy = Math.floor(c.y);
      let best = G.field[cy * W + cx] ?? 1e9, bx = cx, by = cy;
      for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
        const v = G.field[(cy + dy) * W + (cx + dx)];
        if (v !== undefined && v < best) { best = v; bx = cx + dx; by = cy + dy; }
      }
      tx = bx + .5; ty = by + .5;
    }
    const want = Math.atan2(ty - c.y, tx - c.x), da = angDiff(want, c.a);
    if (c.revT > 0) { c.revT -= dt; thr = -1; steer = -Math.sign(da); }
    else { thr = Math.abs(da) > 1.9 ? .4 : 1; steer = clamp(da * 2.2, -1, 1); }
    const spd = Math.hypot(c.vx, c.vy);
    if (spd < .6 && c.delay < -1) c.stuckT += dt; else c.stuckT = 0;
    if (c.stuckT > 1) { c.stuckT = 0; c.revT = .9; }
  }
  carStep(c, thr, steer, false, false, dt, 8.6);
  c.x += c.vx * dt; c.y += c.vy * dt;
  const imp = carCollide(c, 2.2);
  if (imp > 3) { crashFx(c.hitX, c.hitY, imp * .6); c.hp -= imp * 2.5; }
  if (Math.abs(c.vR || 0) > 2.4) { c.skidT -= dt; if (c.skidT <= 0) { c.skidT = .03; fx.skid(c.x - Math.cos(c.a) * .7, c.y - Math.sin(c.a) * .7, c.a); } }
  for (const p of G.props) if (!p.hit && dist(c.x, c.y, p.x, p.y) < .6 + p.r && Math.hypot(c.vx, c.vy) > 1.5) knockProp(p, c.vx * 1.2, c.vy * 1.2, p.heavy ? 0 : 3);
}
function losCar(ax, ay, bx, by) {
  const n = Math.ceil(dist(ax, ay, bx, by) / .4);
  for (let i = 1; i < n; i++) if (vanSolid(ax + (bx - ax) * i / n, ay + (by - ay) * i / n)) return false;
  return true;
}
function wreck(c) {
  if (c.dead) return;
  c.dead = true; c.hp = 0;
  fx.flash(c.x, c.y, 1.2, 3, 0xff9a40);
  fx.burst('glow', c.x, c.y, .8, 40, 7, 0xffb050, .7, .14, { up: 6 });
  fx.burst('glow', c.x, c.y, .8, 20, 4, PAL.sodium, .9, .1, { up: 5 });
  fx.burst('solid', c.x, c.y, .8, 16, 6, 0x222222, 1.4, .12, { up: 7 });
  for (let i = 0; i < 6; i++) fx.spawn('smoke', c.x, c.y, 1, (Math.random() - .5) * 3, (Math.random() - .5) * 3, 2, 2, .5, 0x2a2a2a, { g: -1, grow: 4, drag: 1.5 });
  fx.decal(c.x, c.y, 1.4, 'scorch', .1);
  view.shake = Math.max(view.shake, .55);
  G.hitstop = .09;
  sfx.boom();
  vibrate(120);
  const body = c.model.body;
  body.traverse(o => { if (o.material && o.material.color) { o.material = o.material.clone(); o.material.color.multiplyScalar(.18); } });
  c.flip = 1;
  if (c.model.root.userData.bar) c.model.root.userData.bar.forEach(b => b.visible = false);
  if (c !== G.van) G.copsWrecked = (G.copsWrecked || 0) + 1;
}

// ---------- Tutorial ----------
const TUT = [
  { word: 'Move', glyph: 'move', target: () => [6.5, 9.5], done: () => dist(G.player.x, G.player.y, 6.5, 9.5) < 1 },
  { word: 'Sneak', glyph: 'crouch', target: () => [G.guards[0].x, G.guards[0].y + 1.1], done: () => G.player.crouch && dist(G.player.x, G.player.y, G.guards[0].x, G.guards[0].y) < 2 },
  { word: 'Grab', glyph: 'act', target: () => [G.guards[0].x, G.guards[0].y], done: () => !!G.guards[0].down },
  { word: 'Shoot', glyph: 'fire', target: () => [G.cams[0].x, G.cams[0].y], done: () => G.cams[0].dead },
  { word: 'Take', glyph: 'act', target: () => [G.loot[0].x, G.loot[0].y], done: () => G.loot[0].taken },
  { word: 'Van', glyph: 'act', target: () => [G.van.x, G.van.y], done: () => G.mode === 'drive' },
  { word: 'Go', glyph: 'drive', target: () => [G.w - 1, G.van.y > 13.5 ? 14.5 : 14.5], done: () => false }
];
function updateTut(dt) {
  const T = G.tut;
  const st = TUT[T.step];
  if (st && st.done()) { T.step++; sfx.ding(); vibrate(25); G.checkpoint = { x: G.player.x, y: G.player.y }; fx.burst('glow', G.player.x, G.player.y, 1.5, 12, 2.5, PAL.sodium, .5, .07); }
  if (T.shown !== T.step) showTutStep();
  const s2 = TUT[T.step];
  if (s2) {
    const [x, y] = s2.target();
    G.marker.visible = true; G.marker.position.set(x, 0, y);
    G.marker.userData.m.position.y = 1.9 + Math.sin(G.t * 3) * .12; G.marker.userData.m.rotation.y += dt * 2;
    G.marker.userData.ring.scale.setScalar(1 + (G.t * 1.2 % 1) * .6); G.marker.userData.ring.material.opacity = .8 * (1 - G.t * 1.2 % 1);
  } else G.marker.visible = false;
  T.caughtT = Math.max(0, T.caughtT - dt);
}
function tutCaught() {
  const T = G.tut; if (T.caughtT > 0) return;
  T.caughtT = 1.2;
  G.flash = .6; sfx.spotted(); vibrate(90);
  const P = G.player;
  P.x = G.checkpoint.x; P.y = G.checkpoint.y; if (P.drag) { P.drag.dragged = false; P.drag = null; }
  for (const g of G.guards) if (!g.down) { g.sus = 0; g.state = 'patrol'; g.x = g.path[0][0]; g.y = g.path[0][1]; g.a = g.face0; }
  for (const c of G.cams) c.sus = 0;
}
function keycaps(list) {
  let s = '<svg viewBox="-4 -4 188 112" aria-hidden="true">';
  for (const [lab, x, y, w, pc] of list) {
    s += `<rect class="lip" x="${x}" y="${y + 5}" width="${w}" height="44" rx="6"/><rect class="cap ${pc || ''}" x="${x}" y="${y}" width="${w}" height="44" rx="6"/><text x="${x + w / 2}" y="${y + 29}" text-anchor="middle">${lab}</text>`;
  }
  return s + '</svg>';
}
const MOUSE_SVG = '<svg viewBox="-4 -4 188 112" aria-hidden="true"><rect class="lip" x="64" y="9" width="56" height="88" rx="26"/><rect class="cap" x="64" y="4" width="56" height="88" rx="26"/><path class="cap press" d="M66 30 V30 a26 26 0 0 1 26 -26 V40 H66 Z"/><line x1="92" y1="6" x2="92" y2="40" stroke="#0d0f12" stroke-width="3"/></svg>';
function showTutStep(force) {
  const T = G.tut, st = TUT[T.step];
  if (!force) T.shown = T.step;
  document.querySelectorAll('.hint').forEach(e => e.classList.remove('hint'));
  $('ghostStick').hidden = true;
  if (!st) { $('tut').hidden = true; return; }
  $('tut').hidden = false;
  const w = $('tutWord'); w.textContent = st.word; w.classList.remove('pop'); void w.offsetWidth; w.classList.add('pop');
  const touch = input.mode === 'touch';
  let glyph = '';
  if (st.glyph === 'move' || st.glyph === 'drive') {
    if (touch) $('ghostStick').hidden = false;
    else glyph = keycaps([['W', 68, 0, 48, 'press'], ['A', 14, 54, 48, 'press p1'], ['S', 68, 54, 48, 'press p2'], ['D', 122, 54, 48, 'press p3']]);
  } else if (st.glyph === 'crouch') { if (touch) $('bCrouch').classList.add('hint'); else glyph = keycaps([['Shift', 36, 30, 112, 'press']]); }
  else if (st.glyph === 'act') { if (touch) $('bAct').classList.add('hint'); else glyph = keycaps([['E', 66, 30, 52, 'press']]); }
  else if (st.glyph === 'fire') { if (touch) $('bFire').classList.add('hint'); else glyph = MOUSE_SVG; }
  $('tutGlyph').innerHTML = glyph;
  $('tutDots').innerHTML = TUT.map((_, i) => `<i class="${i < T.step ? 'done' : i === T.step ? 'now' : ''}"></i>`).join('');
}
function finishTutorial() {
  store.set('heatline.trained', '1');
  $('tut').hidden = true;
  showMenu();
}

// ---------- Rendering sync ----------
function syncModels(dt) {
  const P = G.player;
  if (!P.inVan) {
    const m = P.model;
    m.root.position.set(P.x, .1, P.y);
    m.root.rotation.y = yaw(P.a);
    if (P.dead) { P.downT = (P.downT || 0) + dt * 2.2; poseHuman(m, { down: Math.min(1, P.downT), downKind: 'dead' }, dt); }
    else poseHuman(m, { speed: P.speed / 3.2, crouch: P.crouch ? 1 : 0, aim: P.busy ? 0 : (P.aimHold > 0 || (input.mode === 'keys' && input.mouse.used) ? 1 : 0), recoil: P.recoil, choke: P.busy === 'choke', stab: P.busy === 'stab' ? 1 - P.busyT / .45 : 0, drag: !!P.drag }, dt);
  }
  if (G.alarm) for (const t of G.world.tubes) t.flicker = .55 + .45 * Math.abs(Math.sin(G.t * 3.2));
  for (const g of G.guards) {
    const m = g.model;
    m.root.position.set(g.x, .1, g.y);
    m.root.rotation.y = yaw(g.a);
    if (g.down) poseHuman(m, { down: Math.min(1, g.downT * 2.4), downKind: g.down }, dt);
    else poseHuman(m, { speed: g.speed / 2.6, aim: g.state === 'alert' && !g.unarmed ? 1 : 0, recoil: g.recoil, choked: g.state === 'choked', stagger: g.stun > 0 ? 1 : 0 }, dt);
    // marks
    const mk = g.marks, top = 2.05;
    for (const k in mk) mk[k].visible = false;
    if (g.down === 'ko') { mk.ko.visible = true; mk.ko.position.set(g.x, .9 + Math.sin(G.t * 2 + g.i) * .06, g.y); }
    else if (!g.down) {
      if (g.radioT > 0 && !G.alarm) { mk.radio.visible = true; mk.radio.position.set(g.x, top + .25, g.y); const s = .45 + (g.radioT / 3.4) * .25 + Math.sin(G.t * 14) * .03; mk.radio.scale.set(s, s, 1); }
      else if (g.state === 'alert' && g.alertFlash > 0) { mk.alert.visible = true; mk.alert.position.set(g.x, top + .1, g.y); const s = .5 + Math.max(0, g.alertFlash - 1.2) * 1.5; mk.alert.scale.set(s, s, 1); }
      else if (g.state === 'sus' || g.state === 'search') { mk.sus.visible = true; mk.sus.position.set(g.x, top, g.y); mk.sus.material.opacity = .35 + g.sus * .65; }
    }
  }
  // flashlights: give the pooled spotlights to the guards nearest the camera focus
  const fxp = G.camPos;
  const torches = G.guards.filter(g => !g.unarmed || true).map(g => ({ g, d: dist(g.x, g.y, fxp.x, fxp.y) })).sort((a, b) => a.d - b.d);
  SPOTS.forEach((s, i) => {
    const t = torches[i];
    if (!t || t.d > 20) { s.intensity = 0; return; }
    const g = t.g;
    if (g.down) {
      // dropped torch keeps shining along the floor
      const a = g.a + 1.1;
      s.position.set(g.x + Math.cos(a) * .5, .25, g.y + Math.sin(a) * .5);
      s.target.position.set(g.x + Math.cos(a) * 4, 0, g.y + Math.sin(a) * 4);
      s.intensity = 14;
    } else {
      g.model.torch.getWorldPosition(_v);
      s.position.copy(_v);
      const a = g.a;
      s.target.position.set(g.x + Math.cos(a) * 5.5, 0, g.y + Math.sin(a) * 5.5);
      s.intensity = g.state === 'alert' ? 34 : 26;
      s.color.setHex(g.state === 'alert' ? 0xfff0e0 : 0xfff0d0);
    }
  });
  for (const l of G.loot) if (!l.taken) { l.bob += dt; l.model.position.y = .1 + Math.max(0, Math.sin(l.bob * 2.4)) * .04; }
  // thrown bags arc into the van
  for (const t of G.thrown) {
    t.t += dt;
    if (t.t < 0) continue;
    const k = Math.min(1, t.t / .45);
    t.m.position.set(lerp(t.x0, G.van.x, k), .4 + Math.sin(k * Math.PI) * 1.4, lerp(t.y0, G.van.y, k));
    t.m.rotation.x += dt * 9;
    if (k >= 1 && !t.done) { t.done = true; t.m.visible = false; G.stored++; sfx.thud(); fx.burst('glow', G.van.x, G.van.y, 1.2, 6, 2, PAL.sodium, .3, .06); }
  }
  // doors swing
  for (const d of G.world.doors) { d.open = lerp(d.open, d.isOpen ? d.target : 0, Math.min(1, dt * 7)); d.hinge.rotation.y = d.open; }
  // van and cops
  const V = G.van;
  V.model.root.position.set(V.x, .05, V.y);
  V.model.root.rotation.y = yaw(V.a);
  V.model.body.rotation.z = clamp(-(V.w || 0) * .04 * Math.hypot(V.vx, V.vy) / 6, -.12, .12);
  V.model.body.rotation.x = clamp(-(V.thr || 0) * .03, -.05, .05);
  for (const w of V.model.wheels) w.rotation.x += (V.vF || 0) * dt * 3;
  if (G.mode === 'drive') {
    HEAD.intensity = 60;
    HEAD.position.set(V.x + Math.cos(V.a) * 1.7, .7, V.y + Math.sin(V.a) * 1.7);
    HEAD.target.position.set(V.x + Math.cos(V.a) * 9, 0, V.y + Math.sin(V.a) * 9);
  } else HEAD.intensity = 0;
  for (const c of G.cops) {
    c.model.root.position.set(c.x, .05, c.y);
    c.model.root.rotation.y = yaw(c.a);
    if (c.flip) { c.flip = Math.min(1, c.flip + dt * 3); c.model.body.rotation.z = Math.sin(c.flip * Math.PI) * .6; c.model.body.position.y = Math.sin(c.flip * Math.PI) * .8; }
  }
}

// ---------- Camera ----------
function updateCamera(dt) {
  let tx, ty;
  if (G.mode === 'menu') {
    const t = G.t * .035;
    tx = G.w / 2 + Math.cos(t) * G.w * .18; ty = G.h / 2 + Math.sin(t * 1.3) * G.h * .15;
  } else if (G.mode === 'drive') {
    const V = G.van;
    tx = V.x + V.vx * .35; ty = V.y + V.vy * .35;
    const want = baseZoom() + Math.hypot(V.vx, V.vy) * .18;
    if (Math.abs(view.size - want) > .05) { view.size = lerp(view.size, want, Math.min(1, dt * 1.5)); view.resize(); }
  } else {
    const P = G.player;
    tx = P.x; ty = P.y;
    if (input.mode === 'keys' && input.mouse.used && P.aimInfo?.free) { tx += clamp(P.aimInfo.x - P.x, -4, 4) * .22; ty += clamp(P.aimInfo.y - P.y, -4, 4) * .22; }
  }
  const k = Math.min(1, dt * (G.mode === 'drive' ? 5 : 6));
  G.camPos.x = lerp(G.camPos.x, tx, k); G.camPos.y = lerp(G.camPos.y, ty, k);
  view.place(G.camPos.x, G.camPos.y, dt);
  G.world.follow(G.camPos.x, G.camPos.y);
  G.world.updateLights(G.camPos.x, G.camPos.y);
  const focus = G.mode === 'drive' ? G.van : G.mode === 'menu' ? { x: -99, y: -99 } : G.player;
  G.world.cutaway(focus.x, focus.y, dt, G.mode === 'drive' ? 10 : 12);
}

// ---------- HUD ----------
const hudCache = {};
function setText(id, v) { if (hudCache[id] !== v) { hudCache[id] = v; $(id).textContent = v; } }
function setStyle(id, prop, v) { const k = id + prop; if (hudCache[k] !== v) { hudCache[k] = v; $(id).style[prop] = v; } }
const ICONS = {
  choke: '<path d="M8 22c3-6 7-9 12-9 3 0 5 2 5 4s-2 3-4 3h-5" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/><circle cx="21" cy="9" r="3.4" fill="currentColor"/>',
  shove: '<path d="M6 16h12m-4-6 6 6-6 6" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/><rect x="22" y="9" width="4" height="14" fill="currentColor"/>',
  pick: '<rect x="9" y="14" width="14" height="11" rx="1.5" fill="currentColor"/><path d="M11.5 14v-3a4.5 4.5 0 0 1 9 0v3" fill="none" stroke="currentColor" stroke-width="2.6"/>',
  take: '<rect x="6" y="12" width="20" height="12" rx="5" fill="currentColor"/><path d="M12 12a4 4 0 0 1 8 0" fill="none" stroke="currentColor" stroke-width="2.4"/>',
  van: '<path d="M4 21V12h14l3 4h6v5z" fill="currentColor"/><circle cx="10" cy="22.5" r="2.8" fill="currentColor"/><circle cx="22" cy="22.5" r="2.8" fill="currentColor"/>',
  drag: '<circle cx="9" cy="9" r="3.2" fill="currentColor"/><path d="M9 13l2 7 6 2h9" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/>',
  drop: '<path d="M16 6v14m-6-6 6 6 6-6" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/><path d="M7 26h18" stroke="currentColor" stroke-width="3"/>',
  fire: '<circle cx="16" cy="16" r="9" fill="none" stroke="currentColor" stroke-width="2.6"/><path d="M16 3v7M16 22v7M3 16h7M22 16h7" stroke="currentColor" stroke-width="2.6"/>',
  knife: '<path d="M6 26 20 12l3-6 3 3-6 3L6 26z" fill="currentColor"/>',
  boost: '<path d="M6 10l8 6-8 6zM16 10l8 6-8 6z" fill="currentColor"/>',
  crouch: '<circle cx="18" cy="8" r="3.4" fill="currentColor"/><path d="M17 12l-5 6 6 2-2 7M12 18l-4 2" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"/>',
  brake: '<circle cx="16" cy="16" r="10" fill="none" stroke="currentColor" stroke-width="2.6"/><path d="M11 11l10 10" stroke="currentColor" stroke-width="2.6"/>'
};
function setIcon(el, name) { if (el.dataset.icon !== name) { el.dataset.icon = name || ''; el.innerHTML = name ? `<svg viewBox="0 0 32 32" aria-hidden="true">${ICONS[name]}</svg>` : ''; } }
const _p = new THREE.Vector3();
function toScreen(x, y, z) { _p.set(x, z, y).project(view.camera); return [(_p.x + 1) / 2 * innerWidth, (1 - _p.y) / 2 * innerHeight]; }
function updateHud() {
  const P = G.player, drive = G.mode === 'drive';
  setText('take', money((G.stored + P.carry) * G.L.bag));
  setStyle('hpFill', 'transform', `scaleX(${(drive ? G.van.hp : P.hp) / 100})`);
  $('hp').classList.toggle('low', (drive ? G.van.hp : P.hp) < 35);
  setText('ammo', drive ? '' : `${P.reload > 0 ? '··' : P.ammo}`);
  setText('reserve', drive ? '' : (P.reserve > 99 ? '∞' : String(P.reserve)));
  $('ammoBox').hidden = drive;
  $('boostBox').hidden = !drive;
  if (drive) setStyle('boostFill', 'transform', `scaleX(${G.van.boost})`);
  // light meter: five pips
  const pips = Math.round(G.expo * 5);
  if (hudCache.pips !== pips) { hudCache.pips = pips; $('eye').querySelectorAll('i').forEach((e, i) => e.classList.toggle('on', i < pips)); }
  $('eye').hidden = drive;
  // alarm strip
  if (G.alarm) { G.alarmT += 1 / 60; }
  // hurt vignette
  G.hurt = Math.max(0, G.hurt - 1 / 60 * 1.6);
  setStyle('hurtV', 'opacity', String(Math.max(G.hurt, P.hp < 35 && !drive ? .35 + Math.sin(G.t * 5) * .1 : 0).toFixed(2)));
  G.flash = Math.max(0, G.flash - 1 / 60 * 1.6);
  setStyle('flashV', 'opacity', G.flash.toFixed(2));
  // context prompt above the player
  const c = drive ? null : G.ctx;
  const ctxEl = $('ctx');
  if (c && !P.busy && !P.dead) {
    const [sx, sy] = toScreen(P.x, P.y, 2.3);
    ctxEl.hidden = false;
    ctxEl.style.transform = `translate(${sx | 0}px,${sy | 0}px)`;
    setIcon($('ctxIcon'), c.kind);
    $('ctx').classList.toggle('alt', c.kind === 'choke');
    setStyle('ctxRing', 'strokeDashoffset', String(113 - 113 * (c.kind === 'pick' ? G.hold : 0)));
  } else ctxEl.hidden = true;
  // touch buttons follow the context
  if (input.mode === 'touch') {
    setIcon($('bAct').querySelector('.ic'), drive ? null : c ? c.kind : null);
    $('bAct').classList.toggle('idle', drive || !c);
    setIcon($('bFire').querySelector('.ic'), drive ? 'boost' : c && c.kind === 'choke' ? 'knife' : 'fire');
    setIcon($('bCrouch').querySelector('.ic'), drive ? 'brake' : 'crouch');
    $('bCrouch').classList.toggle('lit', !drive && input.crouchToggle);
  }
  // exit arrow while driving
  const arrow = $('exitArrow');
  if (drive) {
    const ex = nearestExit();
    const [sx, sy] = toScreen(ex[0], ex[1], 0);
    const m = 46, inside = sx > m && sx < innerWidth - m && sy > m && sy < innerHeight - m;
    arrow.hidden = inside;
    if (!inside) {
      const cx = innerWidth / 2, cy = innerHeight / 2, a = Math.atan2(sy - cy, sx - cx);
      const k = Math.min((innerWidth / 2 - m) / Math.abs(Math.cos(a) || 1e-3), (innerHeight / 2 - m) / Math.abs(Math.sin(a) || 1e-3));
      arrow.style.transform = `translate(${cx + Math.cos(a) * k}px,${cy + Math.sin(a) * k}px) rotate(${a}rad)`;
    }
  } else arrow.hidden = true;
  // mouse reticle
  const ret = $('reticle');
  if (input.mode === 'keys' && input.mouse.used && !drive && G.mode === 'play' && !G.paused) {
    ret.hidden = false; ret.style.transform = `translate(${input.mouse.x}px,${input.mouse.y}px)`;
    ret.classList.toggle('reload', P.reload > 0);
    ret.classList.toggle('kick', P.recoil > .5);
  } else ret.hidden = true;
}
function nearestExit() {
  if (!G.exits) { G.exits = []; for (let y = 0; y < G.h; y++) for (let x = 0; x < G.w; x++) if (G.grid[y][x] === 'X') G.exits.push([x + .5, y + .5]); }
  let best = G.exits[0], bd = 1e9;
  for (const e of G.exits) { const d = dist(e[0], e[1], G.van.x, G.van.y); if (d < bd) { bd = d; best = e; } }
  return best;
}

// ---------- Screens ----------
function refreshLayers() {
  const playing = G && G.mode !== 'menu' && !G.over;
  $('hud').hidden = !playing;
  $('touch').hidden = !(playing && input.mode === 'touch');
  $('menu').hidden = !(G && G.mode === 'menu');
  $('skip').hidden = !(playing && G.tut);
  $('pauseBtn').hidden = !playing;
  document.body.classList.toggle('driving', !!(G && G.mode === 'drive'));
  $('inputChip').textContent = input.mode === 'touch' ? 'Touch' : 'Keyboard + mouse';
}
function startJob(key) {
  sfx.unlock();
  load(key, 'play');
  input.crouchToggle = false;
  $('result').hidden = true; $('pause').hidden = true; $('alarm').hidden = true;
  refreshLayers();
  if (G.tut) showTutStep(); else $('tut').hidden = true;
}
function showMenu() {
  load(store.get('heatline.lastJob') || 'bank', 'menu');
  // ambience: the city runs without you
  G.player.inVan = true; G.player.model.root.visible = false;
  $('result').hidden = true; $('pause').hidden = true; $('tut').hidden = true; $('alarm').hidden = true;
  const best = +store.get('heatline.best') || 0;
  $('best').textContent = best ? 'Best take ' + money(best) : '';
  refreshLayers();
  sfx.stopLoops();
}
function pause(on) {
  G.paused = on;
  $('pause').hidden = !on;
  if (on) sfx.stopLoops(); else if (G.mode === 'drive') { sfx.engine(true); sfx.siren(G.cops.length > 0); } else if (G.alarm) sfx.alarm(true);
}
function endGame(win, why) {
  if (G.over) return;
  G.over = true;
  sfx.stopLoops();
  if (G.tut) { if (win) { finishTutorial(); return; } }
  const take = win ? G.stored * G.L.bag : 0;
  const secs = Math.round((performance.now() - G.stats.start) / 1000);
  let title = 'Busted', sub = '';
  if (win) {
    if (G.stored === 0) title = 'Empty handed';
    else if (!G.alarm && G.kills === 0) title = G.kos === 0 ? 'Ghost' : 'Clean';
    else if (!G.alarm) title = 'Quiet';
    else title = 'Loud';
    const best = +store.get('heatline.best') || 0;
    if (take > best) store.set('heatline.best', String(take));
  } else title = why === 'down' ? 'Down' : why === 'wrecked' ? 'Wrecked' : 'Busted';
  store.set('heatline.lastJob', G.key);
  $('rTitle').textContent = title;
  $('rTitle').dataset.kind = win ? 'win' : 'lose';
  const rows = [
    ['Take', money(take)], ['Bags', `${G.stored} of ${G.loot.length}`], ['Knocked out', G.kos], ['Killed', G.kills],
    ['Alarm', G.alarm ? 'Raised' : 'Never'], ['Cops wrecked', G.copsWrecked || 0], ['Time', `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`]
  ];
  $('rStats').innerHTML = rows.map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join('');
  setTimeout(() => { $('result').hidden = false; refreshLayers(); $('rAgain').focus({ preventScroll: true }); }, win ? 300 : 900);
}

// ---------- Main loop ----------
let last = performance.now();
function step(dt) {
  if (G.hitstop > 0) { G.hitstop -= dt; dt *= .08; }
  G.t += dt;
  if (G.mode === 'menu') {
    for (const g of G.guards) updateGuard(g, dt);
  } else if (!G.over || G.player.dead) {
    if (G.mode === 'play' && !G.player.dead) { updatePlayer(dt); updateCams(dt); }
    if (G.mode === 'drive' && !G.over) updateDrive(dt);
    for (const g of G.guards) updateGuard(g, dt);
    if (G.tut) updateTut(dt);
  }
  updateProps(dt);
  syncModels(dt);
  updateCamera(dt);
  fx.update(dt);
  input.firePressed = false; input.actPressed = false;
}
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(.05, (now - last) / 1000); last = now;
  if (!G) return;
  if (!G.paused) step(dt);
  if (G.mode !== 'menu' && !G.paused) updateHud();
  view.renderer.render(view.scene, view.camera);
}

// ---------- Wiring ----------
document.querySelectorAll('[data-job]').forEach(b => b.addEventListener('click', () => startJob(b.dataset.job)));
$('pauseBtn').addEventListener('click', () => pause(true));
$('pResume').addEventListener('click', () => pause(false));
$('pRestart').addEventListener('click', () => startJob(G.key));
$('pMenu').addEventListener('click', () => showMenu());
$('rAgain').addEventListener('click', () => startJob(G.key));
$('rMenu').addEventListener('click', () => showMenu());
$('skip').addEventListener('click', () => finishTutorial());
addEventListener('keydown', e => {
  if (e.code === 'KeyR' && G?.over && !$('result').hidden) startJob(G.key);
});

// first run goes straight into the wordless training job
if (!store.get('heatline.trained')) startJob('train'); else showMenu();
requestAnimationFrame(frame);
// test hook: advance the simulation without waiting for frames
window.__heatline = { get G() { return G; }, view, startJob, showMenu, input, sim(sec) { for (let t = 0; t < sec; t += 1 / 60) if (G && !G.paused) step(1 / 60); } };
