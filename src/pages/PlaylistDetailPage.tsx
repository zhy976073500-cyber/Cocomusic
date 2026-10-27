import { useEffect, useState } from 'react';
import {
    neteasePlaylistSongs,
    qqPlaylistSongs,
    qqToplistSongs,
    kugouPlaylistSongs,
    kugouRankSongs,
    type PlaylistInfo,
    type Song,
} from '../lib/api';
import { player } from '../lib/player';
import { Cover, SongList } from '../ui';

/** 远程歌单的统一引用：首页、排行榜、账号页都用它打开详情 */
export type RemotePlaylistRef =
    | { kind: 'netease'; info: PlaylistInfo }
    | { kind: 'netease-top'; info: PlaylistInfo }
    | { kind: 'qq'; info: PlaylistInfo }
    | { kind: 'qq-top'; info: PlaylistInfo }
    | { kind: 'kugou'; info: PlaylistInfo }
    | { kind: 'kugou-rank'; info: PlaylistInfo };

async function loadSongs(ref: RemotePlaylistRef): Promise<Song[]> {
    switch (ref.kind) {
        case 'netease':
        case 'netease-top':
            return neteasePlaylistSongs(ref.info.id);
        case 'qq':
            return qqPlaylistSongs(ref.info);
        case 'qq-top':
            return qqToplistSongs(ref.info);
        case 'kugou':
            return kugouPlaylistSongs(ref.info.id);
        case 'kugou-rank':
            return kugouRankSongs(ref.info.id);
    }
}

export default function PlaylistDetailPage({ target, onBack }: { target: RemotePlaylistRef; onBack: () => void }) {
    const [songs, setSongs] = useState<Song[] | null>(null);
    const [error, setError] = useState('');
    const { info } = target;

    useEffect(() => {
        let alive = true;
        setSongs(null);
        setError('');
        loadSongs(target)
            .then((list) => { if (alive) setSongs(list); })
            .catch((e) => { if (alive) setError(e instanceof Error ? e.message : String(e)); });
        return () => { alive = false; };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [target.kind, target.info.id]);

    return (
        <div className="page detail-page">
            <button className="backbtn" onClick={onBack} aria-label="返回">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <path d="m14.5 5-7 7 7 7" />
                </svg>
            </button>
            <div className="detail-head">
                <Cover src={info.coverUrl} size={112} radius={16} />
                <div className="detail-meta">
                    <div className="detail-name">{info.name}</div>
                    {info.creator && <div className="detail-sub">{info.creator}</div>}
                    {info.description && <div className="detail-sub">{info.description}</div>}
                    <div className="detail-sub">{songs ? `${songs.length} 首` : info.trackCount ? `${info.trackCount} 首` : ''}</div>
                </div>
            </div>
            {songs && songs.length > 0 && (
                <button className="playall" onClick={() => void player.playQueue(songs, 0)}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                        <path d="M8 5.4v13.2c0 .9 1 1.5 1.8 1L20 13a1.15 1.15 0 0 0 0-2L9.8 4.5C9 4 8 4.5 8 5.4z" />
                    </svg>
                    播放全部
                </button>
            )}
            {error && <p className="hint">加载失败：{error}</p>}
            {!songs && !error && <p className="hint">加载中…</p>}
            {songs && songs.length === 0 && !error && <p className="hint">这个歌单暂时读不到歌曲（可能需要登录，或歌单不公开）。</p>}
            {songs && songs.length > 0 && <SongList songs={songs} numbered />}
        </div>
    );
}
