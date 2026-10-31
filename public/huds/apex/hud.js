const RADAR = {
  de_mirage: { x: -3230, y: 1713, scale: 5 },
  de_inferno: { x: -2087, y: 3870, scale: 4.9 },
  de_dust2: { x: -2476, y: 3239, scale: 4.4 },
  de_nuke: { x: -3453, y: 2887, scale: 7 },
  de_overpass: { x: -4831, y: 1781, scale: 5.2 },
  de_ancient: { x: -2953, y: 2164, scale: 5 },
  de_anubis: { x: -2796, y: 3328, scale: 5.22 },
  de_vertigo: { x: -3168, y: 1762, scale: 4 },
  de_train: { x: -2308, y: 2078, scale: 4.082077 },
};

const ICON_ALIAS = {
  flash: 'flashbang',
  smoke: 'smokegrenade',
  he: 'hegrenade',
  fire: 'molotov',
  'AK-47': 'ak47',
  'M4A4': 'm4a1',
  'M4A1-S': 'm4a1_silencer',
  AWP: 'awp',
  AUG: 'aug',
  FAMAS: 'famas',
  GALIL: 'galilar',
  'SG 553': 'sg556',
  MP9: 'mp9',
  'MAC-10': 'mac10',
  MP7: 'mp7',
  'MP5-SD': 'mp5sd',
  'UMP-45': 'ump45',
  P90: 'p90',
  'PP-BIZON': 'bizon',
  NOVA: 'nova',
  XM1014: 'xm1014',
  'MAG-7': 'mag7',
  'SAWED-OFF': 'sawedoff',
  M249: 'm249',
  NEGEV: 'negev',
  DEAGLE: 'deagle',
  DUAL: 'elite',
  'FIVE-SEVEN': 'fiveseven',
  GLOCK: 'glock',
  P2000: 'hkp2000',
  'USP-S': 'usp_silencer',
  P250: 'p250',
  CZ75: 'cz75a',
  'TEC-9': 'tec9',
  R8: 'revolver',
  ZEUS: 'taser',
  KNIFE: 'knife',
};
const NADE_ORDER = ['flashbang', 'smokegrenade', 'hegrenade', 'molotov', 'incgrenade', 'decoy'];

function iconFile(id) {
  if (!id) return '';
  const raw = String(id).replace(/^weapon_/, '');
  return ICON_ALIAS[raw] || ICON_ALIAS[id] || raw;
}

function iconUrl(id) {
  const file = iconFile(id);
  return file ? '/huds/icons/' + file + '.svg' : '';
}

function letter(name) {
  const text = String(name || '').trim();
  return (text[0] || '?').toUpperCase();
}

function pips(node, count) {
  const n = Math.max(0, Math.min(4, Number(count) || 0));
  if (node.dataset.n === String(n)) return;
  node.dataset.n = String(n);
  ECHO.clear(node);
  for (let i = 0; i < n; i += 1) node.appendChild(ECHO.el('i', 'on'));
}

function gearList(player, settings) {
  const bits = [];
  if (player.helmet) bits.push('armor_helmet');
  else if (player.armor > 0) bits.push('kevlar');
  const nades = (player.grenades || []).map((kind) => iconFile(kind)).filter(Boolean);
  nades.sort((a, b) => NADE_ORDER.indexOf(a) - NADE_ORDER.indexOf(b));
  for (const kind of nades.slice(0, 4)) bits.push(kind);
  return bits;
}

function paintUtils(node, bits) {
  const key = bits.join(',');
  if (node.dataset.bits === key) return;
  node.dataset.bits = key;
  ECHO.clear(node);
  for (const id of bits) {
    const img = document.createElement('img');
    img.className = 'util';
    img.alt = '';
    img.src = iconUrl(id);
    node.appendChild(img);
  }
}

function buildCard(team) {
  const card = ECHO.el('article', 'row' + (team === 'T' ? ' flip' : ''));
  const slot = ECHO.el('b', 'slot');
  const marks = ECHO.el('div', 'marks');
  const kit = document.createElement('img');
  kit.className = 'mark kit';
  kit.alt = '';
  kit.src = iconUrl('defuser');
  kit.hidden = true;
  const bomb = document.createElement('img');
  bomb.className = 'mark bomb';
  bomb.alt = '';
  bomb.src = iconUrl('c4');
  bomb.hidden = true;
  marks.append(kit, bomb);
  const adr = ECHO.el('b', 'adr');
  adr.hidden = true;
  const fill = ECHO.el('span', 'fill');
  const hp = ECHO.el('span', 'hp');
  fill.appendChild(hp);
  const flash = ECHO.el('span', 'flash');
  const line = ECHO.el('div', 'line');
  const name = ECHO.el('span', 'pname');
  const stat = ECHO.el('span', 'stat');
  const kills = ECHO.el('b', 'k');
  const assists = ECHO.el('b', 'a');
  const deaths = ECHO.el('b', 'd');
  const kWrap = ECHO.el('span');
  const aWrap = ECHO.el('span');
  const dWrap = ECHO.el('span');
  kWrap.append(kills, ECHO.el('i', '', 'K'));
  aWrap.append(assists, ECHO.el('i', '', 'A'));
  dWrap.append(deaths, ECHO.el('i', '', 'D'));
  stat.append(kWrap, aWrap, dWrap);
  line.append(name, stat);
  const mid = ECHO.el('div', 'mid');
  const money = ECHO.el('span', 'money');
  const utils = ECHO.el('span', 'utils');
  mid.append(money, utils);
  const bar = ECHO.el('div', 'bar');
  const gun = document.createElement('img');
  gun.className = 'gun';
  gun.alt = '';
  bar.append(gun);
  card.append(slot, marks, fill, flash, line, mid, bar, adr);
  card._ui = { slot, fill, flash, name, stat, kills, assists, deaths, money, utils, hp, gun, kit, bomb, adr };
  return card;
}

