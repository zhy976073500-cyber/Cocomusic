// Cocomusic 音源接口层
// 后端复用 Sage ECS 上已在跑的三个服务（经 folia.cococcfans.cn 同域路径转发）：
//   netease -> 网易云后端（3102）  kugou -> 酷狗后端（3103）  qq -> QQ/歌词适配层（3101）
// 注意：下面的具体路由按各开源后端（NeteaseCloudMusicApi / KuGouMusicApi / api-enhanced）
// 的常见形态先写，接入时逐个对着线上服务实测核准后再改，不要凭记忆当准。

export type ProviderId = 'netease' | 'kugou' | 'qq';

export interface Song {
    id: string;
    provider: ProviderId;
    name: string;
    artists: string;
    album: string;
    coverUrl?: string;
    durationMs?: number;
}

const API_BASE = 'https://folia.cococcfans.cn';

async function getJson<T>(path: string, params: Record<string, string | number>): Promise<T> {
    const qs = new URLSearchParams(Object.entries(params).map(([k, v]) => [k, String(v)]));
    const res = await fetch(`${API_BASE}${path}?${qs.toString()}`, { credentials: 'include' });
    if (!res.ok) throw new Error(`HTTP ${res.status} ${path}`);
    return (await res.json()) as T;
}

// ---- 网易云（NeteaseCloudMusicApi 形态）----
export async function searchNetease(keywords: string, limit = 30): Promise<Song[]> {
    const data = await getJson<any>('/api/netease/cloudsearch', { keywords, limit, type: 1 });
    const songs = data?.result?.songs ?? [];
    return songs.map((s: any) => ({
        id: String(s.id),
        provider: 'netease' as const,
        name: s.name,
        artists: (s.ar ?? []).map((a: any) => a.name).join(' / '),
        album: s.al?.name ?? '',
        coverUrl: s.al?.picUrl,
        durationMs: s.dt,
    }));
}

export async function neteaseSongUrl(id: string): Promise<string | null> {
    const data = await getJson<any>('/api/netease/song/url/v1', { id, level: 'exhigh' });
    return data?.data?.[0]?.url ?? null;
}

export async function neteaseLyric(id: string): Promise<{ lrc?: string; ttml?: string }> {
    const data = await getJson<any>('/api/netease/lyric/new', { id });
    return { lrc: data?.lrc?.lyric, ttml: data?.ttml?.lyric };
}

// ---- 酷狗 / QQ ----
// TODO（接入时核准）：酷狗走 KuGouMusicApi 路由、QQ 走 api-enhanced 路由，
// 先占位，实测线上返回结构后补齐映射。
export async function searchKugou(_keywords: string): Promise<Song[]> {
    throw new Error('kugou adapter pending: verify routes against live backend');
}

export async function searchQQ(_keywords: string): Promise<Song[]> {
    throw new Error('qq adapter pending: verify routes against live backend');
}

export async function searchAll(keywords: string): Promise<Song[]> {
    // 第一阶段先以网易云为主源，其余源核准后并入聚合。
    return searchNetease(keywords);
}

export async function resolvePlayUrl(song: Song): Promise<string | null> {
    switch (song.provider) {
        case 'netease':
            return neteaseSongUrl(song.id);
        default:
            return null;
    }
}
