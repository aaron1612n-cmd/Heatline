// Heatline renderer: a night-time diorama in sodium light.
// World units: 1 tile = 1 unit. Game (x, y) maps to three.js (x, up, z = y).
import * as THREE from 'three';

export { THREE };

// Named palette. Sodium is the one accent; siren is reserved for danger.
export const PAL = {
  night: 0x0d0f12,
  asphalt: 0x24272b,
  asphaltWet: 0x1c1f23,
  kerb: 0x5b5a55,
  pavement: 0x46453f,
  paint: 0xb8ad8f,
  plaster: 0x8d877a,
  plasterTop: 0x2a2826,
  lino: 0x5d5a50,
  lino2: 0x534f46,
  marble: 0x8c8678,
  marble2: 0x837d70,
  vault: 0x3d4247,
  wood: 0x5a3f2c,
  brick: 0x4e3a33,
  sodium: 0xf5a623,
  sodiumLight: 0xffa64d,
  tube: 0xf2ead8,
  siren: 0xd6312b,
  guardShirt: 0x56656a,
  guardPants: 0x22272b,
  skin1: 0xb98a6b, skin2: 0x7a5440, skin3: 0xd3a888,
  crook: 0x24272b,
  crook2: 0x3a3e43,
  blood: 0x5a0c0c,
  glass: 0x9fc4cf
};

const TAU = Math.PI * 2;
const hash = (x, y) => { const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return s - Math.floor(s); };
function yaw(a) { return Math.PI / 2 - a; } // game angle -> three rotation.y for a +z-forward model

// ---------- Renderer & camera ----------
export function createView(canvas, lowEnd) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: !lowEnd, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, lowEnd ? 1.5 : 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.45;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(PAL.night);
  scene.fog = new THREE.Fog(PAL.night, 38, 70);
  const camera = new THREE.OrthographicCamera(-10, 10, 10, -10, 0.1, 200);
  const ELEV = 35 * Math.PI / 180, DIST = 40;
  const offset = new THREE.Vector3(DIST / Math.SQRT2 * Math.cos(ELEV), DIST * Math.sin(ELEV), DIST / Math.SQRT2 * Math.cos(ELEV));
  const view = { renderer, scene, camera, offset, size: 14, lowEnd, target: new THREE.Vector3(), shake: 0, kick: new THREE.Vector2() };
  view.resize = () => {
    const w = window.innerWidth, h = window.innerHeight;
    renderer.setSize(w, h, false);
    const aspect = w / h;
    // keep roughly the same number of tiles across the shorter side
    const half = view.size / 2;
    if (aspect >= 1) { camera.left = -half * aspect; camera.right = half * aspect; camera.top = half; camera.bottom = -half; }
    else { const hh = half / aspect * 0.78; camera.left = -half * 0.78; camera.right = half * 0.78; camera.top = hh; camera.bottom = -hh; }
    camera.updateProjectionMatrix();
  };
  view.place = (x, y, dt) => {
    view.target.set(x, 0, y);
    const s = view.shake;
    const jx = s ? (Math.random() - .5) * s : 0, jy = s ? (Math.random() - .5) * s : 0;
    camera.position.set(x + offset.x + jx + view.kick.x, offset.y + jy, y + offset.z - jx + view.kick.y);
    camera.lookAt(x + jx + view.kick.x, 0, y - jx + view.kick.y);
    view.shake = Math.max(0, s - dt * 3.2 * (s + .2));
    view.kick.multiplyScalar(Math.max(0, 1 - dt * 14));
  };
  window.addEventListener('resize', view.resize);
  view.resize();
  return view;
}

