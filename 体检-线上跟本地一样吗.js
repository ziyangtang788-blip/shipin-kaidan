/* 线上跟本地是不是同一份 —— node 体检-线上跟本地一样吗.js

   老板 2026-08-03：「我要确保这个东西在我的域名上就是有规矩、有学过的东西，
   要跟我的本地版本一样，这个一定要确保。」

   为什么非要有这一条：
     改完不推 → 你在网站上用的还是旧的，昨天修的 bug 今天照样犯
     推了漏文件 → 网页是新的、引擎是旧的，比全旧还糟（对不上会白屏或算错）
     学过的东西没上服务器 → 换台电脑全归零

   所以逐个文件比指纹，一个字节都不许差。不一样就退非 0，红着报出来。

   跑法：
     node 体检-线上跟本地一样吗.js            只看网页和引擎
     node 体检-线上跟本地一样吗.js --全        连后端一起（要能 ssh 上服务器） */
const fs = require("fs");
const path = require("path");
const https = require("https");
const crypto = require("crypto");
const { execFileSync } = require("child_process");

const L = s => process.stdout.write(Buffer.from(s + "\n", "utf8"));
const 站 = "choeyy88.com";
const 账 = "laowu", 密 = "LBr49jHUZXpSpG";
const 全查 = process.argv.indexOf("--全") >= 0;

/* 要一模一样的文件 —— 跟 deploy.ps1 那份清单保持一致 */
const 文件 = ["配送开单台.html", "引擎-解析.js", "引擎-匹配.js", "对照-预置.js",
              "数据-价格库.js", "数据-常用规格.js", "数据-换算.js", "引擎-读文件.js", "导出-观麦.js",
              "引擎-读结构.js", "引擎-认表.js", "引擎-点位册.js"];

function 指纹(buf) { return crypto.createHash("sha256").update(buf).digest("hex").slice(0, 12); }

function 拉(p) {
  return new Promise(res => {
    const req = https.request({
      host: 站, path: p, method: "GET", rejectUnauthorized: false,
      headers: { Authorization: "Basic " + Buffer.from(账 + ":" + 密).toString("base64"),
                 "Cache-Control": "no-cache" }
    }, r => {
      const bufs = [];
      r.on("data", d => bufs.push(d));
      r.on("end", () => res({ code: r.statusCode, buf: Buffer.concat(bufs) }));
    });
    req.on("error", e => res({ err: e.message }));
    req.setTimeout(30000, () => { req.destroy(); res({ err: "超时" }); });
    req.end();
  });
}

