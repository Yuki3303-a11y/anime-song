import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth, signInAnonymously, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { getDatabase, ref, get, onValue, update, runTransaction, serverTimestamp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-database.js";
import { SONGS, ALL_ANIME, AVAILABLE_TYPES } from './songs.js?v=50';
import { SEASONAL_POOLS } from './seasonal-pools.js?v=38';
import { SEASONAL_COVERS } from './seasonal-covers.js?v=1';
import { sourceSelection, sourceFromSelection, selectMixedSongs, createPreviewSession, searchLibraryTracks, groupLibrarySongs, mixForAddedSong } from './library-navigation.mjs?v=6';
import { animeKey, trackKey, groupSeasonSongs, filterWatchedSongs, putMistake, putAudioCheck, putFeedback } from './library-tools.mjs?v=1';
import { rankAudioCandidates, uniqueChallengePool, audioSearchQueries, pickReplacementSong } from './audio-selection.mjs?v=3';

// =====================================================================
// Firebase
// =====================================================================
const firebaseConfig = {
    apiKey: "AIzaSyB56AgyW8z294B9ni8afp72ZPZhfRJ0jNw",
    authDomain: "animequiz-a16c1.firebaseapp.com",
    projectId: "animequiz-a16c1",
    storageBucket: "animequiz-a16c1.firebasestorage.app",
    messagingSenderId: "687982181232",
    appId: "1:687982181232:web:50f2582291064a6a9dedb5",
    databaseURL: "https://animequiz-a16c1-default-rtdb.asia-southeast1.firebasedatabase.app"
};
let db, auth, user, roomId, roomUnsub;

try {
    const app = initializeApp(firebaseConfig);
    auth = getAuth(app);
    db = getDatabase(app);
    signInAnonymously(auth).catch(() => {
        document.getElementById('uidText').textContent = '离线';
    });
    onAuthStateChanged(auth, u => {
        if (u) {
            user = u;
            document.getElementById('statusDot').classList.add('online');
            document.getElementById('uidText').textContent = u.uid.slice(0, 6);
            checkInvite();
        }
    });
} catch (e) {
    document.getElementById('uidText').textContent = '离线';
}

// =====================================================================
// Game State
// =====================================================================
const gameState = {
    mode: 'single',
    gameMode: 'anime',      // 单人子模式: anime / song / artist / mixed
    guessType: 'anime',     // 当前题题型: anime / song / artist
    hints: { h1: false, h2: false },  // 提示使用状态（h1/h2 各一次）
    playlist: [],
    activePool: [],
    questionIndex: 0,
    questionCount: 10,
    score: 0,
    opponentScore: 0,
    correctAnime: '',
    currentSong: null,
    isLocked: false,
    isPlaying: false,
    combo: 0,
    maxCombo: 0,
    correctCount: 0,
    answerHistory: [],
    viewingHistory: false,
    fetchGeneration: 0,
    lastAudioResult: null,
    mediaState: 'idle',
    mediaRetryCount: 0,
    recoveringAudio: false,
    failedAudioSources: new Set(),
    failedBiliVideos: new Set(),
    failedYtVideos: new Set(),
};

const $ = id => document.getElementById(id);
function escapeHTML(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
const audio = $('audioEl');
const progressFill = $('progressFill');

// =====================================================================
// Timeout Constants
// =====================================================================
const ITUNES_TIMEOUT = 5000;       // iTunes API fetch timeout (ms)
const YT_TIMEOUT = 6000;           // YouTube Data API search timeout (ms)
const ANILIST_TIMEOUT = 4000;      // AniList GraphQL timeout (ms)
const BANGUMI_TIMEOUT = 4000;      // Bangumi search timeout (ms)
const BANGUMI_PAGE_TIMEOUT = 20000; // Bangumi subject page fetch timeout (ms)
const NOTIFY_DURATION = 2500;      // Toast auto-dismiss duration (ms)
const PK_RETRY_DELAY = 1000;       // PK retry backoff (ms)
const PK_RETRY_COUNT = 3;          // PK max retry attempts

const BILI_TIMEOUT = 12000;        // B站 proxy fetch timeout (ms)

// B站代理失败状态（用于提示分级：代理不可达 / 取流被风控 / 无搜索结果）
const biliProxyState = { down: false, notified: false, reason: null };
const BILI_WORKER_URL_DEFAULT = 'https://anime-song-gamma.vercel.app';
function normalizeLocalProxyUrl(value) {
    return value.replace(/^http:\/\/localhost(?=[:/]|$)/i, 'http://127.0.0.1');
}
window.BILI_WORKER_URL = (() => {
    try { return normalizeLocalProxyUrl(localStorage.getItem('bili_proxy_url_v1') || BILI_WORKER_URL_DEFAULT); }
    catch { return BILI_WORKER_URL_DEFAULT; }
})();

// 自动探测本地代理：用户没手动设置代理地址时，若本机代理（bili-proxy.mjs）在运行就自动使用它。
// 本地代理从用户自己网络访问 B站，不会被境外服务器风控，B站模式更稳。
function probeLocalProxy() {
    try {
        if (localStorage.getItem('bili_proxy_url_v1')) return; // 用户已手动指定代理，不覆盖
    } catch { return; }
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), 1500);
    fetch('http://127.0.0.1:8765/api/search?q=__probe__', { signal: ctl.signal })
        .then(r => {
            clearTimeout(t);
            if (r.ok) {
                window.BILI_WORKER_URL = 'http://127.0.0.1:8765';
                console.log('[Bili] 已自动使用本地代理 http://127.0.0.1:8765');
            }
        })
        .catch(() => clearTimeout(t));
}

// =====================================================================
// Filter State
// =====================================================================
const filterState = { types: new Set(), source: null, watchedOnly: (() => {
    try { return localStorage.getItem('watched_only_v1') === '1'; }
    catch { return false; }
})() };
const SOURCE_MIX_KEY = 'song_source_mix_v1';
function defaultSourceMix() {
    return { legacy: true, seasons: Object.keys(SEASONAL_POOLS).filter(key => SEASONAL_POOLS[key].length === 30), imported: true, watched: false, selected: true };
}
function loadSourceMix() {
    try {
        const saved = JSON.parse(localStorage.getItem(SOURCE_MIX_KEY) || 'null');
        if (!saved || !Array.isArray(saved.seasons)) return defaultSourceMix();
        return { legacy: !!saved.legacy, seasons: saved.seasons.filter(key => SEASONAL_POOLS[key]?.length === 30),
            imported: !!saved.imported, watched: !!saved.watched, selected: saved.selected !== false };
    } catch { return defaultSourceMix(); }
}
filterState.mix = loadSourceMix();
try { if (localStorage.getItem('song_source_mode_v1') === 'mix') filterState.source = 'mix'; } catch {}

const PERSONAL_KEYS = {
    watched: 'watched_anime_v1', mistakes: 'mistake_book_v1',
    audio: 'local_audio_checks_v1', feedback: 'song_feedback_v1', selected: 'selected_song_keys_v1'
};
function readPersonalList(key) {
    try {
        const parsed = JSON.parse(localStorage.getItem(key) || '[]');
        return Array.isArray(parsed) ? parsed : [];
    } catch { return []; }
}
function savePersonalList(key, entries) {
    try { localStorage.setItem(key, JSON.stringify(entries)); }
    catch (error) { console.warn('[Library] local save failed:', error); }
}
let watchedAnimeKeys = readPersonalList(PERSONAL_KEYS.watched).filter(key => typeof key === 'string');
let mistakeBook = readPersonalList(PERSONAL_KEYS.mistakes);
let audioChecks = readPersonalList(PERSONAL_KEYS.audio);
let songFeedback = readPersonalList(PERSONAL_KEYS.feedback);
let selectedSongKeys = readPersonalList(PERSONAL_KEYS.selected).filter(key => typeof key === 'string');
function getWatchedAnimeKeys() { return watchedAnimeKeys; }
function recordMistake(song, selected) {
    mistakeBook = putMistake(mistakeBook, song, selected);
    savePersonalList(PERSONAL_KEYS.mistakes, mistakeBook);
}
function recordLocalAudioCheck(song, status, source = '') {
    if (!song) return;
    audioChecks = putAudioCheck(audioChecks, song, status, source);
    savePersonalList(PERSONAL_KEYS.audio, audioChecks);
}

let audioSourcePref = (() => {
    try {
        const saved = localStorage.getItem('audio_source_pref_v1');
        return saved === 'bilibili-only' || saved === 'itunes-youtube' ? saved : 'smart';
    } catch { return 'smart'; }
})();

function saveAudioSourcePref(value) {
    try {
        if (value === null) localStorage.removeItem('audio_source_pref_v1');
        else localStorage.setItem('audio_source_pref_v1', value);
        audioSourcePref = value;
    } catch {}
}

function updateFilterCount() {
    const count = uniqueChallengePool(getFilteredSongs()).length;
    $('filterCount').textContent = `共 ${count} 首可选`;
    $('songCount').textContent = count + '+';
    const selected = sourceSelection(filterState.source);
    const sourceName = selected.group === 'mix' ? '自由组合' : selected.group === 'all' ? '全部歌曲' : selected.group === 'custom' ? '我的导入' :
        selected.official === 'legacy' ? '原有曲库' : selected.official === 'season' ? `${selected.season.slice(0, 4)} 年 ${Number(selected.season.slice(5))} 月新番` : '全部官方曲库';
    $('menuSourceSummary').textContent = `${sourceName}${filterState.watchedOnly ? ' · 仅追番' : ''} · ${count} 首`;
    if (typeof selectedLibraryTab !== 'undefined' && selectedLibraryTab === 'current' &&
        !$('v-library').classList.contains('hidden')) renderCurrentLibrary();
}

// =====================================================================
// In-Memory Cache Layer (reads localStorage once, fast access after)
// =====================================================================
class MemCache {
    constructor(key, maxEntries, ttlMs) {
        this._key = key;
        this._max = maxEntries;
        this._ttlMs = ttlMs;       // undefined = no expiry
        this._data = null;
        this._dirty = false;
        this._timer = 0;
    }
    _load() {
        if (this._data) return;
        try { this._data = JSON.parse(localStorage.getItem(this._key) || '{}'); }
        catch (e) { console.error('[Cache] _load:', e); this._data = {}; }
    }
    get(k) {
        this._load();
        const entry = this._data[k];
        if (!entry) return null;
        // With TTL, entries are { value, ts } wrappers; check expiry
        if (this._ttlMs && typeof entry === 'object' && 'ts' in entry) {
            if (Date.now() - entry.ts > this._ttlMs) {
                delete this._data[k];
                this._dirty = true;
                this._scheduleFlush();
                return null;
            }
            return entry.value;
        }
        return entry;
    }
    set(k, v) {
        this._load();
        const stored = this._ttlMs ? { value: v, ts: Date.now() } : v;
        this._data[k] = stored;
        this._dirty = true;
        const keys = Object.keys(this._data);
        if (keys.length > this._max) {
            keys.slice(0, keys.length - this._max).forEach(k => delete this._data[k]);
        }
        this._scheduleFlush();
    }
    _scheduleFlush() {
        if (this._timer) return;
        this._timer = setTimeout(() => {
            this._timer = 0;
            if (!this._dirty) return;
            try { localStorage.setItem(this._key, JSON.stringify(this._data)); }
            catch (e) { console.error('[Cache] _flush:', e); }
            this._dirty = false;
        }, 200);
    }
    delete(k) {
        this._load();
        if (k in this._data) {
            delete this._data[k];
            this._dirty = true;
            this._scheduleFlush();
        }
    }
    clear() {
        this._data = {};
        this._dirty = true;
        this._flush();
    }
    _flush() {
        if (this._timer) { clearTimeout(this._timer); this._timer = 0; }
        if (!this._dirty) return;
        try { localStorage.setItem(this._key, JSON.stringify(this._data)); }
        catch (e) { console.error('[Cache] _flush:', e); }
        this._dirty = false;
    }
}

const audioCache = new MemCache('audio_cache_v3', 500, 24 * 60 * 60 * 1000);
const animeDetailCache = new MemCache('anime_detail_cache_v1', 300);
const youtubeCache = new MemCache('youtube_cache_v1', 200);
const bilibiliCache = new MemCache('bilibili_cache_v2', 200, 24 * 60 * 60 * 1000);
const bilibiliAudioCache = new MemCache('bilibili_audio_cache_v1', 200, 30 * 60 * 1000);

// =====================================================================
// YouTube Full Song Player
// =====================================================================
// YouTube Data API keys — add more to increase daily quota (100 searches/key/day)
const YT_API_KEYS = [
    'AIzaSyDD0nNleGHHrbuMahHvoPGJCJe4a8zKIV8',
    'AIzaSyDLd9r91wT0DZdQmTKlXxZCdYFtZBsaasY',
    'AIzaSyBXRRu63opUKrGQhu3E5yUI9gYUTedxLrQ',
    'AIzaSyBNFNUYb7cN9q6ROEslJwU16K5tqxXu9o0',
    'AIzaSyD3Thxm5vMGTja9h5hW91zHALjJ8vCXGyU',
];
let ytKeyIndex = 0;
const ytKeyExhausted = new Set(); // indices of keys known to be over quota
let ytPlayer = null;
let ytReady = false;
let youtubeApiPromise = null;
let fpProgressInterval = null;
let fpAudioInterval = null;
let musicProgressInterval = null;
let fpUseAudio = false;  // true when full player falls back to native <audio>
let musicUseAudio = false; // true when music player uses <audio> (B站 source)

// Quiz YouTube fallback state
const quizYT = { active: false, videoId: null, timer: null };
let quizProgressInterval = null;

// Playlist state for home page music playback
const playlist = {
    songs: [],
    currentIndex: -1,
    mode: 'free',  // 'free' | 'sequential' | 'shuffle'
    playing: false
};

function ensureYouTubeAPI() {
    if (ytReady && ytPlayer) return Promise.resolve(ytPlayer);
    if (youtubeApiPromise) return youtubeApiPromise;
    youtubeApiPromise = new Promise((resolve, reject) => {
    const tag = document.createElement('script');
    tag.src = 'https://www.youtube.com/iframe_api';

    let loadFailed = false;
    const fail = (message) => {
        if (loadFailed) return;
        loadFailed = true;
        clearTimeout(failTimer);
        tag.remove();
        youtubeApiPromise = null;
        reject(new Error(message));
    };
    const failTimer = setTimeout(() => {
        if (!ytReady) {
            console.error('[YT] IFrame API load timeout (15s)');
            fail('YouTube播放器加载超时');
        }
    }, 15000);

    // MUST define callback BEFORE appending script — mobile browsers may load instantly
    window.onYouTubeIframeAPIReady = () => {
        if (loadFailed) return;
        try {
            ytPlayer = new YT.Player('ytPlayerEl', {
                height: '360', width: '640',
                playerVars: { autoplay: 0, controls: 0, disablekb: 1, playsinline: 1 },
                events: {
                    onReady: () => { if (loadFailed) return; ytReady = true; clearTimeout(failTimer); applyPlayerVolume(); resolve(ytPlayer); },
                    onStateChange: onYtStateChange,
                    onError: onYtError
                }
            });
        } catch (e) {
            console.error('[YT] Player constructor failed:', e);
            fail('YouTube播放器初始化失败');
        }
    };

    tag.onerror = () => {
        console.error('[YT] IFrame API script load error');
        fail('YouTube播放器加载失败');
    };

    document.head.appendChild(tag);
    });
    return youtubeApiPromise;
}

function onYtError(e) {
    // YouTube error codes: 2=invalid param, 5=HTML5 error, 100=not found, 101/150=not embeddable
    const errorReasons = {
        2: '参数无效',
        5: '播放出错（HTML5播放器问题）',
        100: '视频未找到或已下架',
        101: '视频不允许嵌入播放',
        150: '视频不允许嵌入播放'
    };
    const reason = errorReasons[e.data] || `播放出错（错误码${e.data}）`;

    // Quiz YouTube fallback — skip this question
    if (quizYT.active) {
        recoverQuestionAudio(`YouTube播放失败：${reason}`);
        return;
    }

    if (libraryPreviewSession.activeKey && libraryPreviewResult?.source === 'youtube') {
        recoverLibraryPreviewAudio(`YouTube播放失败：${reason}`);
        return;
    }

    // Detail modal full player
    if ($('animeDetailModal').classList.contains('show')) {
        // Embed errors (101/150): auto-switch to iTunes + show YouTube external link
        if ((e.data === 101 || e.data === 150) && gameState.currentSong) {
            const ytLink = $('fpYtLink');
            const ytHref = ytLink?.getAttribute('href') || '';
            const videoId = ytHref.includes('youtube.com/watch?v=') ? ytHref.split('v=')[1]?.split('&')[0] : null;
            stopFullPlayer();
            if (videoId && ytLink) {
                ytLink.href = `https://www.youtube.com/watch?v=${videoId}`;
                ytLink.textContent = 'YouTube源外部链接';
                ytLink.style.display = '';
            }
            const song = gameState.currentSong;
            fetchAudio(song.title, song.artist, song.anime).then(result => {
                if (!$('animeDetailModal').classList.contains('show')) return;
                const url = result?.url;
                const playerEl = $('fullPlayer');
                if (!url || url.startsWith('yt:')) {
                    // iTunes also unavailable — keep player visible with YT link only
                    playerEl.style.display = '';
                    $('fpTitle').textContent = `${song.titleCN || song.title} — ${song.artist}`;
                    $('fpSource').textContent = '无试听片段';
                    updateHeartUI();
                    return;
                }
                playerEl.style.display = '';
                fpUseAudio = true;
                audio.src = url;
                $('fpTitle').textContent = `${song.titleCN || song.title} — ${song.artist}`;
                $('fpSource').textContent = '(试听片段)';
                updateHeartUI();
                const fpCover = $('fpCover');
                const fpFallback = $('fpIconBox')?.querySelector('.fp-cover-fallback');
                const detailCoverSrc = $('detailCover')?.src;
                if (fpCover && detailCoverSrc) {
                    fpCover.src = detailCoverSrc;
                    fpCover.style.display = '';
                    if (fpFallback) fpFallback.style.display = 'none';
                }
            });
            notify(`该歌曲暂时无法播放（${reason}），已切换为试听片段`);
            return;
        }
        notify(`该歌曲暂时无法播放（${reason}）`);
        stopFullPlayer();
        return;
    }

    // Music modal (favorites playlist) — stop and skip to next
    if ($('musicModal').classList.contains('show')) {
        notify(`该歌曲暂时无法播放（${reason}），跳到下一首`);
        stopMusicPlayer();
        if (playlist.mode !== 'free' && playlist.songs.length > 1) {
            setTimeout(() => playNextSong(), 1500);
        }
        return;
    }

    // Fallback
    notify(`播放出错（${reason}）`);
}

function onYtStateChange(e) {
    // Quiz YouTube fallback — update quiz player UI
    if (quizYT.active) {
        if (e.data === YT.PlayerState.PLAYING) {
            setQuizMediaState('playing', '正在播放 · YouTube源');
            $('playIcon').innerHTML = '<rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/>';
            gameState.isPlaying = true;
            $('visualizer').classList.remove('hidden');
            startQuizProgress();
            // Start 30s timer from actual playback start (not load time)
            clearTimeout(quizYT.timer);
            quizYT.timer = setTimeout(() => {
                if (quizYT.active) {
                    if (ytPlayer && ytPlayer.pauseVideo) ytPlayer.pauseVideo();
                    stopQuizProgress();
                    gameState.isPlaying = false;
                    setQuizMediaState('ready', '试听结束 · YouTube源');
                    $('visualizer').classList.add('hidden');
                    $('playIcon').innerHTML = '<path d="M8 5v14l11-7z"/>';
                }
            }, 30000);
        } else if (e.data === YT.PlayerState.ENDED) {
            clearQuizMediaTimeout();
            gameState.isPlaying = false;
            setQuizMediaState('ready', '播放结束 · YouTube源');
            $('visualizer').classList.add('hidden');
            $('playIcon').innerHTML = '<path d="M8 5v14l11-7z"/>';
        } else {
            $('playIcon').innerHTML = '<path d="M8 5v14l11-7z"/>';
            stopQuizProgress();
        }
        return; // Don't also update full player / music player
    }

    if (libraryPreviewSession.activeKey && libraryPreviewResult?.source === 'youtube') {
        if (e.data === YT.PlayerState.PLAYING) {
            clearTimeout(libraryPreviewTimer);
            libraryPreviewState = 'playing';
            recordLocalAudioCheck(libraryPreviewSong, 'played', 'youtube');
            updateLibraryTrackStatus(libraryPreviewSong);
            libraryPreviewTimer = setTimeout(() => {
                if (!libraryPreviewSession.activeKey || libraryPreviewResult?.source !== 'youtube') return;
                ytPlayer?.pauseVideo?.();
                libraryPreviewState = 'ended';
                updateLibraryPreviewUI();
            }, 30000);
        } else if (e.data === YT.PlayerState.ENDED) {
            clearTimeout(libraryPreviewTimer);
            libraryPreviewState = 'ended';
        } else if (e.data === YT.PlayerState.PAUSED && libraryPreviewState === 'playing') {
            clearTimeout(libraryPreviewTimer);
            libraryPreviewState = 'paused';
        }
        updateLibraryPreviewUI();
        return;
    }

    // Update detail modal player UI (only in YouTube mode)
    if (fpUseAudio) return;
    const icon = $('fpPlayIcon');
    const wave = $('fpWave');
    if (icon) {
        if (e.data === YT.PlayerState.PLAYING) {
            icon.innerHTML = '<rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/>';
            if (wave) wave.classList.add('active');
            startFpProgress();
        } else {
            icon.innerHTML = '<path d="M8 5v14l11-7z"/>';
            if (wave) wave.classList.remove('active');
            stopFpProgress();
        }
    }

    // Update music modal player UI
    const mIcon = $('musicPlayIcon');
    if (mIcon) {
        if (e.data === YT.PlayerState.PLAYING) {
            mIcon.innerHTML = '<rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/>';
            playlist.playing = true;
            startMusicProgress();
        } else {
            mIcon.innerHTML = '<path d="M8 5v14l11-7z"/>';
            playlist.playing = false;
            stopMusicProgress();
        }
    }

    // Auto-next when song ends (sequential/shuffle mode)
    if (e.data === YT.PlayerState.ENDED) {
        if (playlist.mode !== 'free' && playlist.songs.length > 0) {
            playNextSong();
        }
    }
}

function startFpProgress() {
    stopFpProgress();
    fpProgressInterval = setInterval(() => {
        if (!ytPlayer || !ytPlayer.getCurrentTime) return;
        const cur = ytPlayer.getCurrentTime();
        const dur = ytPlayer.getDuration();
        if (dur > 0) {
            const pct = (cur / dur * 100) + '%';
            $('fpProgressFill').style.width = pct;
            $('fpProgressDot').style.left = pct;
            $('fpCurrent').textContent = formatTime(cur);
            $('fpDuration').textContent = formatTime(dur);
        }
    }, 500);
}

function stopFpProgress() {
    if (fpProgressInterval) { clearInterval(fpProgressInterval); fpProgressInterval = null; }
}

function startFpAudioProgress() {
    stopFpAudioProgress();
    fpAudioInterval = setInterval(() => {
        if (audio.duration) {
            const pct = (audio.currentTime / audio.duration * 100) + '%';
            $('fpProgressFill').style.width = pct;
            $('fpProgressDot').style.left = pct;
            $('fpCurrent').textContent = formatTime(audio.currentTime);
        }
    }, 250);
}

function stopFpAudioProgress() {
    if (fpAudioInterval) { clearInterval(fpAudioInterval); fpAudioInterval = null; }
}

function formatTime(s) {
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return m + ':' + (sec < 10 ? '0' : '') + sec;
}

async function searchYouTube(query) {
    const cacheKey = query;
    const cached = youtubeCache.get(cacheKey);
    if (cached) return cached;

    // Try each key until one works
    const tried = new Set();
    while (tried.size < YT_API_KEYS.length) {
        const idx = ytKeyIndex;
        if (tried.has(idx)) {
            ytKeyIndex = (ytKeyIndex + 1) % YT_API_KEYS.length;
            continue;
        }
        tried.add(idx);
        if (ytKeyExhausted.has(idx)) {
            ytKeyIndex = (ytKeyIndex + 1) % YT_API_KEYS.length;
            continue;
        }
        const key = YT_API_KEYS[idx];
        // Per-attempt timeout — a hung request used to stall the whole fallback chain
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), YT_TIMEOUT);
        try {
            const res = await fetch(
                `https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&videoCategoryId=10&videoEmbeddable=true&videoSyndicated=true&maxResults=1&q=${encodeURIComponent(query)}&key=${key}`,
                { signal: controller.signal }
            );
            clearTimeout(timeoutId);
            if (res.status === 403 || res.status === 429) {
                console.warn('[YT] Key #' + idx + ' quota exceeded, switching...');
                ytKeyExhausted.add(idx);
                ytKeyIndex = (ytKeyIndex + 1) % YT_API_KEYS.length;
                continue;
            }
            const data = await res.json();
            const videoId = data.items?.[0]?.id?.videoId || null;
            if (videoId) youtubeCache.set(cacheKey, videoId);
            return videoId;
        } catch (e) {
            clearTimeout(timeoutId);
            console.error('[YT] searchYouTube failed:', e);
            // Network error — try next key
            ytKeyIndex = (ytKeyIndex + 1) % YT_API_KEYS.length;
        }
    }
    console.error('[YT] All keys exhausted or failed');
    return null;
}

