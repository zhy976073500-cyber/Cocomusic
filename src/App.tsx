import { useEffect, useState, useSyncExternalStore } from 'react';
import { player } from './lib/player';
import { searchAll, type Song } from './lib/api';

type Tab = 'home' | 'search' | 'library' | 'local';

function usePlayer() {
    return useSyncExternalStore(player.subscribe, player.getSnapshot);
}

function SearchPage() {
    const [kw, setKw] = useState('');
    const [results, setResults] = useState<Song[]>([]);
    const [status, setStatus] = useState('');

    async function run() {
        if (!kw.trim()) return;
        setStatus('搜索中…');
        try {
            const songs = await searchAll(kw.trim());
            setResults(songs);
            setStatus(songs.length ? '' : '没搜到结果');
        } catch (e) {
            setStatus(`搜索失败：${e instanceof Error ? e.message : String(e)}`);
        }
    }

    return (
        <div className="page">
            <h1>搜索</h1>
            <div className="searchbar">
                <input
                    value={kw}
                    onChange={(e) => setKw(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') void run(); }}
                    placeholder="搜歌曲 / 歌手"
                />
                <button onClick={() => void run()}>搜索</button>
            </div>
            {status && <p className="hint">{status}</p>}
            {results.map((s, i) => (
                <div key={`${s.provider}-${s.id}`} className="songrow" onClick={() => void player.playQueue(results, i)}>
                    {s.coverUrl ? <img src={s.coverUrl} alt="" /> : <img alt="" />}
                    <div className="meta">
                        <div className="name">{s.name}</div>
                        <div className="artist">{s.artists} · {s.album}</div>
                    </div>
                </div>
            ))}
        </div>
    );
}

function PlaceholderPage({ title, hint }: { title: string; hint: string }) {
    return (
        <div className="page">
            <h1>{title}</h1>
            <p className="hint">{hint}</p>
        </div>
    );
}

function MiniPlayer() {
    const p = usePlayer();
    const cur = p.current;
    if (!cur) return null;
    return (
        <div className="miniplayer">
            {cur.coverUrl ? <img src={cur.coverUrl} alt="" /> : <img alt="" />}
            <div className="meta">
                <div className="name">{cur.name}</div>
                <div className="artist">{cur.artists}</div>
            </div>
            <button onClick={() => void p.prev()}>⏮</button>
            <button onClick={() => p.toggle()}>{p.playing ? '⏸' : '▶️'}</button>
            <button onClick={() => void p.next()}>⏭</button>
        </div>
    );
}

export default function App() {
    const [tab, setTab] = useState<Tab>('search');
    useEffect(() => { document.title = 'Cocomusic'; }, []);

    return (
        <div className="app">
            {tab === 'home' && <PlaceholderPage title="Cocomusic" hint="推荐 / 排行榜 / 平台歌单同步，按对标 Folia 的清单逐项补齐中。" />}
            {tab === 'search' && <SearchPage />}
            {tab === 'library' && <PlaceholderPage title="我的歌单" hint="收藏、自建歌单、播放历史，本地存储先行，后续接平台账号同步。" />}
            {tab === 'local' && <PlaceholderPage title="本地导入" hint="文件选择器多选音频 + 同名 .lrc 一起导入，IndexedDB 存音频，联网补封面与逐字歌词（沿用 Folia 本地版验证过的方案）。" />}
            <MiniPlayer />
            <nav className="tabbar">
                <button className={tab === 'home' ? 'active' : ''} onClick={() => setTab('home')}>首页</button>
                <button className={tab === 'search' ? 'active' : ''} onClick={() => setTab('search')}>搜索</button>
                <button className={tab === 'library' ? 'active' : ''} onClick={() => setTab('library')}>歌单</button>
                <button className={tab === 'local' ? 'active' : ''} onClick={() => setTab('local')}>本地</button>
            </nav>
        </div>
    );
}