// ---------- Shared materials ----------
const M = {};
function mats() {
  if (M.ready) return M;
  const lam = (c, o = {}) => new THREE.MeshLambertMaterial({ color: c, ...o });
  M.inst = lam(0xffffff);
  M.wet = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: .42, metalness: .05 });
  M.plaster = lam(PAL.plaster);
  M.cap = lam(PAL.plasterTop);
  M.glass = new THREE.MeshLambertMaterial({ color: PAL.glass, transparent: true, opacity: .22, depthWrite: false });
  M.wood = lam(PAL.wood);
  M.metal = new THREE.MeshStandardMaterial({ color: 0x3a3d40, roughness: .5, metalness: .6 });
  M.dark = lam(0x161719);
  M.door = lam(0x3b3029);
  M.vaultDoor = new THREE.MeshStandardMaterial({ color: 0x6d7276, roughness: .35, metalness: .8 });
  M.lampHead = new THREE.MeshBasicMaterial({ color: 0xffd08a });
  M.tubeOn = new THREE.MeshBasicMaterial({ color: 0xe9f3ef });
  M.win = new THREE.MeshBasicMaterial({ color: 0xffffff, vertexColors: false });
  M.bag = lam(0x2f3a2c);
  M.cash = lam(0x6f7d58);
  M.strap = lam(PAL.sodium);
  M.paint = lam(PAL.paint);
  M.blood = new THREE.MeshBasicMaterial({ color: PAL.blood, transparent: true, opacity: .92, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
  M.scorch = new THREE.MeshBasicMaterial({ color: 0x080808, transparent: true, opacity: .7, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
  M.ready = true;
  return M;
}

// ---------- World ----------
// grid: array of rows of tile chars (already normalised by the game).
export function buildWorld(view, lvl) {
  mats();
  const { scene } = view;
  const root = new THREE.Group();
  scene.add(root);
  const W = lvl.w, H = lvl.h, g = lvl.grid;
  const at = (x, y) => (x < 0 || y < 0 || x >= W || y >= H) ? 'B' : g[y][x];
  const isStreet = c => c === ',' || c === 'X' || c === 'V';
  const isWalk = c => c === '_' || c === 'l' || c === 'h' || c === 't' || c === 'P';
  const box = new THREE.BoxGeometry(1, 1, 1);
  const tmp = new THREE.Object3D(), col = new THREE.Color();
  const world = { root, walls: [], doors: [], windows: [], lamps: [], tubes: [], props: [], smash: [], cams: [] };

  // ground tiles
  const ground = [], wet = [];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const c = at(x, y);
    if (c === 'B') continue;
    if (isStreet(c)) wet.push([x, y, c]); else ground.push([x, y, c]);
  }
  const gm = new THREE.InstancedMesh(box, M.inst, ground.length);
  gm.receiveShadow = true;
  ground.forEach(([x, y, c], i) => {
    let h = .1, inset = 1, base = PAL.lino;
    const n = hash(x, y);
    if (isWalk(c)) { h = .2; inset = .96; base = (x + y) % 2 ? PAL.pavement : 0x4b4a44; }
    else if (c === 'm' || c === 'M') base = (x + y) % 2 ? PAL.marble : PAL.marble2;
    else if (c === 'v') base = PAL.vault;
    else base = (x + y) % 2 ? PAL.lino : PAL.lino2;
    tmp.position.set(x + .5, h / 2, y + .5); tmp.scale.set(inset, h, inset); tmp.rotation.set(0, 0, 0); tmp.updateMatrix();
    gm.setMatrixAt(i, tmp.matrix);
    col.setHex(base).multiplyScalar(.92 + n * .12);
    gm.setColorAt(i, col);
  });
  root.add(gm);
  // a dark bed under the pavement gives the slabs grout lines
  // the city keeps going past the edge of the map
  const beyond = new THREE.Mesh(new THREE.PlaneGeometry(W + 120, H + 120), new THREE.MeshLambertMaterial({ color: 0x15171a }));
  beyond.rotation.x = -Math.PI / 2; beyond.position.set(W / 2, -.02, H / 2); beyond.receiveShadow = true; root.add(beyond);
  const bed = new THREE.Mesh(new THREE.PlaneGeometry(W, H), new THREE.MeshLambertMaterial({ color: 0x1a1a18 }));
  bed.rotation.x = -Math.PI / 2; bed.position.set(W / 2, .01, H / 2); bed.receiveShadow = true; root.add(bed);

  const wm = new THREE.InstancedMesh(box, M.wet, Math.max(1, wet.length));
  wm.receiveShadow = true;
  wet.forEach(([x, y], i) => {
    tmp.position.set(x + .5, .04, y + .5); tmp.scale.set(1, .08, 1); tmp.updateMatrix();
    wm.setMatrixAt(i, tmp.matrix);
    const n = hash(x * 3, y * 7);
    col.setHex(n > .82 ? PAL.asphaltWet : PAL.asphalt).multiplyScalar(.9 + n * .2);
    wm.setColorAt(i, col);
  });
  root.add(wm);

  // lane paint: dashed centre lines on three-wide roads
  const dashes = [];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (!isStreet(at(x, y))) continue;
    const hz = isStreet(at(x, y - 1)) && isStreet(at(x, y + 1)) && !isStreet(at(x, y - 2)) && !isStreet(at(x, y + 2));
    const vt = isStreet(at(x - 1, y)) && isStreet(at(x + 1, y)) && !isStreet(at(x - 2, y)) && !isStreet(at(x + 2, y));
    if (hz && !vt) dashes.push([x + .5, y + .5, 0]);
    if (vt && !hz) dashes.push([x + .5, y + .5, 1]);
  }
  if (dashes.length) {
    const dm = new THREE.InstancedMesh(box, M.paint, dashes.length);
    dashes.forEach(([x, y, v], i) => { tmp.position.set(x, .085, y); tmp.scale.set(v ? .08 : .5, .01, v ? .5 : .08); tmp.updateMatrix(); dm.setMatrixAt(i, tmp.matrix); });
    dm.receiveShadow = true; root.add(dm);
  }

  // Thin walls: a post in each wall tile plus arms reaching toward neighbouring walls, doors and windows.
  // Collision still uses the whole tile; this is only how it looks.
  const T = .26, WH = 2.0;
  const joins = c => '#wdDQ'.includes(c);
  const pieces = [];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (at(x, y) !== '#') continue;
    const w = { x: x + .5, y: y + .5, h: WH, parts: [] };
    world.walls.push(w);
    w.parts.push([0, 0, T, T]);
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      if (!joins(at(x + dx, y + dy))) continue;
      w.parts.push([dx * .25 + dx * T / 4, dy * .25 + dy * T / 4, dx ? .5 - T / 2 : T, dy ? .5 - T / 2 : T]);
    }
    for (const pt of w.parts) { pt.push(pieces.length); pieces.push(w); }
      }
  const wallMesh = new THREE.InstancedMesh(box, M.plaster, Math.max(1, pieces.length));
  const capMesh = new THREE.InstancedMesh(box, M.cap, Math.max(1, pieces.length));
  wallMesh.castShadow = true; wallMesh.receiveShadow = true; capMesh.castShadow = true;
  wallMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); capMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  world.walls.forEach(w => {
    col.setHex(PAL.plaster).multiplyScalar(.9 + hash(w.x, w.y) * .12);
    for (const pt of w.parts) wallMesh.setColorAt(pt[4], col);
  });
  root.add(wallMesh, capMesh);
  world.wallMesh = wallMesh; world.capMesh = capMesh;
  world.setWall = (w, h) => {
    tmp.rotation.set(0, 0, 0);
    for (const [ox, oy, sx, sy, i] of w.parts) {
      tmp.position.set(w.x + ox, h / 2, w.y + oy); tmp.scale.set(sx, h, sy); tmp.updateMatrix(); wallMesh.setMatrixAt(i, tmp.matrix);
      tmp.position.set(w.x + ox, h + .03, w.y + oy); tmp.scale.set(sx + .04, .06, sy + .04); tmp.updateMatrix(); capMesh.setMatrixAt(i, tmp.matrix);
    }
  };
  world.walls.forEach(w => world.setWall(w, w.h));
  const plinth = world.walls.map(w => w);
  if (plinth.length) {
    const pm = new THREE.InstancedMesh(box, M.inst, plinth.length);
    plinth.forEach((w, i) => { tmp.position.set(w.x, .05, w.y); tmp.scale.set(1, .1, 1); tmp.updateMatrix(); pm.setMatrixAt(i, tmp.matrix); pm.setColorAt(i, col.setHex(0x2b2925)); });
    pm.receiveShadow = true; root.add(pm);
  }

  // Buildings outside the job site: blocky night skyline with lit windows on the faces the camera sees.
  const blocks = [];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (at(x, y) === 'B') blocks.push([x, y]);
  const bm = new THREE.InstancedMesh(box, M.inst, Math.max(1, blocks.length));
  bm.castShadow = true; bm.receiveShadow = true;
  bm.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  const winQuads = [];
  const bTones = [PAL.brick, 0x3f4245, 0x524b40, 0x3a3631, 0x4a4f4c];
  blocks.forEach(([x, y], i) => {
    const bx = Math.floor(x / 4), by = Math.floor(y / 4);
    const hb = 2.6 + Math.floor(hash(bx, by) * 4) * .9;
    const w = { x: x + .5, y: y + .5, h: hb, i, block: true };
    world.walls.push(w);
    col.setHex(bTones[Math.floor(hash(by, bx) * bTones.length)]).multiplyScalar(.85 + hash(x, y) * .2);
    bm.setColorAt(i, col);
    // visible faces: +x and +z
    for (const [dx, dy] of [[1, 0], [0, 1]]) {
      if (at(x + dx, y + dy) === 'B') continue;
      for (let f = 0; f < Math.floor(hb / .9); f++) {
        const r = hash(x * 13 + f, y * 7 + dx);
        const q = { x: x + .5 + dx * .505, y: y + .5 + dy * .505, z: .9 + f * .9, dx, dy, lit: r };
        winQuads.push(q); (w.wins || (w.wins = [])).push(q);
      }
    }
  });
  root.add(bm);
  world.blockMesh = bm;
  world.setBlock = (w, h) => {
    tmp.rotation.set(0, 0, 0);
    tmp.position.set(w.x, h / 2, w.y); tmp.scale.set(1, h, 1); tmp.updateMatrix(); bm.setMatrixAt(w.i, tmp.matrix);
  };
  world.walls.forEach(w => { if (w.block) world.setBlock(w, w.h); });
  if (winQuads.length) {
    const wq = new THREE.InstancedMesh(new THREE.PlaneGeometry(.42, .5), M.win, winQuads.length);
    wq.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    winQuads.forEach((q, i) => {
      q.i = i;
      const c = q.lit > .78 ? 0xe9b26a : q.lit > .7 ? 0x6f8fa0 : q.lit > .64 ? 0xc98a4a : 0x16181a;
      col.setHex(c); wq.setColorAt(i, col);
    });
    world.winMesh = wq; world.winQuads = winQuads;
    world.placeWin = (q, show) => {
      tmp.position.set(q.x, show ? q.z : -5, q.y);
      tmp.rotation.set(0, q.dx ? Math.PI / 2 : 0, 0); tmp.scale.set(1, 1, 1); tmp.updateMatrix();
      wq.setMatrixAt(q.i, tmp.matrix);
    };
    winQuads.forEach(q => world.placeWin(q, true));
    root.add(wq);
  }

  // windows in job-site walls: sill, header, glass pane
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const c = at(x, y);
    if (c === 'w') {
      const grp = new THREE.Group(); grp.position.set(x + .5, 0, y + .5);
      const horiz = at(x - 1, y) === '#' || at(x + 1, y) === '#' || at(x - 1, y) === 'w' || at(x + 1, y) === 'w';
      const sill = new THREE.Mesh(box, M.plaster); sill.scale.set(horiz ? 1 : T, .85, horiz ? T : 1); sill.position.y = .425; sill.castShadow = sill.receiveShadow = true;
      const head = new THREE.Mesh(box, M.plaster); head.scale.set(horiz ? 1 : T, .35, horiz ? T : 1); head.position.y = WH - .175; head.castShadow = true;
      const floor = new THREE.Mesh(box, M.dark); floor.scale.set(1, .1, 1); floor.position.y = .05; grp.add(floor);
      const pane = new THREE.Mesh(box, M.glass); pane.scale.set(horiz ? 1 : .06, WH - 1.2, horiz ? .06 : 1); pane.position.y = .85 + (WH - 1.2) / 2;
      grp.add(sill, head, pane); root.add(grp);
      world.windows.push({ x: x + .5, y: y + .5, tx: x, ty: y, grp, pane, head, sill, horiz, broken: false });
    } else if (c === 'd' || c === 'D' || c === 'Q') {
      const grp = new THREE.Group(); grp.position.set(x + .5, 0, y + .5);
      const horiz = '#wB'.includes(at(x - 1, y)) || '#wB'.includes(at(x + 1, y));
      const head = new THREE.Mesh(box, M.plaster); head.scale.set(horiz ? 1 : T, .3, horiz ? T : 1); head.position.y = WH - .15; head.castShadow = true; grp.add(head);
      const sillD = new THREE.Mesh(box, M.dark); sillD.scale.set(1, .1, 1); sillD.position.y = .05; grp.add(sillD);
      const hinge = new THREE.Group();
      // hinge on one edge of the tile, slab spans the opening
      if (horiz) hinge.position.set(-.5, 0, 0); else hinge.position.set(0, 0, -.5);
      const slab = new THREE.Mesh(box, c === 'Q' ? M.vaultDoor : M.door);
      if (horiz) { slab.scale.set(1, WH - .3, c === 'Q' ? .3 : .09); slab.position.set(.5, (WH - .3) / 2, 0); }
      else { slab.scale.set(c === 'Q' ? .3 : .09, WH - .3, 1); slab.position.set(0, (WH - .3) / 2, .5); }
      slab.castShadow = true;
      hinge.add(slab);
      if (c !== 'd') {
        // lock plate in sodium so locked doors read at a glance
        const plate = new THREE.Mesh(box, M.strap);
        if (horiz) { plate.scale.set(.12, .2, c === 'Q' ? .34 : .13); plate.position.set(.82, 1.05, 0); }
        else { plate.scale.set(c === 'Q' ? .34 : .13, .2, .12); plate.position.set(0, 1.05, .82); }
        hinge.add(plate);
        if (c === 'Q') {
          const wheel = new THREE.Mesh(new THREE.TorusGeometry(.32, .05, 6, 14), M.metal);
          if (horiz) { wheel.position.set(.5, 1.1, .17); } else { wheel.rotation.y = Math.PI / 2; wheel.position.set(.17, 1.1, .5); }
          hinge.add(wheel);
        }
      }
      grp.add(hinge); root.add(grp);
      world.doors.push({ x: x + .5, y: y + .5, tx: x, ty: y, kind: c, grp, hinge, horiz, open: 0, target: 0 });
    }
  }

  // counters / desks
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const c = at(x, y);
    if (c === 'k') {
      const top = new THREE.Mesh(box, M.wood); top.scale.set(1, .07, .72); top.position.set(x + .5, .76, y + .5);
      const body = new THREE.Mesh(box, M.counter || (M.counter = new THREE.MeshLambertMaterial({ color: 0x6a6357 })));
      body.scale.set(.98, .72, .56); body.position.set(x + .5, .36, y + .5);
      top.castShadow = body.castShadow = true; body.receiveShadow = top.receiveShadow = true;
      root.add(top, body);
    } else if (c === 'h') {
      const hy = prop(hydrant(), x + .5, y + .5); hy.kind = 'hydrant'; world.smash.push(hy); root.add(hy.obj);
    } else if (c === 't') {
      const tc = prop(bin(), x + .5, y + .5); tc.kind = 'bin'; world.smash.push(tc); root.add(tc.obj);
    } else if (c === 'c') {
      const car = parkedCar(hash(x, y)); car.position.set(x + .5, 0, y + .5);
      const horiz = isStreet(at(x - 1, y)) && isStreet(at(x + 1, y));
      car.rotation.y = horiz ? 0 : Math.PI / 2;
      root.add(car);
      world.smash.push({ obj: car, x: x + .5, y: y + .5, r: .7, heavy: true, vx: 0, vy: 0, vz: 0, z: 0, spin: 0, hit: false });
    } else if (c === 'l') {
      const lamp = lampPost(); lamp.position.set(x + .5, .2, y + .5);
      // arm leans toward the nearest road
      let ang = 0;
      for (const [dx, dy, a] of [[1, 0, 0], [-1, 0, Math.PI], [0, 1, Math.PI / 2], [0, -1, -Math.PI / 2]]) if (isStreet(at(x + dx, y + dy))) ang = a;
      lamp.rotation.y = yaw(ang);
      root.add(lamp);
      const src = { x: x + .5 + Math.cos(ang) * .9, y: y + .5 + Math.sin(ang) * .9, z: 3.1, r: 5.2, i: 1, color: PAL.sodiumLight };
      world.lamps.push(src);
      world.smash.push({ obj: lamp, x: x + .5, y: y + .5, r: .18, vx: 0, vy: 0, vz: 0, z: .2, spin: 0, hit: false, kind: 'lamp', light: src });
    }
  }
  // ceiling tubes inside the job site
  for (const L of lvl.lights || []) {
    const t = new THREE.Mesh(box, M.tubeOn); t.scale.set(.9, .05, .14); t.position.set(L[0], 1.95, L[1]);
    root.add(t);
    world.tubes.push({ x: L[0], y: L[1], z: 1.85, r: 4.6, i: .85, color: PAL.tube, mesh: t, on: true });
  }

  // Light pool. A fixed number of point lights is reassigned to the nearest sources each frame,
  // so the shader never recompiles and phones keep their frame rate.
  const POOL = view.lowEnd ? 6 : 10;
  world.pool = [];
  for (let i = 0; i < POOL; i++) {
    const p = new THREE.PointLight(0xffffff, 0, 6, 1.6);
    scene.add(p); world.pool.push(p);
  }
  world.sources = () => world.lamps.filter(l => l.i > 0).concat(world.tubes.filter(t => t.on));
  world.updateLights = (cx, cy) => {
    const src = world.sources();
    src.sort((a, b) => ((a.x - cx) ** 2 + (a.y - cy) ** 2) - ((b.x - cx) ** 2 + (b.y - cy) ** 2));
    world.pool.forEach((p, i) => {
      const s = src[i];
      if (!s) { p.intensity = 0; return; }
      p.position.set(s.x, s.z, s.y); p.color.setHex(s.color);
      p.distance = s.r * 1.6; p.intensity = s.i * (s.color === PAL.tube ? 12 : 16) * (s.flicker ?? 1);
    });
  };

  // night ambience
  const hemi = new THREE.HemisphereLight(0x3a4a66, 0x1a1610, 1.6);
  const moon = new THREE.DirectionalLight(0x8fa6c9, .75);
  moon.position.set(-8, 20, 4); moon.castShadow = true;
  const sm = view.lowEnd ? 1024 : 2048;
  moon.shadow.mapSize.set(sm, sm);
  Object.assign(moon.shadow.camera, { left: -22, right: 22, top: 22, bottom: -22, near: 1, far: 60 });
  moon.shadow.bias = -.0008; moon.shadow.normalBias = .03;
  scene.add(hemi, moon, moon.target);
  world.moon = moon; world.hemi = hemi;
  world.follow = (x, y) => { moon.position.set(x - 8, 20, y + 4); moon.target.position.set(x, 0, y); };

  // Rooms: flood fill floor tiles so the cutaway knows which walls hem in the player's room.
  const room = Array.from({ length: H }, () => new Int16Array(W));
  const indoor = c => '.mvkoLC'.includes(c);
  let nextRoom = 1;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (room[y][x] || !indoor(at(x, y))) continue;
    const id = nextRoom++, q = [[x, y]]; room[y][x] = id;
    while (q.length) {
      const [cx, cy] = q.pop();
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = cx + dx, ny = cy + dy;
        if (nx < 0 || ny < 0 || nx >= W || ny >= H || room[ny][nx] || !indoor(at(nx, ny))) continue;
        room[ny][nx] = id; q.push([nx, ny]);
      }
    }
  }
  world.room = room;
  let curRoom = 0;

  // Project Zomboid style cutaway: walls between the camera and the player, and the near walls of
  // the room the player stands in, drop to a stub.
  world.cutaway = (px, py, dt, far = 12) => {
    const k = Math.min(1, dt * 10);
    const ix = Math.floor(px), iy = Math.floor(py);
    if (ix >= 0 && iy >= 0 && ix < W && iy < H) {
      const r = room[iy][ix], c = at(ix, iy);
      if (r || !'dDQ'.includes(c)) curRoom = r;
    }
    const cutAt = (x, y) => {
      const front = (x + y) - (px + py), side = Math.abs((x - y) - (px - py));
      if (front > .6 && front < far && side < far * .9 - front * .35) return true;
      if (!curRoom) return false;
      const tx = Math.floor(x), ty = Math.floor(y);
      return room[ty]?.[tx - 1] === curRoom || room[ty - 1]?.[tx] === curRoom ||
        (room[ty - 1]?.[tx - 1] === curRoom && at(tx - 1, ty) !== '#' && at(tx, ty - 1) !== '#');
    };
    let wd = false, bd = false;
    for (const w of world.walls) {
      const cut = w.block ? (() => { const f = (w.x + w.y) - (px + py), sd = Math.abs((w.x - w.y) - (px - py)); return f > .6 && f < far && sd < far * .9 - f * .35; })() : cutAt(w.x, w.y);
      const full = w.block ? w.h : WH;
      const target = cut ? (w.block ? .45 : .3) : full;
      if (w.cur === undefined) w.cur = full;
      if (Math.abs(w.cur - target) < .005) continue;
      w.cur += (target - w.cur) * k;
      if (w.block) { world.setBlock(w, w.cur); bd = true; } else { world.setWall(w, w.cur); wd = true; }
      if (w.block && world.winQuads) for (const q of w.wins || []) world.placeWin(q, q.z < w.cur - .2);
    }
    if (wd) { wallMesh.instanceMatrix.needsUpdate = true; capMesh.instanceMatrix.needsUpdate = true; }
    if (bd) { bm.instanceMatrix.needsUpdate = true; if (world.winMesh) world.winMesh.instanceMatrix.needsUpdate = true; }
    for (const win of world.windows) {
      const cut = cutAt(win.x, win.y);
      win.head.visible = !cut; if (!win.broken) win.pane.visible = !cut;
      win.sill.scale.y = cut ? .3 : .85; win.sill.position.y = cut ? .15 : .425;
    }
    for (const d of world.doors) {
      d.cut = cutAt(d.x, d.y);
      d.grp.children[0].visible = !d.cut;
      d.hinge.scale.y = d.cut ? .16 : 1;
    }
  };

  world.dispose = () => {
    scene.remove(root, hemi, moon, moon.target, ...world.pool);
    root.traverse(o => { if (o.geometry && o.geometry !== box) o.geometry.dispose?.(); });
  };
  return world;
}

