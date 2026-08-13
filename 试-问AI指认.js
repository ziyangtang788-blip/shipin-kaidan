/* 花钱验「AI 指认准不准」—— node 试-问AI指认.js [--估价 | --跑]
   ────────────────────────────────────────────────
   验的是这一环：把新提示词（新-按内容认单.js 里那份）真发给 AI，
   看它指认出来的「第一样货叫什么、哪列表头写的是什么」对不对。
   前面那轮（试-按内容认单-真单.js）验的是【拿指认去定位】准不准，
   指认本身是我从表里推出来的，等于假设 AI 答对了。这一步补上那个假设。

   ⚠ 只读 OCR 缓存里的表，不动开单台、不改任何引擎。
   ⚠ 密钥只从 密钥-本机.js 读，绝不写进任何输出文件。

   --估价：不花一分钱，只用 count_tokens 数 token、算钱（count_tokens 免费）
   --跑  ：真发请求。默认走 Batch API（五折、异步），加 --同步 就一条条发。 */
const fs = require("fs"), path = require("path"), https = require("https");
global.window = global.window || {};
require("./引擎-认表.js");
require("./新-按内容认单.js");
const N = window.GM_按内容认单;

const 缓存 = "c:/Users/李正/Desktop/OCR缓存";
const 出目录 = path.join(__dirname, "验AI指认");
const 模型 = "claude-opus-5";
/* 价钱（美元/百万 token），Opus 5。Batch API 一律五折。 */
const 进价 = 5, 出价 = 25;

/* ── 密钥：只在内存里，不落盘 ─────────────────── */
function 拿密钥() {
  const s = fs.readFileSync(path.join(__dirname, "密钥-本机.js"), "utf8");
  const m = s.match(/window\.GM_KEY\s*=\s*["']([^"']+)["']/);
  if (!m) throw new Error("密钥-本机.js 里没找到 GM_KEY");
  return m[1];
}

/* ── markdown 表 → 格子 ──────────────────────── */
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

/* ── 只挑「是表格」的那些（截图那种排除掉）───────
   判据跟上一轮一致：前 12 行里有一行同时出现「商品名类」和「数量/明细类」的词。 */
const 是品名 = /商品名|品名|货品|商品|名称|产品|菜名/;
const 是数量 = /采购量|订货量|数量|总数|待采购|计划|订菜/;
const 是明细 = /明细|分布|订货明细|门店|分店/;
function 像表格(rows) {
  for (let i = 0; i < Math.min(rows.length, 12); i++) {
    const r = rows[i] || [];
    if (r.some(c => 是品名.test(c)) && r.some(c => 是数量.test(c) || 是明细.test(c))) return true;
  }
  return false;
}

