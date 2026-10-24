// 播放核心：单个 Audio 元素 + 队列 + MediaSession（锁屏/耳机控制）
// 先做 Web 层可用版本；iOS 后台播放后续接 Capacitor 原生音频插件时在这里替换实现。

import type { Song } from './api';
import { resolvePlayUrl } from './api';

export type PlayMode = 'sequence' | 'repeat-all' | 'repeat-one' | 'shuffle';

type Listener = () => void;

class Player {
    private audio = new Audio();
    private listeners = new Set<Listener>();
    queue: Song[] = [];
    index = -1;
    playing = false;
    mode: PlayMode = 'repeat-all';
    currentTime = 0;
    duration = 0;

    constructor() {
        this.audio.addEventListener('play', () => { this.playing = true; this.emit(); });
        this.audio.addEventListener('pause', () => { this.playing = false; this.emit(); });
        this.audio.addEventListener('timeupdate', () => { this.currentTime = this.audio.currentTime; this.emit(); });
        this.audio.addEventListener('loadedmetadata', () => { this.duration = this.audio.duration || 0; this.emit(); });
        this.audio.addEventListener('ended', () => { void this.onEnded(); });
        if ('mediaSession' in navigator) {
            navigator.mediaSession.setActionHandler('play', () => this.audio.play());
            navigator.mediaSession.setActionHandler('pause', () => this.audio.pause());
            navigator.mediaSession.setActionHandler('previoustrack', () => { void this.prev(); });
            navigator.mediaSession.setActionHandler('nexttrack', () => { void this.next(); });
        }
    }

    get current(): Song | null {
        return this.index >= 0 ? this.queue[this.index] ?? null : null;
    }

    subscribe = (fn: Listener) => {
        this.listeners.add(fn);
        return () => { this.listeners.delete(fn); };
    };

    getSnapshot = () => this;

    private emit() {
        this.listeners.forEach((fn) => fn());
    }

    async playQueue(songs: Song[], startIndex: number) {
        this.queue = songs;
        await this.playAt(startIndex);
    }

    async playAt(i: number) {
        const song = this.queue[i];
        if (!song) return;
        this.index = i;
        const url = await resolvePlayUrl(song);
        if (!url) { void this.next(); return; }
        this.audio.src = url;
        await this.audio.play();
        if ('mediaSession' in navigator) {
            navigator.mediaSession.metadata = new MediaMetadata({
                title: song.name,
                artist: song.artists,
                album: song.album,
                artwork: song.coverUrl ? [{ src: song.coverUrl }] : [],
            });
        }
        this.emit();
    }

    toggle() {
        if (!this.current) return;
        if (this.audio.paused) void this.audio.play();
        else this.audio.pause();
    }

    async next() {
        if (!this.queue.length) return;
        if (this.mode === 'shuffle') {
            await this.playAt(Math.floor(Math.random() * this.queue.length));
            return;
        }
        const n = this.index + 1;
        await this.playAt(n >= this.queue.length ? 0 : n);
    }

    async prev() {
        if (!this.queue.length) return;
        const p = this.index - 1;
        await this.playAt(p < 0 ? this.queue.length - 1 : p);
    }

    private async onEnded() {
        if (this.mode === 'repeat-one') {
            this.audio.currentTime = 0;
            await this.audio.play();
            return;
        }
        if (this.mode === 'sequence' && this.index === this.queue.length - 1) return;
        await this.next();
    }

    seek(seconds: number) {
        this.audio.currentTime = seconds;
    }
}

export const player = new Player();