function prop(obj, x, y) { obj.position.set(x, .2, y); return { obj, x, y, r: .3, vx: 0, vy: 0, vz: 0, z: .2, spin: 0, hit: false }; }

function hydrant() {
  mats();
  const g = new THREE.Group();
  const red = new THREE.MeshLambertMaterial({ color: 0x8a2a1e });
  const b = new THREE.Mesh(new THREE.CylinderGeometry(.13, .16, .5, 8), red); b.position.y = .25;
  const t = new THREE.Mesh(new THREE.SphereGeometry(.13, 8, 5, 0, TAU, 0, Math.PI / 2), red); t.position.y = .5;
  const n = new THREE.Mesh(new THREE.CylinderGeometry(.06, .06, .36, 6), red); n.rotation.z = Math.PI / 2; n.position.y = .32;
  [b, t, n].forEach(m => { m.castShadow = true; g.add(m); });
  return g;
}
function bin() {
  const g = new THREE.Group();
  const m = new THREE.MeshStandardMaterial({ color: 0x3f4a3f, roughness: .6, metalness: .4 });
  const b = new THREE.Mesh(new THREE.CylinderGeometry(.22, .19, .62, 9), m); b.position.y = .31;
  const l = new THREE.Mesh(new THREE.CylinderGeometry(.24, .24, .05, 9), m); l.position.y = .64;
  b.castShadow = l.castShadow = true; g.add(b, l); return g;
}
function lampPost() {
  mats();
  const g = new THREE.Group();
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(.05, .07, 3.2, 6), M.metal); pole.position.y = 1.6;
  const arm = new THREE.Mesh(new THREE.BoxGeometry(.06, .06, .95), M.metal); arm.position.set(0, 3.15, .45);
  const head = new THREE.Mesh(new THREE.BoxGeometry(.22, .1, .42), M.metal); head.position.set(0, 3.1, .9);
  const bulb = new THREE.Mesh(new THREE.BoxGeometry(.16, .03, .32), M.lampHead); bulb.position.set(0, 3.04, .9);
  pole.castShadow = arm.castShadow = head.castShadow = true;
  g.add(pole, arm, head, bulb);
  return g;
}
function parkedCar(n) {
  const tones = [0x5d6b73, 0x7a6a52, 0x3b3f44, 0x6e3b32, 0x8c8a82];
  const c = makeCar(tones[Math.floor(n * tones.length)], false);
  return c.root;
}