/* ── 骨架：只把表头和头尾几行给 AI，不给整张表（省 99%）── */
function 骨架(rows) {
  const 头 = 6, 尾 = 3, 列上限 = 40;
  const 说 = ["### 这张表共 " + rows.length + " 行"];
  const 挑 = [];
  for (let i = 0; i < Math.min(头, rows.length); i++) 挑.push(i);
  if (rows.length > 头 + 尾) for (let j = Math.max(头, rows.length - 尾); j < rows.length; j++) 挑.push(j);
  /* ★ 2026-08-12：以前每格一律截到 60 字，结果是我自己把料切碎了再怪 OCR。
       AI 在「不确定的」里写「内容被截断，无法确认」—— 那不是 OCR 截的，是我截的。
     现在分两种：
       长格子（一整串送货点，几百上千字）→ 只留【开头一小段】，
         并且明说「这一格很长，后面省了，你不用看内容」。
         它本来就不需要看清里面写了什么 —— 提示词里说的是
         「哪一格里满是括号和加号，哪一格就是分布列」，认长相就够了。
       普通格子 → 原样给，不截。表头和短内容截了才是真损失。 */
  挑.forEach(i => {
    const r = (rows[i] || []).slice(0, 列上限).map(c => {
      const s = String(c == null ? "" : c);
      return s.length > 80 ? (s.slice(0, 60) + "…（这一格共 " + s.length + " 字，后面省了，不用看内容）") : s;
    });
    说.push("第" + (i + 1) + "行｜" + r.join("｜"));
  });
  if (rows.length > 头 + 尾) 说.splice(1 + 头, 0, "　…（中间 " + (rows.length - 头 - 尾) + " 行省略）…");

  /* ★ 2026-08-12：光给骨架，它答不了「最后一样货叫什么、一共几样货」——
     中间被我省掉了，它看不见，只能老实回「不确定」，然后整张表被判成要问人。
     那不是它认错，是我问了它看不见的东西。
     补救：把【每一行第一列的文字】全给它（只有字，没有数字，几百个 token 而已）。
     这样首尾和条数它都数得出来，而「不抄数字」那条规矩一点没破。 */
  const 首列 = rows.map(r => String((r || [])[0] == null ? "" : (r || [])[0]).trim())
                   .map((v, i) => v ? ("第" + (i + 1) + "行:" + v.slice(0, 30)) : "")
                   .filter(Boolean);
  if (首列.length) 说.push("\n### 这张表【每一行第一列】的文字（只给你数首尾和条数用，数字一个都没给）：\n" + 首列.join("　"));
  return 说.join("\n");
}

/* ── 收料 ────────────────────────────────────── */
const 活 = [];
fs.readdirSync(缓存).filter(f => /\.txt$/.test(f)).sort().forEach(f => {
  const rows = 变格子(fs.readFileSync(path.join(缓存, f), "utf8"));
  if (!像表格(rows)) return;
  活.push({ 文件: f, rows, 骨: 骨架(rows) });
});
console.log("能用的表格：" + 活.length + " 份（其余是截图，已排除）");

/* ── HTTP ────────────────────────────────────── */
function 发(密钥, 路径, 体, 法) {
  return new Promise((好, 坏) => {
    const b = 体 ? Buffer.from(JSON.stringify(体)) : null;
    const req = https.request({
      host: "api.anthropic.com", path: 路径, method: 法 || (体 ? "POST" : "GET"),
      headers: Object.assign({
        "x-api-key": 密钥, "anthropic-version": "2023-06-01", "content-type": "application/json",
      }, b ? { "content-length": b.length } : {}),
      timeout: 600000,
    }, r => {
      let s = "";
      r.on("data", d => s += d);
      r.on("end", () => {
        if (r.statusCode >= 400) return 坏(new Error("HTTP " + r.statusCode + " " + s.slice(0, 400)));
        try { 好(JSON.parse(s)); } catch (e) { 好(s); }
      });
    });
    req.on("error", 坏);
    req.on("timeout", () => { req.destroy(); 坏(new Error("超时")); });
    if (b) req.write(b);
    req.end();
  });
}

/* ★ 三件事必须一起做，缺一样都会白花钱（2026-08-12 踩过）：
   ① Opus 5【默认开思考】，而 max_tokens 是「思考 + 回答」共用的上限 ——
      指认这种填表活儿用不着深想，思考却会把额度吃光，JSON 被截在半路。
      所以显式关掉思考。关思考只在 effort ≤ high 时允许，配 low 正好。
   ② 关了思考，模型偶尔会把 <thinking> 这类内部标签漏进正文 ——
      补一句通用的「不许出现内部标签」挡住（点名说「思考标签」反而更容易漏）。
   ③ max_tokens 仍留 4000 的余量，宁可多给也不要截断。 */
const 防漏 = "\n\n只输出 JSON 本身。不要输出任何内部或系统 XML 标签，不要解释，不要 markdown 代码围栏。";
function 一条(x) {
  return {
    model: 模型, max_tokens: 4000,
    system: N.提示词 + 防漏,
    thinking: { type: "disabled" },
    output_config: { effort: "low" },
    messages: [{ role: "user", content: x.骨 }],
  };
}

