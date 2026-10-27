// 全屏播放页：Folia 式三层——流光背景（运镜）+ 内容（封面/歌词）+ 底部控制胶囊区。
// 封面入场照 Monet 外框参数；换歌封面 900ms 交叉淡入；进度条 rAF 直写 DOM，拖拽松手才 seek。
import { useEffect, useRef, useState } from 'react';
import { player } from '../lib/player';
import { library, songKey } from '../lib/library';
import { DEFAULT_PALETTE, extractPalette, type Palette } from '../lib/color';
import FluidBackground from './FluidBackground';
import LyricsView, { useLyrics, type LyricMode } from './LyricsView';
import { HeartButton, useLibrary, usePlayer } from '../ui';
import type { PlayMode } from '../lib/player';

function mmss(sec: number): string {
    if (!Number.isFinite(sec) || sec < 0) sec = 0;
    const s = Math.floor(sec);
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

const MODE_LABEL: Record<PlayMode, string> = {
    'repeat-all': '列表循环',
    'repeat-one': '单曲循环',
    shuffle: '随机播放',
    sequence: '顺序播放',
};

type Sheet = null | 'queue' | 'add';

export default function PlayerPage({ onClose }: { onClose: () => void }) {
    const p = usePlayer();
    const lib = useLibrary();
    const song = p.current;
    const [palette, setPalette] = useState<Palette>(DEFAULT_PALETTE);
    const [lyricMode, setLyricMode] = useState<LyricMode>(() =>
        new URLSearchParams(window.location.search).has('classic') ? 'classic' : 'list',
    );
    const [sheet, setSheet] = useState<Sheet>(null);
    const [toast, setToast] = useState('');
    const lines = useLyrics(song);

    const fillRef = useRef<HTMLDivElement>(null);
    const curLabelRef = useRef<HTMLSpanElement>(null);
    const scrubRef = useRef<number | null>(null);
    const coverBoxRef = useRef<HTMLDivElement>(null);
    const toastTimer = useRef<number | null>(null);

    const songId = song ? songKey(song) : '';

    useEffect(() => {
        if (song?.coverUrl) {
            let alive = true;
            extractPalette(song.coverUrl).then((pal) => { if (alive) setPalette(pal); }).catch(() => undefined);
            return () => { alive = false; };
        }
        setPalette(DEFAULT_PALETTE);
    }, [songId, song?.coverUrl]);

    // 封面外框入场（只在打开播放页时播一次，照 Monet 参数）
    useEffect(() => {
        const el = coverBoxRef.current;
        if (!el) return;
        el.animate(
            [
                { opacity: 0, transform: 'translateX(50px) scale(0.95) rotate(1deg)' },
                { opacity: 1, transform: 'translateX(0) scale(1) rotate(0deg)' },
            ],
            { duration: 1600, delay: 250, easing: 'cubic-bezier(0.25, 1, 0.5, 1)', fill: 'backwards' },
        );
    }, []);

    // 进度条 rAF 直写
    useEffect(() => {
        let raf = 0;
        const loop = () => {
            const dur = player.getDuration();
            const t = scrubRef.current ?? player.getTime();
            if (fillRef.current && dur > 0) {
                fillRef.current.style.width = `${Math.min(100, (t / dur) * 100)}%`;
            }
            if (curLabelRef.current) {
                const txt = mmss(t);
                if (curLabelRef.current.textContent !== txt) curLabelRef.current.textContent = txt;
            }
            raf = requestAnimationFrame(loop);
        };
        raf = requestAnimationFrame(loop);
        return () => cancelAnimationFrame(raf);
    }, []);

    if (!song) return null;

    function showToast(msg: string) {
        setToast(msg);
        if (toastTimer.current) window.clearTimeout(toastTimer.current);
        toastTimer.current = window.setTimeout(() => setToast(''), 1800);
    }

    const duration = p.duration || (song.durationMs ? song.durationMs / 1000 : 0);

    return (
        <div className={`playerpage${lyricMode === 'classic' ? ' is-classic' : ''}`}>
            <FluidBackground coverUrl={song.coverUrl} palette={palette} />
            <div className="pp-content">
                <header className="pp-head">
                    <button className="pp-roundbtn" onClick={onClose} aria-label="收起播放页">
                        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                            <path d="m5 9.5 7 7 7-7" />
                        </svg>
                    </button>
                    <div className="pp-headtitle">正在播放</div>
                    <button className="pp-modebtn" onClick={() => setLyricMode(lyricMode === 'list' ? 'classic' : 'list')}>
                        {lyricMode === 'list' ? '流光歌词' : '列表歌词'}
                    </button>
                </header>

                <div className="pp-main">
                    <div className="pp-left">
                        <div className="pp-coverbox" ref={coverBoxRef}>
                            {song.coverUrl ? (
                                <img key={songId} className="pp-cover" src={song.coverUrl} alt="" />
                            ) : (
                                <div className="pp-cover pp-cover-empty">
                                    <svg width="72" height="72" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                                        <path d="M9 18V5.5L21 3v13" />
                                        <circle cx="6" cy="18" r="3" />
                                        <circle cx="18" cy="16" r="3" />
                                    </svg>
                                </div>
                            )}
                        </div>
                        <div className="pp-meta">
                            <div className="pp-title">{song.name}</div>
                            <div className="pp-artist">{song.artists}{song.album ? ` · ${song.album}` : ''}</div>
                            <div className="pp-actions">
                                <HeartButton song={song} size={22} />
                                <button
                                    className="iconbtn"
                                    aria-label="加到歌单"
                                    onClick={() => setSheet('add')}
                                >
                                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden>
                                        <path d="M12 5v14M5 12h14" />
                                    </svg>
                                </button>
                                <button className="iconbtn" aria-label="播放队列" onClick={() => setSheet('queue')}>
                                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden>
                                        <path d="M4 6h13M4 12h13M4 18h9" />
                                        <path d="M20.5 15.5v5l4-2.5z" fill="currentColor" stroke="none" transform="scale(0.8) translate(2 2)" />
                                    </svg>
                                </button>
                            </div>
                        </div>
                    </div>
                    <div className="pp-lyrics">
                        <LyricsView song={song} lines={lines} mode={lyricMode} />
                    </div>
                </div>

                <div className="pp-controls">
                    <div className="pp-progress">
                        <span className="pp-time" ref={curLabelRef}>0:00</span>
                        <div
                            className="pp-track"
                            onPointerDown={(e) => {
                                const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
                                const ratio = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
                                const dur = player.getDuration();
                                if (dur > 0) scrubRef.current = ratio * dur;
                            }}
                            onPointerMove={(e) => {
                                if (scrubRef.current == null) return;
                                const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
                                const ratio = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
                                const dur = player.getDuration();
                                if (dur > 0) scrubRef.current = ratio * dur;
                            }}
                            onPointerUp={() => {
                                if (scrubRef.current != null) {
                                    player.seek(scrubRef.current);
                                    scrubRef.current = null;
                                }
                            }}
                            onPointerLeave={() => {
                                if (scrubRef.current != null) {
                                    player.seek(scrubRef.current);
                                    scrubRef.current = null;
                                }
                            }}
                        >
                            <div className="pp-fill" ref={fillRef} />
                        </div>
                        <span className="pp-time">{mmss(duration)}</span>
                    </div>
                    <div className="pp-buttons">
                        <button
                            className="pp-ctl"
                            aria-label={`播放模式：${MODE_LABEL[p.mode]}`}
                            onClick={() => showToast(MODE_LABEL[player.cycleMode()])}
                        >
                            <ModeIcon mode={p.mode} />
                        </button>
                        <button className="pp-ctl" aria-label="上一首" onClick={() => void p.prev()}>
                            <svg width="30" height="30" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                                <path d="M7 5h2.2v14H7zM19 5.8v12.4c0 .9-1 1.5-1.8 1L9.6 13a1.15 1.15 0 0 1 0-2L17.2 4.9c.8-.6 1.8 0 1.8.9z" />
                            </svg>
                        </button>
                        <button className="pp-play" aria-label={p.playing ? '暂停' : '播放'} onClick={() => p.toggle()}>
                            {p.playing ? (
                                <svg width="30" height="30" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                                    <rect x="6" y="4.5" width="4" height="15" rx="1.2" />
                                    <rect x="14" y="4.5" width="4" height="15" rx="1.2" />
                                </svg>
                            ) : (
                                <svg width="30" height="30" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                                    <path d="M8 5.4v13.2c0 .9 1 1.5 1.8 1L20 13a1.15 1.15 0 0 0 0-2L9.8 4.5C9 4 8 4.5 8 5.4z" />
                                </svg>
                            )}
                        </button>
                        <button className="pp-ctl" aria-label="下一首" onClick={() => void p.next()}>
                            <svg width="30" height="30" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                                <path d="M14.8 5H17v14h-2.2zM5 5.8v12.4c0 .9 1 1.5 1.8 1L14.4 13a1.15 1.15 0 0 0 0-2L6.8 4.9C6 4.3 5 4.9 5 5.8z" />
                            </svg>
                        </button>
                        <span className="pp-ctl pp-ctl-heart">
                            <HeartButton song={song} size={24} />
                        </span>
                    </div>
                </div>
            </div>

            {toast && <div className="pp-toast">{toast}</div>}

            {sheet && (
                <div className="sheet-backdrop" onClick={() => setSheet(null)}>
                    <div className="sheet" onClick={(e) => e.stopPropagation()}>
                        {sheet === 'queue' && (
                            <>
                                <div className="sheet-title">播放队列（{p.queue.length}）</div>
                                <div className="sheet-list">
                                    {p.queue.map((s, i) => (
                                        <button
                                            key={`${songKey(s)}-${i}`}
                                            className={`sheet-row${i === p.index ? ' current' : ''}`}
                                            onClick={() => { void player.playAt(i); setSheet(null); }}
                                        >
                                            <span className="sheet-name">{s.name}</span>
                                            <span className="sheet-artist">{s.artists}</span>
                                            {i === p.index && <span className="sheet-playing">播放中</span>}
                                        </button>
                                    ))}
                                </div>
                            </>
                        )}
                        {sheet === 'add' && (
                            <>
                                <div className="sheet-title">加到歌单</div>
                                <div className="sheet-list">
                                    <button
                                        className="sheet-row"
                                        onClick={() => {
                                            const name = window.prompt('新歌单名字');
                                            if (name != null) {
                                                const pl = library.createPlaylist(name);
                                                library.addToPlaylist(pl.id, song);
                                                showToast('已新建并加入');
                                            }
                                            setSheet(null);
                                        }}
                                    >
                                        <span className="sheet-name">＋ 新建歌单</span>
                                    </button>
                                    {lib.playlists.map((pl) => (
                                        <button
                                            key={pl.id}
                                            className="sheet-row"
                                            onClick={() => {
                                                library.addToPlaylist(pl.id, song);
                                                showToast(`已加入「${pl.name}」`);
                                                setSheet(null);
                                            }}
                                        >
                                            <span className="sheet-name">{pl.name}</span>
                                            <span className="sheet-artist">{pl.songs.length} 首</span>
                                        </button>
                                    ))}
                                    {lib.playlists.length === 0 && <p className="hint">还没有自建歌单，先新建一个。</p>}
                                </div>
                            </>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}

function ModeIcon({ mode }: { mode: PlayMode }) {
    const common = {
        width: 24,
        height: 24,
        viewBox: '0 0 24 24',
        fill: 'none',
        stroke: 'currentColor',
        strokeWidth: 1.8,
        strokeLinecap: 'round' as const,
        strokeLinejoin: 'round' as const,
        'aria-hidden': true,
    };
    if (mode === 'shuffle') {
        return (
            <svg {...common}>
                <path d="M3 7h4l10 10h4m0 0-3-3m3 3-3 3M3 17h4l2.5-2.5M13 9.5 17 5.5h4m0 0-3-3m3 3-3 3" transform="scale(0.92) translate(1 1)" />
            </svg>
        );
    }
    if (mode === 'repeat-one') {
        return (
            <svg {...common}>
                <path d="M4 12a8 8 0 0 1 13.6-5.7L20 8M20 12a8 8 0 0 1-13.6 5.7L4 16" />
                <path d="M20 3.5V8h-4.5M4 20.5V16h4.5" />
                <text x="12" y="15.5" textAnchor="middle" fontSize="8" fill="currentColor" stroke="none">1</text>
            </svg>
        );
    }
    if (mode === 'sequence') {
        return (
            <svg {...common}>
                <path d="M4 6h16M4 12h16M4 18h10" />
                <path d="M17 15.5 21 18l-4 2.5z" fill="currentColor" stroke="none" />
            </svg>
        );
    }
    return (
        <svg {...common}>
            <path d="M4 12a8 8 0 0 1 13.6-5.7L20 8M20 12a8 8 0 0 1-13.6 5.7L4 16" />
            <path d="M20 3.5V8h-4.5M4 20.5V16h4.5" />
        </svg>
    );
}
