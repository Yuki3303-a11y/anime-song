// Portable personal data only. Deliberately excludes stream caches, proxy URLs and auth.
const FORMAT = 'anime-song-personal-backup';
const MAX_BYTES = 5 * 1024 * 1024;
const listLimits = {
    custom_songs_v1: 3000, fav_songs_v1: 3000, watched_anime_v1: 3000,
    selected_song_keys_v1: 6000, mistake_book_v1: 200, local_audio_checks_v1: 500,
    song_feedback_v1: 100, played_games_v1: 5, aq_rec: 50
};
const otherKeys = ['song_source_mix_v1', 'song_source_mode_v1', 'watched_only_v1',
    'audio_source_pref_v1', 'player_volume_v1', 'game_settings_v1'];
const keys = [...Object.keys(listLimits), ...otherKeys];
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const text = value => typeof value === 'string' && value.length <= 2000;
const validSong = value => object(value) && text(value.title) && value.title.trim() && text(value.anime) && value.anime.trim();
const https = value => { try { return new URL(value).protocol === 'https:'; } catch { return false; } };

export function normalizeImportedSong(value) {
    if (!validSong(value)) return null;
    const result = { title: value.title, titleCN: text(value.titleCN) && value.titleCN || value.title,
        anime: value.anime, artist: text(value.artist) && value.artist || 'Unknown',
        type: ['OP', 'ED', 'IN'].includes(value.type) ? value.type : 'OP' };
    for (const key of ['animeCN', 'animeNative', 'origin']) if (text(value[key])) result[key] = value[key];
    if (/^\d{4}-(01|04|07|10)$/.test(value.season)) result.season = value.season;
    if (Number.isSafeInteger(value.anilistId) && value.anilistId > 0) result.anilistId = value.anilistId;
    if (Number.isSafeInteger(value.bangumiId) && value.bangumiId > 0) result.bangumiId = value.bangumiId;
    if (Number.isFinite(value._importScore)) result._importScore = value._importScore;
    if (text(value.coverImage) && https(value.coverImage)) result.coverImage = value.coverImage;
    if (/^[\w-]{11}$/.test(value.youtubeVideoId)) result.youtubeVideoId = value.youtubeVideoId;
    if (/^BV[\w]{10}$/.test(value.bilibiliVideoId)) result.bilibiliVideoId = value.bilibiliVideoId;
    if (text(value.itunesPreviewUrl) && https(value.itunesPreviewUrl) &&
        /(^|\.)itunes\.apple\.com$/.test(new URL(value.itunesPreviewUrl).hostname)) result.itunesPreviewUrl = value.itunesPreviewUrl;
    return result;
}

function validSetting(key, value) {
    if (key === 'audio_source_pref_v1') return ['smart', 'bilibili-only', 'itunes-youtube'].includes(value);
    if (key === 'song_source_mode_v1') return ['mix', 'single'].includes(value);
    if (key === 'watched_only_v1') return ['0', '1'].includes(value);
    if (key === 'player_volume_v1') return value.trim() !== '' && Number.isFinite(Number(value)) && Number(value) >= 0 && Number(value) <= 100;
    const data = JSON.parse(value);
    if (!object(data)) return false;
    if (key === 'song_source_mix_v1') return Array.isArray(data.seasons) && data.seasons.length <= 100 &&
        data.seasons.every(season => typeof season === 'string' && /^\d{4}-(01|04|07|10)$/.test(season)) &&
        ['legacy', 'imported', 'watched'].every(field => typeof data[field] === 'boolean') &&
        (data.selected === undefined || typeof data.selected === 'boolean');
    return [10, 20, 30].includes(data.questionCount) && Array.isArray(data.types) &&
        data.types.every(type => ['OP', 'ED', 'IN'].includes(type)) &&
        (data.source === null || ['builtin', 'legacy', 'custom', 'mix'].includes(data.source) ||
            typeof data.source === 'string' && /^season:\d{4}-(01|04|07|10)$/.test(data.source));
}