/* ── ① 估价（免费）───────────────────────────── */
async function 估价() {
  const 密钥 = 拿密钥();
  let 进 = 0;
  const 抽 = 活.slice(0, Math.min(6, 活.length));
  for (const x of 抽) {
    const r = await 发(密钥, "/v1/messages/count_tokens", {
      model: 模型, system: N.提示词, messages: [{ role: "user", content: x.骨 }],
    });
    进 += r.input_tokens;
    console.log("  " + x.文件.slice(0, 30).padEnd(32) + r.input_tokens + " token");
  }
  const 均进 = Math.round(进 / 抽.length);
  const 均出 = 500;                       /* 指认 JSON 大概这么长 */
  const 总进 = 均进 * 活.length, 总出 = 均出 * 活.length;
  const 钱 = 总进 / 1e6 * 进价 + 总出 / 1e6 * 出价;
  console.log("\n每份平均进 " + 均进 + " token，出按 " + 均出 + " 估");
  console.log(活.length + " 份合计：进 " + 总进 + " / 出约 " + 总出);
  console.log("同步跑     ≈ $" + 钱.toFixed(2) + "（约 ¥" + (钱 * 7.2).toFixed(1) + "）");
  console.log("Batch 五折 ≈ $" + (钱 / 2).toFixed(2) + "（约 ¥" + (钱 * 3.6).toFixed(1) + "）");
}

/* ── ② 真跑 ──────────────────────────────────── */
function 存(名, 内容) {
  if (!fs.existsSync(出目录)) fs.mkdirSync(出目录, { recursive: true });
  fs.writeFileSync(path.join(出目录, 名), 内容, "utf8");
}

/* 把 AI 的指认拿去定位、摊平，看结果对不对 */
function 判(x, 指认) {
  const r = N.认(x.rows, 指认);
  if (r.要问的) return { 结果: "停下问人", 说: r.要问的 };
  const 合 = window.GM_TABLE.摊平([{ n: 1, rows: x.rows }], r.读法);
  if (!合) return { 结果: "摊不出来" };
  let 段 = 0, 量 = 0;
  合.行.forEach(L => (L.分布 || []).forEach(d => {
    段++; const q = parseFloat(d.数量); if (!isNaN(q)) 量 += q;
  }));
  return { 结果: "出单", 品: 合.行.length, 段, 量: Math.round(量 * 100) / 100, 对账: N.对账(合, r.对账) };
}

async function 一份(密钥, x) {
  try {
    const r = await 发(密钥, "/v1/messages", 一条(x));
    const t = (r.content || []).filter(b => b.type === "text").map(b => b.text).join("");
    const j = t.match(/\{[\s\S]*\}/);
    let 指认 = null, 坏 = "";
    if (j) { try { 指认 = JSON.parse(j[0]); } catch (e) { 坏 = "JSON 解析不了"; } }
    else 坏 = (r.stop_reason === "max_tokens") ? "被 max_tokens 截断" : "AI 没回 JSON";
    return { 文件: x.文件, 指认, 判果: 指认 ? 判(x, 指认) : { 结果: 坏 }, usage: r.usage, stop: r.stop_reason };
  } catch (e) {
    return { 文件: x.文件, 错: String(e.message).slice(0, 200) };
  }
}

