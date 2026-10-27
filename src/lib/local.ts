// 本地歌曲：IndexedDB 存音频 Blob + 元数据；导入时同名 .lrc 配对落库。
// 识别走免费直连：iTunes Search 补封面/元数据、LRCLIB 补行歌词（不经任何自有服务器）。
// WKWebView 无 OPFS，封面一律存「在线 URL 或 data:」这类运行时可直接渲染的形态。
import type { Song } from './api';
import { parseLrc, fetchLrclibRawText, type LyricLine } from './lyrics';

export interface LocalSongRecord {
    id: string; // IndexedDB 键，同时是 Song.localKey
    blob: Blob;
    fileName: string;
    title: string;
    artists: string;
    album: string;
    durationMs?: number;
    coverUrl?: string;
    lrcText?: string;
    addedAt: number;
    enriched?: boolean;
}

const DB_NAME = 'cocomusic';
const STORE = 'localSongs';

function openDb(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
        const req = indexedDB.open(DB_NAME, 1);
        req.onupgradeneeded = () => {
            if (!req.result.objectStoreNames.contains(STORE)) {
                req.result.createObjectStore(STORE, { keyPath: 'id' });
            }
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });
}

async function tx<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
    const db = await openDb();
    return new Promise<T>((resolve, reject) => {
        const t = db.transaction(STORE, mode);
        const req = run(t.objectStore(STORE));
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
        t.oncomplete = () => db.close();
    });
}

export function recordToSong(r: LocalSongRecord): Song {
    return {
        id: r.id,
        provider: 'local',
        name: r.title,
        artists: r.artists,
        album: r.album,
        coverUrl: r.coverUrl,
        durationMs: r.durationMs,
        localKey: r.id,
    };
}

export async function listLocalSongs(): Promise<LocalSongRecord[]> {
    const all = await tx<LocalSongRecord[]>('readonly', (s) => s.getAll() as IDBRequest<LocalSongRecord[]>);
    return (all ?? []).sort((a, b) => b.addedAt - a.addedAt);
}

export async function getLocalRecord(id: string): Promise<LocalSongRecord | undefined> {
    return tx('readonly', (s) => s.get(id));
}

export async function putLocalRecord(r: LocalSongRecord): Promise<void> {
    await tx('readwrite', (s) => s.put(r));
}

export async function deleteLocalRecord(id: string): Promise<void> {
    await tx('readwrite', (s) => s.delete(id));
}

// ---- 播放用 object URL（单例管理，切歌时回收上一首的）----

let currentObjectUrl: string | null = null;

export async function getLocalObjectUrl(id: string): Promise<string | null> {
    const rec = await getLocalRecord(id);
    if (!rec) return null;
    if (currentObjectUrl) URL.revokeObjectURL(currentObjectUrl);
    currentObjectUrl = URL.createObjectURL(rec.blob);
    return currentObjectUrl;
}

// ---- 导入 ----

const AUDIO_EXTS = ['mp3', 'm4a', 'aac', 'flac', 'wav', 'ogg', 'opus', 'aif', 'aiff'];

export function isAudioFile(f: File): boolean {
    const ext = f.name.split('.').pop()?.toLowerCase() ?? '';
    return AUDIO_EXTS.includes(ext) || f.type.startsWith('audio/');
}

export function isLrcFile(f: File): boolean {
    return f.name.toLowerCase().endsWith('.lrc');
}

function baseName(name: string): string {
    return name.replace(/\.[^.]+$/, '');
}

/** 从文件名猜标题/歌手：「歌手 - 歌名」拆分，否则整名当标题 */
function guessMeta(fileName: string): { title: string; artists: string } {
    const base = baseName(fileName);
    const sep = base.split(/\s+-\s+/);
    if (sep.length >= 2) return { artists: sep[0].trim(), title: sep.slice(1).join(' - ').trim() };
    return { title: base.trim(), artists: '' };
}

function probeDuration(blob: Blob): Promise<number | undefined> {
    return new Promise((resolve) => {
        const url = URL.createObjectURL(blob);
        const audio = new Audio();
        audio.preload = 'metadata';
        const done = (v?: number) => {
            URL.revokeObjectURL(url);
            resolve(v);
        };
        audio.onloadedmetadata = () => done(Number.isFinite(audio.duration) ? Math.round(audio.duration * 1000) : undefined);
        audio.onerror = () => done(undefined);
        audio.src = url;
        setTimeout(() => done(undefined), 4000);
    });
}

