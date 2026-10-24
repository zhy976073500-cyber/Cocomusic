import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
    appId: 'com.coco.cocomusic',
    appName: 'Cocomusic',
    webDir: 'dist',
    // 纯本地包：不配 server.url，Web 资源打进 IPA 本体（沿用 Folia 本地版的经验）。
    ios: {
        contentInset: 'always',
    },
};

export default config;
