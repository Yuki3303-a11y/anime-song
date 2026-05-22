import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth, signInAnonymously, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { getFirestore, doc, getDoc, setDoc, onSnapshot, updateDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
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
};
const projectId = firebaseConfig.projectId;
let db, auth, user, roomId, roomUnsub;

try {
    const app = initializeApp(firebaseConfig);
    auth = getAuth(app);
    db = getFirestore(app);
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
};

function getMaxScore(n) {
    let s = 0;
    for (let i = 1; i <= n; i++) s += 10 + Math.min(i, 5);
    return s;
}

const $ = id => document.getElementById(id);
const audio = $('audioEl');

// =====================================================================
// Filter State
// =====================================================================
const filterState = { years: new Set(), type: null };

function getFilteredSongs() {
    return SONGS.filter(s => {
        if (filterState.years.size > 0 && !filterState.years.has(s.year)) return false;
        if (filterState.type && s.type !== filterState.type) return false;
        return true;
    });
}

function updateFilterCount() {
    const count = getFilteredSongs().length;
    $('filterCount').textContent = `共 ${count} 首可选`;
    $('songCount').textContent = count + '+';
}

// =====================================================================
// In-Memory Cache Layer (reads localStorage once, fast access after)
// =====================================================================
class MemCache {
    constructor(key, maxEntries) {
        this._key = key;
        this._max = maxEntries;
        this._data = null;
        this._dirty = false;
    }
    _load() {
        if (this._data) return;
        try { this._data = JSON.parse(localStorage.getItem(this._key) || '{}'); }
        catch { this._data = {}; }
    }
    get(k) {
        this._load();
        return this._data[k] || null;
    }
    set(k, v) {
        this._load();
        this._data[k] = v;
        this._dirty = true;
        const keys = Object.keys(this._data);
        if (keys.length > this._max) {
            keys.slice(0, keys.length - this._max).forEach(k => delete this._data[k]);
        }
        this._flush();
    }
    _flush() {
        if (!this._dirty) return;
        try { localStorage.setItem(this._key, JSON.stringify(this._data)); }
        catch {}
        this._dirty = false;
    }
}

const audioCache = new MemCache('audio_cache_v1', 500);
const animeDetailCache = new MemCache('anime_detail_cache_v1', 300);

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
    const timeoutId = setTimeout(() => controller.abort(), 4000);
    try {
        const res = await fetch(`https://api.bgm.tv/search/subject/${encodeURIComponent(keyword)}?limit=10&type=2`, {
            headers: { 'User-Agent': 'AnimeQuiz/1.0' },
            signal: controller.signal
        });
        clearTimeout(timeoutId);
        const data = await res.json();
        return data.list || [];
    } catch { clearTimeout(timeoutId); return []; }
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
    const timeoutId = setTimeout(() => controller.abort(), 4000);
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
    } catch { clearTimeout(timeoutId); return null; }
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
    meta.innerHTML = `<span>📅 ${song.year}年</span><span>🎤 ${song.type}</span>`;
    songInfo.innerHTML = `
        <div class="detail-song-icon">🎵</div>
        <div class="detail-song-text">
            <div class="detail-song-name">${songName}</div>
            <div class="detail-song-artist">${song.artist}</div>
        </div>
    `;

    // Reset cover state - show placeholder
    cover.src = '';
    cover.style.display = 'none';
    let placeholder = coverWrap.querySelector('.detail-cover-placeholder');
    if (!placeholder) {
        placeholder = document.createElement('div');
        placeholder.className = 'detail-cover-placeholder';
        placeholder.textContent = '🎬';
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
        }
        if (detail.titleRomaji) romaji.textContent = detail.titleRomaji;
        if (detail.bangumiId) {
            bangumiLink.href = `https://bgm.tv/subject/${detail.bangumiId}`;
        }
    });
}