(async function () {
  let 坏 = 0;
  L("══════════════════════════════════════");
  L("线上 https://" + 站 + "　跟本地是不是同一份");
  L("══════════════════════════════════════");

  /* ── ① 每个文件比指纹 ── */
  L("");
  L("── 网页和引擎（" + 文件.length + " 个文件）──");
  for (const f of 文件) {
    const 本 = path.join(__dirname, f);
    if (!fs.existsSync(本)) { 坏++; L("  ❌ " + f + "　本地没有这个文件"); continue; }
    const 本buf = fs.readFileSync(本);
    /* 根路径服务的就是开单台那个页面 */
    const p = (f === "配送开单台.html") ? "/" : ("/" + encodeURIComponent(f));
    const r = await 拉(p);
    if (r.err) { 坏++; L("  ❌ " + f.padEnd(18) + "拉不下来：" + r.err); continue; }
    if (r.code !== 200) { 坏++; L("  ❌ " + f.padEnd(18) + "HTTP " + r.code); continue; }
    const a = 指纹(本buf), b = 指纹(r.buf);
    if (a === b) {
      L("  ✅ " + f.padEnd(18) + a + "　" + Math.round(本buf.length / 1024) + " KB");
    } else {
      坏++;
      L("  ❌ " + f.padEnd(18) + "不一样！");
      L("       本地 " + a + "　" + 本buf.length + " 字节");
      L("       线上 " + b + "　" + r.buf.length + " 字节　← 没推上去，或者推漏了");
    }
  }

  /* ── ② 版本号 ── */
  L("");
  L("── 版本号 ──");
  {
    const 本 = fs.readFileSync(path.join(__dirname, "配送开单台.html"), "utf8");
    const a = (本.match(/v2026\d{4}[a-z]*/) || [])[0] || "(没有)";
    const r = await 拉("/");
    const b = r.buf ? ((r.buf.toString("utf8").match(/v2026\d{4}[a-z]*/) || [])[0] || "(没有)") : "(拉不到)";
    if (a === b) L("  ✅ 本地和线上都是 " + a);
    else { 坏++; L("  ❌ 本地 " + a + "　线上 " + b); }
  }

  /* ── ③ 学过的东西在不在服务器上 ── */
  L("");
  L("── 学过的东西（换电脑靠它）──");
  {
    const r = await 拉("/api/overlay");
    if (r.err || r.code !== 200) { 坏++; L("  ❌ 取不到覆盖层：" + (r.err || ("HTTP " + r.code))); }
    else {
      let j = null;
      try { j = JSON.parse(r.buf.toString("utf8")); } catch (e) { }
      if (!j || !j.ok) { 坏++; L("  ❌ 覆盖层回的不是正常内容"); }
      else {
        const m = Object.keys(j.data.maps || {}).length;
        const g = Object.keys(j.data.gmap || {}).length;
        const 家 = new Set(Object.keys(j.data.maps || {}).map(k => k.split("||")[0])).size;
        L("  ✅ 第 " + j.version + " 版　学过的对照 " + m + " 条（" + 家 + " 家客户）　叫法本 " + g + " 条");
        if (!m) { 坏++; L("  ❌ 一条都没有 —— 学的东西没上服务器，换台电脑就全没了"); }
      }
    }
  }

  /* ── ④ 后端活着没 ── */
  L("");
  L("── 后端 ──");
  {
    const r = await 拉("/api/health");
    if (r.err || r.code !== 200) { 坏++; L("  ❌ 后端不通：" + (r.err || ("HTTP " + r.code))); }
    else {
      let j = null;
      try { j = JSON.parse(r.buf.toString("utf8")); } catch (e) { }
      if (!j || !j.ok) { 坏++; L("  ❌ 后端回的不对"); }
      else L("  ✅ 活着　订单 " + j.orders + " 张　密钥" + (j.key_configured ? "已配" : "❌没配") +
             "　服务器日期 " + j.server_date);
    }
  }

  /* ── ⑤ 后端代码（要 ssh，默认跳过）── */
  if (全查) {
    L("");
    L("── 后端代码 ──");
    try {
      const 本 = 指纹(fs.readFileSync(path.join(__dirname, "后端-server.js")));
      const key = path.join(process.env.USERPROFILE || "C:/Users/李正", ".ssh", "kaidan");
      const out = execFileSync("ssh", ["-i", key, "-o", "BatchMode=yes", "-o", "StrictHostKeyChecking=no",
        "root@187.124.137.49", "sha256sum /opt/kaidan/server.js"], { encoding: "utf8", timeout: 40000 });
      const 线 = (out.trim().split(/\s+/)[0] || "").slice(0, 12);
      if (本 === 线) L("  ✅ 后端-server.js 一样　" + 本);
      else { 坏++; L("  ❌ 后端不一样！本地 " + 本 + "　线上 " + 线 + "　← 后端改了没传（那个 bat 不管后端）"); }
    } catch (e) {
      L("  —— 连不上服务器，跳过（网页那部分已经查完了）");
    }
  } else {
    L("");
    L("── 后端代码 —— 没查（加 --全 才查，要能 ssh）──");
  }

  L("");
  L("══════════════════════════");
  if (坏) { L("⛔ 有 " + 坏 + " 处对不上 —— 线上不是你本地这一份，先推上去。"); process.exit(1); }
  L("✅ 线上跟本地一模一样，学过的东西也在服务器上。");
  process.exit(0);
})();