// Quiz searches inspect multiple videos. Search's embeddable filter is useful,
// but the player can still reject a video later (Content ID / platform policy).
async function searchQuizYouTubeCandidates(song) {
    let networkFailures = 0;
    for (const query of audioSearchQueries(song).youtube) {
        const tried = new Set();
        while (tried.size < YT_API_KEYS.length) {
            const idx = ytKeyIndex;
            ytKeyIndex = (ytKeyIndex + 1) % YT_API_KEYS.length;
            if (tried.has(idx)) continue;
            tried.add(idx);
            if (ytKeyExhausted.has(idx)) continue;
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), YT_TIMEOUT);
            try {
                const key = YT_API_KEYS[idx];
                const response = await fetch(`https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&videoEmbeddable=true&maxResults=10&q=${encodeURIComponent(query)}&key=${key}`, { signal: controller.signal });
                if (response.status === 403 || response.status === 429) { ytKeyExhausted.add(idx); continue; }
                if (!response.ok) continue;
                const items = (await response.json()).items || [];
                const ids = items.map(item => item.id?.videoId).filter(Boolean);
                if (!ids.length) break;
                const details = await fetch(`https://www.googleapis.com/youtube/v3/videos?part=status&id=${ids.join(',')}&key=${key}`, { signal: controller.signal });
                if (!details.ok) break;
                const status = new Map(((await details.json()).items || []).map(item => [item.id, item.status?.embeddable]));
                const candidates = items.filter(item => item.id?.videoId && status.get(item.id.videoId) === true)
                    .map(item => ({ source: 'youtube', videoId: item.id.videoId, title: item.snippet?.title || '',
                        artist: item.snippet?.channelTitle || '', embeddable: true }));
                if (rankAudioCandidates(song, candidates).length) return candidates;
                break;
            } catch (error) {
                console.warn('[YT] quiz search failed:', error);
                if (++networkFailures >= 2) return [];
            }
            finally { clearTimeout(timeout); }
        }
        if (ytKeyExhausted.size >= YT_API_KEYS.length) break;
    }
    return [];
}

// =====================================================================
// Bilibili Search & Audio
// =====================================================================

function normalizeBiliText(value) {
    return String(value || '').normalize('NFKC').toLowerCase()
        .replace(/[\p{P}\p{S}\s]/gu, '');
}

function biliTitleMatches(videoTitle, aliases) {
    const normalizedVideo = normalizeBiliText(videoTitle);
    return aliases.some(alias => {
        const normalizedAlias = normalizeBiliText(alias);
        return normalizedAlias.length > 1 && normalizedVideo.includes(normalizedAlias);
    });
}

async function searchBilibili(anime, title, artist = '', type = '', aliases = {}) {
    // Cache key: anime + type are primary differentiators
    const animeAliases = [...new Set([anime, aliases.animeCN, aliases.animeNative].filter(Boolean))];
    const titleAliases = [...new Set([title, aliases.titleCN].filter(Boolean))];
    const cacheKey = `${animeAliases.join('/')}|${type}|${titleAliases.join('/')}`.toLowerCase().trim();
    const cached = bilibiliCache.get(cacheKey);
    if (cached) return cached;

    async function trySearch(query) {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), BILI_TIMEOUT);
        try {
            const resp = await fetch(
                `${window.BILI_WORKER_URL}/api/search?q=${encodeURIComponent(query)}`,
                { signal: controller.signal }
            );
            if (!resp.ok) throw new Error('HTTP ' + resp.status);
            const data = await resp.json();
            if (!data.results?.length) return [];
            const COLLECTION_KW = ['合集', '主题曲合集', '精选集', 'mix', 'medley', 'nonstop', '串烧', '联唱'];
            return data.results.filter(r => {
                if (r.duration > 600 || r.duration < 25) return false;
                const normalizedTitle = String(r.title || '').toLowerCase();
                return !COLLECTION_KW.some(keyword => normalizedTitle.includes(keyword));
            });
        } finally {
            clearTimeout(timeoutId);
        }
    }

    function scoreResult(r) {
        let s = 0;
        const videoTitle = r.title || '';
        const normalizedVideo = normalizeBiliText(videoTitle);
        const animeMatch = biliTitleMatches(videoTitle, animeAliases);
        const titleMatch = biliTitleMatches(videoTitle, titleAliases);
        const artistMatch = biliTitleMatches(videoTitle, [artist]);
        if (animeMatch) s += 55;
        if (titleMatch) s += 75;
        if (artistMatch) s += 20;
        // OP/ED keyword bonus (titles like "OP - xxx" or "ED「xxx」")
        const tp = (type || '').toUpperCase();
        if (tp && ['OP', 'ED'].includes(tp)) {
            if (normalizedVideo.includes(tp.toLowerCase())) s += 20;
            if (tp === 'OP' && /片头|主题歌|主題歌/.test(videoTitle)) s += 10;
            if (tp === 'ED' && /片尾|エンディング/.test(videoTitle)) s += 10;
        }
        // Play count bonus
        if (r.play > 100000) s += 15;
        else if (r.play > 10000) s += 8;
        // Duration: prefer 1-6 min
        if (r.duration >= 60 && r.duration <= 360) s += 10;

        return s;
    }

    try {
        const typeLabel = (type || '').toUpperCase();
        const queries = audioSearchQueries({ anime, animeCN: aliases.animeCN, animeNative: aliases.animeNative,
            title, titleCN: aliases.titleCN, artist, type });
        const candidates = [];
        const seen = new Set();
        let lastError = null;
        const searches = await Promise.allSettled(queries.bilibili.map(query => trySearch(query)));
        for (const search of searches) {
            if (search.status === 'rejected') { lastError = search.reason; continue; }
            for (const result of search.value) {
                if (!seen.has(result.bvid)) { candidates.push(result); seen.add(result.bvid); }
            }
        }
        if (!candidates.length) {
            if (lastError) throw lastError;
            return null;
        }

        const scored = candidates.map(r => ({
            ...r, _score: scoreResult(r)
        }));
        scored.sort((a, b) => b._score - a._score);
        const minScore = normalizeBiliText(anime).length <= 3 ? 75 : 70;
        const viable = scored.filter(candidate => {
            const hasTitle = biliTitleMatches(candidate.title, titleAliases);
            const hasContext = biliTitleMatches(candidate.title, animeAliases) ||
                biliTitleMatches(candidate.title, [artist]) ||
                (['OP', 'ED'].includes(typeLabel) && normalizeBiliText(candidate.title).includes(typeLabel.toLowerCase()));
            return hasTitle && hasContext && candidate._score >= minScore;
        });
        if (!viable.length) {
            console.log('[Bili] Rejected: no candidate passed title/context matching');
            return null;
        }

        const best = viable[0];
        best._alternates = viable.slice(1, 5).map(candidate => ({ ...candidate, _alternates: undefined }));
        bilibiliCache.set(cacheKey, best);
        return best;
    } catch (e) {
        console.error('[Bili] searchBilibili:', e);
        // 区分：代理不可达（网络/超时）vs 其他失败；不可达时记录状态供提示分级
        if (e.name === 'AbortError' || e.name === 'TypeError') {
            biliProxyState.down = true;
            biliProxyState.reason = 'proxy-down';
        } else {
            biliProxyState.reason = 'no-result';
        }
        return null;
    }
}

async function getBilibiliAudioUrl(bvid) {
    const cached = bilibiliAudioCache.get(bvid);
    if (cached) return cached;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), BILI_TIMEOUT);
    try {
        const resp = await fetch(
            `${window.BILI_WORKER_URL}/api/search?bvid=${encodeURIComponent(bvid)}`,
            { signal: controller.signal }
        );
        clearTimeout(timeoutId);
        if (!resp.ok) throw new Error('HTTP ' + resp.status);
        const data = await resp.json();
        // 代理可达但取流失败（如境外 Vercel 被 B站风控返回 no audio stream）→ 引导用户用本地代理
        if (data.error) {
            biliProxyState.down = true;
            biliProxyState.reason = 'no-stream';
            return null;
        }
        if (!data.url) return null;
        const result = { url: data.url, duration: data.duration, backupUrl: data.backupUrl || null };
        bilibiliAudioCache.set(bvid, result);
        return result;
    } catch (e) {
        clearTimeout(timeoutId);
        console.error('[Bili] getBilibiliAudioUrl:', e);
        if (e.name === 'AbortError' || e.name === 'TypeError') {
            biliProxyState.down = true;
            biliProxyState.reason = 'proxy-down';
        } else {
            biliProxyState.reason = 'no-result';
        }
        return null;
    }
}

// Mirror the detail modal's cover image onto the full-player icon (with SVG fallback)
function syncFpCover() {
    const fpCover = $('fpCover');
    const fpFallback = $('fpIconBox')?.querySelector('.fp-cover-fallback');
    const detailCoverSrc = $('detailCover')?.src;
    if (fpCover && detailCoverSrc) {
        fpCover.src = detailCoverSrc;
        fpCover.style.display = '';
        if (fpFallback) fpFallback.style.display = 'none';
    } else if (fpCover) {
        fpCover.style.display = 'none';
        if (fpFallback) fpFallback.style.display = '';
    }
}

async function searchAndLoadFullSong(song) {
    stopMusicPlayer();
    const playerEl = $('fullPlayer');
    if (!playerEl) return;
    playerEl.style.display = 'none';
    stopFpProgress();
    fpUseAudio = false;
    $('fpProgressFill').style.width = '0%';
    $('fpProgressDot').style.left = '0%';
    $('fpCurrent').textContent = '0:00';
    $('fpDuration').textContent = '0:00';
    const wave = $('fpWave');
    if (wave) wave.classList.remove('active');

    const lastAudio = gameState.lastAudioResult;

    // B站 source: play full song via <audio> (no YouTube embed)
    if (lastAudio && lastAudio.source === 'bilibili') {
        if (!$('animeDetailModal').classList.contains('show')) return;
        const biliUrl = lastAudio.url;
        playerEl.style.display = '';
        fpUseAudio = true;
        audio.src = biliUrl;
        $('fpTitle').textContent = `${song.titleCN || song.title} — ${song.artist}`;
        $('fpSource').textContent = '(B站源)';
        updateHeartUI();
        const yl = $('fpYtLink'); if (yl) yl.style.display = 'none';
        return;
    }

    let videoId = null;

    // Get a videoId regardless of ytReady — always search so we can at least show a YT link
    if (lastAudio && lastAudio.source === 'youtube' && lastAudio.ytVideoId) {
        videoId = lastAudio.ytVideoId;
    } else {
        let query;
        if (lastAudio && lastAudio.source === 'itunes' && lastAudio.itunesTrack) {
            query = `${lastAudio.itunesTrack} ${lastAudio.itunesArtist || ''} ${song.anime}`;
        } else {
            const romaji = $('detailRomaji')?.textContent || '';
            query = `${romaji || song.title} ${song.anime} ${song.type}`;
        }
        $('fpTitle').textContent = '正在搜索...';
        videoId = await searchYouTube(query);
    }

    if (videoId) {
        try { await ensureYouTubeAPI(); }
        catch (error) { console.warn('[YT] Full song player unavailable:', error); }
    }

    // YouTube found AND player is ready → play embedded (desktop)
    if (videoId && ytPlayer && ytReady) {
        if (!$('animeDetailModal').classList.contains('show')) return;
        playerEl.style.display = '';
        $('fpTitle').textContent = `${song.titleCN || song.title} — ${song.artist}`;
        $('fpSource').textContent = '';
        const yl = $('fpYtLink'); if (yl) { yl.href = `https://www.youtube.com/watch?v=${videoId}`; yl.style.display = 'none'; }
        updateHeartUI();
        syncFpCover();
        ytPlayer.cueVideoById(videoId);
        return;
    }

    // YouTube found but player not ready → fall back to iTunes + show YT link (mobile)
    // YouTube not found → fall back to iTunes only
    if (!$('animeDetailModal').classList.contains('show')) return;

    const ytLinkEl = $('fpYtLink');
    if (ytLinkEl && videoId) {
        ytLinkEl.href = `https://www.youtube.com/watch?v=${videoId}`;
        ytLinkEl.style.display = '';
    } else if (ytLinkEl) {
        ytLinkEl.style.display = 'none';
    }

    $('fpTitle').textContent = '正在搜索试听...';
    const audioResult = await fetchAudio(song.title, song.artist, song.anime);
    const previewUrl = audioResult?.url;
    if (!previewUrl || previewUrl.startsWith('yt:')) {
        if (!$('animeDetailModal').classList.contains('show')) return;
        $('fpTitle').textContent = '未找到可播放的歌曲';
        notify('未找到该歌曲的音频，请试试其他歌曲');
        return;
    }

    if (!$('animeDetailModal').classList.contains('show')) return;

    // iTunes preview available — use native audio
    playerEl.style.display = '';
    fpUseAudio = true;
    $('fpTitle').textContent = `${song.titleCN || song.title} — ${song.artist}`;
    $('fpSource').textContent = '(试听片段)';
    updateHeartUI();
    syncFpCover();
    audio.src = previewUrl;
    // Show duration once loaded
    const showDur = () => {
        if (audio.duration && isFinite(audio.duration)) {
            $('fpDuration').textContent = formatTime(audio.duration);
        } else {
            setTimeout(showDur, 200);
        }
    };
    showDur();
}

function toggleFullPlay() {
    // iTunes preview fallback mode
    if (fpUseAudio) {
        if (audio.paused || audio.ended) {
            // Stop YT but don't hide the player
            if (ytPlayer && ytPlayer.stopVideo) ytPlayer.stopVideo();
            stopFpProgress();
            audio.currentTime = 0;
            audio.play().catch(() => notify('喵呜~ 试听播放失败...'));
            $('fpPlayIcon').innerHTML = '<rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/>';
            $('fpWave')?.classList.add('active');
            startFpAudioProgress();
        } else {
            audio.pause();
            $('fpPlayIcon').innerHTML = '<path d="M8 5v14l11-7z"/>';
            $('fpWave')?.classList.remove('active');
            stopFpAudioProgress();
        }
        return;
    }

    // YouTube mode (default)
    if (!ytPlayer || !ytReady) { notify('播放器加载中，请稍后再试'); return; }
    const state = ytPlayer.getPlayerState();
    if (state === YT.PlayerState.PLAYING) {
        ytPlayer.pauseVideo();
    } else {
        audio.pause();
        gameState.isPlaying = false;
        $('visualizer').classList.add('hidden');
        $('playIcon').innerHTML = '<path d="M8 5v14l11-7z"/>';
        ytPlayer.playVideo();
    }
}

function stopFullPlayer() {
    if (fpUseAudio) {
        audio.pause();
        stopFpAudioProgress();
    }
    if (ytPlayer && ytPlayer.stopVideo) ytPlayer.stopVideo();
    stopFpProgress();
    fpUseAudio = false;
    const icon = $('fpPlayIcon');
    if (icon) icon.innerHTML = '<path d="M8 5v14l11-7z"/>';
    const wave = $('fpWave');
    if (wave) wave.classList.remove('active');
    const dot = $('fpProgressDot');
    if (dot) dot.style.left = '0%';
    const playerEl = $('fullPlayer');
    if (playerEl) playerEl.style.display = 'none';
}

// Progress bar click to seek
document.addEventListener('click', (e) => {
    const bar = e.target.closest('#fpProgress');
    if (!bar) return;
    const rect = bar.getBoundingClientRect();
    const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    if (fpUseAudio) {
        if (!audio.duration) return;
        audio.currentTime = pct * audio.duration;
        $('fpProgressFill').style.width = (pct * 100) + '%';
        $('fpProgressDot').style.left = (pct * 100) + '%';
    } else if (ytPlayer && ytPlayer.getDuration) {
        ytPlayer.seekTo(pct * ytPlayer.getDuration(), true);
        $('fpProgressFill').style.width = (pct * 100) + '%';
        $('fpProgressDot').style.left = (pct * 100) + '%';
    }
});

// =====================================================================
// Favorites System
// =====================================================================
const FAV_KEY = 'fav_songs_v1';

let _favoritesCache = null;

function getFavorites() {
    if (_favoritesCache) return _favoritesCache;
    try { _favoritesCache = JSON.parse(localStorage.getItem(FAV_KEY) || '[]'); }
    catch { _favoritesCache = []; }
    return _favoritesCache;
}

function saveFavorites(favs) {
    _favoritesCache = favs;
    localStorage.setItem(FAV_KEY, JSON.stringify(favs));
}

function isFavorite(title, anime) {
    return getFavorites().some(f => f.title === title && f.anime === anime);
}

function toggleFavorite() {
    const song = gameState.currentSong;
    if (!song) return;
    const favs = getFavorites();
    const idx = favs.findIndex(f => f.title === song.title && f.anime === song.anime);
    if (idx >= 0) {
        favs.splice(idx, 1);
        notify('已取消收藏');
    } else {
        const lastResult = gameState.lastAudioResult;
        const videoId = ytPlayer?.getVideoData?.()?.video_id || '';
        favs.push({
            title: song.title,
            titleCN: song.titleCN || song.title,
            anime: song.anime,
            animeCN: song.animeCN || '',
            artist: song.artist,
            type: song.type,
            videoId: videoId,
            coverImage: $('detailCover')?.src || '',
            source: lastResult?.source || 'youtube',
            bilibiliUrl: lastResult?.source === 'bilibili' ? (lastResult.url || '') : ''
        });
        notify('已收藏 ♡');
    }
    saveFavorites(favs);
    updateHeartUI();
    renderFavorites();
}

function updateHeartUI() {
    const song = gameState.currentSong;
    if (!song) return;
    const btn = $('fpHeartBtn');
    if (!btn) return;
    const fav = isFavorite(song.title, song.anime);
    btn.classList.toggle('favorited', fav);
    const icon = $('fpHeartIcon');
    if (icon) {
        icon.setAttribute('fill', fav ? 'currentColor' : 'none');
    }
}

function renderFavorites() {
    const favs = getFavorites();
    const section = $('favSection');
    const list = $('favList');
    const count = $('favCount');
    if (!section || !list) return;

    if (favs.length === 0) {
        section.style.display = 'none';
        return;
    }
    section.style.display = '';
    count.textContent = favs.length;

    const activeKey = playlist.currentIndex >= 0 && playlist.songs[playlist.currentIndex]
        ? playlist.songs[playlist.currentIndex].title + '|' + playlist.songs[playlist.currentIndex].anime
        : '';

    list.innerHTML = favs.map((f, i) => {
        const isActive = (f.title + '|' + f.anime) === activeKey;
        const fallbackSVG = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>';
        const safeCover = escapeHTML(f.coverImage || '');
        const iconHTML = f.coverImage
            ? `<img class="fav-item-cover" src="${safeCover}" alt="" loading="lazy" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'"><span style="display:none">${fallbackSVG}</span>`
            : fallbackSVG;
        const safeTitle = escapeHTML(f.titleCN || f.title);
        const safeAnime = escapeHTML(animeLabel(f));
        return `
        <div class="fav-item${isActive ? ' active' : ''}" data-action="playFavSong" data-value="${i}">
            <span class="fav-item-num">${i + 1}</span>
            <div class="fav-item-icon">${iconHTML}</div>
            <div class="fav-item-info">
                <div class="fav-item-title">${safeTitle}</div>
                <div class="fav-item-sub">${safeAnime}</div>
            </div>
            <div class="fav-item-actions">
                <button class="fav-item-btn remove-fav-btn" data-remove-fav="${i}" aria-label="取消收藏">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                </button>
            </div>
        </div>`;
    }).join('');
}

function playAllFavs() {
    const favs = getFavorites();
    if (favs.length === 0) return;
    playlist.songs = [...favs];
    playlist.mode = 'sequential';
    playlist.currentIndex = 0;
    playFavSongAtIndex(0);
}

function shufflePlayFavs() {
    const favs = getFavorites();
    if (favs.length === 0) return;
    playlist.songs = shuffle([...favs]);
    playlist.mode = 'shuffle';
    playlist.currentIndex = 0;
    playFavSongAtIndex(0);
}

function sequentialPlayFavs() {
    playAllFavs();
}

async function playFavSong(index) {
    const favs = getFavorites();
    if (index < 0 || index >= favs.length) return;
    playlist.songs = favs;
    playlist.mode = 'free';
    playlist.currentIndex = index;
    await playFavSongAtIndex(index);
}

async function playFavSongAtIndex(index) {
    console.log('[Music] playFavSongAtIndex called, index:', index);
    const song = playlist.songs[index];
    if (!song) { console.log('[Music] no song at index'); return; }
    console.log('[Music] song:', song.title, 'source:', song.source, 'videoId:', song.videoId, 'bilibiliUrl:', !!song.bilibiliUrl);
    playlist.currentIndex = index;
    gameState.currentSong = song;
    notify('加载中: ' + (song.titleCN || song.title));
    showMusicPlayer(song);
    try {

    let biliFallbackProxy = null;

    const playBilibili = (url) => {
        if (musicUseAudio) { audio.pause(); musicUseAudio = false; }
        if (ytPlayer && ytPlayer.stopVideo) ytPlayer.stopVideo();
        stopMusicProgress();
        musicUseAudio = true;
        audio.pause();
        audio.src = url;
        audio.load();
        $('musicModal')?.classList.add('show');
        const mp = $('musicPlayer');
        if (mp) mp.style.display = '';
        const ms = $('musicSource');
        if (ms) ms.textContent = '(B站源)';
        renderFavorites();
        audio.play().catch(e => {
            console.error('[Music] B站 play failed:', e);
            notify('呜喵~ B站音频播放失败了~');
        });
    };

    // B站 source — 每次播放都重新取流（B站 CDN URL 带签名会过期，缓存的 URL 可能失效）
    // 搜索结果有 24h 缓存、取流有 30min 缓存，实际不会每次都重新请求网络
    if (song.source === 'bilibili') {
        notify('B站搜索中...');
        const result = await fetchBilibiliAudio(
            song.title, song.artist, song.anime, song.type || '',
            `${song.title}|${song.anime}`
        );
        if (result) {
            song.source = 'bilibili';
            song.bilibiliUrl = result.url;
            const favs = getFavorites();
            const favIdx = favs.findIndex(f => f.title === song.title && f.anime === song.anime);
            if (favIdx >= 0) {
                favs[favIdx].source = 'bilibili';
                favs[favIdx].bilibiliUrl = result.url;
                saveFavorites(favs);
            }
            playBilibili(result.url);
            return;
        }
        notify('B站未找到该歌曲');
        return;
    }

    // Old/missing source — try B站 search
    if (!song.videoId || !song.source || song.source === 'bilibili') {
        notify('B站搜索中...');
        const result = await fetchBilibiliAudio(
            song.title, song.artist, song.anime, song.type || '',
            `${song.title}|${song.anime}`
        );
        if (result) {
            song.source = 'bilibili';
            song.bilibiliUrl = result.url;
            const favs = getFavorites();
            const favIdx = favs.findIndex(f => f.title === song.title && f.anime === song.anime);
            if (favIdx >= 0) {
                favs[favIdx].source = 'bilibili';
                favs[favIdx].bilibiliUrl = result.url;
                saveFavorites(favs);
            }
            playBilibili(result.url);
            return;
        }
        notify('B站未找到该歌曲');
    }

    musicUseAudio = false;

    if (!ytPlayer || !ytReady) {
        notify('YouTube播放器尚未就绪');
        return;
    }

    let videoId = song.videoId;
    if (!videoId) {
        notify('正在搜索歌曲...');
        const query = `${song.title} ${song.anime} ${song.type || ''}`;
        videoId = await searchYouTube(query);
        if (!videoId) {
            notify('未找到完整版歌曲，试试下一首吧');
            return;
        }
        song.videoId = videoId;
        const favs = getFavorites();
        const favIdx = favs.findIndex(f => f.title === song.title && f.anime === song.anime);
        if (favIdx >= 0) {
            favs[favIdx].videoId = videoId;
            saveFavorites(favs);
        }
    }

    audio.pause();
    gameState.isPlaying = false;
    $('visualizer')?.classList.add('hidden');
    $('playIcon').innerHTML = '<path d="M8 5v14l11-7z"/>';
    ytPlayer.loadVideoById(videoId);
    renderFavorites();
    } catch (e) {
        console.error('[Music] playFavSongAtIndex:', e);
        notify('播放失败: ' + (e.message || '未知错误'));
    }
}

function playPrevSong() {
    if (playlist.songs.length === 0) return;
    let idx = playlist.currentIndex - 1;
    if (idx < 0) idx = playlist.songs.length - 1;
    playFavSongAtIndex(idx);
}

function playNextSong() {
    if (playlist.songs.length === 0) return;
    let idx = playlist.currentIndex + 1;
    if (idx >= playlist.songs.length) idx = 0;
    playFavSongAtIndex(idx);
}

