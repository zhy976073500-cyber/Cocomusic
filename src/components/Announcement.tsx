// 公告弹窗：每天首次打开弹一次。公众号 + 抖音双码并排（沿用 Sage 在 Folia 上的定版）。
import { useEffect, useState} from 'react';
import { WECHAT_QR, DOUYIN_QR } from '../assets/qr';

const KEY = 'cocomusic.announce.lastShown';

function todayStr(): string {
const d = new Date();
return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export default function Announcement() {
const [show, setShow] = useState(false);

useEffect(() => {
const sp = new URLSearchParams(window.location.search);
if (sp.has('demo') || sp.has('tab') || sp.has('q')) return;
try {
if (localStorage.getItem(KEY)!== todayStr()) setShow(true);
} catch {
setShow(true);
}
}, []);

if (!show) return null;

function close() {
try {
localStorage.setItem(KEY, todayStr());
} catch { /* 忽略 */}
setShow(false);
}

return (
<div className="announce-backdrop" onClick={close}>
<div className="announce-card" onClick={(e) => e.stopPropagation()}>
<div className="announce-title">欢迎使用 Cocomusic</div>
<p className="announce-text">扫码关注，软件更新第一时间知道，更多资源都在这里。</p>
<div className="announce-qrs">
<figure>
<img src={WECHAT_QR} alt="微信公众号二维码" />
<figcaption>公众号</figcaption>
</figure>
<figure>
<img src={DOUYIN_QR} alt="抖音二维码" />
<figcaption>抖音同名号</figcaption>
</figure>
</div>
<button className="announce-close" onClick={close}>开始听歌</button>
</div>
</div>
);
}
