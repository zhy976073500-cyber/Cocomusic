// Cocomusic 音源接口层
// 后端复用 Sage ECS 上已在跑的三个服务（经 folia.cococcfans.cn 同域路径转发，只调用、不改动）：
//   netease -> 网易云后端（3102）  kugou -> 酷狗后端（3103）  qq -> QQ 适配层（3101）
// 网易云部分契约已于 2026-10-27 逐条实测核准（见 goals/ios-folia/hidden_files/netease-contracts.md）。

export type ProviderId = 'netease' | 'kugou' | 'qq' | 'local';

export interface Song {
    id: string;
    provider: ProviderId;
    name: string;
    artists: string;
    album: string;
    coverUrl?: string;
    durationMs?: number;
    /** 平台标记不可播（下架/无版权等），UI 置灰 */
    gray?: boolean;
    /** 本地歌曲的 IndexedDB 键（provider=local 时用） */
    localKey?: string;
    /** QQ：file.media_mid，取播放地址时带上提高命中 */
    mediaId?: string;
    /** QQ：数字 id（歌词 musicu 用）；酷狗：MixSongID（album_audio_id） */
    numericId?: string;
    /** 酷狗：AlbumID，取播放地址时带上 */
    albumId?: string;
}

export interface PlaylistInfo {
    id: string;
    provider: ProviderId;
    name: string;
    coverUrl?: string;
    trackCount: number;
    playCount?: number;
    creator?: string;
    description?: string;
    /** QQ 本人歌单的目录号（取歌时用；201 = 我喜欢） */
    dirId?: string;
    /** QQ 榜单期号 */
    period?: string;
    /** 是否本人歌单（QQ 区分本人/公开取歌路径） */
    own?: boolean;
}

const API_BASE = 'https://folia.cococcfans.cn';

export function httpsify(url?: string): string | undefined {
    if (!url) return undefined;
    return url.startsWith('http://') ? `https://${url.slice(7)}` : url;
}

async function getJson<T>(path: string, params: Record<string, string | number | boolean> = {}, cookie?: string): Promise<T> {
    const entries = Object.entries(params).map(([k, v]) => [k, String(v)]);
    if (cookie) entries.push(['cookie', cookie]);
    const qs = new URLSearchParams(entries);
    const res = await fetch(`${API_BASE}${path}?${qs.toString()}`, { credentials: 'include' });
    if (!res.ok) throw new Error(`HTTP ${res.status} ${path}`);
    return (await res.json()) as T;
}

// ---------------- 网易云会话（cookie 存本地、以参数回传；存前必须裁剪） ----------------

const NE_COOKIE_KEY = 'cocomusic.netease.cookie';

const COOKIE_ATTRS = new Set(['max-age', 'expires', 'path', 'domain', 'secure', 'httponly', 'samesite', 'priority']);

/** 后端给的 cookie 是 Set-Cookie 整串，整串回传会触发风控（-460）；只留 名=值 对。 */
export function trimCookie(raw: string): string {
    const pairs: string[] = [];
    for (const seg of raw.split(';')) {
        const t = seg.trim();
        if (!t) continue;
        const eq = t.indexOf('=');
        if (eq <= 0) continue;
        const name = t.slice(0, eq).trim();
        if (COOKIE_ATTRS.has(name.toLowerCase())) continue;
        pairs.push(`${name}=${t.slice(eq + 1).trim()}`);
    }
    return pairs.join('; ');
}

export function getNeteaseCookie(): string {
    try {
        return localStorage.getItem(NE_COOKIE_KEY) ?? '';
    } catch {
        return '';
    }
}

export function setNeteaseCookie(raw: string) {
    try {
        const trimmed = trimCookie(raw);
        if (trimmed) localStorage.setItem(NE_COOKIE_KEY, trimmed);
        else localStorage.removeItem(NE_COOKIE_KEY);
    } catch { /* 忽略存储异常 */ }
}

export function clearNeteaseCookie() {
    try {
        localStorage.removeItem(NE_COOKIE_KEY);
    } catch { /* 同上 */ }
}

