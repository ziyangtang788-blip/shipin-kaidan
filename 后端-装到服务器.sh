#!/bin/bash
# 把开单台后端装成开机自启的服务。在服务器上跑一次就够了。
#   scp 后端-server.js root@187.124.137.49:/opt/kaidan/server.js
#   ssh root@187.124.137.49 'bash -s' < 后端-装到服务器.sh
#
# Caddy 那边 /api/* → 127.0.0.1:8788 的转发已经配好了，这里不用动它。
set -e

install -d /opt/kaidan /var/www/kaidan-data/orders

cat > /etc/systemd/system/kaidan-api.service <<'UNIT'
[Unit]
Description=开单台后端（订单记录 / 共享对照 / 识别代理）
After=network.target

[Service]
Type=simple
ExecStart=/usr/bin/node /opt/kaidan/server.js
Environment=KAIDAN_DATA=/var/www/kaidan-data
Restart=always
RestartSec=3
# 数据目录归 caddy 用户没意义 —— 只有这个进程读写它
User=root
WorkingDirectory=/opt/kaidan
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
UNIT

systemctl daemon-reload
systemctl enable kaidan-api
systemctl restart kaidan-api
sleep 1

echo "── 服务状态 ──"
systemctl is-active kaidan-api
echo "── 自己打自己 ──"
curl -s --max-time 10 http://127.0.0.1:8788/api/health
echo
echo "── 经 Caddy 打（要带账号密码）──"
curl -s --max-time 10 -u laowu:LBr49jHUZXpSpG https://choeyy88.com/api/health -k
echo
