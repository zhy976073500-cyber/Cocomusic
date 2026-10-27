// 歌词层：统一成「行 + 可选逐字」结构，来源优先级 逐字 > 行歌词。
// 数据来源全部免费且直连/经现有后端：网易云后端 /lyric/new（lrc + yrc 逐字）、
// LRCLIB（免费公开库，本地歌曲补歌词用）。解析格式：LRC、网易云 YRC、AMLL TTML。

export interface LyricWord {
    start: number; // 秒
    dur: number; // 秒
    text: string;
}

export interface LyricLine {
    start: number; // 秒
    end?: number; // 秒
    text: string;
    words?: LyricWord[];
    translation?: string;
}

const TIME_TAG = /\[(\d+):(\d+)(?:[.:](\d+))?\]/g;

function tagToSeconds(m: RegExpMatchArray): number {
    const min = Number(m[1]);
    const sec = Number(m[2]);
    const fracRaw = m[3] ?? '0';
    const frac = Number(fracRaw) / Math.pow(10, fracRaw.length);
    return min * 60 + sec + frac;
}

/** 解析普通 LRC（可含多时间标签一行、偏移 offset） */
export function parseLrc(text: string): LyricLine[] {
    const lines: LyricLine[] = [];
    let offset = 0;
    const offsetMatch = /\[offset:\s*(-?\d+)\s*\]/i.exec(text);
    if (offsetMatch) offset = Number(offsetMatch[1]) / 1000;
    for (const raw of text.split(/\r?\n/)) {
        const tags = [...raw.matchAll(TIME_TAG)];
        if (!tags.length) continue;
        const content = raw.replace(TIME_TAG, '').trim();
        if (!content) continue;
        for (const t of tags) {
            lines.push({ start: Math.max(0, tagToSeconds(t) - offset), text: content });
        }
    }
    lines.sort((a, b) => a.start - b.start);
    for (let i = 0; i < lines.length; i++) {
        lines[i].end = lines[i + 1]?.start ?? lines[i].start + 5;
    }
    return lines;
}