function ne<T>(path: string, params: Record<string, string | number | boolean> = {}): Promise<T> {
    const cookie = getNeteaseCookie();
    return getJson<T>(path, params, cookie || undefined);
}

// ---------------- 网易云：搜索 / 播放 / 歌词 ----------------

function mapNeteaseSong(s: any): Song {
    const priv = s.privilege ?? {};
    return {
        id: String(s.id),
        provider: 'netease',
        name: s.name ?? '',
        artists: (s.ar ?? s.artists ?? []).map((a: any) => a.name).join(' / '),
        album: s.al?.name ?? s.album?.name ?? '',
        coverUrl: httpsify(s.al?.picUrl ?? s.album?.picUrl),
        durationMs: s.dt ?? s.duration,
        gray: typeof priv.st === 'number' ? priv.st < 0 : undefined,
    };
}

export async function searchNetease(keywords: string, limit = 30): Promise<Song[]> {
    const data = await ne<any>('/api/netease/cloudsearch', { keywords, limit, type: 1 });
    const songs = data?.result?.songs ?? [];
    const privs: any[] = data?.result?.privileges ?? data?.privileges ?? [];
    return songs.map((s: any, i: number) => mapNeteaseSong(privs[i] ? { ...s, privilege: s.privilege ?? privs[i] } : s));
}

export async function neteaseSongUrl(id: string): Promise<string | null> {
    const data = await ne<any>('/api/netease/song/url/v1', { id, level: 'exhigh', randomCNIP: true, https: true });
    const item = data?.data?.[0];
    if (!item || item.code !== 200 || !item.url) return null;
    return httpsify(item.url) ?? null;
}

export interface NeteaseLyricRaw {
    lrc?: string;
    yrc?: string;
    tlyric?: string;
}

export async function neteaseLyric(id: string): Promise<NeteaseLyricRaw> {
    const data = await ne<any>('/api/netease/lyric/new', { id });
    return {
        lrc: data?.lrc?.lyric || undefined,
        yrc: data?.yrc?.lyric || undefined,
        tlyric: data?.tlyric?.lyric || undefined,
    };
}

// ---------------- 网易云：登录（扫码）与账号 ----------------

export interface NeteaseProfile {
    userId: number;
    nickname: string;
    avatarUrl?: string;
}

export async function neteaseQrKey(): Promise<string> {
    const data = await ne<any>('/api/netease/login/qr/key', { timestamp: Date.now() });
    const key = data?.data?.unikey;
    if (!key) throw new Error('拿不到二维码 key');
    return String(key);
}

export async function neteaseQrCreate(key: string): Promise<string> {
    const data = await ne<any>('/api/netease/login/qr/create', { key, qrimg: true, timestamp: Date.now() });
    const img = data?.data?.qrimg;
    if (!img) throw new Error('拿不到二维码图片');
    return String(img);
}

/** 返回后端状态码：801 等待扫码 / 802 已扫待确认 / 800 过期 / 803 成功（此时已存 cookie） */
export async function neteaseQrCheck(key: string): Promise<number> {
    const data = await ne<any>('/api/netease/login/qr/check', { key, timestamp: Date.now() });
    const code = Number(data?.code ?? 0);
    if (code === 803 && data?.cookie) setNeteaseCookie(String(data.cookie));
    return code;
}

export async function neteaseProfile(): Promise<NeteaseProfile | null> {
    if (!getNeteaseCookie()) return null;
    const data = await ne<any>('/api/netease/user/account', { timestamp: Date.now() });
    const p = data?.profile;
    if (!p) return null;
    return { userId: Number(p.userId), nickname: String(p.nickname ?? ''), avatarUrl: httpsify(p.avatarUrl) };
}

export async function neteaseLogout(): Promise<void> {
    try {
        await ne('/api/netease/logout', { timestamp: Date.now() });
    } catch { /* 退出失败也清本地态 */ }
    clearNeteaseCookie();
}

// ---------------- 网易云：歌单 / 红心 / 首页 ----------------

