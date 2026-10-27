// 全局共享 UI 小件：hooks、歌曲行、封面占位、音源徽标。
import { useSyncExternalStore } from 'react';
import { player } from './lib/player';
import { library, songKey } from './lib/library';
import type { ProviderId, Song } from './lib/api';

export function usePlayer() {
    return useSyncExternalStore(player.subscribe, player.getSnapshot);
}

export function useLibrary() {
    return useSyncExternalStore(library.subscribe, library.getSnapshot);
}

export const PROVIDER_LABEL: Record<ProviderId, string> = {
    netease: '网易云',
    kugou: '酷狗',
    qq: 'QQ音乐',
    local: '本地',
};

export function fmtDuration(ms?: number): string {
    if (!ms || ms <= 0) return '';
    const sec = Math.round(ms / 1000);
    return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
}

export function fmtPlayCount(n?: number): string {
    if (!n) return '';
    if (n >= 100000000) return `${(n / 100000000).toFixed(1)}亿`;
    if (n >= 10000) return `${(n / 10000).toFixed(1)}万`;
    return String(n);
}

export function Cover({ src, size = 48, radius = 10 }: { src?: string; size?: number; radius?: number }) {
    if (src) {
        return <img className="cover" src={src} alt="" width={size} height={size} style={{ width: size, height: size, borderRadius: radius }} loading="lazy" />;
    }
    return (
        <div className="cover cover-empty" style={{ width: size, height: size, borderRadius: radius }} aria-hidden>
            <svg width={size * 0.45} height={size * 0.45} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 18V5.5L21 3v13" />
                <circle cx="6" cy="18" r="3" />
                <circle cx="18" cy="16" r="3" />
            </svg>
        </div>
    );
}

export function HeartButton({ song, size = 20 }: { song: Song; size?: number }) {
    const lib = useLibrary();
    const fav = lib.favorites.some((s) => songKey(s) === songKey(song));
    return (
        <button
            className={`iconbtn heart${fav ? ' on' : ''}`}
            aria-label={fav ? '取消收藏' : '收藏'}
            onClick={(e) => {
                e.stopPropagation();
                library.toggleFavorite(song);
            }}
        >
            <svg width={size} height={size} viewBox="0 0 24 24" fill={fav ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M19.5 12.6 12 20l-7.5-7.4A5 5 0 1 1 12 6.1a5 5 0 1 1 7.5 6.5z" />
            </svg>
        </button>
    );
}

export function SongRow({
    song,
    index,
    onPlay,
    showHeart = true,
    right,
}: {
    song: Song;
    index?: number;
    onPlay: () => void;
    showHeart?: boolean;
    right?: React.ReactNode;
}) {
    const p = usePlayer();
    const isCurrent = p.current != null && songKey(p.current) === songKey(song);
    return (
        <div className={`songrow${song.gray ? ' gray' : ''}${isCurrent ? ' current' : ''}`} onClick={onPlay}>
            {typeof index === 'number' && <div className="rowindex">{index + 1}</div>}
            <Cover src={song.coverUrl} />
            <div className="meta">
                <div className="name">
                    {song.name}
                    <span className="src-badge">{PROVIDER_LABEL[song.provider]}</span>
                </div>
                <div className="artist">
                    {song.artists}
                    {song.album ? ` · ${song.album}` : ''}
                </div>
            </div>
            {song.durationMs ? <div className="rowdur">{fmtDuration(song.durationMs)}</div> : null}
            {showHeart && <HeartButton song={song} />}
            {right}
        </div>
    );
}

export function SongList({
    songs,
    numbered = false,
    showHeart = true,
}: {
    songs: Song[];
    numbered?: boolean;
    showHeart?: boolean;
}) {
    return (
        <div className="songlist">
            {songs.map((s, i) => (
                <SongRow
                    key={`${songKey(s)}-${i}`}
                    song={s}
                    index={numbered ? i : undefined}
                    showHeart={showHeart}
                    onPlay={() => void player.playQueue(songs, i)}
                />
            ))}
        </div>
    );
}