const cards = new Map();

function updateCard(card, player, settings, index) {
  const ui = card._ui;
  const low = player.health > 0 && player.health <= 30;
  card.classList.toggle('dead', player.health <= 0);
  card.classList.toggle('observed', !!player.observed);
  card.classList.toggle('low', low);
  const hp = Math.max(0, Math.min(100, player.health));
  ui.fill.style.width = hp <= 0 ? '0%' : 'max(' + hp + '%, 34px)';
  ui.flash.style.opacity = String(Math.min(0.28, (player.flashed || 0) / 420));
  const slot = String(index + 1);
  if (ui.slot.textContent !== slot) ui.slot.textContent = slot;
  if (ui.name.textContent !== player.name) ui.name.textContent = player.name;
  const showKd = settings.showKd !== false;
  ui.stat.hidden = !showKd;
  if (showKd) {
    const kills = String(player.kills);
    const assists = String(player.assists || 0);
    const deaths = String(player.deaths);
    if (ui.kills.textContent !== kills) ui.kills.textContent = kills;
    if (ui.assists.textContent !== assists) ui.assists.textContent = assists;
    if (ui.deaths.textContent !== deaths) ui.deaths.textContent = deaths;
  }
  const money = settings.showMoney === false || player.money == null ? '' : ECHO.fmtMoney(player.money);
  if (ui.money.textContent !== money) ui.money.textContent = money;
  paintUtils(ui.utils, gearList(player, settings));
  const hpText = String(hp);
  if (ui.hp.textContent !== hpText) ui.hp.textContent = hpText;
  ui.kit.hidden = !player.kit;
  ui.bomb.hidden = !(player.hasBomb && settings.showBomb !== false);
  const dead = player.health <= 0;
  ui.adr.hidden = !dead;
  if (dead) {
    const adr = kdRatio(player);
    if (ui.adr.textContent !== adr) ui.adr.textContent = adr;
  }
  const gun = player.health > 0 ? iconUrl(player.weaponId || player.weapon) : '';
  if (ui.gun.dataset.src !== gun) {
    ui.gun.dataset.src = gun;
    if (gun) ui.gun.src = gun;
    ui.gun.hidden = !gun;
  }
}

function renderSide(root, players, settings, team) {
  const list = players.slice(0, 5);
  const seen = new Set();
  list.forEach((player, index) => {
    const id = (player.steamid || (team + ':' + player.name)) + ':' + team;
    seen.add(id);
    let card = cards.get(id);
    if (!card) {
      card = buildCard(team);
      cards.set(id, card);
    }
    if (root.children[index] !== card) root.insertBefore(card, root.children[index] || null);
    updateCard(card, player, settings, index);
  });
  for (const [id, card] of cards) {
    if (id.endsWith(':' + team) && !seen.has(id)) {
      card.remove();
      cards.delete(id);
    }
  }
  while (root.children.length > list.length) root.lastElementChild.remove();
}

function spot(pos, cfg) {
  if (!pos || !cfg) return null;
  const left = (pos.x - cfg.x) / cfg.scale / 1024;
  const top = (cfg.y - pos.y) / cfg.scale / 1024;
  if (left < -0.04 || left > 1.04 || top < -0.04 || top > 1.04) return null;
  return {
    left: Math.min(100, Math.max(0, left * 100)),
    top: Math.min(100, Math.max(0, top * 100)),
  };
}

const dots = new Map();
let bombDot = null;
let plotW = 0;
let plotH = 0;
let radarFrame = 0;

function plotSize(plot) {
  if (!plotW) {
    const w = plot.clientWidth;
    const h = plot.clientHeight;
    if (w > 0 && h > 0) {
      plotW = w;
      plotH = h;
    }
  }
  return { w: plotW || 318, h: plotH || 214 };
}

function shown(dot, now) {
  if (dot._t0 == null) return { x: dot._x1, y: dot._y1 };
  const p = Math.min(1, (now - dot._t0) / dot._dur);
  return {
    x: dot._x0 + (dot._x1 - dot._x0) * p,
    y: dot._y0 + (dot._y1 - dot._y0) * p,
  };
}

