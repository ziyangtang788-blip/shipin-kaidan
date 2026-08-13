/* 从观麦一个月的订单明细，算出「该先去捞哪几家客户的下单表」
   node 分析-该先补哪家.js
   读：C:\Users\李正\Downloads\观麦_订单明细.csv */
var fs = require("fs"), path = require("path");
var CSV = path.join(process.env.USERPROFILE || "C:/Users/李正", "Downloads", "观麦_订单明细.csv");

/* --- 极简 CSV 解析（字段里有逗号、换行、转义双引号）--- */
function parseCSV(text) {
  var rows = [], row = [], cur = "", q = false, i = 0;
  if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);
  while (i < text.length) {
    var c = text[i];
    if (q) {
      if (c === '"') { if (text[i + 1] === '"') { cur += '"'; i += 2; continue; } q = false; i++; continue; }
      cur += c; i++; continue;
    }
    if (c === '"') { q = true; i++; continue; }
    if (c === ",") { row.push(cur); cur = ""; i++; continue; }
    if (c === "\r") { i++; continue; }
    if (c === "\n") { row.push(cur); rows.push(row); row = []; cur = ""; i++; continue; }
    cur += c; i++;
  }
  if (cur !== "" || row.length) { row.push(cur); rows.push(row); }
  return rows;
}

if (!fs.existsSync(CSV)) { console.log("找不到 " + CSV); process.exit(1); }
var rows = parseCSV(fs.readFileSync(CSV, "utf8"));
var head = rows[0], idx = {};
["resname", "name", "spu_name", "sale_unit_name", "sale_price", "receive_begin_time", "order_id", "spu_remark"]
  .forEach(function (k) { idx[k] = head.indexOf(k); });

var cust = {};   /* 客户名 -> {orders:Set, lines:n, alias:{叫法->{商品,单位,次数}}, days:Set} */
for (var r = 1; r < rows.length; r++) {
  var v = rows[r]; if (!v || v.length < head.length - 2) continue;
  var cn = v[idx.resname]; if (!cn) continue;
  var c = cust[cn] || (cust[cn] = { orders: {}, lines: 0, alias: {}, days: {} });
  c.lines++;
  c.orders[v[idx.order_id]] = 1;
  var d = (v[idx.receive_begin_time] || "").slice(0, 10); if (d) c.days[d] = 1;
  var a = v[idx.name] || "";
  if (a) {
    var e = c.alias[a] || (c.alias[a] = { spu: v[idx.spu_name], unit: v[idx.sale_unit_name], n: 0 });
    e.n++;
  }
}

var list = Object.keys(cust).map(function (k) {
  var c = cust[k];
  return {
    name: k,
    orders: Object.keys(c.orders).length,
    days: Object.keys(c.days).length,
    lines: c.lines,
    kinds: Object.keys(c.alias).length
  };
}).sort(function (a, b) { return b.lines - a.lines; });

var totOrders = list.reduce(function (s, x) { return s + x.orders; }, 0);
var totLines = list.reduce(function (s, x) { return s + x.lines; }, 0);
var allDays = {};
Object.keys(cust).forEach(function (k) { Object.keys(cust[k].days).forEach(function (d) { allDays[d] = 1; }); });
var ds = Object.keys(allDays).sort();

console.log("\n观麦订单明细：" + (rows.length - 1) + " 行 / " + totOrders + " 张单 / " + list.length + " 个客户");
console.log("日期范围：" + ds[0] + " ~ " + ds[ds.length - 1] + "（" + ds.length + " 天）\n");

console.log("按「明细行数」排名 —— 行数越多，识别出错影响越大，越该先补下单表：");
console.log("排名  明细行   单数  下单天数  品种数  客户");
console.log("────────────────────────────────────────────────────────");
var acc = 0;
list.slice(0, 25).forEach(function (x, i) {
  acc += x.lines;
  console.log(
    String(i + 1).padStart(3) + ". " +
    String(x.lines).padStart(6) + " " +
    String(x.orders).padStart(6) + " " +
    String(x.days).padStart(8) + " " +
    String(x.kinds).padStart(7) + "   " + x.name);
});
console.log("────────────────────────────────────────────────────────");
console.log("前 25 家占全部明细行的 " + (acc / totLines * 100).toFixed(1) + "%");

var top10 = list.slice(0, 10).reduce(function (s, x) { return s + x.lines; }, 0);
console.log("前 10 家占 " + (top10 / totLines * 100).toFixed(1) + "%");
