function matchId(link) {
  const text = String(link || '');
  const room = text.match(/room\/(1-)?([0-9a-f-]{36})/i);
  if (room) return room[2];
  const uuid = text.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
  return uuid ? uuid[0] : '';
}

function pretty(name) {
  const clean = String(name || '').replace(/^de_|^cs_/i, '').replace(/[_-]+/g, ' ').trim();
  if (!clean) return '';
  if (/^dust2$/i.test(clean) || /^dust ii$/i.test(clean)) return 'Dust II';
  return clean.replace(/\b\p{L}/gu, (letter) => letter.toLocaleUpperCase('tr')).slice(0, 16);
}

function teamsOf(payload) {
  const found = [];
  const source = (payload && payload.teams) || {};
  for (const [key, team] of Object.entries(source)) {
    if (!team || typeof team !== 'object' || Array.isArray(team)) continue;
    const id = String(team.id || team.faction_id || key);
    const avatar = String(team.avatar || team.logo || '');
    found.push({
      id,
      key,
      avatar: /^https:\/\//i.test(avatar) ? avatar : '',
    });
  }
  return found;
}

function teamAvatar(teams, id) {
  const key = String(id || '');
  if (!key) return '';
  const team = teams.find((item) => item.id === key || item.key === key);
  return team ? team.avatar : '';
}

function entityList(voting) {
  if (!voting) return [];
  const map = voting.map || voting.location || {};
  return Array.isArray(map.entities) ? map.entities : [];
}

function entityByToken(entities, token) {
  const key = String(token || '').toLowerCase();
  if (!key) return null;
  return entities.find((item) => {
    const ids = [item.guid, item.class_name, item.game_map_id, item.name]
      .map((value) => String(value || '').toLowerCase());
    return ids.includes(key);
  }) || null;
}

function mapName(entity, token) {
  if (entity && entity.name) return pretty(entity.name);
  return pretty(token);
}

function isMapToken(token, entities) {
  const text = String(token || '').toLowerCase();
  if (!text || text.length > 40) return false;
  if (text.startsWith('de_') || text.startsWith('cs_')) return true;
  return !!entityByToken(entities, text);
}

function picksFromVotes(voting, teams, entities) {
  const map = (voting && (voting.map || voting.location)) || {};
  const votes = []
    .concat(Array.isArray(map.votes) ? map.votes : [])
    .concat(Array.isArray(voting && voting.votes) ? voting.votes : []);
  const maps = [];
  for (const vote of votes) {
    if (!vote || typeof vote !== 'object') continue;
    const kind = String(vote.vote_type || vote.type || vote.status || 'pick').toLowerCase();
    if (kind && kind !== 'pick' && kind !== 'picked') continue;
    const token = vote.guid || vote.map || vote.game_map_id || vote.class_name || vote.entity_id || '';
    if (!token) continue;
    const entity = entityByToken(entities, token);
    const name = mapName(entity, token);
    if (!name) continue;
    maps.push({
      name,
      logo: teamAvatar(teams, vote.selected_by || vote.faction || vote.team_id || vote.picker || ''),
    });
  }
  return maps;
}

function parseMaps(data) {
  const payload = (data && (data.payload || data)) || {};
  const voting = payload.voting || {};
  const mapVote = voting.map || voting.location || {};
  const entities = entityList(voting);
  const teams = teamsOf(payload);
  const fromVotes = picksFromVotes(voting, teams, entities);
  if (fromVotes.length) return fromVotes.slice(0, 3);

  const pick = Array.isArray(mapVote.pick) ? mapVote.pick : [];
  if (pick.length && typeof pick[0] === 'string' && isMapToken(pick[0], entities)) {
    return pick.slice(0, 3).map((token) => ({
      name: mapName(entityByToken(entities, token), token),
      logo: '',
    })).filter((item) => item.name);
  }

  if (pick.length && pick[0] && typeof pick[0] === 'object') {
    return pick.slice(0, 3).map((item) => {
      const token = item.guid || item.map || item.class_name || item.game_map_id || '';
      return {
        name: mapName(entityByToken(entities, token), token),
        logo: teamAvatar(teams, item.selected_by || item.faction || item.team_id || ''),
      };
    }).filter((item) => item.name);
  }

  const picked = entities.filter((item) => item && (item.selected || item.status === 'pick'));
  if (picked.length) {
    return picked.slice(0, 3).map((entity, index) => ({
      name: mapName(entity, ''),
      logo: teamAvatar(teams, pick[index]),
    })).filter((item) => item.name);
  }

  return [];
}

async function faceitMaps(link) {
  const id = matchId(link);
  if (!id) return { maps: [], error: 'FACEIT maç adresi değil.' };
  let response;
  try {
    response = await fetch('https://www.faceit.com/api/match/v2/match/' + id, {
      headers: { Accept: 'application/json', 'User-Agent': 'ECHO-HUD' },
      signal: AbortSignal.timeout(8000),
    });
  } catch {
    return { maps: [], error: 'FACEIT\'e ulaşılamadı.' };
  }
  if (!response.ok) return { maps: [], error: 'FACEIT maçı açılmadı.' };
  let data;
  try { data = await response.json(); } catch {
    return { maps: [], error: 'FACEIT yanıtı okunamadı.' };
  }
  const maps = parseMaps(data);
  const teams = sideTeams(data);
  if (!maps.length && !teams.length) return { maps: [], teams: [], error: 'Bu maçta harita ve takım okunamadı.' };
  return { maps, teams };
}

function sideTeams(data) {
  const payload = (data && (data.payload || data)) || {};
  const source = payload.teams || {};
  const list = [];
  for (const key of ['faction1', 'faction2']) {
    const team = source[key];
    if (!team || typeof team !== 'object') continue;
    const avatar = String(team.avatar || team.logo || '');
    const name = String(team.name || team.nickname || '').trim().slice(0, 24);
    if (!name && !avatar) continue;
    list.push({ name, logo: /^https:\/\//i.test(avatar) ? avatar : '' });
  }
  return list;
}

module.exports = { matchId, parseMaps, faceitMaps };
