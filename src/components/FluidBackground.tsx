// 流光背景：照 Folia common/FluidBackground 的观感在 WebView 的实现——
// 封面放大 1.5 倍强模糊作底、对角渐变（primary→透明→secondary，overlay α0.4）烘托、
// 换歌新层 1.5s easeInOut 交叉淡入；整层带 Monet 式 240s 慢漂移运镜（平移 ±1.7%、呼吸缩放）。
import { useEffect, useRef, useState } from 'react';
import { hexToRgba, type Palette } from '../lib/color';

interface Layer {
    id: number;
    url: string;
}

let layerSeq = 0;

export default function FluidBackground({ coverUrl, palette }: { coverUrl?: string; palette: Palette }) {
    const [layers, setLayers] = useState<Layer[]>([]);
    const topRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!coverUrl) return;
        const layer: Layer = { id: ++layerSeq, url: coverUrl };
        setLayers((prev) => (prev.some((l) => l.url === coverUrl) ? prev : [...prev.slice(-1), layer]));
    }, [coverUrl]);

    const top = layers[layers.length - 1];

    useEffect(() => {
        const el = topRef.current;
        if (!el || layers.length < 2) return;
        const anim = el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 1500, easing: 'ease-in-out', fill: 'forwards' });
        const t = window.setTimeout(() => {
            setLayers((prev) => prev.slice(-1));
        }, 1550);
        return () => {
            anim.cancel();
            window.clearTimeout(t);
        };
    }, [top?.id]);

    return (
        <div className="fluidbg" aria-hidden>
            <div
                className="fluidbg-base"
                style={{ background: `linear-gradient(160deg, ${hexToRgba(palette.primary, 0.85)}, ${hexToRgba(palette.secondary, 0.9)})` }}
            />
            {layers.map((layer, i) => (
                <div
                    key={layer.id}
                    className="fluidbg-layer"
                    ref={i === layers.length - 1 ? topRef : undefined}
                    style={i === layers.length - 1 && layers.length > 1 ? { opacity: 0 } : undefined}
                >
                    <img className="fluidbg-img" src={layer.url} alt="" />
                </div>
            ))}
            <div
                className="fluidbg-tint"
                style={{
                    background: `linear-gradient(135deg, ${hexToRgba(palette.primary, 0.9)} 0%, transparent 50%, ${hexToRgba(palette.secondary, 0.9)} 100%)`,
                }}
            />
            <div className="fluidbg-shade" />
        </div>
    );
}
