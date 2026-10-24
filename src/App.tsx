import { useEffect, useState, useSyncExternalStore } from 'react';
import { player } from './lib/player';
import { searchAll, type Song } from './lib/api';

type Tab = 'home' | 'search' | 'library' | 'local';

function usePlayer() {
    return useSyncExternalStore(player.subscribe, player.getSnapshot);
}

// 导航图标：细线 SVG，跟随按钮的 currentColor（未选中灰、选中黑）
function NavIcon({ tab }: { tab: Tab }) {
    const common = {
        width: 23,
        height: 23,
        viewBox: '0 0 24 24',
        fill: 'none',
        stroke: 'currentColor',
        strokeWidth: 1.8,
        strokeLinecap: 'round' as const,
        strokeLinejoin: 'round' as const,
        'aria-hidden': true,
    };
    switch (tab) {
        case 'home':
            return (
                <svg {...common}>
                    <path d="M3 9.2 12 3l9 6.2V20a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
                    <path d="M9.5 21.5v-8h5v8" />
                </svg>
            );
        case 'search':
            return (
                <svg {...common}>
                    <circle cx="11" cy="11" r="7" />
                    <path d="m21 21-4.35-4.35" />
                </svg>
            );
        case 'library':
            return (
                <svg {...common}>
                    <path d="M9 18V5.5L21 3v13" />
                    <circle cx="6" cy="18" r="3" />
                    <circle cx="18" cy="16" r="3" />
                </svg>
            );
        case 'local':
            return (
                <svg {...common}>
                    <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                </svg>
            );
    }
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
            <div className="searchbar glass">
                <svg
                    className="search-icon"
                    width="19"
                    height="19"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    aria-hidden
                >
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
        <div className="miniplayer glass">
            {cur.coverUrl ? <img src={cur.coverUrl} alt="" /> : <img alt="" />}
            <div className="meta">
                <div className="name">{cur.name}</div>
                <div className="artist">{cur.artists}</div>
            </div>
            <button onClick={() => void p.prev()} aria-label="上一首">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                    <path d="M7 5h2.2v14H7zM19 5.8v12.4c0 .9-1 1.5-1.8 1L9.6 13a1.15 1.15 0 0 1 0-2L17.2 4.9c.8-.6 1.8 0 1.8.9z" />
                </svg>
            </button>
            <button onClick={() => p.toggle()} aria-label={p.playing ? '暂停' : '播放'}>
                {p.playing ? (
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                        <rect x="6" y="4.5" width="4" height="15" rx="1.2" />
                        <rect x="14" y="4.5" width="4" height="15" rx="1.2" />
                    </svg>
                ) : (
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                        <path d="M8 5.4v13.2c0 .9 1 1.5 1.8 1L20 13a1.15 1.15 0 0 0 0-2L9.8 4.5C9 4 8 4.5 8 5.4z" />
                    </svg>
                )}
            </button>
            <button onClick={() => void p.next()} aria-label="下一首">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                    <path d="M14.8 5H17v14h-2.2zM5 5.8v12.4c0 .9 1 1.5 1.8 1L14.4 13a1.15 1.15 0 0 0 0-2L6.8 4.9C6 4.3 5 4.9 5 5.8z" />
                </svg>
            </button>
        </div>
    );
}

const TABS: { id: Tab; label: string }[] = [
    { id: 'home', label: '首页' },
    { id: 'search', label: '搜索' },
    { id: 'library', label: '歌单' },
    { id: 'local', label: '本地' },
];

export default function App() {
    const [tab, setTab] = useState<Tab>('search');
    const p = usePlayer();
    useEffect(() => { document.title = 'Cocomusic'; }, []);

    return (
        <div className={`app${p.current ? ' has-player' : ''}`}>
            {tab === 'home' && <PlaceholderPage title="Cocomusic" hint="推荐 / 排行榜 / 平台歌单同步，按对标 Folia 的清单逐项补齐中。" />}
            {tab === 'search' && <SearchPage />}
            {tab === 'library' && <PlaceholderPage title="我的歌单" hint="收藏、自建歌单、播放历史，本地存储先行，后续接平台账号同步。" />}
            {tab === 'local' && <PlaceholderPage title="本地导入" hint="文件选择器多选音频 + 同名 .lrc 一起导入，IndexedDB 存音频，联网补封面与逐字歌词（沿用 Folia 本地版验证过的方案）。" />}
            <MiniPlayer />
            <nav className="tabbar glass" aria-label="主导航">
                {TABS.map((t) => (
                    <button
                        key={t.id}
                        className={tab === t.id ? 'active' : ''}
                        onClick={() => setTab(t.id)}
                        aria-current={tab === t.id ? 'page' : undefined}
                    >
                        <NavIcon tab={t.id} />
                        <span>{t.label}</span>
                    </button>
                ))}
            </nav>
        </div>
    );
}