// ---------- Characters ----------
// Chunky, blocky people built from boxes on a small bone hierarchy so we can pose them by hand.
// kind: 'crook' | 'guard' | 'cop'
export function makeHuman(kind, seed = 0) {
  mats();
  const L = (c) => new THREE.MeshLambertMaterial({ color: c });
  const skins = [PAL.skin1, PAL.skin2, PAL.skin3];
  const skin = L(skins[Math.floor(hash(seed, 3) * 3)]);
  let top, legs, headwear, boots = L(0x141414), gloves = skin;
  if (kind === 'crook') { top = L(0x2f3529); legs = L(0x26272a); headwear = L(PAL.sodium); gloves = L(0x151515); boots = L(0xb9b2a2); }
  else if (kind === 'cop') { top = L(0x26324a); legs = L(0x1a2131); headwear = L(0x1a2131); }
  else { top = L(PAL.guardShirt); legs = L(PAL.guardPants); headwear = L(0x1e2427); }
  const B = (w, h, d, m, x = 0, y = 0, z = 0) => { const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); o.position.set(x, y, z); o.castShadow = true; return o; };

  const root = new THREE.Group();
  const hips = new THREE.Group(); hips.position.y = .62; root.add(hips);
  const pelvis = B(.36, .16, .22, legs, 0, .02, 0); hips.add(pelvis);
  const torso = new THREE.Group(); torso.position.y = .08; hips.add(torso);
  const chest = B(.42, .44, .25, top, 0, .24, 0); torso.add(chest);
  if (kind === 'crook') {
    // bomber jacket with a duffel strap across the chest
    torso.add(B(.44, .08, .27, L(0x22251f), 0, .03, 0));
    const strap = B(.08, .58, .03, L(0x161616), 0, .26, .14); strap.rotation.z = .7; torso.add(strap);
    const strapB = B(.08, .58, .03, L(0x161616), 0, .26, -.14); strapB.rotation.z = .7; torso.add(strapB);
  } else {
    torso.add(B(.43, .06, .26, L(0x111214), 0, .02, 0)); // belt
    if (kind === 'guard') torso.add(B(.1, .07, .02, L(0x9c9068), .12, .38, .13)); // badge
    else torso.add(B(.1, .07, .02, L(0xc9b26a), .12, .38, .13));
  }
  const neck = new THREE.Group(); neck.position.y = .48; torso.add(neck);
  const head = B(.26, .27, .26, skin, 0, .15, 0); neck.add(head);
  const eyes = L(0x15110e);
  neck.add(B(.05, .04, .02, eyes, -.065, .19, .135), B(.05, .04, .02, eyes, .065, .19, .135));
  neck.add(B(.05, .07, .05, skin, 0, .13, .14)); // nose
  if (kind === 'crook') {
    // sodium beanie, bandana up to the nose, high collar: the crew look
    neck.add(B(.29, .13, .29, headwear, 0, .3, 0));
    neck.add(B(.3, .04, .3, L(0xc9831a), 0, .245, 0));
    neck.add(B(.28, .13, .2, L(0x1c1d1f), 0, .07, .05));
    neck.add(B(.34, .1, .3, top, 0, -.01, 0));
  } else {
    neck.add(B(.28, .07, .28, headwear, 0, .3, 0));
    neck.add(B(.29, .03, .14, headwear, 0, .27, .17)); // cap brim
    neck.add(B(.12, .03, .02, L(0x3a2a20), 0, .07, .135)); // mouth
  }
  const limb = (side, isArm) => {
    const s = new THREE.Group();
    if (isArm) {
      s.position.set(side * .27, .43, 0); torso.add(s);
      s.add(B(.13, .3, .14, top, 0, -.14, 0));
      const el = new THREE.Group(); el.position.y = -.29; s.add(el);
      el.add(B(.12, .27, .12, kind === 'crook' ? top : skin, 0, -.12, 0));
      el.add(B(.12, .1, .13, gloves, 0, -.28, 0));
      return { s, el };
    }
    s.position.set(side * .11, 0, 0); hips.add(s);
    s.add(B(.15, .32, .17, legs, 0, -.16, 0));
    const kn = new THREE.Group(); kn.position.y = -.31; s.add(kn);
    kn.add(B(.14, .27, .15, legs, 0, -.13, 0));
    kn.add(B(.15, .08, .24, boots, 0, -.27, .04));
    return { s, el: kn };
  };
  const armL = limb(-1, true), armR = limb(1, true), legL = limb(-1, false), legR = limb(1, false);

  // weapon in the right hand
  const gun = new THREE.Group();
  const gm = new THREE.MeshStandardMaterial({ color: 0x1b1c1e, roughness: .4, metalness: .7 });
  gun.add(B(.07, .1, .26, gm, 0, -.02, .1));
  gun.add(B(.06, .14, .07, gm, 0, -.1, 0));
  if (kind === 'crook') gun.add(B(.06, .06, .22, gm, 0, 0, .33)); // suppressor
  gun.position.set(0, -.34, .06);
  armR.el.add(gun);
  const muzzle = new THREE.Object3D(); muzzle.position.set(0, 0, kind === 'crook' ? .46 : .25); gun.add(muzzle);
  // flashlight in the left hand for guards
  let torch = null;
  if (kind !== 'crook') {
    torch = new THREE.Group();
    torch.add(B(.06, .06, .2, L(0x2a2a2a), 0, 0, .06));
    torch.add(B(.08, .08, .03, new THREE.MeshBasicMaterial({ color: 0xfff2d6 }), 0, 0, .17));
    torch.position.set(0, -.32, .06);
    armL.el.add(torch);
  }
  const h = { kind, root, hips, torso, neck, head, armL, armR, legL, legR, gun, muzzle, torch, t: 0, fall: 0, fallDir: 1 };
  return h;
}

