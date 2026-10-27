import { useEffect, useState } from 'react';
import {
    neteaseDailySongs,
    neteasePersonalized,
    neteaseToplists,
    qqToplists,
    kugouRanks,
    type PlaylistInfo,
    type ProviderId,
    type Song,
} from '../lib/api';
import { player } from '../lib/player';
import { Cover, PROVIDER_LABEL, SongRow, fmtPlayCount } from '../ui';
import type { RemotePlaylistRef } from './PlaylistDetailPage';

type TopTab = 'netease' | 'qq' | 'kugou';

const TOP_KIND: Record<TopTab, RemotePlaylistRef['kind']> = {
    netease: 'netease-top',
    qq: 'qq-top',
    kugou: 'kugou-rank',
};

export default function HomePage({ openPlaylist }: { openPlaylist: (ref: RemotePlaylistRef) => void }) {
    const [daily, setDaily] = useState<Song[]>([]);
    const [recommended, setRecommended] = useState<PlaylistInfo[]>([]);
    const [topTab, setTopTab] = useState<TopTab>('netease');
    const [tops, setTops] = useState<Record<TopTab, PlaylistInfo[]>>({ netease: [], qq: [], kugou: [] });
    const [topsLoading, setTopsLoading] = useState(false);

    useEffect(() => {
        neteaseDailySongs().then(setDaily).catch(() => undefined);
        neteasePersonalized(12).then(setRecommended).catch(() => undefined);
    }, []);

    useEffect(() => {
        if (tops[topTab].length) return;
        let alive = true;
        setTopsLoading(true);
        const loader = topTab === 'netease' ? neteaseToplists() : topTab === 'qq' ? qqToplists() : kugouRanks();
        loader
            .then((list) => { if (alive) setTops((prev) => ({ ...prev, [topTab]: list })); })
            .catch(() => undefined)
            .finally(() => { if (alive) setTopsLoading(false); });
        return () => { alive = false; };
    }, [topTab, tops]);

    const previewDaily = daily.slice(0, 6);

    return (
        <div className="page">
            <h1>Cocomusic</h1>

            {previewDaily.length > 0 && (
                <section>
                    <div className="section-head">
                        <h2 className="section-title">每日推荐</h2>
                        <button className="linkbtn" onClick={() => void player.playQueue(daily, 0)}>播放全部</button>
                    </div>
                    {previewDaily.map((s, i) => (
                        <SongRow key={s.id} song={s} onPlay={() => void player.playQueue(daily, i)} />
                    ))}
                </section>
            )}

            {recommended.length > 0 && (
                <section>
                    <h2 className="section-title">推荐歌单</h2>
                    <div className="plgrid">
                        {recommended.map((pl) => (
                            <button key={pl.id} className="plcard" onClick={() => openPlaylist({ kind: 'netease', info: pl })}>
                                <Cover src={pl.coverUrl} size={104} radius={14} />
                                <div className="plname">{pl.name}</div>
                                <div className="plsub">{fmtPlayCount(pl.playCount)} 播放</div>
                            </button>
                        ))}
                    </div>
                </section>
            )}

            <section>
                <h2 className="section-title">排行榜</h2>
                <div className="segbar">
                    {(Object.keys(TOP_KIND) as TopTab[]).map((t) => (
                        <button key={t} className={topTab === t ? 'active' : ''} onClick={() => setTopTab(t)}>
                            {PROVIDER_LABEL[t as ProviderId]}
                        </button>
                    ))}
                </div>
                {topsLoading && <p className="hint">加载中…</p>}
                <div className="toplist-rows">
                    {tops[topTab].map((pl) => (
                        <button key={pl.id} className="toprow" onClick={() => openPlaylist({ kind: TOP_KIND[topTab], info: pl })}>
                            <Cover src={pl.coverUrl} size={54} radius={10} />
                            <div className="meta">
                                <div className="name">{pl.name}</div>
                                <div className="artist">{pl.description ?? ''}</div>
                            </div>
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
                                <path d="m9 5 7 7-7 7" />
                            </svg>
                        </button>
                    ))}
                </div>
            </section>
        </div>
    );
}
