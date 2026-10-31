const { side } = require('./gsi');

const CT = [
  { name: 'kore', health: 100, armor: 100, helmet: true, kit: true, money: 4650, kills: 16, assists: 4, deaths: 9, weapon: 'M4A1-S', clip: 18, reserve: 60, grenades: ['flash', 'smoke'] },
  { name: 'nima', health: 86, armor: 100, helmet: true, kit: false, money: 2100, kills: 11, assists: 2, deaths: 10, weapon: 'AWP', clip: 6, reserve: 20, grenades: ['he'] },
  { name: 'west', health: 24, armor: 55, helmet: false, kit: true, money: 800, kills: 7, assists: 6, deaths: 12, weapon: 'DEAGLE', clip: 4, reserve: 14, grenades: ['flash'] },
  { name: 'pulp', health: 0, armor: 0, helmet: false, kit: false, money: 1800, kills: 9, assists: 1, deaths: 13, weapon: 'AK-47', clip: 0, reserve: 30 },
  { name: 'gray', health: 71, armor: 92, helmet: true, kit: false, money: 3400, kills: 8, assists: 5, deaths: 11, weapon: 'MP9', clip: 22, reserve: 90 },
];

const T = [
  { name: 'oren', health: 100, armor: 100, helmet: true, kit: false, money: 5200, kills: 18, assists: 3, deaths: 8, weapon: 'AK-47', clip: 24, reserve: 90, grenades: ['smoke', 'fire'] },
  { name: 'sable', health: 64, armor: 88, helmet: true, kit: false, money: 2750, kills: 12, assists: 4, deaths: 11, weapon: 'AWP', clip: 4, reserve: 18 },
  { name: 'juno', health: 41, armor: 40, helmet: false, kit: false, money: 1500, kills: 6, assists: 7, deaths: 13, weapon: 'GALIL', clip: 12, reserve: 60 },
  { name: 'rico', health: 0, armor: 0, helmet: false, kit: false, money: 900, kills: 5, assists: 2, deaths: 14, weapon: 'GLOCK', clip: 0, reserve: 40 },
  { name: 'vex', health: 92, armor: 100, helmet: true, kit: false, money: 3900, kills: 10, assists: 3, deaths: 9, weapon: 'MAC-10', clip: 18, reserve: 70 },
];

function person(base, extra) {
  const health = extra.health == null ? base.health : extra.health;
  return {
    ...base,
    team: extra.team,
    slot: extra.slot,
    name: base.name,
    health,
    armor: health > 0 ? base.armor : 0,
    clip: health > 0 ? base.clip : null,
    reserve: health > 0 ? base.reserve : null,
    reloading: false,
    observed: !!extra.observed,
    flashed: extra.flashed || 0,
    hasBomb: !!extra.hasBomb,
    position: extra.position || null,
    kit: !!base.kit && health > 0,
    helmet: !!base.helmet && health > 0,
    adr: Math.round((base.kills * 86 + base.assists * 18) / 8),
  };
}

function build(nowSec, settings) {
  const cycle = 70;
  const clock = nowSec + 45;
  const t = clock % cycle;
  const done = Math.floor(clock / cycle);
  let ctScore = 8;
  let tScore = 6;
  for (let i = 0; i < done; i += 1) {
    if (i % 2 === 0) tScore += 1;
    else ctScore += 1;
  }

  const bombRound = done % 2 === 0;
  let roundPhase = 'live';
  let time = Math.max(0, 100 - Math.max(0, t - 12));
  let winTeam = '';
  let bomb = { state: '', countdown: null };

  if (t < 12) {
    roundPhase = 'freezetime';
    time = 12 - t;
  } else if (bombRound && t >= 40 && t < 68) {
    bomb = { state: 'planted', countdown: 70 - t };
  } else if (t >= 68) {
    roundPhase = 'over';
    winTeam = bombRound ? 'T' : 'CT';
    time = 0;
    if (bombRound) bomb = { state: 'exploded', countdown: null };
  }

  const flashed = Math.sin(clock) > 0.45;
  const ctSpots = [[-1480, -620], [-980, -180], [-620, 260], [-180, 640], [220, 980]];
  const ctPlayers = CT.map((base, index) => person(base, {
    team: 'CT',
    slot: index + 1,
    observed: false,
    flashed: base.name === 'gray' && flashed ? 210 : 0,
    position: { x: ctSpots[index][0], y: ctSpots[index][1], z: 0 },
  }));
  const alive = ctPlayers.filter((player) => player.health > 0);
  if (alive.length) alive[Math.floor(clock / 6) % alive.length].observed = true;

  const planted = bomb.state === 'planted' || bomb.state === 'exploded';
  const tSpots = [[420, -1040], [860, -520], [1240, 40], [1680, 480], [2100, 920]];
  const tPlayers = T.map((base, index) => person(base, {
    team: 'T',
    slot: index + 6,
    observed: false,
    hasBomb: !planted && base.name === 'oren',
    position: { x: tSpots[index][0], y: tSpots[index][1], z: 0 },
  }));

  return {
    map: 'de_mirage',
    mapLabel: 'MIRAGE',
    phase: 'live',
    roundPhase,
    round: ctScore + tScore + 1,
    time,
    winTeam,
    bomb,
    ct: side(settings, 'ct', '', ctScore, 1),
    t: side(settings, 't', '', tScore, 0),
    ctPlayers,
    tPlayers,
  };
}

module.exports = { build };
