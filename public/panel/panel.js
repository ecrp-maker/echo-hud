const fields = ['matchLink', 'map1', 'map2', 'map3', 'mapCaption', 'ctName', 'tName', 'ctColor', 'tColor', 'pauseText', 'liveText'];
const ranges = ['pauseWidget', 'pauseBrand', 'pauseBrandX', 'pauseBrandY', 'pauseTextSize', 'pauseTextX', 'pauseTextY', 'liveBrandW', 'liveBrandH', 'liveBrandRight', 'liveBrandTop', 'liveTextSize', 'liveTextRight', 'liveTextTop'];
const checks = ['showMoney', 'showKd', 'showBomb', 'showAmmo', 'demo', 'hideGameHud', 'aiObserver'];
let mode = 'login';
let pending = {};
let dirtyUntil = {};
let saveTimer = 0;

function note(text, kind) {
  const node = document.getElementById('note');
  node.textContent = text || '';
  node.className = kind || '';
}

function selectedHud() {
  return document.querySelector('.hud-card.selected')?.dataset.hud || 'apex';
}

function obsUrl(hud) {
  return location.origin + '/hud/' + (hud || selectedHud());
}

function setObs(hud) {
  document.getElementById('obsUrl').textContent = obsUrl(hud);
}

function linkMeta(value) {
  const text = String(value || '').trim();
  if (!text) return { host: '', title: '' };
  try {
    const url = new URL(text.includes('://') ? text : 'https://' + text);
    const host = url.hostname.replace(/^www\./, '');
    let kind = 'LİNK';
    if (host.includes('hltv')) kind = 'HLTV';
    else if (host.includes('faceit')) kind = 'FACEIT';
    else if (host.includes('steam')) kind = 'STEAM';
    const parts = url.pathname.split('/').filter(Boolean);
    let slug = parts[parts.length - 1] || host;
    if (/^\d+$/.test(slug) && parts.length > 1) slug = parts[parts.length - 2];
    const title = decodeURIComponent(slug)
      .replace(/[-_]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .replace(/\b\p{L}/gu, (letter) => letter.toLocaleUpperCase('tr'))
      .slice(0, 60);
    return { host: kind + ' · ' + host, title };
  } catch {
    return { host: 'METİN', title: text.slice(0, 60) };
  }
}

let brandPreviewUrl = '';

function clampRange(id, value) {
  const el = document.getElementById(id);
  const min = Number(el.min);
  const max = Number(el.max);
  const next = Math.min(max, Math.max(min, Math.round(value)));
  el.value = String(next);
  return next;
}

function paintPausePreview() {
  const widget = Number(document.getElementById('pauseWidget').value) || 200;
  const brand = Number(document.getElementById('pauseBrand').value) || 360;
  const x = Number(document.getElementById('pauseBrandX').value) || 0;
  const y = Number(document.getElementById('pauseBrandY').value) || 0;
  document.getElementById('pauseWidgetOut').textContent = widget + '%';
  document.getElementById('pauseBrandOut').textContent = String(brand);
  document.getElementById('pauseBrandXOut').textContent = (x > 0 ? '+' : '') + x;
  document.getElementById('pauseBrandYOut').textContent = (y > 0 ? '+' : '') + y;
  const esea = document.getElementById('pauseWidgetPreview');
  const mark = document.getElementById('pauseBrandPreview');
  const stage = document.querySelector('.pause-stage');
  if (esea) esea.style.transform = 'translateX(-50%) scale(' + (widget / 200).toFixed(2) + ')';
  if (mark && stage) {
    const height = Math.max(22, Math.round(brand * stage.clientHeight / 1080));
    mark.style.height = height + 'px';
    mark.style.width = Math.round(height * 2.2) + 'px';
    mark.style.left = 'calc(50% + ' + (x / 1920 * 100).toFixed(2) + '%)';
    mark.style.bottom = (y / 900 * 100).toFixed(2) + '%';
    mark.style.transform = 'translateX(-50%)';
    if (brandPreviewUrl) {
      mark.style.backgroundImage = 'url("' + brandPreviewUrl + '")';
      mark.style.backgroundColor = 'transparent';
    }
  }
  const copy = document.getElementById('pauseTextPreview');
  const copySize = Number(document.getElementById('pauseTextSize').value) || 64;
  const copyX = Number(document.getElementById('pauseTextX').value) || 0;
  const copyY = Number(document.getElementById('pauseTextY').value) || 0;
  document.getElementById('pauseTextSizeOut').textContent = String(copySize);
  document.getElementById('pauseTextXOut').textContent = (copyX > 0 ? '+' : '') + copyX;
  document.getElementById('pauseTextYOut').textContent = (copyY > 0 ? '+' : '') + copyY;
  placeCopy(copy, document.getElementById('pauseTextLabel'), stage, document.getElementById('pauseText').value, copySize, {
    left: 'calc(50% + ' + (copyX / 1920 * 100).toFixed(2) + '%)',
    bottom: (copyY / 900 * 100).toFixed(2) + '%',
    transform: 'translateX(-50%)',
  });
  paintLivePreview();
}

function placeCopy(node, label, stage, text, size, box) {
  if (!node || !label || !stage) return;
  const value = String(text || '').trim();
  label.textContent = value || 'Metin';
  node.classList.toggle('is-empty', !value);
  const height = stage.clientHeight || 1;
  node.style.fontSize = Math.max(11, Math.round(size * height / 1080)) + 'px';
  node.style.left = box.left || '';
  node.style.right = box.right || '';
  node.style.top = box.top || '';
  node.style.bottom = box.bottom || '';
  node.style.transform = box.transform || '';
}

function paintLivePreview() {
  const w = Number(document.getElementById('liveBrandW').value) || 420;
  const h = Number(document.getElementById('liveBrandH').value) || 164;
  const right = Number(document.getElementById('liveBrandRight').value) || 0;
  const top = Number(document.getElementById('liveBrandTop').value) || 0;
  document.getElementById('liveBrandWOut').textContent = String(w);
  document.getElementById('liveBrandHOut').textContent = String(h);
  document.getElementById('liveBrandRightOut').textContent = String(right);
  document.getElementById('liveBrandTopOut').textContent = String(top);
  const mark = document.getElementById('liveBrandPreview');
  const stage = document.getElementById('liveStage');
  if (!mark || !stage) return;
  mark.style.width = (w / 1920 * 100).toFixed(2) + '%';
  mark.style.height = (h / 1080 * 100).toFixed(2) + '%';
  mark.style.right = (right / 1920 * 100).toFixed(2) + '%';
  mark.style.top = (top / 1080 * 100).toFixed(2) + '%';
  if (brandPreviewUrl) {
    mark.style.backgroundImage = 'url("' + brandPreviewUrl + '")';
    mark.style.backgroundColor = 'transparent';
  }
  const copy = document.getElementById('liveTextPreview');
  const copySize = Number(document.getElementById('liveTextSize').value) || 42;
  const copyRight = Number(document.getElementById('liveTextRight').value) || 0;
  const copyTop = Number(document.getElementById('liveTextTop').value) || 0;
  document.getElementById('liveTextSizeOut').textContent = String(copySize);
  document.getElementById('liveTextRightOut').textContent = String(copyRight);
  document.getElementById('liveTextTopOut').textContent = String(copyTop);
  placeCopy(copy, document.getElementById('liveTextLabel'), stage, document.getElementById('liveText').value, copySize, {
    right: (copyRight / 1920 * 100).toFixed(2) + '%',
    top: (copyTop / 1080 * 100).toFixed(2) + '%',
  });
}

function bindLiveDrag() {
  const stage = document.getElementById('liveStage');
  const mark = document.getElementById('liveBrandPreview');
  const grip = document.getElementById('liveBrandGrip');
  if (!stage || !mark || !grip) return;
  let mode = '';
  let start = null;

  function point(event) {
    const rect = stage.getBoundingClientRect();
    return {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
      w: rect.width || 1,
      h: rect.height || 1,
    };
  }

  function push() {
    paintLivePreview();
    queue({
      liveBrandW: Number(document.getElementById('liveBrandW').value),
      liveBrandH: Number(document.getElementById('liveBrandH').value),
      liveBrandRight: Number(document.getElementById('liveBrandRight').value),
      liveBrandTop: Number(document.getElementById('liveBrandTop').value),
    });
  }

  mark.addEventListener('pointerdown', (event) => {
    if (event.target === grip) return;
    mode = 'move';
    mark.setPointerCapture(event.pointerId);
    const p = point(event);
    start = {
      px: p.x,
      py: p.y,
      right: Number(document.getElementById('liveBrandRight').value) || 0,
      top: Number(document.getElementById('liveBrandTop').value) || 0,
    };
  });
  grip.addEventListener('pointerdown', (event) => {
    event.stopPropagation();
    mode = 'size';
    grip.setPointerCapture(event.pointerId);
    const p = point(event);
    start = {
      px: p.x,
      py: p.y,
      w: Number(document.getElementById('liveBrandW').value) || 420,
      h: Number(document.getElementById('liveBrandH').value) || 164,
    };
  });
  window.addEventListener('pointermove', (event) => {
    if (!mode || !start) return;
    const p = point(event);
    if (mode === 'move') {
      clampRange('liveBrandRight', start.right - ((p.x - start.px) / p.w) * 1920);
      clampRange('liveBrandTop', start.top + ((p.y - start.py) / p.h) * 1080);
    } else {
      clampRange('liveBrandW', start.w - ((p.x - start.px) / p.w) * 1920);
      clampRange('liveBrandH', start.h + ((p.y - start.py) / p.h) * 1080);
    }
    push();
  });
  window.addEventListener('pointerup', () => {
    mode = '';
    start = null;
  });
  bindLiveTextDrag(stage);
}

function bindLiveTextDrag(stage) {
  const mark = document.getElementById('liveTextPreview');
  const grip = document.getElementById('liveTextGrip');
  if (!stage || !mark || !grip) return;
  let mode = '';
  let start = null;

  function point(event) {
    const rect = stage.getBoundingClientRect();
    return {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
      w: rect.width || 1,
      h: rect.height || 1,
    };
  }

  function push() {
    paintLivePreview();
    queue({
      liveTextSize: Number(document.getElementById('liveTextSize').value),
      liveTextRight: Number(document.getElementById('liveTextRight').value),
      liveTextTop: Number(document.getElementById('liveTextTop').value),
    });
  }

  mark.addEventListener('pointerdown', (event) => {
    if (event.target === grip) return;
    mode = 'move';
    mark.setPointerCapture(event.pointerId);
    const p = point(event);
    start = {
      px: p.x,
      py: p.y,
      right: Number(document.getElementById('liveTextRight').value) || 0,
      top: Number(document.getElementById('liveTextTop').value) || 0,
    };
  });
  grip.addEventListener('pointerdown', (event) => {
    event.stopPropagation();
    mode = 'size';
    grip.setPointerCapture(event.pointerId);
    const p = point(event);
    start = {
      py: p.y,
      size: Number(document.getElementById('liveTextSize').value) || 42,
    };
  });
  window.addEventListener('pointermove', (event) => {
    if (!mode || !start) return;
    const p = point(event);
    if (mode === 'move') {
      clampRange('liveTextRight', start.right - ((p.x - start.px) / p.w) * 1920);
      clampRange('liveTextTop', start.top + ((p.y - start.py) / p.h) * 1080);
    } else {
      clampRange('liveTextSize', start.size + ((p.y - start.py) / p.h) * 1080);
    }
    push();
  });
  window.addEventListener('pointerup', () => {
    mode = '';
    start = null;
  });
}

function bindBrandDrag() {
  const stage = document.querySelector('.pause-stage');
  const mark = document.getElementById('pauseBrandPreview');
  const grip = document.getElementById('pauseBrandGrip');
  if (!stage || !mark || !grip) return;
  let mode = '';
  let start = null;

  function point(event) {
    const rect = stage.getBoundingClientRect();
    return {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
      w: rect.width || 1,
      h: rect.height || 1,
    };
  }

  function push() {
    paintPausePreview();
    queue({
      pauseBrand: Number(document.getElementById('pauseBrand').value),
      pauseBrandX: Number(document.getElementById('pauseBrandX').value),
      pauseBrandY: Number(document.getElementById('pauseBrandY').value),
    });
  }

  mark.addEventListener('pointerdown', (event) => {
    if (event.target === grip) return;
    mode = 'move';
    mark.setPointerCapture(event.pointerId);
    const p = point(event);
    start = {
      px: p.x,
      py: p.y,
      x: Number(document.getElementById('pauseBrandX').value) || 0,
      y: Number(document.getElementById('pauseBrandY').value) || 0,
    };
  });
  grip.addEventListener('pointerdown', (event) => {
    event.stopPropagation();
    mode = 'size';
    grip.setPointerCapture(event.pointerId);
    const p = point(event);
    start = {
      py: p.y,
      h: p.h,
      brand: Number(document.getElementById('pauseBrand').value) || 360,
    };
  });
  window.addEventListener('pointermove', (event) => {
    if (!mode || !start) return;
    const p = point(event);
    if (mode === 'move') {
      clampRange('pauseBrandX', start.x + ((p.x - start.px) / p.w) * 1920);
      clampRange('pauseBrandY', start.y + ((start.py - p.y) / p.h) * 900);
    } else {
      clampRange('pauseBrand', start.brand + ((start.py - p.y) / p.h) * 1080);
    }
    push();
  });
  window.addEventListener('pointerup', () => {
    mode = '';
    start = null;
  });
  bindPauseTextDrag(stage);
}

function bindPauseTextDrag(stage) {
  const mark = document.getElementById('pauseTextPreview');
  const grip = document.getElementById('pauseTextGrip');
  if (!stage || !mark || !grip) return;
  let mode = '';
  let start = null;

  function point(event) {
    const rect = stage.getBoundingClientRect();
    return {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
      w: rect.width || 1,
      h: rect.height || 1,
    };
  }

  function push() {
    paintPausePreview();
    queue({
      pauseTextSize: Number(document.getElementById('pauseTextSize').value),
      pauseTextX: Number(document.getElementById('pauseTextX').value),
      pauseTextY: Number(document.getElementById('pauseTextY').value),
    });
  }

  mark.addEventListener('pointerdown', (event) => {
    if (event.target === grip) return;
    mode = 'move';
    mark.setPointerCapture(event.pointerId);
    const p = point(event);
    start = {
      px: p.x,
      py: p.y,
      x: Number(document.getElementById('pauseTextX').value) || 0,
      y: Number(document.getElementById('pauseTextY').value) || 0,
    };
  });
  grip.addEventListener('pointerdown', (event) => {
    event.stopPropagation();
    mode = 'size';
    grip.setPointerCapture(event.pointerId);
    const p = point(event);
    start = {
      py: p.y,
      size: Number(document.getElementById('pauseTextSize').value) || 64,
    };
  });
  window.addEventListener('pointermove', (event) => {
    if (!mode || !start) return;
    const p = point(event);
    if (mode === 'move') {
      clampRange('pauseTextX', start.x + ((p.x - start.px) / p.w) * 1920);
      clampRange('pauseTextY', start.y + ((start.py - p.y) / p.h) * 900);
    } else {
      clampRange('pauseTextSize', start.size + ((start.py - p.y) / p.h) * 1080);
    }
    push();
  });
  window.addEventListener('pointerup', () => {
    mode = '';
    start = null;
  });
}
function showLinkMeta() {
  const meta = linkMeta(document.getElementById('matchLink').value);
  document.getElementById('linkMeta').textContent = meta.host;
}

function readForm() {
  const data = { hud: selectedHud() };
  for (const key of fields) data[key] = document.getElementById(key).value;
  for (const key of checks) data[key] = document.getElementById(key).checked;
  return data;
}

function applyForm(settings) {
  if (!settings) return;
  const now = Date.now();
  for (const key of fields) {
    const el = document.getElementById(key);
    if (!el || document.activeElement === el || dirtyUntil[key] > now) continue;
    const value = settings[key] ?? '';
    if (el.value !== value) el.value = value;
  }
  for (const key of checks) {
    const el = document.getElementById(key);
    if (!el || dirtyUntil[key] > now) continue;
    el.checked = !!settings[key];
  }
  for (const key of ranges) {
    const el = document.getElementById(key);
    if (!el || document.activeElement === el || dirtyUntil[key] > now) continue;
    const value = settings[key] == null ? el.defaultValue : String(settings[key]);
    if (el.value !== value) el.value = value;
  }
  brandPreviewUrl = (settings && settings.brandMedia) || '';
  paintPausePreview();
  if (!(dirtyUntil.hud > now)) {
    document.querySelectorAll('.hud-card').forEach((card) => {
      card.classList.toggle('selected', card.dataset.hud === settings.hud);
    });
    setObs(settings.hud);
  }
  showLinkMeta();
  const brandNote = document.getElementById('brandNote');
  if (brandNote) {
    brandNote.textContent = settings.brandMedia
      ? (settings.brandKind === 'video' ? 'Video sağ üstte oynuyor.' : 'Logo sağ üstte duruyor.')
      : 'Video veya logo seç. Sağ üstte görünür.';
  }
}

function renderStatus(msg) {
  const dot = document.getElementById('status');
  const label = document.getElementById('statusText');
  if (msg.source === 'live') {
    dot.dataset.state = 'live';
    label.textContent = msg.started ? 'Yayında · CS2 canlı' : 'CS2 canlı';
  } else if (msg.source === 'demo') {
    dot.dataset.state = 'demo';
    label.textContent = msg.started ? 'Demo yayında' : 'Demo veri';
  } else {
    dot.dataset.state = 'idle';
    label.textContent = 'CS2 bekleniyor';
  }
  const start = document.getElementById('start');
  start.textContent = msg.started ? 'Durdur' : 'Başlat';
  start.dataset.on = msg.started ? '1' : '0';
  const eye = document.getElementById('observerText');
  const obs = msg.observer;
  if (!obs || !obs.enabled) eye.textContent = '';
  else if (obs.players < 2) eye.textContent = 'Observer: izleyici bekleniyor';
  else if (obs.target) eye.textContent = 'Observer: ' + obs.target;
  else eye.textContent = 'Observer açık';
  applyForm(msg.settings);
  paintAd(msg.board);
  paintSide(msg.side);
  paintLicense(msg.license);
}

function fmtRemain(ms) {
  const total = Math.max(0, Math.ceil(Number(ms) / 1000));
  return Math.floor(total / 60) + ':' + String(total % 60).padStart(2, '0');
}

function paintLicense(info) {
  if (!info) return;
  const state = document.getElementById('licenseState');
  if (state) {
    if (info.founder || info.licensed) state.textContent = 'Lisans aktif';
    else state.textContent = 'Deneme ' + fmtRemain(info.remaining);
  }
  const gate = document.getElementById('licenseGate');
  const close = document.getElementById('licenseClose');
  const copy = document.getElementById('licenseCopy');
  if (!gate) return;
  if (info.locked) {
    gate.hidden = false;
    gate.dataset.locked = '1';
    if (close) close.hidden = true;
    if (copy) copy.textContent = 'Deneme süresi bitti. Lisans girin.';
  } else if (gate.dataset.locked === '1') {
    gate.dataset.locked = '';
    gate.hidden = true;
  }
}

const adSlots = {
  board: { timer: 0, on: false, frame: 'adBoard', img: 'adImage', size: 'adSize' },
  side: { timer: 0, on: false, frame: 'sideBoard', img: 'sideImage', size: 'sideSize' },
};

function paintSpotSize(slot) {
  const frame = document.getElementById(slot.frame);
  const size = document.getElementById(slot.size);
  if (!frame || !size) return;
  const w = Math.round(frame.clientWidth);
  const h = Math.round(frame.clientHeight);
  if (!w || !h) return;
  size.textContent = w + ' × ' + h;
}

function paintAdSize() {
  paintSpotSize(adSlots.board);
  paintSpotSize(adSlots.side);
}

function setSpotSlide(slot, on) {
  const frame = document.getElementById(slot.frame);
  if (!frame) return;
  slot.on = !!on && frame.classList.contains('has-media');
  frame.classList.toggle('show-media', slot.on);
}

const AD_SHOW_MS = 15000;
const PITCH_SHOW_MS = 5000;

function queueSpotSlide(slot) {
  clearTimeout(slot.timer);
  slot.timer = setTimeout(() => {
    setSpotSlide(slot, !slot.on);
    queueSpotSlide(slot);
  }, slot.on ? AD_SHOW_MS : PITCH_SHOW_MS);
}

function ensureSpotSlider(slot, hasMedia) {
  if (!hasMedia) {
    clearTimeout(slot.timer);
    slot.timer = 0;
    setSpotSlide(slot, false);
    return;
  }
  if (slot.timer) return;
  setSpotSlide(slot, true);
  queueSpotSlide(slot);
}

function paintSpot(slot, spot) {
  const frame = document.getElementById(slot.frame);
  const img = document.getElementById(slot.img);
  if (!frame || !img) return;
  paintSpotSize(slot);
  const media = spot && spot.media;
  if (media) {
    const next = media + '?v=' + (spot.rev || 0);
    if (img.getAttribute('src') !== next) img.src = next;
    img.hidden = false;
    frame.classList.add('has-media');
  } else {
    img.hidden = true;
    img.removeAttribute('src');
    frame.classList.remove('has-media');
  }
  ensureSpotSlider(slot, !!media);
}

function paintAd(board) {
  paintSpot(adSlots.board, board);
}

function paintSide(side) {
  paintSpot(adSlots.side, side);
}

async function post(url, body) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body || {}),
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401) {
    showLogin();
    throw new Error(data.error || 'Giriş gerekli.');
  }
  if (!res.ok) throw new Error(data.error || 'İşlem olmadı.');
  return data;
}

