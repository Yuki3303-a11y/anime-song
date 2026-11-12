import { DEFAULT_SEASON_ANIME, fetchAniList, fetchAnimeThemes, pickThemes, pickAllThemes, seasonKey } from './fetch-season.mjs';

const titleKey = title => String(title || '').normalize('NFKC').toLowerCase()
  .replace(/(?:第\s*(\d+)\s*期|(\d+)(?:st|nd|rd|th)\s+season|season\s+(\d+))/g,
    (_, a, b, c) => `season${a || b || c}`)
  .replace(/[\p{P}\p{S}\s]/gu, '');

export function matchBangumiShow(show, media, themes) {
  const byResource = themes.filter(theme => theme.resources?.some(resource => {
    try {
      const url = new URL(resource.link);
      return ['bgm.tv', 'bangumi.tv', 'chii.in'].includes(url.hostname) &&
        url.pathname.replace(/\/$/, '') === `/subject/${show.id}`;
    } catch { return false; }
  }));
  if (byResource.length) {
    if (byResource.length !== 1) return null;
    const id = byResource[0].resources.find(resource => resource.site === 'AniList')?.external_id;
    return media.find(item => item.id === Number(id)) || null;
  }
  const names = new Set([show.name, show.name_cn].map(titleKey).filter(Boolean));
  const exact = media.filter(item => [...Object.values(item.title || {}), ...(item.synonyms || [])]
    .some(name => names.has(titleKey(name))));
  return exact.length === 1 ? exact[0] : null;
}

export async function fetchBangumiRanking(year, season) {
  const key = seasonKey(year, season);
  const month = Number(key.slice(-2));
  const end = month === 10 ? `${year + 1}-01` : `${year}-${String(month + 3).padStart(2, '0')}`;
  const rows = [];
  for (let offset = 0; offset < 200;) {
    const response = await fetch(`https://api.bgm.tv/v0/search/subjects?limit=20&offset=${offset}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'User-Agent': 'anime-song-library-updater/1.0' },
      body: JSON.stringify({ keyword: '', sort: 'heat', filter: {
        type: [2], air_date: [`>=${key}-01`, `<${end}-01`]
      } }),
      signal: AbortSignal.timeout(12000)
    });
    if (!response.ok) throw new Error(`Bangumi HTTP ${response.status}`);
    const { data, total } = await response.json();
    rows.push(...data.filter(show => show.platform === 'TV' && !show.nsfw));
    if (!data.length) break;
    offset += data.length;
    if (offset >= total) break;
  }
  return [...new Map(rows.map(show => [show.id, show])).values()];
}

export async function discoverBangumiSeason(year, season) {
  const key = seasonKey(year, season);
  const [ranking, media, themes] = await Promise.all([
    fetchBangumiRanking(year, season), fetchAniList(year, season, 200), fetchAnimeThemes(year, season)
  ]);
  return {
    season: key, targetAnime: DEFAULT_SEASON_ANIME, rankSource: 'Bangumi heat (TV)', selected: [], skipped: [], audioChecks: [],
    media,
    queue: ranking.slice(0, DEFAULT_SEASON_ANIME).map((show, index) => ({
      bangumiId: show.id, rank: index + 1, original: show.name, animeCN: show.name_cn,
      coverUrl: show.images?.large || show.images?.common,
      mediaId: matchBangumiShow(show, media, themes)?.id || null
    })),
    themes: Object.fromEntries(themes.flatMap(theme => {
      const id = theme.resources?.find(resource => resource.site === 'AniList')?.external_id;
      if (!id) return [];
      const pair = pickThemes(theme);
      const allSongs = pickAllThemes(theme).map(item => ({ type: item.type,
        themeSequence: Number(item.slug?.match(/\d+/)?.[0]) || 1,
        title: item.song.title.trim(), artist: item.song.artists.map(a => a.name).filter(Boolean).join(', ') }));
      return [[id, { name: theme.name, slug: theme.slug, allSongs, songs: Object.fromEntries(
        Object.entries(pair).filter(([, item]) => item).map(([type, item]) => [type, {
          title: item.song.title.trim(), artist: item.song.artists.map(a => a.name).filter(Boolean).join(', ')
        }])
      ) }]];
    }))
  };
}

export function selectBangumiSeasonSongs(discovery, target = DEFAULT_SEASON_ANIME) {
  const selected = [], skipped = [];
  for (const row of discovery.queue.slice(0, target)) {
    const media = discovery.media.find(item => item.id === row.mediaId);
    const theme = discovery.themes[row.mediaId];
    const entries = theme?.allSongs || Object.entries(theme?.songs || {}).map(([type, song]) => ({ ...song, type }));
    if (!media || !entries.length) {
      skipped.push({ ...row, reason: !media ? '未确认作品关联' : 'OP/ED 元数据不全' });
      continue;
    }
    const songs = entries.map(entry => ({ ...entry,
      titleCN: entry.title, anime: theme.name, animeCN: row.animeCN,
      animeNative: row.original, anilistId: media.id, bangumiId: row.bangumiId,
      season: discovery.season, rank: row.rank,
      animethemesUrl: `https://animethemes.moe/anime/${theme.slug}` }));
    selected.push({ ...row, anime: theme.name, anilistId: media.id, songs });
  }
  return { complete: selected.length > 0, targetReached: selected.length === target, selected, skipped, songs: selected.flatMap(show => show.songs) };
}
