// Level layouts. Maps are stamped onto a city grid so the streets around a job are big enough to drive.
// Tiles:  B building   , road   _ pavement   X exit (road off the map)
//         # wall   w window   d door   D locked door   Q vault door
//         . floor  m marble   v vault floor   k counter
//         l street lamp   h hydrant   t bin   c parked car
//         P player start   V van   L cash bag   C camera   o ceiling light (floor)

function city(W, H, roadsX, roadsY, exits) {
  const g = Array.from({ length: H }, () => Array(W).fill('B'));
  const set = (x, y, c) => { if (x >= 0 && y >= 0 && x < W && y < H) g[y][x] = c; };
  // each road is 3 tiles wide with a pavement on both sides
  for (const y0 of roadsY) for (let x = 0; x < W; x++) {
    for (const y of [y0 - 1, y0 + 3]) if (g[y]?.[x] === 'B') set(x, y, '_');
    for (let y = y0; y < y0 + 3; y++) set(x, y, ',');
  }
  for (const x0 of roadsX) for (let y = 0; y < H; y++) {
    for (const x of [x0 - 1, x0 + 3]) if (g[y]?.[x] === 'B') set(x, y, '_');
    for (let x = x0; x < x0 + 3; x++) set(x, y, ',');
  }
  // roads that run off the edge: only the listed exits are open, the rest are closed by buildings
  for (let y = 0; y < H; y++) for (const x of [0, W - 1]) if (g[y][x] === ',' || g[y][x] === '_') set(x, y, 'B');
  for (let x = 0; x < W; x++) for (const y of [0, H - 1]) if (g[y][x] === ',' || g[y][x] === '_') set(x, y, 'B');
  for (const [x, y] of exits) set(x, y, 'X');
  return { g, set };
}

function stamp(c, x0, y0, rows) {
  rows.forEach((r, y) => [...r].forEach((ch, x) => { if (ch !== ' ') c.set(x0 + x, y0 + y, ch); }));
}

function lampsAlong(c, every, seed) {
  const { g } = c, H = g.length, W = g[0].length;
  const road = (x, y) => g[y]?.[x] === ',';
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (g[y][x] !== '_') continue;
    // count along the kerb: x for roads above/below, y for roads to the side
    const along = road(x, y - 1) || road(x, y + 1) ? x : road(x - 1, y) || road(x + 1, y) ? y : -1;
    if (along < 0) continue;
    const k = (along + seed) % every;
    if (k === 0) g[y][x] = 'l';
    else if (k === Math.floor(every / 2) && (x * 7 + y * 3) % 4 === 0) g[y][x] = (x + y) % 2 ? 'h' : 't';
  }
}

function finish(c) { return c.g.map(r => r.join('')); }

// ---------- Training: a corner shop ----------
function trainingMap() {
  const c = city(30, 20, [], [13], [[29, 13], [29, 14], [29, 15]]);
  stamp(c, 3, 2, [
    '#################',
    '#o.....#........#',
    '#......#..C.....#',
    '#......d......L.#',
    '#......#........#',
    '#..o...#...o....#',
    '#......#........#',
    '#......#........#',
    '#......#........#',
    '###d#####ww######'
  ]);
  lampsAlong(c, 7, 2);
  c.set(5, 12, '_'); c.set(6, 12, '_');
  c.set(4, 12, 'P'); c.set(9, 13, 'V');
  c.set(16, 15, 'c'); c.set(23, 13, 'c');
  return finish(c);
}