function markDirty(partial) {
  const until = Date.now() + 800;
  for (const key of Object.keys(partial)) dirtyUntil[key] = until;
}

async function flush() {
  const payload = pending;
  pending = {};
  if (!Object.keys(payload).length) return;
  markDirty(payload);
  await post('/api/settings', payload);
}

function queue(partial) {
  Object.assign(pending, partial);
  markDirty(partial);
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    flush().catch((err) => note(err.message, 'bad'));
  }, 160);
}

async function saveNow(partial) {
  clearTimeout(saveTimer);
  Object.assign(pending, partial);
  await flush();
}

async function openPreview(hud, pause) {
  await post('/api/preview', { hud: hud || selectedHud(), pause: !!pause });
}

async function openOverlay(hud) {
  return post('/api/overlay', { hud: hud || selectedHud() });
}

function showApp(name, founder, sealed, version) {
  document.getElementById('login').hidden = true;
  document.getElementById('app').hidden = false;
  document.getElementById('userLabel').textContent = name;
  const canEdit = !!founder && !sealed;
  const tools = document.getElementById('adTools');
  if (tools) tools.hidden = !canEdit;
  const sideTools = document.getElementById('sideTools');
  if (sideTools) sideTools.hidden = !canEdit;
  const label = document.getElementById('appVersion');
  if (label && version) label.textContent = version;
  const mint = document.getElementById('licenseMint');
  if (mint) mint.hidden = !founder;
  requestAnimationFrame(paintAdSize);
}