export async function neteaseUserPlaylists(uid: number): Promise<PlaylistInfo[]> {
    const out: PlaylistInfo[] = [];
    let offset = 0;
    const limit = 30;
    for (let page = 0; page < 10; page++) {
        const data = await ne<any>('/api/netease/user/playlist', { uid, limit, offset, timestamp: Date.now() });
        const list: any[] = data?.playlist ?? [];
        for (const p of list) {
            out.push({
                id: String(p.id),
                provider: 'netease',
                name: p.name ?? '',
                coverUrl: httpsify(p.coverImgUrl),
                trackCount: Number(p.trackCount ?? 0),
                playCount: p.playCount,
                creator: p.creator?.nickname,
            });
        }
        if (!data?.more || !list.length) break;
        offset += list.length;
    }
    return out;
}

export async function neteasePlaylistSongs(id: string, maxSongs = 1000): Promise<Song[]> {
    const out: Song[] = [];
    const limit = 100;
    let offset = 0;
    while (out.length < maxSongs) {
        const data = await ne<any>('/api/netease/playlist/track/all', { id, limit, offset });
        const songs: any[] = data?.songs ?? [];
        const privs: any[] = data?.privileges ?? [];
        songs.forEach((s, i) => out.push(mapNeteaseSong(privs[i] ? { ...s, privilege: s.privilege ?? privs[i] } : s)));
        if (songs.length < limit) break;
        offset += songs.length;
    }
    return out;
}

export async function neteaseLikeList(uid: number): Promise<string[]> {
    const data = await ne<any>('/api/netease/likelist', { uid, timestamp: Date.now() });
    const ids: any[] = data?.ids ?? [];
    return ids.map(String);
}

export async function neteaseLike(id: string, like: boolean): Promise<void> {
    await ne('/api/netease/like', { id, like, timestamp: Date.now() });
}

export async function neteaseDailySongs(): Promise<Song[]> {
    const data = await ne<any>('/api/netease/recommend/songs', { afresh: false, timestamp: Date.now() });
    const songs: any[] = data?.data?.dailySongs ?? [];
    return songs.map(mapNeteaseSong);
}

export async function neteasePersonalized(limit = 12): Promise<PlaylistInfo[]> {
    const data = await ne<any>('/api/netease/personalized', { limit });
    const list: any[] = data?.result ?? [];
    return list.map((p) => ({
        id: String(p.id),
        provider: 'netease' as const,
        name: p.name ?? '',
        coverUrl: httpsify(p.picUrl),
        trackCount: Number(p.trackCount ?? 0),
        playCount: p.playCount,
    }));
}

export async function neteaseToplists(): Promise<PlaylistInfo[]> {
    const data = await ne<any>('/api/netease/toplist');
    const list: any[] = data?.list ?? [];
    return list
        .filter((t) => t.ToplistType)
        .map((t) => ({
            id: String(t.id),
            provider: 'netease' as const,
            name: t.name ?? '',
            coverUrl: httpsify(t.coverImgUrl),
            trackCount: Number(t.trackCount ?? 0),
            playCount: t.playCount,
            description: t.updateFrequency,
        }));
}

// ---------------- 酷狗（契约已实测核准，见 qq-kugou-contracts.md 第二节） ----------------

const KG_SESSION_KEY = 'cocomusic.kugou.session';

interface KugouSession {
    token: string;
    userid: string;
    dfid?: string;
}

export function getKugouSession(): KugouSession | null {
    try {
        const raw = localStorage.getItem(KG_SESSION_KEY);
        return raw ? (JSON.parse(raw) as KugouSession) : null;
    } catch {
        return null;
    }
}

export function setKugouSession(s: KugouSession | null) {
    try {
        if (s) localStorage.setItem(KG_SESSION_KEY, JSON.stringify(s));
        else localStorage.removeItem(KG_SESSION_KEY);
    } catch { /* 忽略 */ }
}

function kg<T>(path: string, params: Record<string, string | number | boolean> = {}): Promise<T> {
    const s = getKugouSession();
    const cookie = s ? `token=${s.token};userid=${s.userid}${s.dfid ? `;dfid=${s.dfid}` : ''}` : undefined;
    return getJson<T>(path, params, cookie);
}

function stripEmTags(s: string): string {
    return s.replace(/<[^>]+>/g, '');
}