// =====================================================================
// Sakura Particle System
// =====================================================================
function initSakura() {
    const canvas = document.getElementById('sakuraCanvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    let petals = [];
    const PETAL_COUNT = 8;

    function resize() {
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
    }
    resize();
    window.addEventListener('resize', resize);

    class Petal {
        constructor() { this.reset(true); }
        reset(init) {
            this.x = Math.random() * canvas.width;
            this.y = init ? Math.random() * canvas.height : -20;
            this.size = 6 + Math.random() * 8;
            this.speedY = 0.3 + Math.random() * 0.5;
            this.speedX = -0.2 + Math.random() * 0.4;
            this.rotation = Math.random() * Math.PI * 2;
            this.rotSpeed = (Math.random() - 0.5) * 0.02;
            this.opacity = 0.3 + Math.random() * 0.4;
            this.wobble = Math.random() * Math.PI * 2;
            this.wobbleSpeed = 0.01 + Math.random() * 0.02;
            const r = 236 + Math.floor(Math.random() * 20);
            const g = 180 + Math.floor(Math.random() * 60);
            const b = 200 + Math.floor(Math.random() * 40);
            this.color = `rgba(${r},${g},${b},${this.opacity})`;
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

    for (let i = 0; i < PETAL_COUNT; i++) petals.push(new Petal());

    function animate() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        petals.forEach(p => { p.update(); p.draw(); });
        requestAnimationFrame(animate);
    }
    animate();
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
function notify(text) {
    const n = $('notif');
    n.textContent = text;
    n.classList.add('show');
    setTimeout(() => n.classList.remove('show'), 2500);
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
        spark.style.color = Math.random() > 0.5 ? '#ec4899' : '#8b5cf6';
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
// View Navigation
// =====================================================================
function showView(viewName) {
    if (roomUnsub) { roomUnsub(); roomUnsub = null; }
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
    const pool = getFilteredSongs();
    if (pool.length < 4) { notify('曲库太少，请放宽筛选条件'); return; }
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
async function pkCreate() {
    if (!user) { notify('正在连接服务器...'); return; }
    const rid = String(Math.floor(1000 + Math.random() * 9000));
    roomId = rid;
    const ref = doc(db, 'artifacts', projectId, 'public', 'data', 'rooms', rid);
    try {
        await setDoc(ref, {
            host: user.uid,
            guest: null,
            status: 'waiting',
            timestamp: serverTimestamp(),
            scores: { [user.uid]: 0 },
            questions: shuffle([...Array(SONGS.length).keys()]).slice(0, 10),
        });
        enterRoom(rid);
    } catch (e) {
        notify('创建房间失败，请重试');
    }
}

async function pkJoin() {
    if (!user) { notify('正在连接服务器...'); return; }
    const rid = $('roomIdInput').value.trim();
    if (rid.length !== 4) { notify('请输入4位房间号'); return; }
    const ref = doc(db, 'artifacts', projectId, 'public', 'data', 'rooms', rid);
    try {
        const snap = await getDoc(ref);
        if (!snap.exists()) { notify('房间不存在'); return; }
        const d = snap.data();
        if (d.status !== 'waiting' && d.guest !== user.uid) { notify('房间已满'); return; }
        if (!d.guest) await updateDoc(ref, { guest: user.uid, [`scores.${user.uid}`]: 0 });
        roomId = rid;
        enterRoom(rid);
    } catch (e) {
        notify('加入房间失败，请检查房间号');
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
    await updateDoc(doc(db, 'artifacts', projectId, 'public', 'data', 'rooms', roomId), { status: 'playing' });
}

function enterRoom(rid) {
    showView('room');
    $('roomIdDisplay').textContent = rid;
    const ref = doc(db, 'artifacts', projectId, 'public', 'data', 'rooms', rid);
    roomUnsub = onSnapshot(ref, snap => {
        if (!snap.exists()) return;
        const d = snap.data();
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
                btn.textContent = '等待房主开始...';
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
            gameState.playlist = d.questions.map(i => SONGS[i]);
            $('singleHeader').classList.add('hidden');
            $('pkHeader').classList.remove('hidden');
            $('songInfo').classList.remove('show');
            showView('game');
            loadQuestion();
        }
        if (d.status === 'playing' && d.scores) {
            const opId = d.host === user.uid ? d.guest : d.host;
            gameState.score = d.scores[user.uid] || 0;
            gameState.opponentScore = d.scores[opId] || 0;
            $('myScoreText').textContent = gameState.score;
            $('opScoreText').textContent = gameState.opponentScore;
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
    } catch {}
}

// =====================================================================
// Game Core
// =====================================================================
function loadQuestion() {
    if (gameState.questionIndex >= gameState.playlist.length) {
        endGame();
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
    $('scoreText').textContent = gameState.score;
    $('optionsGrid').innerHTML = '<div class="loading-state"><div class="spinner"></div></div>';

    fetchAudio(q.title, q.artist, q.anime).then(url => {
        if (!url) {
            notify('⚠️ 该歌曲音频获取失败，已跳过');
            gameState.questionIndex++;
            loadQuestion();
            return;
        }
        audio.src = url;
        $('playBtn').disabled = false;
        $('playerStatus').textContent = '🎵 点击播放';
        renderOptions(gameState.correctAnime);
    });
}

async function fetchAudio(title, artist, anime) {
    const cacheKey = `${title}|${anime}`;
    const cached = audioCache.get(cacheKey);
    if (cached) return cached;

    async function searchItunes(term) {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000);
        try {
            const response = await fetch(
                `https://itunes.apple.com/search?term=${encodeURIComponent(term)}&media=music&entity=song&limit=5&country=JP`,
                { signal: controller.signal }
            );
            clearTimeout(timeoutId);
            const data = await response.json();
            if (data.resultCount > 0) {
                const lowerTitle = title.toLowerCase();
                const match = data.results.find(r =>
                    r.trackName?.toLowerCase().includes(lowerTitle) ||
                    r.collectionName?.toLowerCase().includes(lowerTitle) ||
                    lowerTitle.includes(r.trackName?.toLowerCase() || '')
                );
                return match ? match.previewUrl : data.results[0].previewUrl;
            }
        } catch { clearTimeout(timeoutId); }
        return null;
    }

    // Try 1: artist + title
    if (artist) {
        const url = await searchItunes(`${artist} ${title}`);
        if (url) { audioCache.set(cacheKey, url); return url; }
    }

    // Try 2: just title
    {
        const url = await searchItunes(title);
        if (url) { audioCache.set(cacheKey, url); return url; }
    }

    // Try 3: title with "anime" appended
    {
        const url = await searchItunes(`${title} anime`);
        if (url) { audioCache.set(cacheKey, url); return url; }
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
        btn.style.animationDelay = (i * 0.06) + 's';
        btn.onclick = () => handleAnswer(btn, opt);
        $('optionsGrid').appendChild(btn);
    });
}

function handleAnswer(btn, selected) {
    if (gameState.isLocked) return;
    gameState.isLocked = true;
    audio.pause();
    gameState.isPlaying = false;
    $('visualizer').classList.add('hidden');
    $('playIcon').innerHTML = '<path d="M8 5v14l11-7z"/>';

    const isCorrect = selected === gameState.correctAnime;
    showSongInfo(isCorrect);

    if (isCorrect) {
        btn.classList.add('correct');
        beep(523, 0.3);
        gameState.combo++;
        if (gameState.combo > gameState.maxCombo) gameState.maxCombo = gameState.combo;
        gameState.correctCount++;
        gameState.score += 10 + Math.min(gameState.combo, 5);
        if (gameState.combo >= 2) {
            showCombo();
            spawnSparkles($('comboArea'));
        }
        if (gameState.mode === 'pk' && roomId) {
            updateDoc(doc(db, 'artifacts', projectId, 'public', 'data', 'rooms', roomId), {
                [`scores.${user.uid}`]: gameState.score
            });
        }
    } else {
        btn.classList.add('wrong');
        beep(200, 0.3, 'sawtooth');
        gameState.combo = 0;
        $('comboArea').innerHTML = '';
        document.querySelectorAll('.opt-btn').forEach(b => {
            if (b.textContent === gameState.correctAnime) b.classList.add('reveal');
        });
    }

    $('scoreText').textContent = gameState.score;
    $('myScoreText').textContent = gameState.score;
    setTimeout(() => {
        showAnimeDetail(gameState.currentSong);
    }, 1500);
}

function showSongInfo(isCorrect) {
    const song = gameState.currentSong;
    const title = song.titleCN || song.title;
    const badge = $('resultBadge');

    $('songTitle').textContent = title;
    $('songAnime').textContent = `📺 ${song.anime}`;
    $('songArtist').textContent = `🎤 ${song.artist}`;

    if (isCorrect) {
        badge.className = 'result-badge correct';
        badge.textContent = '✓ 正确';
    } else {
        badge.className = 'result-badge wrong';
        badge.textContent = '✗ 错误';
    }
    $('songInfo').classList.add('show');
}

function showCombo() {
    $('comboArea').innerHTML = `<span class="combo-text">🔥 ${gameState.combo} COMBO!</span>`;
}

// =====================================================================
// Playback Controls
// =====================================================================
function togglePlay() {
    if (gameState.isPlaying) {
        audio.pause();
        gameState.isPlaying = false;
        $('visualizer').classList.add('hidden');
        $('playIcon').innerHTML = '<path d="M8 5v14l11-7z"/>';
    } else {
        if (audioContext) audioContext.resume();
        audio.play().catch(() => notify('播放失败，请重试'));
        gameState.isPlaying = true;
        $('visualizer').classList.remove('hidden');
        $('playIcon').innerHTML = '<rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/>';
    }
}

audio.onended = () => {
    gameState.isPlaying = false;
    $('visualizer').classList.add('hidden');
    $('playIcon').innerHTML = '<path d="M8 5v14l11-7z"/>';
};
audio.ontimeupdate = () => {
    if (audio.duration) $('progressFill').style.width = (audio.currentTime / audio.duration * 100) + '%';
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
        const maxScore = getMaxScore(gameState.playlist.length);
        const pct = maxScore > 0 ? gameState.score / maxScore * 100 : 0;
        $('endEmoji').textContent = pct >= 80 ? '🏆' : pct >= 50 ? '🎉' : '💪';
        $('endTitle').textContent = '挑战完成';
        $('endScore').textContent = gameState.score;
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
        t: new Date().toLocaleDateString('zh-CN')
    });
    recs.sort((a, b) => b.s - a.s);
    localStorage.setItem('aq_rec', JSON.stringify(recs.slice(0, 50)));
}

function restartGame() {
    $('endModal').classList.remove('show');
    if (gameState.mode === 'single') startSingle();
    else showView('menu');
}

function nextQuestion() {
    $('animeDetailModal').classList.remove('show');
    gameState.questionIndex++;
    loadQuestion();
}

// =====================================================================
// Leaderboard
// =====================================================================
function renderLeaderboard() {
    const recs = JSON.parse(localStorage.getItem('aq_rec') || '[]');
    const list = $('recordsList');
    if (!recs.length) {
        list.innerHTML = '<p class="empty-state">🌸 暂无记录，快来挑战吧！</p>';
        return;
    }
    const medals = ['🥇', '🥈', '🥉'];
    list.innerHTML = recs.slice(0, 10).map((r, i) => `
        <div class="record-item">
            <div class="record-rank">${i < 3 ? medals[i] : (i + 1)}</div>
            <div class="record-info">
                <div class="record-score">${r.s}分</div>
                <div class="record-meta">${r.m==='single'?'🎮 单人':'⚔️ PK'} · ${r.t}</div>
            </div>
            <div class="record-detail">🔥${r.c} ✓${r.r}</div>
        </div>
    `).join('');
}

function clearRecords() {
    localStorage.removeItem('aq_rec');
    renderLeaderboard();
    notify('记录已清除');
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
    allBtn.className = 'filter-chip active';
    allBtn.textContent = '全部';
    allBtn.addEventListener('click', () => {
        yearChips.querySelectorAll('.filter-chip').forEach(c => c.classList.remove('active'));
        allBtn.classList.add('active');
        filterState.years.clear();
        updateFilterCount();
    });
    yearChips.appendChild(allBtn);

    // Individual year buttons
    const years = AVAILABLE_YEARS.slice().reverse();
    years.forEach(y => {
        const btn = document.createElement('button');
        btn.className = 'filter-chip';
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
            // Update "全部" button state
            if (filterState.years.size === 0) {
                allBtn.classList.add('active');
            } else {
                allBtn.classList.remove('active');
            }
            updateFilterCount();
        });
        yearChips.appendChild(btn);
    });

    // Type chips
    const typeOptions = [
        { label: '全部', value: null },
        { label: 'OP', value: 'OP' },
        { label: 'ED', value: 'ED' },
        { label: '插曲', value: 'IN' },
    ];
    const typeChips = $('typeChips');
    typeOptions.forEach((t, i) => {
        const btn = document.createElement('button');
        btn.className = 'filter-chip' + (i === 0 ? ' active' : '');
        btn.textContent = t.label;
        btn.addEventListener('click', () => {
            typeChips.querySelectorAll('.filter-chip').forEach(c => c.classList.remove('active'));
            btn.classList.add('active');
            filterState.type = t.value;
            updateFilterCount();
        });
        typeChips.appendChild(btn);
    });

    updateFilterCount();
}

function toggleFilters() {
    const panel = $('filterPanel');
    const arrow = $('filterArrow');
    panel.classList.toggle('hidden');
    arrow.classList.toggle('open');
}

// =====================================================================
// Question Count Selector
// =====================================================================
function initQuestionCount() {
    const container = $('qcountChips');
    const options = [10, 20, 30];
    options.forEach((n, i) => {
        const btn = document.createElement('button');
        btn.className = 'filter-chip' + (i === 0 ? ' active' : '');
        btn.textContent = n + '题';
        btn.addEventListener('click', () => {
            container.querySelectorAll('.filter-chip').forEach(c => c.classList.remove('active'));
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
    // 1-4 keys for answer selection during gameplay
    if (!gameState.isLocked && !$('v-game').classList.contains('hidden')) {
        const key = parseInt(e.key);
        if (key >= 1 && key <= 4) {
            const btns = document.querySelectorAll('.opt-btn');
            if (btns[key - 1]) btns[key - 1].click();
        }
        // Space to toggle play
        if (e.key === ' ' || e.code === 'Space') {
            e.preventDefault();
            if (!$('playBtn').disabled) togglePlay();
        }
    }
    // Escape to close modals
    if (e.key === 'Escape') {
        if ($('animeDetailModal').classList.contains('show')) {
            nextQuestion();
        } else if ($('endModal').classList.contains('show')) {
            // don't close end modal with escape
        }
    }
});

// =====================================================================
// Event Delegation
// =====================================================================
document.addEventListener('click', (e) => {
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
        case 'toggleFilters': toggleFilters(); break;
        case 'closeDetail': $('animeDetailModal').classList.remove('show'); break;
        case 'nextQuestion': nextQuestion(); break;
    }
});

// =====================================================================
// Init
// =====================================================================
initSakura();
initFilters();
initQuestionCount();
