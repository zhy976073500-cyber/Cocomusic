// 歌词视图，两种模式（照 Folia 的歌词语言在 WebView 落地）：
// - list 滚动行模式：活跃行居中、逐字变色+微光，非活跃行压暗；点行跳转。
// - classic 流光模式（Folia 默认 classic/Luminous 的子集）：单行居中、按行种子散布的词、
//   逐字发光 peaks、整行呼吸漂浮、行进出 blur/scale、底部译文/下一句字幕。
// 播放时钟用 rAF 直读 audio.currentTime，状态变化才动 DOM，不逐帧渲染 React。
import { useEffect, useMemo, useRef, useState } from 'react';
import type { Song } from '../lib/api';
import { player } from '../lib/player';
import { fetchLyricsForSong } from '../lib/lyricService';
import { getLocalRecord, localLyricLines } from '../lib/local';
import { activeLineIndex, type LyricLine, type LyricWord } from '../lib/lyrics';
import { songKey } from '../lib/library';

export type LyricMode = 'list' | 'classic';

export function useLyrics(song: Song | null): LyricLine[] {
    const [lines, setLines] = useState<LyricLine[]>([]);
    const key = song ? songKey(song) : '';
    useEffect(() => {
        let alive = true;
        setLines([]);
        if (!song) return;
        const load = song.provider === 'local'
            ? getLocalRecord(song.localKey ?? song.id).then((rec) => (rec ? localLyricLines(rec) : []))
            : fetchLyricsForSong(song);
        load.then((l) => { if (alive) setLines(l); }).catch(() => undefined);
        return () => { alive = false; };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [key]);
    return lines;
}

/** 播放时钟 rAF：回调里拿到当前秒数，自行决定要不要更新 */
function usePlayClock(cb: (t: number) => void) {
    const ref = useRef(cb);
    ref.current = cb;
    useEffect(() => {
        let raf = 0;
        const loop = () => {
            ref.current(player.getTime());
            raf = requestAnimationFrame(loop);
        };
        raf = requestAnimationFrame(loop);
        return () => cancelAnimationFrame(raf);
    }, []);
}

export default function LyricsView({ song, lines, mode }: { song: Song; lines: LyricLine[]; mode: LyricMode }) {
    if (!lines.length) {
        return (
            <div className="lyrics-empty">
                <p>暂无歌词</p>
                <p className="lyrics-empty-sub">纯音乐，请欣赏</p>
            </div>
        );
    }
    return mode === 'classic' ? <ClassicLyrics lines={lines} /> : <ListLyrics lines={lines} />;
}

// ---------------- 滚动行模式 ----------------

function ListLyrics({ lines }: { lines: LyricLine[] }) {
    const [active, setActive] = useState(-1);
    const trackRef = useRef<HTMLDivElement>(null);
    const lineRefs = useRef<(HTMLDivElement | null)[]>([]);
    const wordRefs = useRef<(HTMLSpanElement | null)[]>([]);
    const activeRef = useRef(-1);

    usePlayClock((t) => {
        const idx = activeLineIndex(lines, t);
        if (idx !== activeRef.current) {
            activeRef.current = idx;
            setActive(idx);
            // 滚动：把活跃行移到容器中心（直接写 transform，走 CSS transition 平滑）
            const track = trackRef.current;
            const el = lineRefs.current[idx];
            if (track && el) {
                const center = track.parentElement ? track.parentElement.clientHeight / 2 : 0;
                track.style.transform = `translateY(${center - el.offsetTop - el.clientHeight / 2}px)`;
            }
        }
        // 逐字：只处理活跃行的词
        const line = lines[idx];
        if (line?.words) {
            line.words.forEach((w, wi) => {
                const el = wordRefs.current[wi];
                if (!el) return;
                const cls = t >= w.start + w.dur ? 'w-done' : t >= w.start ? 'w-now' : '';
                if (el.dataset.state !== cls) {
                    el.dataset.state = cls;
                    el.className = `lword ${cls}`;
                }
            });
        }
    });

    return (
        <div className="lyrics-list" onClick={(e) => e.stopPropagation()}>
            <div className="lyrics-track" ref={trackRef}>
                {lines.map((line, i) => (
                    <div
                        key={i}
                        ref={(el) => { lineRefs.current[i] = el; }}
                        className={`lyric-line${i === active ? ' active' : ''}${Math.abs(i - active) === 1 ? ' near' : ''}`}
                        onClick={() => player.seek(line.start + 0.01)}
                    >
                        <div className="lyric-text">
                            {line.words
                                ? line.words.map((w, wi) => (
                                    <span
                                        key={wi}
                                        ref={i === active ? (el) => { wordRefs.current[wi] = el; } : undefined}
                                        className="lword"
                                    >
                                        {w.text}
                                    </span>
                                ))
                                : line.text}
                        </div>
                        {line.translation && <div className="lyric-trans">{line.translation}</div>}
                    </div>
                ))}
            </div>
        </div>
    );
}

// ---------------- 流光（classic）模式 ----------------

/** 行种子伪随机（照 Folia：seed=行起始时间，布局只由种子决定） */
function seededRand(seed: number) {
    let s = Math.floor(seed * 1000) % 2147483647;
    if (s <= 0) s += 2147483646;
    return () => {
        s = (s * 48271) % 2147483647;
        return (s - 1) / 2147483646;
    };
}

interface WordLayout {
    x: number;
    y: number;
    rotate: number;
    scale: number;
}

function layoutFor(line: LyricLine, words: LyricWord[]): WordLayout[] {
    const rand = seededRand(line.start + 1);
    return words.map(() => ({
        x: (rand() - 0.5) * 2 * 10,
        y: (rand() - 0.5) * 2 * 8,
        rotate: (rand() - 0.5) * 2 * 2.5,
        scale: 1.05 + rand() * 0.15,
    }));
}

function ClassicLyrics({ lines }: { lines: LyricLine[] }) {
    const [active, setActive] = useState(-1);
    const [leaving, setLeaving] = useState<{ line: LyricLine; idx: number } | null>(null);
    const activeRef = useRef(-1);
    const charRefs = useRef<(HTMLSpanElement | null)[]>([]);
    const lineBoxRef = useRef<HTMLDivElement>(null);

    usePlayClock((t) => {
        const idx = activeLineIndex(lines, t);
        if (idx !== activeRef.current) {
            const prev = activeRef.current;
            activeRef.current = idx;
            if (prev >= 0 && lines[prev] && prev !== idx) {
                setLeaving({ line: lines[prev], idx: prev });
                window.setTimeout(() => setLeaving((cur) => (cur?.idx === prev ? null : cur)), 320);
            }
            setActive(idx);
            charRefs.current = [];
            const box = lineBoxRef.current;
            if (box) {
                box.animate(
                    [{ opacity: 0, transform: 'scale(0.92)', filter: 'blur(10px)' }, { opacity: 1, transform: 'scale(1)', filter: 'blur(0px)' }],
                    { duration: 380, easing: 'cubic-bezier(0.22, 1, 0.36, 1)', fill: 'backwards' },
                );
            }
        }
        // 逐字发光：当前行内逐字判定
        const line = lines[idx];
        if (line?.words) {
            let ci = 0;
            line.words.forEach((w) => {
                const chars = [...w.text];
                const unit = chars.length ? w.dur / chars.length : w.dur;
                chars.forEach((_, k) => {
                    const el = charRefs.current[ci];
                    ci += 1;
                    if (!el) return;
                    const charStart = w.start + unit * k;
                    const state = t >= charStart + unit ? 'done' : t >= charStart - 0.15 ? 'lit' : '';
                    if (el.dataset.state !== state) {
                        el.dataset.state = state;
                        el.className = `gchar ${state}`;
                    }
                });
            });
        }
    });

    const line = active >= 0 ? lines[active] : undefined;
    const next = active + 1 < lines.length ? lines[active + 1] : undefined;
    const layouts = useMemo(() => (line?.words ? layoutFor(line, line.words) : []), [line]);

    return (
        <div className="lyrics-classic">
            <div className="classic-stage">
                {leaving && (
                    <div className="classic-line leaving" key={`leave-${leaving.idx}`}>
                        <span className="classic-text">{leaving.line.text}</span>
                    </div>
                )}
                {line ? (
                    <div className="classic-line breathe" ref={lineBoxRef} key={`line-${active}`}>
                        {line.words ? (
                            <span className="classic-words">
                                {line.words.map((w, wi) => {
                                    const lay = layouts[wi] ?? { x: 0, y: 0, rotate: 0, scale: 1.1 };
                                    return (
                                        <span
                                            key={wi}
                                            className="gword"
                                            style={{ transform: `translate(${lay.x}px, ${lay.y}px) rotate(${lay.rotate}deg) scale(${lay.scale})` }}
                                        >
                                            {[...w.text].map((ch, k) => {
                                                let ci = 0;
                                                for (let j = 0; j < wi; j++) ci += [...(line.words?.[j].text ?? '')].length;
                                                const myIdx = ci + k;
                                                return (
                                                    <span
                                                        key={k}
                                                        className="gchar"
                                                        ref={(el) => { charRefs.current[myIdx] = el; }}
                                                    >
                                                        {ch}
                                                    </span>
                                                );
                                            })}
                                        </span>
                                    );
                                })}
                            </span>
                        ) : (
                            <span className="classic-text">{line.text}</span>
                        )}
                    </div>
                ) : (
                    <div className="classic-line">
                        <span className="classic-text dim">♪ ♪ ♪</span>
                    </div>
                )}
            </div>
            <div className="classic-subtitle">
                {line?.translation ? (
                    <div className="sub-trans">{line.translation}</div>
                ) : next ? (
                    <div className="sub-next">{next.text}</div>
                ) : null}
            </div>
        </div>
    );
}