function validListItem(key, value) {
    if (key === 'watched_anime_v1' || key === 'selected_song_keys_v1') return text(value);
    if (key === 'custom_songs_v1' || key === 'fav_songs_v1') {
        if (!validSong(value) || !['titleCN', 'artist', 'animeCN', 'animeNative', 'coverImage', 'origin'].every(field => value[field] === undefined || text(value[field])) ||
            value.type !== undefined && !['OP', 'ED', 'IN'].includes(value.type)) return false;
        const normalized = normalizeImportedSong(value);
        return ['anilistId', 'bangumiId', 'itunesPreviewUrl', 'youtubeVideoId', 'bilibiliVideoId'].every(field =>
            value[field] === undefined || normalized[field] === value[field]);
    }
    if (key === 'played_games_v1') return Array.isArray(value) && value.length <= 30 && value.every(text);
    if (!object(value)) return false;
    if (key === 'aq_rec') return ['s', 'c', 'r', 'n'].every(field => value[field] === undefined || Number.isFinite(value[field])) &&
        text(value.m) && text(value.t);
    if (!text(value.key) || !text(value.title) || !text(value.anime) || !Number.isFinite(value.at)) return false;
    if (key === 'mistake_book_v1') return Number.isInteger(value.count) && value.count > 0 && text(value.selected);
    if (key === 'local_audio_checks_v1') return ['played', 'failed'].includes(value.status) && text(value.source) && (value.reason === undefined || text(value.reason));
    return ['unplayable', 'wrong-match', 'metadata'].includes(value.reason) && text(value.note);
}

export function parsePersonalBackup(input) {
    if (typeof input !== 'string' || input.length > MAX_BYTES) throw new Error('备份文件过大或内容无效');
    const document = JSON.parse(input);
    if (!object(document) || document.format !== FORMAT || document.version !== 1 || !object(document.data)) {
        throw new Error('不是受支持的个人数据备份（需要版本 1）');
    }
    for (const [key, value] of Object.entries(document.data)) {
        if (!keys.includes(key) || value !== null && typeof value !== 'string') throw new Error(`备份包含不支持的数据项：${key}`);
        if (value === null) continue; // Explicitly restore an unset preference or empty profile section.
        const valid = Object.hasOwn(listLimits, key) ? (() => {
            const list = JSON.parse(value);
            return Array.isArray(list) && list.length <= listLimits[key] && list.every(item => validListItem(key, item));
        })() : validSetting(key, value);
        if (!valid) throw new Error(`备份数据格式不正确：${key}`);
    }
    if (!Object.keys(document.data).length) throw new Error('备份中没有可恢复的个人数据');
    return document;
}

export function createPersonalBackup(storage) {
    const data = {};
    for (const key of keys) {
        data[key] = storage.getItem(key);
    }
    return parsePersonalBackup(JSON.stringify({ format: FORMAT, version: 1, exportedAt: new Date().toISOString(), data }));
}

export function restorePersonalBackup(storage, document) {
    const validated = parsePersonalBackup(JSON.stringify(document));
    const previous = new Map(Object.keys(validated.data).map(key => [key, storage.getItem(key)]));
    const written = [];
    try {
        for (const [key, value] of Object.entries(validated.data)) {
            if (value === null) storage.removeItem(key);
            else storage.setItem(key, value);
            written.push(key);
        }
    } catch (error) {
        for (const key of written.reverse()) {
            const old = previous.get(key);
            if (old === null) storage.removeItem(key);
            else storage.setItem(key, old);
        }
        throw error;
    }
}

export function describePersonalBackup(document) {
    const count = key => JSON.parse(document.data[key] || '[]').length;
    return `导入歌曲 ${count('custom_songs_v1')} 首 · 收藏 ${count('fav_songs_v1')} 首 · 追番 ${count('watched_anime_v1')} 部 · 错题 ${count('mistake_book_v1')} 首 · 自选 ${count('selected_song_keys_v1')} 首`;
}
