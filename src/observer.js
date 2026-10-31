const DWELL_MS = 18000;
const KILL_MS = 14000;
const MIN_HOLD_MS = 10000;
const FAIL_MS = 2000;
const FIGHT_RANGE = 750;
const APPROACH_RANGE = 1400;

function gap(a, b) {
  if (!a.position || !b.position) return Infinity;
  const dx = a.position.x - b.position.x;
  const dy = a.position.y - b.position.y;
  const dz = (a.position.z - b.position.z) * 0.35;
  return Math.hypot(dx, dy, dz);
}

function lookingAt(me, other) {
  if (!me.forward || !me.position || !other.position) return false;
  const dx = other.position.x - me.position.x;
  const dy = other.position.y - me.position.y;
  const dz = other.position.z - me.position.z;
  const len = Math.hypot(dx, dy, dz) || 1;
  const dot = (me.forward.x * dx + me.forward.y * dy + me.forward.z * dz) / len;
  return dot > 0.55;
}

function cleanName(name) {
  return String(name || '').replace(/["\r\n;\\]/g, '').trim().slice(0, 32);
}

function createObserver(send) {
  let memory = new Map();
  let locked = '';
  let since = 0;
  let until = 0;
  let busy = false;
  let nextTry = 0;
  let queued = null;
  let lastCount = 0;
  let con = null;
  let posTold = false;
  let roster = [];

  function playersOf(game) {
    return [...(game.ctPlayers || []), ...(game.tPlayers || [])];
  }

  function interest(me, other) {
    let score = me.health;
    if (me.weapon === 'AWP') score += 20;
    if (me.hasBomb) score += 12;
    if (lookingAt(me, other)) score += 35;
    return score;
  }

  function nearestDuel(alive) {
    const cts = alive.filter((player) => player.team === 'CT' && player.position);
    const ts = alive.filter((player) => player.team === 'T' && player.position);
    let best = null;
    for (const ct of cts) {
      for (const t of ts) {
        const distance = gap(ct, t);
        if (best && distance >= best.distance) continue;
        const ctScore = interest(ct, t);
        const tScore = interest(t, ct);
        let watch = ctScore >= tScore ? ct : t;
        const lockedIsCt = cleanName(ct.name) === locked;
        const lockedIsT = cleanName(t.name) === locked;
        if (lockedIsCt && ctScore + 18 >= tScore) watch = ct;
        if (lockedIsT && tScore + 18 >= ctScore) watch = t;
        best = { distance, watch };
      }
    }
    return best;
  }

  function choose(game, now) {
    const players = playersOf(game);
    if (players.length < 2) return null;
    const alive = players.filter((player) => player.health > 0);
    if (!alive.length) return null;

    let killer = null;
    let dropped = null;
    let droppedBy = 0;
    for (const player of players) {
      const prev = memory.get(player.steamid || player.name);
      if (!prev) continue;
      if (player.kills > prev.kills && player.health > 0) killer = player;
      const loss = prev.health - player.health;
      if (loss > droppedBy && player.health > 0) {
        droppedBy = loss;
        dropped = player;
      }
    }
    memory = new Map(players.map((player) => [player.steamid || player.name, {
      health: player.health,
      kills: player.kills,
    }]));

    if (killer) {
      const name = cleanName(killer.name);
      const young = locked && now < since + MIN_HOLD_MS;
      if (name && name !== locked && !young) return { name, dwell: KILL_MS };
    }

    const staying = locked && now < until;
    if (staying) return null;

    const bomb = game.bomb || {};
    const planting = alive.find((player) => player.steamid && player.steamid === bomb.player && (bomb.state === 'planting' || bomb.state === 'defusing'));
    if (planting) {
      const name = cleanName(planting.name);
      if (name && name !== locked) return { name, dwell: DWELL_MS };
    }
    if (dropped && droppedBy >= 35) {
      const name = cleanName(dropped.name);
      if (name && name !== locked) return { name, dwell: DWELL_MS };
    }

    const duel = nearestDuel(alive);
    if (duel && duel.distance <= FIGHT_RANGE) {
      const name = cleanName(duel.watch.name);
      if (name && name !== locked) return { name, dwell: DWELL_MS };
    }

    if (!locked) {
      const seed = (duel && duel.distance <= APPROACH_RANGE && duel.watch)
        || alive.find((player) => player.hasBomb)
        || alive.find((player) => player.weapon === 'AWP')
        || alive.find((player) => player.observed)
        || alive[0];
      const name = cleanName(seed && seed.name);
      if (name) return { name, dwell: DWELL_MS };
      return null;
    }

    const current = alive.find((player) => cleanName(player.name) === locked);
    if (current && now < until) return null;

    if (duel && duel.distance <= APPROACH_RANGE) {
      const name = cleanName(duel.watch.name);
      if (name && name !== locked) return { name, dwell: DWELL_MS };
    }

    let best = null;
    let bestScore = -1;
    for (const player of alive) {
      let score = 0;
      if (player.hasBomb) score += 60;
      if (player === dropped && droppedBy > 0) score += 80 + droppedBy;
      if (player.health > 0 && player.health <= 25) score += 15;
      if (player.weapon === 'AWP') score += 8;
      if (player.observed) score += 4;
      if (score > bestScore) {
        bestScore = score;
        best = player;
      }
    }
    if (!best) return null;
    const name = cleanName(best.name);
    if (!name) return null;
    if (name === locked) {
      until = now + DWELL_MS;
      return null;
    }
    if (locked && bestScore < 40) return null;
    return { name, dwell: DWELL_MS };
  }

  function pump(consoleKey) {
    if (busy || !queued) return;
    if (Date.now() < nextTry) return;
    const job = queued;
    if (job.name === locked && Date.now() < until) {
      queued = null;
      return;
    }
    queued = null;
    busy = true;
    Promise.resolve(send(job.name, consoleKey, roster)).then((result) => {
      if (result && result.ok) {
        con = true;
        locked = job.name;
        since = Date.now();
        until = Date.now() + job.dwell;
        console.log('Observer: ' + job.name);
      } else if (result && (result.code === 'nocon' || result.code === 'away')) {
        nextTry = Date.now() + 1500;
      } else {
        nextTry = Date.now() + FAIL_MS;
        console.log('Observer olmadi: ' + ((result && (result.error || result.code)) || 'fail'));
      }
    }).catch(() => {
      nextTry = Date.now() + FAIL_MS;
    }).finally(() => {
      busy = false;
      if (queued) pump(consoleKey);
    });
  }

  function tick(game, consoleKey) {
    const list = playersOf(game || {});
    lastCount = list.length;
    roster = list.map((player) => player.name);
    if (!posTold && list.length >= 2) {
      posTold = true;
      console.log(list.some((player) => player.position) ? 'Observer konum aliyor' : 'Observer konum yok');
    }
    const pick = choose(game || {}, Date.now());
    if (pick && pick.name) queued = pick;
    pump(consoleKey);
  }

  function state() {
    return { target: locked, players: lastCount, con };
  }

  function reset() {
    locked = '';
    since = 0;
    until = 0;
    queued = null;
    memory = new Map();
    lastCount = 0;
    posTold = false;
  }

  return { tick, reset, choose, state };
}

module.exports = { createObserver, cleanName };