function mapKugouSong(it: any): Song {
    // 兼容两种条目形状：搜索的 complexsearch 形状与榜单 rank/audio 形状
    const hash = String(it.FileHash ?? it.audio_info?.hash_128 ?? it.hash ?? '').toUpperCase();
    const singers = (it.Singers ?? it.authors ?? [])
        .map((a: any) => a.name ?? a.author_name)
        .filter(Boolean)
        .join(' / ');
    const image = it.Image ?? it.album_img ?? it.imgurl;
    return {
        id: hash,
        provider: 'kugou',
        name: stripEmTags(String(it.SongName ?? it.songname ?? it.song_name ?? '')),
        artists: singers,
        album: String(it.AlbumName ?? it.album_name ?? ''),
        coverUrl: httpsify(typeof image === 'string' ? image.replace('{size}', '400') : undefined),
        durationMs: it.Duration ? Number(it.Duration) * 1000 : it.audio_info?.duration_128,
        albumId: it.AlbumID != null ? String(it.AlbumID) : it.album_id != null ? String(it.album_id) : undefined,
        numericId: it.MixSongID != null ? String(it.MixSongID) : it.album_audio_id != null ? String(it.album_audio_id) : undefined,
    };
}

export async function searchKugou(keywords: string, limit = 30): Promise<Song[]> {
    const data = await kg<any>('/api/kugou/search', { keywords, type: 'song', page: 1, pagesize: limit });
    const lists: any[] = data?.data?.lists ?? [];
    return lists.map(mapKugouSong).filter((s) => s.id);
}

/** 设备验证前置：让后端种下 dfid 等设备 cookie（靠浏览器 cookie 机制回带） */
async function kugouEnsureDevice(): Promise<void> {
    try {
        await fetch(`${API_BASE}/api/kugou/register/dev`, { credentials: 'include' });
    } catch { /* 失败不阻断后续兜底 */ }
}

export async function kugouSongUrl(song: Song): Promise<string | null> {
    await kugouEnsureDevice();
    const qualities: (string | undefined)[] = ['320', '128', undefined];
    for (const quality of qualities) {
        try {
            const params: Record<string, string | number | boolean> = { hash: song.id };
            if (quality) params.quality = quality;
            if (song.albumId) params.album_id = song.albumId;
            if (song.numericId) params.album_audio_id = song.numericId;
            const data = await kg<any>('/api/kugou/song/url', params);
            const d = Array.isArray(data?.data) ? data.data[0] : data?.data;
            const url = d?.play_url ?? d?.url;
            if (url) return httpsify(String(url)) ?? null;
        } catch { /* 换下一档 */ }
    }
    // 最后兜底：酷狗老 getSongInfo 直连（免费歌有整首，付费歌为空）
    try {
        const res = await fetch(`https://m.kugou.com/app/i/getSongInfo.php?cmd=playInfo&hash=${encodeURIComponent(song.id)}`);
        if (res.ok) {
            const data: any = await res.json();
            if (data?.url) return httpsify(String(data.url)) ?? null;
            if (data?.backup_url) return httpsify(String(data.backup_url)) ?? null;
        }
    } catch { /* 兜底失败即放弃 */ }
    return null;
}

/** 酷狗歌词两步：找候选 -> 取 KRC（服务端已解密）。返回 KRC 原文，解析在 lyrics.ts */
export async function kugouLyricKrc(song: Song): Promise<string | null> {
    const params: Record<string, string | number | boolean> = { hash: song.id, man: 'no' };
    if (song.durationMs) params.duration = song.durationMs;
    if (song.numericId) params.album_audio_id = song.numericId;
    const found = await kg<any>('/api/kugou/search/lyric', params);
    const cand = found?.candidates?.[0];
    if (!cand?.id || !cand?.accesskey) return null;
    const data = await kg<any>('/api/kugou/lyric', { id: cand.id, accesskey: cand.accesskey, fmt: 'krc', decode: true });
    return data?.decodeContent ? String(data.decodeContent) : null;
}