async function showMusicPlayer(song) {
    const modal = $('musicModal');
    if (!modal) return;
    // Stop detail modal player if open
    stopFullPlayer();
    $('musicTitle').textContent = `${song.titleCN || song.title} — ${song.artist}`;
    $('musicAnime').textContent = animeLabel(song);
    // Type badge
    const badge = $('musicTypeBadge');
    if (badge) {
        if (song.type) {
            badge.textContent = song.type;
            badge.style.display = '';
        } else {
            badge.style.display = 'none';
        }
    }
    // Cover image
    const cover = $('musicCover');
    const fallback = $('musicCoverFallback');
    if (cover) {
        if (song.coverImage) {
            cover.src = song.coverImage;
            cover.style.display = '';
            if (fallback) fallback.style.display = 'none';
        } else {
            cover.style.display = 'none';
            cover.src = '';
            if (fallback) fallback.style.display = '';
        }
    }
    // Bangumi link
    const bgmLink = $('musicBangumiLink');
    if (bgmLink) bgmLink.style.display = 'none';

    updateMusicHeartUI(song);
    modal.classList.add('show');

    // Fetch anime detail for cover image and bangumi link
    if (song.anime) {
        fetchAnimeDetail(song.anime).then(detail => {
            if (!detail) return;
            if (detail.image && cover) {
                cover.src = detail.image;
                cover.style.display = '';
                if (fallback) fallback.style.display = 'none';
                // Save cover back to song and favorites
                song.coverImage = detail.image;
                const favs = getFavorites();
                const fi = favs.findIndex(f => f.title === song.title && f.anime === song.anime);
                if (fi >= 0 && !favs[fi].coverImage) {
                    favs[fi].coverImage = detail.image;
                    saveFavorites(favs);
                    renderFavorites();
                }
            }
            if (detail.bangumiId && bgmLink) {
                bgmLink.href = `https://bgm.tv/subject/${detail.bangumiId}`;
                bgmLink.style.display = '';
            }
        });
    }
}

function hideMusicPlayer() {
    if (musicUseAudio) {
        audio.pause();
        musicUseAudio = false;
    }
    const modal = $('musicModal');
    if (modal) modal.classList.remove('show');
    if (ytPlayer && ytPlayer.stopVideo) ytPlayer.stopVideo();
    stopMusicProgress();
    playlist.playing = false;
    playlist.currentIndex = -1;
    const mIcon = $('musicPlayIcon');
    if (mIcon) mIcon.innerHTML = '<path d="M8 5v14l11-7z"/>';
    renderFavorites();
}

function stopMusicPlayer() {
    if (musicUseAudio) {
        audio.pause();
        musicUseAudio = false;
    }
    hideMusicPlayer();
}

function toggleMusicPlay() {
    // B站 audio mode
    if (musicUseAudio) {
        if (audio.paused || audio.ended) {
            audio.play();
        } else {
            audio.pause();
        }
        return;
    }
    if (!ytPlayer || !ytReady) { notify('播放器加载中，请稍后再试'); return; }
    const state = ytPlayer.getPlayerState();
    if (state === YT.PlayerState.PLAYING) {
        ytPlayer.pauseVideo();
    } else {
        audio.pause();
        gameState.isPlaying = false;
        $('visualizer')?.classList.add('hidden');
        $('playIcon').innerHTML = '<path d="M8 5v14l11-7z"/>';
        ytPlayer.playVideo();
    }
}

function toggleMusicFav() {
    const song = playlist.songs[playlist.currentIndex];
    if (!song) return;
    const favs = getFavorites();
    const idx = favs.findIndex(f => f.title === song.title && f.anime === song.anime);
    if (idx >= 0) {
        favs.splice(idx, 1);
        notify('已取消收藏');
    } else {
        favs.push({ ...song });
        notify('已收藏 ♡');
    }
    saveFavorites(favs);
    updateMusicHeartUI(song);
    renderFavorites();
}

function updateMusicHeartUI(song) {
    if (!song) return;
    const btn = $('musicHeartBtn');
    if (!btn) return;
    const fav = isFavorite(song.title, song.anime);
    btn.classList.toggle('favorited', fav);
    const icon = $('musicHeartIcon');
    if (icon) icon.setAttribute('fill', fav ? 'currentColor' : 'none');
}

// Music modal progress tracking
function startMusicProgress() {
    stopMusicProgress();
    musicProgressInterval = setInterval(() => {
        if (!ytPlayer || !ytPlayer.getCurrentTime) return;
        const cur = ytPlayer.getCurrentTime();
        const dur = ytPlayer.getDuration();
        if (dur > 0) {
            const pct = (cur / dur * 100) + '%';
            $('musicProgressFill').style.width = pct;
            $('musicProgressDot').style.left = pct;
            $('musicCurrent').textContent = formatTime(cur);
            $('musicDuration').textContent = formatTime(dur);
        }
    }, 500);
}

function stopMusicProgress() {
    if (musicProgressInterval) { clearInterval(musicProgressInterval); musicProgressInterval = null; }
}

function removeFavorite(index) {
    const favs = getFavorites();
    favs.splice(index, 1);
    saveFavorites(favs);
    renderFavorites();
    updateHeartUI();
}

function clearFavorites() {
    if (!confirm('确定清空所有收藏吗？')) return;
    stopMusicPlayer();
    saveFavorites([]);
    renderFavorites();
    updateHeartUI();
    notify('收藏已清空');
}

// Shared volume control for native audio and YouTube
const PLAYER_VOLUME_KEY = 'player_volume_v1';
let playerVolume = (() => {
    try {
        const raw = localStorage.getItem(PLAYER_VOLUME_KEY);
        if (raw === null || raw === '') return 50;
        const saved = Number(raw);
        return Number.isFinite(saved) && saved >= 0 && saved <= 100 ? saved : 50;
    } catch { return 50; }
})();
let volumeMuted = false;

function toggleVolumeSlider() {
    const slider = $('fpVolSlider');
    if (slider) slider.classList.toggle('open');
}

function toggleMute() {
    volumeMuted = !volumeMuted;
    applyPlayerVolume();
}

function applyPlayerVolume() {
    const effectiveVolume = volumeMuted ? 0 : playerVolume;
    audio.volume = effectiveVolume / 100;
    $('libraryPreviewAudio').volume = effectiveVolume / 100;
    if (ytPlayer && ytPlayer.setVolume) ytPlayer.setVolume(effectiveVolume);
    for (const id of ['volSlider', 'fpVolRange', 'musicVolRange', 'libraryVolRange']) {
        const slider = $(id);
        if (slider) slider.value = String(playerVolume);
    }
    const value = $('volValue');
    if (value) value.textContent = `${playerVolume}%`;
    updateVolIcon();
}

function setPlayerVolume(value) {
    const numeric = Number(value);
    playerVolume = Math.max(0, Math.min(100, Number.isFinite(numeric) ? Math.round(numeric) : 50));
    volumeMuted = false;
    try { localStorage.setItem(PLAYER_VOLUME_KEY, String(playerVolume)); } catch {}
    applyPlayerVolume();
}

function updateVolIcon() {
    const muted = volumeMuted || playerVolume === 0;
    const low = playerVolume < 50;
    const svgMuted = '<polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/>';
    const svgLow = '<polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/>';
    const svgHigh = '<polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"/>';
    const svg = muted ? svgMuted : (low ? svgLow : svgHigh);
    const icon = $('fpVolIcon');
    if (icon) icon.innerHTML = svg;
    const mIcon = $('musicVolIcon');
    if (mIcon) mIcon.innerHTML = svg;
}

applyPlayerVolume();

// =====================================================================
// Custom Song Library (Bangumi Import)
// =====================================================================
const CUSTOM_SONGS_KEY = 'custom_songs_v1';

let _customSongsCache = null;

function getCustomSongs() {
    if (_customSongsCache) return _customSongsCache;
    try { _customSongsCache = JSON.parse(localStorage.getItem(CUSTOM_SONGS_KEY) || '[]'); }
    catch (e) { console.error('[CustomSongs] getCustomSongs:', e); _customSongsCache = []; }
    return _customSongsCache;
}

function setCustomSongs(songs) {
    _customSongsCache = songs;
    localStorage.setItem(CUSTOM_SONGS_KEY, JSON.stringify(songs));
    updateFilterCount();
    updateCustomSongsUI();
    if (!$('v-library').classList.contains('hidden')) renderLibrary();
}

function addCustomSong(song) {
    const songs = getCustomSongs();
    // Prevent exact duplicates
    if (songs.some(s => s.title === song.title && s.anime === song.anime)) return false;
    songs.push(song);
    setCustomSongs(songs);
    return true;
}

function removeCustomSong(index) {
    const songs = getCustomSongs();
    songs.splice(index, 1);
    setCustomSongs(songs);
}

function getAllSongs() {
    return [...SONGS, ...Object.values(SEASONAL_POOLS).flat(), ...getCustomSongs()];
}

function getFilteredSongs() {
    const customSongs = getCustomSongs();
    if (filterState.source === 'mix') {
        const mixed = selectMixedSongs({ legacy: SONGS, seasons: SEASONAL_POOLS, imported: customSongs,
            watchedKeys: getWatchedAnimeKeys(), animeKey, trackKey, selectedKeys: selectedSongKeys, mix: filterState.mix });
        return filterWatchedSongs(mixed.filter(song => !filterState.types.size || filterState.types.has(song.type)),
            getWatchedAnimeKeys(), filterState.watchedOnly);
    }
    const builtinCount = SONGS.length + Object.values(SEASONAL_POOLS).reduce((n, songs) => n + songs.length, 0);
    const all = [...SONGS, ...Object.values(SEASONAL_POOLS).flat(), ...customSongs];
    const filtered = all.filter((s, index) => {
        if (filterState.types.size > 0 && !filterState.types.has(s.type)) return false;
        const custom = index >= builtinCount;
        if (filterState.source === 'builtin' && custom) return false;
        if (filterState.source === 'custom' && !custom) return false;
        if (filterState.source === 'legacy' && !SONGS.includes(s)) return false;
        if (filterState.source?.startsWith('season:') &&
            (custom || s.season !== filterState.source.slice(7))) return false;
        return true;
    });
    return filterWatchedSongs(filtered, getWatchedAnimeKeys(), filterState.watchedOnly);
}

// Anti-repeat question selection: remembers recently played songs across games.
// Sliding window over the pool — every song is picked once per cycle before any
// song can repeat, so repeated games cover the whole library instead of the
// same few songs (birthday-paradox repeats from independent random draws).
const PLAYED_HISTORY_KEY = 'played_history_v1';

function loadPlayedHistory() {
    try {
        const v = JSON.parse(localStorage.getItem(PLAYED_HISTORY_KEY));
        return Array.isArray(v) ? v : [];
    } catch { return []; }
}

function savePlayedHistory(list) {
    try { localStorage.setItem(PLAYED_HISTORY_KEY, JSON.stringify(list)); } catch {}
}

function buildPlaylist(pool, n) {
    const songKey = s => s.title + '|' + s.anime;
    pool = uniqueChallengePool(pool);
    n = Math.min(n, pool.length);
    const played = loadPlayedHistory();
    const playedSet = new Set(played);
    const fresh = pool.filter(s => !playedSet.has(songKey(s)));
    let picks;
    if (fresh.length >= n) {
        picks = shuffle(fresh).slice(0, n);
    } else {
        picks = shuffle(fresh);
        const order = new Map(played.map((k, i) => [k, i]));
        picks.push(...pool
            .filter(s => playedSet.has(songKey(s)))
            .sort((a, b) => order.get(songKey(a)) - order.get(songKey(b)))
            .slice(0, n - picks.length));
    }
    // Keep played history consistent with the current pool — O(n + m) via Set
    // (was O(n·m): pool.some() inside filter rescanned the pool per key)
    const poolKeys = new Set(pool.map(songKey));
    const next = played.filter(k => poolKeys.has(k));
    next.push(...picks.map(songKey));
    const cap = Math.max(0, pool.length - n);
    savePlayedHistory(cap > 0 ? next.slice(-cap) : []);
    return picks;
}

// Fetch Bangumi index via CORS proxy
const CORS_PROXY = 'https://cors-anywhere.fly.dev/';
async function fetchIndexViaProxy(indexId, allSubjects) {
    let offset = 0;
    while (true) {
        const apiUrl = `https://api.bgm.tv/v0/indices/${indexId}/subjects?limit=100&offset=${offset}`;
        const controller = new AbortController();
        const tid = setTimeout(() => controller.abort(), BANGUMI_PAGE_TIMEOUT);
        try {
            const res = await fetch(CORS_PROXY + apiUrl, { signal: controller.signal });
            clearTimeout(tid);
            if (!res.ok) return false;
            const data = await res.json();
            const batch = data.data || [];
            allSubjects.push(...batch);
            if (batch.length < 100) break;
            offset += 100;
        } catch (e) { clearTimeout(tid); console.error('[Bangumi] fetchSubjects:', e); return false; }
    }
    return true;
}

// Fallback: parse Bangumi index HTML page via proxy
async function fetchIndexViaHtml(indexId, allSubjects) {
    const pageUrl = `https://bgm.tv/index/${indexId}`;
    const controller = new AbortController();
    const tid = setTimeout(() => controller.abort(), BANGUMI_PAGE_TIMEOUT);
    try {
        const res = await fetch(CORS_PROXY + pageUrl, { signal: controller.signal });
        clearTimeout(tid);
        if (!res.ok) return;
        const html = await res.text();
        const regex = /id="item_(\d+)"[^]*?<a href="\/subject\/\d+" class="l">([^<]+)<\/a>/gs;
        let match;
        while ((match = regex.exec(html)) !== null) {
            const id = parseInt(match[1]);
            const name = match[2].trim();
            const typeMatch = html.substring(match.index, match.index + 600).match(/subject_type_(\d+)/);
            const type = typeMatch ? parseInt(typeMatch[1]) : 0;
            allSubjects.push({ id, name, name_cn: '', type });
        }
    } catch (e) { clearTimeout(tid); console.error('[Bangumi] parseSubjectResponse:', e); }
}

// Import anime from Bangumi index and search for songs
async function importFromBangumi(indexId) {
    const statusEl = $('importStatus');
    const progressEl = $('importProgress');
    const progressWrapper = $('importProgressWrapper');
    if (statusEl) statusEl.textContent = '获取目录中...';
    if (progressEl) progressEl.style.width = '0%';
    if (progressWrapper) progressWrapper.style.display = 'block';

    // Step 1: Try local JSON file first (no CORS issues)
    let allSubjects = [];
    try {
        const localRes = await fetch(`index_${indexId}.json`);
        if (localRes.ok) {
            const localData = await localRes.json();
            allSubjects = (localData.items || []).map(x => ({ ...x, type: 2 }));
        }
    } catch (e) { console.error('[Bangumi] loadLocal:', e); }

    // Step 2: If no local file, try CORS proxy
    if (allSubjects.length === 0) {
        const apiOk = await fetchIndexViaProxy(indexId, allSubjects);
        if (!apiOk) {
            await fetchIndexViaHtml(indexId, allSubjects);
        }
    }
    if (allSubjects.length === 0) { notify('呜喵~ 目录获取失败了...请检查目录号或联系开发者添加喵'); return; }

    // Filter to anime only (type=2)
    const animeList = allSubjects.filter(s => s.type === 2);
    if (animeList.length === 0) { notify('喵呜~ 这个目录里没有动画呢...'); return; }

    if (statusEl) statusEl.textContent = `找到 ${animeList.length} 部动画，搜索歌曲中...`;

    // Step 2: For each anime, search for songs via AniList + iTunes
    let addedCount = 0;
    const lowConfSongs = [];

    for (let i = 0; i < animeList.length; i++) {
        const anime = animeList[i];
        const animeName = anime.name_cn || anime.name;
        if (progressEl) progressEl.style.width = ((i + 1) / animeList.length * 100) + '%';
        if (statusEl) statusEl.textContent = `[${i + 1}/${animeList.length}] ${animeName}`;

        // A Bangumi collection can intentionally include anime already in the official pools.
        // addCustomSong handles exact repeats within the imported pool.

        // Get romaji title from AniList for better iTunes search
        let searchTitle = anime.name; // Japanese name

        try {
            const aq = `query($s:String){Media(search:$s,type:ANIME){title{romaji native}}}`;
            // Timeout required — a hung AniList request used to stall the whole import loop
            const actl = new AbortController();
            const atid = setTimeout(() => actl.abort(), ANILIST_TIMEOUT);
            const ares = await fetch('https://graphql.anilist.co', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ query: aq, variables: { s: animeName } }),
                signal: actl.signal
            });
            clearTimeout(atid);
            const adata = await ares.json();
            if (adata.data?.Media?.title?.romaji) {
                searchTitle = adata.data.Media.title.romaji;
            }
        } catch (e) { console.error('[Bangumi] AniList search:', e); }

        // Search iTunes for songs — pass Japanese name for album matching
        const songs = await searchItunesForAnime(searchTitle, animeName, anime.name);
        for (const song of songs) {
            if (addCustomSong({ ...song, origin: 'bangumi', bangumiIndexId: indexId })) {
                addedCount++;
                if (song._importScore && song._importScore < 80) {
                    lowConfSongs.push(song);
                }
            }
        }

        // Small delay to avoid rate limiting
        await new Promise(r => setTimeout(r, 300));
    }

    if (lowConfSongs.length > 0) {
        await new Promise(r => setTimeout(r, 500));
        if (statusEl) statusEl.textContent = `导入完成！新增 ${addedCount} 首歌曲。${lowConfSongs.length} 首匹配度较低的歌曲已自动添加，导入的歌曲可能与番剧匹配度较低，请自己查看修改喵~`;
    }
    if (progressEl) progressEl.style.width = '100%';
    if (progressWrapper) setTimeout(() => { progressWrapper.style.display = 'none'; }, 2000);
    notify(`导入成功啦喵！新增了 ${addedCount} 首歌曲呢~`);
}

// Search iTunes for anime OP/ED songs — with scoring to ensure anime relevance
async function searchItunesForAnime(romajiTitle, animeName, jpName) {
    const results = [];
    const seen = new Set();

    function scoreImportResult(r) {
        const c = (r.collectionName || '').toLowerCase();
        const a = (r.artistName || '').toLowerCase();
        const t = (r.trackName || '').toLowerCase();

        let score = 0;

        // Album/collection contains Japanese anime name (key fix — matches iTunes JP metadata)
        const jpn = (jpName || animeName).toLowerCase();
        if (jpn && c.includes(jpn)) score += 50;
        // Also check Chinese name as fallback
        const cn = animeName.toLowerCase();
        if (cn !== jpn && cn && c.includes(cn)) score += 50;
        // Romaji title in collection
        const rt = romajiTitle.toLowerCase();
        if (rt && c.includes(rt)) score += 30;

        // Track name looks like a real song
        if (t.length >= 3 && !/^[a-z0-9_\-\.]+$/.test(t)) score += 10;

        // Known anime music artists
        const knownAnimeArtists = ['lisa', 'aimer', 'yoasobi', 'eve', 'yorushika', 'ヨルシカ',
            'kenshi yonezu', '米津玄師', 'official髭男dism', 'king gnu', 'yama', 'milet',
            'reona', '藍井エイル', 'eir aoi', 't.m.revolution', 'flow', 'granrodeo',
            'spyair', 'burnout syndromes', 'kana-boon', 'myth & roid', 'sawanohiroyuki',
            '澤野弘之', '梶浦由記', 'fictionjunction', 'supercell', 'claris', "l'arc~en~ciel",
            'nana mizuki', '水樹奈々', 'maaya sakamoto', '坂本真綾', 'minori chihara', '茅原実里'];
        for (const known of knownAnimeArtists) {
            if (a.includes(known) || known.includes(a)) { score += 20; break; }
        }

        return score;
    }

    function crossValidateAnime(r, animeName, jpName) {
        const t = (r.trackName || '').toLowerCase();
        const c = (r.collectionName || '').toLowerCase();
        const targets = [
            (animeName || '').toLowerCase(),
            (jpName || '').toLowerCase()
        ].filter(Boolean);
        for (const target of targets) {
            if (t.includes(target) || c.includes(target)) return true;
            // Also check 3-char substrings for partial name matching (e.g. "咒術" from "咒術廻戦")
            for (let i = 0; i < target.length - 2; i++) {
                const sub = target.substring(i, i + 3);
                if (t.includes(sub) || c.includes(sub)) return true;
            }
        }
        return false;
    }

    // Search with Japanese name (best results on iTunes JP) + romaji as fallback
    const searchTerms = jpName ? [jpName, `${romajiTitle} anime`, romajiTitle] : [`${romajiTitle} anime`, romajiTitle];
    for (const term of searchTerms) {
        const controller = new AbortController();
        const tid = setTimeout(() => controller.abort(), ITUNES_TIMEOUT);
        try {
            const res = await fetch(
                `https://itunes.apple.com/search?term=${encodeURIComponent(term)}&media=music&entity=song&limit=10&country=JP`,
                { signal: controller.signal }
            );
            clearTimeout(tid);
            const data = await res.json();
            const scored = [];
            for (const r of (data.results || [])) {
                const title = r.trackName;
                if (!title || seen.has(title)) continue;
                const s = scoreImportResult(r);
                if (s >= 50 && crossValidateAnime(r, animeName, jpName)) scored.push({ r, score: s });
            }
            scored.sort((a, b) => b.score - a.score);
            for (const { r, score } of scored) {
                const title = r.trackName;
                if (seen.has(title)) continue;
                seen.add(title);
                results.push({
                    title: title,
                    titleCN: title,
                    anime: animeName,
                    artist: r.artistName || 'Unknown',
                    type: guessSongType(title, r),
                    _importScore: score,
                });
            }
            if (results.length >= 5) break;
        } catch (e) { clearTimeout(tid); console.error('[iTunes] searchItunesForAnime:', e); }
    }
    return results.slice(0, 5);
}

// Guess if a song is OP/ED/IN based on its title and iTunes metadata
function guessSongType(title, r) {
    const t = (title || '').toLowerCase();
    // Explicit OP/ED in title
    if (/\bop\b|opening|op\.|\bop\d/i.test(t)) return 'OP';
    if (/\bed\b|ending|ed\.|\bed\d/i.test(t)) return 'ED';
    // Check collection name for OP/ED hints
    const c = ((r?.collectionName) || '').toLowerCase();
    if (/opening|op\.|-op\b/i.test(c)) return 'OP';
    if (/ending|ed\.|-ed\b/i.test(c)) return 'ED';
    return 'OP'; // Default
}

// Export custom songs as JSON file
function exportCustomSongs() {
    const songs = getCustomSongs();
    if (songs.length === 0) { notify('喵~ 还没有自定义歌曲可以导出哦'); return; }
    const blob = new Blob([JSON.stringify(songs, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `anime-quiz-songs-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    notify('已导出自定义曲库啦喵~');
}

// Import custom songs from JSON file
function importCustomSongsFile(file) {
    const reader = new FileReader();
    reader.onload = () => {
        try {
            const songs = JSON.parse(reader.result);
            if (!Array.isArray(songs)) { notify('呜喵~ 文件格式不对呢...'); return; }
            const existing = getCustomSongs();
            const existingKeys = new Set(existing.map(s => s.title + '|' + s.anime));
            let added = 0;
            for (const s of songs) {
                if (!s.title || !s.anime) continue;
                const key = s.title + '|' + s.anime;
                if (existingKeys.has(key)) continue;
                existing.push({
                    title: s.title,
                    titleCN: s.titleCN || s.title,
                    anime: s.anime,
                    artist: s.artist || 'Unknown',
                    type: s.type || 'OP',
                });
                existingKeys.add(key);
                added++;
            }
            setCustomSongs(existing);
            notify(`导入成功喵！新增了 ${added} 首歌曲~`);
        } catch (e) { console.error('[Import] importCustomSongsFile:', e); notify('呜喵~ 文件解析失败了...'); }
    };
    reader.readAsText(file);
}

// Update custom songs list in settings UI
function updateCustomSongsUI() {
    const list = $('customSongsList');
    if (!list) return;
    const songs = getCustomSongs();
    if (songs.length === 0) {
        list.innerHTML = '<div class="bangumi-empty">喵~ 还没有自定义歌曲呢</div>';
        return;
    }
    list.innerHTML = '<div class="bangumi-song-count">共 ' + songs.length + ' 首</div>' + songs.map((s, i) => `
        <div class="bangumi-song-row">
            <div class="bangumi-song-info">
                <div class="bangumi-song-title">${escapeHTML(s.titleCN || s.title)}</div>
                <div class="bangumi-song-anime">${escapeHTML(s.anime)}</div>
            </div>
            <button class="bangumi-song-remove" type="button" data-del-custom="${i}" aria-label="移除 ${escapeHTML(s.titleCN || s.title)}">✕</button>
        </div>
    `).join('');
}

// Best-match logic for Bangumi search results
function pickBestBGMResult(list, animeName) {
    if (!list || list.length === 0) return null;
    // Filter to anime only (type=2)
    const animeOnly = list.filter(x => x.type === 2);
    const pool = animeOnly.length > 0 ? animeOnly : list;

    // Helper: is this a main series entry (not a sequel/special/movie)?
    const SEASON_RE = /第.季|第.期|S\d|Season|剧场版|Movie|OVA|OAD|总集篇|特别篇|Mother|Final|前篇|后篇|先行/;
    const isMainSeries = x => !SEASON_RE.test(x.name_cn || '') && !SEASON_RE.test(x.name || '');

    // Helper: check name fields (both cn and jp)
    const nameCn = x => x.name_cn || '';
    const nameJp = x => x.name || '';

    // 1. Exact match (Chinese or Japanese)
    let best = pool.find(x => nameCn(x) === animeName || nameJp(x) === animeName);
    if (best) return best;

    // 2. Contains match in either name field, prefer main series
    const contains = pool
        .filter(x => nameCn(x).includes(animeName) || nameJp(x).includes(animeName) ||
                     animeName.includes(nameCn(x)) || animeName.includes(nameJp(x)))
        .sort((a, b) => {
            const aMain = isMainSeries(a) ? 0 : 1;
            const bMain = isMainSeries(b) ? 0 : 1;
            if (aMain !== bMain) return aMain - bMain;
            // Prefer shorter name (closer match)
            return (nameCn(a) || nameJp(a)).length - (nameCn(b) || nameJp(b)).length;
        });
    if (contains.length > 0) return contains[0];

    // 3. Fallback to first result
    return pool[0];
}

// Search Bangumi for anime
async function searchBangumi(keyword) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), BANGUMI_TIMEOUT);
    try {
        const res = await fetch(`https://api.bgm.tv/search/subject/${encodeURIComponent(keyword)}?limit=10&type=2`, {
            headers: { 'User-Agent': 'AnimeQuiz/1.0' },
            signal: controller.signal
        });
        clearTimeout(timeoutId);
        const data = await res.json();
        return data.list || [];
    } catch (e) { clearTimeout(timeoutId); console.error('[Bangumi] searchBangumiTV:', e); return []; }
}

