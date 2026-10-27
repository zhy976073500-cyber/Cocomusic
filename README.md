# Cocomusic

Sage 自研的 iOS 音乐播放器，目标：功能对标 Folia，但代码与品牌完全自主。

- 技术路线：React + Vite 前端，Capacitor 打 iOS 包（appId `com.coco.cocomusic`，纯本地包、无 server.url）
- 后端：复用 ECS（47.239.8.60）上现有的三个音源服务，经 `folia.cococcfans.cn` 同域路径转发（`/api/netease`、`/api/kugou`、`/api/qq`）
- 分发：GitHub Actions 出未签名 IPA → 自签 → 微信公众号「Coco果粉营地」分发（沿用 Folia 流水线）

## 功能清单（对标 Folia，逐项打勾）

- [x] 多音源搜索/播放（网易云 + QQ + 酷狗，三后端契约 2026-10-27 逐条实测核准；QQ 播放需先登录）
- [x] 平台账号登录与歌单同步（三平台扫码登录 + 我的歌单读取）
- [x] 排行榜 / 推荐歌单（首页每日推荐、推荐歌单、三源排行榜）
- [x] 逐字歌词（网易云 YRC、酷狗 KRC、AMLL TTML 解析）+ 行歌词（LRCLIB 兜底）
- [x] 本地导入（多选音频 + 同名 .lrc；IndexedDB 存音频；联网补封面/歌词）
- [x] 收藏 / 自建歌单 / 播放历史
- [x] 播放队列与模式（顺序/循环/单曲/随机 + 队列面板 + 下一首插入）
- [ ] 后台播放与锁屏控制（MediaSession 先行，原生音频插件后补）
- [x] 全屏播放页（Folia 风格：流光背景运镜、封面、进度拖拽、逐字歌词 + 流光歌词模式）
- [x] 公告弹窗（自有版：公众号 + 抖音双码，每天首次）

## 开发

```bash
npm install
npm run dev     # 本地调试
npm run build   # 产出 dist，Capacitor 同步进 iOS 工程
```

## 已知 iOS 坑（Folia 踩过）

- WKWebView 无 OPFS，本地封面不能依赖 OPFS 路径
- 文件选择器 accept 要逐个列音频格式，`audio/*` 在 iOS 上会灰掉 MP3
- 导入歌词需 .lrc 与音频文件同选才会落库