/* 4 个一起发，边跑边把进度写进文件（管道会把输出憋到最后，看不见） */
async function 跑同步() {
  const 密钥 = 拿密钥();
  const 出 = new Array(活.length);
  let 下一个 = 0, 完成 = 0;
  const 进度 = path.join(出目录, "进度.txt");
  if (!fs.existsSync(出目录)) fs.mkdirSync(出目录, { recursive: true });
  fs.writeFileSync(进度, "开跑，共 " + 活.length + " 份\n", "utf8");

  async function 工人() {
    while (true) {
      const i = 下一个++;
      if (i >= 活.length) return;
      出[i] = await 一份(密钥, 活[i]);
      完成++;
      const o = 出[i];
      const 行 = "(" + 完成 + "/" + 活.length + ") " + 活[i].文件.slice(0, 26) + "　" +
        (o.错 ? ("✗ " + o.错) : (o.判果.结果 + (o.判果.品 ? ("　" + o.判果.品 + " 品/" + o.判果.段 + " 段") : "")));
      console.log(行);
      fs.appendFileSync(进度, 行 + "\n", "utf8");
    }
  }
  await Promise.all([工人(), 工人(), 工人(), 工人()]);
  存("结果-同步.json", JSON.stringify(出, null, 1));
  汇总(出);
}

async function 跑批() {
  const 密钥 = 拿密钥();
  const reqs = 活.map((x, i) => ({ custom_id: "t" + i, params: 一条(x) }));
  const b = await 发(密钥, "/v1/messages/batches", { requests: reqs });
  console.log("批次已提交：" + b.id + "　状态 " + b.processing_status);
  存("批次号.txt", b.id);
  console.log("跑完再执行：node 试-问AI指认.js --取 " + b.id);
}

async function 取批(id) {
  const 密钥 = 拿密钥();
  const b = await 发(密钥, "/v1/messages/batches/" + id);
  console.log("状态：" + b.processing_status + "　成功 " + b.request_counts.succeeded + " / 失败 " + b.request_counts.errored);
  if (b.processing_status !== "ended") return console.log("还没跑完，过一阵再取。");
  const 行 = String(await 发(密钥, new URL(b.results_url).pathname + new URL(b.results_url).search)).split("\n");
  const 出 = [];
  行.filter(s => s.trim()).forEach(s => {
    const r = JSON.parse(s);
    const x = 活[+r.custom_id.slice(1)];
    if (r.result.type !== "succeeded") return 出.push({ 文件: x.文件, 错: r.result.type });
    const t = (r.result.message.content || []).filter(z => z.type === "text").map(z => z.text).join("");
    const j = t.match(/\{[\s\S]*\}/);
    const 指认 = j ? JSON.parse(j[0]) : null;
    出.push({ 文件: x.文件, 指认, 判果: 指认 ? 判(x, 指认) : { 结果: "AI 没回 JSON" } });
  });
  存("结果-批量.json", JSON.stringify(出, null, 1));
  汇总(出);
}

function 汇总(出) {
  const 计 = {};
  出.forEach(o => { const k = o.错 ? "报错" : (o.判果 && o.判果.结果) || "?"; 计[k] = (计[k] || 0) + 1; });
  console.log("\n═══ 汇总 ═══");
  Object.entries(计).forEach(([k, v]) => console.log("  " + String(v).padStart(3) + " 份　" + k));
  const 有账 = 出.filter(o => o.判果 && o.判果.对账 && o.判果.对账.length);
  console.log("  " + String(有账.length).padStart(3) + " 份　出了单但对账有意见");
  有账.slice(0, 10).forEach(o => console.log("      " + o.文件.slice(0, 26) + "：" + o.判果.对账[0]));
  console.log("\n明细 → " + path.join(出目录, "结果-*.json"));
}

/* ── 入口 ────────────────────────────────────── */
const 参 = process.argv.slice(2);
if (参[0] === "--估价") 估价().catch(e => console.error(e.message));
else if (参[0] === "--跑" && 参.includes("--同步")) 跑同步().catch(e => console.error(e.message));
else if (参[0] === "--跑") 跑批().catch(e => console.error(e.message));
else if (参[0] === "--取") 取批(参[1]).catch(e => console.error(e.message));
else console.log("用法：node 试-问AI指认.js --估价 | --跑 [--同步] | --取 <批次号>");
