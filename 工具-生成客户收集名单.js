/* 生成「要去收下单表的客户名单」CSV
   node 工具-生成客户收集名单.js
   读：Downloads\观麦_订单明细.csv  +  数据-价格库.js
   出：客户名单-要收下单表.csv（Excel 直接打开） */
var fs = require("fs"), path = require("path");
var HOME = process.env.USERPROFILE || "C:/Users/李正";
var CSV_IN = path.join(HOME, "Downloads", "观麦_订单明细.csv");
var OUT = path.join(__dirname, "客户名单-要收下单表.csv");

function parseCSV(t) {
  var R = [], r = [], c = "", q = false, i = 0;
  if (t.charCodeAt(0) === 0xFEFF) t = t.slice(1);
  while (i < t.length) {
    var x = t[i];
    if (q) { if (x === '"') { if (t[i + 1] === '"') { c += '"'; i += 2; continue; } q = false; i++; continue; } c += x; i++; continue; }
    if (x === '"') { q = true; i++; continue; }
    if (x === ",") { r.push(c); c = ""; i++; continue; }
    if (x === "\r") { i++; continue; }
    if (x === "\n") { r.push(c); R.push(r); r = []; c = ""; i++; continue; }
    c += x; i++;
  }
  if (c !== "" || r.length) { r.push(c); R.push(r); }
  return R;
}

/* ---- 价格库：客户名 -> 报价单ID、在售项数 ---- */
global.window = {};
require("./数据-价格库.js");
var D = global.window.GM_DATA;
var libByName = {}, itemsOf = {};
D.custs.forEach(function (c, i) { libByName[c[1]] = c[0]; itemsOf[c[1]] = 0; });
D.items.forEach(function (it) { var n = D.custs[it[0]][1]; itemsOf[n] = (itemsOf[n] || 0) + 1; });

/* ---- 订单明细：每家的单、叫法、覆盖率 ---- */
if (!fs.existsSync(CSV_IN)) { console.log("找不到 " + CSV_IN); process.exit(1); }
var rows = parseCSV(fs.readFileSync(CSV_IN, "utf8")), h = rows[0];
/* 按【报价单 salemenu_id】归集 —— 开单台里的「客户」就是报价单，
   一个报价单底下可能挂好几个门店（京东那个挂了 5 个），
   对照表是跟着报价单走的，不是跟着门店走的。 */
var iN = h.indexOf("name"), iO = h.indexOf("order_id"), iT = h.indexOf("receive_begin_time"),
    iS = h.indexOf("salemenu_id"), iSN = h.indexOf("salemenu_name"), iR = h.indexOf("resname");

var cust = {};
for (var r = 1; r < rows.length; r++) {
  var v = rows[r]; if (!v || !v[iS]) continue;
  var c = cust[v[iS]] || (cust[v[iS]] = { name: v[iSN], all: {}, ord: {}, days: {}, res: {}, lines: 0 });
  c.lines++;
  c.all[v[iN]] = 1;
  if (v[iR]) c.res[v[iR]] = 1;
  (c.ord[v[iO]] = c.ord[v[iO]] || {})[v[iN]] = 1;
  var d = (v[iT] || "").slice(0, 10); if (d) c.days[d] = 1;
}

/* 每家：至少要几张单才能覆盖 95% 的叫法 */
function needSheets(c) {
  var tot = Object.keys(c.all).length;
  if (!tot) return 1;
  var orders = Object.keys(c.ord).map(function (o) { return Object.keys(c.ord[o]); })
    .sort(function (a, b) { return b.length - a.length; });
  var seen = {}, k = 0;
  for (var i = 0; i < orders.length; i++) {
    k++;
    orders[i].forEach(function (x) { seen[x] = 1; });
    if (Object.keys(seen).length / tot >= 0.95) return k;
    if (k >= 4) return 4;   /* 超过 4 张就先给 4 张，剩下的日常补 */
  }
  return Math.max(1, k);
}

function safeFolder(name, sid) {
  var s = String(name).replace(/[\\\/:*?"<>|]/g, "").replace(/（|）/g, "").trim();
  if (s.length > 18) s = s.slice(0, 18);
  return (sid || "S____") + "_" + s;
}

var libById = {};
D.custs.forEach(function (c) { libById[c[0]] = c[1]; });
var itemsById = {};
D.items.forEach(function (it) { var s = D.custs[it[0]][0]; itemsById[s] = (itemsById[s] || 0) + 1; });

var list = Object.keys(cust).map(function (sid) {
  var c = cust[sid];
  return {
    sid: sid, name: libById[sid] || c.name,
    shops: Object.keys(c.res),
    orders: Object.keys(c.ord).length,
    days: Object.keys(c.days).length,
    lines: c.lines,
    kinds: Object.keys(c.all).length,
    need: needSheets(c),
    active: 1
  };
});
/* 价格库里有、但这 8 天没下单的，排最后标「暂无订单」 */
Object.keys(libById).forEach(function (sid) {
  if (!cust[sid]) list.push({ sid: sid, name: libById[sid], shops: [], orders: 0, days: 0, lines: 0, kinds: 0, need: 0, active: 0 });
});
list.sort(function (a, b) { return (b.active - a.active) || (b.lines - a.lines); });

var head = ["优先级", "客户名称(报价单)", "报价单ID", "建议存放文件夹", "要给几张单",
            "不同叫法数", "8天单数", "下单天数", "明细行数", "在售商品数",
            "底下的门店(微信里按这些名字找)", "状态", "已收几张"];
var out = [head.join(",")];
list.forEach(function (x, i) {
  var folder = x.active ? safeFolder(x.name, x.sid) : "";
  out.push([
    i + 1,
    '"' + String(x.name).replace(/"/g, '""') + '"',
    x.sid, folder, x.active ? x.need : "", x.kinds, x.orders, x.days, x.lines,
    itemsById[x.sid] || 0,
    '"' + x.shops.join(" / ").replace(/"/g, '""') + '"',
    x.active ? "待收集" : "暂无订单(先跳过)", ""
  ].join(","));
});

fs.writeFileSync(OUT, "\uFEFF" + out.join("\r\n"), "utf8");

var act = list.filter(function (x) { return x.active; });
var totNeed = act.reduce(function (s, x) { return s + x.need; }, 0);
var totKinds = act.reduce(function (s, x) { return s + x.kinds; }, 0);
console.log("\n✅ 已生成 " + OUT);
console.log("   有订单的客户：" + act.length + " 家（价格库里另有 " + (list.length - act.length) + " 家这 8 天没下单）");
console.log("   要建的对照条数：" + totKinds + " 条");
console.log("   建议收集的下单表总张数：约 " + totNeed + " 张");
console.log("\n   按「要给几张」分布：");
[1, 2, 3, 4].forEach(function (k) {
  var n = act.filter(function (x) { return x.need === k; }).length;
  if (n) console.log("     " + k + " 张 → " + n + " 家" + (k === 4 ? "（4张仍不够的，剩下靠日常开单补）" : ""));
});