// Procedural animation. s = { speed (0..1.6), crouch, aim, recoil, choke (0..1 as attacker), choked, down (0..1), downKind, stagger, drag }
export function poseHuman(h, s, dt) {
  const spd = s.speed || 0;
  h.t += dt * (2 + spd * 7.5);
  const ph = h.t, sw = Math.min(1, spd);
  const c = s.crouch || 0;
  const swing = Math.sin(ph) * .75 * sw;
  const lift = Math.max(0, Math.sin(ph)) * .9 * sw, lift2 = Math.max(0, -Math.sin(ph)) * .9 * sw;
  h.hips.position.y = .62 - c * .2 + Math.abs(Math.cos(ph)) * .04 * sw;
  h.hips.rotation.set(0, 0, 0);
  h.legL.s.rotation.x = swing - c * .9; h.legL.el.rotation.x = lift2 + c * 1.5;
  h.legR.s.rotation.x = -swing - c * .9; h.legR.el.rotation.x = lift + c * 1.5;
  h.torso.rotation.set(c * .45 + sw * .12 + (s.stagger || 0) * -.5, 0, 0);
  h.neck.rotation.set(-c * .3, 0, 0);
  // arms
  const aim = s.aim || 0;
  const relaxL = -swing * .7, relaxR = swing * .7;
  h.armR.s.rotation.set(lerp(relaxR, -1.45 - c * .35 + (s.recoil || 0) * .5, aim), 0, lerp(0, .12, aim));
  h.armR.el.rotation.set(lerp(-.25, -.08, aim), 0, 0);
  h.armL.s.rotation.set(lerp(relaxL, -1.35 - c * .35, aim * (h.torch ? .9 : .8)), 0, lerp(0, -.35, aim));
  h.armL.el.rotation.set(lerp(-.25, -.3, aim), 0, 0);
  if (h.torch && !aim) { h.armL.s.rotation.x = -1.1; h.armL.el.rotation.x = -.2; }
  if (s.choke) {
    // attacker: arm locked around a neck, leaning back
    h.armR.s.rotation.set(-1.2, 0, -.9); h.armR.el.rotation.set(-1.6, 0, 0);
    h.armL.s.rotation.set(-1.4, 0, .7); h.armL.el.rotation.set(-1.5, 0, 0);
    h.torso.rotation.x = -.15 + Math.sin(h.t * 3) * .05;
  }
  if (s.stab) { h.armR.s.rotation.set(-1.8 + s.stab * 1.2, 0, .2); h.armR.el.rotation.set(-.2, 0, 0); }
  if (s.choked) {
    h.torso.rotation.x = -.35; h.neck.rotation.x = -.5;
    h.armL.s.rotation.set(-2.2 + Math.sin(h.t * 9) * .3, 0, .5); h.armR.s.rotation.set(-2.2 + Math.cos(h.t * 8) * .3, 0, -.5);
    h.legL.s.rotation.x = Math.sin(h.t * 7) * .4; h.legR.s.rotation.x = -Math.sin(h.t * 7) * .4;
  }
  if (s.drag) { h.armL.s.rotation.set(-.9, 0, 0); h.armR.s.rotation.set(-.9, 0, 0); h.torso.rotation.x = .6; }
  if (s.down) {
    // fall over: rotate the whole body around its feet, then settle limp
    const k = easeOutBounce(Math.min(1, s.down));
    h.root.children[0].rotation.x = 0;
    h.hips.position.y = lerp(h.hips.position.y, .14, k);
    h.hips.rotation.x = -h.fallDir * Math.PI / 2 * k;
    h.torso.rotation.set(0, 0, 0); h.neck.rotation.x = h.fallDir * .3 * k;
    h.legL.s.rotation.x = .1 * k; h.legR.s.rotation.x = -.15 * k; h.legL.el.rotation.x = .3 * k; h.legR.el.rotation.x = .1 * k;
    h.armL.s.rotation.set(-h.fallDir * .4 * k, 0, -1.1 * k); h.armR.s.rotation.set(h.fallDir * .3 * k, 0, 1.25 * k);
    h.armL.el.rotation.x = 0; h.armR.el.rotation.x = 0;
    if (s.downKind === 'ko') h.hips.rotation.x = -h.fallDir * Math.PI / 2 * k;
  }
}
const lerp = (a, b, t) => a + (b - a) * t;
function easeOutBounce(t) {
  if (t < .6) return (t / .6) ** 2;
  const u = (t - .8) / .2; return 1 - .06 * (1 - u * u);
}
export { yaw, hash };