function paintDot(dot, x, y) {
  const qx = Math.round(x * 10) / 10;
  const qy = Math.round(y * 10) / 10;
  if (dot._qx === qx && dot._qy === qy) return;
  dot._qx = qx;
  dot._qy = qy;
  dot.style.transform = 'translate3d(' + qx + 'px,' + qy + 'px,0)' + (dot._spin || '');
}

function aimDot(dot, x, y) {
  const now = performance.now();
  if (dot._x1 == null) {
    dot._x0 = x;
    dot._y0 = y;
    dot._x1 = x;
    dot._y1 = y;
    dot._t0 = null;
    paintDot(dot, x, y);
    return;
  }
  const at = shown(dot, now);
  const dx = x - at.x;
  const dy = y - at.y;
  if (dx * dx + dy * dy < 0.64) return;
  if (dx * dx + dy * dy > 48 * 48) {
    dot._x0 = x;
    dot._y0 = y;
    dot._x1 = x;
    dot._y1 = y;
    dot._t0 = null;
    paintDot(dot, x, y);
    return;
  }
  dot._x0 = at.x;
  dot._y0 = at.y;
  dot._x1 = x;
  dot._y1 = y;
  dot._t0 = now;
  dot._dur = 240;
  if (!radarFrame) radarFrame = requestAnimationFrame(stepRadar);
}

function stepRadar(now) {
  radarFrame = 0;
  let moving = false;
  for (const dot of dots.values()) {
    if (dot._t0 == null) continue;
    const p = (now - dot._t0) / dot._dur;
    if (p >= 1) {
      dot._t0 = null;
      paintDot(dot, dot._x1, dot._y1);
    } else {
      paintDot(dot, dot._x0 + (dot._x1 - dot._x0) * p, dot._y0 + (dot._y1 - dot._y0) * p);
      moving = true;
    }
  }
  if (bombDot && bombDot._t0 != null) {
    const p = (now - bombDot._t0) / bombDot._dur;
    if (p >= 1) {
      bombDot._t0 = null;
      paintDot(bombDot, bombDot._x1, bombDot._y1);
    } else {
      paintDot(bombDot, bombDot._x0 + (bombDot._x1 - bombDot._x0) * p, bombDot._y0 + (bombDot._y1 - bombDot._y0) * p);
      moving = true;
    }
  }
  if (moving) radarFrame = requestAnimationFrame(stepRadar);
}

function renderRadar(game) {
  const plot = document.getElementById('plot');
  const img = document.getElementById('radarImg');
  const cfg = RADAR[game.map];
  if (img) {
    if (cfg) {
      const src = '/huds/apex/radars/' + game.map + '.png';
      if (img.getAttribute('src') !== src) img.setAttribute('src', src);
      img.hidden = false;
    } else {
      img.hidden = true;
    }
  }
  const size = plotSize(plot);
  const width = size.w;
  const height = size.h;
  const seen = new Set();
  const players = [...(game.ctPlayers || []), ...(game.tPlayers || [])];
  for (const player of players) {
    const at = spot(player.position, cfg);
    const id = player.steamid || (player.team + ':' + player.name);
    if (!at) continue;
    seen.add(id);
    let dot = dots.get(id);
    if (!dot) {
      dot = ECHO.el('i', 'dot');
      dot._x = null;
      plot.appendChild(dot);
      dots.set(id, dot);
    }
    const cls = 'dot ' + (player.team === 'T' ? 't' : 'ct') + (player.observed ? ' me' : '') + (player.health <= 0 ? ' dead' : '');
    if (dot.className !== cls) dot.className = cls;
    const label = player.slot ? String(player.slot) : '';
    if (dot.textContent !== label) dot.textContent = label;
    aimDot(dot, (at.left / 100) * width, (at.top / 100) * height);
  }
  for (const [id, dot] of dots) {
    if (!seen.has(id)) {
      dot.remove();
      dots.delete(id);
    }
  }
  const bombAt = spot(game.bomb && game.bomb.position, cfg);
  const showBomb = bombAt && game.bomb && (game.bomb.state === 'planted' || game.bomb.state === 'dropped' || game.bomb.state === 'carried');
  if (showBomb) {
    if (!bombDot) {
      bombDot = ECHO.el('i', 'bomb');
      bombDot._spin = ' rotate(45deg)';
      plot.appendChild(bombDot);
    }
    aimDot(bombDot, (bombAt.left / 100) * width, (bombAt.top / 100) * height);
  } else if (bombDot) {
    bombDot.remove();
    bombDot = null;
  }
}

function mapKey(name) {
  return String(name || '').toLowerCase().replace(/^de_|^cs_/, '').replace(/[^a-z0-9]/g, '');
}

const PLATES = {
  anubis: 'de_anubis',
  ancient: 'de_ancient',
  dust2: 'de_dust2',
  dustii: 'de_dust2',
  inferno: 'de_inferno',
  mirage: 'de_mirage',
  nuke: 'de_nuke',
  overpass: 'de_overpass',
  vertigo: 'de_vertigo',
  train: 'de_train',
};