export async function kugouQrKey(): Promise<{ key: string; img: string }> {
    const data = await kg<any>('/api/kugou/login/qr/key', { timestamp: Date.now() });
    const key = data?.data?.qrcode;
    const img = data?.data?.qrcode_img;
    if (!key || !img) throw new Error('拿不到酷狗二维码');
    return { key: String(key), img: String(img) };
}

/** 返回 data.status：0 过期 / 1 等待 / 2 待确认 / 3 已扫 / 4 成功（此时已存会话） */
export async function kugouQrCheck(key: string): Promise<number> {
    const data = await kg<any>('/api/kugou/login/qr/check', { key, qrcode: key, timestamp: Date.now() });
    const status = Number(data?.data?.status ?? 0);
    if (status === 4 && data?.data?.token) {
        setKugouSession({
            token: String(data.data.token),
            userid: String(data.data.userid ?? data.data.user_id ?? ''),
            dfid: data.data.dfid ? String(data.data.dfid) : undefined,
        });
    }
    return status;
}

export interface KugouProfile {
    userid: string;
    nickname: string;
    avatarUrl?: string;
}

export async function kugouProfile(): Promise<KugouProfile | null> {
    const s = getKugouSession();
    if (!s) return null;
    try {
        const data = await kg<any>('/api/kugou/user/detail', { userid: s.userid });
        const d = data?.data;
        if (!d?.userid) return null;
        return {
            userid: String(d.userid),
            nickname: String(d.nickname ?? d.nick_name ?? ''),
            avatarUrl: httpsify(d.pic ?? d.avatar),
        };
    } catch {
        return null;
    }
}

export async function kugouUserPlaylists(): Promise<PlaylistInfo[]> {
    const s = getKugouSession();
    if (!s) return [];
    const data = await kg<any>('/api/kugou/user/playlist', { userid: s.userid, page: 1, pagesize: 50 });
    const lists: any[] = data?.data?.lists ?? data?.data?.info ?? [];
    return lists
        .filter((p) => p.listid != null || p.global_collection_id)
        .map((p) => ({
            id: String(p.global_collection_id ?? p.listid),
            provider: 'kugou' as const,
            name: String(p.name ?? p.listname ?? ''),
            coverUrl: httpsify(p.pic ?? p.imgurl),
            trackCount: Number(p.count ?? p.song_count ?? 0),
            own: true,
        }));
}

export async function kugouPlaylistSongs(id: string, maxSongs = 500): Promise<Song[]> {
    const out: Song[] = [];
    let page = 1;
    const pagesize = 100;
    while (out.length < maxSongs) {
        const data = await kg<any>('/api/kugou/playlist/track/all', { id, page, pagesize });
        const lists: any[] = data?.data?.lists ?? data?.data?.songs ?? [];
        if (!lists.length) break;
        out.push(...lists.map(mapKugouSong).filter((s) => s.id));
        if (lists.length < pagesize) break;
        page += 1;
    }
    return out;
}

export async function kugouRanks(): Promise<PlaylistInfo[]> {
    const data = await kg<any>('/api/kugou/rank/list');
    const info: any[] = data?.data?.info ?? [];
    return info.map((r) => ({
        id: String(r.rankid),
        provider: 'kugou' as const,
        name: String(r.rankname ?? ''),
        coverUrl: httpsify(r.imgurl),
        trackCount: 0,
        description: r.intro,
    }));
}

export async function kugouRankSongs(rankid: string): Promise<Song[]> {
    const data = await kg<any>('/api/kugou/rank/audio', { rankid, page: 1, pagesize: 100 });
    const lists: any[] = data?.data?.songlist ?? [];
    return lists.map(mapKugouSong).filter((s) => s.id);
}

// ---------------- QQ（契约已实测核准，见 qq-kugou-contracts.md 第一节） ----------------

const QQ_COOKIE_KEY = 'cocomusic.qq.cookie';

export function getQQCookie(): string {
    try {
        return localStorage.getItem(QQ_COOKIE_KEY) ?? '';
    } catch {
        return '';
    }
}

export function setQQCookie(raw: string) {
    try {
        if (raw) localStorage.setItem(QQ_COOKIE_KEY, raw);
        else localStorage.removeItem(QQ_COOKIE_KEY);
    } catch { /* 忽略 */ }
}

