/* 查 222.png（江云 8/4 那张，共82页第80页）—— node 工具-查222.js
   老板给了源文件，查两件事：
     ① A859 南站亚朵 1斤 —— 是 AI 没填，还是引擎吞了？
     ② 小豆卜总数格「8.7斤 换行 +1斤」—— 读成 8.7 还是 9.7？（观麦配送单确认是 9.7）
   原图 / 放大 各跑一遍对比。
   ⚠ 只读不改；提示词/剥JSON/读结构全部 require 现成的。 */
const fs = require("fs"), path = require("path"), https = require("https");
global.window = {};
require("./数据-价格库.js"); require("./对照-预置.js"); require("./数据-常用规格.js");
require("./数据-换算.js"); require("./引擎-解析.js"); require("./引擎-读结构.js");
const S = global.window.GM_STRUCT;
const 目录 = path.join(__dirname, ".放大测试", "单张222");
const KEY = (fs.readFileSync("密钥-本机.js", "utf8").match(/["']sk-ant-[^"']+["']/) || [])[0].slice(1, -1);

function 打(p) {
  return new Promise((ok, no) => {
    const body = JSON.stringify(p);
    const r = https.request({ hostname: "api.anthropic.com", path: "/v1/messages", method: "POST",
      headers: { "content-type": "application/json", "x-api-key": KEY,
                 "anthropic-version": "2023-06-01", "content-length": Buffer.byteLength(body) } },
      res => { const b = []; res.on("data", d => b.push(d));
               res.on("end", () => { const s = Buffer.concat(b).toString("utf8");
                 try { ok(JSON.parse(s)); } catch (e) { no(new Error(s.slice(0, 200))); } }); });
    r.on("error", no); r.write(body); r.end();
  });
}

async function 跑(文件) {
  const j = await 打({ model: "claude-opus-5", max_tokens: 8000,
    messages: [{ role: "user", content: [
      { type: "image", source: { type: "base64", media_type: "image/png",
        data: fs.readFileSync(path.join(目录, 文件)).toString("base64") } },
      { type: "text", text: S.提示词 }] }] });
  if (j.error) throw new Error(j.error.message);
  const txt = (j.content || []).filter(b => b.type === "text").map(b => b.text).join("\n");
  const J = S.剥JSON(txt);
  if (!J) throw new Error("剥不出格子表");
  /* 原始格子表存下来 —— 这是分清「AI 没填」还是「引擎吞了」的唯一办法 */
  fs.writeFileSync(path.join(__dirname, "调试-222-" + 文件.replace(".png", "") + ".json"),
    JSON.stringify(J, null, 1), "utf8");
  const r = S.读结构(J);

  /* ── ① A859 在不在 ── */
  const 生 = JSON.stringify(J);
  const AI里有A859 = /A\s*859|南站亚朵/.test(生);
  const 皮 = r.lines.find(L => /豆腐皮|千张/.test(L.text || ""));
  const 引擎里有A859 = !!(皮 && (皮.segs || []).some(g => /A\s*859|南站亚朵/.test(g.code || "")));

  /* ── ② 小豆卜的总数读成几 ── */
  const 小 = r.lines.find(L => /小豆卜|小豆腐卜/.test(L.text || ""));
  /* AI 原样填的那一格是什么 */
  const 小行 = (J.行 || []).find(R => /小豆卜|小豆腐卜/.test(R.品名 || ""));

  const u = j.usage || {};
  return {
    品: r.lines.length,
    段: r.lines.reduce((a, L) => a + (L.segs || []).length, 0),
    糊: r.lines.reduce((a, L) => a + (L.segs || []).filter(g => g.没看清).length, 0),
    AI里有A859, 引擎里有A859,
    皮总: 皮 && 皮.总数 ? 皮.总数.qty : null,
    皮和: 皮 ? 皮.qty : null,
    皮段: 皮 ? (皮.segs || []).length : 0,
    小总原文: 小行 ? JSON.stringify(小行.表上总数) : "(没这行)",
    小总: 小 && 小.总数 ? 小.总数.qty : null,
    小和: 小 ? 小.qty : null,
    钱: ((u.input_tokens || 0) * 5 + (u.output_tokens || 0) * 25) / 1e6 * 7.25
  };
}

(async () => {
  console.log("标准答案（对着原图数的）：");
  console.log("  豆腐皮/千张 总数 14，7 段：A827领逸2 + A859南站亚朵1 + A615大良桔子6.5");
  console.log("                        + A044金沙洲全季1 + A801凯悦嘉轩1.5 + A052德律1 + B141城际1 = 14");
  console.log("  小豆卜 总数格写的是「8.7斤」换行「+1斤」→ 应该是 9.7（观麦配送单作证）\n");
  for (const f of ["原图.png", "放大.png"]) {
    process.stdout.write(f.padEnd(10) + " … ");
    try {
      const r = await 跑(f);
      console.log("好");
      console.log("   品 " + r.品 + " / 段 " + r.段 + " / 看不清 " + r.糊);
      console.log("   ① A859 南站亚朵：AI 填了吗 " + (r.AI里有A859 ? "✅ 填了" : "❌ 没填") +
                  "　引擎读到了吗 " + (r.引擎里有A859 ? "✅ 有" : "❌ 没有"));
      console.log("      豆腐皮：表上总数 " + r.皮总 + "　各段之和 " + r.皮和 +
                  "　共 " + r.皮段 + " 段" + (r.皮和 === 14 ? "  ✅" : "  ✗ 应是 14"));
      console.log("   ② 小豆卜：AI 往「表上总数」格填的是 " + r.小总原文 +
                  "　→ 读结构拿到 " + r.小总 + (r.小总 === 9.7 ? "  ✅" : "  ✗ 应是 9.7"));
      console.log("      各段之和 " + r.小和);
      console.log("   花费 ¥" + r.钱.toFixed(2) + "\n");
    } catch (e) { console.log("❌ " + e.message.slice(0, 120) + "\n"); }
  }
  console.log("原始格子表已存 → 调试-222-原图.json / 调试-222-放大.json");
})();