// ---------- Job 01: First National ----------
function bankMap() {
  const c = city(46, 34, [3, 38], [3, 26], [[3, 33], [4, 33], [5, 33], [0, 26], [0, 27], [0, 28]]);
  stamp(c, 12, 8, [
    '####ww####dd####ww####',
    '#mmmmmmmmmmmmmmmmmmmm#',
    '#mmmmmmmmmmmmmmmmmmmm#',
    '#mmkkkkkkkmmkkkkkkkmm#',
    '#m................L.m#',
    '#m..o..........o....m#',
    '####d#######d######d##',
    '#.....#.........#....#',
    '#..L..#.........#..L.#',
    '#..o..D....o....d..o.#',
    '#######.........######',
    '#.....#.........#vvvv#',
    '#.LL..#.........#vLLv#',
    '#..o..d....o....Qvvvv#',
    '#.....#.........#vLLv#',
    '##########dd##########'
  ]);
  // forecourt and a back alley into the block
  for (let x = 9; x < 37; x++) { c.set(x, 7, '_'); c.set(x, 24, '_'); }
  for (let y = 7; y < 25; y++) { c.set(9, y, '_'); c.set(10, y, '_'); c.set(36, y, '_'); }
  for (let x = 11; x < 36; x++) c.set(x, 24, '_');
  for (let y = 7; y <= 24; y++) for (const x of [7, 8]) if (c.g[y][x] === 'B' && y > 16 && y < 20) c.set(x, y, '_');
  lampsAlong(c, 6, 1);
  for (const [x, y] of [[11, 7], [23, 7], [34, 7], [11, 24], [30, 24]]) c.set(x, y, 'l');
  c.set(22, 6, 'P'); c.set(29, 5, 'V');
  for (const [x, y] of [[14, 4], [33, 3], [5, 12], [39, 18], [20, 28], [40, 9], [9, 27]]) c.set(x, y, 'c');
  return finish(c);
}

// ---------- Job 02: Marlow Jewellers (tight, lots of glass, more guards) ----------
function jewelMap() {
  const c = city(40, 30, [3, 33], [3, 22], [[39, 22], [39, 23], [39, 24]]);
  stamp(c, 9, 8, [
    '####wwww##dd##wwww####',
    '#mmmmmmmmmmmmmmmmmmmm#',
    '#mkkmmkkmmmmmmkkmmkkm#',
    '#mmmmmmmmmmmmmmmmmmmm#',
    '#mLmmmmmmmmommmmmmmLm#',
    '#mkkmmkkmmmmmmkkmmkkm#',
    '#mmmmmmmmmmmmmmmmmmmm#',
    '#####d########d#######',
    '#..o..#..L..#...o..L.#',
    '#.....D.....D........#',
    '#.L...#..o..#........#',
    '#######.....####d#####',
    '      #..L..Q.......w',
    '      ##############'
  ]);
  for (let x = 6; x < 33; x++) c.set(x, 7, '_');
  for (let y = 7; y < 22; y++) { c.set(6, y, '_'); c.set(7, y, '_'); c.set(31, y, '_'); c.set(32, y, '_'); }
  lampsAlong(c, 5, 3);
  for (const [x, y] of [[8, 7], [20, 7], [29, 7], [7, 15]]) c.set(x, y, 'l');
  c.set(10, 7, 'P'); c.set(12, 5, 'V');
  for (const [x, y] of [[20, 4], [26, 3], [4, 14], [34, 12], [15, 24]]) c.set(x, y, 'c');
  return finish(c);
}

// ---------- Sandbox: open block, everything unlocked ----------
function sandboxMap() {
  const c = city(48, 40, [3, 22, 41], [3, 20, 33], [[47, 3], [47, 4], [47, 5], [0, 33], [0, 34], [0, 35]]);
  stamp(c, 8, 8, [
    '#########ww#',
    '#....o.....#',
    '#.L........d',
    '#......L...#',
    '#..o.......#',
    '#####d######'
  ]);
  stamp(c, 27, 8, [
    '##ww#####ww#',
    '#mmmmmmmmmm#',
    'dmmmmLmmmmm#',
    '#mmkkkkkkmm#',
    '#mmmmommmmm#',
    '######d#####'
  ]);
  stamp(c, 10, 24, [
    '##########',
    '#..o...L.#',
    '#........d',
    '#vvv.....#',
    '#vLvQ..o.#',
    '##########'
  ]);
  lampsAlong(c, 6, 0);
  c.set(20, 13, 'P'); c.set(24, 18, 'V');
  for (const [x, y] of [[14, 4], [30, 21], [42, 12], [4, 26], [36, 35]]) c.set(x, y, 'c');
  for (let y = 7; y < 18; y++) for (const x of [6, 7, 20, 21, 25, 26, 39, 40]) if (c.g[y][x] === 'B') c.set(x, y, '_');
  for (let x = 7; x < 40; x++) if (c.g[7][x] === 'B') c.set(x, 7, '_');
  for (let x = 7; x < 40; x++) if (c.g[15][x] === 'B') c.set(x, 15, '_');
  for (let y = 23; y < 31; y++) for (const x of [8, 9, 20, 21]) if (c.g[y][x] === 'B') c.set(x, y, '_');
  return finish(c);
}

