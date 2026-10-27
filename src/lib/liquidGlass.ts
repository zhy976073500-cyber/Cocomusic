// 液态玻璃接入层：开源库 liquidGL（NaughtyDuk，MIT，WebGL 真折射）包一层。
// 只给底部导航与迷你播放器上真折射；初始化成功（首帧渲染完）才给 <html> 加 lg-on，
// CSS 那边据此把这两个元素的自带毛玻璃背景关掉，让 WebGL 玻璃单独呈现。
// 任何一步失败（无 WebGL、快照失败等）都不加 lg-on，原 CSS 玻璃兜底，界面不受影响。
type LiquidGLOptions = Record<string, unknown>;
type LiquidGLFn = ((options: LiquidGLOptions) => unknown) & {
    registerDynamic?: (elements: string | Element | Element[]) => void;
};

declare global {
    interface Window {
        liquidGL?: LiquidGLFn;
    }
}

let loadPromise: Promise<boolean> | null = null;
const done = new Set<string>();

function loadLib(): Promise<boolean> {
    if (window.liquidGL) return Promise.resolve(true);
    if (!loadPromise) {
        loadPromise = import('../vendor/liquidGL.min.js')
            .then(() => typeof window.liquidGL === 'function')
            .catch(() => false);
    }
    return loadPromise;
}

const BASE_OPTIONS: LiquidGLOptions = {
    snapshot: 'body',
    resolution: 2,
    engine: 'webgl2',
    refraction: 0.012,
    aberration: 0.15,
    bevelDepth: 0.09,
    bevelWidth: 0.18,
    frost: 2.2,
    specular: true,
    shadow: false,
    reveal: 'fade',
};

async function glassify(selector: string, zIndex: number): Promise<void> {
    if (done.has(selector)) return;
    const el = document.querySelector(selector);
    if (!el) return;
    const ok = await loadLib();
    if (!ok || !window.liquidGL) return;
    done.add(selector);
    try {
        window.liquidGL({
            ...BASE_OPTIONS,
            target: selector,
            zIndex,
            on: {
                init() {
                    document.documentElement.classList.add('lg-on');
                    registerBackdrop();
                },
            },
        });
    } catch {
        done.delete(selector);
    }
}

export function glassifyChrome(): void {
    void glassify('.tabbar', 60);
}

export function glassifyMiniPlayer(): void {
    void glassify('.miniplayer', 55);
}

let backdropRegistered = false;
function registerBackdrop(): void {
    if (backdropRegistered) return;
    backdropRegistered = true;
    refreshGlass();
}

// 内容变了（切 tab、开歌单、滚动停下、图片加载完）后重拍快照，折射的背景才跟得上。
export function refreshGlass(): void {
    if (!window.liquidGL?.registerDynamic) return;
    try {
        window.liquidGL.registerDynamic('.app');
    } catch {
        /* 快照失败不影响使用，CSS 玻璃仍在 */
    }
}

let refreshTimer: number | null = null;
export function refreshGlassSoon(ms = 350): void {
    if (refreshTimer) window.clearTimeout(refreshTimer);
    refreshTimer = window.setTimeout(() => {
        refreshGlass();
        // 图片等慢资源落位后再补拍一次
        window.setTimeout(refreshGlass, 700);
    }, ms);
}
