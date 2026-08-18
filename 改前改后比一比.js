/* 改之前拍个快照，改之后逐格比 —— node 改前改后比一比.js 拍 ／ 比

   老板 2026-08-18：「我现在就怕你把这个东西一修，就把别的地方修乱了，就像上午那样。」

   上午就是这么坏的：改「不许折板」只量了「机器还会不会自己瞎折」，
   没量「人自己挑的还能不能用」—— 闸门把人也拦了，全部检查照样全绿。
   全部检查只回答「有没有报错」，回答不了「哪一格悄悄变了」。

   这个脚本回答后一个问题：
     node 改前改后比一比.js 拍     改之前跑，把现在的答案全存下来
     （动手改）
     node 改前改后比一比.js 比     改之后跑，逐格比，变了就摆出来

   量的是四样，全部离线、不花一分钱：
     ① 每个客户 × 每个真实下单词  →  配到哪个货、单价、存不存疑
     ② 服务器上 454 条「学过的」  →  还查不查得回来
     ③ 观麦 9765 行真单           →  按斤还是按板，一行都不许变
     ④ 65 种备注/规格写法         →  那四样有没有被带歪

   ⚠ 变了不一定是坏 —— 是我改的就该变。
     但【不许有我不知道的变化】。这才是这个脚本的用处。 */
const fs = require("fs"), path = require("path");
global.window = {};
require("./数据-价格库.js");
require("./对照-预置.js");
require("./引擎-解析.js");
require("./引擎-匹配.js");
require("./数据-常用规格.js");

const D = window.GM_DATA, SEED = window.GM_SEED || {}, P = window.GM_PARSE, M = window.GM_MATCH;
const USED = window.GM_USED || {};
const usedN = (cid, sku) => (USED[cid] || {})[sku] || 0;
const IDX = M.buildIndex(D, usedN);
const L = s => process.stdout.write(Buffer.from(s + "\n", "utf8"));

const 快照文件 = path.join(__dirname, "改前快照.json");
const 差异文件 = path.join(process.env.USERPROFILE || "C:/Users/李正", "Desktop", "改动差异.csv");

/* 服务器上那份「学过的东西」。没有就跳过那一项，不当错。
   （拉的办法：ssh 上去 curl localhost:8788/api/overlay > 覆盖层-线上.json） */
function 线上覆盖层() {
  for (const f of ["覆盖层-线上.json", "本地数据/overlay.json"]) {
    try {
      const j = JSON.parse(fs.readFileSync(path.join(__dirname, f), "utf8"));
      const d = j.data || j.overlay || j;
      if (d && d.maps && Object.keys(d.maps).length) return d;
    } catch (e) { }
  }
  return null;
}

function 造上下文(OV) {
  return {
    DATA: D, IDX, OV, usedN,
    seedLookup: (cid, t, u) => P.seedLookup(SEED[cid], t, u),
    learnedSku: (ci, t, u) => P.learnedLookup(OV.maps, D.custs[ci][0], t, u,
      s => IDX.byCust[ci].sku[s] === undefined ? null : D.items[IDX.byCust[ci].sku[s]][3]),
    defaultSide: window.GM_DEFAULT_SIDE
  };
}

/* ═════════ ① 每个客户 × 每个真实下单词 ═════════
   词不是编的：来自 对照-预置.js，全是工厂发来的下单表上的原话。 */
function 量配货(OV) {
  const out = {};
  const ctx = 造上下文(OV);
  D.custs.forEach((c, ci) => {
    const sid = c[0], seed = SEED[sid]; if (!seed) return;
    const b = IDX.byCust[ci]; if (!b) return;
    Object.keys(seed).forEach(词 => {
      const 支 = seed[词];
      /* 预置的分支键有两种：单位（板/斤/盒）和规格数字。单位那种才拿来当下单单位。 */
      const 单位们 = Object.keys(支 && typeof 支 === "object" ? 支 : { "": 1 })
        .filter(k => k && !/^\d/.test(k));
      (单位们.length ? 单位们 : [""]).forEach(u => {
        let r;
        try { r = M.matchOne(ctx, ci, 词, u, null, 1); } catch (e) { r = { i: -1, how: "抛错:" + e.message }; }
        const it = (r && r.i >= 0) ? D.items[r.i] : null;
        out[sid + "|" + u + "|" + 词] = it
          ? (it[2] + "[" + it[3] + "]¥" + it[4] + "|" + r.how + "|" + (M.commits(r.how) ? "定" : "存疑"))
          : "认不出|" + (r && r.how);
      });
    });
  });
  return out;
}

/* ═════════ ② 服务器上学过的，还查不查得回来 ═════════ */
function 量学过的(OV, 线上) {
  const out = {};
  if (!线上 || !线上.maps) return out;
  const ciOf = {}; D.custs.forEach((c, i) => ciOf[c[0]] = i);
  Object.keys(线上.maps).forEach(k => {
    const a = k.split("||"); if (a.length < 3) return;
    const cid = a[0], unit = a[1], 词 = a.slice(2).join("||"), sku = 线上.maps[k];
    const ci = ciOf[cid]; if (ci === undefined) return;
    const b = IDX.byCust[ci]; if (!b) return;
    const got = P.learnedLookup(线上.maps, cid, 词, unit,
      s => b.sku[s] === undefined ? null : D.items[b.sku[s]][3]);
    out[k] = (got === sku) ? "能用" : (got ? ("查回来的是别的:" + got) : "查不回来");
  });
  return out;
}

