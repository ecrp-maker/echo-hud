function renderRoster(root, players, settings) {
  ECHO.clear(root);
  for (const player of players.slice(0, 5)) {
    const low = player.health > 0 && player.health <= 30;
    const card = ECHO.el('article', 'card' + (player.health <= 0 ? ' dead' : '') + (player.observed ? ' observed' : '') + (low ? ' low' : ''));
    const flash = ECHO.el('span', 'flash');
    flash.style.opacity = String(Math.min(0.28, (player.flashed || 0) / 420));
    const head = ECHO.el('div', 'head-row');
    head.appendChild(ECHO.el('div', 'hpnum', String(player.health)));
    const marks = ECHO.el('span', 'marks');
    if (player.hasBomb) marks.appendChild(ECHO.el('span', 'tag bomb', 'C4'));
    if (player.kit) marks.appendChild(ECHO.el('span', 'tag kit', 'KIT'));
    if (marks.childNodes.length) head.appendChild(marks);
    const name = ECHO.el('div', 'pname', player.name);
    card.append(flash, head, name);
    if (settings.showKd) {
      card.appendChild(ECHO.el('div', 'kd', player.kills + ' / ' + player.assists + ' / ' + player.deaths));
    }
    const line = ECHO.el('div', 'line');
    const weapon = player.reloading ? 'RELOAD' : (player.weapon || '—');
    let left = weapon;
    if (settings.showAmmo && !player.reloading && player.clip != null) {
      left += '  ' + (player.reserve != null ? player.clip + '/' + player.reserve : player.clip);
    }
    line.appendChild(ECHO.el('span', 'wep', left));
    const right = [];
    if (player.armor > 0) right.push(player.armor + ' Z');
    if (settings.showMoney && player.money != null) right.push(ECHO.fmtMoney(player.money));
    line.appendChild(ECHO.el('span', 'sub', right.join('  ')));
    card.appendChild(line);
    root.appendChild(card);
  }
}

ECHO.watch((game, settings) => {
  const clock = ECHO.clock(game, settings);
  document.getElementById('title').textContent = settings.matchTitle || '';
  const ct = document.getElementById('ctScore');
  const t = document.getElementById('tScore');
  ct.textContent = String(game.ct.score).padStart(2, '0');
  t.textContent = String(game.t.score).padStart(2, '0');
  ct.classList.toggle('lead', game.ct.score > game.t.score);
  ct.classList.toggle('trail', game.ct.score < game.t.score);
  t.classList.toggle('lead', game.t.score > game.ct.score);
  t.classList.toggle('trail', game.t.score < game.ct.score);
  document.getElementById('ctName').textContent = game.ct.name;
  document.getElementById('tName').textContent = game.t.name;
  document.getElementById('round').textContent = 'R ' + String(game.round || 0);
  const timer = document.getElementById('timer');
  timer.textContent = clock.text;
  timer.classList.toggle('hot', clock.hot);
  const meta = document.getElementById('meta');
  meta.textContent = [game.mapLabel, clock.tag].filter(Boolean).join('   ·   ');
  meta.classList.toggle('hot', clock.hot);
  renderRoster(document.getElementById('ct'), game.ctPlayers || [], settings);
  renderRoster(document.getElementById('t'), game.tPlayers || [], settings);
});