export interface ImportResult {
    added: Song[];
    skipped: number;
}

export async function importFiles(files: File[]): Promise<ImportResult> {
    const audios = files.filter(isAudioFile);
    const lrcByBase = new Map<string, File>();
    for (const f of files) {
        if (isLrcFile(f)) lrcByBase.set(baseName(f.name).toLowerCase(), f);
    }
    const existing = await listLocalSongs();
    const existingKeys = new Set(existing.map((r) => `${r.fileName}|${r.blob.size}`));
    const added: Song[] = [];
    let skipped = 0;
    for (const f of audios) {
        if (existingKeys.has(`${f.name}|${f.size}`)) {
            skipped += 1;
            continue;
        }
        const meta = guessMeta(f.name);
        const lrcFile = lrcByBase.get(baseName(f.name).toLowerCase());
        const lrcText = lrcFile ? await lrcFile.text() : undefined;
        const durationMs = await probeDuration(f);
        const rec: LocalSongRecord = {
            id: `local-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
            blob: f,
            fileName: f.name,
            title: meta.title,
            artists: meta.artists,
            album: '',
            durationMs,
            lrcText,
            addedAt: Date.now(),
        };
        await putLocalRecord(rec);
        added.push(recordToSong(rec));
        // 导入后顺手识别一首（其余留给启动补识别，避免导入时打太多请求）
        void enrichRecord(rec).catch(() => undefined);
    }
    return { added, skipped };
}

// ---- 联网识别（免费直连）----

interface ItunesHit {
    trackName?: string;
    artistName?: string;
    collectionName?: string;
    artworkUrl100?: string;
}

async function itunesLookup(title: string, artists: string): Promise<ItunesHit | null> {
    try {
        const term = `${artists} ${title}`.trim();
        const qs = new URLSearchParams({ term, media: 'music', entity: 'song', limit: '5' });
        const res = await fetch(`https://itunes.apple.com/search?${qs.toString()}`);
        if (!res.ok) return null;
        const data: any = await res.json();
        const results: ItunesHit[] = data?.results ?? [];
        if (!results.length) return null;
        const norm = (s?: string) => (s ?? '').toLowerCase().replace(/[\s\-—·.]/g, '');
        const t = norm(title);
        const exact = results.find((r) => norm(r.trackName) === t);
        return exact ?? results[0];
    } catch {
        return null;
    }
}

/** 给一条本地记录补封面/歌词（缺什么补什么），成功返回 true */
export async function enrichRecord(rec: LocalSongRecord): Promise<boolean> {
    if (rec.enriched && rec.coverUrl && rec.lrcText) return false;
    if (typeof navigator !== 'undefined' && !navigator.onLine) return false;
    let changed = false;
    if (!rec.coverUrl) {
        const hit = await itunesLookup(rec.title, rec.artists);
        if (hit?.artworkUrl100) {
            rec.coverUrl = hit.artworkUrl100.replace('100x100bb.jpg', '600x600bb.jpg');
            if (hit.collectionName && !rec.album) rec.album = hit.collectionName;
            changed = true;
        }
    }
    if (!rec.lrcText) {
        const raw = await fetchLrclibRawText(rec.title, rec.artists, rec.durationMs ? rec.durationMs / 1000 : undefined);
        if (raw) {
            rec.lrcText = raw;
            changed = true;
        }
    }
    rec.enriched = true;
    if (changed) await putLocalRecord(rec);
    return changed;
}

/** 启动补识别：对缺封面/歌词的老歌补一轮（上限 15 首，离线跳过） */
export async function enrichSweep(): Promise<void> {
    if (typeof navigator !== 'undefined' && !navigator.onLine) return;
    const all = await listLocalSongs();
    const missing = all.filter((r) => !r.coverUrl || !r.lrcText).slice(0, 15);
    for (const rec of missing) {
        await enrichRecord(rec).catch(() => undefined);
    }
}

export async function localLyricLines(rec: LocalSongRecord): Promise<LyricLine[]> {
    if (rec.lrcText) {
        const lines = parseLrc(rec.lrcText);
        if (lines.length) return lines;
    }
    return [];
}