const A = Math.PI;
export const LEVELS = {
  train: {
    name: 'Corner shop', tag: 'Training', map: trainingMap(), tutorial: true, bag: 5000,
    // guard stands facing the wall, flashlight on the shelves
    guards: [{ path: [[6.5, 6.5]], face: -A / 2, still: true, unarmed: true }],
    cams: [{ a: A * .75, sweep: .0, tutorial: true }],
    police: 0
  },
  bank: {
    name: 'First National', tag: 'Job 01', map: bankMap(), bag: 25000,
    guards: [
      { path: [[14.5, 9.8], [31.5, 9.8]] },
      { path: [[13.5, 12.5], [30.5, 12.5], [30.5, 13.5], [13.5, 13.5]], wait: 1.2 },
      { path: [[23.5, 15.5], [23.5, 22.5], [21.5, 22.5], [21.5, 15.5]] },
      { path: [[30.5, 20.5]], face: A, still: true },
      { path: [[13.5, 7.4], [35.5, 7.4]], outside: true },
      { path: [[14.5, 21.5], [16.5, 18.5]], wait: 2 }
    ],
    cams: [{ a: A * .75, sweep: .7 }, { a: A * .5, sweep: .9 }, { a: A * .75, sweep: .5 }],
    camAt: [[32.5, 9.5], [27.5, 15.5], [32.5, 19.5]],
    police: 3
  },
  jewel: {
    name: 'Marlow Jewellers', tag: 'Job 02', map: jewelMap(), bag: 40000,
    guards: [
      { path: [[11.5, 9.5], [28.5, 9.5], [28.5, 14.5], [11.5, 14.5]] },
      { path: [[28.5, 11.5], [11.5, 11.5]] },
      { path: [[13.5, 17.5], [13.5, 18.5]], face: 0, wait: 3 },
      { path: [[24.5, 16.5], [29.5, 17.5]], wait: 1.5 },
      { path: [[18.5, 20.5], [24.5, 20.5]] },
      { path: [[8.5, 7.4], [30.5, 7.4], [31.5, 20.5], [7.5, 20.5]], outside: true },
      { path: [[20.5, 13.5]], face: A / 2, still: true }
    ],
    cams: [{ a: A * .25, sweep: .8 }, { a: A * .75, sweep: .8 }, { a: A * .5, sweep: .6 }],
    camAt: [[10.5, 9.5], [29.5, 9.5], [17.5, 16.5]],
    police: 4
  },
  sandbox: {
    name: 'Open block', tag: 'Sandbox', map: sandboxMap(), bag: 10000, sandbox: true,
    guards: [
      { path: [[10.5, 10.5], [17.5, 10.5]] }, { path: [[29.5, 10.5], [36.5, 12.5]] },
      { path: [[12.5, 26.5], [17.5, 27.5]] }, { path: [[20.5, 18.5], [36.5, 18.5]], outside: true },
      { path: [[5.5, 8.5], [5.5, 30.5]], outside: true }
    ],
    cams: [{ a: A * .75, sweep: .7 }], camAt: [[37.5, 9.5]],
    police: 3
  }
};