// ---------- Vehicles ----------
export function makeCar(color, cop) {
  mats();
  const L = (c) => new THREE.MeshLambertMaterial({ color: c });
  const paint = new THREE.MeshStandardMaterial({ color: color === 'van' ? 0x40453f : color, roughness: .35, metalness: .3 });
  const root = new THREE.Group();
  const body = new THREE.Group(); root.add(body);
  const B = (w, h, d, m, x, y, z) => { const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); o.position.set(x, y, z); o.castShadow = true; o.receiveShadow = true; body.add(o); return o; };
  // +z is forward
  const van = color === 'van';
  if (van) {
    const vp = new THREE.MeshStandardMaterial({ color: 0x40453f, roughness: .55, metalness: .25 });
    B(1.1, .85, 2.2, vp, 0, .78, -.1);
    B(1.1, .55, .7, vp, 0, .62, 1.25);
    B(1.02, .32, .05, new THREE.MeshStandardMaterial({ color: 0x0b1015, roughness: .1, metalness: .9 }), 0, 1.0, .98);
    B(1.12, .08, 2.9, L(0x151515), 0, .32, .2);
    B(1.12, .12, .1, L(PAL.sodium), 0, .4, 1.62); // bull bar in the accent so you never lose the van
    B(.9, .04, 1.4, M.dark, 0, 1.22, -.2);
    root.userData.size = [1.1, 3.0];
  } else {
    B(1.0, .38, 2.2, paint, 0, .45, 0);
    B(.86, .34, 1.1, cop ? L(0xe8e4da) : paint, 0, .8, -.15);
    B(.84, .3, .05, new THREE.MeshStandardMaterial({ color: 0x0b1015, roughness: .1, metalness: .9 }), 0, .78, .42);
    if (cop) {
      B(1.02, .2, 2.22, L(0xe8e4da), 0, .48, 0);
      const r = B(.28, .1, .16, new THREE.MeshBasicMaterial({ color: PAL.siren }), -.18, 1.02, -.1);
      const bl = B(.28, .1, .16, new THREE.MeshBasicMaterial({ color: 0x2a5bd7 }), .18, 1.02, -.1);
      root.userData.bar = [r, bl];
    }
    root.userData.size = [1.0, 2.2];
  }
  const wheels = [];
  const wg = new THREE.CylinderGeometry(.24, .24, .2, 10); wg.rotateZ(Math.PI / 2);
  const wm = L(0x0e0e0e);
  for (const [x, z] of van ? [[-.55, 1.0], [.55, 1.0], [-.55, -.8], [.55, -.8]] : [[-.5, .7], [.5, .7], [-.5, -.7], [.5, -.7]]) {
    const w = new THREE.Mesh(wg, wm); w.position.set(x, .24, z); w.castShadow = true; body.add(w); wheels.push(w);
  }
  // headlights
  const hl = new THREE.MeshBasicMaterial({ color: 0xfff1cf });
  for (const x of [-.36, .36]) { const o = new THREE.Mesh(new THREE.BoxGeometry(.18, .1, .04), hl); o.position.set(x, van ? .62 : .5, van ? 1.61 : 1.11); body.add(o); }
  const tl = new THREE.MeshBasicMaterial({ color: 0x6b0f0f });
  for (const x of [-.4, .4]) { const o = new THREE.Mesh(new THREE.BoxGeometry(.16, .1, .04), tl); o.position.set(x, van ? .7 : .5, van ? -1.21 : -1.11); body.add(o); }
  root.userData.tail = tl;
  return { root, body, wheels };
}

