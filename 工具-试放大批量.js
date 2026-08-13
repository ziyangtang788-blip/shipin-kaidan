/* 放大到底有没有用 —— 10 家 A/B 对照
   node 工具-试放大批量.js

   老板 2026-08-04：「拿10张图后台跑，跑完跟我说结果」

   同一张单跑两遍：原图 vs 放大到 2500px。不需要我手工对答案，
   用三个客观指标比（都是单据自己带的账，机器没法作弊）：
     ① ⛔ 对不上的行数  —— 各段之和 ≠ 表上「总数量」，少 = 好
     ② ? 看不清的段数   —— 识别自己举手说没把握，少 = 好
     ③ 品数 / 段数      —— 读出来的货，多 = 完整（前提是 ① 没变差）
   外加花了多少钱。

   ⚠ 只读不改。提示词/剥JSON/读结构全部 require 现成的，不抄第二份。 */
const fs = require("fs"), path = require("path"), https = require("https");
global.window = {};
require("./数据-价格库.js"); require("./对照-预置.js"); require("./数据-常用规格.js");
require("./数据-换算.js"); require("./引擎-解析.js"); require("./引擎-读结构.js");
const S = global.window.GM_STRUCT;

const 目录 = path.join(__dirname, ".放大测试", "批量2");
const KEY = (fs.readFileSync("密钥-本机.js", "utf8").match(/["']sk-ant-[^"']+["']/) || [])[0].slice(1, -1);

function 打(payload) {
  return new Promise((ok, no) => {
    const body = JSON.stringify(payload);
    const r = https.request({
      hostname: "api.anthropic.com", path: "/v1/messages", method: "POST",
      headers: { "content-type": "application/json", "x-api-key": KEY,
                 "anthropic-version": "2023-06-01", "content-length": Buffer.byteLength(body) }
    }, res => { const bs = []; res.on("data", d => bs.push(d));
                res.on("end", () => { const s = Buffer.concat(bs).toString("utf8");
                  try { ok(JSON.parse(s)); } catch (e) { no(new Error(s.slice(0, 200))); } }); });
    r.on("error", no); r.write(body); r.end();
  });
}

async function 跑(文件) {
  const j = await 打({
    model: "claude-opus-5", max_tokens: 8000,
    messages: [{ role: "user", content: [
      { type: "image", source: { type: "base64", media_type: "image/png",
        data: fs.readFileSync(path.join(目录, 文件)).toString("base64") } },
      { type: "text", text: S.提示词 }] }]
  });
  if (j.error) throw new Error(j.error.message);
  const txt = (j.content || []).filter(b => b.type === "text").map(b => b.text).join("\n");
  const J = S.剥JSON(txt);
  if (!J) throw new Error("剥不出格子表");
  const r = S.读结构(J);
  const u = j.usage || {};
  return {
    品: r.lines.length,
    段: r.lines.reduce((a, L) => a + (L.segs || []).length, 0),
    糊: r.lines.reduce((a, L) => a + (L.segs || []).filter(g => g.没看清).length, 0),
    对不上: (r.校验 || []).filter(x => x.类 === "总数").length,
    有账: r.lines.filter(L => L.总数 && L.总数.qty > 0).length,
    钱: ((u.input_tokens || 0) * 5 + (u.output_tokens || 0) * 25) / 1e6 * 7.25,
    出t: u.output_tokens || 0
  };
}

(async () => {
  const 家 = Array.from(new Set(fs.readdirSync(目录)
    .map(f => f.replace(/_(原图|放大)\.png$/, "")))).sort();
  console.log("一共 " + 家.length + " 家，每家跑两遍（原图 / 放大）\n");
  const 果 = [];
  for (let i = 0; i < 家.length; i++) {
    const n = 家[i];
    process.stdout.write((i + 1) + "/" + 家.length + " " + n.padEnd(20) + " ");
    const one = { 家: n };
    for (const 版 of ["原图", "放大"]) {
      try { one[版] = await 跑(n + "_" + 版 + ".png"); process.stdout.write(版 + "✓ "); }
      catch (e) { one[版] = { 错: e.message.slice(0, 60) }; process.stdout.write(版 + "✗ "); }
    }
    console.log("");
    果.push(one);
  }

  console.log("\n══════════════ 逐家对照 ══════════════");
  console.log("家                     品(原→放) 段(原→放) 看不清(原→放) 对不上(原→放)");
  console.log("─".repeat(76));
  let 糊好 = 0, 糊差 = 0, 账好 = 0, 账差 = 0, 段多 = 0, 段少 = 0, 钱原 = 0, 钱放 = 0;
  果.forEach(r => {
    const a = r.原图, b = r.放大;
    if (a.错 || b.错) { console.log(r.家.padEnd(22) + " ❌ " + (a.错 || b.错)); return; }
    const 箭 = (x, y) => (x + "→" + y + (y < x ? " ↓好" : y > x ? " ↑" : "  ="));
    console.log(r.家.padEnd(22) +
      (a.品 + "→" + b.品).padEnd(10) + (a.段 + "→" + b.段).padEnd(10) +
      箭(a.糊, b.糊).padEnd(14) + 箭(a.对不上, b.对不上));
    if (b.糊 < a.糊) 糊好++; if (b.糊 > a.糊) 糊差++;
    if (b.对不上 < a.对不上) 账好++; if (b.对不上 > a.对不上) 账差++;
    if (b.段 > a.段) 段多++; if (b.段 < a.段) 段少++;
    钱原 += a.钱; 钱放 += b.钱;
  });

  console.log("\n══════════════ 总账 ══════════════");
  console.log("看不清的段：放大后变少 " + 糊好 + " 家，变多 " + 糊差 + " 家");
  console.log("对不上的行：放大后变少 " + 账好 + " 家，变多 " + 账差 + " 家");
  console.log("读出的段数：放大后更多 " + 段多 + " 家，更少 " + 段少 + " 家");
  console.log("花费：原图 ¥" + 钱原.toFixed(2) + "　放大 ¥" + 钱放.toFixed(2) +
              "　（放大" + (钱放 > 钱原 ? "多花 " : "省了 ") + "¥" + Math.abs(钱放 - 钱原).toFixed(2) + "）");
  fs.writeFileSync(path.join(__dirname, "放大测试-结果.json"),
    JSON.stringify(果, null, 1), "utf8");
  console.log("\n明细 → 放大测试-结果.json");
})();
