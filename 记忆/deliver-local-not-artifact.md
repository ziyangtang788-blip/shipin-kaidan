---
name: deliver-local-not-artifact
description: 交付方式：食品配送工具要本地文件，不要发布 Artifact 链接
metadata: 
  node_type: memory
  type: feedback
  originSessionId: 71b4f19a-7c83-45c1-b1ff-6911203d4a79
  modified: 2026-07-28T03:59:18.879Z
---

做食品配送开单工具时，**不要发布成 Artifact 链接**（`claude.ai/code/artifact/...`）。直接在项目文件夹里生成本地 HTML 文件，双击就能开。

**Why:** 用户 2026-07-28 明确说的——这是要交付给真实客户天天用的工具，后期会买域名把它推上去，Artifact 链接不是最终形态。

**How to apply:** 写完文件就告诉他文件路径，别调 Artifact 工具。做成**自包含单文件**（不依赖外部 CDN、不联网取资源），这样直接丢到静态托管就能上域名。相关：[[food-delivery-quote-system]]
