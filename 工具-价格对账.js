/* ============================================================
   换价格库之前先对一遍账 —— 新爬的 CSV vs 现在库里那份

   为什么要这一步：价直接是钱。观麦那边录价是人工的，
   一条 4.5 敲成 45，换完库单子就错 10 倍 —— 而且一路绿灯，
   生成成功、体检全过，你根本看不出来。
   所以换库之前先看一眼差异，反常的拎出来问，别闷头换。

   用法：
     node 工具-价格对账.js
     （默认读「下载」文件夹里的 观麦_全部报价单_商品价格.csv）

   出一个文件：价格对账-差异.csv —— 只有变了的那几条，没变的一条不写。
   屏幕上只报数，不打表。
   ============================================================ */
"use strict";
const fs = require("fs");
const path = require("path");
const os = require("os");

const CSV = process.argv[2] ||
  path.join(os.homedir(), "Downloads", "观麦_全部报价单_商品价格.csv");
const OUT = path.join(__dirname, "价格对账-差异.csv");

/* ---------- 读 CSV：带引号的字段里可能有逗号和换行，得老实解析 ---------- */
function parseCSV(text) {
  if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);   /* 去掉 BOM */
  const rows = [];
  let row = [], cell = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"') {
        if (text[i + 1] === '"') { cell += '"'; i++; }        /* "" = 一个引号 */
        else q = false;
      } else cell += c;
    } else if (c === '"') q = true;
    else if (c === ",") { row.push(cell); cell = ""; }
    else if (c === "\r") { /* 忽略，等 \n */ }
    else if (c === "\n") { row.push(cell); rows.push(row); row = []; cell = ""; }
    else cell += c;
  }
  if (cell !== "" || row.length) { row.push(cell); rows.push(row); }
  return rows;
}

if (!fs.existsSync(CSV)) {
  console.log("找不到 CSV：" + CSV);
  console.log("先在观麦跑 观麦-爬报价单价格.js，把文件下到「下载」文件夹。");
  process.exit(1);
}

const rows = parseCSV(fs.readFileSync(CSV, "utf8"));
const head = rows[0].map(s => s.trim());
const 列 = {};
head.forEach((h, i) => { 列[h] = i; });
["报价单ID", "客户名", "客户叫法(规格名)", "规格编码", "销售单位", "销售价(元)", "上架状态"]
  .forEach(function (k) {
    if (列[k] === undefined) { console.log("CSV 少了一列：" + k + "，对不了账"); process.exit(1); }
  });

/* 新表：按【报价单ID + 规格编码】认一条货。
   D 码是观麦给的唯一码，比名字靠谱 —— 名字会改，码不会。 */
const 新 = new Map();
for (let i = 1; i < rows.length; i++) {
  const r = rows[i];
  if (!r || r.length < head.length) continue;
  const cid = r[列["报价单ID"]], sku = r[列["规格编码"]];
  if (!cid || !sku) continue;
  新.set(cid + "|" + sku, {
    cid: cid, 客户: r[列["客户名"]], sku: sku,
    叫法: r[列["客户叫法(规格名)"]], 单位: r[列["销售单位"]],
    价: parseFloat(r[列["销售价(元)"]] || "0") || 0,
    上架: r[列["上架状态"]] === "上架"
  });
}

/* 旧表：直接读现在库里那份，不读旧 CSV ——
   要比的是「线上正在用的价」，不是「上次爬下来的价」。
   中间要是有人手工改过库，只比 CSV 就漏掉了。 */
global.window = global;
require("./数据-价格库.js");
const D = global.GM_DATA;
const 旧 = new Map();
D.items.forEach(function (it) {
  const cid = D.custs[it[0]][0];
  旧.set(cid + "|" + it[6], {
    cid: cid, 客户: D.custs[it[0]][1], sku: it[6],
    叫法: it[2], 单位: it[3], 价: it[4], 上架: it[8] === 1
  });
});

/* ---------- 比 ---------- */
const 改价 = [], 新增 = [], 没了 = [], 上下架 = [], 改名 = [], 改单位 = [];
新.forEach(function (n, k) {
  const o = 旧.get(k);
  if (!o) { 新增.push(n); return; }
  if (Math.abs(n.价 - o.价) > 0.0001) 改价.push({ n: n, o: o });
  if (n.上架 !== o.上架) 上下架.push({ n: n, o: o });
  if (n.叫法 !== o.叫法) 改名.push({ n: n, o: o });
  if (n.单位 !== o.单位) 改单位.push({ n: n, o: o });
});
旧.forEach(function (o, k) { if (!新.has(k)) 没了.push(o); });

