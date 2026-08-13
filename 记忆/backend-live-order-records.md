---
name: backend-live-order-records
description: 2026-08-01 后端上线了：订单记录存服务器、单号服务器发、API密钥收服务器；点位改成纯照搬不挂价格
metadata: 
  node_type: memory
  type: project
  originSessionId: 8b3094cc-fb0c-4063-b02a-1411d98f9149
  modified: 2026-08-02T03:43:00.615Z
---

2026-08-01 上线 v20260801h，后端第一次真跑起来（代码早就写好，一直没装）。

**服务器上的位置**
- 前端 7 个文件 → `/var/www/kaidan/`，`index.html` 是指向 `配送开单台.html` 的软链
- 后端 → `/opt/kaidan/server.js`，systemd 服务名 `kaidan-api`，已 enable 开机自启
- 数据 → `/var/www/kaidan-data/`（`orders/YYYY-MM.jsonl` 逐行追加、`seq.json` 发号、`overlay.json` 共享对照、`config.json` 放密钥）
- Caddy 早就配好了 `/api/* → 127.0.0.1:8788`，装的时候不用动它
- 装/更新后端：`scp 后端-server.js → /opt/kaidan/server.js`，再 `ssh 'bash -s' < 后端-装到服务器.sh`

**改了行为的两处，别改回去**
- **单号由服务器按「单据日期」发**，不是按今天 —— 补昨天的单，号里的日期要跟单据上印的一致。前端写死 `-01` 那个 bug 是这么修的。
- **点位（客户的送货地址）只照搬，不挂任何逻辑**：老板 8/1 明确拍板，不认商品、不算价、不记忆、不配名单。原来雅食乐「131/132/134 减 0.40」那条已清空（`GM_SEED_SPOT = []`），机制留着但没有预置规则。雅食乐真正的问题是价格库过期，解法是重拉观麦。

**Why:** 订单存过就没了、一天开十张单全叫同一个号，是老板自己发现的两个硬伤；密钥原来在前端，按 F12 就能抄走。

**How to apply:**
- 「调出来改」= 用同一个 order_no 再 POST 一次。文件只追加（并发安全），读的时候同号只认最新那条，列表里还是一张单。改这块要同时看 `scanOrders` 的 dedupe。
- 前端 `ST.dirty` 控制要不要重存：存过且没动过就直接返回原单号，动过才用同号再存。
- 上传前必须 `node 全部检查.js`（现在十项，含 [[one-copy-of-match-logic]] 那条护栏）。
- 推送方式见 [[deploy-via-github-relay]] —— **但那是 VPN 开着时的绕路办法**，VPN 关掉后 scp 直连就通，正常情况直接 scp 即可。
