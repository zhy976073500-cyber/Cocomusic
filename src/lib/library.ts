// 本地曲库：收藏、自建歌单、播放历史。全部存 localStorage（纯本地、免费、离线可用），
// 结构与播放器一样走 subscribe/getSnapshot，供 React useSyncExternalStore 订阅。

import type { Song } from './api';

export interface Playlist {
    id: string;
    name: string;
    songs: Song[];
    createdAt: number;
}

export interface HistoryEntry {
    song: Song;
    playedAt: number;
}

interface LibraryData {
    favorites: Song[];
    playlists: Playlist[];
    history: HistoryEntry[];
}

const KEY = 'cocomusic.library.v1';
const HISTORY_CAP = 200;

type Listener = () => void;

function songKey(s: Song): string {
    return `${s.provider}:${s.id}`;
}

function load(): LibraryData {
    try {
        const raw = localStorage.getItem(KEY);
        if (raw) {
            const parsed = JSON.parse(raw) as Partial<LibraryData>;
            return {
                favorites: Array.isArray(parsed.favorites) ? parsed.favorites : [],
                playlists: Array.isArray(parsed.playlists) ? parsed.playlists : [],
                history: Array.isArray(parsed.history) ? parsed.history : [],
            };
        }
    } catch {
        /* 损坏时从空库开始，不让启动崩 */
    }
    return { favorites: [], playlists: [], history: [] };
}

class Library {
    private data: LibraryData = load();
    private listeners = new Set<Listener>();

    subscribe = (fn: Listener) => {
        this.listeners.add(fn);
        return () => { this.listeners.delete(fn); };
    };

    getSnapshot = () => this.data;

    private commit(next: LibraryData) {
        this.data = next;
        try {
            localStorage.setItem(KEY, JSON.stringify(next));
        } catch {
            /* 存储满/隐私模式写不进时只保内存态 */
        }
        this.listeners.forEach((fn) => fn());
    }

    // ---- 收藏 ----
    isFavorite(song: Song): boolean {
        const k = songKey(song);
        return this.data.favorites.some((s) => songKey(s) === k);
    }

    toggleFavorite(song: Song): boolean {
        if (this.isFavorite(song)) {
            const k = songKey(song);
            this.commit({ ...this.data, favorites: this.data.favorites.filter((s) => songKey(s) !== k) });
            return false;
        }
        this.commit({ ...this.data, favorites: [song, ...this.data.favorites] });
        return true;
    }

    // ---- 自建歌单 ----
    createPlaylist(name: string): Playlist {
        const pl: Playlist = {
            id: `pl_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`,
            name: name.trim() || '未命名歌单',
            songs: [],
            createdAt: Date.now(),
        };
        this.commit({ ...this.data, playlists: [...this.data.playlists, pl] });
        return pl;
    }

    deletePlaylist(id: string) {
        this.commit({ ...this.data, playlists: this.data.playlists.filter((p) => p.id !== id) });
    }

    renamePlaylist(id: string, name: string) {
        this.commit({
            ...this.data,
            playlists: this.data.playlists.map((p) => (p.id === id ? { ...p, name: name.trim() || p.name } : p)),
        });
    }

    playlistHas(playlistId: string, song: Song): boolean {
        const pl = this.data.playlists.find((p) => p.id === playlistId);
        if (!pl) return false;
        const k = songKey(song);
        return pl.songs.some((s) => songKey(s) === k);
    }

    addToPlaylist(playlistId: string, song: Song) {
        if (this.playlistHas(playlistId, song)) return;
        this.commit({
            ...this.data,
            playlists: this.data.playlists.map((p) =>
                p.id === playlistId ? { ...p, songs: [...p.songs, song] } : p,
            ),
        });
    }

    removeFromPlaylist(playlistId: string, song: Song) {
        const k = songKey(song);
        this.commit({
            ...this.data,
            playlists: this.data.playlists.map((p) =>
                p.id === playlistId ? { ...p, songs: p.songs.filter((s) => songKey(s) !== k) } : p,
            ),
        });
    }

    // ---- 播放历史 ----
    recordHistory(song: Song) {
        const k = songKey(song);
        const rest = this.data.history.filter((h) => songKey(h.song) !== k);
        const next = [{ song, playedAt: Date.now() }, ...rest].slice(0, HISTORY_CAP);
        this.commit({ ...this.data, history: next });
    }

    clearHistory() {
        this.commit({ ...this.data, history: [] });
    }
}

export const library = new Library();
export { songKey };