// ---------- Effects ----------
export function createFx(view) {
  mats();
  const { scene } = view;
  const N = view.lowEnd ? 260 : 520;
  const cube = new THREE.BoxGeometry(1, 1, 1);
  const glowMat = new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false });
  const solidMat = new THREE.MeshLambertMaterial({ color: 0xffffff });
  const smokeMat = new THREE.MeshLambertMaterial({ color: 0xffffff, transparent: true, opacity: .45, depthWrite: false });
  const pools = {};
  for (const [k, m, n] of [['glow', glowMat, N], ['solid', solidMat, N], ['smoke', smokeMat, 120]]) {
    const mesh = new THREE.InstancedMesh(cube, m, n);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.frustumCulled = false;
    const arr = [];
    for (let i = 0; i < n; i++) { arr.push({ life: 0 }); mesh.setColorAt(i, new THREE.Color(0)); }
    scene.add(mesh);
    pools[k] = { mesh, arr, next: 0 };
  }
  const tmp = new THREE.Object3D(), col = new THREE.Color();
  const fx = {};
  fx.spawn = (kind, x, y, z, vx, vy, vz, life, size, color, opts = {}) => {
    const P = pools[kind]; const i = P.next; P.next = (P.next + 1) % P.arr.length;
    Object.assign(P.arr[i], { x, y, z, vx, vy, vz, life, max: life, size, g: opts.g ?? 9, drag: opts.drag ?? .5, grow: opts.grow ?? 0, floor: opts.floor ?? .12, spin: Math.random() * 6, stick: !!opts.stick });
    col.setHex(color); P.mesh.setColorAt(i, col); P.mesh.instanceColor.needsUpdate = true;
  };
  fx.burst = (kind, x, y, z, n, speed, color, life = .5, size = .07, opts) => {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * TAU, s = speed * (.3 + Math.random() * .7);
      const dir = opts?.dir;
      let vx = Math.cos(a) * s, vy = Math.sin(a) * s;
      if (dir !== undefined) { const da = dir + (Math.random() - .5) * (opts.spread ?? 1); vx = Math.cos(da) * s; vy = Math.sin(da) * s; }
      fx.spawn(kind, x, y, z, vx, vy, (opts?.up ?? 2) * Math.random(), life * (.6 + Math.random() * .6), size * (.6 + Math.random() * .8), color, opts);
    }
  };
  // tracers
  const tracerMat = new THREE.MeshBasicMaterial({ color: 0xffe2a8, toneMapped: false, transparent: true, opacity: .9 });
  const tracers = [];
  for (let i = 0; i < 24; i++) { const m = new THREE.Mesh(cube, tracerMat); m.visible = false; scene.add(m); tracers.push({ m, life: 0 }); }
  let tn = 0;
  fx.tracer = (x1, y1, z1, x2, y2, z2) => {
    const T = tracers[tn]; tn = (tn + 1) % tracers.length;
    const dx = x2 - x1, dy = y2 - y1, dz = z2 - z1, len = Math.hypot(dx, dy, dz);
    T.m.position.set((x1 + x2) / 2, (z1 + z2) / 2, (y1 + y2) / 2);
    T.m.lookAt(x2, z2, y2);
    T.m.scale.set(.035, .035, len); T.m.visible = true; T.life = .06;
  };
  // muzzle flash lights (few, reused)
  const flashes = [];
  for (let i = 0; i < 3; i++) { const p = new THREE.PointLight(0xffc070, 0, 6, 1.6); scene.add(p); flashes.push({ p, life: 0 }); }
  let fn = 0;
  fx.flash = (x, y, z, power = 1, color = 0xffc070) => { const F = flashes[fn]; fn = (fn + 1) % flashes.length; F.p.position.set(x, z, y); F.p.color.setHex(color); F.p.intensity = 30 * power; F.life = .07; F.power = power; };
  // floor decals: blood pools, scorch
  const decals = [];
  const disc = new THREE.CircleGeometry(1, 12); disc.rotateX(-Math.PI / 2);
  for (let i = 0; i < 90; i++) { const m = new THREE.Mesh(disc, M.blood); m.visible = false; scene.add(m); decals.push({ m, grow: 0, size: 0 }); }
  let dn = 0;
  fx.decal = (x, y, size, kind = 'blood', h = .11) => {
    const D = decals[dn]; dn = (dn + 1) % decals.length;
    D.m.material = kind === 'blood' ? M.blood : M.scorch;
    D.m.position.set(x, h + dn * .0004, y); D.m.scale.setScalar(.05); D.m.visible = true; D.size = size; D.grow = kind === 'blood' ? .6 : 6;
    D.m.rotation.y = Math.random() * TAU;
  };
  // tyre marks: never fade, just recycle
  const skidN = view.lowEnd ? 300 : 700;
  const skidMesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x050505, transparent: true, opacity: .55, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1 }), skidN);
  skidMesh.frustumCulled = false;
  for (let i = 0; i < skidN; i++) { tmp.position.set(0, -50, 0); tmp.updateMatrix(); skidMesh.setMatrixAt(i, tmp.matrix); }
  scene.add(skidMesh);
  let sn = 0;
  fx.skid = (x, y, a, h = .095) => {
    tmp.position.set(x, h, y); tmp.rotation.set(0, yaw(a), 0); tmp.scale.set(.16, 1, .26); tmp.updateMatrix();
    skidMesh.setMatrixAt(sn, tmp.matrix); sn = (sn + 1) % skidN; skidMesh.instanceMatrix.needsUpdate = true;
  };
  fx.update = (dt) => {
    for (const k in pools) {
      const P = pools[k];
      let any = false;
      P.arr.forEach((p, i) => {
        if (p.life <= 0) { if (p.was) { tmp.position.set(0, -50, 0); tmp.scale.setScalar(0); tmp.updateMatrix(); P.mesh.setMatrixAt(i, tmp.matrix); p.was = false; any = true; } return; }
        p.was = true; any = true;
        p.life -= dt;
        if (!p.stuck) {
          p.vz -= p.g * dt;
          p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
          const d = Math.max(0, 1 - p.drag * dt); p.vx *= d; p.vy *= d;
          if (p.z < p.floor) { p.z = p.floor; p.vz *= -.3; p.vx *= .6; p.vy *= .6; if (p.stick) p.stuck = true; }
          p.spin += dt * 8;
        }
        const s = p.size * (k === 'smoke' ? 1 + (1 - p.life / p.max) * p.grow : Math.min(1, p.life / p.max * 2.5));
        tmp.position.set(p.x, p.z, p.y); tmp.rotation.set(p.spin, p.spin * .7, 0); tmp.scale.setScalar(s); tmp.updateMatrix();
        P.mesh.setMatrixAt(i, tmp.matrix);
      });
      if (any) P.mesh.instanceMatrix.needsUpdate = true;
    }
    for (const T of tracers) if (T.life > 0) { T.life -= dt; if (T.life <= 0) T.m.visible = false; }
    for (const F of flashes) if (F.life > 0) { F.life -= dt; F.p.intensity = F.life > 0 ? 30 * F.power * (F.life / .07) : 0; }
    for (const D of decals) if (D.m.visible && D.m.scale.x < D.size) D.m.scale.setScalar(Math.min(D.size, D.m.scale.x + dt * D.grow * D.size));
  };
  fx.clear = () => {
    for (const k in pools) pools[k].arr.forEach(p => { p.life = 0; });
    decals.forEach(D => { D.m.visible = false; });
    tracers.forEach(T => { T.m.visible = false; T.life = 0; });
    for (let i = 0; i < skidN; i++) { tmp.position.set(0, -50, 0); tmp.rotation.set(0, 0, 0); tmp.scale.setScalar(1); tmp.updateMatrix(); skidMesh.setMatrixAt(i, tmp.matrix); }
    skidMesh.instanceMatrix.needsUpdate = true;
  };
  return fx;
}

