import { useEffect, useState } from 'react';
import { player } from './lib/player';
import HomePage from './pages/HomePage';
import SearchPage from './pages/SearchPage';
import LibraryPage from './pages/LibraryPage';
import LocalPage from './pages/LocalPage';
import AccountsPage from './pages/AccountsPage';
import PlaylistDetailPage, { type RemotePlaylistRef } from './pages/PlaylistDetailPage';
import PlayerPage from './components/PlayerPage';
import Announcement from './components/Announcement';
import { Cover, usePlayer } from './ui';
import { glassifyChrome, glassifyIndicator, glassifyMiniPlayer, refreshGlass, refreshGlassSoon, reinitGlass } from './lib/liquidGlass';

type Tab = 'home' | 'search' | 'library' | 'local' | 'me';

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
        case 'me':
            return (
                <svg {...common}>
                    <circle cx="12" cy="8" r="4" />
                    <path d="M4.5 20.5a7.5 7.5 0 0 1 15 0" />
                </svg>
            );
    }
}

function MiniPlayer({ onOpen }: { onOpen: () => void }) {
    const p = usePlayer();
    const cur = p.current;
    useEffect(() => { if (cur) glassifyMiniPlayer(); }, [cur]);
    if (!cur) return null;
    return (
        <div className="miniplayer glass" onClick={onOpen}>
            <Cover src={cur.coverUrl} size={44} radius={9} />
            <div className="meta">
                <div className="name">{cur.name}</div>
                <div className="artist">{cur.artists}</div>
            </div>
            <button
                onClick={(e) => { e.stopPropagation(); void p.prev(); }}
                aria-label="上一首"
            >
                <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                    <path d="M7 5h2.2v14H7zM19 5.8v12.4c0 .9-1 1.5-1.8 1L9.6 13a1.15 1.15 0 0 1 0-2L17.2 4.9c.8-.6 1.8 0 1.8.9z" />
                </svg>
            </button>
            <button
                onClick={(e) => { e.stopPropagation(); p.toggle(); }}
                aria-label={p.playing ? '暂停' : '播放'}
            >
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
            <button
                onClick={(e) => { e.stopPropagation(); void p.next(); }}
                aria-label="下一首"
            >
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
    { id: 'me', label: '我的' },
];

export default function App() {
    const [tab, setTab] = useState<Tab>(() => {
        const t = new URLSearchParams(window.location.search).get('tab');
        return t === 'search' || t === 'library' || t === 'local' || t === 'me' ? t : 'home';
    });
    const [detail, setDetail] = useState<RemotePlaylistRef | null>(null);
    const [playerOpen, setPlayerOpen] = useState(false);
    const [noticeShown, setNoticeShown] = useState('');
    const p = usePlayer();

    useEffect(() => { document.title = 'Cocomusic'; }, []);

    // 液态玻璃：导航先上；滚动时节流重拍 + 停下再拍，让折射尽量实时跟上内容；
    // 切 tab、开/关歌单后也重拍
    useEffect(() => {
        glassifyChrome();
        glassifyIndicator();
        let last = 0;
        const onScroll = () => {
            const now = performance.now();
            if (now - last > 220) { last = now; refreshGlass(); }
            refreshGlassSoon(250);
        };
        document.addEventListener('scroll', onScroll, true);
        return () => document.removeEventListener('scroll', onScroll, true);
    }, []);

    // 旋转屏幕后重建透镜：liquidGL 的画布在旧方向取景，横竖切换后位置会错位，
    // 等布局落定后按新方向重新初始化一次，玻璃与导航一起归位
    useEffect(() => {
        let land = window.innerWidth > window.innerHeight;
        let timer = 0;
        const onResize = () => {
            const nowLand = window.innerWidth > window.innerHeight;
            if (nowLand === land) return;
            land = nowLand;
            window.clearTimeout(timer);
            timer = window.setTimeout(() => reinitGlass(), 420);
        };
        window.addEventListener('resize', onResize);
        return () => { window.removeEventListener('resize', onResize); window.clearTimeout(timer); };
    }, []);

    useEffect(() => { refreshGlassSoon(); }, [tab, detail]);

    // 截图/自检用：带 ?demo=1 打开时自动播一首网易云的歌并展开播放页（正常使用不触发）
    useEffect(() => {
        if (!new URLSearchParams(window.location.search).has('demo')) return;
        void (async () => {
            const { searchNetease } = await import('./lib/api');
            const songs = await searchNetease('周杰伦', 10).catch(() => []);
            if (songs.length) {
                void player.playQueue(songs, 0).catch(() => undefined);
                setPlayerOpen(true);
            }
        })();
    }, []);

    useEffect(() => {
        if (p.notice && p.notice !== noticeShown) {
            setNoticeShown(p.notice);
            const t = window.setTimeout(() => setNoticeShown(''), 4000);
            return () => window.clearTimeout(t);
        }
    }, [p.notice, noticeShown]);

    const openPlaylist = (ref: RemotePlaylistRef) => setDetail(ref);

    return (
        <div className={`app${p.current ? ' has-player' : ''}`}>
            {detail ? (
                <PlaylistDetailPage target={detail} onBack={() => setDetail(null)} />
            ) : (
                <>
                    {tab === 'home' && <HomePage openPlaylist={openPlaylist} />}
                    {tab === 'search' && <SearchPage />}
                    {tab === 'library' && <LibraryPage />}
                    {tab === 'local' && <LocalPage />}
                    {tab === 'me' && <AccountsPage openPlaylist={openPlaylist} />}
                </>
            )}
            <MiniPlayer onOpen={() => setPlayerOpen(true)} />
            <nav
                className="tabbar glass"
                aria-label="主导航"
                style={{ '--tab-i': Math.max(0, TABS.findIndex((t) => t.id === tab)) } as React.CSSProperties}
            >
                <span className="tab-ind" aria-hidden />
                {TABS.map((t) => (
                    <button
                        key={t.id}
                        className={tab === t.id && !detail ? 'active' : ''}
                        onClick={() => { setTab(t.id); setDetail(null); }}
                        aria-current={tab === t.id && !detail ? 'page' : undefined}
                    >
                        <NavIcon tab={t.id} />
                        <span>{t.label}</span>
                    </button>
                ))}
            </nav>
            {noticeShown && <div className="app-toast" onClick={() => setNoticeShown('')}>{noticeShown}</div>}
            {playerOpen && p.current && <PlayerPage onClose={() => setPlayerOpen(false)} />}
            <Announcement />
        </div>
    );
}