function plateUrl(name) {
  const file = PLATES[mapKey(name)];
  return file ? '/huds/apex/plates/' + file + '.png' : '';
}

function renderCaption(settings) {
  const node = document.getElementById('mapcaption');
  if (!node) return;
  const text = String((settings && settings.mapCaption) || '').trim();
  node.hidden = !text;
  if (node.textContent !== text) node.textContent = text;
}

function renderMaps(game, settings) {
  const bar = document.getElementById('mapbar');
  if (!bar) return;
  const items = [1, 2, 3].map((index) => ({
    name: String((settings && settings['map' + index]) || '').trim(),
    logo: String((settings && settings['map' + index + 'Logo']) || '').trim(),
  })).filter((item) => item.name);
  const live = mapKey(game.map) || mapKey(game.mapLabel);
  const key = items.map((item) => item.name + '|' + item.logo).join(';') + '#' + live;
  if (bar.dataset.key === key) return;
  bar.dataset.key = key;
  bar.hidden = items.length === 0;
  ECHO.clear(bar);
  for (const item of items) {
    const cell = ECHO.el('div', 'mapcell' + (mapKey(item.name) && mapKey(item.name) === live ? ' on' : ''));
    const plate = plateUrl(item.name);
    if (plate) cell.style.backgroundImage = 'url("' + plate + '")';
    cell.appendChild(ECHO.el('b', '', item.name));
    if (/^https:\/\//i.test(item.logo)) {
      const img = document.createElement('img');
      img.alt = '';
      img.referrerPolicy = 'no-referrer';
      img.src = item.logo;
      img.addEventListener('error', () => img.remove());
      cell.appendChild(img);
    }
    bar.appendChild(cell);
  }
}

function punchBrand(canvas, source) {
  const sw = source.videoWidth || source.naturalWidth;
  const sh = source.videoHeight || source.naturalHeight;
  if (!sw || !sh) return;
  const scale = Math.min(1, 960 / Math.max(sw, sh));
  const w = Math.max(1, Math.round(sw * scale));
  const h = Math.max(1, Math.round(sh * scale));
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(source, 0, 0, w, h);
  const image = ctx.getImageData(0, 0, w, h);
  const data = image.data;
  let minX = w;
  let minY = h;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const i = (y * w + x) * 4;
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      const max = Math.max(r, g, b);
      const min = Math.min(r, g, b);
      let alpha = data[i + 3];
      if (max < 28) alpha = 0;
      else if (max < 72 && max - min < 20) alpha = Math.round(alpha * ((max - 28) / 44));
      data[i + 3] = alpha;
      if (alpha > 16) {
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0) {
    ctx.putImageData(image, 0, 0);
    canvas.hidden = false;
    return;
  }
  const cw = maxX - minX + 1;
  const ch = maxY - minY + 1;
  const cut = ctx.createImageData(cw, ch);
  for (let y = 0; y < ch; y += 1) {
    const src = ((y + minY) * w + minX) * 4;
    cut.data.set(data.subarray(src, src + cw * 4), y * cw * 4);
  }
  canvas.width = cw;
  canvas.height = ch;
  ctx.putImageData(cut, 0, 0);
  canvas.hidden = false;
}

let brandLoop = 0;

function stopBrandLoop() {
  if (brandLoop) cancelAnimationFrame(brandLoop);
  brandLoop = 0;
}

function loopBrand(source) {
  const canvas = document.getElementById('brandCut');
  if (canvas && source) punchBrand(canvas, source);
  brandLoop = requestAnimationFrame(() => loopBrand(source));
}

function renderBrand(settings) {
  const box = document.getElementById('brand');
  const video = document.getElementById('brandVideo');
  const img = document.getElementById('brandImg');
  const canvas = document.getElementById('brandCut');
  if (!box || !video || !img || !canvas) return;
  const src = settings && settings.brandMedia;
  const kind = settings && settings.brandKind;
  const on = !!src && (kind === 'video' || kind === 'image');
  box.hidden = !on;
  if (!on) {
    stopBrandLoop();
    if (video.dataset.src) {
      video.pause();
      video.removeAttribute('src');
      video.dataset.src = '';
      video.load();
    }
    img.removeAttribute('src');
    canvas.hidden = true;
    return;
  }
  if (kind === 'video') {
    img.removeAttribute('src');
    if (video.dataset.src !== src) {
      stopBrandLoop();
      video.dataset.src = src;
      video.src = src;
      const play = () => {
        video.play().catch(() => {});
        stopBrandLoop();
        loopBrand(video);
      };
      if (video.readyState >= 2) play();
      else video.addEventListener('canplay', play, { once: true });
    } else if (!brandLoop) {
      loopBrand(video);
    }
    if (video.paused) video.play().catch(() => {});
    return;
  }
  if (video.dataset.src) {
    video.pause();
    video.removeAttribute('src');
    video.dataset.src = '';
  }
  const animated = /\.gif(\?|$)/i.test(src);
  if (img.getAttribute('src') !== src) {
    stopBrandLoop();
    img.onload = () => {
      if (animated) {
        stopBrandLoop();
        loopBrand(img);
      } else {
        punchBrand(canvas, img);
      }
    };
    img.src = src;
  } else if (img.complete && !animated && canvas.hidden) {
    punchBrand(canvas, img);
  } else if (animated && !brandLoop && img.complete) {
    loopBrand(img);
  }
}