function showLogin() {
  document.getElementById('app').hidden = true;
  document.getElementById('login').hidden = false;
}

function bindPanels() {
  const titles = {
    hud: ['01', 'HUD'],
    match: ['02', 'Maç'],
    pause: ['03', 'Pause'],
    brand: ['04', 'Marka'],
    cast: ['05', 'Yayın'],
  };
  document.querySelectorAll('.rail-btn').forEach((button) => {
    button.addEventListener('click', () => {
      const name = button.dataset.panel;
      document.querySelectorAll('.rail-btn').forEach((item) => item.classList.toggle('on', item === button));
      document.querySelectorAll('.view').forEach((view) => {
        view.hidden = view.dataset.panel !== name;
      });
      const title = titles[name] || ['', ''];
      document.getElementById('viewKicker').textContent = title[0];
      document.getElementById('viewTitle').textContent = title[1];
      paintPausePreview();
    });
  });
}

function bind() {
  bindPanels();
  const form = document.getElementById('loginForm');
  const submit = document.getElementById('loginSubmit');
  const switcher = document.getElementById('loginSwitch');

  switcher.addEventListener('click', () => {
    mode = mode === 'login' ? 'register' : 'login';
    document.getElementById('loginTitle').textContent = mode === 'login' ? 'Giriş' : 'Hesap oluştur';
    submit.textContent = mode === 'login' ? 'Giriş yap' : 'Hesap oluştur';
    switcher.textContent = mode === 'login' ? 'Hesabın yok mu? Oluştur' : 'Hesabın var mı? Giriş yap';
    document.getElementById('loginError').textContent = '';
  });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    document.getElementById('loginError').textContent = '';
    submit.disabled = true;
    try {
      const data = await post(mode === 'register' ? '/api/register' : '/api/login', {
        name: document.getElementById('loginName').value,
        password: document.getElementById('loginPass').value,
      });
      showApp(data.name, !!data.founder, !!data.sealed, data.version || '');
    } catch (err) {
      document.getElementById('loginError').textContent = err.message;
    } finally {
      submit.disabled = false;
    }
  });

  document.querySelectorAll('.pick').forEach((button) => {
    button.addEventListener('click', () => {
      document.querySelectorAll('.hud-card').forEach((card) => {
        card.classList.toggle('selected', card.dataset.hud === button.dataset.hud);
      });
      setObs(button.dataset.hud);
      queue({ hud: button.dataset.hud });
    });
  });

  document.querySelectorAll('[data-preview]').forEach((button) => {
    button.addEventListener('click', () => {
      openPreview(button.dataset.preview).catch((err) => note(err.message, 'bad'));
    });
  });

  for (const key of fields) {
    document.getElementById(key).addEventListener('input', () => {
      if (key === 'matchLink') showLinkMeta();
      if (key === 'pauseText' || key === 'liveText') paintPausePreview();
      const patch = { [key]: document.getElementById(key).value };
      if (/^map[123]$/.test(key)) patch[key + 'Logo'] = '';
      if (key === 'ctName') patch.ctLogo = '';
      if (key === 'tName') patch.tLogo = '';
      queue(patch);
    });
  }
  for (const key of checks) {
    document.getElementById(key).addEventListener('change', () => {
      queue({ [key]: document.getElementById(key).checked });
    });
  }
  for (const key of ranges) {
    document.getElementById(key).addEventListener('input', () => {
      paintPausePreview();
      queue({ [key]: Number(document.getElementById(key).value) });
    });
  }

  document.getElementById('brandFile').addEventListener('change', async () => {
    const input = document.getElementById('brandFile');
    const file = input.files && input.files[0];
    input.value = '';
    if (!file) return;
    try {
      const ext = (file.name.split('.').pop() || '').toLowerCase();
      const res = await fetch('/api/brand', {
        method: 'POST',
        headers: {
          'Content-Type': file.type || 'application/octet-stream',
          'X-Brand-Ext': ext,
        },
        body: file,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Marka yüklenmedi.');
      if (data.settings) applyForm(data.settings);
      note(data.settings && data.settings.brandKind === 'video' ? 'Video sağ üste kondu.' : 'Logo sağ üste kondu.', 'ok');
    } catch (err) {
      note(err.message || 'Marka yüklenmedi.', 'bad');
    }
  });

  document.getElementById('brandClear').addEventListener('click', async () => {
    try {
      const data = await post('/api/brand/clear', {});
      if (data.settings) applyForm(data.settings);
      note('Sağ üst marka kalktı.', 'ok');
    } catch (err) {
      note(err.message || 'Marka kalkmadı.', 'bad');
    }
  });

  document.getElementById('adFile').addEventListener('change', async () => {
    const input = document.getElementById('adFile');
    const file = input.files && input.files[0];
    input.value = '';
    if (!file) return;
    try {
      const ext = (file.name.split('.').pop() || '').toLowerCase();
      const res = await fetch('/api/ad', {
        method: 'POST',
        headers: {
          'Content-Type': file.type || 'application/octet-stream',
          'X-Ad-Ext': ext,
        },
        body: file,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Reklam yüklenmedi.');
      if (data.board) paintAd(data.board);
      note('Reklam panoya kondu.', 'ok');
    } catch (err) {
      note(err.message || 'Reklam yüklenmedi.', 'bad');
    }
  });

  document.getElementById('sideFile').addEventListener('change', async () => {
    const input = document.getElementById('sideFile');
    const file = input.files && input.files[0];
    input.value = '';
    if (!file) return;
    try {
      const ext = (file.name.split('.').pop() || '').toLowerCase();
      const res = await fetch('/api/side', {
        method: 'POST',
        headers: {
          'Content-Type': file.type || 'application/octet-stream',
          'X-Ad-Ext': ext,
        },
        body: file,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Reklam yüklenmedi.');
      if (data.side) paintSide(data.side);
      note('Sol reklam panoya kondu.', 'ok');
    } catch (err) {
      note(err.message || 'Reklam yüklenmedi.', 'bad');
    }
  });

  document.getElementById('sideClear').addEventListener('click', async () => {
    try {
      const data = await post('/api/side/clear', {});
      if (data.side) paintSide(data.side);
      note('Sol reklam kalktı.', 'ok');
    } catch (err) {
      note(err.message || 'Reklam kalkmadı.', 'bad');
    }
  });

  document.getElementById('adClear').addEventListener('click', async () => {
    try {
      const data = await post('/api/ad/clear', {});
      if (data.board) paintAd(data.board);
      note('Reklam kalktı.', 'ok');
    } catch (err) {
      note(err.message || 'Reklam kalkmadı.', 'bad');
    }
  });

  document.getElementById('applyLink').addEventListener('click', async () => {
    const meta = linkMeta(document.getElementById('matchLink').value);
    showLinkMeta();
    const patch = {
      matchLink: document.getElementById('matchLink').value,
    };
    let faceitNote = '';
    if (String(meta.host).startsWith('FACEIT')) {
      try {
        const found = await post('/api/faceit-maps', { link: patch.matchLink });
        const maps = Array.isArray(found.maps) ? found.maps : [];
        const teams = Array.isArray(found.teams) ? found.teams : [];
        let filled = 0;
        maps.slice(0, 3).forEach((map, index) => {
          const key = 'map' + (index + 1);
          const input = document.getElementById(key);
          if (!input || input.value.trim() || !map.name) return;
          input.value = map.name;
          patch[key] = map.name;
          patch[key + 'Logo'] = map.logo || '';
          filled += 1;
        });
        [['ct', teams[0]], ['t', teams[1]]].forEach(([side, team]) => {
          if (!team) return;
          const nameInput = document.getElementById(side + 'Name');
          if (nameInput && !nameInput.value.trim() && team.name) {
            nameInput.value = team.name;
            patch[side + 'Name'] = team.name;
            patch[side + 'Logo'] = team.logo || '';
            filled += 1;
          }
        });
        faceitNote = filled
          ? 'FACEIT bilgisi yazıldı. İstersen değiştir.'
          : (found.error || 'Kutular dolu, FACEIT üzerine yazmadı.');
      } catch (err) {
        faceitNote = err.message || 'FACEIT okunamadı.';
      }
    }
    queue(patch);
    if (faceitNote) note(faceitNote, faceitNote.includes('yazıldı') ? 'ok' : 'bad');
    else note(meta.title ? 'Maç başlığı yazıldı.' : 'Link boş.', meta.title ? 'ok' : 'bad');
  });

  async function gameHud(hide) {
    if (!document.getElementById('hideGameHud').checked && hide) return { skipped: true };
    return post('/api/gamehud', { hide });
  }

  let hudBusy = false;
  document.getElementById('start').addEventListener('click', async () => {
    if (hudBusy) return;
    hudBusy = true;
    const on = document.getElementById('start').dataset.on === '1';
    try {
      if (on) {
        await saveNow({ started: false });
        await post('/api/overlay', { stop: true }).catch(() => {});
        const game = document.getElementById('hideGameHud').checked ? await gameHud(false) : { skipped: true };
        note(game.ok ? 'HUD durdu. Oyun içi görünüm geri geldi.' : 'HUD durdu.');
        return;
      }
      const hud = selectedHud();
      const launched = await post('/api/launch');
      await saveNow({ started: true, hud, ...readForm(), hud });
      const layer = await openOverlay(hud);
      if (!launched.already) {
        note(launched.ok ? 'CS2 açılıyor. HUD oyunun üstüne binecek.' : (launched.error || 'CS2 açılamadı.'), launched.ok ? 'ok' : 'bad');
        return;
      }
      if (!layer.ok) {
        note(layer.error || 'HUD oyunun üstüne binmedi.', 'bad');
      }
      const game = await gameHud(true);
      if (game.skipped) {
        note('HUD oyunun üstünde. OBS için alttaki adresi yapıştır.', 'ok');
      } else if (game.ok) {
        note('HUD oyunun üstünde. Can barı, üst kadro ve yanlar kapatıldı.', 'ok');
      } else {
        note('HUD oyunun üstünde. ' + (game.error || 'Oyun komutu girilemedi.'), 'bad');
      }
    } catch (err) {
      note(err.message, 'bad');
    } finally {
      hudBusy = false;
    }
  });

  document.getElementById('pausePreview').addEventListener('click', () => {
    openPreview('apex', true).catch((err) => note(err.message, 'bad'));
  });

  document.getElementById('preview').addEventListener('click', () => {
    openPreview(selectedHud()).then(() => note('Önizleme açıldı.', 'ok')).catch((err) => note(err.message, 'bad'));
  });

  document.getElementById('cfg').addEventListener('click', async () => {
    note('CS2 aranıyor...');
    document.getElementById('cfgBox').hidden = true;
    try {
      const data = await post('/api/cfg', {});
      if (data.cfg) {
        const box = document.getElementById('cfgBox');
        box.hidden = false;
        box.textContent = data.cfg;
      }
      if (!data.ok) {
        note(data.error || 'Cfg yazılamadı.', 'bad');
        return;
      }
      note('Cfg yazıldı: ' + data.path + ' — CS2 açıksa bir kez kapatıp aç.', 'ok');
    } catch (err) {
      note(err.message, 'bad');
    }
  });

  document.getElementById('copy').addEventListener('click', async () => {
    const url = document.getElementById('obsUrl').textContent;
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      const area = document.createElement('textarea');
      area.value = url;
      document.body.appendChild(area);
      area.select();
      document.execCommand('copy');
      area.remove();
    }
    note('Adres kopyalandı.', 'ok');
  });

  document.getElementById('checkUpdate').addEventListener('click', async () => {
    const button = document.getElementById('checkUpdate');
    const run = document.getElementById('runUpdate');
    const note = document.getElementById('updateNote');
    button.disabled = true;
    run.hidden = true;
    note.textContent = 'Güncellemelere bakılıyor.';
    try {
      const res = await fetch('/api/update');
      const data = await res.json().catch(() => ({}));
      if (res.status === 401) {
        showLogin();
        return;
      }
      if (!res.ok) throw new Error(data.error || 'Güncellemelere bakılamadı.');
      const label = document.getElementById('appVersion');
      if (label && data.current) label.textContent = data.current;
      if (data.newer) {
        note.textContent = data.version + ' hazır.';
        run.hidden = false;
      } else {
        note.textContent = 'Bu sürüm güncel.';
      }
    } catch (err) {
      note.textContent = err.message || 'Güncellemelere bakılamadı.';
    } finally {
      button.disabled = false;
    }
  });

  document.getElementById('runUpdate').addEventListener('click', async () => {
    const run = document.getElementById('runUpdate');
    const note = document.getElementById('updateNote');
    run.disabled = true;
    note.textContent = 'Yeni sürüm indiriliyor.';
    try {
      const data = await post('/api/update');
      if (!data.newer) {
        note.textContent = 'Bu sürüm güncel.';
        run.hidden = true;
        return;
      }
      note.textContent = data.version + ' kuruldu. Program yeniden açılıyor.';
    } catch (err) {
      note.textContent = err.message || 'Güncelleme kurulamadı.';
      run.disabled = false;
    }
  });

  document.getElementById('licenseOpen').addEventListener('click', () => {
    const gate = document.getElementById('licenseGate');
    document.getElementById('licenseMsg').textContent = '';
    gate.hidden = false;
  });

  document.getElementById('licenseClose').addEventListener('click', () => {
    const gate = document.getElementById('licenseGate');
    if (gate.dataset.locked === '1') return;
    gate.hidden = true;
  });

  document.getElementById('licenseForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    const msg = document.getElementById('licenseMsg');
    msg.textContent = 'Lisans kaydediliyor.';
    try {
      await post('/api/license', { key: document.getElementById('licenseKey').value });
      msg.textContent = 'Lisans aktif.';
      document.getElementById('licenseGate').hidden = true;
    } catch (err) {
      msg.textContent = err.message || 'Lisans kaydı yazılamadı.';
    }
  });

  document.getElementById('licenseNew').addEventListener('click', async () => {
    const fresh = document.getElementById('licenseFresh');
    fresh.textContent = 'Üretiliyor.';
    try {
      const data = await post('/api/license/mint');
      fresh.textContent = data.key || '';
    } catch (err) {
      fresh.textContent = err.message || 'Lisans üretilemedi.';
    }
  });

  document.getElementById('logout').addEventListener('click', async () => {
    await post('/api/logout');
    showLogin();
  });

  bindBrandDrag();
  bindLiveDrag();
  window.addEventListener('resize', paintAdSize);
  requestAnimationFrame(paintAdSize);

  const source = new EventSource('/events');
  source.onmessage = (event) => {
    if (document.getElementById('app').hidden) return;
    try { renderStatus(JSON.parse(event.data)); } catch { /* sonraki paket */ }
  };
}

async function boot() {
  bind();
  try {
    const res = await fetch('/api/me');
    if (!res.ok) {
      showLogin();
      return;
    }
    const data = await res.json();
    showApp(data.name, !!data.founder, !!data.sealed, data.version || '');
  } catch {
    showLogin();
    document.getElementById('loginError').textContent = 'Panel açılmadı.';
  }
}

boot();
