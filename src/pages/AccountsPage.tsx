import { useEffect, useRef, useState } from 'react';
import {
    neteaseProfile,
    neteaseQrKey,
    neteaseQrCreate,
    neteaseQrCheck,
    neteaseLogout,
    neteaseUserPlaylists,
    qqProfile,
    qqQrKey,
    qqQrCreate,
    qqQrCheck,
    qqLogout,
    qqUserPlaylists,
    kugouProfile,
    kugouQrKey,
    kugouQrCheck,
    setKugouSession,
    kugouUserPlaylists,
    type PlaylistInfo,
} from '../lib/api';
import { Cover } from '../ui';
import type { RemotePlaylistRef } from './PlaylistDetailPage';

type ProviderKey = 'netease' | 'qq' | 'kugou';

interface AccountState {
    name: string;
    avatarUrl?: string;
    playlists: PlaylistInfo[];
    loaded: boolean;
}

export default function AccountsPage({ openPlaylist }: { openPlaylist: (ref: RemotePlaylistRef) => void }) {
    return (
        <div className="page">
            <h1>我的</h1>
            <p className="hint">登录后可同步各平台的歌单；QQ音乐必须登录才能播放。登录态只存在这台设备上。</p>
            <NeteaseCard openPlaylist={openPlaylist} />
            <QQCard openPlaylist={openPlaylist} />
            <KugouCard openPlaylist={openPlaylist} />
        </div>
    );
}

function useQrFlow() {
    const [qr, setQr] = useState<{ img: string; status: string } | null>(null);
    const timer = useRef<number | null>(null);
    function stop() {
        if (timer.current != null) {
            window.clearInterval(timer.current);
            timer.current = null;
        }
    }
    useEffect(() => stop, []);
    return { qr, setQr, stop, timer };
}

function PlaylistRows({ playlists, onOpen }: { playlists: PlaylistInfo[]; onOpen: (pl: PlaylistInfo) => void }) {
    if (!playlists.length) return null;
    return (
        <div className="acct-playlists">
            {playlists.map((pl) => (
                <button key={`${pl.provider}-${pl.id}-${pl.dirId ?? ''}`} className="entryrow" onClick={() => onOpen(pl)}>
                    <Cover src={pl.coverUrl} size={46} radius={9} />
                    <div className="meta">
                        <div className="name">{pl.name}</div>
                        <div className="artist">{pl.trackCount} 首</div>
                    </div>
                </button>
            ))}
        </div>
    );
}

function NeteaseCard({ openPlaylist }: { openPlaylist: (ref: RemotePlaylistRef) => void }) {
    const [state, setState] = useState<AccountState>({ name: '', playlists: [], loaded: false });
    const flow = useQrFlow();

    async function refresh() {
        const profile = await neteaseProfile().catch(() => null);
        if (!profile) {
            setState({ name: '', playlists: [], loaded: true });
            return;
        }
        const playlists = await neteaseUserPlaylists(profile.userId).catch(() => []);
        setState({ name: profile.nickname, avatarUrl: profile.avatarUrl, playlists, loaded: true });
    }

    useEffect(() => { void refresh(); }, []);

    async function startLogin() {
        try {
            const key = await neteaseQrKey();
            const img = await neteaseQrCreate(key);
            flow.setQr({ img, status: '用网易云 App 扫码登录' });
            flow.stop();
            flow.timer.current = window.setInterval(async () => {
                try {
                    const code = await neteaseQrCheck(key);
                    if (code === 803) {
                        flow.stop();
                        flow.setQr(null);
                        void refresh();
                    } else if (code === 802) {
                        flow.setQr({ img, status: '已扫码，在手机上确认登录' });
                    } else if (code === 800) {
                        flow.stop();
                        flow.setQr({ img, status: '二维码过期了，点下面重新生成' });
                    }
                } catch { /* 轮询单次失败不中断 */ }
            }, 1500);
        } catch (e) {
            flow.setQr({ img: '', status: `生成二维码失败：${e instanceof Error ? e.message : String(e)}` });
        }
    }

    return (
        <section className="acct-card">
            <div className="acct-head">
                <div className="acct-title">网易云音乐</div>
                {state.name ? (
                    <>
                        {state.avatarUrl && <img className="acct-avatar" src={state.avatarUrl} alt="" />}
                        <span className="acct-name">{state.name}</span>
                        <button className="linkbtn" onClick={() => { void neteaseLogout().then(refresh); }}>退出</button>
                    </>
                ) : (
                    state.loaded && <button className="linkbtn" onClick={() => void startLogin()}>扫码登录</button>
                )}
            </div>
            {flow.qr && (
                <div className="qrbox">
                    {flow.qr.img && <img src={flow.qr.img} alt="网易云登录二维码" />}
                    <p className="hint">{flow.qr.status}</p>
                    <button className="linkbtn" onClick={() => { flow.stop(); flow.setQr(null); }}>取消</button>
                </div>
            )}
            <PlaylistRows playlists={state.playlists} onOpen={(pl) => openPlaylist({ kind: 'netease', info: pl })} />
        </section>
    );
}

