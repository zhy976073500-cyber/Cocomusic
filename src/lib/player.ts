// 播放核心：单个 Audio 元素 + 队列 + MediaSession（锁屏/耳机控制）
// 先做 Web 层可用版本；iOS 后台播放后续接 Capacitor 原生音频插件时在这里替换实现。

import type { Song } from './api';
import { resolvePlayUrl } from './api';
import { getLocalObjectUrl } from './local';
import { library } from './library';

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
    /** 放不了时给 UI 的一次性提示（如整队列都拿不到播放地址） */
    notice = '';
    private failStreak = 0;

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

    /** rAF 驱动的 UI（进度条/歌词）直接读真实播放时钟，不经 React state */
    getTime(): number {
        return this.audio.currentTime || 0;
    }

    getDuration(): number {
        return this.audio.duration || 0;
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
        let url: string | null = null;
        try {
            url = song.provider === 'local'
                ? await getLocalObjectUrl(song.localKey ?? song.id)
                : await resolvePlayUrl(song);
        } catch {
            url = null;
        }
        if (!url) {
            // 拿不到地址就跳下一首；整队列都失败时停下并提示，避免无限循环空转
            this.failStreak += 1;
            if (this.failStreak >= Math.max(1, this.queue.length)) {
                this.failStreak = 0;
                this.playing = false;
                this.notice = '这几首暂时都拿不到播放地址，换个音源或稍后再试';
                this.emit();
                return;
            }
            await this.next();
            return;
        }
        this.failStreak = 0;
        this.notice = '';
        this.audio.src = url;
        await this.audio.play();
        library.recordHistory(song);
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

    cycleMode(): PlayMode {
        const order: PlayMode[] = ['repeat-all', 'repeat-one', 'shuffle', 'sequence'];
        const next = order[(order.indexOf(this.mode) + 1) % order.length];
        this.mode = next;
        this.emit();
        return next;
    }

    /** 在当前歌曲后插入一首（「下一首播放」） */
    insertNext(song: Song) {
        if (!this.queue.length) {
            this.queue = [song];
            return;
        }
        this.queue = [
            ...this.queue.slice(0, this.index + 1),
            song,
            ...this.queue.slice(this.index + 1),
        ];
        this.emit();
    }

    appendToQueue(song: Song) {
        if (this.queue.some((s) => s.provider === song.provider && s.id === song.id)) return;
        this.queue = [...this.queue, song];
        this.emit();
    }
}

export const player = new Player();
