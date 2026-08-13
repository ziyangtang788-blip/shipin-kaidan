/* 试放大 —— node 工具-试放大.js
   老板 2026-08-04：「能不能就是我们可以把图处理得更清晰之后再来读」→「试试」

   量到的事实：121 张原图长边中位数只有 474px，江云这张 763×598、21KB，
   而 Opus 5 能吃到 2576px。所以一直是拿缩略图在读密表。

   这个脚本只干一件事：同一张单，三种喂法各跑一遍，逐项对答案。
   ⚠ 只读不改，不碰任何业务逻辑；提示词/剥JSON/读结构全部 require 现成的，
     不抄第二份（老板的老规矩）。

   标准答案（我对着原图一格一格数出来的，江云 8/1 那页 共70页第68页）：
     嫩豆腐 总数 8.5：B189 丽枫 2 + B129 美啊 4.5 + A003 禧月荟 0 + A832 春华 2 = 8.5
     ★ 重点看 B189 丽枫那 2 斤 —— 现在读成 ?，放大后能不能读出 2
     豆腐皮/千张 总数 12：7 段加起来 12
     全表 14 行 */
const fs = require("fs"), path = require("path"), https = require("https");
global.window = {};
require("./数据-价格库.js"); require("./对照-预置.js"); require("./数据-常用规格.js");
require("./数据-换算.js"); require("./引擎-解析.js"); require("./引擎-读结构.js");
const S = global.window.GM_STRUCT;

const 目录 = path.join(__dirname, ".放大测试");
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
                  try { ok(JSON.parse(s)); } catch (e) { no(new Error(s.slice(0, 300))); } }); });
    r.on("error", no); r.write(body); r.end();
  });
}

async function 跑(名, 文件们) {
  const 图 = 文件们.map(f => ({
    type: "image",
    source: { type: "base64", media_type: "image/png",
              data: fs.readFileSync(path.join(目录, f)).toString("base64") }
  }));
  const j = await 打({
    model: "claude-opus-5", max_tokens: 8000,
    messages: [{ role: "user", content: 图.concat([{ type: "text", text: S.提示词 }]) }]
  });
  if (j.error) throw new Error(j.error.message);
  const txt = (j.content || []).filter(b => b.type === "text").map(b => b.text).join("\n");
  const J = S.剥JSON(txt);
  if (!J) throw new Error("剥不出格子表");
  const r = S.读结构(J);

  /* ── 逐项对答案 ── */
  const 嫩 = r.lines.find(L => /嫩豆腐/.test(L.text || ""));
  const 皮 = r.lines.find(L => /豆腐皮|千张/.test(L.text || ""));
  const B189 = 嫩 && (嫩.segs || []).find(g => /B\s*189|丽枫/.test(g.code || ""));
  const 段 = r.lines.reduce((a, L) => a + (L.segs || []).length, 0);
  const 糊 = r.lines.reduce((a, L) => a + (L.segs || []).filter(g => g.没看清).length, 0);
  const u = j.usage || {};
  return {
    名, 品: r.lines.length, 段, 糊,
    嫩和: 嫩 ? 嫩.qty : null, 嫩总: 嫩 && 嫩.总数 ? 嫩.总数.qty : null,
    B189: B189 ? (B189.没看清 ? "?" : B189.qty) : "(没这一段)",
    皮和: 皮 ? 皮.qty : null, 皮总: 皮 && 皮.总数 ? 皮.总数.qty : null,
    警: S.校验说人话(r.校验).length,
    进: u.input_tokens || 0, 出: u.output_tokens || 0
  };
}

(async () => {
  const 组 = [
    ["① 原图 763px", ["1-原图.png"]],
    ["② 整张放大 2571px", ["2-放大3.4倍.png"]],
    ["③ 切三条各放大 2500px", ["3-第1条.png", "3-第2条.png", "3-第3条.png"]]
  ];
  const 出 = [];
  for (const [名, fs2] of 组) {
    process.stdout.write(名 + " … ");
    try { const r = await 跑(名, fs2); 出.push(r); console.log("好"); }
    catch (e) { console.log("❌ " + e.message.slice(0, 90)); 出.push({ 名, 错: e.message }); }
  }

  console.log("\n══════════ 对答案 ══════════");
  console.log("标准答案：14 品　嫩豆腐各段=8.5（B189 丽枫应是 2）　豆腐皮各段=12\n");
  const 行 = (a, b, c, d, e, f, g) =>
    console.log(String(a).padEnd(24) + String(b).padStart(5) + String(c).padStart(6) +
                String(d).padStart(8) + String(e).padStart(9) + String(f).padStart(8) + String(g).padStart(8));
  行("跑法", "品", "段", "B189", "嫩豆腐和", "豆皮和", "看不清");
  console.log("─".repeat(70));
  出.forEach(r => {
    if (r.错) { console.log(String(r.名).padEnd(24) + "  ❌ " + r.错.slice(0, 40)); return; }
    行(r.名, r.品, r.段,
       r.B189 === 2 ? "2 ✅" : String(r.B189),
       (r.嫩和 === 8.5 ? r.嫩和 + " ✅" : r.嫩和 + " ✗"),
       (r.皮和 === 12 ? r.皮和 + " ✅" : r.皮和 + " ✗"),
       r.糊);
  });
  console.log("\n花费：");
  出.filter(r => !r.错).forEach(r => {
    const 美 = (r.进 * 5 + r.出 * 25) / 1e6;
    console.log("  " + r.名.padEnd(24) + " 进 " + r.进 + " / 出 " + r.出 +
                "　约 ¥" + (美 * 7.25).toFixed(2));
  });
})();
