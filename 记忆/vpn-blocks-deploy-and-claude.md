---
name: vpn-blocks-deploy-and-claude
description: VPN 开着连不上 VPS、关掉又用不了 Claude Code —— 部署必须做成断网也能双击跑完的脚本
metadata: 
  node_type: memory
  type: project
  originSessionId: 9de73d7b-cef3-4bef-9564-5b07affd1140
  modified: 2026-08-09T12:06:48.772Z
---

2026-08-09：他的 Windscribe VPN 是个死结 —— **开着**时到 `187.124.137.49` 的 22 端口不通、80/443 是假连接（TCP 连上但一个字节不回）；**关掉**后他就连不上 Claude Code，没法跟我交互。

**Why:** 所以「你断一下 VPN 我来推」这条路根本走不通，两边不可能同时在线。

**How to apply:**
- 部署一律做成**一次性双击跑完**的脚本，落在 `桌面\部署包\`（`2-上传网页.bat` → `push-all.ps1`）。流程：他断 VPN → 双击 → 重连 VPN → 把 `桌面\上传日志.txt` 发我。
- 脚本第一步必须先测 22 端口，VPN 没断就直接停，别让他白等。
- `.ps1` 存盘**必须带 UTF-8 BOM**，否则 PS 5.1 按 ANSI 读，里面的中文文件名全乱码。`.bat` 内容只许 ASCII，靠 `%~dp0` 拿中文目录。
- 免密钥匙在 `~/.ssh/kaidan`，正常不问密码。
- 实在推不动再退回 [[deploy-via-github-relay]]。

---

## 2026-08-14 证伪：**根本不是 VPN，是 SSH 端口搬了家**

服务器的 sshd **不在 22，在 50000**（`ss -lntp` 里那个 `[::]:50000`，横幅 `SSH-2.0-OpenSSH_9.6p1`）。所有部署脚本都写死连 22，于是一直连不上，被误判成「VPN 把网封了」，白折腾好几天。

**一句话分辨法**（以后连不上先跑这个，别猜）：

```
Test-NetConnection github.com -Port 22        # 对照组
Test-NetConnection 187.124.137.49 -Port 22
```

- github 通、这台不通 → **服务器那头的事**（端口变了 / sshd 没起 / 防火墙），跟 VPN 无关
- 两个都不通 → 才轮到怀疑本机网络或 VPN

已改：`部署包\push-all.ps1` 加了 `$PORT = 50000`，scp 用 `-P`、ssh 用 `-p`。开着 VPN 也能传，**不用再断网**。

**教训**：「连不上」有十几种原因，直接认定其中一种就是猜。先做对照组。见 [[root-cause-before-any-change]]
