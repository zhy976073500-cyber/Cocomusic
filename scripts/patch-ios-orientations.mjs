// capacitor:sync:after 钩子：确保生成的 iOS 工程允许横屏。
//
// 背景：Cocomusic 的界面按「竖屏底部悬浮导航 / 横屏右侧竖排导航」设计，
// 横屏必须能真的转过去。Capacitor 模板的 Info.plist 默认带横屏方向，
// 但模板版本变化或人为收紧都可能把它改没——这里在每次 cap sync 后
// 强制核对 UISupportedInterfaceOrientations 两个键，缺了就补、少了就齐。
// 只做字符串级修改，无第三方依赖；plist 不存在（还没 cap add ios）时
// 只提示跳过，任何异常都不让 sync 失败。

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const plistPath = join(root, 'ios', 'App', 'App', 'Info.plist');

const WANT = {
    UISupportedInterfaceOrientations: [
        'UIInterfaceOrientationPortrait',
        'UIInterfaceOrientationLandscapeLeft',
        'UIInterfaceOrientationLandscapeRight',
    ],
    'UISupportedInterfaceOrientations~ipad': [
        'UIInterfaceOrientationPortrait',
        'UIInterfaceOrientationPortraitUpsideDown',
        'UIInterfaceOrientationLandscapeLeft',
        'UIInterfaceOrientationLandscapeRight',
    ],
};

function arrayXml(values, indent) {
    const items = values.map((v) => `${indent}\t<string>${v}</string>`).join('\n');
    return `<array>\n${items}\n${indent}</array>`;
}

function ensureKey(xml, key, values) {
    const keyTag = `<key>${key}</key>`;
    const idx = xml.indexOf(keyTag);
    if (idx === -1) {
        // 键不存在：在根 dict 结束前插入（plist 最后一个 </dict>）
        const close = xml.lastIndexOf('</dict>');
        if (close === -1) return xml;
        const block = `\t${keyTag}\n\t${arrayXml(values, '\t')}\n`;
        return xml.slice(0, close) + block + xml.slice(close);
    }
    // 键已存在：把紧随其后的 <array>...</array> 整体换成目标值
    const arrStart = xml.indexOf('<array>', idx);
    const arrEnd = xml.indexOf('</array>', arrStart);
    if (arrStart === -1 || arrEnd === -1) return xml;
    // 推断缩进：取 <key> 所在行前导空白
    const lineStart = xml.lastIndexOf('\n', idx) + 1;
    const indent = xml.slice(lineStart, idx) || '\t';
    const replacement = arrayXml(values, indent);
    return xml.slice(0, arrStart) + replacement + xml.slice(arrEnd + '</array>'.length);
}

function main() {
    if (!existsSync(plistPath)) {
        console.log('[patch-ios-orientations] 未找到 ios/App/App/Info.plist，跳过（尚未 cap add ios）');
        return;
    }
    const before = readFileSync(plistPath, 'utf8');
    let xml = before;
    for (const [key, values] of Object.entries(WANT)) {
        xml = ensureKey(xml, key, values);
    }
    if (xml === before) {
        console.log('[patch-ios-orientations] 方向配置已齐（竖屏 + 左右横屏），无需修改');
        return;
    }
    writeFileSync(plistPath, xml);
    console.log('[patch-ios-orientations] 已补齐 Info.plist 的横屏方向支持');
}

try {
    main();
} catch (err) {
    console.warn('[patch-ios-orientations] 补丁异常（忽略）:', err?.message ?? err);
}