// Overhead marks for guards: wordless glyphs drawn once to canvas textures.
export function makeMark(kind) {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const x = c.getContext('2d');
  x.lineWidth = 6; x.lineJoin = 'round';
  if (kind === 'alert') {
    x.fillStyle = '#d6312b'; x.beginPath(); x.moveTo(32, 4); x.lineTo(60, 56); x.lineTo(4, 56); x.closePath(); x.fill();
    x.fillStyle = '#0d0f12'; x.fillRect(29, 20, 6, 20); x.fillRect(29, 44, 6, 6);
  } else if (kind === 'sus') {
    x.strokeStyle = '#f5a623'; x.beginPath(); x.arc(32, 32, 24, 0, TAU); x.stroke();
    x.fillStyle = '#f5a623'; x.fillRect(29, 18, 6, 18); x.fillRect(29, 40, 6, 6);
  } else if (kind === 'radio') {
    x.strokeStyle = '#d6312b';
    for (const r of [10, 20, 28]) { x.beginPath(); x.arc(32, 46, r, -Math.PI * .8, -Math.PI * .2); x.stroke(); }
    x.fillStyle = '#d6312b'; x.beginPath(); x.arc(32, 46, 5, 0, TAU); x.fill();
  } else if (kind === 'ko') {
    x.strokeStyle = '#cfc6b2'; x.lineWidth = 5;
    for (let i = 0; i < 3; i++) { x.beginPath(); x.arc(14 + i * 18, 34, 8, Math.PI, 0); x.stroke(); }
  }
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
  sp.scale.set(.5, .5, 1); sp.renderOrder = 10;
  return sp;
}

export function makeBag() {
  mats();
  const g = new THREE.Group();
  const b = new THREE.Mesh(new THREE.CapsuleGeometry(.17, .34, 3, 8), M.bag); b.rotation.z = Math.PI / 2; b.position.y = .2; b.castShadow = true;
  const s = new THREE.Mesh(new THREE.BoxGeometry(.06, .36, .36), M.strap); s.position.y = .2;
  const h = new THREE.Mesh(new THREE.TorusGeometry(.1, .02, 4, 8, Math.PI), M.dark); h.position.y = .36;
  g.add(b, s, h);
  return g;
}

export function makeCamera() {
  mats();
  const g = new THREE.Group();
  const arm = new THREE.Mesh(new THREE.BoxGeometry(.06, .06, .3), M.metal); arm.position.set(0, 0, -.15);
  const head = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(.18, .16, .36), new THREE.MeshLambertMaterial({ color: 0xbdb7a8 }));
  const eye = new THREE.Mesh(new THREE.BoxGeometry(.06, .06, .02), new THREE.MeshBasicMaterial({ color: PAL.siren }));
  eye.position.set(0, 0, .19);
  body.castShadow = true;
  head.add(body, eye); head.rotation.x = .5;
  g.add(arm, head);
  return { g, head, eye };
}
