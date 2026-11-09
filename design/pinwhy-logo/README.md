# Pinwhy Logo

Open trace 原始设计参考：https://www.figma.com/design/BqiNQ0iLRBJ7rbIC6Y2LRf?node-id=2-2 。当前 Pinwhy 生产素材以本目录为准。

## 概念 · Open trace
开放边框代表可恢复的工作现场；斜线代表探索轨迹；游离圆点代表 Agent 的当前位置。设计不以固定流程箭头或状态机来描述项目。

## 文件
- pinwhy-logo-dark.svg：浅色背景使用，深色文字＋深绿图形。
- pinwhy-logo-light.svg：深色背景使用，浅色文字＋薄荷绿图形。
- pinwhy-logo-mono.svg：单色印刷、终端文档。
- pinwhy-mark-mint.svg / pinwhy-mark-dark.svg / pinwhy-mark-white.svg：独立标志，透明背景。
- pinwhy-app-icon.svg：512 × 512 应用图标，墨黑圆角底色。
- pinwhy-identity.svg / pinwhy-identity.png：可编辑的 Pinwhy 品牌板与本地渲染预览。

## 色彩与字体
Board #090D0C；Trace #66E0AE；Paper #F3F5F2。
浅底标志使用 #147453；深色文字使用 #15201C。
Pinwhy 字标由 Avenir Next Demi Bold 转为六个字母的矢量轮廓，SVG 无需字体文件；图形沿用 Open trace 的路径和色彩。品牌板的说明文字使用系统字体，PNG 已固定渲染结果。

## 使用
独立标志最小 16 px；四周留白至少图标宽度的 1/4。
字标统一为 Pinwhy，CLI、包名和机器标识使用小写 pinwhy。
安装 site 的开发依赖后，可用 `node design/pinwhy-logo/render-identity.mjs` 重新渲染品牌板；默认使用本机 Chrome，其他路径可通过 `CHROME_PATH` 指定。
