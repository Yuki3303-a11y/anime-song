// Official theme metadata conversion shared by historical imports and review tools.
const normalized = value => String(value || '').normalize('NFKC').toLowerCase().replace(/[\p{P}\p{S}\s]/gu, '');

export function archiveThemeSongs(anime, context, existing = []) {
  const resource = anime.resources?.edges?.find(edge => edge.node.site === 'ANILIST')?.node;
  const sourceId = Number(resource?.link.match(/\/anime\/(\d+)/)?.[1]);
  if (sourceId !== context.anilistId) throw new Error(`Theme/work ID mismatch for ${context.slug}`);
  const themes = (anime.themes || []).filter(theme => ['OP', 'ED'].includes(theme.type) && !theme.group)
    .sort((a, b) => ['OP', 'ED'].indexOf(a.type) - ['OP', 'ED'].indexOf(b.type) || (a.sequence || 1) - (b.sequence || 1));
  const typeCounts = new Map(['OP', 'ED'].map(type => [type, themes.filter(theme => theme.type === type).length]));
  const songs = [];
  const missing = [];
  const seen = new Set();
  for (const theme of themes) {
    const title = theme.song?.title?.romaji?.trim();
    const artists = [...new Set((theme.song?.staff || [])
      .filter(staff => ['Performance', 'Featuring'].includes(staff.role))
      .map(staff => typeof staff.alias === 'string' ? staff.alias : staff.artist?.name?.main).filter(Boolean))];
    if (!title || !artists.length) {
      missing.push({ type: theme.type, sequence: theme.sequence || 1, title: title || '', reason: '歌名或演唱署名未公开' });
      continue;
    }
    const identity = `${normalized(title)}|${artists.map(normalized).join('|')}`;
    if (seen.has(identity)) continue;
    seen.add(identity);
    const sameWork = existing.filter(song => song.anilistId === context.anilistId && song.type === theme.type);
    const titleMatches = sameWork.filter(song => [song.title, song.titleCN].some(name => normalized(name) === normalized(title)));
    const variants = themes.filter(item => item.type === theme.type && normalized(item.song?.title?.romaji) === normalized(title));
    let old = titleMatches.find(song => artists.some(artist =>
      [song.artist, ...(song.artistAliases || [])].some(alias => normalized(alias) === normalized(artist))));
    if (!old && variants.length === 1 && titleMatches.length === 1) old = titleMatches[0];
    // One verified opening/ending in each source unambiguously identifies the old recording.
    if (!old && typeCounts.get(theme.type) === 1 && sameWork.length === 1) old = sameWork[0];
    songs.push({
      ...(old || { title, titleCN: title, anime: anime.title.romaji,
        animeCN: context.nameCN || context.name, animeNative: anime.title.native || context.name,
        artist: artists.join(', '), artistAliases: artists, type: theme.type }),
      animeCN: old?.animeCN || context.nameCN || old?.anime || context.name,
      animeNative: old?.animeNative || anime.title.native || context.name,
      ...(!old && variants.length > 1 ? { recordingId: `animethemes:${theme.id}` } : {}),
      season: old?.season || context.catalogSeason || context.season,
      anilistId: context.anilistId, bangumiId: context.bangumiId,
      releaseYear: old?.releaseYear || context.releaseYear || anime.year,
      themeId: theme.id, themeSequence: theme.sequence || 1,
      animethemesUrl: `https://animethemes.moe/anime/${anime.slug}`
    });
  }
  return { songs, missing };
}

export function mergeArchivedSongs(existing, incoming) {
  const result = existing.map(song => ({ ...song }));
  for (const song of incoming) {
    const same = result.find(item => item.anilistId === song.anilistId && item.type === song.type &&
      ((song.themeId && item.themeId === song.themeId) ||
        (normalized(item.title) === normalized(song.title) && normalized(item.artist) === normalized(song.artist))));
    if (same) {
      if (!same.themeId && song.themeId) { same.themeId = song.themeId; same.themeSequence = song.themeSequence; }
    } else result.push(song);
  }
  return result;
}