function QQCard({ openPlaylist }: { openPlaylist: (ref: RemotePlaylistRef) => void }) {
    const [state, setState] = useState<AccountState>({ name: '', playlists: [], loaded: false });
    const flow = useQrFlow();

    async function refresh() {
        const profile = await qqProfile().catch(() => null);
        if (!profile) {
            setState({ name: '', playlists: [], loaded: true });
            return;
        }
        const playlists = await qqUserPlaylists().catch(() => []);
        setState({ name: profile.nickname, avatarUrl: profile.avatarUrl, playlists, loaded: true });
    }

    useEffect(() => { void refresh(); }, []);

    async function startLogin() {
        try {
            const key = await qqQrKey('qq');
            const img = await qqQrCreate(key);
            flow.setQr({ img, status: '用 QQ 或 QQ音乐 App 扫码登录' });
            flow.stop();
            flow.timer.current = window.setInterval(async () => {
                try {
                    const code = await qqQrCheck(key);
                    if (code === 803) {
                        flow.stop();
                        flow.setQr(null);
                        void refresh();
                    } else if (code === 802) {
                        flow.setQr({ img, status: '已扫码，在手机上确认登录' });
                    } else if (code === 800) {
                        flow.stop();
                        flow.setQr({ img, status: '二维码过期了，点下面重新生成' });
                    }
                } catch { /* 同上 */ }
            }, 1500);
        } catch (e) {
            flow.setQr({ img: '', status: `生成二维码失败：${e instanceof Error ? e.message : String(e)}` });
        }
    }

    return (
        <section className="acct-card">
            <div className="acct-head">
                <div className="acct-title">QQ音乐</div>
                {state.name ? (
                    <>
                        {state.avatarUrl && <img className="acct-avatar" src={state.avatarUrl} alt="" />}
                        <span className="acct-name">{state.name}</span>
                        <button className="linkbtn" onClick={() => { void qqLogout().then(refresh); }}>退出</button>
                    </>
                ) : (
                    state.loaded && <button className="linkbtn" onClick={() => void startLogin()}>扫码登录</button>
                )}
            </div>
            {flow.qr && (
                <div className="qrbox">
                    {flow.qr.img && <img src={flow.qr.img} alt="QQ音乐登录二维码" />}
                    <p className="hint">{flow.qr.status}</p>
                    <button className="linkbtn" onClick={() => { flow.stop(); flow.setQr(null); }}>取消</button>
                </div>
            )}
            <PlaylistRows playlists={state.playlists} onOpen={(pl) => openPlaylist({ kind: 'qq', info: pl })} />
        </section>
    );
}

function KugouCard({ openPlaylist }: { openPlaylist: (ref: RemotePlaylistRef) => void }) {
    const [state, setState] = useState<AccountState>({ name: '', playlists: [], loaded: false });
    const flow = useQrFlow();

    async function refresh() {
        const profile = await kugouProfile().catch(() => null);
        if (!profile) {
            setState({ name: '', playlists: [], loaded: true });
            return;
        }
        const playlists = await kugouUserPlaylists().catch(() => []);
        setState({ name: profile.nickname, avatarUrl: profile.avatarUrl, playlists, loaded: true });
    }

    useEffect(() => { void refresh(); }, []);

    async function startLogin() {
        try {
            const { key, img } = await kugouQrKey();
            flow.setQr({ img, status: '用酷狗音乐 App 扫码登录' });
            flow.stop();
            flow.timer.current = window.setInterval(async () => {
                try {
                    const status = await kugouQrCheck(key);
                    if (status === 4) {
                        flow.stop();
                        flow.setQr(null);
                        void refresh();
                    } else if (status === 2 || status === 3) {
                        flow.setQr({ img, status: '已扫码，在手机上确认登录' });
                    } else if (status === 0) {
                        flow.stop();
                        flow.setQr({ img, status: '二维码过期了，点下面重新生成' });
                    }
                } catch { /* 同上 */ }
            }, 1500);
        } catch (e) {
            flow.setQr({ img: '', status: `生成二维码失败：${e instanceof Error ? e.message : String(e)}` });
        }
    }

    return (
        <section className="acct-card">
            <div className="acct-head">
                <div className="acct-title">酷狗音乐</div>
                {state.name ? (
                    <>
                        {state.avatarUrl && <img className="acct-avatar" src={state.avatarUrl} alt="" />}
                        <span className="acct-name">{state.name}</span>
                        <button
                            className="linkbtn"
                            onClick={() => {
                                setKugouSession(null);
                                void refresh();
                            }}
                        >
                            退出
                        </button>
                    </>
                ) : (
                    state.loaded && <button className="linkbtn" onClick={() => void startLogin()}>扫码登录</button>
                )}
            </div>
            {flow.qr && (
                <div className="qrbox">
                    {flow.qr.img && <img src={flow.qr.img} alt="酷狗登录二维码" />}
                    <p className="hint">{flow.qr.status}</p>
                    <button className="linkbtn" onClick={() => { flow.stop(); flow.setQr(null); }}>取消</button>
                </div>
            )}
            <PlaylistRows playlists={state.playlists} onOpen={(pl) => openPlaylist({ kind: 'kugou', info: pl })} />
        </section>
    );
}
