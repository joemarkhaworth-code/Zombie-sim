// All tuning numbers live here.
export const CONFIG = {
  grid: { width: 20, height: 28 },
  testGrid: { wallChance: 0.08 },   // chance a floor tile becomes a wall block
  view: { tilesAcross: 11 },        // camera width in tiles (odd keeps the player centred)
  input: {
    tapMaxMs: 500, tapMaxMovePx: 20,
    waitRadiusTiles: 0.7,            // tap this close to the player = wait
  },
  colours: {
    background: '#000000',
    floor: '#203020',
    wall: '#707070',
    player: '#ffff00',
    playerText: '#000000',
    statusBg: '#0000aa',
    statusText: '#ffffff',
  },
};