/* ═════════ ③ 观麦 9765 行真单：按斤还是按板 ═════════
   直接借 体检-斤还是板.js 的结论行（它自己有一套读法，这儿只收它的答案）。 */
function 量斤板() {
  try {
    const { execFileSync } = require("child_process");
    const out = execFileSync(process.execPath, ["体检-斤还是板.js"], { encoding: "utf8", cwd: __dirname });
    return { 结论: out.trim().split("\n").filter(Boolean).slice(-1)[0].trim() };
  } catch (e) { return { 结论: "没跑成：" + String(e.message).slice(0, 80) }; }
}

/* ═════════ ④ 备注/规格里写什么，那四样有没有被带歪 ═════════ */
function 量四样() {
  try {
    const { execFileSync } = require("child_process");
    const out = execFileSync(process.execPath, ["体检-别的不许动这四样.js"], { encoding: "utf8", cwd: __dirname });
    return { 结论: out.trim().split("\n").filter(Boolean).slice(-1)[0].trim() };
  } catch (e) { return { 结论: "没跑成：" + String(e.message).slice(0, 80) }; }
}

function 拍一张() {
  const 线上 = 线上覆盖层();
  const OV = { maps: (线上 && 线上.maps) || {}, gmap: (线上 && 线上.gmap) || {}, gone: {} };
  return {
    拍于: new Date().toISOString().slice(0, 16).replace("T", " "),
    有没有线上覆盖层: !!线上,
    配货: 量配货(OV),
    学过的: 量学过的(OV, 线上),
    斤板: 量斤板(),
    四样: 量四样()
  };
}

const 动作 = (process.argv[2] || "").trim();

if (动作 === "拍") {
  const s = 拍一张();
  fs.writeFileSync(快照文件, JSON.stringify(s));
  L("📷 拍好了 —— " + s.拍于);
  L("   配货：" + Object.keys(s.配货).length + " 个「客户×词×单位」");
  L("   学过的：" + Object.keys(s.学过的).length + " 条" + (s.有没有线上覆盖层 ? "" : "（没找到线上覆盖层，这一项空着）"));
  L("   斤板：" + s.斤板.结论);
  L("   四样：" + s.四样.结论);
  L("\n快照 → " + 快照文件);
  L("现在可以动手改了。改完跑：node 改前改后比一比.js 比");
  process.exit(0);
}

if (动作 === "比") {
  if (!fs.existsSync(快照文件)) { L("❌ 没有改前快照。先跑：node 改前改后比一比.js 拍"); process.exit(1); }
  const 旧 = JSON.parse(fs.readFileSync(快照文件, "utf8"));
  const 新 = 拍一张();
  const 行 = [["哪一块", "谁", "改之前", "改之后"]];

  ["配货", "学过的"].forEach(块 => {
    const a = 旧[块] || {}, b = 新[块] || {};
    const keys = Array.from(new Set([].concat(Object.keys(a), Object.keys(b))));
    keys.forEach(k => {
      const x = a[k] === undefined ? "（没有这一条）" : a[k];
      const y = b[k] === undefined ? "（没有这一条）" : b[k];
      if (x !== y) 行.push([块, k, x, y]);
    });
  });
  if (旧.斤板.结论 !== 新.斤板.结论) 行.push(["斤板", "观麦 9765 行真单", 旧.斤板.结论, 新.斤板.结论]);
  if (旧.四样.结论 !== 新.四样.结论) 行.push(["四样", "65 种写法", 旧.四样.结论, 新.四样.结论]);

  const 变 = 行.length - 1;
  L("改前 " + 旧.拍于 + "　→　改后 " + 新.拍于);
  L("");
  if (!变) { L("✅ 一格都没变。这次改动没碰到别的地方。"); process.exit(0); }

  const esc = s => '"' + String(s).replace(/"/g, '""') + '"';
  fs.writeFileSync(差异文件, "\ufeff" + 行.map(r => r.map(esc).join(",")).join("\r\n"));
  L("⚠ 变了 " + 变 + " 处 —— 逐条看一遍，是你要的才算数：");
  L("");
  行.slice(1, 21).forEach(r => L("   [" + r[0] + "] " + r[1] + "\n        改前：" + r[2] + "\n        改后：" + r[3]));
  if (变 > 20) L("\n   …还有 " + (变 - 20) + " 处");
  L("\n全部明细 → " + 差异文件 + "　（" + 变 + " 行 × 4 列）");
  process.exit(0);
}

L("用法：");
L("  node 改前改后比一比.js 拍     改之前跑一次，把现在的答案存下来");
L("  node 改前改后比一比.js 比     改之后跑一次，逐格比，变了就摆出来");
process.exit(1);
