import { useState } from 'react';
import { library, songKey, type Playlist } from '../lib/library';
import { player } from '../lib/player';
import { Cover, SongList, SongRow, useLibrary } from '../ui';

type View = { kind: 'root' } | { kind: 'playlist'; id: string } | { kind: 'history' } | { kind: 'favorites' };

export default function LibraryPage() {
    const lib = useLibrary();
    const [view, setView] = useState<View>({ kind: 'root' });

    if (view.kind === 'favorites') {
        return (
            <div className="page">
                <BackHead title="我喜欢的音乐" onBack={() => setView({ kind: 'root' })} />
                {lib.favorites.length === 0 && <p className="hint">还没有收藏。点歌曲右边的爱心就能收进来。</p>}
                {lib.favorites.length > 0 && (
                    <>
                        <PlayAll onClick={() => void player.playQueue(lib.favorites, 0)} />
                        <SongList songs={lib.favorites} />
                    </>
                )}
            </div>
        );
    }

    if (view.kind === 'history') {
        return (
            <div className="page">
                <BackHead
                    title="播放历史"
                    onBack={() => setView({ kind: 'root' })}
                    extra={lib.history.length > 0 ? <button className="linkbtn danger" onClick={() => library.clearHistory()}>清空</button> : undefined}
                />
                {lib.history.length === 0 && <p className="hint">还没播过歌。</p>}
                <div className="songlist">
                    {lib.history.map((h, i) => (
                        <SongRow
                            key={`${songKey(h.song)}-${h.playedAt}`}
                            song={h.song}
                            onPlay={() => void player.playQueue(lib.history.map((x) => x.song), i)}
                        />
                    ))}
                </div>
            </div>
        );
    }

    if (view.kind === 'playlist') {
        const pl = lib.playlists.find((p) => p.id === view.id);
        if (!pl) {
            setView({ kind: 'root' });
            return null;
        }
        return <LocalPlaylistDetail playlist={pl} onBack={() => setView({ kind: 'root' })} />;
    }

    return (
        <div className="page">
            <h1>我的歌单</h1>
            <button className="entryrow" onClick={() => setView({ kind: 'favorites' })}>
                <div className="entryicon heart-bg">
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                        <path d="M19.5 12.6 12 20l-7.5-7.4A5 5 0 1 1 12 6.1a5 5 0 1 1 7.5 6.5z" />
                    </svg>
                </div>
                <div className="meta">
                    <div className="name">我喜欢的音乐</div>
                    <div className="artist">{lib.favorites.length} 首</div>
                </div>
            </button>
            <button className="entryrow" onClick={() => setView({ kind: 'history' })}>
                <div className="entryicon">
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden>
                        <path d="M3.5 12a8.5 8.5 0 1 1 2.5 6.1" />
                        <path d="M3.5 12H7M12 7.5V12l3 2" />
                    </svg>
                </div>
                <div className="meta">
                    <div className="name">播放历史</div>
                    <div className="artist">{lib.history.length} 首</div>
                </div>
            </button>

            <div className="section-head">
                <h2 className="section-title">自建歌单</h2>
                <button
                    className="linkbtn"
                    onClick={() => {
                        const name = window.prompt('歌单名字');
                        if (name != null) library.createPlaylist(name);
                    }}
                >
                    新建
                </button>
            </div>
            {lib.playlists.length === 0 && <p className="hint">还没有自建歌单。在播放页可以把当前歌曲加进歌单。</p>}
            {lib.playlists.map((pl) => (
                <button key={pl.id} className="entryrow" onClick={() => setView({ kind: 'playlist', id: pl.id })}>
                    <Cover src={pl.songs[0]?.coverUrl} size={50} radius={10} />
                    <div className="meta">
                        <div className="name">{pl.name}</div>
                        <div className="artist">{pl.songs.length} 首</div>
                    </div>
                </button>
            ))}
        </div>
    );
}

function LocalPlaylistDetail({ playlist, onBack }: { playlist: Playlist; onBack: () => void }) {
    return (
        <div className="page">
            <BackHead
                title={playlist.name}
                onBack={onBack}
                extra={
                    <>
                        <button
                            className="linkbtn"
                            onClick={() => {
                                const name = window.prompt('重命名歌单', playlist.name);
                                if (name != null) library.renamePlaylist(playlist.id, name);
                            }}
                        >
                            重命名
                        </button>
                        <button
                            className="linkbtn danger"
                            onClick={() => {
                                if (window.confirm(`删除歌单「${playlist.name}」？`)) {
                                    library.deletePlaylist(playlist.id);
                                    onBack();
                                }
                            }}
                        >
                            删除
                        </button>
                    </>
                }
            />
            {playlist.songs.length === 0 && <p className="hint">歌单是空的。播歌时在播放页点「＋」加进来。</p>}
            {playlist.songs.length > 0 && <PlayAll onClick={() => void player.playQueue(playlist.songs, 0)} />}
            <div className="songlist">
                {playlist.songs.map((s, i) => (
                    <SongRow
                        key={`${songKey(s)}-${i}`}
                        song={s}
                        onPlay={() => void player.playQueue(playlist.songs, i)}
                        right={
                            <button
                                className="iconbtn"
                                aria-label="从歌单移除"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    library.removeFromPlaylist(playlist.id, s);
                                }}
                            >
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
                                    <path d="M6 6l12 12M18 6L6 18" />
                                </svg>
                            </button>
                        }
                    />
                ))}
            </div>
        </div>
    );
}

export function BackHead({ title, onBack, extra }: { title: string; onBack: () => void; extra?: React.ReactNode }) {
    return (
        <div className="backhead">
            <button className="backbtn" onClick={onBack} aria-label="返回">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <path d="m14.5 5-7 7 7 7" />
                </svg>
            </button>
            <h1 className="backtitle">{title}</h1>
            <div className="backextra">{extra}</div>
        </div>
    );
}

export function PlayAll({ onClick }: { onClick: () => void }) {
    return (
        <button className="playall" onClick={onClick}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                <path d="M8 5.4v13.2c0 .9 1 1.5 1.8 1L20 13a1.15 1.15 0 0 0 0-2L9.8 4.5C9 4 8 4.5 8 5.4z" />
            </svg>
            播放全部
        </button>
    );
}
