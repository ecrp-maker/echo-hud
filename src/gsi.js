const WEAPONS = {
  weapon_ak47: 'AK-47',
  weapon_m4a1: 'M4A4',
  weapon_m4a1_silencer: 'M4A1-S',
  weapon_awp: 'AWP',
  weapon_aug: 'AUG',
  weapon_famas: 'FAMAS',
  weapon_galilar: 'GALIL',
  weapon_sg556: 'SG 553',
  weapon_mp9: 'MP9',
  weapon_mac10: 'MAC-10',
  weapon_mp7: 'MP7',
  weapon_mp5sd: 'MP5-SD',
  weapon_ump45: 'UMP-45',
  weapon_p90: 'P90',
  weapon_bizon: 'PP-BIZON',
  weapon_nova: 'NOVA',
  weapon_xm1014: 'XM1014',
  weapon_mag7: 'MAG-7',
  weapon_sawedoff: 'SAWED-OFF',
  weapon_m249: 'M249',
  weapon_negev: 'NEGEV',
  weapon_deagle: 'DEAGLE',
  weapon_elite: 'DUAL',
  weapon_fiveseven: 'FIVE-SEVEN',
  weapon_glock: 'GLOCK',
  weapon_hkp2000: 'P2000',
  weapon_usp_silencer: 'USP-S',
  weapon_p250: 'P250',
  weapon_cz75a: 'CZ75',
  weapon_tec9: 'TEC-9',
  weapon_revolver: 'R8',
  weapon_taser: 'ZEUS',
  weapon_hegrenade: 'HE',
  weapon_flashbang: 'FLASH',
  weapon_smokegrenade: 'SMOKE',
  weapon_molotov: 'MOLOTOV',
  weapon_incgrenade: 'INCENDIARY',
  weapon_decoy: 'DECOY',
  weapon_c4: 'C4',
};

const MAPS = {
  de_dust2: 'DUST II',
  de_mirage: 'MIRAGE',
  de_inferno: 'INFERNO',
  de_nuke: 'NUKE',
  de_overpass: 'OVERPASS',
  de_ancient: 'ANCIENT',
  de_anubis: 'ANUBIS',
  de_vertigo: 'VERTIGO',
  de_train: 'TRAIN',
  de_cache: 'CACHE',
  de_office: 'OFFICE',
  cs_office: 'OFFICE',
  cs_italy: 'ITALY',
};

function mapLabel(name) {
  if (!name) return '';
  if (MAPS[name]) return MAPS[name];
  return String(name).replace(/^de_|^cs_/, '').replace(/_/g, ' ').toUpperCase();
}

function weaponLabel(name) {
  if (!name) return '';
  if (name.startsWith('weapon_knife') || name === 'weapon_bayonet') return 'KNIFE';
  return WEAPONS[name] || String(name).replace(/^weapon_/, '').replace(/_/g, ' ').toUpperCase();
}

function clamp(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, Math.round(n)));
}

function side(settings, which, gsiName, score, losses) {
  const custom = which === 'ct' ? settings.ctName : settings.tName;
  const color = which === 'ct' ? settings.ctColor : settings.tColor;
  const fallback = which === 'ct' ? '#8ecbff' : '#f0b45a';
  const lost = Number(losses);
  return {
    name: String(custom || '').trim() || gsiName || (which === 'ct' ? 'CT' : 'T'),
    score: Number.isFinite(Number(score)) ? Number(score) : 0,
    color: /^#[0-9a-fA-F]{6}$/.test(color || '') ? color : fallback,
    losses: Number.isFinite(lost) ? Math.max(0, Math.min(4, lost)) : 0,
  };
}

function weaponList(weapons) {
  if (!weapons) return [];
  return Array.isArray(weapons) ? weapons : Object.values(weapons);
}

function grenadeKind(name) {
  const n = String(name || '');
  if (n.includes('flash')) return 'flashbang';
  if (n.includes('smoke')) return 'smokegrenade';
  if (n.includes('molotov')) return 'molotov';
  if (n.includes('inc')) return 'incgrenade';
  if (n.includes('decoy')) return 'decoy';
  return 'hegrenade';
}

function isGrenade(item) {
  const name = item.name || '';
  const type = String(item.type || '').toLowerCase();
  return type.includes('grenade') || /flashbang|hegrenade|smokegrenade|molotov|incgrenade|decoy/.test(name);
}