function paintCrest(img, badge, url, mark) {
  const ok = /^https:\/\//i.test(url || '');
  if (img) {
    img.hidden = !ok;
    if (ok && img.getAttribute('src') !== url) {
      img.src = url;
      img.onerror = () => {
        img.hidden = true;
        if (badge) badge.hidden = false;
      };
    }
  }
  if (badge) {
    badge.hidden = ok;
    badge.textContent = mark;
  }
}

function renderFocus(game, settings) {
  const box = document.getElementById('focus');
  let watched = null;
  let side = 'CT';
  for (const player of game.ctPlayers || []) {
    if (player.observed && player.health > 0) watched = player;
  }
  for (const player of game.tPlayers || []) {
    if (player.observed && player.health > 0) {
      watched = player;
      side = 'T';
    }
  }
  box.hidden = !watched;
  if (!watched) return;
  box.classList.toggle('ct', side === 'CT');
  box.classList.toggle('t', side === 'T');
  const team = side === 'CT' ? game.ct : game.t;
  const logo = side === 'CT' ? settings && settings.ctLogo : settings && settings.tLogo;
  paintCrest(document.getElementById('focusLogo'), document.getElementById('focusBadge'), logo, letter(team && team.name));
  const name = document.getElementById('focusName');
  if (name.textContent !== watched.name) name.textContent = watched.name;
  const kills = String(watched.kills);
  const assists = String(watched.assists || 0);
  const deaths = String(watched.deaths);
  const kNode = document.getElementById('focusK');
  const aNode = document.getElementById('focusA');
  const dNode = document.getElementById('focusD');
  if (kNode.textContent !== kills) kNode.textContent = kills;
  if (aNode.textContent !== assists) aNode.textContent = assists;
  if (dNode.textContent !== deaths) dNode.textContent = deaths;
  const rate = kdRatio(watched);
  const rateNode = document.getElementById('focusRate');
  if (rateNode.textContent !== rate) rateNode.textContent = rate;
  paintUtils(document.getElementById('focusUtils'), gearList(watched, settings || {}));
  const gun = document.getElementById('focusGun');
  const src = iconUrl(watched.weaponId || watched.weapon);
  if (gun.dataset.src !== src) {
    gun.dataset.src = src;
    if (src) gun.src = src;
    gun.hidden = !src;
  }
  const hp = Math.max(0, Math.min(100, watched.health));
  document.getElementById('focusHp').textContent = String(hp);
  document.getElementById('focusFill').style.width = hp <= 0 ? '0%' : 'max(' + hp + '%, 32px)';
  box.classList.toggle('low', watched.health <= 30);
}

function setLogo(which, url, name) {
  const img = document.getElementById(which + 'Logo');
  const badge = document.getElementById(which + 'Badge');
  const ok = /^https:\/\//i.test(url || '');
  if (img) {
    img.hidden = !ok;
    if (ok && img.getAttribute('src') !== url) {
      img.src = url;
      img.onerror = () => {
        img.hidden = true;
        if (badge) badge.hidden = false;
      };
    }
  }
  if (badge) {
    badge.hidden = ok;
    badge.textContent = letter(name);
  }
}

function roundLabel(game, clock) {
  if (clock.tag && clock.tag !== 'BOMBA' && clock.tag !== 'ÇÖZÜYOR') return clock.tag;
  const round = Math.max(0, Number(game.round) || 0);
  if (round > 24) return 'ROUND ' + round;
  return 'ROUND ' + round + ' / 24';
}

let defuseUntil = 0;
let defuseWho = '';
const mvpCount = new Map();

function kdRatio(player) {
  const kills = Number(player.kills) || 0;
  const deaths = Number(player.deaths) || 0;
  const ratio = deaths > 0 ? kills / deaths : kills;
  return ratio.toFixed(2);
}

function hsPercent(player) {
  const kills = Number(player.roundKills) || 0;
  const hs = Number(player.roundHs) || 0;
  if (!kills) return '0%';
  return Math.round((hs / kills) * 100) + '%';
}

function findMvp(game) {
  const players = [...(game.ctPlayers || []), ...(game.tPlayers || [])];
  if (game.roundPhase !== 'over') {
    for (const player of players) mvpCount.set(player.steamid || player.name, Number(player.mvps) || 0);
    return null;
  }
  let raised = null;
  for (const player of players) {
    const key = player.steamid || player.name;
    const prev = mvpCount.get(key);
    const now = Number(player.mvps) || 0;
    if (prev != null && now > prev) raised = player;
  }
  if (raised) return raised;
  const side = game.winTeam === 'T' ? game.tPlayers : game.ctPlayers;
  const pool = [...(side || [])];
  pool.sort((a, b) => (b.roundKills || 0) - (a.roundKills || 0) || (b.mvps || 0) - (a.mvps || 0));
  return pool[0] || null;
}

