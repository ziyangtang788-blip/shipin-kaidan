/* B 不许把本来读得好好的表读坏 —— node 体检-B不许改坏旧的.js

   老板 2026-08-28 就问了一句：「有没有影响别的旧的」。
   这个文件就是回答它的，而且是【每次改动都重新回答一遍】。

   ⚠ 为什么不能拿 真表快照.js 交差：
     那 35 张是【已经摊平好的格子表】，直接跑读结构，
     压根不经过认表/近道/认列这条链 —— 对 B 这种改动它是【弱证据】，
     35 张一格没变也证明不了 B 没读坏东西。8/28 差点就这么交差了。

   这里走的是真链路：真表 OCR → 转格子 → 认列 → 摊平 → 读结构，
   跟【调试-格子表-<家>.json】（现在线上读出来的那份）逐样比。

   判据只卡一样：★ 数量和合计一个都不许变。
     品名带不带规格后缀（「中板水豆腐 约7斤/板」→「中板水豆腐」）不算数 ——
     那种匹配不上会走存疑弹窗，人点一下就行，不会静默错。
     老板的规矩：「认错必须为 0。存疑不用管，但读错一个数字就是事故。」
   ⚠ 老基准是另一次 OCR 跑出来的，认错的字（厚烟干/厚细干、攸县/蚊县）
     跟 B 没关系，所以名字一律不比。 */
const fs = require("fs"), path = require("path");
process.chdir(__dirname);
global.window = {};
["数据-价格库.js", "对照-预置.js", "数据-常用规格.js", "数据-换算.js",
  "引擎-解析.js", "引擎-读结构.js", "引擎-认表.js", "引擎-碎片类.js", "引擎-认列.js"]
  .forEach(f => require(path.resolve(__dirname, f)));
const T = global.window.GM_TABLE, S = global.window.GM_STRUCT, N = global.window.GM_整表碎片;
const L = s => process.stdout.write(Buffer.from(s + "\n", "utf8"));

function 拿表(j) {
  const p = (j.pages || [])[0]; if (!p) return null;
  const t = (p.tables || [])[0];
  let md = t ? t.content : (p.markdown || "");
  if (!md || !/\|/.test(md)) md = ((p.blocks || [])[0] || {}).content || "";
  if (!/\|/.test(md)) return null;
  const f = T.markdown转表 ? T.markdown转表(md) : null;
  if (!f) return null;
  const g = Array.isArray(f) ? f[0] : f;
  return (g && g.rows) ? g.rows : (Array.isArray(g) ? g : null);
}
const 量们 = r => (r.lines || []).map(x => x.qty || 0);
const 和 = r => Math.round((r.lines || []).reduce((a, x) => a + (x.qty || 0), 0) * 100) / 100;

if (!fs.existsSync("调试-OCR原始")) { L("（没有 调试-OCR原始/，跳过）"); process.exit(0); }

let 接手 = 0, 放手 = 0, 比过 = 0;
const 坏 = [];
fs.readdirSync("调试-OCR原始").filter(f => /\.json$/.test(f)).sort().forEach(f => {
  let j; try { j = JSON.parse(fs.readFileSync(path.join("调试-OCR原始", f), "utf8")); } catch (e) { return; }
  const rows = 拿表(j); if (!rows || rows.length < 2) return;
  const 家 = f.replace(/\.json$/, "").replace(/^[b\d]+-/, "").replace(/^★/, "");

  let r; try { r = N.认列(rows); } catch (e) { 坏.push([家, "认列炸了：" + e.message]); return; }
  const 备 = (r && !r.要问的) ? N.备好(rows, r) : null;
  if (!备) { 放手++; return; }                    /* B 不接手 → 照旧走老路，零影响 */
  接手++;

  let B读 = null;
  try {
    const 合 = T.摊平([{ n: 1, rows: 备.rows }], 备.读法);
    if (合 && 合.行.length) B读 = S.读结构({ 抬头: 合.抬头, 行: 合.行, 表怎么读的: 合.表怎么读的 });
  } catch (e) { 坏.push([家, "摊平炸了：" + e.message]); return; }
  if (!B读) { 坏.push([家, "B 接手了却一样货都摊不出来"]); return; }

  const 基准 = "调试-格子表-" + 家 + ".json";
  if (!fs.existsSync(基准)) return;
  let 老; try { 老 = S.读结构(JSON.parse(fs.readFileSync(基准, "utf8"))); } catch (e) { return; }
  比过++;

  if (和(老) !== 和(B读)) {
    坏.push([家, "★ 合计变了：老 " + 和(老) + " → B " + 和(B读)]); return;
  }
  const a = 量们(老), b = 量们(B读);
  if (a.length !== b.length) {
    坏.push([家, "★ 样数变了：老 " + a.length + " 样 → B " + b.length + " 样"]); return;
  }
  const 差 = a.map((x, i) => x === b[i] ? null : (i + 1) + ": " + x + "→" + b[i]).filter(Boolean);
  if (差.length) 坏.push([家, "★ 数量变了：" + 差.slice(0, 4).join("　")]);
});

L("  B 放手不管（照旧走老路）：" + 放手 + " 张　　B 接手：" + 接手 + " 张　　有基准可比：" + 比过 + " 张");
if (!坏.length) {
  L("  ✅ B 接手的表，数量和合计一个都没变。");
  process.exit(0);
}
L("\n  ❌ 这 " + 坏.length + " 张被 B 读坏了：");
坏.forEach(x => L("     " + x[0] + "　" + x[1]));
process.exit(1);