function readWeapon(weapons) {
  const list = weaponList(weapons).filter(Boolean);
  const grenades = [];
  let primary = null;
  let pistol = null;
  let active = null;
  for (const item of list) {
    const name = item.name || '';
    if (!name || name === 'weapon_c4') continue;
    if (isGrenade(item)) {
      const reserve = Number(item.ammo_reserve);
      const count = name.includes('flash') && reserve > 1 ? Math.min(2, reserve) : 1;
      for (let i = 0; i < count && grenades.length < 4; i += 1) grenades.push(grenadeKind(name));
      continue;
    }
    const type = String(item.type || '').toLowerCase();
    if (type.includes('knife') || /knife|bayonet/.test(name)) continue;
    if (item.state === 'active') active = item;
    if (type.includes('pistol')) pistol = pistol || item;
    else primary = primary || item;
  }
  const shown = primary || pistol || active;
  const ranged = shown && shown.ammo_clip != null && !/knife|grenade/i.test(shown.type || '');
  const weaponId = !shown ? '' : (String(shown.name).startsWith('weapon_knife') || shown.name === 'weapon_bayonet')
    ? 'knife'
    : String(shown.name).replace(/^weapon_/, '');
  return {
    weapon: shown ? weaponLabel(shown.name) : '',
    weaponId,
    clip: ranged ? Number(shown.ammo_clip) : null,
    reserve: ranged && shown.ammo_reserve != null ? Number(shown.ammo_reserve) : null,
    reloading: !!(active && active.state === 'reloading'),
    hasBomb: list.some((item) => item.name === 'weapon_c4'),
    grenades,
  };
}

function vec(value) {
  if (!value) return null;
  if (typeof value === 'object' && value.x != null && value.y != null) {
    const x = Number(value.x);
    const y = Number(value.y);
    const z = Number(value.z);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
    return { x, y, z: Number.isFinite(z) ? z : 0 };
  }
  const parts = String(value).split(',').map((part) => Number(String(part).trim()));
  if (parts.length < 2 || !Number.isFinite(parts[0]) || !Number.isFinite(parts[1])) return null;
  return { x: parts[0], y: parts[1], z: Number.isFinite(parts[2]) ? parts[2] : 0 };
}

function mapPlayer(steamid, player, observedId) {
  if (!player || (player.team !== 'CT' && player.team !== 'T')) return null;
  const state = player.state || {};
  const stats = player.match_stats || {};
  const weapon = readWeapon(player.weapons);
  return {
    steamid: String(steamid || player.steamid || ''),
    name: player.name || 'player',
    position: vec(player.position || state.position),
    forward: vec(player.forward || state.forward),
    team: player.team,
    slot: Number.isFinite(Number(player.observer_slot)) ? Number(player.observer_slot) : 99,
    observed: !!(observedId && steamid === observedId),
    health: clamp(state.health),
    armor: clamp(state.armor),
    helmet: !!state.helmet,
    kit: !!state.defusekit,
    flashed: Number(state.flashed) || 0,
    money: state.money == null ? null : Number(state.money),
    kills: Number(stats.kills) || 0,
    assists: Number(stats.assists) || 0,
    deaths: Number(stats.deaths) || 0,
    mvps: Number(stats.mvps) || 0,
    roundKills: Number(state.round_kills) || 0,
    roundHs: Number(state.round_killhs) || 0,
    roundDmg: Number(state.round_totaldmg ?? state.round_total_damage) || 0,
    matchDmg: Number(stats.damage ?? stats.total_damage) || 0,
    ...weapon,
  };
}

const hurt = new Map();

function adrFor(id, roundDmg, matchDmg, round, mapName) {
  if (!id || !mapName) return 0;
  const played = Math.max(1, Number(round) || 1);
  const match = Number(matchDmg) || 0;
  if (match > 0) return Math.round(match / played);
  const key = mapName + ':' + id;
  let row = hurt.get(key);
  if (!row) {
    row = { total: 0, round, peak: 0 };
    hurt.set(key, row);
  }
  const dealt = Number(roundDmg) || 0;
  if (row.round !== round) {
    row.total += row.peak;
    row.peak = dealt;
    row.round = round;
  } else if (dealt > row.peak) {
    row.peak = dealt;
  }
  if (hurt.size > 40) {
    for (const saved of hurt.keys()) {
      if (!String(saved).startsWith(mapName + ':')) hurt.delete(saved);
    }
  }
  return Math.round((row.total + row.peak) / played);
}

function emptyGame(settings) {
  return {
    map: '',
    mapLabel: '',
    phase: '',
    roundPhase: '',
    round: 0,
    time: null,
    winTeam: '',
    bomb: { state: '', countdown: null },
    ct: side(settings, 'ct', '', 0),
    t: side(settings, 't', '', 0),
    ctPlayers: [],
    tPlayers: [],
    roundWins: [],
  };
}

