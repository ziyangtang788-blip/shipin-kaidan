/* 单子上的数，有多少是「蒙」出来的 —— node 查-多少数是蒙的.js
   老板 2026-08-18 问：「多少数是蒙的？」我们俩都不知道，所以量一遍。
   ⚠ 纯统计，开单台一个字都不动，不改任何行为。

   什么叫「蒙的」：原表里【没有这个数】，是系统拿别的列凑出来的。
     朱鲜生「中板豆腐 24板」—— 表上确实写着 24，但它该分给 6 个点位，
     系统不知道怎么分，就整个塞进一个点位。数没错，货全错。 */
global.window = global.window || {};
require("./引擎-解析.js"); require("./数据-价格库.js"); require("./引擎-读结构.js");
require("./数据-切法规矩.js"); require("./引擎-断句规矩.js");
require("./引擎-认表.js"); require("./引擎-抓取.js");
const T = window.GM_TABLE, G = window.GM_抓取, fs = require("fs"), path = require("path");
const L = s => process.stdout.write(Buffer.from(s + "\n", "utf8"));

const dir = path.join(process.env.USERPROFILE || "C:/Users/李正", "Desktop", "OCR缓存");
if (!fs.existsSync(dir)) { L("没有 OCR缓存 文件夹"); process.exit(0); }

let 表数 = 0, 段总 = 0, 明 = 0, 蒙 = 0, 待填 = 0;
const 明细 = [["表", "货", "数", "单位", "这个数哪来的"]];
const 蒙表 = {};

fs.readdirSync(dir).forEach(f => {
  let 表 = null;
  try { 表 = T.markdown转表(fs.readFileSync(path.join(dir, f), "utf8")); } catch (e) { }
  if (!表 || !表.length || !表[0] || !表[0].rows) return;
  const rows = 表[0].rows;
  let r = null;
  try { r = G.抓(rows, {}); } catch (e) { return; }
  if (!r || !(r.行 || []).length) return;
  表数++;

  /* 这张表有没有「明细/分布」那种一格挤一串的列，和「总数」列 */
  const 头 = rows[0] || [];
  let 合列 = -1, 明列 = -1;
  头.forEach((h, i) => {
    h = String(h || "");
    if (合列 < 0 && /总数|总计|合计|采购总数|订菜总数/.test(h)) 合列 = i;
    if (明列 < 0 && /明细|分布|订菜分布/.test(h)) 明列 = i;
  });
  /* 抓取自己报的「这一格没切完」 */
  const 剩字行 = new Set((r.没抓到的 || []).filter(q => q && q.类型 === "剩字").map(q => q.行));

  (r.行 || []).forEach(L2 => {
    (L2.分布 || []).forEach(d => {
      段总++;
      let 来 = "表里搬的";
      if (d.没看清 || d.数量 === "?" || d.数量 == null) { 待填++; 来 = "空着等人填"; }
      /* 蒙的判据：这一行原表里明明有「明细」那一格、里面不止一个点位，
         可摊出来只有一段、而且这一段没有点位 —— 那就是拿总数顶的 */
      else if (明列 >= 0 && 合列 >= 0 && (L2.分布 || []).length === 1 && !d.点位号 && !d.点位名) {
        蒙++; 来 = "拿总数列顶的（明细没读懂）";
        蒙表[f] = (蒙表[f] || 0) + 1;
        if (明细.length < 300) 明细.push([f.slice(0, 26), String(L2.品名 || "").slice(0, 16), d.数量, d.单位 || "", 来]);
      } else 明++;
    });
  });
});

L("═══ 拿你机器上 " + 表数 + " 张真表量的 ═══");
L("");
L("  单子上的数一共 " + 段总 + " 个");
L("    ✅ 表里实实在在搬来的：" + 明 + " 个（" + (段总 ? Math.round(明 / 段总 * 100) : 0) + "%）");
L("    ⚠️  拿总数顶出来的（蒙的）：" + 蒙 + " 个（" + (段总 ? Math.round(蒙 / 段总 * 100) : 0) + "%）");
L("    ⬜ 空着等人填的：" + 待填 + " 个");
L("");
const 中招 = Object.keys(蒙表);
L("  " + 中招.length + " 张表里有蒙的数：");
中招.slice(0, 10).forEach(f => L("     " + f.slice(0, 40) + "　" + 蒙表[f] + " 个"));

if (明细.length > 1) {
  const esc = s => '"' + String(s).replace(/"/g, '""') + '"';
  const out = path.join(process.env.USERPROFILE || "C:/Users/李正", "Desktop", "蒙出来的数.csv");
  fs.writeFileSync(out, "\ufeff" + 明细.map(r => r.map(esc).join(",")).join("\r\n"));
  L("");
  L("  明细 → " + out + "　（" + (明细.length - 1) + " 行 × " + 明细[0].length + " 列）");
}