// Search AniList for anime
async function searchAniList(animeName) {
    const query = `query ($search: String) {
        Media(search: $search, type: ANIME) {
            title { romaji }
            coverImage { large }
            id
        }
    }`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), ANILIST_TIMEOUT);
    try {
        const res = await fetch('https://graphql.anilist.co', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ query, variables: { search: animeName } }),
            signal: controller.signal
        });
        clearTimeout(timeoutId);
        const data = await res.json();
        return data.data?.Media || null;
    } catch (e) { clearTimeout(timeoutId); console.error('[AniList] searchAniList:', e); return null; }
}

// Known alternative names for Bangumi search (animeName → better search term)
const ANIME_ALT_NAMES = {
    '推しの子': '我推的孩子',
    'EVA': '新世纪福音战士',
    'Angel Beats!': 'Angel Beats',
    'Fate/Zero': 'Fate Zero',
    'Fate/stay night': 'Fate stay night',
    'LoveLive!': 'Love Live School idol',
    'LoveLive! Sunshine!!': 'ラブライブ Sunshine',
    'Free!': 'Free 男子游泳部',
    '绊のAllelle': '绊のアリル',
};

// Check if a Bangumi result is a good match for the anime name
function isGoodMatch(result, animeName) {
    if (!result) return false;
    const cn = result.name_cn || '';
    const jp = result.name || '';
    // Exact match
    if (cn === animeName || jp === animeName) return true;
    // Starts with (prefix match)
    if (cn.startsWith(animeName) || jp.startsWith(animeName)) return true;
    // The result name is contained in the search term
    if (animeName.includes(cn) || animeName.includes(jp)) return true;
    // The search term is a significant part of the result (not just 3 chars in a long name)
    if (cn.includes(animeName) && animeName.length >= cn.length * 0.4) return true;
    if (jp.includes(animeName) && animeName.length >= jp.length * 0.4) return true;
    return false;
}

// Is this a high-confidence match?
function isHighConfidenceMatch(result, animeName) {
    if (!result) return false;
    const cn = result.name_cn || '';
    const jp = result.name || '';
    // Exact match
    if (cn === animeName || jp === animeName) return true;
    // Result name starts with search AND search is at least 60% of result name length
    if (cn.startsWith(animeName) && animeName.length >= cn.length * 0.6) return true;
    if (jp.startsWith(animeName) && animeName.length >= jp.length * 0.6) return true;
    // Search starts with result name (e.g. "有时俄语会遮不住" for result "不时轻声地...")
    if (animeName.startsWith(cn) && cn.length >= 2) return true;
    if (animeName.startsWith(jp) && jp.length >= 2) return true;
    return false;
}

// Fetch anime detail: image + bangumi ID, guaranteed useful result
async function fetchAnimeDetail(animeName) {
    const cached = animeDetailCache.get(animeName);
    if (cached) return cached;

    let result = { image: '', bangumiId: null, titleRomaji: '' };
    let bgmFallback = null; // low-confidence Bangumi result as last resort

    // Step 1: Try Bangumi with Chinese name
    const bgmList = await searchBangumi(animeName);
    const bgmBest = pickBestBGMResult(bgmList, animeName);
    if (bgmBest) {
        if (isHighConfidenceMatch(bgmBest, animeName)) {
            // High confidence match
            result.bangumiId = bgmBest.id;
            if (bgmBest.images?.large) result.image = bgmBest.images.large;
        } else {
            // Low confidence - save as fallback
            bgmFallback = bgmBest;
        }
    }

    // Step 2: Try AniList (provides cover images + romaji title)
    const anilistMedia = await searchAniList(animeName);
    if (anilistMedia) {
        if (anilistMedia.coverImage?.large) result.image = anilistMedia.coverImage.large;
        if (anilistMedia.title?.romaji) result.titleRomaji = anilistMedia.title.romaji;
    }

    // Step 3: If no high-confidence Bangumi match, try romaji name from AniList
    if (!result.bangumiId && result.titleRomaji) {
        const bgmList2 = await searchBangumi(result.titleRomaji);
        const bgmBest2 = pickBestBGMResult(bgmList2, animeName);
        if (bgmBest2) {
            result.bangumiId = bgmBest2.id;
            if (!result.image && bgmBest2.images?.large) result.image = bgmBest2.images.large;
        }
    }

    // Step 4: If still no Bangumi ID, try known alternative names
    if (!result.bangumiId && ANIME_ALT_NAMES[animeName]) {
        const altName = ANIME_ALT_NAMES[animeName];
        const bgmList3 = await searchBangumi(altName);
        const bgmBest3 = pickBestBGMResult(bgmList3, altName);
        if (bgmBest3) {
            result.bangumiId = bgmBest3.id;
            if (!result.image && bgmBest3.images?.large) result.image = bgmBest3.images.large;
        }
    }

    // Step 5: Last resort - use the low-confidence Bangumi result
    if (!result.bangumiId && bgmFallback) {
        result.bangumiId = bgmFallback.id;
        if (!result.image && bgmFallback.images?.large) result.image = bgmFallback.images.large;
    }

    animeDetailCache.set(animeName, result);
    return result;
}

let detailReturnFocus = null;
let detailRequestId = 0;
function showAnimeDetail(song, { auto = false } = {}) {
    const requestId = ++detailRequestId;
    const modal = $('animeDetailModal');
    const coverWrap = document.querySelector('.detail-cover-wrap');
    const cover = $('detailCover');
    const title = $('detailTitle');
    const romaji = $('detailRomaji');
    const meta = $('detailMeta');
    const songInfo = $('detailSongInfo');
    const bangumiLink = $('bangumiLink');

    const songName = song.titleCN || song.title;

    title.textContent = animeLabel(song);
    romaji.textContent = '';
    meta.innerHTML = `<span><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-2px;margin-right:2px;"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>${escapeHTML(String(song.type || ''))}</span>`;
    songInfo.innerHTML = `
        <div class="detail-song-icon"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg></div>
        <div class="detail-song-text">
            <div class="detail-song-name">${escapeHTML(songName)}</div>
            <div class="detail-song-artist">${escapeHTML(song.artist)}</div>
        </div>
    `;

    // Reset cover state - show placeholder
    const localCover = song.anilistId ? SEASONAL_COVERS[song.anilistId] : '';
    cover.src = localCover || '';
    cover.style.display = localCover ? 'block' : 'none';
    let placeholder = coverWrap.querySelector('.detail-cover-placeholder');
    if (!placeholder) {
        placeholder = document.createElement('div');
        placeholder.className = 'detail-cover-placeholder';
        placeholder.innerHTML = '<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="2" width="20" height="20" rx="2.18" ry="2.18"/><line x1="7" y1="2" x2="7" y2="22"/><line x1="17" y1="2" x2="17" y2="22"/><line x1="2" y1="12" x2="22" y2="12"/><line x1="2" y1="7" x2="7" y2="7"/><line x1="2" y1="17" x2="7" y2="17"/><line x1="17" y1="7" x2="22" y2="7"/><line x1="17" y1="17" x2="22" y2="17"/></svg>';
        coverWrap.appendChild(placeholder);
    }
    placeholder.style.display = localCover ? 'none' : 'flex';

    // Safe fallback: Bangumi search URL (always works)
    bangumiLink.href = `https://bgm.tv/search/subject/${encodeURIComponent(song.anime)}`;

    if (!modal.classList.contains('show')) detailReturnFocus = auto ? null : document.activeElement;
    modal.classList.add('show');
    if (!auto) modal.querySelector('.detail-close')?.focus();

    if (!auto || !localCover) fetchAnimeDetail(song.anime).then(detail => {
        if (!detail || requestId !== detailRequestId || !modal.classList.contains('show')) return;
        if (detail.image) {
            cover.src = detail.image;
            cover.style.display = 'block';
            cover.onerror = () => {
                cover.style.display = 'none';
                placeholder.style.display = 'flex';
            };
            placeholder.style.display = 'none';
            // Also update the full player cover
            const fpCover = $('fpCover');
            const fpFallback = $('fpIconBox')?.querySelector('.fp-cover-fallback');
            if (fpCover && $('fullPlayer')?.style.display !== 'none') {
                fpCover.src = detail.image;
                fpCover.style.display = '';
                if (fpFallback) fpFallback.style.display = 'none';
            }
        }
        if (detail.titleRomaji) romaji.textContent = detail.titleRomaji;
        if (detail.bangumiId) {
            bangumiLink.href = `https://bgm.tv/subject/${detail.bangumiId}`;
        }
    });

    if (!auto) searchAndLoadFullSong(song);
}

// =====================================================================
// Sakura Particle System
// =====================================================================
function initSakura() {
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    const canvas = document.getElementById('sakuraCanvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    let petals = [];
    let stars = [];
    const PETAL_COUNT = 15;
    const STAR_COUNT = 8;

    let resizeTimer = 0;
    function resize() {
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
    }
    resize();
    window.addEventListener('resize', () => {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(resize, 200);
    });

    class Petal {
        constructor() { this.reset(true); }
        reset(init) {
            this.x = Math.random() * canvas.width;
            this.y = init ? Math.random() * canvas.height : -20;
            this.size = 8 + Math.random() * 12;
            this.speedY = 0.5 + Math.random() * 0.8;
            this.speedX = -0.3 + Math.random() * 0.6;
            this.rotation = Math.random() * Math.PI * 2;
            this.rotSpeed = (Math.random() - 0.5) * 0.03;
            this.opacity = 0.5 + Math.random() * 0.4;
            this.wobble = Math.random() * Math.PI * 2;
            this.wobbleSpeed = 0.02 + Math.random() * 0.03;
            if (Math.random() < 0.3) {
                const v = 240 + Math.floor(Math.random() * 15);
                this.color = `rgba(${v},${v-10},${v},${this.opacity})`;
            } else {
                const r = 236 + Math.floor(Math.random() * 20);
                const g = 180 + Math.floor(Math.random() * 60);
                const b = 200 + Math.floor(Math.random() * 40);
                this.color = `rgba(${r},${g},${b},${this.opacity})`;
            }
        }
        update() {
            this.y += this.speedY;
            this.wobble += this.wobbleSpeed;
            this.x += this.speedX + Math.sin(this.wobble) * 0.3;
            this.rotation += this.rotSpeed;
            if (this.y > canvas.height + 20) this.reset(false);
        }
        draw() {
            ctx.save();
            ctx.translate(this.x, this.y);
            ctx.rotate(this.rotation);
            ctx.fillStyle = this.color;
            ctx.beginPath();
            ctx.moveTo(0, 0);
            ctx.bezierCurveTo(this.size * 0.4, -this.size * 0.3, this.size, -this.size * 0.3, this.size * 0.6, this.size * 0.1);
            ctx.bezierCurveTo(this.size * 0.3, this.size * 0.4, -this.size * 0.1, this.size * 0.3, 0, 0);
            ctx.fill();
            ctx.restore();
        }
    }

    class Star {
        constructor() {
            this.x = Math.random() * canvas.width;
            this.y = Math.random() * canvas.height;
            this.size = 1 + Math.random() * 2;
            this.twinkleSpeed = 0.02 + Math.random() * 0.04;
            this.twinkle = Math.random() * Math.PI * 2;
            this.baseOpacity = 0.3 + Math.random() * 0.5;
        }
        update() {
            this.twinkle += this.twinkleSpeed;
        }
        draw() {
            const opacity = this.baseOpacity + Math.sin(this.twinkle) * 0.3;
            ctx.save();
            ctx.globalAlpha = Math.max(0, opacity);
            ctx.fillStyle = '#fff';
            ctx.shadowColor = 'rgba(236, 72, 153, 0.5)';
            const isMobile = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
            ctx.shadowBlur = isMobile ? 0 : this.size * 2;
            ctx.beginPath();
            ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
        }
    }

    for (let i = 0; i < PETAL_COUNT; i++) petals.push(new Petal());
    for (let i = 0; i < STAR_COUNT; i++) stars.push(new Star());

    let lastFrame = 0;
    let pageVisible = true;
    let sakuraRafId = null;
    document.addEventListener('visibilitychange', () => { pageVisible = !document.hidden; });
    function animate(ts) {
        // Pause canvas drawing when page is hidden (tab switch / screen lock)
        if (!pageVisible) { sakuraRafId = requestAnimationFrame(animate); return; }
        // Cap at ~24fps to reduce CPU/GPU load on mobile
        if (ts - lastFrame < 42) { sakuraRafId = requestAnimationFrame(animate); return; }
        lastFrame = ts;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        stars.forEach(s => { s.update(); s.draw(); });
        petals.forEach(p => { p.update(); p.draw(); });
        sakuraRafId = requestAnimationFrame(animate);
    }
    sakuraRafId = requestAnimationFrame(animate);
}

// =====================================================================
// Audio Context & Sound Effects
// =====================================================================
let audioContext;
function beep(frequency, duration, type = 'sine') {
    if (!audioContext) audioContext = new AudioContext();
    const osc = audioContext.createOscillator();
    const gain = audioContext.createGain();
    osc.type = type;
    osc.frequency.value = frequency;
    gain.gain.value = 0.06;
    gain.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + duration);
    osc.connect(gain).connect(audioContext.destination);
    osc.start();
    osc.stop(audioContext.currentTime + duration);
}

// =====================================================================
// Notification
// =====================================================================
let notifyTimer = null;
function notify(text) {
    const n = $('notif');
    if (notifyTimer) clearTimeout(notifyTimer);
    n.textContent = text;
    n.classList.add('show');
    notifyTimer = setTimeout(() => { n.classList.remove('show'); notifyTimer = null; }, NOTIFY_DURATION);
}

// =====================================================================
// PK retry helper — 3 attempts, 1s fixed backoff, network-only retry
// =====================================================================
async function retryPK(fn, label) {
    for (let i = 0; i < PK_RETRY_COUNT; i++) {
        try {
            return await fn();
        } catch (e) {
            console.error(`[PK] ${label} attempt ${i + 1}:`, e);
            if (i < 2) await new Promise(r => setTimeout(r, PK_RETRY_DELAY));
        }
    }
    throw new Error('NetworkError');
}

// =====================================================================
// Sparkle Effects
// =====================================================================
function spawnSparkles(element, count = 4) {
    const rect = element.getBoundingClientRect();
    const container = element.closest('.content') || element.parentElement;
    if (!container) return;
    const containerRect = container.getBoundingClientRect();
    const symbols = ['✦', '✧', '⋆', '✿'];
    for (let i = 0; i < count; i++) {
        const spark = document.createElement('span');
        spark.className = 'sparkle-burst';
        spark.textContent = symbols[i % symbols.length];
        const offsetX = (Math.random() - 0.5) * 60;
        const offsetY = (Math.random() - 0.5) * 40;
        spark.style.left = (rect.left - containerRect.left + rect.width / 2 + offsetX) + 'px';
        spark.style.top = (rect.top - containerRect.top + rect.height / 2 + offsetY) + 'px';
        spark.style.setProperty('--sx', (Math.random() - 0.5) * 60 + 'px');
        spark.style.setProperty('--sy', -20 - Math.random() * 40 + 'px');
        spark.style.color = Math.random() > 0.5 ? '#E88D7D' : '#D4A574';
        container.appendChild(spark);
        setTimeout(() => spark.remove(), 800);
    }
}

// =====================================================================
// Celebration Effect
// =====================================================================
function spawnCelebration() {
    const emojis = ['🎉', '✨', '🌟', '🎵', '🎶', '🌸', '💫', '⭐', '🎀', '💖'];
    for (let i = 0; i < 15; i++) {
        setTimeout(() => {
            const el = document.createElement('div');
            el.className = 'celebration-emoji';
            el.textContent = emojis[Math.floor(Math.random() * emojis.length)];
            el.style.left = Math.random() * 100 + 'vw';
            el.style.top = -30 + 'px';
            el.style.animationDuration = (2 + Math.random() * 2) + 's';
            document.body.appendChild(el);
            setTimeout(() => el.remove(), 4000);
        }, i * 120);
    }
}

// =====================================================================
// Ripple Effect
// =====================================================================
function createRipple(e) {
    const el = e.target.closest('.btn, .opt-btn, .play-btn, .settings-chip');
    if (!el || el.disabled) return;
    const rect = el.getBoundingClientRect();
    const size = Math.max(rect.width, rect.height);
    const span = document.createElement('span');
    span.className = 'ripple-effect';
    span.style.width = size + 'px';
    span.style.height = size + 'px';
    span.style.left = (e.clientX - rect.left - size/2) + 'px';
    span.style.top = (e.clientY - rect.top - size/2) + 'px';
    el.appendChild(span);
    setTimeout(() => span.remove(), 600);
}

// =====================================================================
// Screen Flash Feedback
// =====================================================================
function flashScreen(color) {
    const overlay = document.getElementById('flashOverlay');
    if (!overlay) return;
    overlay.style.transition = 'none';
    overlay.style.background = color;
    overlay.style.opacity = '0.15';
    overlay.offsetHeight; // Force reflow
    overlay.style.transition = 'opacity 0.4s ease-out';
    overlay.style.opacity = '0';
}

function animateScore(element, newValue) {
    if (!element) return;
    const oldValue = parseInt(element.textContent) || 0;
    if (oldValue === newValue) return;

    const newStr = String(newValue);
    element.innerHTML = '';

    for (let i = 0; i < newStr.length; i++) {
        const span = document.createElement('span');
        span.className = 'score-digit';
        span.textContent = newStr[i];
        span.style.animationDelay = (i * 0.05) + 's';
        element.appendChild(span);
    }

    setTimeout(() => {
        element.textContent = newValue;
    }, 450);
}

// =====================================================================
// View Navigation
// =====================================================================
function showView(viewName) {
    if (viewName !== 'game' && $('animeDetailModal').classList.contains('show')) closeDetailModal();
    if (viewName !== 'library' && libraryPreviewSession.activeKey) stopLibraryPreview();
    if (viewName !== 'game') gameState.fetchGeneration++;
    if (viewName !== 'library') stopLibraryPreview();
    if (roomUnsub) { roomUnsub(); roomUnsub = null; }
    stopFullPlayer();
    hideMusicPlayer();
    stopQuizYT();
    if (ytPlayer && ytPlayer.stopVideo) ytPlayer.stopVideo();
    stopMusicProgress();
    audio.pause();
    gameState.isPlaying = false;
    $('visualizer')?.classList.add('hidden');
    $('playIcon').innerHTML = '<path d="M8 5v14l11-7z"/>';
    // Clean up celebration emojis
    document.querySelectorAll('.celebration-emoji').forEach(el => el.remove());
    document.querySelectorAll('.content > div').forEach(d => d.classList.add('hidden'));
    const target = $('v-' + viewName);
    if (target) target.classList.remove('hidden');
    if (viewName === 'leaderboard') renderLeaderboard();
    if (viewName === 'library') renderLibrary();
}

// =====================================================================
// Single Player Mode
// =====================================================================
function startMode(mode, practiceSongs = null, poolName = '') {
    gameState.mode = 'single';
    gameState.gameMode = mode || 'anime';
    gameState.practiceMode = Array.isArray(practiceSongs) && !poolName;
    const modeLabelEl = $('modeLabel');
    if (modeLabelEl) {
        modeLabelEl.textContent = poolName || (gameState.practiceMode ? '错题练习' :
            (({ anime: '猜番剧', song: '猜歌名', artist: '猜歌手', mixed: '混合' })[gameState.gameMode] || '猜番剧'));
        modeLabelEl.style.display = '';
    }
    gameState.score = 0;
    gameState.questionIndex = 0;
    gameState.combo = 0;
    gameState.maxCombo = 0;
    gameState.correctCount = 0;
    gameState.answerHistory = [];
    gameState.failedQuestionSongs = [];
    gameState.viewingHistory = false;
    const pool = practiceSongs || getFilteredSongs();
    if (pool.length === 0) {
        notify(filterState.watchedOnly && !gameState.practiceMode ? '追番曲库为空，请先在「我的曲库」标记追番' : '曲库为空，请调整筛选条件');
        return;
    }
    gameState.activePool = pool;
    const enoughAnime = new Set(pool.map(animeLabel)).size >= 4;
    const enoughArtists = new Set(pool.map(s => s.artist)).size >= 4;
    const seasonDistractors = !gameState.practiceMode && filterState.source?.startsWith('season:')
        ? (SEASONAL_POOLS[filterState.source.slice(7)] || []).filter(song => !filterState.types.size || filterState.types.has(song.type))
        : null;
    gameState.optionPool = pool.length >= 4 && enoughAnime && enoughArtists ? pool : (seasonDistractors || getAllSongs());
    gameState.playlist = buildPlaylist(pool, gameState.questionCount);
    $('singleHeader').classList.remove('hidden');
    $('pkHeader').classList.add('hidden');
    $('comboArea').innerHTML = '';
    $('songInfo').classList.remove('show');
    $('totalQ').textContent = gameState.playlist.length;
    showView('game');
    loadQuestion();
}

// 兼容旧入口（默认猜番剧）
function startSingle() {
    startMode('anime');
}

// =====================================================================
// PK Mode
// =====================================================================
let pkBusy = false;
async function pkCreate() {
    if (pkBusy) return;
    if (!user) { notify('正在连接服务器喵~ 请稍等...'); return; }
    if (!navigator.onLine) { notify('呜喵~ 当前没有网络连接呢...请检查一下网络吧'); return; }
    pkBusy = true;
    try {
        const questions = buildPlaylist(SONGS, 10).map(s => SONGS.indexOf(s));
        let created = false;
        for (let attempt = 0; attempt < 10 && !created; attempt++) {
            const rid = String(Math.floor(1000 + Math.random() * 9000));
            const result = await retryPK(() => runTransaction(ref(db, 'rooms/' + rid), current => {
                if (current !== null) return;
                return {
                    host: user.uid,
                    guest: null,
                    status: 'waiting',
                    timestamp: serverTimestamp(),
                    scores: { [user.uid]: 0 },
                    questions,
                };
            }, { applyLocally: false }), 'pkCreate');
            if (result.committed) {
                roomId = rid;
                enterRoom(rid);
                created = true;
            }
        }
        if (!created) notify('房间号暂时不足，请再试一次');
    } catch (e) {
        console.error('[PK] pkCreate:', e);
        notify('呜喵~ 网络连接超时了...请检查网络后再试一次吧');
    } finally {
        pkBusy = false;
    }
}

async function pkJoin() {
    if (pkBusy) return;
    if (!user) { notify('正在连接服务器喵~ 请稍等...'); return; }
    if (!navigator.onLine) { notify('呜喵~ 当前没有网络连接呢...请检查一下网络吧'); return; }
    const rid = $('roomIdInput').value.trim();
    if (rid.length !== 4 || !/^\d{4}$/.test(rid)) { notify('喵~ 请输入4位数字房间号哦'); return; }
    pkBusy = true;
    try {
        const snap = await retryPK(() => get(ref(db, 'rooms/' + rid)), 'pkJoin.getDoc');
        if (!snap.exists()) { notify('呜喵~ 房间号不存在或已过期了...'); pkBusy = false; return; }
        const d = snap.val();
        if (d.status !== 'waiting' && d.guest !== user.uid) {
            notify('喵呜~ 这个房间已经满了...试试其他房间吧');
            pkBusy = false; return;
        }
        if (!d.guest) {
            const result = await retryPK(() => runTransaction(ref(db, 'rooms/' + rid), current => {
                if (!current || current.status !== 'waiting' || (current.guest && current.guest !== user.uid)) return;
                return {
                    ...current,
                    guest: user.uid,
                    scores: { ...current.scores, [user.uid]: 0 }
                };
            }, { applyLocally: false }), 'pkJoin.transaction');
            if (!result.committed) {
                notify('喵呜~ 这个房间已经满了...试试其他房间吧');
                return;
            }
        }
        roomId = rid;
        enterRoom(rid);
    } catch (e) {
        console.error('[PK] pkJoin:', e);
        notify('呜喵~ 网络连接超时了...请检查网络后再试一次吧');
    } finally {
        pkBusy = false;
    }
}

function pkShare() {
    if (!roomId) return;
    const url = new URL(location.href);
    url.searchParams.set('room', roomId);
    if (navigator.share) {
        navigator.share({ title: '萌豚挑战', text: `房间号：${roomId}`, url: url.toString() });
    } else {
        navigator.clipboard.writeText(url.toString()).then(() => {
            $('shareFeedback').textContent = '链接已复制！';
            setTimeout(() => $('shareFeedback').textContent = '', 2000);
        });
    }
}

