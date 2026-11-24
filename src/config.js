// World layout & game constants
export const WORLD = {
  size: 640,
  seg: 320,
  water: 0,
  islandRadius: 205,
};

// Zones of the island. Each zone gets "restored" (colour/life returns) by the player.
export const ZONES = {
  center:    { id: 0, name: '하늘나무 언덕', x: 0,    z: 0,    r: 70 },
  meadow:    { id: 1, name: '바람꽃 초원',   x: 0,    z: 132,  r: 92 },
  lake:      { id: 2, name: '달빛 호수',     x: 135,  z: -5,   r: 82 },
  forest:    { id: 3, name: '속삭임 숲',     x: -135, z: 5,    r: 92 },
  highlands: { id: 4, name: '구름 고원',     x: 0,    z: -138, r: 92 },
};

export const LAKE = { x: 135, z: -5, r: 44, islet: { x: 156, z: 2 } };
export const PLATEAU = { x: 0, z: -140, r: 50, height: 26, peak: { x: 10, z: -150 } };
export const POND = { x: 46, z: -92 };

// Dirt paths: polylines from the tree hill to each land
export const PATHS = [
  [[0, 14], [6, 45], [-4, 80], [2, 108]],
  [[14, 0], [45, -6], [72, 4], [90, -2]],
  [[-14, 2], [-45, 10], [-80, -2], [-105, 6]],
  [[0, -14], [-6, -40], [6, -66], [14, -84]],
];

export const PLAYER = {
  walk: 6.2,
  run: 10.5,
  jump: 11,
  gravity: 26,
  radius: 0.45,
};

export const DAY_LENGTH = 600; // seconds for a full day
