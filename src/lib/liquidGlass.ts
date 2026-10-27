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
    // 实时交互：手指/指针划过玻璃表面时产生黏性位移，玻璃是「活」的
    interaction: 'fluid',
    interactionStrength: 0.45,
    interactionRadius: 0.4,
    interactionViscosity: 0.6,
};

type LensInstance = { destroy?: () => void };
const instances = new Map<string, LensInstance[]>();

async function glassify(selector: string, zIndex: number, onClass: string, extra: LiquidGLOptions = {}): Promise<void> {
    if (done.has(selector)) return;
    const el = document.querySelector(selector);
    if (!el) return;
    const ok = await loadLib();
    if (!ok || !window.liquidGL) return;
    done.add(selector);
    try {
        const result = window.liquidGL({
            ...BASE_OPTIONS,
            ...extra,
            target: selector,
            zIndex,
            on: {
                init() {
                    document.documentElement.classList.add(onClass);
                    registerBackdrop();
                },
            },
        }) as LensInstance | LensInstance[] | undefined;
        if (result) instances.set(selector, Array.isArray(result) ? result : [result]);
    } catch {
        done.delete(selector);
    }
}

// 旋转屏幕后调用：销毁全部透镜并按新方向重新初始化。
// liquidGL 的画布取景方向在初始化时定死，横竖切换后透镜位置会错位，只能重建。
export function reinitGlass(): void {
    for (const list of instances.values()) {
        for (const inst of list) {
            try { inst.destroy?.(); } catch { /* 已失效的实例忽略 */ }
        }
    }
    instances.clear();
    done.clear();
    document.documentElement.classList.remove('lg-bar', 'lg-ind');
    glassifyChrome();
    glassifyIndicator();
    if (document.querySelector('.miniplayer')) glassifyMiniPlayer();
}

export function glassifyChrome(): void {
    void glassify('.tabbar', 60, 'lg-bar');
}

export function glassifyMiniPlayer(): void {
    void glassify('.miniplayer', 55, 'lg-bar');
}

// App Store 式选中透镜：带放大 + 大倒角，停在当前 tab 图标下层。
// zIndex 必须低于导航条（60）：透镜画布是视口级图层，若高于导航条会盖住图标；
// 放在 59 层，透过导航条自身的玻璃看过去就是嵌在条里的透镜。
export function glassifyIndicator(): void {
    void glassify('.tab-ind', 59, 'lg-ind', {
        magnify: 1.06,
        refraction: 0.008,
        bevelDepth: 0.07,
        bevelWidth: 0.22,
        frost: 0,
        aberration: 0.06,
        interaction: 'none',
    });
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