function bombSeconds(game) {
  const bomb = game.bomb || {};
  const countdown = Number(bomb.countdown);
  const roundTime = Number(game.time);
  if (bomb.state === 'defusing' && Number.isFinite(roundTime) && (!Number.isFinite(countdown) || roundTime > countdown + 0.4)) {
    return roundTime;
  }
  return Number.isFinite(countdown) ? countdown : null;
}

function defuseSeconds(game) {
  const bomb = game.bomb || {};
  if (bomb.state !== 'defusing') {
    defuseUntil = 0;
    defuseWho = '';
    return null;
  }
  const countdown = Number(bomb.countdown);
  if (Number.isFinite(countdown) && countdown <= 10.5) return countdown;
  const who = bomb.player || 'kit';
  if (!defuseUntil || defuseWho !== who) {
    const roster = [...(game.ctPlayers || []), ...(game.tPlayers || [])];
    const player = roster.find((item) => item.steamid === who);
    const seconds = player && player.kit ? 5 : 10;
    defuseUntil = Date.now() + seconds * 1000;
    defuseWho = who;
  }
  return Math.max(0, (defuseUntil - Date.now()) / 1000);
}

function renderRoundBar(game, clock, settings) {
  const mvp = findMvp(game);
  const top = document.querySelector('.top');
  const over = game.roundPhase === 'over';
  top.classList.toggle('show-names', over);
  top.classList.toggle('win-ct', over && game.winTeam === 'CT');
  top.classList.toggle('win-t', over && game.winTeam === 'T');
  const ctName = (game.ct && game.ct.name) || 'CT';
  const tName = (game.t && game.t.name) || 'T';
  const ctBar = document.getElementById('ctBarName');
  const tBar = document.getElementById('tBarName');
  if (ctBar.textContent !== ctName) ctBar.textContent = ctName;
  if (tBar.textContent !== tName) tBar.textContent = tName;
  const won = document.getElementById('roundwon');
  const winner = over && (game.winTeam === 'CT' || game.winTeam === 'T') ? game.winTeam : '';
  if (won) {
    won.hidden = !winner;
    won.classList.toggle('ct', winner === 'CT');
    won.classList.toggle('t', winner === 'T');
    if (winner) {
      const name = winner === 'CT' ? ctName : tName;
      const logo = winner === 'CT' ? settings && settings.ctLogo : settings && settings.tLogo;
      const nameNode = document.getElementById('roundWonName');
      if (nameNode.textContent !== name) nameNode.textContent = name;
      paintCrest(document.getElementById('roundWonLogo'), document.getElementById('roundWonBadge'), logo, letter(name));
      const mvpBox = document.getElementById('roundMvp');
      mvpBox.hidden = !mvp;
      if (mvp) {
        const mvpName = document.getElementById('roundMvpName');
        if (mvpName.textContent !== mvp.name) mvpName.textContent = mvp.name;
        const killText = String(mvp.roundKills || 0);
        const kdText = kdRatio(mvp);
        const hsText = hsPercent(mvp);
        const killNode = document.getElementById('mvpKills');
        const kdNode = document.getElementById('mvpKd');
        const hsNode = document.getElementById('mvpHs');
        if (killNode.textContent !== killText) killNode.textContent = killText;
        if (kdNode.textContent !== kdText) kdNode.textContent = kdText;
        if (hsNode.textContent !== hsText) hsNode.textContent = hsText;
      }
    }
  }
  const bomb = game.bomb || {};
  const planted = settings.showBomb !== false && (bomb.state === 'planted' || bomb.state === 'defusing');
  const plate = document.getElementById('bombplate');
  plate.hidden = !planted;
  if (planted) {
    const left = bombSeconds(game);
    const text = left == null ? '--:--' : ECHO.fmtTime(left);
    const node = document.getElementById('bombTime');
    if (node.textContent !== text) node.textContent = text;
  }
  const solving = planted && bomb.state === 'defusing';
  const defuse = document.getElementById('defuse');
  defuse.hidden = !solving;
  if (solving) {
    const left = defuseSeconds(game);
    const text = left == null ? '' : left.toFixed(1);
    const node = document.getElementById('defuseTime');
    if (node.textContent !== text) node.textContent = text;
  }
}

function text(node, value) {
  const next = String(value);
  if (node && node.textContent !== next) node.textContent = next;
}

function boardMode(game) {
  if (new URLSearchParams(location.search).has('pause')) return 'PAUSED';
  if (game.phase === 'gameover') return 'MATCH END';
  if (game.phase === 'intermission') return 'HALF TIME';
  if (game.roundPhase === 'timeout_ct') return 'CT TIMEOUT';
  if (game.roundPhase === 'timeout_t') return 'T TIMEOUT';
  if (game.roundPhase === 'paused') return 'PAUSED';
  return '';
}