/** 解析网易云 YRC 逐字歌词：[行起,行长](字起,字长,0)字… */
export function parseYrc(text: string): LyricLine[] {
    const lines: LyricLine[] = [];
    for (const raw of text.split(/\r?\n/)) {
        const head = /^\[(\d+),(\d+)\]/.exec(raw);
        if (!head) continue;
        const lineStart = Number(head[1]) / 1000;
        const lineDur = Number(head[2]) / 1000;
        const words: LyricWord[] = [];
        const wordRe = /\((\d+),(\d+),\d+\)([^(]*)/g;
        let m: RegExpExecArray | null;
        while ((m = wordRe.exec(raw)) !== null) {
            const wtext = m[3];
            if (!wtext) continue;
            words.push({ start: Number(m[1]) / 1000, dur: Number(m[2]) / 1000, text: wtext });
        }
        if (!words.length) continue;
        lines.push({
            start: lineStart,
            end: lineStart + lineDur,
            text: words.map((w) => w.text).join(''),
            words,
        });
    }
    lines.sort((a, b) => a.start - b.start);
    return lines;
}

function ttmlTime(v: string): number {
    // 支持 12.345s / 1:23.456 / 0:01:23.456
    if (v.endsWith('s')) return parseFloat(v.slice(0, -1)) || 0;
    if (v.endsWith('ms')) return (parseFloat(v.slice(0, -2)) || 0) / 1000;
    const parts = v.split(':').map(Number);
    if (parts.some(Number.isNaN)) return 0;
    return parts.reduce((acc, n) => acc * 60 + n, 0);
}

/** 解析 AMLL TTML 逐字歌词（<p begin end><span begin end>字</span>…） */
export function parseTtml(text: string): LyricLine[] {
    const doc = new DOMParser().parseFromString(text, 'text/xml');
    const lines: LyricLine[] = [];
    doc.querySelectorAll('p').forEach((p) => {
        const begin = ttmlTime(p.getAttribute('begin') ?? '0');
        const end = ttmlTime(p.getAttribute('end') ?? '0');
        const spans = p.querySelectorAll('span');
        if (spans.length) {
            const words: LyricWord[] = [];
            spans.forEach((s) => {
                const sb = ttmlTime(s.getAttribute('begin') ?? '0');
                const se = ttmlTime(s.getAttribute('end') ?? String(sb));
                const t = s.textContent ?? '';
                if (t) words.push({ start: sb, dur: Math.max(0, se - sb), text: t });
            });
            if (words.length) {
                lines.push({ start: begin, end, text: words.map((w) => w.text).join(''), words });
                return;
            }
        }
        const t = (p.textContent ?? '').trim();
        if (t) lines.push({ start: begin, end, text: t });
    });
    lines.sort((a, b) => a.start - b.start);
    return lines;
}

/**
 * 解析酷狗 KRC 逐字歌词（后端 decode=true 已解密）：行首 [行起ms,行长ms]，
 * 行内 <偏移ms,时长ms,0>字。元数据行（[ti:] 等）不匹配行首格式，自动跳过。
 */
export function parseKrc(text: string): LyricLine[] {
    const lines: LyricLine[] = [];
    for (const raw of text.split(/\r?\n/)) {
        const head = /^\[(\d+),(\d+)\](.*)$/.exec(raw);
        if (!head) continue;
        const lineStart = Number(head[1]) / 1000;
        const lineDur = Number(head[2]) / 1000;
        const body = head[3];
        const words: LyricWord[] = [];
        const wordRe = /<(\d+),(\d+),\d+>([^<]*)/g;
        let m: RegExpExecArray | null;
        while ((m = wordRe.exec(body)) !== null) {
            const wtext = m[3];
            if (!wtext) continue;
            words.push({ start: lineStart + Number(m[1]) / 1000, dur: Number(m[2]) / 1000, text: wtext });
        }
        if (!words.length) {
            const plain = body.replace(/<[^>]*>/g, '').trim();
            if (plain) lines.push({ start: lineStart, end: lineStart + lineDur, text: plain });
            continue;
        }
        lines.push({
            start: lineStart,
            end: lineStart + lineDur,
            text: words.map((w) => w.text).join(''),
            words,
        });
    }
    lines.sort((a, b) => a.start - b.start);
    return lines;
}

/** 把翻译 LRC 按时间就近并到主歌词行上（差 0.6s 内视为同一行） */
export function mergeTranslation(lines: LyricLine[], trans: LyricLine[]): LyricLine[] {
    if (!trans.length) return lines;
    return lines.map((line) => {
        const hit = trans.find((t) => Math.abs(t.start - line.start) <= 0.6);
        return hit ? { ...line, translation: hit.text } : line;
    });
}

/** 二分查找当前应高亮的行下标；没有返回 -1 */
export function activeLineIndex(lines: LyricLine[], t: number): number {
    let lo = 0;
    let hi = lines.length - 1;
    let ans = -1;
    while (lo <= hi) {
        const mid = (lo + hi) >> 1;
        if (lines[mid].start <= t) {
            ans = mid;
            lo = mid + 1;
        } else {
            hi = mid - 1;
        }
    }
    return ans;
}

// ---- LRCLIB（免费公开歌词库，本地歌曲/缺词兜底）----

interface LrclibHit {
    syncedLyrics?: string | null;
    plainLyrics?: string | null;
    duration?: number;
}

/** 按歌名+歌手查 LRCLIB，返回带时间轴歌词的原文（本地歌曲落库用）；查不到返回 null */
export async function fetchLrclibRawText(name: string, artists: string, durationSec?: number): Promise<string | null> {
    try {
        const artist = artists.split('/')[0]?.trim();
        const qs = new URLSearchParams({ track_name: name, artist_name: artist ?? '' });
        if (durationSec && durationSec > 0) qs.set('duration', String(Math.round(durationSec)));
        const res = await fetch(`https://lrclib.net/api/get?${qs.toString()}`, {
            headers: { Accept: 'application/json' },
        });
        if (!res.ok) return null;
        const data = (await res.json()) as LrclibHit;
        return data.syncedLyrics ?? null;
    } catch {
        return null;
    }
}

/** 按歌名+歌手查 LRCLIB，命中带时间轴的优先；查不到返回空数组。直连，不经任何服务器。 */
export async function fetchLrclibLyric(name: string, artists: string, durationSec?: number): Promise<LyricLine[]> {
    try {
        const artist = artists.split('/')[0]?.trim();
        const qs = new URLSearchParams({ track_name: name, artist_name: artist ?? '' });
        if (durationSec && durationSec > 0) qs.set('duration', String(Math.round(durationSec)));
        const res = await fetch(`https://lrclib.net/api/get?${qs.toString()}`, {
            headers: { Accept: 'application/json' },
        });
        if (!res.ok) return [];
        const data = (await res.json()) as LrclibHit;
        if (data.syncedLyrics) return parseLrc(data.syncedLyrics);
        return [];
    } catch {
        return [];
    }
}