function roundHistory(map) {
  const raw = map && map.round_wins;
  if (!raw || typeof raw !== 'object') return [];
  return Object.keys(raw).map((key) => ({
    round: Number(key),
    result: String(raw[key] || ''),
  })).filter((item) => item.round > 0).sort((a, b) => a.round - b.round);
}

const fs = require('fs');
const path = require('path');

const remembered = [];
let rememberedMap = '';

function roundsFile() {
  if (!process.env.APPDATA) return '';
  return path.join(process.env.APPDATA, 'ECHO HUD', 'rounds.json');
}

function saveRemembered() {
  const file = roundsFile();
  if (!file) return;
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify({ map: rememberedMap, rounds: remembered }));
  } catch {
    /* disk full or locked */
  }
}

function loadRemembered() {
  const file = roundsFile();
  if (!file || !fs.existsSync(file)) return;
  try {
    const data = JSON.parse(fs.readFileSync(file, 'utf8'));
    const rounds = Array.isArray(data.rounds) ? data.rounds : [];
    rememberedMap = String(data.map || '');
    for (const item of rounds) {
      const round = Number(item && item.round) || 0;
      const result = String(item && item.result || '');
      if (round > 0 && (result.startsWith('ct') || result.startsWith('t'))) {
        remembered.push({ round, result });
      }
    }
  } catch {
    /* ignore a broken file */
  }
}

loadRemembered();

function rememberRounds(map, round) {
  const name = (map && map.name) || '';
  if (name && name !== rememberedMap) {
    rememberedMap = name;
    remembered.length = 0;
    saveRemembered();
  }
  const winner = round && round.win_team;
  const n = Number(map && map.round) || 0;
  if (round && round.phase === 'over' && n > 0 && (winner === 'CT' || winner === 'T')) {
    if (!remembered.some((item) => item.round === n)) {
      remembered.push({ round: n, result: winner === 'CT' ? 'ct_win' : 't_win' });
      saveRemembered();
    }
  }
  return remembered.slice();
}

function normalize(raw, settings) {
  const map = raw.map || {};
  const round = raw.round || {};
  const countdown = raw.phase_countdowns || {};
  const bomb = raw.bomb || {};
  const observedId = raw.player && raw.player.steamid;
  const players = [];

  if (raw.allplayers && typeof raw.allplayers === 'object') {
    for (const [steamid, player] of Object.entries(raw.allplayers)) {
      const mapped = mapPlayer(steamid, player, observedId);
      if (mapped) players.push(mapped);
    }
  } else if (raw.player) {
    const mapped = mapPlayer(raw.player.steamid, raw.player, observedId);
    if (mapped) players.push(mapped);
  }

  players.sort((a, b) => a.slot - b.slot);
  const mapName = map.name || '';
  const roundNo = Number(map.round) || 0;
  for (const player of players) {
    player.adr = adrFor(player.steamid, player.roundDmg, player.matchDmg, roundNo, mapName);
  }
  const hold = String(countdown.phase || '');
  const roundPhase = hold === 'paused' || hold === 'timeout_ct' || hold === 'timeout_t'
    ? hold
    : (round.phase || hold || '');
  const bombState = bomb.state || round.bomb || '';
  const bombCountdown = bomb.countdown == null ? null : Number(bomb.countdown);

  return {
    map: map.name || '',
    mapLabel: mapLabel(map.name),
    phase: map.phase || '',
    roundPhase,
    round: Number(map.round) || 0,
    time: countdown.phase_ends_in == null ? null : Number(countdown.phase_ends_in),
    winTeam: round.win_team === 'CT' || round.win_team === 'T' ? round.win_team : '',
    bomb: {
      state: bombState,
      countdown: Number.isFinite(bombCountdown) ? bombCountdown : null,
      player: bomb.player ? String(bomb.player) : '',
      position: vec(bomb.position),
    },
    ct: side(settings, 'ct', map.team_ct && map.team_ct.name, map.team_ct && map.team_ct.score, map.team_ct && map.team_ct.consecutive_round_losses),
    t: side(settings, 't', map.team_t && map.team_t.name, map.team_t && map.team_t.score, map.team_t && map.team_t.consecutive_round_losses),
    ctPlayers: players.filter((player) => player.team === 'CT').slice(0, 5),
    tPlayers: players.filter((player) => player.team === 'T').slice(0, 5),
    roundWins: roundHistory(map).length ? roundHistory(map) : rememberRounds(map, round),
  };
}

module.exports = { normalize, emptyGame, side, mapLabel };
