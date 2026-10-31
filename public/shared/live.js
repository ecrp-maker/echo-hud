(function () {
  function pad(n) {
    return String(n).padStart(2, '0');
  }

  function fmtTime(sec) {
    const n = Number(sec);
    if (!Number.isFinite(n)) return '--:--';
    const s = Math.max(0, Math.ceil(n));
    return Math.floor(s / 60) + ':' + pad(s % 60);
  }

  function fmtMoney(n) {
    return '$' + Math.max(0, Math.round(Number(n) || 0)).toLocaleString('en-US');
  }

  function clock(game, settings) {
    if (game.roundPhase === 'timeout_ct' || game.roundPhase === 'timeout_t') {
      const side = game.roundPhase === 'timeout_ct' ? 'CT' : 'T';
      return { text: fmtTime(game.time), tag: side + ' MOLA', hot: false };
    }
    if (game.roundPhase === 'paused') return { text: '', tag: 'DURAKLATILDI', hot: false };
    const bombState = game.bomb && game.bomb.state;
    const countdown = game.bomb && game.bomb.countdown;
    const bombHot = settings.showBomb !== false
      && (bombState === 'planted' || bombState === 'defusing')
      && Number.isFinite(Number(countdown));
    if (bombHot) {
      return {
        text: fmtTime(countdown),
        tag: bombState === 'defusing' ? 'ÇÖZÜYOR' : 'BOMBA',
        hot: true,
      };
    }
    if (game.phase === 'warmup') return { text: fmtTime(game.time), tag: 'ISINMA', hot: false };
    if (game.roundPhase === 'freezetime') return { text: fmtTime(game.time), tag: 'BUY TIME', hot: false };
    if (game.roundPhase === 'over') {
      const tag = game.winTeam === 'CT' ? 'CT ALDI' : game.winTeam === 'T' ? 'T ALDI' : 'RAUNT BİTTİ';
      return { text: fmtTime(game.time), tag, hot: false };
    }
    return { text: fmtTime(game.time), tag: '', hot: false };
  }

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }

  function clear(node) {
    while (node.firstChild) node.removeChild(node.firstChild);
  }

  let fitW = 0;
  let fitH = 0;
  function fit() {
    const stage = document.getElementById('stage');
    const w = window.innerWidth;
    const h = window.innerHeight;
    if (!stage || w < 20 || h < 20 || (w === fitW && h === fitH)) return;
    fitW = w;
    fitH = h;
    const scale = Math.min(w / 1920, h / 1080);
    stage.style.transform = 'scale(' + scale + ')';
    stage.style.left = ((w - 1920 * scale) / 2) + 'px';
    stage.style.top = ((h - 1080 * scale) / 2) + 'px';
  }

  function paintTeams(game) {
    document.documentElement.style.setProperty('--ct', game.ct.color || '#8ecbff');
    document.documentElement.style.setProperty('--t', game.t.color || '#f0b45a');
  }

  function paintLicenseWall(info) {
    let wall = document.getElementById('licenseWall');
    if (!wall) {
      wall = document.createElement('div');
      wall.id = 'licenseWall';
      wall.hidden = true;
      const title = document.createElement('strong');
      title.textContent = 'Lisans girin';
      wall.appendChild(title);
      wall.style.position = 'fixed';
      wall.style.inset = '0';
      wall.style.zIndex = '30';
      wall.style.display = 'grid';
      wall.style.placeItems = 'center';
      wall.style.background = '#050505';
      wall.style.color = '#f4f7f2';
      title.style.font = '760 92px/1 Segoe UI Variable, Segoe UI, sans-serif';
      title.style.letterSpacing = '-0.04em';
      document.body.appendChild(wall);
    }
    const locked = !!(info && info.locked);
    wall.hidden = !locked;
    wall.style.display = locked ? 'grid' : 'none';
  }

  function watch(render) {
    const params = new URLSearchParams(location.search);
    const preview = params.has('preview');
    const overlay = params.has('overlay');
    if (preview) document.body.classList.add('preview');
    if (overlay) document.body.classList.add('overlay');
    const page = document.body.dataset.hud;
    const source = new EventSource('/events');
    source.onmessage = (event) => {
      let msg;
      try { msg = JSON.parse(event.data); } catch { return; }
      const game = msg.game || {};
      const show = overlay
        ? msg.source === 'live' && msg.started && msg.hud === page && !!game.map
        : (preview || (msg.started && msg.hud === page)) && !!game.map;
      document.body.classList.toggle('off', !show);
      document.body.classList.toggle('waiting', !!preview && !game.map);
      paintLicenseWall(msg.license);
      if (show) {
        paintTeams(game);
        render(game, msg.settings || {});
      }
      fit();
    };
    window.addEventListener('resize', fit);
  }

  window.ECHO = { fmtTime, fmtMoney, clock, el, clear, watch, fit };
})();
