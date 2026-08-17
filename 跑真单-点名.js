/* 拿 130 份真单跑点名：node 跑真单-点名.js
   老板 2026-08-14：「跑完自己试试，不漏就算成功」

   自己出的卷子自己考不算数 —— 这里用的是桌面\OCR缓存 里 130 份真实客户下单表。
   只看两件事：
     ① 出不出得来货（品名+数量都有）
     ② 要问的有几条（0 条不一定好——可能是根本没检出；几十条也不好——太吵） */
const fs = require("fs"), path = require("path");
global.window = global.window || {};
require("./引擎-解析.js");
/* ★ 2026-08-17：抓取判品名列要拿价格库当尺子。不加载它会静默退回老办法，测了个假的。 */
require("./数据-价格库.js");
require("./引擎-抓取.js");
const G = window.GM_抓取;

const 缓存 = path.join(process.env.USERPROFILE || "C:/Users/李正", "Desktop", "OCR缓存");

function 变格子(text) {
  const rows = [];
  text.split(/\r?\n/).forEach(l => {
    const t = l.trim();
    if (t.indexOf("|") < 0) { if (t) rows.push([t]); return; }
    if (/^\|?[\s:|-]+\|?$/.test(t)) return;
    rows.push(t.replace(/^\||\|$/g, "").split("|").map(c => c.trim()));
  });
  return rows;
}

const files = fs.readdirSync(缓存).filter(f => /\.txt$/i.test(f));
let 出货 = 0, 空手 = 0, 炸了 = 0, 总问 = 0, 零问 = 0;
const 榜 = [], 空的 = [];

files.forEach(f => {
  let rows;
  try { rows = 变格子(fs.readFileSync(path.join(缓存, f), "utf8")); }
  catch (e) { 炸了++; return; }
  let r;
  try { r = G.抓(rows); } catch (e) { 炸了++; 榜.push({ f, 问: -1, 说: "炸了：" + e.message }); return; }
  const 行 = (r && r.行) || [], 问 = (r && r.没抓到的) || [];
  let 量 = 0, 点 = 0;
  行.forEach(L => (L.分布 || []).forEach(d => {
    const q = parseFloat(d.数量); if (!isNaN(q)) 量 += q;
    if (d.点位号 || d.点位名) 点++;
  }));
  if (行.length) 出货++; else { 空手++; 空的.push(f.slice(0, 34)); }
  总问 += 问.length;
  if (!问.length) 零问++;
  榜.push({ f: f.slice(0, 34), 样: 行.length, 量: Math.round(量 * 100) / 100, 点, 问: 问.length, 头: 问[0] });
});

console.log("\n═══ 130 份真单 · 点名结果 ═══");
console.log(`  出得来货    ${出货} 份`);
console.log(`  一样都没读出 ${空手} 份`);
console.log(`  跑炸了      ${炸了} 份`);
console.log(`  要问的合计  ${总问} 条，平均每份 ${(总问 / files.length).toFixed(1)} 条；一条都不问的 ${零问} 份`);

console.log("\n── 要问得最多的 8 份（看看是不是误报）──");
榜.filter(x => x.问 > 0).sort((a, b) => b.问 - a.问).slice(0, 8).forEach(x => {
  console.log(`  ${x.问} 条　${x.样} 样/量${x.量}　${x.f}`);
  if (x.头) console.log(`       例：第${x.头.行}行第${x.头.列}列「${x.头.原文}」—— ${x.头.为什么}`);
});

if (空的.length) {
  console.log("\n── ⛔ 一样货都没读出来的（这才是真漏）──");
  空的.slice(0, 12).forEach(f => console.log("  " + f));
}
