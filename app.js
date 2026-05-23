import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth, signInAnonymously, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { getDatabase, ref, set, get, onValue, update, serverTimestamp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-database.js";
import { SONGS, ALL_ANIME, AVAILABLE_YEARS, AVAILABLE_TYPES } from './songs.js';

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
const projectId = firebaseConfig.projectId;
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
    playlist: [],
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
};

function getMaxScore(n) {
    let s = 0;
    for (let i = 1; i <= n; i++) s += 10 + Math.min(i, 5);
    return s;
}

const $ = id => document.getElementById(id);
function escapeHTML(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
const audio = $('audioEl');

// =====================================================================
// Timeout Constants
// =====================================================================
const ITUNES_TIMEOUT = 5000;       // iTunes API fetch timeout (ms)
const ANILIST_TIMEOUT = 4000;      // AniList GraphQL timeout (ms)
const BANGUMI_TIMEOUT = 4000;      // Bangumi search timeout (ms)
const BANGUMI_PAGE_TIMEOUT = 20000; // Bangumi subject page fetch timeout (ms)
const NOTIFY_DURATION = 2500;      // Toast auto-dismiss duration (ms)
const PK_RETRY_DELAY = 1000;       // PK retry backoff (ms)
const PK_RETRY_COUNT = 3;          // PK max retry attempts

// =====================================================================
// Filter State
// =====================================================================
const filterState = { years: new Set(), types: new Set(), source: null };

function updateFilterCount() {
    const count = getFilteredSongs().length;
    $('filterCount').textContent = `共 ${count} 首可选`;
    $('songCount').textContent = count + '+';
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
    _flush() {
        if (this._timer) { clearTimeout(this._timer); this._timer = 0; }
        if (!this._dirty) return;
        try { localStorage.setItem(this._key, JSON.stringify(this._data)); }
        catch (e) { console.error('[Cache] _flush:', e); }
        this._dirty = false;
    }
}

const audioCache = new MemCache('audio_cache_v2', 500, 24 * 60 * 60 * 1000);
const animeDetailCache = new MemCache('anime_detail_cache_v1', 300);
const youtubeCache = new MemCache('youtube_cache_v1', 200);

function normalizeAudioEntry(entry) {
    if (!entry) return null;
    // Backward compat: old cache entries are plain URL strings
    if (typeof entry === 'string') {
        const isYT = entry.startsWith('yt:');
        return {
            url: entry,
            source: isYT ? 'youtube' : 'itunes',
            ytVideoId: isYT ? entry.slice(3) : null,
            ytQuery: null,
            itunesTrack: null,
            itunesArtist: null
        };
    }
    return entry;
}

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
let fpProgressInterval = null;
let fpAudioInterval = null;
let musicProgressInterval = null;
let fpUseAudio = false;  // true when full player falls back to native <audio>

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

function loadYouTubeAPI() {
    const tag = document.createElement('script');
    tag.src = 'https://www.youtube.com/iframe_api';

    let loadFailed = false;
    const failTimer = setTimeout(() => {
        if (!ytReady) {
            loadFailed = true;
            console.error('[YT] IFrame API load timeout (15s)');
            notify('YouTube播放器加载超时，请检查网络或关闭广告拦截插件后刷新页面');
        }
    }, 15000);

    // MUST define callback BEFORE appending script — mobile browsers may load instantly
    window.onYouTubeIframeAPIReady = () => {
        clearTimeout(failTimer);
        if (loadFailed) return;
        try {
            ytPlayer = new YT.Player('ytPlayerEl', {
                height: '360', width: '640',
                playerVars: { autoplay: 0, controls: 0, disablekb: 1, playsinline: 1 },
                events: {
                    onReady: () => { ytReady = true; },
                    onStateChange: onYtStateChange,
                    onError: onYtError
                }
            });
        } catch (e) {
            console.error('[YT] Player constructor failed:', e);
            notify('YouTube播放器初始化失败，请刷新页面重试');
        }
    };

    tag.onerror = () => {
        clearTimeout(failTimer);
        loadFailed = true;
        console.error('[YT] IFrame API script load error');
        notify('YouTube播放器加载失败，请检查网络或关闭广告拦截插件后刷新页面');
    };

    document.head.appendChild(tag);
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
        notify(`YouTube音频加载失败（${reason}），已跳过此题`);
        stopQuizYT();
        gameState.isPlaying = false;
        $('visualizer').classList.add('hidden');
        $('playIcon').innerHTML = '<path d="M8 5v14l11-7z"/>';
        gameState.questionIndex++;
        setTimeout(() => loadQuestion(), 1500);
        return;
    }

    // Detail modal full player — just stop, don't skip
    if ($('animeDetailModal').classList.contains('show')) {
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
            $('playIcon').innerHTML = '<rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/>';
            gameState.isPlaying = true;
            $('visualizer').classList.remove('hidden');
            startQuizProgress();
            // Start 30s timer from actual playback start (not load time)
            clearTimeout(quizYT.timer);
            quizYT.timer = setTimeout(() => {
                if (quizYT.active) {
                    stopQuizYT();
                    gameState.isPlaying = false;
                    $('visualizer').classList.add('hidden');
                    $('playIcon').innerHTML = '<path d="M8 5v14l11-7z"/>';
                }
            }, 30000);
        } else if (e.data === YT.PlayerState.ENDED) {
            stopQuizYT();
            gameState.isPlaying = false;
            $('visualizer').classList.add('hidden');
            $('playIcon').innerHTML = '<path d="M8 5v14l11-7z"/>';
        } else {
            $('playIcon').innerHTML = '<path d="M8 5v14l11-7z"/>';
            stopQuizProgress();
        }
        return; // Don't also update full player / music player
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
        if (tried.has(idx) || ytKeyExhausted.has(idx)) {
            ytKeyIndex = (ytKeyIndex + 1) % YT_API_KEYS.length;
            continue;
        }
        tried.add(idx);
        const key = YT_API_KEYS[idx];
        try {
            const res = await fetch(
                `https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&videoCategoryId=10&maxResults=1&q=${encodeURIComponent(query)}&key=${key}`
            );
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
            console.error('[YT] searchYouTube failed:', e);
            // Network error — try next key
            ytKeyIndex = (ytKeyIndex + 1) % YT_API_KEYS.length;
        }
    }
    console.error('[YT] All keys exhausted or failed');
    return null;
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

    // YouTube found AND player is ready → play embedded (desktop)
    if (videoId && ytPlayer && ytReady) {
        if (!$('animeDetailModal').classList.contains('show')) return;
        playerEl.style.display = '';
        $('fpTitle').textContent = `${song.titleCN || song.title} — ${song.artist}`;
        $('fpSource').textContent = '';
        const yl = $('fpYtLink'); if (yl) yl.style.display = 'none';
        updateHeartUI();
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

function getFavorites() {
    try { return JSON.parse(localStorage.getItem(FAV_KEY) || '[]'); }
    catch { return []; }
}

function saveFavorites(favs) {
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
        const videoId = ytPlayer?.getVideoData?.()?.video_id || '';
        favs.push({
            title: song.title,
            titleCN: song.titleCN || song.title,
            anime: song.anime,
            artist: song.artist,
            year: song.year,
            type: song.type,
            videoId: videoId,
            coverImage: $('detailCover')?.src || ''
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
        const safeAnime = escapeHTML(f.anime);
        return `
        <div class="fav-item${isActive ? ' active' : ''}" data-action="playFavSong" data-value="${i}">
            <span class="fav-item-num">${i + 1}</span>
            <div class="fav-item-icon">${iconHTML}</div>
            <div class="fav-item-info">
                <div class="fav-item-title">${safeTitle}</div>
                <div class="fav-item-sub">${safeAnime} · ${f.year}</div>
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

function playFavSong(index) {
    const favs = getFavorites();
    if (index < 0 || index >= favs.length) return;
    playlist.songs = favs;
    playlist.mode = 'free';
    playlist.currentIndex = index;
    playFavSongAtIndex(index);
}

async function playFavSongAtIndex(index) {
    const song = playlist.songs[index];
    if (!song) return;
    if (!ytPlayer || !ytReady) {
        notify('YouTube播放器尚未就绪，请稍候再试');
        return;
    }
    playlist.currentIndex = index;
    gameState.currentSong = song;
    showMusicPlayer(song);

    let videoId = song.videoId;
    if (!videoId) {
        // Try to search YouTube for this song
        notify('正在搜索歌曲...');
        const query = `${song.title} ${song.anime} ${song.type || ''}`;
        videoId = await searchYouTube(query);
        if (!videoId) {
            notify('未找到完整版歌曲，试试下一首吧');
            return;
        }
        // Save the found videoId back to the playlist and favorites
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
    $('musicAnime').textContent = song.anime || '';
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
    hideMusicPlayer();
}

function toggleMusicPlay() {
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

// Volume control
let ytVolume = 80;
let volumeMuted = false;

function toggleVolumeSlider() {
    const slider = $('fpVolSlider');
    if (slider) slider.classList.toggle('open');
}

function toggleMute() {
    if (!ytPlayer) return;
    volumeMuted = !volumeMuted;
    ytPlayer.setVolume(volumeMuted ? 0 : ytVolume);
    updateVolIcon();
}

function updateVolIcon() {
    const muted = volumeMuted || ytVolume === 0;
    const low = ytVolume < 50;
    const svgMuted = '<polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/>';
    const svgLow = '<polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/>';
    const svgHigh = '<polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"/>';
    const svg = muted ? svgMuted : (low ? svgLow : svgHigh);
    const icon = $('fpVolIcon');
    if (icon) icon.innerHTML = svg;
    const mIcon = $('musicVolIcon');
    if (mIcon) mIcon.innerHTML = svg;
}

// =====================================================================
// Custom Song Library (Bangumi Import)
// =====================================================================
const CUSTOM_SONGS_KEY = 'custom_songs_v1';

function getCustomSongs() {
    try { return JSON.parse(localStorage.getItem(CUSTOM_SONGS_KEY) || '[]'); }
    catch (e) { console.error('[CustomSongs] getCustomSongs:', e); return []; }
}

function setCustomSongs(songs) {
    localStorage.setItem(CUSTOM_SONGS_KEY, JSON.stringify(songs));
    updateFilterCount();
    updateCustomSongsUI();
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
    return [...SONGS, ...getCustomSongs()];
}

function getFilteredSongs() {
    const customSet = new Set(getCustomSongs().map(s => s.title + '|' + s.anime));
    const all = getAllSongs();
    return all.filter(s => {
        if (filterState.years.size > 0 && !filterState.years.has(s.year)) return false;
        if (filterState.types.size > 0 && !filterState.types.has(s.type)) return false;
        if (filterState.source === 'builtin' && customSet.has(s.title + '|' + s.anime)) return false;
        if (filterState.source === 'custom' && !customSet.has(s.title + '|' + s.anime)) return false;
        return true;
    });
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
    const existingTitles = new Set(SONGS.map(s => s.anime));
    const customSongs = getCustomSongs();
    const customTitles = new Set(customSongs.map(s => s.anime));
    let addedCount = 0;

    for (let i = 0; i < animeList.length; i++) {
        const anime = animeList[i];
        const animeName = anime.name_cn || anime.name;
        if (progressEl) progressEl.style.width = ((i + 1) / animeList.length * 100) + '%';
        if (statusEl) statusEl.textContent = `[${i + 1}/${animeList.length}] ${animeName}`;

        // Skip if already in built-in or custom library
        if (existingTitles.has(animeName) || customTitles.has(animeName)) continue;

        // Get romaji title from AniList for better iTunes search
        let searchTitle = anime.name; // Japanese name
        let year = anime.date ? parseInt(anime.date.slice(0, 4)) : 2020;

        try {
            const aq = `query($s:String){Media(search:$s,type:ANIME){title{romaji native}}}`;
            const ares = await fetch('https://graphql.anilist.co', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ query: aq, variables: { s: animeName } })
            });
            const adata = await ares.json();
            if (adata.data?.Media?.title?.romaji) {
                searchTitle = adata.data.Media.title.romaji;
            }
        } catch (e) { console.error('[Bangumi] AniList search:', e); }

        // Search iTunes for songs — pass Japanese name for album matching
        const songs = await searchItunesForAnime(searchTitle, animeName, anime.name, year);
        for (const song of songs) {
            if (addCustomSong(song)) addedCount++;
        }

        // Small delay to avoid rate limiting
        await new Promise(r => setTimeout(r, 300));
    }

    if (statusEl) statusEl.textContent = `导入完成！新增 ${addedCount} 首歌曲`;
    if (progressEl) progressEl.style.width = '100%';
    if (progressWrapper) setTimeout(() => { progressWrapper.style.display = 'none'; }, 2000);
    notify(`导入成功啦喵！新增了 ${addedCount} 首歌曲呢~`);
}

// Search iTunes for anime OP/ED songs — with scoring to ensure anime relevance
async function searchItunesForAnime(romajiTitle, animeName, jpName, year) {
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
                if (s >= 20) scored.push({ r, score: s });
            }
            scored.sort((a, b) => b.score - a.score);
            for (const { r } of scored) {
                const title = r.trackName;
                if (seen.has(title)) continue;
                seen.add(title);
                results.push({
                    title: title,
                    titleCN: title,
                    anime: animeName,
                    artist: r.artistName || 'Unknown',
                    year: year,
                    type: guessSongType(title, r),
                });
            }
            if (results.length >= 2) break;
        } catch (e) { clearTimeout(tid); console.error('[iTunes] searchItunesForAnime:', e); }
    }
    return results.slice(0, 2);
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
                    year: s.year || 2020,
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
        list.innerHTML = '<div style="font-size:11px;color:#999;text-align:center;padding:10px;">喵~ 还没有自定义歌曲呢</div>';
        return;
    }
    list.innerHTML = '<div style="font-size:11px;color:#999;margin-bottom:4px;">共 ' + songs.length + ' 首</div>' + songs.map((s, i) => `
        <div style="display:flex;align-items:center;gap:6px;padding:4px 6px;border-radius:4px;margin-bottom:2px;background:#fafafa;">
            <div style="flex:1;min-width:0;">
                <div style="font-size:11px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:#333;">${escapeHTML(s.titleCN || s.title)}</div>
                <div style="font-size:10px;color:#999;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escapeHTML(s.anime)}</div>
            </div>
            <button data-del-custom="${i}" style="width:18px;height:18px;border-radius:50%;border:1px solid #ddd;background:none;color:#999;font-size:10px;cursor:pointer;flex-shrink:0;line-height:1;">✕</button>
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

function showAnimeDetail(song) {
    const modal = $('animeDetailModal');
    const coverWrap = document.querySelector('.detail-cover-wrap');
    const cover = $('detailCover');
    const title = $('detailTitle');
    const romaji = $('detailRomaji');
    const meta = $('detailMeta');
    const songInfo = $('detailSongInfo');
    const bangumiLink = $('bangumiLink');

    const songName = song.titleCN || song.title;

    title.textContent = song.anime;
    romaji.textContent = '';
    meta.innerHTML = `<span><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-2px;margin-right:2px;"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>${song.year}年</span><span><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-2px;margin-right:2px;"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>${song.type}</span>`;
    songInfo.innerHTML = `
        <div class="detail-song-icon"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg></div>
        <div class="detail-song-text">
            <div class="detail-song-name">${escapeHTML(songName)}</div>
            <div class="detail-song-artist">${escapeHTML(song.artist)}</div>
        </div>
    `;

    // Reset cover state - show placeholder
    cover.src = '';
    cover.style.display = 'none';
    let placeholder = coverWrap.querySelector('.detail-cover-placeholder');
    if (!placeholder) {
        placeholder = document.createElement('div');
        placeholder.className = 'detail-cover-placeholder';
        placeholder.innerHTML = '<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="2" width="20" height="20" rx="2.18" ry="2.18"/><line x1="7" y1="2" x2="7" y2="22"/><line x1="17" y1="2" x2="17" y2="22"/><line x1="2" y1="12" x2="22" y2="12"/><line x1="2" y1="7" x2="7" y2="7"/><line x1="2" y1="17" x2="7" y2="17"/><line x1="17" y1="7" x2="22" y2="7"/><line x1="17" y1="17" x2="22" y2="17"/></svg>';
        coverWrap.appendChild(placeholder);
    }
    placeholder.style.display = 'flex';

    // Safe fallback: Bangumi search URL (always works)
    bangumiLink.href = `https://bgm.tv/search/subject/${encodeURIComponent(song.anime)}`;

    modal.classList.add('show');

    fetchAnimeDetail(song.anime).then(detail => {
        if (!detail) return;
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

    searchAndLoadFullSong(song);
}

// =====================================================================
// Sakura Particle System
// =====================================================================
function initSakura() {
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
            ctx.shadowBlur = this.size * 2;
            ctx.beginPath();
            ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
        }
    }

    for (let i = 0; i < PETAL_COUNT; i++) petals.push(new Petal());
    for (let i = 0; i < STAR_COUNT; i++) stars.push(new Star());

    let lastFrame = 0;
    function animate(ts) {
        // Cap at ~24fps to reduce CPU/GPU load on mobile
        if (ts - lastFrame < 42) { requestAnimationFrame(animate); return; }
        lastFrame = ts;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        stars.forEach(s => { s.update(); s.draw(); });
        petals.forEach(p => { p.update(); p.draw(); });
        requestAnimationFrame(animate);
    }
    requestAnimationFrame(animate);
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
    const el = e.currentTarget;
    if (el.disabled) return;
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
}

// =====================================================================
// Single Player Mode
// =====================================================================
function startSingle() {
    gameState.mode = 'single';
    gameState.score = 0;
    gameState.questionIndex = 0;
    gameState.combo = 0;
    gameState.maxCombo = 0;
    gameState.correctCount = 0;
    gameState.answerHistory = [];
    gameState.viewingHistory = false;
    gameState.fetchGeneration = 0;
    const pool = getFilteredSongs();
    if (pool.length < 4) { notify('呜喵~ 曲库太少了...请放宽筛选条件吧'); return; }
    const n = Math.min(gameState.questionCount, pool.length);
    gameState.playlist = shuffle([...pool]).slice(0, n);
    $('singleHeader').classList.remove('hidden');
    $('pkHeader').classList.add('hidden');
    $('comboArea').innerHTML = '';
    $('songInfo').classList.remove('show');
    $('totalQ').textContent = n;
    showView('game');
    loadQuestion();
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
    const rid = String(Math.floor(1000 + Math.random() * 9000));
    roomId = rid;
    try {
        await retryPK(
            () => set(ref(db, 'rooms/' + rid), {
                host: user.uid,
                guest: null,
                status: 'waiting',
                timestamp: serverTimestamp(),
                scores: { [user.uid]: 0 },
                questions: shuffle([...Array(SONGS.length).keys()]).slice(0, 10),
            }),
            'pkCreate'
        );
        enterRoom(rid);
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
            await retryPK(
                () => update(ref(db, 'rooms/' + rid), {
                    guest: user.uid,
                    [`scores/${user.uid}`]: 0
                }),
                'pkJoin.updateDoc'
            );
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
    if (!roomId) return;
    await update(ref(db, 'rooms/' + roomId), { status: 'playing' });
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
function loadQuestion() {
    stopQuizYT();
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
        $('progressFill').style.width = '0%';
        $('qNum').textContent = gameState.questionIndex + 1;
        const histCorrect = gameState.answerHistory.slice(0, gameState.questionIndex + 1).filter(r => r.isCorrect).length;
        animateScore($('scoreText'), histCorrect);
        $('songInfo').classList.remove('show');
        renderHistoryOptions(record);
        showSongInfo(record.isCorrect);
        // Fetch audio for playback during review
        fetchAudio(record.song.title, record.song.artist, record.song.anime).then(result => {
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
                $('playerStatus').textContent = '回顾模式';
            }
            $('playBtn').disabled = false;
        });
        // Show detail modal after brief delay (same as normal flow)
        setTimeout(() => {
            showAnimeDetail(record.song);
            updatePrevButton();
        }, 800);
        return;
    }

    const q = gameState.playlist[gameState.questionIndex];
    gameState.correctAnime = q.anime;
    gameState.currentSong = q;
    gameState.isLocked = false;
    audio.pause();
    gameState.isPlaying = false;
    $('visualizer').classList.add('hidden');
    $('playIcon').innerHTML = '<path d="M8 5v14l11-7z"/>';
    $('playBtn').disabled = true;
    $('playerStatus').textContent = '🔍 搜索中...';
    $('progressFill').style.width = '0%';
    $('songInfo').classList.remove('show');
    $('qNum').textContent = gameState.questionIndex + 1;
    animateScore($('scoreText'), gameState.correctCount);
    updatePrevButton();
    $('optionsGrid').innerHTML = '<div class="loading-state"><div class="loading-dots"><div class="loading-dot"></div><div class="loading-dot"></div><div class="loading-dot"></div></div><div class="loading-text">正在搜索音频喵~</div></div>';

    gameState.fetchGeneration++;
    const gen = gameState.fetchGeneration;
    const correctAnime = q.anime;  // capture now — prevents race if recursive loadQuestion overwrites gameState
    fetchAudio(q.title, q.artist, q.anime).then(result => {
        if (gen !== gameState.fetchGeneration) return;
        if (!result) {
            notify('呜喵~ 这首歌的音频获取失败了，已跳过~');
            gameState.questionIndex++;
            loadQuestion();
            return;
        }
        // Save enriched result so full-song search can reuse the same audio source
        gameState.lastAudioResult = result;
        const url = result.url;
        if (url.startsWith('yt:')) {
            // YouTube fallback — use ytPlayer for 30s quiz clip
            quizYT.active = true;
            quizYT.videoId = url.slice(3);
            $('playBtn').disabled = false;
            $('playerStatus').textContent = '点击播放 (YouTube源)';
        } else {
            quizYT.active = false;
            quizYT.videoId = null;
            audio.src = url;
            $('playBtn').disabled = false;
            $('playerStatus').textContent = '点击播放';
        }
        renderOptions(correctAnime);
    });
}

async function fetchAudio(title, artist, anime) {
    const cacheKey = `${title}|${anime}`;
    const cached = audioCache.get(cacheKey);
    if (cached) return normalizeAudioEntry(cached);

    function scoreMatch(r) {
        const t = (r.trackName || '').toLowerCase();
        const c = (r.collectionName || '').toLowerCase();
        const a = (r.artistName || '').toLowerCase();
        const lt = title.toLowerCase();
        const la = (artist || '').toLowerCase();
        const lan = (anime || '').toLowerCase();

        let score = 0;

        // Title match (strict: exact or starts-with gets higher score)
        if (t === lt) score += 100;
        else if (t.startsWith(lt) || lt.startsWith(t)) score += 60;
        else if (t.includes(lt) || lt.includes(t)) score += 30;
        else return -1; // no title match at all — reject

        // Artist match — exact match gets full bonus, partial gets less
        if (la) {
            if (a === la) score += 50;
            else if (a.includes(la) || la.includes(a)) score += 25;
            else score -= 20; // artist mismatch penalty
        }

        // Album/collection name contains anime name (strong signal for anime songs)
        if (lan && c.includes(lan)) score += 30;

        // Bonus: album name contains title (common for singles/OSTs)
        if (c.includes(lt)) score += 10;

        return score;
    }

    async function searchItunes(term) {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), ITUNES_TIMEOUT);
        try {
            const response = await fetch(
                `https://itunes.apple.com/search?term=${encodeURIComponent(term)}&media=music&entity=song&limit=10&country=JP`,
                { signal: controller.signal }
            );
            clearTimeout(timeoutId);
            const data = await response.json();
            if (data.resultCount > 0) {
                // Score all results and pick the best match
                let best = null;
                let bestScore = -1;
                for (const r of data.results) {
                    const s = scoreMatch(r);
                    if (s > bestScore) { bestScore = s; best = r; }
                }
                if (best && bestScore >= 40) return { url: best.previewUrl, score: bestScore, trackName: best.trackName, artistName: best.artistName };
                // Low confidence — return score but no URL
                if (best) return { url: null, score: bestScore, trackName: best.trackName, artistName: best.artistName };
            }
        } catch (e) { clearTimeout(timeoutId); console.error('[iTunes] searchItunes:', e); }
        return { url: null, score: -1, trackName: null, artistName: null };
    }

    // Try 1: artist + title (most precise)
    if (artist) {
        const r = await searchItunes(`${artist} ${title}`);
        if (r.url) { const e = { url: r.url, source: 'itunes', itunesTrack: r.trackName, itunesArtist: r.artistName }; audioCache.set(cacheKey, e); return e; }
    }

    // Try 2: artist + title + anime (full context disambiguation)
    if (artist) {
        const r = await searchItunes(`${artist} ${title} ${anime}`);
        if (r.url) { const e = { url: r.url, source: 'itunes', itunesTrack: r.trackName, itunesArtist: r.artistName }; audioCache.set(cacheKey, e); return e; }
    }

    // Try 3: title + anime (anime name helps disambiguate even without artist)
    {
        const r = await searchItunes(`${title} ${anime}`);
        if (r.url) { const e = { url: r.url, source: 'itunes', itunesTrack: r.trackName, itunesArtist: r.artistName }; audioCache.set(cacheKey, e); return e; }
    }

    // Try 4: just title (last resort before YouTube)
    {
        const r = await searchItunes(title);
        if (r.url) { const e = { url: r.url, source: 'itunes', itunesTrack: r.trackName, itunesArtist: r.artistName }; audioCache.set(cacheKey, e); return e; }
    }

    // All iTunes attempts failed or low confidence — fall back to YouTube
    console.log(`[Audio] iTunes miss for "${title}" by "${artist}", trying YouTube fallback`);
    const ytQuery = `${title} ${anime} ${artist || ''}`;
    const ytVideoId = await searchYouTube(ytQuery);
    if (ytVideoId) {
        const e = { url: `yt:${ytVideoId}`, source: 'youtube', ytVideoId, ytQuery };
        audioCache.set(cacheKey, e);
        return e;
    }

    return null;
}

function renderOptions(answer) {
    const wrongs = shuffle(ALL_ANIME.filter(a => a !== answer)).slice(0, 3);
    const opts = shuffle([...wrongs, answer]);
    $('optionsGrid').innerHTML = '';
    opts.forEach((opt, i) => {
        const btn = document.createElement('button');
        btn.className = 'opt-btn';
        btn.textContent = opt;
        btn.dataset.key = i + 1;
        btn.style.animationDelay = (i * 0.06) + 's';
        btn.onclick = () => handleAnswer(btn, opt);
        $('optionsGrid').appendChild(btn);
    });
}

function handleAnswer(btn, selected) {
    if (gameState.isLocked) return;
    gameState.isLocked = true;
    audio.pause();
    stopQuizYT();
    gameState.isPlaying = false;
    $('visualizer').classList.add('hidden');
    $('playIcon').innerHTML = '<path d="M8 5v14l11-7z"/>';

    const isCorrect = selected === gameState.correctAnime;
    gameState.answerHistory.push({
        song: gameState.currentSong,
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
        gameState.score += 10 + Math.min(gameState.combo, 5);
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
            if (b.textContent === gameState.correctAnime) b.classList.add('reveal');
        });
    }

    animateScore($('scoreText'), gameState.correctCount);
    animateScore($('myScoreText'), gameState.score);
    setTimeout(() => {
        showAnimeDetail(gameState.currentSong);
        updatePrevButton();
    }, 1500);
}

function showSongInfo(isCorrect) {
    const song = gameState.currentSong;
    const title = song.titleCN || song.title;
    const badge = $('resultBadge');

    $('songTitle').textContent = title;
    $('songAnime').textContent = song.anime;
    $('songArtist').textContent = song.artist;

    if (isCorrect) {
        badge.className = 'result-badge correct';
        badge.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-2px;margin-right:2px;"><polyline points="20 6 9 17 4 12"/></svg>正确';
    } else {
        badge.className = 'result-badge wrong';
        badge.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" style="vertical-align:-2px;margin-right:2px;"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>错误';
    }
    $('songInfo').classList.add('show');
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
            stopQuizYT();
        } else {
            audio.pause();
        }
        gameState.isPlaying = false;
        $('visualizer').classList.add('hidden');
        $('playIcon').innerHTML = '<path d="M8 5v14l11-7z"/>';
    } else {
        if (quizYT.active) {
            // YouTube quiz playback — play 30s clip
            if (!ytPlayer || !ytReady || !quizYT.videoId) { notify('播放器未就绪'); return; }
            stopFullPlayer();
            stopMusicPlayer();
            ytPlayer.loadVideoById({ videoId: quizYT.videoId, startSeconds: 0 });
            // Timer starts in onYtStateChange when PLAYING fires (after buffering)
        } else {
            // Normal iTunes playback
            if (audioContext) audioContext.resume();
            playLock = true;
            gameState.isPlaying = true;
            $('visualizer').classList.remove('hidden');
            $('playIcon').innerHTML = '<rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/>';
            const lockTimeout = setTimeout(() => { playLock = false; }, 5000);
            audio.play().then(() => { clearTimeout(lockTimeout); playLock = false; }).catch(() => {
                clearTimeout(lockTimeout);
                playLock = false;
                gameState.isPlaying = false;
                $('visualizer').classList.add('hidden');
                $('playIcon').innerHTML = '<path d="M8 5v14l11-7z"/>';
                notify('喵呜~ 音频播放失败了...再试一次吧');
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

function startQuizProgress() {
    stopQuizProgress();
    const duration = 30; // quiz clips are 30 seconds
    quizProgressInterval = setInterval(() => {
        if (!ytPlayer || !ytPlayer.getCurrentTime) return;
        const t = ytPlayer.getCurrentTime();
        $('progressFill').style.width = Math.min(t / duration * 100, 100) + '%';
        const cur = formatTime(t);
        const dur = formatTime(duration);
        $('playerStatus').textContent = `${cur} / ${dur} (YouTube源)`;
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
    $('visualizer').classList.add('hidden');
    $('playIcon').innerHTML = '<path d="M8 5v14l11-7z"/>';
};
audio.ontimeupdate = () => {
    if (audio.duration) $('progressFill').style.width = (audio.currentTime / audio.duration * 100) + '%';
};
audio.onerror = () => {
    if (!quizYT.active && gameState.currentSong) {
        const song = gameState.currentSong;
        const gen = gameState.fetchGeneration;
        // Clear the stale/expired cache entry and re-fetch
        const cacheKey = `${song.title}|${song.anime}`;
        audioCache._load();
        delete audioCache._data[cacheKey];
        audioCache._dirty = true;
        audioCache._flush();
        gameState.isPlaying = false;
        $('visualizer').classList.add('hidden');
        $('playIcon').innerHTML = '<path d="M8 5v14l11-7z"/>';
        $('playBtn').disabled = true;
        $('playerStatus').textContent = '音频过期，重新搜索中...';
        fetchAudio(song.title, song.artist, song.anime).then(result => {
            if (gen !== gameState.fetchGeneration) return;
            if (!result) {
                notify('这首歌的音频暂时不可用，已跳过~');
                gameState.questionIndex++;
                loadQuestion();
                return;
            }
            gameState.lastAudioResult = result;
            audio.src = result.url;
            $('playBtn').disabled = false;
            $('playerStatus').textContent = '点击播放';
        });
    }
};
$('volSlider').oninput = e => { audio.volume = e.target.value; };
audio.volume = 0.5;

// =====================================================================
// Game End
// =====================================================================
function endGame() {
    $('endModal').classList.add('show');

    if (gameState.mode === 'pk') {
        const win = gameState.score > gameState.opponentScore;
        const draw = gameState.score === gameState.opponentScore;
        $('endEmoji').textContent = win ? '👑' : draw ? '🤝' : '💀';
        $('endTitle').textContent = win ? '你赢了！' : draw ? '平局' : '你输了...';
        $('endScore').textContent = `${gameState.score} : ${gameState.opponentScore}`;
        $('endDesc').textContent = win ? '二次元之神就是你！' : '再接再厉！';
        if (win) spawnCelebration();
    } else {
        const total = gameState.playlist.length;
        const pct = total > 0 ? gameState.correctCount / total * 100 : 0;
        $('endEmoji').textContent = pct >= 80 ? '🏆' : pct >= 50 ? '🎉' : '💪';
        $('endTitle').textContent = '挑战完成';
        $('endScore').textContent = `${gameState.correctCount} / ${total}`;
        $('endDesc').textContent = pct >= 80 ? '太强了！二次元之神！' : pct >= 50 ? '不错哦！继续加油！' : '加油！多听几首番剧曲吧~';
        if (pct >= 50) spawnCelebration();
    }
    $('endDetail').textContent = `连击 ${gameState.maxCombo} · 答对 ${gameState.correctCount}/${gameState.playlist.length}`;

    const recs = JSON.parse(localStorage.getItem('aq_rec') || '[]');
    recs.push({
        s: gameState.score,
        m: gameState.mode,
        c: gameState.maxCombo,
        r: gameState.correctCount,
        n: gameState.playlist.length,
        t: new Date().toLocaleDateString('zh-CN')
    });
    recs.sort((a, b) => (b.r || 0) - (a.r || 0));
    localStorage.setItem('aq_rec', JSON.stringify(recs.slice(0, 50)));
}

function restartGame() {
    $('endModal').classList.remove('show');
    if (gameState.mode === 'single') startSingle();
    else showView('menu');
}

function nextQuestion() {
    stopFullPlayer();
    $('animeDetailModal').classList.remove('show');
    if (gameState.viewingHistory) {
        // Return to the current unanswered question
        gameState.questionIndex = gameState.answerHistory.length;
        gameState.viewingHistory = false;
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
    stopFullPlayer();
    $('animeDetailModal').classList.remove('show');
    gameState.questionIndex--;
    if (gameState.questionIndex < 0) gameState.questionIndex = 0;
    loadQuestion();
}

function updatePrevButton() {
    const btn = $('prevQuestionBtn');
    if (!btn) return;
    btn.style.display = gameState.questionIndex > 0 ? '' : 'none';
}

function renderHistoryOptions(record) {
    const grid = $('optionsGrid');
    grid.innerHTML = '';
    const options = record.options || [record.song.anime];
    options.forEach((opt, i) => {
        const btn = document.createElement('button');
        btn.className = 'opt-btn';
        btn.textContent = opt;
        btn.dataset.key = i + 1;
        btn.style.animationDelay = (i * 0.06) + 's';
        if (opt === record.song.anime) btn.classList.add('correct');
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
                <div class="record-meta">${r.m==='single'?'🎮 单人':'⚔️ PK'} · ${r.t}</div>
            </div>
            <div class="record-detail">🔥${r.c}</div>
        </div>
    `).join('');
}

let clearingRecords = false;
function clearRecords() {
    if (clearingRecords) return;
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
    const yearChips = $('yearChips');

    // "全部" button
    const allBtn = document.createElement('button');
    allBtn.className = 'settings-chip active';
    allBtn.textContent = '全部';
    allBtn.addEventListener('click', () => {
        yearChips.querySelectorAll('.settings-chip').forEach(c => c.classList.remove('active'));
        allBtn.classList.add('active');
        filterState.years.clear();
        updateFilterCount();
    });
    yearChips.appendChild(allBtn);

    // Individual year buttons
    const years = AVAILABLE_YEARS.slice().reverse();
    years.forEach(y => {
        const btn = document.createElement('button');
        btn.className = 'settings-chip';
        btn.textContent = y;
        btn.dataset.year = y;
        btn.addEventListener('click', () => {
            if (filterState.years.has(y)) {
                filterState.years.delete(y);
                btn.classList.remove('active');
            } else {
                filterState.years.add(y);
                btn.classList.add('active');
            }
            if (filterState.years.size === 0) {
                allBtn.classList.add('active');
            } else {
                allBtn.classList.remove('active');
            }
            updateFilterCount();
        });
        yearChips.appendChild(btn);
    });

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

function initSourceFilter() {
    const options = [
        { label: '全部', value: null },
        { label: '内置曲库', value: 'builtin' },
        { label: '自定义曲库', value: 'custom' },
    ];
    const container = $('sourceChips');
    options.forEach((opt, i) => {
        const btn = document.createElement('button');
        btn.className = 'settings-chip' + (i === 0 ? ' active' : '');
        btn.textContent = opt.label;
        btn.addEventListener('click', () => {
            container.querySelectorAll('.settings-chip').forEach(c => c.classList.remove('active'));
            btn.classList.add('active');
            filterState.source = opt.value;
            updateFilterCount();
        });
        container.appendChild(btn);
    });
}

// =====================================================================
// Settings Modal
// =====================================================================
function openSettings() {
    $('settingsModal').classList.add('show');
}
function closeSettings() {
    $('settingsModal').classList.remove('show');
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
    // Don't intercept when user is typing in an input/textarea
    const tag = document.activeElement?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA') return;

    const gameVisible = !$('v-game').classList.contains('hidden');
    const detailOpen = $('animeDetailModal').classList.contains('show');
    const settingsOpen = $('settingsModal').classList.contains('show');
    const endOpen = $('endModal').classList.contains('show');

    // Escape to close modals
    if (e.key === 'Escape') {
        if (settingsOpen) { closeSettings(); return; }
        if (detailOpen) { nextQuestion(); return; }
        if (endOpen) { $('endModal').classList.remove('show'); showView('menu'); return; }
    }

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
    if (e.target.id === 'animeDetailModal') { nextQuestion(); return; }
    if (e.target.id === 'settingsModal') { closeSettings(); return; }
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
        if (!confirm('主人确定要删除这首歌曲喵？')) return;
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
        case 'startSingle': startSingle(); break;
        case 'showView': showView(value); break;
        case 'pkCreate': pkCreate(); break;
        case 'pkJoin': pkJoin(); break;
        case 'pkShare': pkShare(); break;
        case 'pkStart': pkStart(); break;
        case 'togglePlay': togglePlay(); break;
        case 'restartGame': restartGame(); break;
        case 'clearRecords': clearRecords(); break;
        case 'goHome': $('endModal').classList.remove('show'); showView('menu'); break;
        case 'openSettings': openSettings(); break;
        case 'closeSettings': closeSettings(); break;
        case 'closeDetail': nextQuestion(); break;
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
initSakura();
initFilters();
initSourceFilter();
initQuestionCount();
updateCustomSongsUI();

// Bangumi floating panel toggle
$('bangumiToggle').addEventListener('click', () => {
    const panel = $('bangumiPanel');
    panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
});
$('bangumiClose').addEventListener('click', () => {
    $('bangumiPanel').style.display = 'none';
});

// Load YouTube IFrame API for full song playback
loadYouTubeAPI();

// Volume control
$('fpVolBtn')?.addEventListener('click', (e) => {
    e.stopPropagation();
    toggleVolumeSlider();
});
$('fpVolRange')?.addEventListener('input', (e) => {
    ytVolume = parseInt(e.target.value);
    volumeMuted = false;
    if (ytPlayer && ytPlayer.setVolume) ytPlayer.setVolume(ytVolume);
    updateVolIcon();
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
    ytVolume = parseInt(e.target.value);
    volumeMuted = false;
    if (ytPlayer && ytPlayer.setVolume) ytPlayer.setVolume(ytVolume);
    updateVolIcon();
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