async function pkStart() {
    if (!roomId || !user) return;
    try {
        const result = await runTransaction(ref(db, 'rooms/' + roomId), current => {
            if (!current || current.host !== user.uid || !current.guest || current.status !== 'waiting') return;
            return { ...current, status: 'playing' };
        }, { applyLocally: false });
        if (!result.committed) notify('房间状态已变化，请刷新后重试');
    } catch (e) {
        console.error('[PK] pkStart:', e);
        notify('开始对战失败，请检查网络后重试');
    }
}

function enterRoom(rid) {
    showView('room');
    $('roomIdDisplay').textContent = rid;
    const roomRef = ref(db, 'rooms/' + rid);
    roomUnsub = onValue(roomRef, snap => {
        if (!snap.exists()) return;
        const d = snap.val();
        const p2 = $('p2Card');
        const btn = $('btnStartPk');
        if (d.guest) {
            p2.classList.remove('waiting');
            p2.classList.add('active');
            p2.querySelector('.player-avatar').textContent = 'P2';
            p2.querySelector('.player-name').textContent = '对手已加入';
            if (d.host === user.uid) {
                btn.disabled = false;
                btn.className = 'btn btn-primary';
                btn.textContent = '⚔️ 开始对战';
                btn.setAttribute('data-action', 'pkStart');
            } else {
                btn.textContent = '等待房主开始喵~';
            }
        }
        if (d.status === 'playing' && gameState.mode !== 'pk') {
            gameState.mode = 'pk';
            gameState.score = 0;
            gameState.opponentScore = 0;
            gameState.questionIndex = 0;
            gameState.combo = 0;
            gameState.maxCombo = 0;
            gameState.correctCount = 0;
            gameState.answerHistory = [];
            gameState.viewingHistory = false;
            gameState.playlist = d.questions.map(i => SONGS[i]);
            $('singleHeader').classList.add('hidden');
            $('pkHeader').classList.remove('hidden');
            $('songInfo').classList.remove('show');
            $('totalQ').textContent = gameState.playlist.length;
            showView('game');
            // Re-subscribe for score sync (showView unsubscribed the room listener)
            if (roomUnsub) roomUnsub();
            roomUnsub = onValue(ref(db, 'rooms/' + roomId), scoreSnap => {
                if (!scoreSnap.exists()) return;
                const sd = scoreSnap.val();
                if (sd.scores) {
                    const opId = sd.host === user.uid ? sd.guest : sd.host;
                    gameState.opponentScore = sd.scores[opId] || 0;
                    $('opScoreText').textContent = gameState.opponentScore;
                }
            });
            loadQuestion();
        }
    });
}

function checkInvite() {
    try {
        const rid = new URL(location.href).searchParams.get('room');
        if (rid && rid.length === 4) {
            showView('lobby');
            $('roomIdInput').value = rid;
        }
    } catch (e) {
        console.error('[PK] checkInvite:', e);
    }
}

// =====================================================================
// Game Core
// =====================================================================
function setQuizMediaState(state, message) {
    gameState.mediaState = state;
    if (state === 'playing' && gameState.mode === 'single' && !gameState.viewingHistory) {
        recordLocalAudioCheck(gameState.currentSong, 'played', gameState.lastAudioResult?.source || '');
    }
    const status = $('playerStatus');
    if (status) {
        status.textContent = message || '';
        status.dataset.state = state;
    }
    const canPlay = state === 'awaiting-play' || state === 'ready' || state === 'playing';
    const canAnswer = state === 'ready' || state === 'playing';
    const playButton = $('playBtn');
    if (playButton) playButton.disabled = !canPlay;
    document.querySelectorAll('.opt-btn').forEach(button => { button.disabled = !canAnswer; });
    const retryButton = $('retryAudioBtn');
    if (retryButton) {
        retryButton.hidden = state === 'idle' || state === 'searching';
        retryButton.disabled = state === 'switching';
    }
    if (canAnswer) clearQuizMediaTimeout();
}

let quizMediaTimeout = null;

function clearQuizMediaTimeout() {
    if (quizMediaTimeout) clearTimeout(quizMediaTimeout);
    quizMediaTimeout = null;
}

function armQuizMediaTimeout(reason, delay = 12000) {
    clearQuizMediaTimeout();
    const generation = gameState.fetchGeneration;
    quizMediaTimeout = setTimeout(() => {
        quizMediaTimeout = null;
        if (generation !== gameState.fetchGeneration) return;
        recoverQuestionAudio(reason);
    }, delay);
}

function loadQuestion() {
    if ($('animeDetailModal').classList.contains('show')) closeDetailModal();
    $('gameAudioPanel').classList.remove('answered');
    stopQuizYT();
    clearQuizMediaTimeout();
    audioRetryCount = 0; // fresh retry budget per question
    gameState.mediaRetryCount = 0;
    gameState.recoveringAudio = false;
    gameState.failedAudioSources = new Set();
    gameState.failedBiliVideos = new Set();
    gameState.failedYtVideos = new Set();
    const gen = ++gameState.fetchGeneration;
    if (gameState.questionIndex >= gameState.playlist.length) {
        endGame();
        return;
    }

    // History viewing mode — show past answer with result markers
    if (gameState.viewingHistory) {
        const record = gameState.answerHistory[gameState.questionIndex];
        if (!record) { gameState.viewingHistory = false; return; }
        gameState.correctAnime = record.song.anime;
        gameState.currentSong = record.song;
        gameState.isLocked = true;
        audio.pause();
        gameState.isPlaying = false;
        $('visualizer').classList.add('hidden');
        $('playIcon').innerHTML = '<path d="M8 5v14l11-7z"/>';
        $('playBtn').disabled = true;
        $('playerStatus').textContent = '回顾模式 — 搜索中...';
        progressFill.style.width = '0%';
        $('qNum').textContent = gameState.questionIndex + 1;
        const histCorrect = gameState.answerHistory.slice(0, gameState.questionIndex + 1).filter(r => r.isCorrect).length;
        animateScore($('scoreText'), histCorrect);
        $('songInfo').classList.remove('show');
        $('hintBar')?.classList.add('hidden');
        renderHistoryOptions(record);
        showSongInfo(record.isCorrect);
        // Fetch audio for playback during review
        fetchAudio(record.song.title, record.song.artist, record.song.anime).then(result => {
            if (gen !== gameState.fetchGeneration) return;
            if (!result) {
                $('playerStatus').textContent = '回顾模式 — 无音频';
                return;
            }
            gameState.lastAudioResult = result;
            const url = result.url;
            if (url.startsWith('yt:')) {
                quizYT.active = true;
                quizYT.videoId = url.slice(3);
                $('playerStatus').textContent = '回顾模式 (YouTube源)';
            } else {
                quizYT.active = false;
                quizYT.videoId = null;
                audio.src = url;
                $('playerStatus').textContent = result.source === 'bilibili' ? '回顾模式 (B站源)' : '回顾模式';
            }
            $('playBtn').disabled = false;
        });
        // Review mode: show a button to manually open detail instead of auto-showing
        $('reviewDetailBtn').style.display = '';
        updateNavButtons();
        return;
    }

    const q = gameState.playlist[gameState.questionIndex];
    // 决定当前题题型：PK 固定猜番剧；混合模式随机；其余按所选模式
    gameState.guessType = gameState.mode === 'pk' ? 'anime'
        : gameState.gameMode === 'mixed' ? (['anime', 'song', 'artist'])[Math.floor(Math.random() * 3)]
        : gameState.gameMode;
    gameState.hints = { h1: false, h2: false };
    gameState.correctAnime = q.anime;
    gameState.currentSong = q;
    gameState.isLocked = false;
    audio.pause();
    gameState.isPlaying = false;
    $('visualizer').classList.add('hidden');
    $('playIcon').innerHTML = '<path d="M8 5v14l11-7z"/>';
    setQuizMediaState('searching', '正在搜索音频…');
    progressFill.style.width = '0%';
    $('playerTimeCurrent').textContent = '00:00';
    $('songInfo').classList.remove('show');
    $('reviewDetailBtn').style.display = 'none';
    $('qNum').textContent = gameState.questionIndex + 1;
    animateScore($('scoreText'), gameState.correctCount);
    updateNavButtons();
    $('optionsGrid').innerHTML = '<div class="loading-state"><div class="loading-dots"><div class="loading-dot"></div><div class="loading-dot"></div><div class="loading-dot"></div></div><div class="loading-text">正在搜索音频喵~</div></div>';

    const correctAnime = q.anime;  // capture now — prevents race if recursive loadQuestion overwrites gameState
    fetchAudio(q.title, q.artist, q.anime).then(result => {
        if (gen !== gameState.fetchGeneration) return;
        if (!result) {
            // B站源失败提示分级：代理不可达/取流被风控（首次给操作指引，后续简短）vs 普通失败
            const biliBroken = biliProxyState.reason === 'proxy-down' || biliProxyState.reason === 'no-stream';
            if (audioSourcePref === 'bilibili-only' && biliBroken) {
                if (!biliProxyState.notified) {
                    biliProxyState.notified = true;
                    skipUnplayableQuestion('B站音频获取失败。请检查本地代理或设置中的代理地址');
                } else {
                    skipUnplayableQuestion('B站代理不可用');
                }
            } else {
                skipUnplayableQuestion('这首歌暂无可用音源');
            }
            return;
        }
        renderHintBar();
        renderOptions(q);
        prepareQuestionAudio(result, gen);
    });
}

function sourceLabel(source) {
    if (source === 'bilibili') return 'B站源';
    if (source === 'youtube') return 'YouTube源';
    return 'iTunes源';
}

function prepareQuestionAudio(result, generation) {
    if (generation !== gameState.fetchGeneration) return;
    gameState.lastAudioResult = result;
    rememberResolvedAudio(gameState.currentSong, result);
    const label = sourceLabel(result.source);
    if (result.url.startsWith('yt:')) {
        quizYT.active = true;
        quizYT.videoId = result.url.slice(3);
        setQuizMediaState('buffering', `音频已找到 · 正在准备${label}播放器`);
        ensureYouTubeAPI().then(() => {
            if (generation === gameState.fetchGeneration && quizYT.videoId === result.url.slice(3))
                setQuizMediaState('awaiting-play', `音频已找到 · ${label} · 点击播放`);
        }).catch(() => {
            if (generation === gameState.fetchGeneration) recoverQuestionAudio('YouTube播放器不可用');
        });
        return;
    }
    quizYT.active = false;
    quizYT.videoId = null;
    setQuizMediaState('buffering', `正在缓冲 · ${label}`);
    audio.src = result.url;
    audio.load?.();
    armQuizMediaTimeout(`${label}缓冲超时`);
}

function skipUnplayableQuestion(message) {
    clearQuizMediaTimeout();
    if (gameState.mode === 'single') recordLocalAudioCheck(gameState.currentSong, 'failed', gameState.lastAudioResult?.source || audioSourcePref || 'default');
    let replacement = null;
    if (gameState.mode === 'single') {
        gameState.failedQuestionSongs ||= [];
        gameState.failedQuestionSongs.push(gameState.currentSong);
        replacement = pickReplacementSong(gameState.activePool, gameState.playlist, gameState.failedQuestionSongs);
    }
    if (replacement) gameState.playlist[gameState.questionIndex] = replacement;
    else gameState.questionIndex++;
    const status = `${message}${replacement ? '，已换另一首' : '，已跳过此题'}`;
    setQuizMediaState('failed', status);
    notify(status);
    const generation = gameState.fetchGeneration;
    setTimeout(() => {
        if (generation === gameState.fetchGeneration) loadQuestion();
    }, 800);
}

async function recoverQuestionAudio(reason) {
    if (gameState.recoveringAudio || gameState.isLocked || !gameState.currentSong) return;
    gameState.recoveringAudio = true;
    clearQuizMediaTimeout();
    const failedSource = gameState.lastAudioResult?.source || null;
    if (failedSource === 'bilibili' && gameState.lastAudioResult?.bvid) {
        gameState.failedBiliVideos.add(gameState.lastAudioResult.bvid);
    } else if (failedSource === 'youtube' && gameState.lastAudioResult?.ytVideoId) {
        if (!gameState.failedYtVideos) gameState.failedYtVideos = new Set();
        gameState.failedYtVideos.add(gameState.lastAudioResult.ytVideoId);
    } else if (failedSource) {
        gameState.failedAudioSources.add(failedSource);
    }
    gameState.mediaRetryCount++;
    if (gameState.mediaRetryCount > 5) {
        gameState.recoveringAudio = false;
        skipUnplayableQuestion('所有音频来源均不可用，已跳过此题');
        return;
    }

    const song = gameState.currentSong;
    const generation = ++gameState.fetchGeneration;
    stopQuizYT();
    audio.pause();
    setQuizMediaState('switching', `${reason}，正在自动换源…`);
    const cacheKey = `${song.title}|${song.anime}`;
    audioCache.delete(cacheKey);
    forgetResolvedAudio(song);
    let result = null;
    try {
        result = await fetchAudioInner(
            song.title, song.artist, song.anime, cacheKey, gameState.failedAudioSources, song.type || ''
        );
    } catch (error) {
        console.error('[Audio] automatic recovery failed:', error);
    }
    if (generation !== gameState.fetchGeneration) return;
    gameState.recoveringAudio = false;
    if (!result) {
        skipUnplayableQuestion('没有可用的备用音频，已跳过此题');
        return;
    }
    prepareQuestionAudio(result, generation);
}

async function retryQuestionAudio() {
    if (gameState.recoveringAudio || gameState.isLocked || !gameState.currentSong) return;
    gameState.recoveringAudio = true;
    clearQuizMediaTimeout();
    const song = gameState.currentSong;
    const generation = ++gameState.fetchGeneration;
    stopQuizYT();
    audio.pause();
    gameState.isPlaying = false;
    gameState.failedAudioSources = new Set();
    gameState.failedBiliVideos = new Set();
    gameState.failedYtVideos = new Set();
    gameState.mediaRetryCount = 0;
    const cacheKey = `${song.title}|${song.anime}`;
    audioCache.delete(cacheKey);
    forgetResolvedAudio(song);
    if (gameState.lastAudioResult?.bvid) bilibiliAudioCache.delete(gameState.lastAudioResult.bvid);
    setQuizMediaState('switching', '正在重新加载音频…');
    let result = null;
    try {
        result = await fetchAudioInner(song.title, song.artist, song.anime, cacheKey, new Set());
    } catch (error) {
        console.error('[Audio] manual reload failed:', error);
    }
    if (generation !== gameState.fetchGeneration) return;
    gameState.recoveringAudio = false;
    if (!result) {
        skipUnplayableQuestion('重新加载失败，已跳过此题');
        return;
    }
    prepareQuestionAudio(result, generation);
}

function buildBiliProxyUrl(cdnUrl, backupUrl = '') {
    const base = window.BILI_WORKER_URL;
    const backup = backupUrl ? `&backup=${encodeURIComponent(backupUrl)}` : '';
    if (base.includes('localhost') || base.includes('127.0.0.1')) {
        return `${base}/stream?url=${encodeURIComponent(cdnUrl)}${backup}`;
    }
    return `${base}/api/search?stream=${encodeURIComponent(cdnUrl)}${backup}`;
}

async function fetchBilibiliAudio(title, artist, anime, type, cacheKey, excludedBvids = new Set()) {
    const aliases = {
        titleCN: gameState.currentSong?.titleCN || '',
        animeCN: gameState.currentSong?.animeCN || ''
    };
    const biliResult = await searchBilibili(anime, title, artist, type, aliases);
    if (!biliResult) return null;
    const candidates = [biliResult, ...(biliResult._alternates || [])]
        .filter(candidate => !excludedBvids.has(candidate.bvid)).slice(0, 4);
    for (const candidate of candidates) {
        const audioInfo = await getBilibiliAudioUrl(candidate.bvid);
        if (!audioInfo?.url) continue;
        const e = {
            url: buildBiliProxyUrl(audioInfo.url, audioInfo.backupUrl),
            source: 'bilibili',
            bvid: candidate.bvid,
            biliTitle: candidate.title,
            biliDuration: audioInfo.duration
        };
        biliProxyState.down = false;
        biliProxyState.reason = null;
        audioCache.set(cacheKey, e);
        return e;
    }
    return null;
}

// In-flight dedup: concurrent fetchAudio calls for the same song share one
// network pipeline — rapid question navigation used to fire duplicate searches.
const fetchAudioInFlight = new Map();
const resolvedAudioCache = new Map();
function audioResultKey(title, artist, anime, type, preference = audioSourcePref) {
    return [title, artist, anime, type, preference].map(value => String(value || '')).join('|');
}
function forgetResolvedAudio(song) {
    if (!song) return;
    resolvedAudioCache.delete(audioResultKey(song.title, song.artist, song.anime, song.type || ''));
}
function rememberResolvedAudio(song, result) {
    if (song && result?.url) resolvedAudioCache.set(audioResultKey(song.title, song.artist, song.anime, song.type || ''), result);
}

async function fetchAudio(title, artist, anime, songType = '') {
    const cacheKey = `${title}|${anime}`;
    const type = songType || gameState.currentSong?.type || '';
    const preference = audioSourcePref;
    const inFlightKey = audioResultKey(title, artist, anime, type, preference);
    if (resolvedAudioCache.has(inFlightKey)) return resolvedAudioCache.get(inFlightKey);
    if (fetchAudioInFlight.has(inFlightKey)) return fetchAudioInFlight.get(inFlightKey);
    const p = fetchAudioInner(title, artist, anime, cacheKey, new Set(), type, preference)
        .then(result => { if (result?.url) resolvedAudioCache.set(inFlightKey, result); return result; })
        .finally(() => fetchAudioInFlight.delete(inFlightKey));
    fetchAudioInFlight.set(inFlightKey, p);
    return p;
}

async function searchQuizItunesCandidates(song) {
    const terms = audioSearchQueries(song).itunes;
    const results = await Promise.allSettled(terms.map(async term => {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), ITUNES_TIMEOUT);
        try {
            const response = await fetch(`https://itunes.apple.com/search?term=${encodeURIComponent(term)}&media=music&entity=song&limit=10&country=JP`, { signal: controller.signal });
            if (!response.ok) return [];
            return ((await response.json()).results || []).filter(item => item.previewUrl).map(item => ({
                source: 'itunes', url: item.previewUrl, title: item.trackName, artist: item.artistName, album: item.collectionName
            }));
        } finally { clearTimeout(timer); }
    }));
    const seen = new Set();
    return results.flatMap(result => result.status === 'fulfilled' ? result.value : []).filter(item => {
        if (seen.has(item.url)) return false;
        seen.add(item.url);
        return true;
    });
}

function settleWithin(promise, ms, fallback = null) {
    let timer;
    return Promise.race([promise, new Promise(resolve => { timer = setTimeout(() => resolve(fallback), ms); })])
        .finally(() => clearTimeout(timer));
}

async function fetchAudioInner(title, artist, anime, cacheKey, excludedSources = new Set(), songType = gameState.currentSong?.type || '', sourcePreference = audioSourcePref,
    excludedVideos = { yt: gameState.failedYtVideos, bili: gameState.failedBiliVideos }) {
    const song = (gameState.currentSong?.title === title && gameState.currentSong?.anime === anime &&
        (!artist || gameState.currentSong.artist === artist) ? gameState.currentSong : null) ||
        getAllSongs().find(item => item.title === title && item.anime === anime && (!artist || item.artist === artist)) ||
        { title, artist, anime, type: songType };
    const useBili = sourcePreference !== 'itunes-youtube' && !excludedSources.has('bilibili');
    const useOthers = sourcePreference !== 'bilibili-only';
    const tasks = [
        useOthers && !excludedSources.has('itunes') ? searchQuizItunesCandidates(song) : Promise.resolve([]),
        useOthers && !excludedSources.has('youtube') ? searchQuizYouTubeCandidates(song) : Promise.resolve([]),
        useBili ? settleWithin(searchBilibili(anime, title, artist, songType,
            { titleCN: song.titleCN, animeCN: song.animeCN, animeNative: song.animeNative }), 15000) : Promise.resolve(null)
    ];
    const [itunes, youtube, bili] = await Promise.allSettled(tasks);
    const candidates = [
        ...(itunes.status === 'fulfilled' ? itunes.value : []),
        ...(youtube.status === 'fulfilled' ? youtube.value : []).filter(item => !excludedVideos.yt?.has(item.videoId))
    ];
    const seasonalSong = Object.values(SEASONAL_POOLS).flat().find(item => item.title === title && item.anime === anime);
    if (useOthers && !excludedSources.has('youtube') && seasonalSong?.youtubeVideoId &&
        !excludedVideos.yt?.has(seasonalSong.youtubeVideoId)) {
        candidates.push({ source: 'youtube', videoId: seasonalSong.youtubeVideoId,
            title: `${song.animeCN || anime} ${song.type || songType} ${song.title} ${artist}` });
    }
    if (bili.status === 'fulfilled' && bili.value) {
        for (const item of [bili.value, ...(bili.value._alternates || [])]) {
            if (!excludedVideos.bili?.has(item.bvid)) candidates.push({
                source: 'bilibili', bvid: item.bvid, title: item.title, artist: item.author || ''
            });
        }
    }
    const lastCheck = audioChecks.find(entry => entry.key === trackKey(song));
    const ranked = rankAudioCandidates(song, candidates.map(candidate => ({
        ...candidate, localFailure: lastCheck?.status === 'failed' && lastCheck.source === candidate.source
    })));
    for (const candidate of ranked) {
        if (candidate.source === 'itunes') return { url: candidate.url, source: 'itunes', score: candidate.score,
            itunesTrack: candidate.title, itunesArtist: candidate.artist };
        if (candidate.source === 'youtube') return { url: `yt:${candidate.videoId}`, source: 'youtube', score: candidate.score,
            ytVideoId: candidate.videoId };
        if (candidate.source === 'bilibili') {
            const info = await getBilibiliAudioUrl(candidate.bvid);
            if (!info?.url) continue;
            biliProxyState.down = false;
            biliProxyState.reason = null;
            return { url: buildBiliProxyUrl(info.url, info.backupUrl), source: 'bilibili', score: candidate.score,
                bvid: candidate.bvid, biliTitle: candidate.title, biliDuration: info.duration };
        }
    }
    return null;
}

function getGuessValue(song, guessType) {
    if (guessType === 'song') return song.titleCN || song.title;
    if (guessType === 'artist') return song.artist;
    return animeLabel(song);
}

function animeLabel(song) {
    return song.animeCN || song.anime;
}

function buildWrongOptions(song, guessType) {
    const optionPool = gameState.mode === 'single' ? (gameState.optionPool || gameState.activePool) : SONGS;
    if (guessType === 'song') {
        const answer = song.titleCN || song.title;
        // 干扰项排除同番剧、同歌手（不足 3 个时放宽同歌手，保持不同番剧）
        const pool = optionPool.filter(s => s.anime !== song.anime && (s.artist || '') !== (song.artist || ''));
        let titles = [...new Set(pool.map(s => s.titleCN || s.title).filter(t => t && t !== answer))];
        if (titles.length < 3) {
            const loose = [...new Set(optionPool.filter(s => s.anime !== song.anime).map(s => s.titleCN || s.title).filter(t => t && t !== answer))];
            titles = [...new Set([...titles, ...loose])];
        }
        return shuffle(titles).slice(0, 3);
    }
    if (guessType === 'artist') {
        const artists = [...new Set(optionPool.map(s => s.artist).filter(a => a && a !== song.artist))];
        return shuffle(artists).slice(0, 3);
    }
    return shuffle([...new Set(optionPool.filter(s => s.anime !== song.anime).map(animeLabel))]).slice(0, 3);
}

function renderOptions(song) {
    const answer = getGuessValue(song, gameState.guessType);
    const wrongs = buildWrongOptions(song, gameState.guessType);
    const opts = shuffle([...wrongs, answer]);
    $('optionsGrid').innerHTML = '';
    opts.forEach((opt, i) => {
        const btn = document.createElement('button');
        btn.className = 'opt-btn';
        btn.textContent = opt;
        btn.dataset.key = i + 1;
        btn.style.animationDelay = (i * 0.06) + 's';
        btn.disabled = gameState.mediaState !== 'ready' && gameState.mediaState !== 'playing';
        btn.onclick = () => handleAnswer(btn, opt);
        $('optionsGrid').appendChild(btn);
    });
}

// =====================================================================
// Hint System（提示系统：每题 2 个提示，使用后本题得分打折）
// =====================================================================
const HINT_LABELS = {
    anime: { h1: '歌手', h2: '歌名' },
    song:  { h1: '歌手', h2: '番剧' },
    artist:{ h1: '歌名', h2: '番剧' },
};

function getHintContent(song, guessType, which) {
    if (which === 'h1') {
        const label = HINT_LABELS[guessType].h1;
        if (label === '歌手') return '歌手：' + song.artist;
        if (label === '歌名') return '歌名：' + (song.titleCN || song.title);
        return '番剧：' + animeLabel(song);
    }
    const label = HINT_LABELS[guessType].h2;
    if (label === '歌手') return '歌手：' + song.artist;
    if (label === '番剧') return '番剧：' + animeLabel(song);
    const t = song.titleCN || song.title;
    return '歌名首字「' + t.slice(0, 1) + '」· 共 ' + t.length + ' 字';
}