/* 报价单层面：新开了哪几家、哪几家整张没了 */
const 新单 = new Set(), 旧单 = new Set();
新.forEach(v => 新单.add(v.cid + "\t" + v.客户));
旧.forEach(v => 旧单.add(v.cid + "\t" + v.客户));
const 新客户 = [...新单].filter(x => ![...旧单].some(y => y.split("\t")[0] === x.split("\t")[0]));
const 没了的客户 = [...旧单].filter(x => ![...新单].some(y => y.split("\t")[0] === x.split("\t")[0]));

/* ---------- 反常的挑出来：价格翻倍/腰斩，多半是录错了 ---------- */
function 反常(x) {
  const a = x.o.价, b = x.n.价;
  if (a > 0 && b > 0) return (b / a >= 2 || b / a <= 0.5);
  return (a === 0) !== (b === 0);        /* 0 变有价、有价变 0，也算反常 */
}
const 要问的 = 改价.filter(反常);

/* ---------- 写差异表 ---------- */
function esc(v) { return '"' + String(v === undefined || v === null ? "" : v).replace(/"/g, '""') + '"'; }
const out = [["类型", "报价单ID", "客户名", "规格编码", "客户叫法", "单位", "旧值", "新值", "差", "要不要问"]];
要问的.forEach(x => out.push(["★改价·反常", x.n.cid, x.n.客户, x.n.sku, x.n.叫法, x.n.单位,
  x.o.价, x.n.价, (x.n.价 - x.o.价).toFixed(2), "要问"]));
改价.filter(x => !反常(x)).forEach(x => out.push(["改价", x.n.cid, x.n.客户, x.n.sku, x.n.叫法, x.n.单位,
  x.o.价, x.n.价, (x.n.价 - x.o.价).toFixed(2), ""]));
新增.forEach(x => out.push(["新增", x.cid, x.客户, x.sku, x.叫法, x.单位, "", x.价, "", ""]));
没了.forEach(x => out.push(["没了", x.cid, x.客户, x.sku, x.叫法, x.单位, x.价, "", "", ""]));
上下架.forEach(x => out.push(["上下架", x.n.cid, x.n.客户, x.n.sku, x.n.叫法, x.n.单位,
  x.o.上架 ? "上架" : "下架", x.n.上架 ? "上架" : "下架", "", ""]));
改名.forEach(x => out.push(["改叫法", x.n.cid, x.n.客户, x.n.sku, x.n.叫法, x.n.单位, x.o.叫法, x.n.叫法, "", ""]));
改单位.forEach(x => out.push(["改单位", x.n.cid, x.n.客户, x.n.sku, x.n.叫法, x.n.单位,
  x.o.单位, x.n.单位, "", "★单位变了会连数量一起错"]));
新客户.forEach(x => out.push(["新客户", x.split("\t")[0], x.split("\t")[1], "", "", "", "", "", "", ""]));
没了的客户.forEach(x => out.push(["客户没了", x.split("\t")[0], x.split("\t")[1], "", "", "", "", "", "", ""]));

fs.writeFileSync(OUT, "﻿" + out.map(r => r.map(esc).join(",")).join("\r\n"), "utf8");

/* ---------- 只报数，不打表 ---------- */
const L = s => process.stdout.write(Buffer.from(s + "\n", "utf8"));
L("");
L("旧库 " + 旧.size + " 条（" + D.updated + "）　→　新表 " + 新.size + " 条");
L("");
L("  改价　　 " + 改价.length + " 条" + (要问的.length ? ("　其中 ★" + 要问的.length + " 条反常（翻倍或腰斩）") : ""));
L("  新增　　 " + 新增.length + " 条");
L("  没了　　 " + 没了.length + " 条");
L("  上下架　 " + 上下架.length + " 条");
L("  改叫法　 " + 改名.length + " 条" + (改名.length ? "　← 学过的对照可能对不上了" : ""));
L("  改单位　 " + 改单位.length + " 条" + (改单位.length ? "　← 单位变了数量会跟着错，重点看" : ""));
L("  新客户　 " + 新客户.length + " 家");
L("  客户没了 " + 没了的客户.length + " 家");
L("");
if (要问的.length) {
  L("★ 有 " + 要问的.length + " 条价格翻倍或腰斩，先问清楚再换库：");
  要问的.slice(0, 10).forEach(function (x) {
    L("    " + x.n.客户 + "　" + x.n.叫法 + "　" + x.o.价 + " → " + x.n.价);
  });
  if (要问的.length > 10) L("    …还有 " + (要问的.length - 10) + " 条，看文件");
  L("");
}
L("差异全写在这：" + OUT);
L("（" + (out.length - 1) + " 行 × " + out[0].length + " 列；没变的一条没写）");
