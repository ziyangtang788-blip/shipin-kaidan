---
name: rules-index-two-layers
description: 规矩分两层——CLAUDE.md 放每次都要的结论，说明-规矩总表.md 放细节按需查；这几条别再往 MEMORY.md 索引里加
metadata: 
  node_type: memory
  type: feedback
  originSessionId: b2db456d-5414-4cc4-978a-0ec2538b4432
  modified: 2026-08-04T03:39:25.004Z
---

2026-08-04 定的分层：**每次会话自动读进上下文的只有两份**——项目根的 `CLAUDE.md`（≤60 行）
和这个目录的 `MEMORY.md` 索引。这两份必须短且稳定，改一个字整段上下文重算。

- **CLAUDE.md** = 每次都要的结论：省钱铁律、认错=0、只准一份、斤转板、拎出来问、部署、密钥，
  加一张「要查细节去哪」的索引表。
- **`说明-规矩总表.md`**（项目根，523 行）= 唯一权威的正式条文，**不进上下文**，按节号只读那一段。
- **`记忆/*.md`** = 老板的原话和「为什么」，按需翻。

**How to apply:** 下面这几条已经原样进了 CLAUDE.md，**不许再往 MEMORY.md 索引里加**（重复=每次会话白花钱，
而且两处会漂移）：`zero-silent-errors-rule`、`one-copy-of-match-logic`、`weight-to-board-rule`、
`flag-dont-generalize`、`token-cost-discipline`。md 原文件保留——CLAUDE.md 只有结论，原话和踩过的坑在那儿。

**Why:** 同一条规矩存三份，早晚有一份改了另两份没改；而重复的那份每次开会话都要花钱读一遍。

要改 CLAUDE.md 就下次会话开头改，别中途改。相关：[[token-cost-discipline]]、[[one-copy-of-match-logic]]