function renderHintBar() {
    const bar = $('hintBar');
    if (!bar) return;
    if (gameState.mode === 'pk') { bar.classList.add('hidden'); return; }
    bar.classList.remove('hidden');
    const labels = HINT_LABELS[gameState.guessType] || HINT_LABELS.anime;
    bar.innerHTML = '<span class="hint-label">提示</span>'
        + '<button class="hint-btn" id="hintBtn1">💡 ' + labels.h1 + '</button>'
        + '<button class="hint-btn" id="hintBtn2">💡 ' + labels.h2 + '</button>';
    $('hintBtn1').onclick = () => useHint('h1');
    $('hintBtn2').onclick = () => useHint('h2');
}

function useHint(which) {
    if (gameState.isLocked || gameState.hints[which]) return;
    const btn = $(which === 'h1' ? 'hintBtn1' : 'hintBtn2');
    if (!btn) return;
    gameState.hints[which] = true;
    btn.textContent = getHintContent(gameState.currentSong, gameState.guessType, which);
    btn.classList.add('used');
    btn.disabled = true;
    const mult = (gameState.hints.h1 && gameState.hints.h2) ? 0.36 : 0.6;
    notify('提示已使用，本题得分 ×' + mult);
}

function handleAnswer(btn, selected) {
    if (gameState.isLocked) return;
    if (gameState.mediaState && gameState.mediaState !== 'ready' && gameState.mediaState !== 'playing') return;
    gameState.isLocked = true;
    // 锁定提示按钮
    document.querySelectorAll('.hint-btn').forEach(b => { b.disabled = true; b.classList.add('used'); });
    audio.pause();
    const replayVideoId = gameState.lastAudioResult?.source === 'youtube' ? gameState.lastAudioResult.ytVideoId : null;
    stopQuizYT();
    if (replayVideoId) { quizYT.active = true; quizYT.videoId = replayVideoId; }
    gameState.isPlaying = false;
    $('visualizer').classList.add('hidden');
    $('playIcon').innerHTML = '<path d="M8 5v14l11-7z"/>';

    const correctValue = getGuessValue(gameState.currentSong, gameState.guessType);
    const isCorrect = selected === correctValue;
    if (!isCorrect && gameState.mode === 'single') recordMistake(gameState.currentSong, selected);
    gameState.answerHistory.push({
        song: gameState.currentSong,
        guessType: gameState.guessType,
        correctValue: correctValue,
        selected: selected,
        isCorrect: isCorrect,
        options: Array.from(document.querySelectorAll('.opt-btn')).map(b => b.textContent),
        scoreSnapshot: gameState.score
    });
    showSongInfo(isCorrect);

    if (isCorrect) {
        btn.classList.add('correct');
        beep(523, 0.3);
        flashScreen('#7BC47F'); // Warm green flash for correct answer
        gameState.combo++;
        if (gameState.combo > gameState.maxCombo) gameState.maxCombo = gameState.combo;
        gameState.correctCount++;
        const hintMult = (gameState.hints.h1 && gameState.hints.h2) ? 0.36 : (gameState.hints.h1 || gameState.hints.h2) ? 0.6 : 1;
        gameState.score += Math.round((10 + Math.min(gameState.combo, 5)) * hintMult);
        if (gameState.combo >= 2) {
            showCombo();
            spawnSparkles($('comboArea'));
        }
        if (gameState.mode === 'pk' && roomId) {
            update(ref(db, 'rooms/' + roomId), {
                [`scores/${user.uid}`]: gameState.score
            });
        }
    } else {
        btn.classList.add('wrong');
        beep(200, 0.3, 'sawtooth');
        flashScreen('#E87D7D'); // Warm red flash for wrong answer
        gameState.combo = 0;
        $('comboArea').innerHTML = '';
        document.querySelectorAll('.opt-btn').forEach(b => {
            if (b.textContent === correctValue) b.classList.add('reveal');
        });
    }

    animateScore($('scoreText'), gameState.correctCount);
    animateScore($('myScoreText'), gameState.score);
    updateNavButtons();
}

function showSongInfo(isCorrect) {
    const song = gameState.currentSong;
    const title = song.titleCN || song.title;
    const badge = $('resultBadge');

    $('songTitle').textContent = title;
    $('songAnime').textContent = animeLabel(song);
    $('songArtist').textContent = song.artist;

    if (isCorrect) {
        badge.className = 'result-badge correct';
        badge.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-2px;margin-right:2px;"><polyline points="20 6 9 17 4 12"/></svg>正确';
    } else {
        badge.className = 'result-badge wrong';
        badge.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" style="vertical-align:-2px;margin-right:2px;"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>错误';
    }
    $('songInfo').classList.add('show');
    $('reviewDetailBtn').style.display = '';
    $('answerNextBtn').textContent = gameState.questionIndex + 1 >= gameState.playlist.length && !gameState.viewingHistory
        ? '查看结果 →' : '下一题 →';
    $('gameAudioPanel').classList.add('answered');
    showAnimeDetail(song, { auto: true });
}

function showCombo() {
    $('comboArea').innerHTML = `<span class="combo-text"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-3px;margin-right:2px;"><path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"/></svg>${gameState.combo} COMBO!</span>`;
}

// =====================================================================
// Playback Controls
// =====================================================================
let playLock = false;
function togglePlay() {
    if (playLock) return;
    if (gameState.isPlaying) {
        if (quizYT.active) {
            if (ytPlayer && ytPlayer.pauseVideo) ytPlayer.pauseVideo();
            clearQuizMediaTimeout();
        } else {
            audio.pause();
        }
        gameState.isPlaying = false;
        setQuizMediaState('ready', `已暂停 · ${sourceLabel(gameState.lastAudioResult?.source)}`);
        $('visualizer').classList.add('hidden');
        $('playIcon').innerHTML = '<path d="M8 5v14l11-7z"/>';
    } else {
        if (quizYT.active) {
            // YouTube quiz playback — play 30s clip
            if (!ytPlayer || !ytReady || !quizYT.videoId) {
                recoverQuestionAudio('YouTube播放器未就绪');
                return;
            }
            stopFullPlayer();
            stopMusicPlayer();
            setQuizMediaState('buffering', '正在启动 · YouTube源');
            ytPlayer.loadVideoById({ videoId: quizYT.videoId, startSeconds: 0 });
            armQuizMediaTimeout('YouTube播放启动超时', 10000);
        } else {
            // Normal iTunes playback
            if ($('fullPlayer')?.style.display !== 'none') {
                stopFullPlayer();
                const quizUrl = gameState.lastAudioResult?.url;
                if (quizUrl && !quizUrl.startsWith('yt:')) audio.src = quizUrl;
                audio.currentTime = 0;
            }
            if (audioContext) audioContext.resume();
            playLock = true;
            gameState.isPlaying = true;
            $('visualizer').classList.remove('hidden');
            $('playIcon').innerHTML = '<rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/>';
            const lockTimeout = setTimeout(() => { playLock = false; }, 5000);
            audio.play().then(() => {
                clearTimeout(lockTimeout);
                playLock = false;
                setQuizMediaState('playing', `正在播放 · ${sourceLabel(gameState.lastAudioResult?.source)}`);
            }).catch(() => {
                clearTimeout(lockTimeout);
                playLock = false;
                gameState.isPlaying = false;
                $('visualizer').classList.add('hidden');
                $('playIcon').innerHTML = '<path d="M8 5v14l11-7z"/>';
                recoverQuestionAudio('音频播放失败');
            });
        }
    }
}

function stopQuizYT() {
    if (quizYT.timer) { clearTimeout(quizYT.timer); quizYT.timer = null; }
    stopQuizProgress();
    quizYT.active = false;
    quizYT.videoId = null;
    if (ytPlayer && ytPlayer.stopVideo) ytPlayer.stopVideo();
}

function updateQuizTime(seconds) {
    $('playerTimeCurrent').textContent = formatTime(Math.min(Math.max(seconds || 0, 0), 30)).padStart(5, '0');
}

function startQuizProgress() {
    stopQuizProgress();
    const duration = 30; // quiz clips are 30 seconds
    quizProgressInterval = setInterval(() => {
        if (!ytPlayer || !ytPlayer.getCurrentTime) return;
        const t = ytPlayer.getCurrentTime();
        progressFill.style.width = Math.min(t / duration * 100, 100) + '%';
        updateQuizTime(t);
    }, 250);
}

function stopQuizProgress() {
    if (quizProgressInterval) { clearInterval(quizProgressInterval); quizProgressInterval = null; }
}

audio.onended = () => {
    if (fpUseAudio) {
        // Full player iTunes mode — update detail player UI
        stopFpAudioProgress();
        $('fpPlayIcon').innerHTML = '<path d="M8 5v14l11-7z"/>';
        $('fpWave')?.classList.remove('active');
        $('fpProgressFill').style.width = '0%';
        $('fpProgressDot').style.left = '0%';
        $('fpCurrent').textContent = '0:00';
        return;
    }
    gameState.isPlaying = false;
    if (!musicUseAudio && !quizYT.active && !gameState.isLocked && gameState.mediaState === 'playing') {
        setQuizMediaState('ready', `试听结束 · ${sourceLabel(gameState.lastAudioResult?.source)}`);
    }
    $('visualizer').classList.add('hidden');
    $('playIcon').innerHTML = '<path d="M8 5v14l11-7z"/>';
};
audio.ontimeupdate = () => {
    if (!audio.duration) return;
    const lastResult = gameState.lastAudioResult;
    const duration = (lastResult && lastResult.source === 'bilibili') ? 30 : audio.duration;
    progressFill.style.width = (audio.currentTime / duration * 100) + '%';
    if (!fpUseAudio && !musicUseAudio && !gameState.isLocked) updateQuizTime(audio.currentTime);
    // B站 quiz clip → stop at 30s (skip for detail modal full player)
    if (lastResult && lastResult.source === 'bilibili' && !fpUseAudio && audio.currentTime >= 30) {
        audio.pause();
        gameState.isPlaying = false;
        setQuizMediaState('ready', '试听结束 · B站源');
        $('visualizer').classList.add('hidden');
        $('playIcon').innerHTML = '<path d="M8 5v14l11-7z"/>';
    }
};
let audioRetryCount = 0;
audio.oncanplay = () => {
    if (fpUseAudio || musicUseAudio || quizYT.active || gameState.isLocked || gameState.mediaState !== 'buffering') return;
    setQuizMediaState('ready', `音频已就绪 · ${sourceLabel(gameState.lastAudioResult?.source)}`);
};
audio.onstalled = () => {
    if (fpUseAudio || musicUseAudio || quizYT.active || gameState.isLocked) return;
    if (gameState.mediaState === 'buffering') recoverQuestionAudio('音频连接停滞');
};
audio.onerror = () => {
    if (fpUseAudio || musicUseAudio) {
        notify(musicUseAudio || gameState.lastAudioResult?.source === 'bilibili'
            ? '呜喵~ B站音频加载失败了，检查本地代理是否在运行（双击「启动B站代理.bat」）~'
            : '呜喵~ 歌曲音频加载失败了，请稍后重试~');
        return;
    }
    if (quizYT.active || !gameState.currentSong) return;
    audioRetryCount++;
    gameState.isPlaying = false;
    $('visualizer').classList.add('hidden');
    $('playIcon').innerHTML = '<path d="M8 5v14l11-7z"/>';
    recoverQuestionAudio('音频加载失败');
};
$('volSlider').oninput = e => { setPlayerVolume(e.target.value); };

// =====================================================================
// Game End
// =====================================================================
function endGame() {
    $('endModal').classList.add('show');
    const answeredTotal = gameState.answerHistory.length;

    if (gameState.mode === 'pk') {
        const win = gameState.score > gameState.opponentScore;
        const draw = gameState.score === gameState.opponentScore;
        $('endEmoji').textContent = win ? '👑' : draw ? '🤝' : '💀';
        $('endTitle').textContent = win ? '你赢了！' : draw ? '平局' : '你输了...';
        $('endScore').textContent = `${gameState.score} : ${gameState.opponentScore}`;
        $('endDesc').textContent = win ? '二次元之神就是你！' : '再接再厉！';
        if (win) spawnCelebration();
    } else {
        const total = answeredTotal;
        const pct = total > 0 ? gameState.correctCount / total * 100 : 0;
        $('endEmoji').textContent = pct >= 80 ? '🏆' : pct >= 50 ? '🎉' : '💪';
        $('endTitle').textContent = '挑战完成';
        $('endScore').textContent = `${gameState.correctCount} / ${total}`;
        $('endDesc').textContent = pct >= 80 ? '太强了！二次元之神！' : pct >= 50 ? '不错哦！继续加油！' : '加油！多听几首番剧曲吧~';
        if (pct >= 50) spawnCelebration();
    }
    const skippedTotal = gameState.playlist.length - answeredTotal;
    $('endDetail').textContent = `连击 ${gameState.maxCombo} · 答对 ${gameState.correctCount}/${answeredTotal}`
        + (skippedTotal > 0 ? ` · 音频不可用 ${skippedTotal} 题` : '');

    const recs = JSON.parse(localStorage.getItem('aq_rec') || '[]');
    recs.push({
        s: gameState.score,
        m: gameState.mode,
        g: gameState.gameMode,
        c: gameState.maxCombo,
        r: gameState.correctCount,
        n: answeredTotal,
        t: new Date().toLocaleDateString('zh-CN')
    });
    recs.sort((a, b) => (b.r || 0) - (a.r || 0));
    localStorage.setItem('aq_rec', JSON.stringify(recs.slice(0, 50)));
}

function restartGame() {
    $('endModal').classList.remove('show');
    if (gameState.mode === 'single') {
        if (gameState.practiceMode) startMistakePractice();
        else startMode(gameState.gameMode);
    }
    else showView('menu');
}

function closeDetailModal() {
    detailRequestId++;
    stopFullPlayer();
    $('animeDetailModal').classList.remove('show');
    detailReturnFocus?.focus();
    detailReturnFocus = null;
}

function nextQuestion() {
    closeDetailModal();
    if (gameState.viewingHistory) {
        gameState.questionIndex++;
        if (gameState.questionIndex >= gameState.answerHistory.length) {
            gameState.viewingHistory = false;
            gameState.questionIndex = gameState.answerHistory.length;
        }
        loadQuestion();
    } else {
        gameState.questionIndex++;
        loadQuestion();
    }
}

function prevQuestion() {
    if (gameState.answerHistory.length === 0) return;
    if (!gameState.viewingHistory && gameState.questionIndex === 0) return;
    gameState.viewingHistory = true;
    closeDetailModal();
    gameState.questionIndex--;
    if (gameState.questionIndex < 0) gameState.questionIndex = 0;
    loadQuestion();
}

function updateNavButtons() {
    const prevBtn = $('prevQuestionBtn');
    const nextBtn = $('nextQuestionBtn');
    // Show prev when not on first question
    if (prevBtn) prevBtn.style.display = gameState.questionIndex > 0 ? '' : 'none';
    // Show next when: in review mode, OR answered current question and not on last question
    const hasMore = gameState.questionIndex < gameState.playlist.length;
    if (nextBtn) nextBtn.style.display = (gameState.viewingHistory || (gameState.isLocked && hasMore)) ? '' : 'none';
}

function renderHistoryOptions(record) {
    const grid = $('optionsGrid');
    grid.innerHTML = '';
    const options = record.options || [animeLabel(record.song)];
    const correctValue = record.correctValue || animeLabel(record.song);
    options.forEach((opt, i) => {
        const btn = document.createElement('button');
        btn.className = 'opt-btn';
        btn.textContent = opt;
        btn.dataset.key = i + 1;
        btn.style.animationDelay = (i * 0.06) + 's';
        if (opt === correctValue) btn.classList.add('correct');
        else if (opt === record.selected && !record.isCorrect) btn.classList.add('wrong');
        grid.appendChild(btn);
    });
}

// =====================================================================
// Leaderboard
// =====================================================================
function renderLeaderboard() {
    const recs = JSON.parse(localStorage.getItem('aq_rec') || '[]');
    const list = $('recordsList');
    if (!recs.length) {
        list.innerHTML = '<p class="empty-state"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-4px;margin-right:4px;"><path d="M18 8h1a4 4 0 0 1 0 8h-1"/><path d="M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8z"/><line x1="6" y1="1" x2="6" y2="4"/><line x1="10" y1="1" x2="10" y2="4"/><line x1="14" y1="1" x2="14" y2="4"/></svg>排行榜空空如也喵~ 快来挑战一下证明实力吧！</p>';
        return;
    }
    const medals = ['🥇', '🥈', '🥉'];
    list.innerHTML = recs.slice(0, 10).map((r, i) => `
        <div class="record-item">
            <div class="record-rank">${i < 3 ? medals[i] : (i + 1)}</div>
            <div class="record-info">
                <div class="record-score">✓ ${r.r || 0}${r.n ? '/' + r.n : ''}</div>
                <div class="record-meta">${recordModeLabel(r)} · ${r.t}</div>
            </div>
            <div class="record-detail">🔥${r.c}</div>
        </div>
    `).join('');
}

function recordModeLabel(r) {
    if (r.m === 'pk') return '⚔️ PK';
    return ({ anime: '🎮 猜番剧', song: '🎵 猜歌名', artist: '🎤 猜歌手', mixed: '🔀 混合' })[r.g || 'anime'] || '🎮 单人';
}

let clearingRecords = false;
function clearRecords() {
    if (clearingRecords) return;
    if (!confirm('确定清除所有本地排行榜记录吗？')) return;
    clearingRecords = true;
    localStorage.removeItem('aq_rec');
    renderLeaderboard();
    notify('记录已清除啦喵~');
    setTimeout(() => { clearingRecords = false; }, 500);
}

// =====================================================================
// Utility
// =====================================================================
function shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
}

// =====================================================================
// Filter UI
// =====================================================================
function initFilters() {
    // Type chips (multi-select)
    const typeOptions = [
        { label: 'OP', value: 'OP' },
        { label: 'ED', value: 'ED' },
        { label: '插曲', value: 'IN' },
    ];
    const typeChips = $('typeChips');
    const typeAllBtn = document.createElement('button');
    typeAllBtn.className = 'settings-chip active';
    typeAllBtn.textContent = '全部';
    typeAllBtn.addEventListener('click', () => {
        typeChips.querySelectorAll('.settings-chip').forEach(c => c.classList.remove('active'));
        typeAllBtn.classList.add('active');
        filterState.types.clear();
        updateFilterCount();
    });
    typeChips.appendChild(typeAllBtn);
    typeOptions.forEach(t => {
        const btn = document.createElement('button');
        btn.className = 'settings-chip';
        btn.textContent = t.label;
        btn.addEventListener('click', () => {
            if (filterState.types.has(t.value)) {
                filterState.types.delete(t.value);
                btn.classList.remove('active');
            } else {
                filterState.types.add(t.value);
                btn.classList.add('active');
            }
            if (filterState.types.size === 0) {
                typeAllBtn.classList.add('active');
            } else {
                typeAllBtn.classList.remove('active');
            }
            updateFilterCount();
        });
        typeChips.appendChild(btn);
    });

    updateFilterCount();
}

let lastOfficialSource = 'builtin';
function setSourceFilter(source) {
    filterState.source = source;
    if (source && source !== 'custom' && source !== 'mix') lastOfficialSource = source;
    try { localStorage.setItem('song_source_mode_v1', source === 'mix' ? 'mix' : 'single'); } catch {}
    if (source?.startsWith('season:')) selectedLibrarySeason = source.slice(7);
    renderSourceFilter();
    updateFilterCount();
}
function renderSourceFilter() {
    const selected = sourceSelection(filterState.source);
    $('officialSourceGroup').classList.toggle('hidden', selected.group !== 'official');
    $('mixSourceGroup').classList.toggle('hidden', selected.group !== 'mix');
    $('seasonSourceChips').classList.toggle('hidden', selected.official !== 'season' || selected.group !== 'official');
    document.querySelectorAll('[data-source-group]').forEach(button => {
        const active = button.dataset.sourceGroup === selected.group;
        button.classList.toggle('active', active);
        button.setAttribute('aria-pressed', String(active));
    });
    document.querySelectorAll('[data-official-source]').forEach(button => {
        const active = button.dataset.officialSource === selected.official;
        button.classList.toggle('active', active);
        button.setAttribute('aria-pressed', String(active));
    });
    document.querySelectorAll('[data-source^="season:"]').forEach(button => {
        const active = button.dataset.source === filterState.source;
        button.classList.toggle('active', active);
        button.setAttribute('aria-pressed', String(active));
    });
    document.querySelectorAll('[data-mix-source]').forEach(input => {
        const key = input.dataset.mixSource;
        input.checked = key.startsWith('season:') ? filterState.mix.seasons.includes(key.slice(7)) : !!filterState.mix[key];
    });
}
function initSourceFilter() {
    const primary = [
        { label: '全部歌曲', group: 'all' },
        { label: '官方曲库', group: 'official' },
        { label: '我的导入', group: 'custom' },
        { label: '自由组合', group: 'mix' }
    ];
    $('sourceChips').innerHTML = primary.map(option => `<button type="button" class="settings-chip" data-source-group="${option.group}">${option.label}</button>`).join('');
    $('officialSourceChips').innerHTML = [
        { label: '全部官方', official: 'all' },
        { label: '原有曲库', official: 'legacy' },
        { label: '季度新番', official: 'season' }
    ].map(option => `<button type="button" class="settings-chip" data-official-source="${option.official}">${option.label}</button>`).join('');
    const seasons = Object.keys(SEASONAL_POOLS).sort().reverse().filter(key => SEASONAL_POOLS[key].length === 30);
    $('seasonSourceChips').innerHTML = seasons.map(key => `<button type="button" class="settings-chip" data-source="season:${key}">${key.slice(0, 4)} 年 ${Number(key.slice(5))} 月</button>`).join('');
    $('mixSourceGroup').innerHTML = [
        { key: 'legacy', label: '原有曲库' },
        ...seasons.map(key => ({ key: `season:${key}`, label: `${key.slice(0, 4)} 年 ${Number(key.slice(5))} 月新番` })),
        { key: 'imported', label: '我的导入（含 Bangumi）' },
        { key: 'watched', label: '我的追番歌曲' },
        { key: 'selected', label: '我挑选的歌曲' }
    ].map(option => `<label class="library-watch-filter mix-source-option"><input type="checkbox" data-mix-source="${option.key}">${option.label}</label>`).join('');
    $('sourceChips').addEventListener('click', event => {
        const group = event.target.closest('[data-source-group]')?.dataset.sourceGroup;
        if (!group) return;
        setSourceFilter(group === 'official' ? lastOfficialSource : sourceFromSelection({ group }));
    });
    $('officialSourceChips').addEventListener('click', event => {
        const official = event.target.closest('[data-official-source]')?.dataset.officialSource;
        if (!official) return;
        const previousSeason = sourceSelection(lastOfficialSource).season;
        setSourceFilter(sourceFromSelection({ group: 'official', official, season: previousSeason || seasons[0] }));
    });
    $('seasonSourceChips').addEventListener('click', event => {
        const source = event.target.closest('[data-source]')?.dataset.source;
        if (source) setSourceFilter(source);
    });
    $('mixSourceGroup').addEventListener('change', event => {
        const key = event.target.dataset.mixSource;
        if (!key) return;
        if (key.startsWith('season:')) {
            const season = key.slice(7);
            filterState.mix.seasons = event.target.checked
                ? [...new Set([...filterState.mix.seasons, season])]
                : filterState.mix.seasons.filter(value => value !== season);
        } else filterState.mix[key] = event.target.checked;
        try { localStorage.setItem(SOURCE_MIX_KEY, JSON.stringify(filterState.mix)); } catch {}
        updateFilterCount();
    });
    renderSourceFilter();
}

// =====================================================================
// Personal Library (local single-player data only)
// =====================================================================
const publishedSeasons = Object.keys(SEASONAL_POOLS).filter(key => SEASONAL_POOLS[key].length === 30).sort().reverse();
let selectedLibrarySeason = publishedSeasons[0] || null;
let selectedLibraryTab = 'current';
let feedbackTargetSong = null;
const libraryPreviewSession = createPreviewSession();
let libraryPreviewState = 'idle';
let libraryPreviewSong = null;
let libraryPreviewSource = '';
let libraryPreviewVideo = '';
let libraryPreviewUrl = '';
let libraryPreviewResult = null;
let libraryPreviewRecovering = false;
let libraryPreviewRetryCount = 0;
let libraryPreviewTimer = null;
const libraryPreviewFailedSources = new Set();
const libraryPreviewFailedVideos = { yt: new Set(), bili: new Set() };

function updateLibraryTrackStatus(song) {
    const status = trackPlaybackStatus(song);
    document.querySelectorAll('[data-track-status-key]').forEach(element => {
        if (element.dataset.trackStatusKey !== trackKey(song)) return;
        element.textContent = status.label;
        element.classList.toggle('played', status.className === 'played');
        element.classList.toggle('failed', status.className === 'failed');
    });
}

