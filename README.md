# Mineradio · React 复刻工程

对 [XxHuberrr/Mineradio](https://github.com/XxHuberrr/Mineradio) v2.2.0（commit `328a087`，GPL-3.0）的
**前端重构**：Vite + React 18 + TypeScript + React Router + Tailwind + Zustand，
后端 107 个接口中与主流程相关的约 40 个用 MSW 按真实响应结构 mock 掉。

> 这是一份复刻练习，不是 Mineradio 官方代码，也不提供任何真实音乐源。
> 曲名、艺人名、歌词、账号信息全部是本工程内合成的虚构数据。

---

## 快速开始

```bash
npm install
npm run dev
```

打开 http://127.0.0.1:5180/ ，先进入启动页，点击任意位置或按 Enter 进入首页。

端口固定在 **5180** 且开了 `strictPort`：同机另一个项目占着 `0.0.0.0:5173`，
用专属端口避免两个 dev server 抢同一端口，抢不到时会直接报错而不是静默跳号。

```bash
npm run build      # 类型检查 + 生产构建，产物在 dist/
npm run preview    # 本地预览构建产物（等价于部署后的效果）
npm run typecheck  # 只跑 tsc --noEmit
```

### 部署

构建产物是纯静态文件，任何静态托管都能放：

```bash
npm run build
# 把 dist/ 整个目录交给 nginx / GitHub Pages / Cloudflare Pages / 对象存储
```

路由用的是 **HashRouter**（`/#/home`），所以静态托管**不需要**任何 rewrite 规则；
子目录部署时记得同时配 Vite 的 `base`，MSW 的 worker 路径走的是 `import.meta.env.BASE_URL`，会自动跟随。

### 关掉 mock 接真后端

业务代码里的请求路径与真实后端完全一致（都是 `/api/...`），所以：

```bash
VITE_ENABLE_MSW=0 VITE_API_BASE=http://127.0.0.1:3000 npm run dev
```

MSW 用动态 `import` 挂载，关掉后不会进包。注意真后端是 Electron 里的
`node:http` 服务（默认 `:3000`），需要能访问网易云/QQ/酷狗/汽水的网络，
且本工程不含 Electron 主进程，桌面能力（壁纸、桌面歌词独立窗口、托盘）不存在。

---

## 技术栈

| 用途 | 选择 | 版本 |
|---|---|---|
| 构建 | Vite | ^5.4.19 |
| UI | React + react-dom | ^18.3.1 |
| 语言 | TypeScript | ^5.7.3（strict + noUnusedLocals） |
| 路由 | react-router-dom | ^6.30.1（HashRouter） |
| 样式 | Tailwind CSS | ^3.4.18 |
| 状态 | Zustand | ^5.0.15 |
| 视觉 | three | ^0.186.0 |
| 动画 | gsap | ^3.15.0（已装，当前界面用 CSS 过渡实现） |
| Mock | msw | ^2.7.6 |
| 环境粒子 | react-particles-lite | ^1.0.0（ISC，零依赖） |

---

## 第三方视觉代码与授权

| 来源 | 授权 | 用在哪 |
|---|---|---|
| [cnolka/Aural-Pro](https://github.com/cnolka/Aural-Pro) | MIT © 2025 cnolka | 仅借鉴技法，未复制文件：低频的 `sqrt` 响应曲线、高通的 `smoothstep` 门控、点精灵"窄核 + 宽晕"衰减形状 |
| [react-particles-lite](https://github.com/nikatopu/react-particles-lite) | ISC | 作为 npm 依赖，驱动背景星尘层 `AmbientParticles` |
| Ashima / Stefan Gustavson 的 simplex noise | 公开领域 | 内联在 `VisualStage.tsx` 的 GLSL（`snoise` / `fbm3`） |

引入前审计过 react-particles-lite 的 `dist`：无 `fetch` / `XMLHttpRequest` / `eval` /
`new Function` / `localStorage` / `atob` / 硬编码网络地址，且无传递依赖。

**一个实现约束**：该库的 effect 依赖是 `JSON.stringify(params) + preset`，params 一变就
销毁重建整个引擎、所有粒子重生。所以 `AmbientParticles` 的 params 是稳定值，密度滑条
做了 0.25 一档的量化——**这一层不能用音频逐帧驱动**，音频反应全部由 three.js 那层承担。

刻意**没**用 `UnrealBloomPass`：本工程背景是 DOM 层（封面模糊 + 渐变），composer 要把
alpha 一路穿透才不会糊黑，风险高；改用同几何二次绘制的假辉光（窄核 + 宽晕加色），
代价是一次 draw call。

---

## 路由

| 路径 | 页面 |
|---|---|
| `/splash` | 启动页 |
| `/home` | 首页仪表盘 |
| `/search` `/search/:mode` | 搜索（`all`/`netease`/`qq`/`kugou`/`qishui`/`podcast`） |
| `/library` | 音乐库 |
| `/playlist/:provider/:id` | 歌单详情 |
| `/podcast` | 播客（顶栏入口已隐藏） |
| `/stats` | 听歌画像（顶栏入口已隐藏） |
| **`/stage`** | **纯舞台：只有粒子与歌词** |
| `/settings` | 设置 |

`/stage` 由布局路由让位（标题栏、控制条、面板卸载），但音频引擎与 WebGL 上下文仍挂在
`ShellLayout`，所以进出这一页**播放不会断**。控件闲置 2.5 秒淡出，Esc 回首页。

顶栏只留 首页 / 搜索 / 音乐库 / 舞台 四个入口。`ShellLayout.tsx` 里的
`SHOW_PODCAST_ENTRY`、`SHOW_STATS_ENTRY`、`SHOW_ACCOUNT_ENTRY` 三个开关都是 false：
**隐藏而非删除**，路由、页面组件、登录弹窗代码全在，改成 true 就回来。
画像页现在界面上没有入口（地址栏直接访问仍可）；播客还能从首页「今日电台」那排
chip 和播放面板的「播客」页签进去。

## 界面上进不去的功能

| 功能 | 为什么进不去 | 怎么恢复 |
|---|---|---|
| 账号 / 登录弹窗 | `SHOW_ACCOUNT_ENTRY = false` 且音乐库已改成只有本地（`LIBRARY_LOCAL_ONLY = true`），两处入口一起关掉 | 把这两个常量任一个改回 `true` |
| 听歌画像页 | 顶栏入口 `SHOW_STATS_ENTRY = false`，别处没有链接 | 改回 `true`，或地址栏访问 `#/stats` |
| 播客页顶栏入口 | `SHOW_PODCAST_ENTRY = false`（页面本身仍可从首页电台 chip / 面板页签进入） | 改回 `true` |

---

## 只剩你上传的歌

`src/mocks/data/catalog.ts` 顶部的 `REMOTE_DEMO_TRACKS = false` 关掉全部合成曲目：

- 五个平台搜索结果为空，「全部」页签只剩本地曲目
- 每日推荐 / 平台推荐改指向真实曲目（否则首页「播放今日推荐」是死按钮）
- 账号歌单清空，内置歌单只剩「本地音乐」这一张（其余四张的曲目来自空池，点开必为空）

实测：搜索 `a` 的结果从 17 条降到 **1 条**。生成器代码保留，常量改回 `true` 即恢复。
播客频道未动——你说的是"歌曲"，播客不是歌；要一起清说一声。

### 音乐库只剩「本地」

`src/pages/LibraryPage.tsx` 顶部的 `LIBRARY_LOCAL_ONLY = true` 撤掉左列的四个平台页签与
登录 / 刷新卡片，这一页固定停在 `local`，右列只有「本地音乐」一张歌单卡片。
本地音源没有账号概念，所以也不再打 `login/status`。

代价要说清楚：**登录弹窗在界面上彻底没有入口了**。这一页原本是唯一还能点到的地方，
标题栏的账号按钮早先已由 `ShellLayout.tsx` 的 `SHOW_ACCOUNT_ENTRY = false` 藏掉。
`ModalHost` 里的扫码 / Cookie 登录逻辑一行没删，把这两个常量改回 `false` 就全部回来。

---

## 目录结构

```
src/
├─ main.tsx                 入口：条件启动 MSW → 挂载 App
├─ App.tsx                  ErrorBoundary + HashRouter
├─ router/AppRoutes.tsx     路由表（全部 lazy）
├─ types/                   track / api / fx，字段名对齐原版
├─ lib/
│  ├─ http.ts               fetch 封装，带 ApiError
│  ├─ storage.ts            原版 localStorage key 清单
│  ├─ format.ts             时长 / 播放量 / 聆听时长 / 日期
│  ├─ lrc.ts                LRC 解析、译文对齐、时间校准
│  ├─ audioLevels.ts        每帧电平的可变单例（不走 React 状态）
│  └─ glassMap.ts           色差玻璃置换贴图生成器
├─ services/                search / song / playlist / discover / content / account
├─ store/                   player / settings / account / library / fx / stats / ui
├─ hooks/                   useAudioEngine / useLyrics / useHotkeys
├─ mocks/
│  ├─ browser.ts            setupWorker
│  ├─ session.ts            有状态的登录会话（登录会改变后续返回）
│  ├─ data/catalog.ts       合成曲库、歌单、播客、封面生成
│  ├─ data/lyrics.ts        合成歌词
│  ├─ audio/synth.ts        合成 WAV 底床
│  └─ handlers/             util / account / search / playback / library / content
├─ styles/                  tokens / glass / components / controls / globals
└─ components/
   ├─ shell/ShellLayout.tsx  常驻层 + 标题栏 + 背景层
   ├─ stage/                 VisualStage（three.js 粒子）/ LyricsOverlay
   ├─ player/BottomBar.tsx   控制条（含进度、音质、音量、迷你队列、歌词校准）
   ├─ playlist/              三页签面板
   ├─ fx/                    视觉控制台 + FAB
   ├─ modals/ModalHost.tsx   7 个对话框
   └─ ui/                    Icons / primitives / GlassFilterDefs
```

---

## 复刻了什么

### 界面与交互
- **启动页**：字标分字母入场、点击进入/Enter/Space 进入
- **首页**：Hero 卡（日期、时钟、换一条）、4 张快捷卡（继续播放 / 音乐库 / 每日推荐 / 最近播放，`data-home-tone` 同名）、洞察栏（今日聆听 / 接下来播放 / 为你挑选 / 平台推荐）
- **搜索**：`All | NE | QQ | KG | QS | Podcast` 六模式、防抖 + `AbortController` 取消在途请求、分页加载更多、搜索历史持久化
- **控制条**：封面 / 标题角标（试听、换源）/ 音质菜单 / 艺人 / 红心 / 收藏 / 播放模式 / AutoMix 入口 / 前后曲 / 播放暂停 / 迷你队列 / 歌词开关（长按或右键做 ±0.1s 校准）/ 音量（含淡入淡出滑条）/ 自动隐藏 / 全沉浸式 / 全屏 / 进度条拖拽 seek
- **歌单面板**：队列 / 歌单 / 播客三页签，钉住，分页水合 + 预热下一页
- **视觉控制台**：预设 / 外观 / 歌词 / 动态 / 高级 五分区，13 个预设卡，约 45 个参数滑条，13 槽用户存档，导出/导入
- **对话框**：登录（扫码 + Cookie，4 平台）、账号、收藏到歌单、歌曲详情与评论、自定义歌词、封面裁剪、更新
- **设置页**：分平台音质、淡入淡出、界面显隐、启动恢复、音量、快捷键说明、关于
- **色差玻璃**：原版 SVG `feDisplacementMap` 滤镜链 + 按元素尺寸实时生成的置换贴图，贴图不可用时自动降级为纯 `backdrop-filter`

### 数据契约
`/api/search`、`/api/{qq,kugou,qishui}/search`、`/api/kugou/recommendations`、`/api/qishui/feed`、
`/api/song/url` 及三个平台变体、`/api/audio`、`/api/cover`、`/api/lyric` 及变体、
`/api/user/playlists` 及变体、`/api/playlist/tracks` 及变体、`/api/playlist/{create,add-song,subscribe}`、
`/api/discover/home`、`/api/weather/{radio,ip-location}`、`/api/login/{status,cookie,logout,qr/*}`、
`/api/{qq,kugou}/login/*`、`/api/qishui/login/{qrcode,check}`、`/api/qishui/status`、
`/api/song/like{,/check}`、`/api/song/comments`、`/api/podcast/{hot,search,detail,programs,my}`、
`/api/podcast/dj-beatmap`、`/api/listen/{report,total}`、`/api/platform/capabilities`、
`/api/app/version`、`/api/update/latest`。

两个**刻意照抄**的行为，不是遗漏：`/api/spotify/*` 返回 `404 PROVIDER_REMOVED`，
`/api/update/{download,patch}*` 返回 `410 UPDATE_EXTERNAL_ONLY` —— 真实后端就是这么做的。

### 视觉舞台
three.js 点云 + 自定义 GLSL，从当前封面像素采样颜色与位置（原版也是运行时生成贴图，不依赖图片资源），
WebAudio `AnalyserNode` 实时驱动 bass / mid / treble / beatPulse。实现 3 个代表预设
（`emily专辑封面`、`滚筒`、`星球`），其余 10 个在控制台可见但会明确提示未复刻。

---

## 本地音乐（真实音频 + 你自己的封面图）

约定就是你在 `../music/` 下的组织方式：**一个文件夹一首歌**，里面放

```
music/三人游/
├── 2.三人游 - 方大同(Av115089722117976,P2).mp3   ← 音频（mp3/m4a/flac/…）
├── 2.三人游 - 方大同(Av115089722117976,P2).lrc   ← 歌词原文
└── cover.png                                      ← 背景图（名字随意，取第一张）
```

然后：

```bash
npm run music:sync     # 扫 ../music，复制进 public/music/<歌名>/ 并重新生成曲库清单
# 再重启 dev server —— 清单是构建期产物，热更新不会重读目录
```

脚本会从文件名里解析标题与艺人（`2.三人游 - 方大同(Av…)` → 三人游 / 方大同）；
「12.12 王力宏 - 唯一」这种 **艺人写在前面** 的，用文件夹名对上哪一段是歌名就自动调过来。
猜错了就在该文件夹里放一个 `meta.json` 覆盖：`{ "title": "", "artist": "", "album": "" }`。
清单产物是 `src/mocks/data/local-tracks.generated.ts`，不要手改。
`public/music` 只是它的镜像，你不需要往里放东西。

**歌词会先清洗再落地。** 这批 `.lrc` 是 AI 生成的，正文前面塞了散文前言，中间还混着
markdown 排版。同步时按四条规则丢掉（源文件不动，只清 `public/` 里的副本）：
第一个 `🎵 歌名` 分隔行之前的全部前言、`###` / `**` / 反引号这类排版符号、
`[Verse 1]` `[Chorus]` 段落标记行、只写说话人的 `**The Kid LAROI:**` 行。
时间戳原样保留；没有分隔行的干净文件一行都不动。同步输出会报每首歌清了几行。

那张图片会用在四个地方：

| 位置 | 表现 |
|---|---|
| 播放背景 | 视觉控制台 →「外观」→ 背景模式：**图片** = 原图铺开不糊；**封面**（默认）= 只糊 2.5px，认得出是什么又不抢歌词 |
| 粒子取色 | 舞台那 16000 个点按图片像素上色，亮度还兼作地形高度 |
| 控制条 / 舞台缩略图 | 原图 |
| 音乐库「本地音乐」卡片 | 第一首歌的图 |

时长在构建期解不出来（不为此引解码库），所以清单里不写：第一次播放时由 audio
元素报出真值并记进 `localStorage`，之后列表里一直是准的。没播过的歌显示 `–:–`，
不拿 `0:00` 冒充。

与合成音源的三条实质区别：

| | 合成曲目 | 本地真实文件 |
|---|---|---|
| 音频 | `/api/audio` 现算的 12 秒 WAV 底床，循环 | `/music/*.mp3` 原文件，不循环 |
| 进度 | 虚拟时钟按 metadata 时长推进 | 元素自身的 `currentTime` / `duration` |
| 歌词 | 模板句合成 | 用户 `.lrc` 原文（运行时按 URL 取，构建期不内联） |
| 播完 | 时钟到点切歌 | `ended` 事件切歌 |

`/api/local/song/url` 的响应带 `local: true`，播放引擎据此分支。
本地曲目**不参与**跨平台同曲回退——文件缺失就是缺失，去远端搜同名歌顶上会播错内容。

当前曲库：15 首（用户提供，`npm run music:sync` 的输出里有完整列表）。
其中 花田错 还没放图片，那一首的背景仍是生成的渐变。

> 注意：`public/` 下的文件会被原样拷进 `dist/`，不做压缩也不加 hash。
> 15 首歌 + 14 张图 ≈ 60MB，全部会进构建产物。本地跑无所谓；
> 把它 `npm run build` 后推到公开托管，等于公开分发这些音频文件——这步需要你自己确认有权这么做。

---

## 自测结果

在 `node v24.16 / npm 11.13` + 无头 Edge 下实测（1440×900，dev server `:5180`）：

| 项 | 结果 |
|---|---|
| `npx tsc --noEmit` | 0 error（strict + noUnusedLocals + noUnusedParameters） |
| `npm run build` | 通过，327 modules，5.6s，主包 805KB / gzip 227KB |
| 运行时 `pageerror` / `console.error` | 0 |
| HTTP ≥ 400 响应 | 0（favicon 已内联为 data URI） |
| MSW 拦截 | 单次首页冷启动发出 27 个 `/api/*` 请求，全部由 mock 接住 |
| 启动页 → 首页 | 点击后路由 `/splash → /home`，4 张快捷卡 tone 为 `search/library/mix/playlist` |
| 搜索 | 输入「夜」返回 20 行；防抖 420ms + AbortController 生效 |
| 播放 | 点曲目 → 解析音源 → 出声，进度 2.5s→2.0% / +5s→7.0%（1:40 曲目，实时推进） |
| 暂停/恢复 | 暂停后进度停在 7.27%，恢复后继续到 10.24% |
| 拖拽 seek | 点进度条 50% 处 → 50.47% |
| 下一首 | 进度归零、标题切换、封面粒子重新采样 |
| 播放模式 | 循环三次回到「顺序循环」 |
| 迷你队列 | 展开 12 条 |
| 视觉控制台 | 外观页签 12 个滑条 + 2 个取色器；切「星球」后 `preset=2` 已落 localStorage |
| 未复刻提示 | 点「安魂」弹出「『安魂』预设的 GLSL 未在本次复刻范围内」 |
| 扫码登录 | 弹窗出二维码，等待态 → 约 6 秒后自动确认并关闭（mock 状态机 801→802→803） |
| WebGL | `#canvas-container canvas` 1440×900，软件渲染（swiftshader）下正常出点云 |

### 真实音频（本地曲目）

| 项 | 结果 |
|---|---|
| mp3 分发 | `GET /music/beauty-and-a-beat/track.mp3` → 200，3,649,199 字节，`audio/mpeg` |
| 解码 | Edge `loadedmetadata` → duration 228.02s，readyState 4 |
| 时长显示 | 控制条右侧显示 **3:48**（真实值，非 metadata 假定值） |
| 进度 | 播放 4s 显示 0:02 → 10s 显示 0:08，随元素 `currentTime` 走 |
| 拖拽 seek | 拖到 2:00 → 显示 2:02，进度条约 53% |
| 歌词同步 | seek 到 2:02 时窗口首行为 lrc 的 `[01:49.12]I want to show you all the finer things in life`，与文件时间轴一致 |
| 粒子 | 播放中连续两帧 canvas 字节不同（由真声驱动，非合成底床） |
| 端点 | `/api/local/{search,song/url,lyric,user/playlists,playlist/tracks}` 全部命中 |
| 错误 | `pageerror` 0、`console.error` 0 |

规模：**64 个源文件，约 12,000 行**（TS/TSX/CSS）。

---

## 已知差异（不要按原版预期）

1. **合成曲目没有真实音乐。** 除 `local` 音源外，`/api/audio` 回的是按曲目 id 派生 BPM 的
   12 秒 WAV 底床（`src/mocks/audio/synth.ts`）——有真信号喂分析器，粒子跟的是真采样，
   但它不是那首歌，进度条走的也只是 metadata 假定值。
   **你自己的 mp3 走 `local` 音源，是真实音频、真实时长、真实歌词**，见上面「本地音乐」一节。
2. **歌词舞台是 DOM 多层，不是 3D 文字网格。** 原版是约 290KB 的 WebGL 文字行层 + shader；
   这里保留了 `lyricDisplayMode` / `lyricTranslationMode` / `lyricContextOpacity` 等参数的语义，
   渲染方式不同。
3. **3D 歌单架没有复刻。** 原版它是右键唤起的 WebGL 卡片阵列，不是 DOM；
   控制台里 `shelf` 相关开关只会写入偏好，不会产生画面。AutoMix / cuefield 过渡规划同理未实现。
4. **桌面模式未实现。** Electron 专属：真桌面壁纸层、Wallpaper Engine、桌面歌词独立窗口、
   托盘、原生图标层、窗口控制。标题栏的窗口按钮因此是禁用态。
5. **13 个视觉预设只做 3 个**，约 190 个 fx 参数只接了约 45 个。
6. **原版没有前端路由**，`/splash`、`/search/:mode`、`/playlist/:provider/:id` 等 URL 结构是本次重构引入的。
7. Google Fonts 在当前网络下可能不可达，字标会回落到系统衬线/无衬线字体，不影响布局。

---

## 数据与隐私

所有登录态、搜索历史、自定义封面、自定义歌词、视觉存档、听歌画像都只写在本机
`localStorage`（键名与原版一致，见 `src/lib/storage.ts`），不发送到任何地方。
mock 的"登录"不校验任何真实凭据——填够 8 个字符就算成功，纯粹为了演示流程。

## 许可

本工程沿用上游的 GPL-3.0-only。上游 Mineradio 版权归原作者 XxHuberrr。