function qq<T>(path: string, params: Record<string, string | number | boolean> = {}): Promise<T> {
    const cookie = getQQCookie();
    return getJson<T>(path, { ...params, timestamp: Date.now() }, cookie || undefined);
}

function mapQQSong(it: any): Song {
    const albumMid = it.album?.mid;
    return {
        id: String(it.mid ?? ''),
        provider: 'qq',
        name: String(it.name ?? it.title ?? ''),
        artists: (it.singer ?? []).map((s: any) => s.name).filter(Boolean).join(' / '),
        album: String(it.album?.name ?? ''),
        coverUrl: albumMid ? `https://y.qq.com/music/photo_new/T002R300x300M000${albumMid}.jpg` : undefined,
        durationMs: it.interval ? Number(it.interval) * 1000 : undefined,
        mediaId: it.file?.media_mid,
        numericId: it.id != null ? String(it.id) : undefined,
    };
}

export async function searchQQ(keywords: string, limit = 20): Promise<Song[]> {
    const data = await qq<any>('/api/qq/search', { keyword: keywords, type: 'song', page: 1, limit: Math.min(20, limit) });
    const items: any[] = data?.items ?? [];
    return items.map(mapQQSong).filter((s) => s.id);
}

/** QQ 播放必须先登录（本部署无会话 401）；未登录直接返回 null，让播放器跳歌提示 */
export async function qqSongUrl(song: Song): Promise<string | null> {
    if (!getQQCookie()) return null;
    for (const quality of ['320', '128']) {
        try {
            const params: Record<string, string | number | boolean> = { quality };
            if (song.mediaId) params.mediaId = song.mediaId;
            const data = await qq<any>(`/api/qq/getMusicPlay/${encodeURIComponent(song.id)}`, params);
            const entry = data?.data?.playUrl?.[song.id] ?? Object.values(data?.data?.playUrl ?? {})[0] as any;
            if (entry?.url) return httpsify(String(entry.url)) ?? null;
            if (entry && 'url' in entry && !entry.url) return null; // 账号不能播，不再降档重试
        } catch { /* 换下一档 */ }
    }
    return null;
}

export async function qqQrKey(channel: 'qq' | 'wechat' = 'qq'): Promise<string> {
    const data = await qq<any>('/api/qq/login/qr/key', { channel });
    const key = data?.data?.unikey;
    if (!key) throw new Error('拿不到 QQ 二维码 key');
    return String(key);
}

export async function qqQrCreate(key: string): Promise<string> {
    const data = await qq<any>('/api/qq/login/qr/create', { key });
    const img = data?.data?.qrimg;
    if (!img) throw new Error('拿不到 QQ 二维码图片');
    return String(img);
}

/** 801 等待 / 802 已扫待确认 / 800 过期 / 803 成功（此时已存 cookie） */
export async function qqQrCheck(key: string): Promise<number> {
    const data = await qq<any>('/api/qq/login/qr/check', { key });
    const code = Number(data?.code ?? 0);
    if (code === 803 && data?.cookie) setQQCookie(String(data.cookie));
    else if (code === 803 && data?.data?.cookie) setQQCookie(String(data.data.cookie));
    return code;
}

export interface QQProfile {
    nickname: string;
    avatarUrl?: string;
}

export async function qqProfile(): Promise<QQProfile | null> {
    if (!getQQCookie()) return null;
    try {
        const data = await qq<any>('/api/qq/login/status');
        const p = data?.data?.profile;
        if (!p) return null;
        return {
            nickname: String(p.nickname ?? p.nick ?? p.name ?? p.info?.nick ?? ''),
            avatarUrl: httpsify(p.info?.logo ?? p.avatar ?? p.logo),
        };
    } catch {
        return null;
    }
}

export async function qqLogout(): Promise<void> {
    try {
        await qq('/api/qq/logout');
    } catch { /* 同网易云 */ }
    setQQCookie('');
}