function updateLibraryPreviewUI() {
    const key = libraryPreviewSession.activeKey;
    $('libraryPreviewBanner').classList.toggle('hidden', !key);
    if (!key) return;
    const title = libraryPreviewSong?.titleCN || libraryPreviewSong?.title || '歌曲';
    const labels = {
        searching: `正在搜索「${title}」…`, loading: `正在加载「${title}」…`,
        switching: `当前音源不可播，正在为「${title}」换源…`,
        playing: `正在试听「${title}」 · ${sourceLabel(libraryPreviewSource)}`,
        paused: `已暂停「${title}」`, ended: `试听结束 · ${title}`,
        ready: `「${title}」已就绪，点击试听按钮播放`,
        failed: `「${title}」暂时无法播放，可反馈音源问题`
    };
    $('libraryPreviewStatus').textContent = labels[libraryPreviewState] || title;
    const link = $('libraryPreviewLink');
    link.classList.toggle('hidden', !libraryPreviewVideo);
    if (libraryPreviewVideo) link.href = libraryPreviewVideo;
    document.querySelectorAll('[data-action="previewSong"]').forEach(button => {
        const active = button.dataset.songKey === key;
        button.setAttribute('aria-pressed', String(active && libraryPreviewState === 'playing'));
        button.textContent = !active ? '试听' : ({ searching: '取消', loading: '加载中', switching: '换源中', playing: '暂停', paused: '继续', ended: '重听', ready: '播放', failed: '重试' })[libraryPreviewState] || '试听';
    });
}

function stopLibraryPreview() {
    libraryPreviewSession.stop();
    const player = $('libraryPreviewAudio');
    player.pause();
    player.removeAttribute('src');
    if (libraryPreviewResult?.source === 'youtube') ytPlayer?.pauseVideo?.();
    clearTimeout(libraryPreviewTimer);
    libraryPreviewTimer = null;
    libraryPreviewSong = null;
    libraryPreviewSource = '';
    libraryPreviewVideo = '';
    libraryPreviewUrl = '';
    libraryPreviewResult = null;
    libraryPreviewRecovering = false;
    libraryPreviewRetryCount = 0;
    libraryPreviewFailedSources.clear();
    libraryPreviewFailedVideos.yt.clear();
    libraryPreviewFailedVideos.bili.clear();
    libraryPreviewState = 'idle';
    $('libraryPreviewBanner').classList.add('hidden');
    document.querySelectorAll('[data-action="previewSong"]').forEach(button => { button.textContent = '试听'; button.setAttribute('aria-pressed', 'false'); });
}

async function prepareLibraryPreviewAudio(result, token) {
    if (!libraryPreviewSession.isCurrent(token)) return;
    libraryPreviewResult = result;
    libraryPreviewSource = result.source || '';
    libraryPreviewUrl = result.url;
    libraryPreviewVideo = result.source === 'youtube'
        ? `https://www.youtube.com/watch?v=${encodeURIComponent(result.ytVideoId)}` : '';
    libraryPreviewState = 'loading';
    updateLibraryPreviewUI();
    if (result.source === 'youtube') {
        try { await ensureYouTubeAPI(); }
        catch { if (libraryPreviewSession.isCurrent(token)) await recoverLibraryPreviewAudio('YouTube播放器不可用'); return; }
        if (!libraryPreviewSession.isCurrent(token)) return;
        ytPlayer.loadVideoById({ videoId: result.ytVideoId, startSeconds: 0 });
        clearTimeout(libraryPreviewTimer);
        libraryPreviewTimer = setTimeout(() => {
            if (libraryPreviewSession.isCurrent(token) && libraryPreviewState === 'loading') {
                libraryPreviewState = 'ready';
                updateLibraryPreviewUI();
            }
        }, 12000);
        return;
    }
    const player = $('libraryPreviewAudio');
    player.src = result.url;
    player.volume = (volumeMuted ? 0 : playerVolume) / 100;
    try { await player.play(); }
    catch (error) {
        if (!libraryPreviewSession.isCurrent(token) || libraryPreviewRecovering) return;
        if (error?.name === 'NotAllowedError') libraryPreviewState = 'ready';
        else if (error?.name !== 'AbortError') return recoverLibraryPreviewAudio('音频无法播放');
        updateLibraryPreviewUI();
    }
}

async function recoverLibraryPreviewAudio(reason) {
    if (!libraryPreviewSong || libraryPreviewRecovering || !libraryPreviewSession.activeKey) return;
    libraryPreviewRecovering = true;
    clearTimeout(libraryPreviewTimer);
    const song = libraryPreviewSong;
    const token = libraryPreviewSession.start(trackKey(song));
    const failed = libraryPreviewResult;
    if (failed?.source === 'youtube' && failed.ytVideoId) libraryPreviewFailedVideos.yt.add(failed.ytVideoId);
    else if (failed?.source === 'bilibili' && failed.bvid) libraryPreviewFailedVideos.bili.add(failed.bvid);
    else if (failed?.source) libraryPreviewFailedSources.add(failed.source);
    if (failed?.source === 'youtube') ytPlayer?.pauseVideo?.();
    $('libraryPreviewAudio').pause();
    forgetResolvedAudio(song);
    recordLocalAudioCheck(song, 'failed', failed?.source || audioSourcePref);
    updateLibraryTrackStatus(song);
    libraryPreviewState = 'switching';
    updateLibraryPreviewUI();
    let result = null;
    if (++libraryPreviewRetryCount <= 5) {
        try {
            result = await fetchAudioInner(song.title, song.artist, song.anime, `${song.title}|${song.anime}`,
                libraryPreviewFailedSources, song.type || '', audioSourcePref, libraryPreviewFailedVideos);
        } catch (error) { console.warn('[Library] preview recovery failed:', reason, error); }
    }
    if (!libraryPreviewSession.isCurrent(token)) return;
    libraryPreviewRecovering = false;
    if (!result?.url) {
        libraryPreviewState = 'failed';
        updateLibraryPreviewUI();
        return;
    }
    rememberResolvedAudio(song, result);
    await prepareLibraryPreviewAudio(result, token);
}

async function playLibraryPreview(song) {
    if (!song) { notify('这首歌已不在当前曲库中'); return; }
    const key = trackKey(song);
    const player = $('libraryPreviewAudio');
    if (libraryPreviewSession.activeKey === key) {
        if (['searching', 'loading', 'switching'].includes(libraryPreviewState)) { stopLibraryPreview(); return; }
        if (libraryPreviewState === 'playing') {
            if (libraryPreviewSource === 'youtube') ytPlayer?.pauseVideo?.();
            else player.pause();
            libraryPreviewState = 'paused'; updateLibraryPreviewUI(); return;
        }
        if (libraryPreviewSource === 'youtube' && ['paused', 'ended', 'ready'].includes(libraryPreviewState)) {
            if (!ytReady || !ytPlayer) { notify('YouTube 播放器仍在加载，请稍后重试'); return; }
            if (libraryPreviewState === 'ended') ytPlayer.loadVideoById({ videoId: libraryPreviewResult.ytVideoId, startSeconds: 0 });
            else if (libraryPreviewState === 'ready') ytPlayer.loadVideoById({ videoId: libraryPreviewResult.ytVideoId, startSeconds: 0 });
            else ytPlayer.playVideo();
            libraryPreviewState = 'loading'; updateLibraryPreviewUI(); return;
        }
        if (player.src && ['paused', 'ended', 'ready'].includes(libraryPreviewState)) {
            if (libraryPreviewState === 'ended') player.currentTime = 0;
            try { await player.play(); } catch { libraryPreviewState = 'ready'; updateLibraryPreviewUI(); }
            return;
        }
    }
    stopLibraryPreview();
    libraryPreviewSong = song;
    libraryPreviewState = 'searching';
    const token = libraryPreviewSession.start(key);
    updateLibraryPreviewUI();
    try {
        const result = await fetchAudio(song.title, song.artist, song.anime, song.type);
        if (!libraryPreviewSession.isCurrent(token)) return;
        if (!result?.url) throw new Error('No audio source');
        await prepareLibraryPreviewAudio(result, token);
    } catch {
        if (!libraryPreviewSession.isCurrent(token)) return;
        libraryPreviewState = 'failed';
        recordLocalAudioCheck(song, 'failed', audioSourcePref || 'default');
        updateLibraryTrackStatus(song);
        updateLibraryPreviewUI();
    }
}

function catalogAnime() {
    const byKey = new Map();
    for (const song of getAllSongs()) {
        const key = animeKey(song);
        if (!byKey.has(key)) byKey.set(key, {
            key, title: animeLabel(song), originalTitle: song.animeNative || song.anime,
            song
        });
    }
    return [...byKey.values()];
}

function findCatalogSong(key) { return getAllSongs().find(song => trackKey(song) === key) || null; }
function seasonLabel(key) { return `${key.slice(0, 4)} 年 ${Number(key.slice(5))} 月`; }
function watchButton(key) {
    const watched = watchedAnimeKeys.includes(key);
    return `<button type="button" class="library-watch-btn${watched ? ' active' : ''}" data-action="toggleWatchedAnime" data-value="${escapeHTML(key)}" aria-pressed="${watched}">${watched ? '✓ 已追' : '+ 加入追番'}</button>`;
}
function animeNativeLabel(anime) {
    return anime.originalTitle && anime.originalTitle !== anime.title
        ? `<div class="library-anime-native">${escapeHTML(anime.originalTitle)}</div>` : '';
}
function trackPlaybackStatus(song) {
    const record = audioChecks.find(entry => entry.key === trackKey(song));
    if (!record) return { label: '待试听', className: '' };
    if (record.status === 'played') return { label: `上次可播${record.source ? ' · ' + sourceLabel(record.source) : ''}`, className: 'played' };
    return { label: '上次失败', className: 'failed' };
}
const libraryPages = { current: 0, tracks: 0, season: 0, bangumi: 0, watch: 0 };
const LIBRARY_PAGE_SIZE = 12;
const libraryCoverCache = new Map();
const libraryCoverRequests = new Map();
let libraryCoverObserver = null;
function libraryCoverCard(anime) {
    const posterSongKey = trackKey(anime.song);
    return `<article class="library-cover-card">
        <div class="library-cover-main">
            <div class="library-poster" data-cover-song-key="${escapeHTML(posterSongKey)}"><img alt="" loading="lazy" decoding="async"><span aria-hidden="true">${escapeHTML((anime.title || '♪').slice(0, 1))}</span></div>
            <div class="library-cover-heading"><h3>${escapeHTML(anime.title)}</h3>${animeNativeLabel(anime)}
                <div class="library-cover-count">${anime.tracks.length} 首歌曲${anime.song.season ? ` · ${seasonLabel(anime.song.season)}` : ''}</div>
                ${watchButton(anime.key)}
            </div>
        </div>
        <div class="library-cover-tracks">${anime.tracks.map(song => {
            const key = trackKey(song);
            const status = trackPlaybackStatus(song);
            const selected = selectedSongKeys.includes(key);
            return `<div class="library-cover-track">
                <div class="library-cover-track-name"><span class="library-track-type">${escapeHTML(song.type || '曲目')}</span><strong>${escapeHTML(song.titleCN || song.title)}</strong><small>${escapeHTML(song.artist || '')}</small><span class="library-track-status ${status.className}" data-track-status-key="${escapeHTML(key)}">${escapeHTML(status.label)}</span></div>
                <div class="library-cover-actions"><button type="button" class="library-mini-btn library-preview-btn" data-action="previewSong" data-song-key="${escapeHTML(key)}" aria-label="试听 ${escapeHTML(song.titleCN || song.title)}">试听</button>
                    <button type="button" class="library-mini-btn library-add-btn${selected ? ' active' : ''}" data-action="toggleSelectedSong" data-song-key="${escapeHTML(key)}" aria-pressed="${selected}" aria-label="${selected ? '移出我的选歌' : '添加到我的选歌'}：${escapeHTML(song.titleCN || song.title)}">${selected ? '✓ 已添加' : '+ 添加'}</button>
                    <button type="button" class="library-mini-btn" data-action="reportSong" data-song-key="${escapeHTML(key)}" aria-label="反馈 ${escapeHTML(song.titleCN || song.title)}">反馈</button></div>
            </div>`;
        }).join('')}</div>
    </article>`;
}
function renderLibraryCoverGrid(id, groups, tab, emptyMessage) {
    const totalPages = Math.max(1, Math.ceil(groups.length / LIBRARY_PAGE_SIZE));
    libraryPages[tab] = Math.min(libraryPages[tab] || 0, totalPages - 1);
    const page = libraryPages[tab];
    const visible = groups.slice(page * LIBRARY_PAGE_SIZE, (page + 1) * LIBRARY_PAGE_SIZE);
    const pager = totalPages > 1 ? `<nav class="library-cover-pager" aria-label="番剧分页">
        <button type="button" class="library-mini-btn" data-action="libraryPage" data-value="${tab}:${page - 1}" ${page === 0 ? 'disabled' : ''}>上一页</button>
        <span>第 ${page + 1} / ${totalPages} 页 · 共 ${groups.length} 部</span>
        <button type="button" class="library-mini-btn" data-action="libraryPage" data-value="${tab}:${page + 1}" ${page === totalPages - 1 ? 'disabled' : ''}>下一页</button>
    </nav>` : '';
    $(id).innerHTML = visible.length ? visible.map(libraryCoverCard).join('') + pager : `<div class="library-empty">${escapeHTML(emptyMessage)}</div>`;
    observeLibraryCovers($(id));
    updateLibraryPreviewUI();
}
function observeLibraryCovers(root) {
    if (!libraryCoverObserver && 'IntersectionObserver' in window) {
        libraryCoverObserver = new IntersectionObserver(entries => {
            for (const entry of entries) {
                if (!entry.isIntersecting) continue;
                libraryCoverObserver.unobserve(entry.target);
                loadLibraryCover(entry.target);
            }
        }, { rootMargin: '120px' });
    }
    root.querySelectorAll('[data-cover-song-key]').forEach(poster => {
        if (libraryCoverObserver) libraryCoverObserver.observe(poster);
        else loadLibraryCover(poster);
    });
}
async function loadLibraryCover(poster) {
    const song = findCatalogSong(poster.dataset.coverSongKey);
    if (!song) return;
    const key = animeKey(song);
    if (!libraryCoverRequests.has(key)) libraryCoverRequests.set(key, findLibraryCover(song));
    const url = await libraryCoverRequests.get(key);
    if (!poster.isConnected || !url) return;
    const image = poster.querySelector('img');
    image.onload = () => { poster.classList.add('has-image'); };
    image.onerror = () => { poster.classList.remove('has-image'); };
    image.src = url;
}
async function findLibraryCover(song) {
    const key = animeKey(song);
    if (libraryCoverCache.has(key)) return libraryCoverCache.get(key);
    let image = /^https:\/\//i.test(song.coverImage || '') ? song.coverImage : '';
    if (!image && song.anilistId) image = SEASONAL_COVERS[song.anilistId] || '';
    if (!image && song.anilistId) {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), ANILIST_TIMEOUT);
        try {
            const response = await fetch('https://graphql.anilist.co', { method: 'POST',
                headers: { 'Content-Type': 'application/json' }, signal: controller.signal,
                body: JSON.stringify({ query: 'query ($id: Int) { Media(id: $id, type: ANIME) { coverImage { large } } }', variables: { id: Number(song.anilistId) } }) });
            if (response.ok) image = (await response.json()).data?.Media?.coverImage?.large || '';
        } catch {} finally { clearTimeout(timer); }
    }
    if (!image) image = (await searchAniList(song.animeNative || song.anime))?.coverImage?.large || '';
    if (!image) {
        const matches = await searchBangumi(animeLabel(song));
        const match = pickBestBGMResult(matches, animeLabel(song));
        if (isHighConfidenceMatch(match, animeLabel(song))) image = match.images?.large || '';
    }
    image = /^https:\/\//i.test(image) ? image : '';
    libraryCoverCache.set(key, image);
    return image;
}
function renderCurrentLibrary() {
    const pool = uniqueChallengePool(getFilteredSongs());
    const matches = searchLibraryTracks(pool, $('libraryCurrentSearch').value);
    const groups = groupLibrarySongs(matches, animeKey);
    $('libraryCurrentSummary').textContent = `当前可出 ${pool.length} 首 · 搜索找到 ${groups.length} 部番剧 / ${matches.length} 首歌曲`;
    renderLibraryCoverGrid('libraryCurrentResults', groups, 'current', '当前曲库没有匹配的歌曲。可以清除搜索词，或点击“添加歌曲 / 更换曲库”。');
}
function renderTracksLibrary() {
    const matches = searchLibraryTracks(getAllSongs(), $('libraryTrackSearch').value);
    const groups = groupLibrarySongs(matches, animeKey);
    $('libraryTrackSummary').textContent = `找到 ${groups.length} 部番剧 / ${matches.length} 首歌曲 · 已添加 ${selectedSongKeys.length} 首到我的选歌`;
    renderLibraryCoverGrid('libraryTrackResults', groups, 'tracks', '没有找到对应歌曲，试试更短的歌名、番剧名或歌手');
}
function renderSeasonLibrary() {
    const tabs = $('librarySeasonTabs');
    if (!selectedLibrarySeason) {
        tabs.innerHTML = '';
        $('librarySeasonSummary').textContent = '暂无已发布的季度曲库';
        $('librarySeasonAnime').innerHTML = '';
        return;
    }
    tabs.innerHTML = publishedSeasons.map(key => `<button type="button" class="library-season-tab${key === selectedLibrarySeason ? ' active' : ''}" data-action="selectLibrarySeason" data-value="${key}">${seasonLabel(key)}</button>`).join('');
    const songs = SEASONAL_POOLS[selectedLibrarySeason];
    const groups = groupLibrarySongs(songs, animeKey);
    const query = ($('librarySeasonSearch').value || '').normalize('NFKC').trim().toLowerCase();
    const visibleGroups = groups.filter(anime => !query || [anime.title, anime.originalTitle,
        ...anime.tracks.flatMap(song => [song.title, song.titleCN, song.artist])]
        .join(' ').normalize('NFKC').toLowerCase().includes(query));
    const played = songs.filter(song => audioChecks.some(entry => entry.key === trackKey(song) && entry.status === 'played')).length;
    const failed = songs.filter(song => audioChecks.some(entry => entry.key === trackKey(song) && entry.status === 'failed')).length;
    const eligible = filterWatchedSongs(songs.filter(song => !filterState.types.size || filterState.types.has(song.type)), watchedAnimeKeys, filterState.watchedOnly).length;
    $('librarySeasonSummary').textContent = `${groups.length} 部番剧 · ${songs.filter(song => song.type === 'OP').length} 首 OP · ${songs.filter(song => song.type === 'ED').length} 首 ED · 当前筛选可出 ${eligible} 题${query ? ` · 搜索找到 ${visibleGroups.length} 部` : ''} · 本机上次可播 ${played} 首 / 失败 ${failed} 首`;
    renderLibraryCoverGrid('librarySeasonAnime', visibleGroups, 'season', '没有找到本季曲目，试试番剧名、歌名或歌手');
}

function getBangumiSongs() {
    return getCustomSongs().filter(song => song.origin === 'bangumi' || song._importScore !== undefined);
}
function renderBangumiLibrary() {
    const songs = getBangumiSongs();
    const query = ($('libraryBangumiSearch').value || '').normalize('NFKC').trim().toLowerCase();
    const groups = groupLibrarySongs(songs, animeKey);
    const visible = groups.filter(group => !query || [group.title, group.originalTitle,
        ...group.tracks.flatMap(song => [song.title, song.titleCN, song.artist])]
        .join(' ').normalize('NFKC').toLowerCase().includes(query));
    const eligible = filterWatchedSongs(songs.filter(song => !filterState.types.size || filterState.types.has(song.type)), watchedAnimeKeys, filterState.watchedOnly);
    $('libraryBangumiSummary').textContent = `${groups.length} 部番剧 · ${songs.length} 首歌曲 · 当前类型和追番筛选可出 ${uniqueChallengePool(eligible).length} 题${query ? ` · 搜索找到 ${visible.length} 部` : ''}`;
    document.querySelector('[data-action="startBangumiSongs"]').disabled = eligible.length === 0;
    renderLibraryCoverGrid('libraryBangumiAnime', visible, 'bangumi', '还没有导入歌曲。点击「继续导入」添加 Bangumi 目录，或试试其他关键词。');
}
function startBangumiSongs() {
    const songs = filterWatchedSongs(getBangumiSongs().filter(song => !filterState.types.size || filterState.types.has(song.type)), watchedAnimeKeys, filterState.watchedOnly);
    if (!songs.length) { notify('当前筛选下没有 Bangumi 导入歌曲'); return; }
    startMode('anime', songs, 'Bangumi 导入');
}

function renderWatchLibrary() {
    const query = ($('libraryAnimeSearch').value || '').normalize('NFKC').trim().toLowerCase();
    const catalog = groupLibrarySongs(getAllSongs(), animeKey).sort((a, b) => {
        const watchedDifference = Number(watchedAnimeKeys.includes(b.key)) - Number(watchedAnimeKeys.includes(a.key));
        return watchedDifference || a.title.localeCompare(b.title, 'zh-CN');
    });
    const matches = catalog.filter(anime => !query || `${anime.title} ${anime.originalTitle}`.normalize('NFKC').toLowerCase().includes(query));
    $('libraryWatchSummary').textContent = `已追 ${watchedAnimeKeys.length} 部 · 找到 ${matches.length} 部番剧`;
    renderLibraryCoverGrid('libraryWatchResults', matches, 'watch', '没有找到对应番剧，试试原名或更短的关键词');
}

function renderMistakeLibrary() {
    const available = mistakeBook.map(entry => findCatalogSong(entry.key)).filter(Boolean);
    $('libraryMistakeSummary').textContent = `记录 ${mistakeBook.length} 首错题 · 当前可练习 ${available.length} 首；答对后不会自动移出，可手动标记掌握。`;
    document.querySelector('[data-action="practiceMistakes"]').disabled = available.length === 0;
    $('libraryMistakeList').innerHTML = mistakeBook.length ? mistakeBook.map(entry => `
        <article class="library-record-card"><div class="library-record-head">
            <div><div class="library-record-title">${escapeHTML(entry.title || '')}</div><div class="library-record-meta">${escapeHTML(entry.anime || '')} · 错 ${Number(entry.count) || 1} 次 · 上次选了「${escapeHTML(entry.selected || '')}」</div></div>
            <div class="library-record-actions"><button type="button" class="library-mini-btn library-preview-btn" data-action="previewSong" data-song-key="${escapeHTML(entry.key)}">试听</button><button type="button" class="library-mini-btn" data-action="removeMistake" data-value="${escapeHTML(entry.key)}">标记掌握</button></div>
        </div></article>`).join('') : '<div class="library-empty">还没有错题，去挑战一局吧</div>';
}

function renderFeedbackLibrary() {
    const reasonNames = { unplayable: '无法播放', 'wrong-match': '音频匹配错误', metadata: '曲目信息错误' };
    $('libraryFeedbackList').innerHTML = songFeedback.length ? songFeedback.map((entry, index) => `
        <article class="library-record-card"><div class="library-record-head"><div><div class="library-record-title">${escapeHTML(entry.title || '')} · ${escapeHTML(entry.anime || '')}</div><div class="library-record-meta">${reasonNames[entry.reason] || '其他问题'}${entry.note ? ' · ' + escapeHTML(entry.note) : ''}</div></div><button type="button" class="library-mini-btn" data-action="removeFeedback" data-value="${index}">删除</button></div></article>`).join('') : '<div class="library-empty">还没有保存过反馈</div>';
    const failed = audioChecks.filter(entry => entry.status === 'failed').slice(0, 20);
    $('libraryFailedTracks').innerHTML = failed.length ? failed.map(entry => `
        <article class="library-record-card"><div class="library-record-head"><div><div class="library-record-title">${escapeHTML(entry.title || '')}</div><div class="library-record-meta">${escapeHTML(entry.anime || '')} · 上次播放失败</div></div><button type="button" class="library-mini-btn" data-action="reportSong" data-song-key="${escapeHTML(entry.key)}">反馈</button></div></article>`).join('') : '<div class="library-empty">暂无本机播放失败记录</div>';
    document.querySelector('[data-action="copyFeedback"]').disabled = songFeedback.length === 0;
    document.querySelector('[data-action="exportFeedback"]').disabled = songFeedback.length === 0;
}

function renderLibrary() {
    document.querySelectorAll('.library-tab').forEach(tab => {
        const active = tab.dataset.value === selectedLibraryTab;
        tab.classList.toggle('active', active);
        tab.setAttribute('aria-selected', String(active));
    });
    for (const name of ['current', 'tracks', 'season', 'bangumi', 'watch', 'mistakes', 'feedback']) {
        $(`library${name[0].toUpperCase() + name.slice(1)}Panel`).classList.toggle('hidden', name !== selectedLibraryTab);
    }
    if (selectedLibraryTab === 'current') renderCurrentLibrary();
    if (selectedLibraryTab === 'tracks') renderTracksLibrary();
    if (selectedLibraryTab === 'season') renderSeasonLibrary();
    if (selectedLibraryTab === 'bangumi') renderBangumiLibrary();
    if (selectedLibraryTab === 'watch') renderWatchLibrary();
    if (selectedLibraryTab === 'mistakes') renderMistakeLibrary();
    if (selectedLibraryTab === 'feedback') renderFeedbackLibrary();
    updateLibraryPreviewUI();
}

