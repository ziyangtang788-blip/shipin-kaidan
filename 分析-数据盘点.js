/* 盘点「也一原始数据」：哪些文件夹有图、能不能对上价格库的客户
   node 分析-数据盘点.js  */
const fs = require("fs"), path = require("path");
global.window = {};
require("./数据-价格库.js");
require("./引擎-解析.js");
const D = global.window.GM_DATA, P = global.window.GM_PARSE;
const norm = P.norm;

const ROOT = "C:/Users/李正/Desktop/也一原始数据/客户/客户";

/* 把名字剥到只剩「有区分度的字」，用来做模糊对名 */
function key(s) {
  return norm(String(s || ""))
    .replace(/[（）()\-－_\s]/g, "")
    .replace(/(有限|责任|股份|公司|集团|企业|商行|商贸|贸易|经营部|经营店|管理|服务|供应链|食品|农产品|农副产品|生鲜|配送|中心|分公司)/g, "");
}

const custs = D.custs.map((c, i) => ({ i, sid: c[0], name: c[1], k: key(c[1]) }));
const items = {};
D.items.forEach(it => { items[D.custs[it[0]][0]] = (items[D.custs[it[0]][0]] || 0) + 1; });

const dirs = fs.readdirSync(ROOT, { withFileTypes: true })
  .filter(d => d.isDirectory()).map(d => d.name);

function countImgs(dir) {
  let n = 0;
  const walk = p => {
    for (const e of fs.readdirSync(p, { withFileTypes: true })) {
      const fp = path.join(p, e.name);
      if (e.isDirectory()) walk(fp);
      else if (/\.(png|jpe?g|webp|bmp)$/i.test(e.name)) n++;
    }
  };
  try { walk(dir); } catch (e) { }
  return n;
}

const rows = dirs.map(name => {
  const full = path.join(ROOT, name);
  const imgs = countImgs(full);
  const k = key(name);
  let hit = custs.find(c => c.k === k);                                   // 完全一样
  let how = hit ? "名字完全对上" : "";
  if (!hit) { hit = custs.find(c => c.k && k && (c.k.includes(k) || k.includes(c.k))); if (hit) how = "包含关系"; }
  return { name, imgs, sid: hit ? hit.sid : "", cust: hit ? hit.name : "", how, items: hit ? (items[hit.sid] || 0) : 0 };
});

const withImg = rows.filter(r => r.imgs > 0).sort((a, b) => b.imgs - a.imgs);
const empty = rows.filter(r => r.imgs === 0);
const matched = withImg.filter(r => r.sid);
const unmatched = withImg.filter(r => !r.sid);

console.log("\n════════ 盘点 ════════");
console.log("文件夹        " + rows.length + " 个");
console.log("  有图        " + withImg.length + " 家   共 " + withImg.reduce((s, r) => s + r.imgs, 0) + " 张");
console.log("  空的        " + empty.length + " 家");
console.log("有图且对上客户 " + matched.length + " 家   共 " + matched.reduce((s, r) => s + r.imgs, 0) + " 张  ← 这些能直接处理");
console.log("有图但对不上   " + unmatched.length + " 家   共 " + unmatched.reduce((s, r) => s + r.imgs, 0) + " 张  ← 要人工指认");

if (unmatched.length) {
  console.log("\n──── 对不上价格库的（要你告诉我是哪家）────");
  unmatched.forEach(r => console.log("  " + String(r.imgs).padStart(3) + " 张  " + r.name));
}

console.log("\n──── 能直接处理的（按张数排）────");
matched.slice(0, 30).forEach(r =>
  console.log("  " + String(r.imgs).padStart(3) + " 张  " + r.sid.padEnd(8) +
    r.cust.slice(0, 26).padEnd(28) + "在售" + String(r.items).padStart(4) + " 项" +
    (r.how === "包含关系" ? "  ⚠按名字猜的" : "")));
if (matched.length > 30) console.log("  …… 还有 " + (matched.length - 30) + " 家");

if (empty.length) {
  console.log("\n──── 空文件夹（没放图）────");
  console.log("  " + empty.map(r => r.name).slice(0, 20).join("、") + (empty.length > 20 ? " …… 等 " + empty.length + " 家" : ""));
}

fs.writeFileSync("数据盘点.json", JSON.stringify({ withImg, empty, unmatched }, null, 1), "utf8");
console.log("\n明细已写入 数据盘点.json");