export async function qqUserPlaylists(): Promise<PlaylistInfo[]> {
    const data = await qq<any>('/api/qq/user/playlist');
    const list: any[] = data?.playlist ?? [];
    return list.map((p) => {
        const own = p.dirName != null;
        return {
            id: String(p.tid ?? p.dissid ?? ''),
            provider: 'qq' as const,
            name: String(p.dirName ?? p.name ?? p.dissname ?? ''),
            coverUrl: httpsify(p.bigpicUrl ?? p.picUrl ?? p.logo),
            trackCount: Number(p.songNum ?? p.songnum ?? 0),
            dirId: p.dirId != null ? String(p.dirId) : undefined,
            own,
        };
    }).filter((p) => p.id);
}

export async function qqPlaylistSongs(pl: PlaylistInfo): Promise<Song[]> {
    if (pl.own) {
        const isLiked = pl.dirId === '201';
        const path = isLiked ? '/api/qq/user/liked-songs' : '/api/qq/user/playlist-detail';
        const out: Song[] = [];
        const limit = 100;
        let offset = 0;
        for (let page = 0; page < 10; page++) {
            const params: Record<string, string | number | boolean> = { offset, limit };
            if (!isLiked) {
                params.tid = pl.id;
                if (pl.dirId) params.dirid = pl.dirId;
            }
            const data = await qq<any>(path, params);
            const songs: any[] = data?.songs ?? [];
            out.push(...songs.map(mapQQSong).filter((s) => s.id));
            if (!data?.more || !songs.length) break;
            offset += songs.length;
        }
        return out;
    }
    const data = await qq<any>(`/api/qq/getSongListDetail/${encodeURIComponent(pl.id)}`);
    const cd = data?.response?.cdlist?.[0];
    if (!cd?.dissname) return [];
    const songs: any[] = cd.songlist ?? [];
    return songs.map(mapQQSong).filter((s) => s.id);
}

export async function qqToplists(): Promise<PlaylistInfo[]> {
    const data = await qq<any>('/api/qq/recommend/toplists');
    const groups: any[] = data?.groups ?? data?.data?.groups ?? [];
    const out: PlaylistInfo[] = [];
    for (const g of groups) {
        for (const t of g.toplists ?? []) {
            out.push({
                id: String(t.id),
                provider: 'qq',
                name: String(t.title ?? ''),
                coverUrl: httpsify(t.cover),
                trackCount: Number(t.total ?? 0),
                period: t.period,
                description: g.name,
            });
        }
    }
    return out;
}

export async function qqToplistSongs(pl: PlaylistInfo): Promise<Song[]> {
    const params: Record<string, string | number | boolean> = { id: pl.id, offset: 0, limit: 100 };
    if (pl.period) params.period = pl.period;
    const data = await qq<any>('/api/qq/recommend/toplist', params);
    const songs: any[] = data?.songs ?? [];
    return songs.map(mapQQSong).filter((s) => s.id);
}

// ---------------- 聚合 ----------------

export interface ProviderSearchResult {
    provider: ProviderId;
    songs: Song[];
    error?: string;
}

/** 三源并行搜索，单源失败不拖垮整页（错误单独标注，供 UI 提示） */
export async function searchAllProviders(keywords: string, limit = 30): Promise<ProviderSearchResult[]> {
    const jobs: [ProviderId, (kw: string, limit: number) => Promise<Song[]>][] = [
        ['netease', searchNetease],
        ['kugou', searchKugou],
        ['qq', searchQQ],
    ];
    const settled = await Promise.allSettled(jobs.map(([, fn]) => fn(keywords, limit)));
    return jobs.map(([provider], i) => {
        const r = settled[i];
        if (r.status === 'fulfilled') return { provider, songs: r.value };
        return { provider, songs: [], error: r.reason instanceof Error ? r.reason.message : String(r.reason) };
    });
}

/** 兼容旧调用：只取网易云结果 */
export async function searchAll(keywords: string): Promise<Song[]> {
    return searchNetease(keywords);
}

export async function resolvePlayUrl(song: Song): Promise<string | null> {
    switch (song.provider) {
        case 'netease':
            return neteaseSongUrl(song.id);
        case 'kugou':
            return kugouSongUrl(song);
        case 'qq':
            return qqSongUrl(song);
        default:
            return null;
    }
}