function rated(players) {
  return (players || []).slice().sort((a, b) => {
    const diff = Number(kdRatio(b)) - Number(kdRatio(a));
    if (diff) return diff;
    const assists = (b.assists || 0) - (a.assists || 0);
    if (assists) return assists;
    return (b.kills || 0) - (a.kills || 0);
  }).slice(0, 5);
}

function boardRow(team) {
  const row = ECHO.el('div', 'sb-row');
  const who = ECHO.el('span', 'who');
  const rank = ECHO.el('i', 'rank');
  const name = ECHO.el('span', 'nm');
  const rate = ECHO.el('b');
  const kills = ECHO.el('b');
  if (team === 'T') who.append(name, rank);
  else who.append(rank, name);
  if (team === 'T') row.append(rate, kills, who);
  else row.append(who, rate, kills);
  row._ui = { rank, name, rate, kills };
  return row;
}

const boardRows = { CT: [], T: [] };

function renderBoardSide(root, players, team) {
  const list = rated(players);
  while (boardRows[team].length < list.length) {
    const row = boardRow(team);
    root.appendChild(row);
    boardRows[team].push(row);
  }
  while (boardRows[team].length > list.length) boardRows[team].pop().remove();
  list.forEach((player, index) => {
    const ui = boardRows[team][index]._ui;
    text(ui.rank, index + 1);
    text(ui.name, player.name);
    text(ui.rate, kdRatio(player));
    text(ui.kills, player.kills);
  });
}

function renderBoardMaps(game, settings) {
  const bar = document.getElementById('sbMaps');
  if (!bar) return;
  const items = [1, 2, 3].map((index) => String((settings && settings['map' + index]) || '').trim()).filter(Boolean);
  const live = mapKey(game.map) || mapKey(game.mapLabel);
  const score = (game.ct.score || 0) + ' - ' + (game.t.score || 0);
  const key = items.join('|') + '#' + live + '#' + score;
  if (bar.dataset.key === key) return;
  bar.dataset.key = key;
  bar.hidden = items.length === 0;
  ECHO.clear(bar);
  for (const name of items) {
    const on = mapKey(name) && mapKey(name) === live;
    const cell = ECHO.el('div', 'sb-map' + (on ? ' on' : ''));
    const plate = plateUrl(name);
    if (plate) cell.style.backgroundImage = 'url("' + plate + '")';
    cell.appendChild(ECHO.el('b', '', name));
    if (on) cell.appendChild(ECHO.el('i', '', score));
    bar.appendChild(cell);
  }
}

let stingKey = '';
let stingTimer = 0;
const STING_MS = 1900;

function clearSting() {
  clearTimeout(stingTimer);
  stingTimer = 0;
  stingKey = '';
  const node = document.getElementById('sting');
  if (node) {
    node.hidden = true;
    node.classList.remove('run');
  }
  document.body.classList.remove('sting-on');
}

function syncSting(mode, game) {
  const node = document.getElementById('sting');
  if (!node) return;
  const ctName = (game.ct && game.ct.name) || 'CT';
  const tName = (game.t && game.t.name) || 'T';
  text(document.getElementById('stingMode'), mode);
  text(document.getElementById('stingCt'), ctName);
  text(document.getElementById('stingT'), tName);
  text(document.getElementById('stingScore'), (game.ct.score || 0) + '  -  ' + (game.t.score || 0));
  const ctBar = node.querySelector('.sting-bar.ct');
  const tBar = node.querySelector('.sting-bar.t');
  if (ctBar && game.ct && game.ct.color) {
    ctBar.style.background = game.ct.color;
    ctBar.style.color = stingInk(game.ct.color);
  }
  if (tBar && game.t && game.t.color) {
    tBar.style.background = game.t.color;
    tBar.style.color = stingInk(game.t.color);
  }
}

function stingInk(color) {
  const hex = String(color || '').replace('#', '');
  if (!/^[0-9a-fA-F]{6}$/.test(hex)) return '#fff';
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  return (r * 299 + g * 587 + b * 114) / 1000 > 160 ? '#1a1206' : '#fff';
}

function beginSting(mode, game) {
  const node = document.getElementById('sting');
  if (!node) return;
  stingKey = mode;
  syncSting(mode, game);
  node.hidden = false;
  node.classList.remove('run');
  document.body.classList.add('sting-on');
  void node.offsetWidth;
  node.classList.add('run');
  clearTimeout(stingTimer);
  stingTimer = setTimeout(() => {
    node.hidden = true;
    node.classList.remove('run');
    document.body.classList.remove('sting-on');
    stingTimer = 0;
  }, STING_MS);
}

