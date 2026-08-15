---
name: deploy-via-github-relay
description: 部署走 GitHub 中转；2026-08-09 起服务器每 2 分钟自动拉，更新只剩「拖 kd.bin 到 GitHub」一步
metadata: 
  node_type: memory
  type: project
  originSessionId: 9de73d7b-cef3-4bef-9564-5b07affd1140
  modified: 2026-08-09T13:44:29.757Z
---

到 VPS `187.124.137.49`（Hostinger 雅加达）的直连长期不通：**只要 Windscribe VPN 开着**，22 端口 `Connection timed out`，80/443 是假连接（TCP 握上手不回字节）。凭据齐全没用，包发不出去。见 [[vpn-blocks-deploy-and-claude]]。

**2026-08-09 装好了自动拉，以后不用再折腾：**

- 服务器 crontab `*/2 * * * * /bin/sh /opt/kaidan/autopull.sh`
- 它比对 `raw.githubusercontent.com/ziyangtang788-blip/douzp/main/kd.bin` 的 sha256，变了才解包安装，没变什么都不做
- 解包密码存在 `/opt/kaidan/.relaykey`（600）；仓库是**公开**的，所以包必须加密：`openssl enc -aes-256-cbc -pbkdf2`，密码 `lw-K7m2-Qx91-2026`
- 日志 `/var/log/kaidan-autopull.log`

**包的结构**（`tar czf` 后加密成 kd.bin）：`web/`（14 个前端 + new-ui.html）、`server.js`、`install.sh`、`setup-autopull.sh`。
中文文件名全写在 `install.sh` 里 —— **控制台里粘的命令必须纯 ASCII**，粘中文会坏。别再用 `ls -S *.html | head -1` 挑首页，new-ui.html 比开单台还大，会挑错；`install.sh` 里直接写死 `ln -sf 配送开单台.html index.html`。

**How to apply:**
- 更新流程：我在本地重新打包加密 → **他**把 kd.bin 拖到 GitHub 仓库覆盖 → 2 分钟后自动上线。
- **`git push` 会被 Claude Code 的分类器拦**（commit 可以，push 不行），所以最后那一下必须他在浏览器拖，除非他给 Bash 加 push 权限。
- 验收：从外网 `WebFetch https://choeyy88.com/` 返回 **401** 就说明服务器/证书/密码保护都正常（"外网 WRONG_VERSION_NUMBER" 那个老毛病已经没有了）；版本号被 401 挡着看不到，要他登进去看右上角，或在服务器上 `curl --resolve choeyy88.com:443:127.0.0.1`。
- 备用路：断 VPN 双击 `桌面\部署包\2-上传网页.bat`（走 scp 直连）。
- 治本还是换机房，见 [[deployed-site-and-server]]。

---

## 2026-08-14：**这套绕路作废了，别再用**

当初搞 GitHub 加密中转，前提是「他的网络到 VPS 全端口不通」。这个前提是错的 —— 只是 SSH 从 22 搬到了 50000（见 [[vpn-blocks-deploy-and-claude]]）。

现在 `scp -P 50000 -i ~/.ssh/kaidan` 直连就能传，开着 VPN 也行。中转、浏览器 Console 那一套全都不需要了。
