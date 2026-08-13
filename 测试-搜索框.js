/* 可搜索的商品选择框 —— 打字筛得对不对
   node 测试-搜索框.js

   不另抄一份逻辑：直接把 配送开单台.html 里的 comboItems / comboDraw 抠出来跑，
   缺的东西（ST、item、esc…）用最小替身补上。
   页面改了这里就跟着变，抄本害人的教训今天已经吃过一次。 */
const fs = require("fs"), path = require("path");
global.window = {};
require("./数据-价格库.js");
require("./引擎-解析.js");
require("./引擎-匹配.js");
require("./数据-常用规格.js");
const D = window.GM_DATA, P = window.GM_PARSE, M = window.GM_MATCH;
const USED = window.GM_USED || {};
const IDX = M.buildIndex(D, (cid, sku) => (USED[cid] || {})[sku] || 0);

/* ---- 从页面里抠出真正在跑的那两个函数 ---- */
const H = fs.readFileSync(path.join(__dirname, "配送开单台.html"), "utf8");
function grab(name) {
  const i = H.indexOf("function " + name + "(");
  if (i < 0) throw new Error("页面里找不到 " + name + "（改名了？）");
  let d = 0;
  for (let k = H.indexOf("{", i); k < H.length; k++) {
    if (H[k] === "{") d++;
    else if (H[k] === "}") { d--; if (!d) return H.slice(i, k + 1); }
  }
  throw new Error(name + " 括号不闭合");
}

/* 找一个商品多、名字容易撞的客户来考 */
let CI = -1; D.custs.forEach((c, i) => { if (c[0] === "S4317") CI = i; });
const ST = { ci: CI };
const norm = P.norm, bare = P.bare;
const item = i => { const t = D.items[i]; return { i, prod: D.prods[t[1]], alias: t[2], unit: t[3], price: t[4], sku: t[6] }; };
const esc = s => String(s == null ? "" : s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const n2 = v => Number(v).toFixed(2);

const src = grab("comboItems") + "\n" + grab("comboDraw");
const make = new Function("ST", "IDX", "item", "norm", "bare", "esc", "n2",
  src + "\nreturn {comboItems:comboItems, comboDraw:comboDraw};");
const CB = make(ST, IDX, item, norm, bare, esc, n2);

/* ---- 最小的 DOM 替身：只要 getAttribute 和 .cb-list ---- */
function mkBox(cands) {
  const list = { innerHTML: "", scrollTop: 0 };
  return {
    _list: list,
    getAttribute: k => (k === "data-cands" ? cands.join(",") : ""),
    querySelector: sel => (sel === ".cb-list" ? list : null)
  };
}

let pass = 0, fail = 0;
const ok = (name, cond, extra) => {
  if (cond) { pass++; console.log("  ✅ " + name); }
  else { fail++; console.log("  ❌ " + name + (extra ? "\n        " + extra : "")); }
};

const LIST = IDX.byCust[CI].list;
console.log("\n拿 " + D.custs[CI][1] + " 来考（在售 " + LIST.length + " 项）");

/* ---------- 不打字：全给，候选排前面 ---------- */
console.log("\n【不打字：列表直接出来，★候选排最前】");
{
  const cands = LIST.slice(5, 8);
  const box = mkBox(cands);
  const r = CB.comboItems(box, "");
  ok("不打字也有列表", r.list.length > 0);
  ok("★候选排在最前面", r.list.slice(0, 3).join(",") === cands.join(","),
    "实得 " + r.list.slice(0, 3) + "　应为 " + cands);
  ok("候选不会重复出现", new Set(r.list).size === r.list.length);
  CB.comboDraw(box, "");
  const html = box._list.innerHTML;
  ok("第一条默认高亮（回车就选它）", /class="cb-op hot"/.test(html));
  ok("每条都带 data-sku", (html.match(/data-sku="/g) || []).length === r.list.length);
  ok("★标记画出来了", html.includes("★"));
}

/* ---------- 打字筛 ---------- */
console.log("\n【打字就筛】");
{
  const box = mkBox([]);
  const all = CB.comboItems(box, "").list.length;
  const r = CB.comboItems(box, "豆腐");
  ok("打「豆腐」结果变少", r.list.length > 0 && r.list.length < all,
    "全部 " + all + " → 筛出 " + r.list.length);
  ok("筛出来的确实都带「豆腐」", r.list.every(i => {
    const t = item(i);
    return norm(t.alias).includes("豆腐") || norm(t.prod || "").includes("豆腐") || bare(t.alias).includes("豆腐");
  }));

  /* 名字中间的字也能搜到，不是只认开头 */
  const mid = CB.comboItems(box, "香干");
  ok("搜中间的字也认（攸县香干 能被「香干」搜到）",
    mid.list.some(i => item(i).alias.includes("攸县香干")));

  /* 打全名必须能搜到自己 */
  const one = item(LIST[0]);
  ok("打完整叫法能搜到自己（" + one.alias + "）",
    CB.comboItems(box, one.alias).list.includes(LIST[0]));
}

/* ---------- 搜不到 ---------- */
console.log("\n【搜不到的时候】");
{
  const box = mkBox([]);
  const r = CB.comboItems(box, "螺蛳粉炒鹅肝");
  ok("确实一条都不剩", r.list.length === 0);
  CB.comboDraw(box, "螺蛳粉炒鹅肝");
  ok("给一句人看得懂的话，不是空白", /换个词/.test(box._list.innerHTML),
    box._list.innerHTML.slice(0, 80));
}

/* ---------- 太多的时候 ---------- */
console.log("\n【结果太多：截断要说清楚，不能装作没有】");
{
  /* 挑一个商品最多的客户 */
  let big = 0, bn = 0;
  Object.keys(IDX.byCust).forEach(k => { const n = IDX.byCust[k].list.length; if (n > bn) { bn = n; big = +k; } });
  ST.ci = big;
  const box = mkBox([]);
  const r = CB.comboItems(box, "");
  ok("最多只画 80 条（" + D.custs[big][1] + " 有 " + bn + " 项）", r.list.length <= 80);
  if (bn > 80) {
    CB.comboDraw(box, "");
    ok("剩下的有提示，不是悄悄丢掉", /还有\s*\d+\s*条/.test(box._list.innerHTML),
      box._list.innerHTML.slice(-120));
  } else { pass++; console.log("  ✅ （这库最大的客户不到 80 项，用不着截断）"); }
  ST.ci = CI;
}

/* ---------- 大小写 / 全角 ---------- */
console.log("\n【全角、大小写不该影响搜索】");
{
  const box = mkBox([]);
  const withG = LIST.map(item).find(t => /\d+g/i.test(t.alias));
  if (!withG) { pass++; console.log("  ✅ （这家没有带 g 的规格，跳过）"); }
  else {
    const key = (withG.alias.match(/\d+g/i) || [])[0];
    ok("小写「" + key.toLowerCase() + "」搜得到", CB.comboItems(box, key.toLowerCase()).list.includes(withG.i));
    ok("大写「" + key.toUpperCase() + "」也搜得到", CB.comboItems(box, key.toUpperCase()).list.includes(withG.i));
  }
}

console.log("\n══════════════════════════");
if (fail) { console.log("有 " + fail + " 项没过（通过 " + pass + " 项）"); process.exit(1); }
console.log("全部通过：" + pass + " 项");
