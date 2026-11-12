import { DEFAULT_SEASON_ANIME } from './fetch-season.mjs';

const QUARTERS = { winter: '01', spring: '04', summer: '07', fall: '10' };
const VALID_SOURCES = new Set(['itunes', 'youtube', 'bilibili']);
export const seasonAudioKey = song => `${song.anilistId}|${song.type}|${song.songTitle || song.title || ''}`;

export function currentLocalSeason(date = new Date()) {
  const month = date.getMonth() + 1;
  const season = month <= 3 ? 'winter' : month <= 6 ? 'spring' : month <= 9 ? 'summer' : 'fall';
  const year = date.getFullYear();
  return { year, season, key: `${year}-${QUARTERS[season]}` };
}

export function prepareSeasonForPublish(candidate, seasonKey, chineseNamesById, audioChecks) {
  if (!/^\d{4}-(01|04|07|10)$/.test(seasonKey)) throw new Error(`Invalid season key: ${seasonKey}`);
  if (candidate?.season !== seasonKey) throw new Error(`Candidate season does not match ${seasonKey}`);
  if (!candidate?.complete) throw new Error(`Candidate ${seasonKey} is incomplete`);
  if (!Number.isInteger(candidate.targetAnime) || candidate.targetAnime < 1 || candidate.targetAnime > DEFAULT_SEASON_ANIME ||
      !Array.isArray(candidate.selected) || !candidate.selected.length || candidate.selected.length > candidate.targetAnime)
    throw new Error(`Expected 1 to ${DEFAULT_SEASON_ANIME} anime for ${seasonKey}`);

  const selectedIds = new Set();
  const songs = [];
  const songNames = new Set();
  const covers = {};
  const audioByTrack = new Map((audioChecks || []).map(check => [seasonAudioKey(check), check]));

  for (const show of candidate.selected) {
    if (!Number.isInteger(show.anilistId) || selectedIds.has(show.anilistId))
      throw new Error(`Expected ${DEFAULT_SEASON_ANIME} unique AniList IDs; duplicate or invalid ID ${show.anilistId}`);
    selectedIds.add(show.anilistId);

    const chineseName = String(chineseNamesById?.[show.anilistId] || '').trim();
    if (!chineseName) throw new Error(`Missing Bangumi Chinese name for ${show.anime} (${show.anilistId})`);
    let cover;
    try { cover = new URL(show.coverUrl); } catch { throw new Error(`Invalid cover URL for ${show.anime}`); }
    if (cover.protocol !== 'https:') throw new Error(`Cover must use HTTPS for ${show.anime}`);
    covers[String(show.anilistId)] = cover.href;

    if (!Array.isArray(show.songs) || !show.songs.length || show.songs.some(song => !['OP', 'ED'].includes(song.type)))
      throw new Error(`${show.anime} must have at least one verified OP or ED`);

    for (const song of show.songs) {
      for (const field of ['title', 'artist', 'anime']) {
        if (!String(song[field] || '').trim()) throw new Error(`Missing ${field} for ${show.anime} ${song.type}`);
      }
      if (song.anilistId !== show.anilistId || song.season !== seasonKey || song.anime !== show.anime)
        throw new Error(`Song/show AniList ID, anime or season mismatch for ${show.anime} ${song.type}`);
      const audio = audioByTrack.get(seasonAudioKey(song)) ||
        (show.songs.filter(item => item.type === song.type).length === 1 && audioByTrack.get(`${song.anilistId}|${song.type}|`));
      if (!audio?.playable || !VALID_SOURCES.has(audio.source))
        throw new Error(`No verified playable audio source for ${show.anime} ${song.type}: ${song.title}`);

      const entry = {
        titleCN: String(song.titleCN || song.title).trim(),
        title: song.title.trim(),
        anime: song.anime,
        artist: song.artist.trim(),
        type: song.type,
        season: seasonKey,
        anilistId: show.anilistId,
        animethemesUrl: song.animethemesUrl,
        animeCN: chineseName
      };
      const songNameKey = `${entry.title.toLocaleLowerCase()}|${entry.anime.toLocaleLowerCase()}|${entry.artist.toLocaleLowerCase()}`;
      if (songNames.has(songNameKey)) throw new Error(`Duplicate song entry: ${entry.title} — ${entry.anime}`);
      songNames.add(songNameKey);
      if (song.animeNative) entry.animeNative = song.animeNative;
      if (Number.isInteger(song.themeSequence)) entry.themeSequence = song.themeSequence;
      if (Array.isArray(song.artistAliases)) entry.artistAliases = song.artistAliases.filter(alias => typeof alias === 'string' && alias.trim());
      if (song.youtubeVideoId && /^[A-Za-z0-9_-]{11}$/.test(song.youtubeVideoId)) entry.youtubeVideoId = song.youtubeVideoId;
      if (audio.source === 'youtube' && /^[A-Za-z0-9_-]{11}$/.test(audio.videoId || ''))
        entry.youtubeVideoId = audio.videoId;
      if (audio.source === 'bilibili' && /^BV\w{10}$/.test(audio.bvid || ''))
        entry.bilibiliVideoId = audio.bvid;
      if (audio.source === 'itunes' && audio.url) {
        const url = new URL(audio.url);
        if (url.protocol === 'https:' && url.hostname.endsWith('.itunes.apple.com') &&
            !url.username && !url.password && !url.port) entry.itunesPreviewUrl = url.href;
      }
      songs.push(entry);
    }
  }

  const trackIds = new Set(songs.map(song => `${song.anilistId}|${song.type}|${song.title}|${song.artist}`));
  if (trackIds.size !== songs.length) throw new Error('Duplicate track entries found in candidate');
  return { songs, covers };
}

export function mergeSeasonData(pools, covers, seasonKey, prepared) {
  if (Object.hasOwn(pools, seasonKey)) throw new Error(`${seasonKey} is already published; refusing to overwrite it`);
  for (const [id, cover] of Object.entries(prepared.covers)) {
    if (Object.hasOwn(covers, id) && covers[id] !== cover)
      throw new Error(`Conflicting cover already exists for AniList ID ${id}`);
  }
  const nextPools = { ...pools, [seasonKey]: prepared.songs };
  const nextCovers = { ...covers, ...prepared.covers };
  return { pools: nextPools, covers: nextCovers };
}
