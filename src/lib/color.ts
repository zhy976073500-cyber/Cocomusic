// 封面取色：照 Folia 算法 A 的思路（50×50 采样、按饱和度优先取互异色），
// 纯 Canvas 实现、无第三方库。封面图无 CORS 时拿不到像素，回退默认暖色板。
export interface Palette {
    primary: string;
    secondary: string;
    accent: string;
}

export const DEFAULT_PALETTE: Palette = {
    primary: '#8a6d4f',
    secondary: '#4f5d8a',
    accent: '#d9a05b',
};

const cache = new Map<string, Palette>();

function rgbToHex(r: number, g: number, b: number): string {
    const h = (n: number) => Math.round(Math.max(0, Math.min(255, n))).toString(16).padStart(2, '0');
    return `#${h(r)}${h(g)}${h(b)}`;
}

export function hexToRgba(hex: string, alpha: number): string {
    const n = parseInt(hex.slice(1), 16);
    const r = (n >> 16) & 255;
    const g = (n >> 8) & 255;
    const b = n & 255;
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function extractFromPixels(data: Uint8ClampedArray, count = 5): Palette {
    interface Cand { r: number; g: number; b: number; sat: number }
    const cands: Cand[] = [];
    const step = 2;
    const totalPx = data.length / 4;
    for (let i = 0; i < totalPx; i += step) {
        const o = i * 4;
        const alpha = data[o + 3];
        if (alpha < 128) continue;
        const r = data[o];
        const g = data[o + 1];
        const b = data[o + 2];
        const max = Math.max(r, g, b);
        const min = Math.min(r, g, b);
        const denom = 255 - Math.abs(max + min - 255);
        const sat = denom === 0 ? 0 : (max - min) / denom;
        const light = (max + min) / 2;
        if ((sat > 0.2 && light > 30 && light < 220) || cands.length < 100) {
            cands.push({ r, g, b, sat });
        }
    }
    cands.sort((a, b2) => b2.sat - a.sat);
    const picked: Cand[] = [];
    for (const c of cands) {
        if (picked.length >= count) break;
        const far = picked.every((p) => {
            const dr = p.r - c.r;
            const dg = p.g - c.g;
            const db = p.b - c.b;
            return Math.sqrt(dr * dr + dg * dg + db * db) > 20;
        });
        if (far) picked.push(c);
    }
    if (!picked.length) return DEFAULT_PALETTE;
    const toHex = (c: Cand) => rgbToHex(c.r, c.g, c.b);
    return {
        primary: toHex(picked[0]),
        secondary: toHex(picked[1] ?? picked[0]),
        accent: toHex(picked[2] ?? picked[0]),
    };
}

export function extractPalette(coverUrl: string): Promise<Palette> {
    const hit = cache.get(coverUrl);
    if (hit) return Promise.resolve(hit);
    return new Promise((resolve) => {
        const img = new Image();
        img.crossOrigin = 'Anonymous';
        img.onload = () => {
            try {
                const canvas = document.createElement('canvas');
                canvas.width = 50;
                canvas.height = 50;
                const ctx = canvas.getContext('2d', { willReadFrequently: true });
                if (!ctx) throw new Error('no ctx');
                ctx.drawImage(img, 0, 0, 50, 50);
                const data = ctx.getImageData(0, 0, 50, 50).data;
                const palette = extractFromPixels(data);
                cache.set(coverUrl, palette);
                resolve(palette);
            } catch {
                resolve(DEFAULT_PALETTE);
            }
        };
        img.onerror = () => resolve(DEFAULT_PALETTE);
        img.src = coverUrl;
    });
}