function renderHalf(game, settings) {
  const board = document.getElementById('half');
  const mode = boardMode(game);
  const on = !!mode;
  if (!on) {
    clearSting();
    document.body.classList.remove('halftime');
    if (board) board.hidden = true;
    return;
  }
  if (mode !== stingKey) beginSting(mode, game);
  else syncSting(mode, game);
  document.body.classList.add('halftime');
  if (board) board.hidden = false;
  const modeNode = document.getElementById('sbMode');
  text(modeNode, mode);
  modeNode.classList.toggle('t', game.roundPhase === 'timeout_t');
  const ctName = (game.ct && game.ct.name) || 'CT';
  const tName = (game.t && game.t.name) || 'T';
  text(document.getElementById('halfCtName'), ctName);
  text(document.getElementById('halfTName'), tName);
  text(document.getElementById('sbScore'), (game.ct.score || 0) + ' - ' + (game.t.score || 0));
  paintCrest(document.getElementById('halfCtLogo'), document.getElementById('halfCtBadge'), settings && settings.ctLogo, letter(ctName));
  paintCrest(document.getElementById('halfTLogo'), document.getElementById('halfTBadge'), settings && settings.tLogo, letter(tName));
  renderBoardMaps(game, settings);
  renderBoardSide(document.getElementById('sbCtRows'), game.ctPlayers, 'CT');
  renderBoardSide(document.getElementById('sbTRows'), game.tPlayers, 'T');
}

function applyPauseLayout(settings) {
  const widget = clampPause(settings && settings.pauseWidget, 80, 280, 200) / 100;
  const brand = clampPause(settings && settings.pauseBrand, 80, 900, 360);
  const x = clampPause(settings && settings.pauseBrandX, -800, 800, 0);
  const y = clampPause(settings && settings.pauseBrandY, -200, 900, 0);
  const root = document.documentElement;
  root.style.setProperty('--pause-widget', widget.toFixed(2));
  root.style.setProperty('--pause-brand', brand + 'px');
  root.style.setProperty('--pause-brand-x', x + 'px');
  root.style.setProperty('--pause-brand-y', y + 'px');
  root.style.setProperty('--live-brand-w', clampPause(settings && settings.liveBrandW, 40, 1400, 420) + 'px');
  root.style.setProperty('--live-brand-h', clampPause(settings && settings.liveBrandH, 40, 600, 164) + 'px');
  root.style.setProperty('--live-brand-right', clampPause(settings && settings.liveBrandRight, -400, 1600, 14) + 'px');
  root.style.setProperty('--live-brand-top', clampPause(settings && settings.liveBrandTop, -300, 800, -28) + 'px');
  root.style.setProperty('--pause-text-size', clampPause(settings && settings.pauseTextSize, 18, 220, 64) + 'px');
  root.style.setProperty('--pause-text-x', clampPause(settings && settings.pauseTextX, -800, 800, 0) + 'px');
  root.style.setProperty('--pause-text-y', clampPause(settings && settings.pauseTextY, -200, 900, 260) + 'px');
  root.style.setProperty('--live-text-size', clampPause(settings && settings.liveTextSize, 16, 220, 42) + 'px');
  root.style.setProperty('--live-text-right', clampPause(settings && settings.liveTextRight, -400, 1600, 36) + 'px');
  root.style.setProperty('--live-text-top', clampPause(settings && settings.liveTextTop, -300, 800, 168) + 'px');
  paintCopy(document.getElementById('pauseCopy'), settings && settings.pauseText);
  paintCopy(document.getElementById('liveCopy'), settings && settings.liveText);
}

function paintCopy(node, value) {
  if (!node) return;
  const text = String(value || '').trim();
  node.textContent = text;
  node.hidden = !text;
}

function clampPause(value, min, max, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.round(n)));
}

ECHO.watch((game, settings) => {
  applyPauseLayout(settings);
  renderHalf(game, settings);
  const clock = ECHO.clock(game, settings);
  setLogo('ct', settings && settings.ctLogo, game.ct.name);
  setLogo('t', settings && settings.tLogo, game.t.name);
  document.getElementById('ctScore').textContent = String(game.ct.score);
  document.getElementById('tScore').textContent = String(game.t.score);
  const bombLive = settings.showBomb !== false && game.bomb && (game.bomb.state === 'planted' || game.bomb.state === 'defusing');
  const timer = document.getElementById('timer');
  timer.textContent = bombLive ? '' : clock.text;
  timer.classList.toggle('hot', !bombLive && clock.hot);
  const round = document.getElementById('round');
  round.textContent = roundLabel(game, clock);
  round.classList.toggle('hot', !bombLive && clock.hot);
  round.classList.toggle('mola-ct', game.roundPhase === 'timeout_ct');
  round.classList.toggle('mola-t', game.roundPhase === 'timeout_t');
  renderRoundBar(game, clock, settings);
  renderSide(document.getElementById('ct'), game.ctPlayers || [], settings, 'CT');
  renderSide(document.getElementById('t'), game.tPlayers || [], settings, 'T');
  renderRadar(game);
  renderMaps(game, settings);
  renderCaption(settings);
  renderBrand(settings);
  renderFocus(game, settings);
});
