import { useEffect, useState } from 'react';
import { searchAllProviders, type ProviderId, type Song } from '../lib/api';
import { player } from '../lib/player';
import { PROVIDER_LABEL, SongRow } from '../ui';

interface Section {
    provider: ProviderId;
    songs: Song[];
    error?: string;
    loading: boolean;
}

const ORDER: ProviderId[] = ['netease', 'qq', 'kugou'];

export default function SearchPage() {
    const [kw, setKw] = useState(() => new URLSearchParams(window.location.search).get('q') ?? '');
    const [sections, setSections] = useState<Section[]>([]);
    const [searched, setSearched] = useState(false);

    // 截图/自检用：?q=关键词 时自动搜一次
    useEffect(() => {
        const q = new URLSearchParams(window.location.search).get('q');
        if (q) void run();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    async function run() {
        const q = kw.trim();
        if (!q) return;
        setSearched(true);
        setSections(ORDER.map((provider) => ({ provider, songs: [], loading: true })));
        const results = await searchAllProviders(q);
        setSections(results.map((r) => ({ provider: r.provider, songs: r.songs, error: r.error, loading: false })));
    }

    return (
        <div className="page">
            <h1>搜索</h1>
            <div className="searchbar glass">
                <svg className="search-icon" width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
                    <circle cx="11" cy="11" r="7" />
                    <path d="m21 21-4.35-4.35" />
                </svg>
                <input
                    value={kw}
                    onChange={(e) => setKw(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') void run(); }}
                    placeholder="搜歌曲 / 歌手"
                    enterKeyHint="search"
                />
                <button onClick={() => void run()}>搜索</button>
            </div>
            {!searched && <p className="hint">三家音源一起搜：网易云、QQ音乐、酷狗。QQ音乐的歌要先登录才能播（在「我的」页扫码）。</p>}
            {sections.map((sec) => (
                <section key={sec.provider} className="src-section">
                    <h2 className="section-title">{PROVIDER_LABEL[sec.provider]}</h2>
                    {sec.loading && <p className="hint">搜索中…</p>}
                    {!sec.loading && sec.error && <p className="hint">这个音源暂时搜不了（{sec.error}）</p>}
                    {!sec.loading && !sec.error && sec.songs.length === 0 && searched && <p className="hint">没搜到结果</p>}
                    {sec.songs.map((s) => {
                        const idx = sec.songs.indexOf(s);
                        return (
                            <SongRow
                                key={`${s.provider}-${s.id}-${idx}`}
                                song={s}
                                onPlay={() => void player.playQueue(sec.songs, idx)}
                            />
                        );
                    })}
                </section>
            ))}
        </div>
    );
}
