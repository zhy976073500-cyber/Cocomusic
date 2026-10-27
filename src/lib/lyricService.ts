// 歌词取词编排：按音源选路，带内存缓存；全部免费来源。
// 网易云：后端 /lyric/new（yrc 逐字优先，lrc 行歌词 + tlyric 翻译）
// 酷狗：后端两步取 KRC 逐字（服务端已解密）
// QQ：后端无歌词路由且 musicu 逐字需 QRC 解密，先用 LRCLIB 行歌词顶上（直连免费库）
// 任一来源拿不到时统一 LRCLIB 兜底。
import type { Song } from './api';
import { neteaseLyric, kugouLyricKrc } from './api';
import { parseKrc, parseLrc, parseYrc, mergeTranslation, fetchLrclibLyric, type LyricLine } from './lyrics';
import { songKey } from './library';

const cache = new Map<string, LyricLine[]>();
const inflight = new Map<string, Promise<LyricLine[]>>();

async function lrclibFallback(song: Song): Promise<LyricLine[]> {
    return fetchLrclibLyric(song.name, song.artists, song.durationMs ? song.durationMs / 1000 : undefined);
}

async function load(song: Song): Promise<LyricLine[]> {
    try {
        if (song.provider === 'netease') {
            const raw = await neteaseLyric(song.id);
            let lines: LyricLine[] = [];
            if (raw.yrc) lines = parseYrc(raw.yrc);
            if (!lines.length && raw.lrc) lines = parseLrc(raw.lrc);
            if (lines.length && raw.tlyric) {
                const trans = parseLrc(raw.tlyric).filter((l) => l.text);
                if (trans.length) lines = mergeTranslation(lines, trans);
            }
            if (lines.length) return lines;
        } else if (song.provider === 'kugou') {
            const krc = await kugouLyricKrc(song);
            if (krc) {
                const lines = parseKrc(krc);
                if (lines.length) return lines;
            }
        }
    } catch {
        // 主来源失败走兜底
    }
    return lrclibFallback(song);
}

export function fetchLyricsForSong(song: Song): Promise<LyricLine[]> {
    if (song.provider === 'local') return Promise.resolve([]);
    const key = songKey(song);
    const hit = cache.get(key);
    if (hit) return Promise.resolve(hit);
    const pending = inflight.get(key);
    if (pending) return pending;
    const p = load(song).then((lines) => {
        cache.set(key, lines);
        inflight.delete(key);
        return lines;
    });
    inflight.set(key, p);
    return p;
}