function toggleWatchedAnime(key) {
    watchedAnimeKeys = watchedAnimeKeys.includes(key) ? watchedAnimeKeys.filter(value => value !== key) : [...watchedAnimeKeys, key];
    savePersonalList(PERSONAL_KEYS.watched, watchedAnimeKeys);
    updateFilterCount();
    renderLibrary();
}
function toggleSelectedSong(key) {
    const song = findCatalogSong(key);
    if (!song) { notify('这首歌已不在曲库中'); return; }
    const alreadySelected = selectedSongKeys.includes(key);
    const alreadyInCurrent = getFilteredSongs().some(item => trackKey(item) === key);
    selectedSongKeys = alreadySelected ? selectedSongKeys.filter(item => item !== key) : [...selectedSongKeys, key];
    savePersonalList(PERSONAL_KEYS.selected, selectedSongKeys);
    if (!alreadySelected && !alreadyInCurrent) {
        if (filterState.source !== 'mix') {
            filterState.mix = mixForAddedSong(filterState.source, publishedSeasons);
        } else filterState.mix.selected = true;
        try { localStorage.setItem(SOURCE_MIX_KEY, JSON.stringify(filterState.mix)); } catch {}
        setSourceFilter('mix');
    } else updateFilterCount();
    renderLibrary();
    notify(alreadySelected ? '已移出我的选歌' : alreadyInCurrent ? '已加入我的选歌' : '已加入当前曲库');
}
function useSelectedSongs() {
    if (!selectedSongKeys.length) { notify('先添加想猜的歌曲'); return; }
    filterState.mix = { legacy: false, seasons: [], imported: false, watched: false, selected: true };
    try { localStorage.setItem(SOURCE_MIX_KEY, JSON.stringify(filterState.mix)); } catch {}
    setSourceFilter('mix');
    selectedLibraryTab = 'current';
    renderLibrary();
    notify('当前曲库已切换为我的选歌');
}
function startSelectedSeason() {
    if (!selectedLibrarySeason) return;
    setSourceFilter(`season:${selectedLibrarySeason}`);
    startMode('anime');
}
function startMistakePractice() {
    const keys = new Set(mistakeBook.map(entry => entry.key));
    const songs = getAllSongs().filter(song => keys.has(trackKey(song)));
    if (!songs.length) { notify('错题本里没有可用的歌曲'); return; }
    startMode('anime', songs);
}

let feedbackReturnFocus = null;
function openSongFeedback(song) {
    if (!song) { notify('这首歌已不在当前曲库中'); return; }
    feedbackTargetSong = song;
    feedbackReturnFocus = document.activeElement;
    $('feedbackSongLabel').textContent = `${animeLabel(song)} · ${song.titleCN || song.title}`;
    $('feedbackReason').value = audioChecks.some(entry => entry.key === trackKey(song) && entry.status === 'failed') ? 'unplayable' : 'wrong-match';
    $('feedbackNote').value = '';
    $('feedbackModal').classList.add('show');
    $('feedbackModal').removeAttribute('inert');
    $('feedbackModal').setAttribute('aria-hidden', 'false');
    $('feedbackReason').focus();
}
function closeSongFeedback() {
    $('feedbackModal').classList.remove('show');
    $('feedbackModal').setAttribute('aria-hidden', 'true');
    $('feedbackModal').setAttribute('inert', '');
    feedbackTargetSong = null;
    feedbackReturnFocus?.focus();
    feedbackReturnFocus = null;
}
function saveSongFeedback() {
    if (!feedbackTargetSong) return;
    songFeedback = putFeedback(songFeedback, feedbackTargetSong, $('feedbackReason').value, $('feedbackNote').value);
    savePersonalList(PERSONAL_KEYS.feedback, songFeedback);
    closeSongFeedback();
    if (!$('v-library').classList.contains('hidden')) renderLibrary();
    notify('反馈已保存在本机，可在「我的曲库」复制或导出');
}
async function copySongFeedback() {
    if (!songFeedback.length) return;
    const text = songFeedback.map(entry => `${entry.anime} · ${entry.title} (${entry.type})｜${entry.reason}｜${entry.note || '无补充'}`).join('\n');
    try { await navigator.clipboard.writeText(text); notify('反馈已复制，可以发给维护者'); }
    catch { notify('复制失败，请使用导出 JSON'); }
}
function exportSongFeedback() {
    if (!songFeedback.length) return;
    const blob = new Blob([JSON.stringify(songFeedback, null, 2)], { type: 'application/json' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'anime-song-feedback.json';
    link.click();
    setTimeout(() => URL.revokeObjectURL(link.href), 1000);
}

function initAudioSourceFilter() {
    const options = [
        { label: '智选三源 · 推荐', value: 'smart' },
        { label: 'iTunes + YouTube', value: 'itunes-youtube' },
        { label: '仅B站', value: 'bilibili-only' },
    ];
    const container = $('audioSourceChips');
    if (!container) return;

    const proxyGroup = $('biliProxyGroup');
    const proxyInput = $('biliProxyInput');
    if (proxyInput) {
        proxyInput.value = window.BILI_WORKER_URL || 'http://127.0.0.1:8765';
    }
    // Show proxy input only when B站 mode is active
    if (proxyGroup) {
        proxyGroup.style.display = audioSourcePref === 'itunes-youtube' ? 'none' : '';
    }

    if ($('biliProxySave')) {
        $('biliProxySave').addEventListener('click', () => {
            const val = normalizeLocalProxyUrl(proxyInput?.value?.trim() || '');
            if (val) {
                window.BILI_WORKER_URL = val;
                proxyInput.value = val;
                try { localStorage.setItem('bili_proxy_url_v1', val); } catch {}
                notify('代理地址已更新');
            }
        });
    }

    function ensureBiliPreconnect() {
        const id = 'bili-preconnect';
        if (document.getElementById(id)) return;
        const link = document.createElement('link');
        link.id = id;
        link.rel = 'preconnect';
        link.href = window.BILI_WORKER_URL;
        link.crossOrigin = 'anonymous';
        document.head.appendChild(link);
        // Also preconnect to B站 CDN
        const link2 = document.createElement('link');
        link2.id = 'bili-cdn-preconnect';
        link2.rel = 'preconnect';
        link2.href = 'https://upos-sz-mirrorcos.bilivideo.com';
        link2.crossOrigin = 'anonymous';
        document.head.appendChild(link2);
    }

    options.forEach(opt => {
        const btn = document.createElement('button');
        btn.className = 'settings-chip' + (opt.value === audioSourcePref ? ' active' : '');
        btn.textContent = opt.label;
        btn.addEventListener('click', () => {
            container.querySelectorAll('.settings-chip').forEach(c => c.classList.remove('active'));
            btn.classList.add('active');
            saveAudioSourcePref(opt.value);
            audioCache.clear();
            stopLibraryPreview();
            if (proxyGroup) {
                proxyGroup.style.display = opt.value === 'itunes-youtube' ? 'none' : '';
            }
            if (opt.value === 'smart' || opt.value === 'bilibili-only') {
                ensureBiliPreconnect();
            }
        });
        container.appendChild(btn);
    });

    if (audioSourcePref === 'smart' || audioSourcePref === 'bilibili-only') {
        ensureBiliPreconnect();
    }
}

// =====================================================================
// Settings Modal
// =====================================================================
let settingsReturnFocus = null;
function openSettings() {
    // 打开设置时把当前生效的代理地址同步到输入框（自动探测可能已切换）
    const proxyInput = $('biliProxyInput');
    if (proxyInput && !localStorage.getItem('bili_proxy_url_v1')) {
        proxyInput.value = window.BILI_WORKER_URL || 'http://127.0.0.1:8765';
    }
    settingsReturnFocus = document.activeElement;
    $('settingsModal').classList.add('show');
    $('settingsModal').querySelector('.card-modal-close')?.focus();
}
function closeSettings() {
    $('settingsModal').classList.remove('show');
    settingsReturnFocus?.focus();
    settingsReturnFocus = null;
}

// =====================================================================
// Question Count Selector
// =====================================================================
function initQuestionCount() {
    const container = $('qcountChips');
    const options = [10, 20, 30];
    options.forEach((n, i) => {
        const btn = document.createElement('button');
        btn.className = 'settings-chip' + (i === 0 ? ' active' : '');
        btn.textContent = n + '题';
        btn.addEventListener('click', () => {
            container.querySelectorAll('.settings-chip').forEach(c => c.classList.remove('active'));
            btn.classList.add('active');
            gameState.questionCount = n;
        });
        container.appendChild(btn);
    });
}

// =====================================================================
// Keyboard Shortcuts
// =====================================================================
document.addEventListener('keydown', (e) => {
    const gameVisible = !$('v-game').classList.contains('hidden');
    const detailOpen = $('animeDetailModal').classList.contains('show');
    const settingsOpen = $('settingsModal').classList.contains('show');
    const endOpen = $('endModal').classList.contains('show');

    // Escape to close modals
    if (e.key === 'Escape') {
        if ($('feedbackModal').classList.contains('show')) { closeSongFeedback(); return; }
        if ($('bangumiModal').classList.contains('show')) { closeBangumiPanel(); return; }
        if (settingsOpen) { closeSettings(); return; }
        if (detailOpen) { closeDetailModal(); return; }
        if (endOpen) { $('endModal').classList.remove('show'); showView('menu'); return; }
    }

    // Don't intercept gameplay shortcuts when the user is typing.
    const tag = document.activeElement?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA') return;

    // Space bar: toggle YouTube full player when detail modal is open
    if (e.key === ' ' && detailOpen && !settingsOpen) {
        e.preventDefault();
        toggleFullPlay();
        return;
    }

    // Arrow keys for question navigation when detail modal is open
    if (detailOpen && !settingsOpen) {
        if (e.key === 'ArrowLeft') { prevQuestion(); return; }
        if (e.key === 'ArrowRight') { nextQuestion(); return; }
    }

    // 1-4 keys for answer selection during gameplay
    if (gameVisible && !gameState.isLocked && !detailOpen && !settingsOpen) {
        const key = parseInt(e.key);
        if (key >= 1 && key <= 4) {
            const btns = document.querySelectorAll('.opt-btn');
            if (btns[key - 1]) btns[key - 1].click();
        }
        if (e.key === ' ' || e.code === 'Space') {
            e.preventDefault();
            if (!$('playBtn').disabled) togglePlay();
        }
    }
});

// =====================================================================
// Event Delegation
// =====================================================================

// Backdrop click to close modals
document.addEventListener('click', (e) => {
    if (e.target.id === 'animeDetailModal') { closeDetailModal(); return; }
    if (e.target.id === 'settingsModal') { closeSettings(); return; }
    if (e.target.id === 'feedbackModal') { closeSongFeedback(); return; }
    if (e.target.id === 'endModal') { $('endModal').classList.remove('show'); showView('menu'); return; }
});

// Ripple effect listener (separate from main click handler)
document.addEventListener('click', (e) => {
    const btn = e.target.closest('.btn, .opt-btn, .play-btn, .settings-chip');
    if (btn) createRipple(e);
});

document.addEventListener('click', (e) => {
    // Custom song deletion (event delegation with confirmation)
    const delBtn = e.target.closest('[data-del-custom]');
    if (delBtn) {
        const index = parseInt(delBtn.dataset.delCustom);
        if (!isNaN(index)) removeCustomSong(index);
        return;
    }

    const removeFavBtn = e.target.closest('[data-remove-fav]');
    if (removeFavBtn) {
        e.stopPropagation();
        const index = parseInt(removeFavBtn.dataset.removeFav);
        if (!isNaN(index)) removeFavorite(index);
        return;
    }

    const actionEl = e.target.closest('[data-action]');
    if (!actionEl) return;
    const action = actionEl.dataset.action;
    const value = actionEl.dataset.value;
    switch (action) {
        case 'showLibrary': selectedLibraryTab = 'current'; showView('library'); break;
        case 'showSeasonLibrary':
            selectedLibraryTab = 'season';
            selectedLibrarySeason = homeGallerySeason;
            $('librarySeasonSearch').value = value || '';
            libraryPages.season = 0;
            showView('library');
            break;
        case 'shiftHomeHero': shiftHomeAnime('hero', Number(value)); break;
        case 'shiftHomeGallery': shiftHomeAnime('gallery', Number(value)); break;
        case 'openSourceSettings': openSettings(); $('sourceChips').scrollIntoView({ block: 'center' }); break;
        case 'libraryTab': selectedLibraryTab = value; renderLibrary(); break;
        case 'libraryPage': {
            const [tab, pageText] = String(value || '').split(':');
            const page = Number(pageText);
            if (tab === selectedLibraryTab && Number.isInteger(page) && page >= 0) {
                libraryPages[tab] = page;
                renderLibrary();
                $(`library${tab[0].toUpperCase() + tab.slice(1)}Panel`).scrollIntoView({ block: 'start' });
            }
            break;
        }
        case 'selectLibrarySeason': selectedLibrarySeason = value; renderLibrary(); break;
        case 'startBangumiSongs': startBangumiSongs(); break;
        case 'openBangumi': openBangumiPanel(actionEl); break;
        case 'toggleWatchedAnime': toggleWatchedAnime(value); break;
        case 'toggleSelectedSong': toggleSelectedSong(actionEl.dataset.songKey); break;
        case 'useSelectedSongs': useSelectedSongs(); break;
        case 'startSelectedSeason': startSelectedSeason(); break;
        case 'practiceMistakes': startMistakePractice(); break;
        case 'removeMistake':
            if (confirm('把这首歌从错题本移出吗？')) {
                mistakeBook = mistakeBook.filter(entry => entry.key !== value);
                savePersonalList(PERSONAL_KEYS.mistakes, mistakeBook);
                renderLibrary();
            }
            break;
        case 'reportSong': openSongFeedback(findCatalogSong(actionEl.dataset.songKey)); break;
        case 'previewSong': playLibraryPreview(findCatalogSong(actionEl.dataset.songKey)); break;
        case 'reportCurrentSong': openSongFeedback(gameState.currentSong); break;
        case 'closeFeedback': closeSongFeedback(); break;
        case 'saveFeedback': saveSongFeedback(); break;
        case 'removeFeedback':
            if (confirm('删除这条本机反馈吗？')) {
                songFeedback.splice(Number(value), 1);
                savePersonalList(PERSONAL_KEYS.feedback, songFeedback);
                renderLibrary();
            }
            break;
        case 'copyFeedback': copySongFeedback(); break;
        case 'exportFeedback': exportSongFeedback(); break;
        case 'startSingle': startSingle(); break;
        case 'startMode': startMode(value); break;
        case 'showView': showView(value); break;
        case 'pkCreate': pkCreate(); break;
        case 'pkJoin': pkJoin(); break;
        case 'pkShare': pkShare(); break;
        case 'pkStart': pkStart(); break;
        case 'togglePlay': togglePlay(); break;
        case 'retryQuestionAudio': retryQuestionAudio(); break;
        case 'restartGame': restartGame(); break;
        case 'clearRecords': clearRecords(); break;
        case 'goHome': $('endModal').classList.remove('show'); showView('menu'); break;
        case 'openSettings': openSettings(); break;
        case 'closeSettings': closeSettings(); break;
        case 'closeDetail': closeDetailModal(); break;
        case 'showAnimeDetail': {
            if (gameState.currentSong) showAnimeDetail(gameState.currentSong);
            break;
        }
        case 'nextQuestion': nextQuestion(); break;
        case 'prevQuestion': prevQuestion(); break;
        case 'toggleFullPlay': toggleFullPlay(); break;
        case 'toggleFavorite': toggleFavorite(); break;
        case 'playFavSong': playFavSong(parseInt(value)); break;
        case 'clearFavorites': clearFavorites(); break;
        case 'playAllFavs': playAllFavs(); break;
        case 'shufflePlayFavs': shufflePlayFavs(); break;
        case 'sequentialPlayFavs': sequentialPlayFavs(); break;
        case 'hideMusicPlayer': hideMusicPlayer(); break;
        case 'toggleMusicPlay': toggleMusicPlay(); break;
        case 'toggleMusicFav': toggleMusicFav(); break;
        case 'playPrevSong': playPrevSong(); break;
        case 'playNextSong': playNextSong(); break;
        case 'importBangumi': {
            const input = $('bangumiIndexInput');
            const id = input ? input.value.trim() : '';
            if (!id || !/^\d+$/.test(id)) { notify('喵~ 请输入有效的目录号哦'); return; }
            const importBtn = e.target.closest('[data-action="importBangumi"]');
            if (importBtn) { importBtn.disabled = true; importBtn.textContent = '导入中...'; }
            if (input) input.disabled = true;
            importFromBangumi(id).finally(() => {
                if (importBtn) { importBtn.disabled = false; importBtn.textContent = '导入'; }
                if (input) input.disabled = false;
            });
            break;
        }
        case 'exportCustom': exportCustomSongs(); break;
        case 'importCustom': $('importFileInput')?.click(); break;
        case 'clearCustom': {
            if (getCustomSongs().length === 0) { notify('喵~ 还没有自定义歌曲呢'); return; }
            if (!confirm('主人确定要清空所有自定义歌曲喵？人家会心疼的...')) return;
            setCustomSongs([]);
            notify('已清空自定义曲库啦喵~');
            break;
        }
    }
});

// Handle file input for importing custom songs
document.addEventListener('change', (e) => {
    if (e.target.id === 'importFileInput' && e.target.files[0]) {
        importCustomSongsFile(e.target.files[0]);
        e.target.value = '';
    }
});

// =====================================================================
// Init
// =====================================================================
const homeGallerySeason = Object.keys(SEASONAL_POOLS).sort().reverse()[0] || '2026-07';
const homeAnimePool = [...new Map((SEASONAL_POOLS[homeGallerySeason] || []).map(song => [song.anilistId, song])).values()]
    .filter(song => SEASONAL_COVERS[song.anilistId]);
const homeHeroPool = [...new Map(Object.keys(SEASONAL_POOLS).sort().reverse()
    .flatMap(season => SEASONAL_POOLS[season]).map(song => [song.anilistId, song])).values()]
    .filter(song => SEASONAL_COVERS[song.anilistId]);
const HOME_GALLERY_SIZE = 4;
let homeHeroIndex = 0;
let homeGalleryPage = 0;
function renderHomeAnimeGallery() {
    if (!homeAnimePool.length) return;
    const [year, month] = homeGallerySeason.split('-');
    const seasonNames = { '01': ['WINTER', '冬天', '冬'], '04': ['SPRING', '春天', '春'], '07': ['SUMMER', '夏天', '夏'], '10': ['AUTUMN', '秋天', '秋'] };
    const [englishSeason, chineseSeason, shortSeason] = seasonNames[month];
    $('homeAnimeSeasonLabel').textContent = `${year} / ${englishSeason} ANIME`;
    $('homeAnimeTitle').textContent = `从封面认出这个${chineseSeason}`;
    const hero = homeHeroPool[homeHeroIndex];
    $('heroFeaturedCover').src = SEASONAL_COVERS[hero.anilistId];
    $('heroFeaturedTitle').textContent = hero.animeCN || hero.anime;
    $('heroFeaturedCount').textContent = `${String(homeHeroIndex + 1).padStart(2, '0')} / ${homeHeroPool.length}`;
    const pageCount = Math.ceil(homeAnimePool.length / HOME_GALLERY_SIZE);
    $('homeGalleryCount').textContent = `${homeGalleryPage + 1} / ${pageCount}`;
    const start = homeGalleryPage * HOME_GALLERY_SIZE;
    $('homeAnimePosters').innerHTML = homeAnimePool.slice(start, start + HOME_GALLERY_SIZE).map((song, index) => {
        const name = escapeHTML(song.animeCN || song.anime);
        return `<button type="button" class="home-poster-card" data-action="showSeasonLibrary" data-value="${name}" aria-label="查看${name}的季度歌曲">
            <span class="home-poster-image"><img src="${SEASONAL_COVERS[song.anilistId]}" alt="" loading="lazy" decoding="async"><em>${String(start + index + 1).padStart(2, '0')}</em></span>
            <strong>${name}</strong><small>${year} ${shortSeason} · OP / ED</small>
        </button>`;
    }).join('');
}
function shiftHomeAnime(group, delta) {
    if (!homeAnimePool.length || !Number.isInteger(delta) || Math.abs(delta) !== 1) return;
    if (group === 'hero') homeHeroIndex = (homeHeroIndex + delta + homeHeroPool.length) % homeHeroPool.length;
    else if (group === 'gallery') {
        const pages = Math.ceil(homeAnimePool.length / HOME_GALLERY_SIZE);
        homeGalleryPage = (homeGalleryPage + delta + pages) % pages;
    } else return;
    renderHomeAnimeGallery();
}

$('inlineDetailHost').appendChild($('animeDetailModal'));
renderHomeAnimeGallery();
initSakura();
initFilters();
initSourceFilter();
initAudioSourceFilter();
initQuestionCount();
const watchedOnlyFilter = $('watchedOnlyFilter');
watchedOnlyFilter.checked = filterState.watchedOnly;
watchedOnlyFilter.addEventListener('change', () => {
    filterState.watchedOnly = watchedOnlyFilter.checked;
    $('libraryOnlyWatched').checked = filterState.watchedOnly;
    try { localStorage.setItem('watched_only_v1', filterState.watchedOnly ? '1' : '0'); } catch {}
    updateFilterCount();
    if (!$('v-library').classList.contains('hidden')) renderLibrary();
});
$('libraryAnimeSearch').addEventListener('input', () => {
    libraryPages.watch = 0;
    if (selectedLibraryTab === 'watch') renderWatchLibrary();
});
$('librarySeasonSearch').addEventListener('input', () => { libraryPages.season = 0; renderSeasonLibrary(); });
$('libraryBangumiSearch').addEventListener('input', () => { libraryPages.bangumi = 0; renderBangumiLibrary(); });
$('libraryTrackSearch').addEventListener('input', () => { libraryPages.tracks = 0; renderTracksLibrary(); });
$('libraryCurrentSearch').addEventListener('input', () => { libraryPages.current = 0; renderCurrentLibrary(); });
$('libraryOnlyWatched').checked = filterState.watchedOnly;
$('libraryOnlyWatched').addEventListener('change', () => {
    $('watchedOnlyFilter').checked = $('libraryOnlyWatched').checked;
    $('watchedOnlyFilter').dispatchEvent(new Event('change'));
});
const libraryPreviewAudio = $('libraryPreviewAudio');
libraryPreviewAudio.addEventListener('playing', () => {
    if (!libraryPreviewSession.activeKey || !libraryPreviewSong || !libraryPreviewUrl) return;
    libraryPreviewState = 'playing';
    recordLocalAudioCheck(libraryPreviewSong, 'played', libraryPreviewSource);
    updateLibraryTrackStatus(libraryPreviewSong);
    updateLibraryPreviewUI();
});
libraryPreviewAudio.addEventListener('ended', () => {
    if (!libraryPreviewSession.activeKey) return;
    libraryPreviewState = 'ended';
    updateLibraryPreviewUI();
});
libraryPreviewAudio.addEventListener('error', () => {
    if (!libraryPreviewSession.activeKey || !libraryPreviewSong || !libraryPreviewUrl) return;
    recoverLibraryPreviewAudio('音频加载失败');
});
$('libraryVolRange').addEventListener('input', event => setPlayerVolume(event.target.value));
probeLocalProxy();   // 自动探测本地 B站代理（bili-proxy.mjs），在跑就自动启用
updateCustomSongsUI();

// Return focus to whichever entry point opened the panel.
let bangumiReturnFocus = null;
// The site card animates with a transform and clips overflow. A fixed dialog
// inside it forms a lower stacking context than the settings dialog.
document.body.appendChild($('bangumiModal'));
function openBangumiPanel(trigger) {
    bangumiReturnFocus = trigger || $('bangumiToggle');
    if ($('settingsModal').classList.contains('show')) $('settingsModal').setAttribute('inert', '');
    $('bangumiModal').classList.add('show');
    if (window.matchMedia('(pointer: fine)').matches) $('bangumiIndexInput').focus();
    else $('bangumiClose').focus();
}
$('bangumiToggle').addEventListener('click', event => openBangumiPanel(event.currentTarget));
function closeBangumiPanel() {
    $('bangumiModal').classList.remove('show');
    $('settingsModal').removeAttribute('inert');
    bangumiReturnFocus?.focus();
    bangumiReturnFocus = null;
}
$('bangumiClose').addEventListener('click', closeBangumiPanel);

// Volume control
$('fpVolBtn')?.addEventListener('click', (e) => {
    e.stopPropagation();
    toggleVolumeSlider();
});
$('fpVolRange')?.addEventListener('input', (e) => {
    setPlayerVolume(e.target.value);
});
// Close volume slider on outside click
document.addEventListener('click', (e) => {
    if (!e.target.closest('.fp-vol-wrap')) {
        $('fpVolSlider')?.classList.remove('open');
    }
    if (!e.target.closest('.music-vol-wrap')) {
        $('musicVolSlider')?.classList.remove('open');
    }
});

// Music modal volume control
$('musicVolBtn')?.addEventListener('click', (e) => {
    e.stopPropagation();
    $('musicVolSlider')?.classList.toggle('open');
});
$('musicVolRange')?.addEventListener('input', (e) => {
    setPlayerVolume(e.target.value);
});

// Music modal progress bar click-to-seek
document.addEventListener('click', (e) => {
    const bar = e.target.closest('#musicProgress');
    if (!bar || !ytPlayer || !ytPlayer.getDuration) return;
    const rect = bar.getBoundingClientRect();
    const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    ytPlayer.seekTo(pct * ytPlayer.getDuration(), true);
    $('musicProgressFill').style.width = (pct * 100) + '%';
    $('musicProgressDot').style.left = (pct * 100) + '%';
});

// Render favorites on load
renderFavorites();
