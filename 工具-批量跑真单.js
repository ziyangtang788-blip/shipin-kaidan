/* 批量跑历史真单 —— node 工具-批量跑真单.js [几份] [--全]
   用法：
     node 工具-批量跑真单.js 5        先跑 5 份看看（省钱）
     node 工具-批量跑真单.js 999      全跑

   干两件事：
     ① 全量回归 —— 77 家客户、137 份真单，各家格式一次趟完
     ② 把点位册灌满 —— 老板 2026-08-04：「做点位册的时候，
        顺便也可以让他把对照表再完善一下，再顺便学习一下。」

   ⚠ 花钱的。跑之前先报一次预估，跑完报实际。
     Excel 走「只认表头」那条便宜路（约 ¥0.8/份），图片走全量（约 ¥2/份）。 */
const fs = require("fs"), path = require("path"), https = require("https");
global.window = {};
require("./数据-价格库.js");
require("./对照-预置.js");
require("./数据-常用规格.js");
require("./数据-换算.js");
require("./引擎-解析.js");
require("./引擎-匹配.js");
require("./引擎-读文件.js");
require("./引擎-读结构.js");
require("./引擎-认表.js");
require("./引擎-点位册.js");
const W = global.window;
const P = W.GM_PARSE, F = W.GM_FILE, S = W.GM_STRUCT, T = W.GM_TABLE, B = W.GM_SPOTBOOK, D = W.GM_DATA;

/* 原单文件夹搬过位置（2026-08-09 发现搬到了 桌面\配送系统\ 底下）——
   两个地方都找一下，别再因为一条写死的路径跑不起来。 */
const 候选根 = [
  "C:/Users/李正/Desktop/配送系统/也一原始数据/配送客户8.1号下单数据原单",
  "C:/Users/李正/Desktop/也一原始数据/配送客户8.1号下单数据原单"
];
const 根 = 候选根.find(p => { try { return fs.statSync(p).isDirectory(); } catch (e) { return false; } });
if (!根) { console.log("❌ 找不到原单文件夹，找过：\n  " + 候选根.join("\n  ")); process.exit(1); }
/* 换个模型跑一遍，好跟 Opus 的结果逐条对 —— 换模型是钱的事，不能靠猜。
   用法：node 工具-批量跑真单.js 10 claude-sonnet-5 */
const 模型 = (process.argv[3] && !process.argv[3].startsWith("--")) ? process.argv[3] : "claude-opus-5";
const 后缀 = 模型 === "claude-opus-5" ? "" : ("-" + 模型);
const 出 = path.join(__dirname, "批量跑-结果" + 后缀 + ".json");
const 册出 = path.join(__dirname, "批量跑-点位册" + 后缀 + ".json");

function 密钥() {
  const m = fs.readFileSync("密钥-本机.js", "utf8").match(/["']sk-ant-[^"']+["']/);
  if (!m) throw new Error("密钥-本机.js 里找不到密钥");
  return m[0].slice(1, -1);
}
const KEY = 密钥();
const MIME = { ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp" };

function 打(payload) {
  return new Promise((ok, no) => {
    const body = JSON.stringify(payload);
    const r = https.request({
      hostname: "api.anthropic.com", path: "/v1/messages", method: "POST",
      headers: { "content-type": "application/json", "x-api-key": KEY,
                 "anthropic-version": "2023-06-01", "content-length": Buffer.byteLength(body) }
    }, res => { const bs = []; res.on("data", d => bs.push(d));
                res.on("end", () => { const s = Buffer.concat(bs).toString("utf8");
                  try { ok(JSON.parse(s)); } catch (e) { no(new Error(s.slice(0, 200))); } }); });
    r.on("error", no); r.write(body); r.end();
  });
}
const 取文 = j => ((j && j.content) || []).filter(b => b.type === "text").map(b => b.text).join("\n");

/* 客户名 → 价格库里的下标。文件夹名就是客户名（多半对得上） */
function 猜客户(名) {
  const k = s => P.norm(s).replace(/棵/g, "颗").replace(/(有限责任公司|有限公司|股份|集团|分公司|餐饮管理服务|餐饮管理|餐饮服务|供应链管理|供应链|配送中心|配送服务|食材配送|经贸发展|农产品|食品|贸易|实业|科技|公司|中心|市|省|区|县)/g, "");
  const a = k(名); if (a.length < 2) return -1;
  let best = -1, bl = 0;
  D.custs.forEach((c, i) => {
    const b = k(c[1]); if (b.length < 2) return;
    if (a.indexOf(b) >= 0 || b.indexOf(a) >= 0) { if (b.length > bl) { bl = b.length; best = i; } }
  });
  return best;
}

async function 读一份(files) {
  /* 整批都是 Excel → 便宜路 */
  const 都是x = files.every(f => /\.(xlsx|xls)$/i.test(f));
  if (都是x) {
    const 表 = [];
    for (const f of files) {
      const b = fs.readFileSync(f);
      表.push({ grid: await F.readXlsxGrid(b.buffer.slice(b.byteOffset, b.byteOffset + b.length)) });
    }
    const 骨 = 表.map(z => T.骨架(z.grid)).join("\n\n");
    const j = await 打({ model: 模型, max_tokens: 2000,
      /* 提示词排最前 + 挂缓存：缓存是「从头到缓存块」整段缓存，
         骨架每次都不一样，排在前面就一次都命不中 */
      messages: [{ role: "user", content: [
        { type: "text", text: T.认表提示词, cache_control: { type: "ephemeral" } },
        { type: "text", text: 骨 }] }] });
    if (j.error) throw new Error(j.error.message || "认表失败");
    const 读法 = S.剥JSON(取文(j));
    if (读法) {
      const 合 = { 抬头: {}, 行: [], 没读懂的: [] };
      表.forEach(z => { const J = T.摊平(z.grid, 读法); if (J) { 合.行 = 合.行.concat(J.行); 合.没读懂的 = 合.没读懂的.concat(J.没读懂的 || []); Object.assign(合.抬头, J.抬头); } });
      if (合.行.length) return { J: 合, u: j.usage, 路: "认表" };
    }
  }
  /* 老路：全量识别 */
  const content = [];
  for (const f of files) {
    const e = path.extname(f).toLowerCase(), b = fs.readFileSync(f);
    if (MIME[e]) content.push({ type: "image", source: { type: "base64", media_type: MIME[e], data: b.toString("base64") } });
    else if (e === ".pdf") content.push({ type: "document", source: { type: "base64", media_type: "application/pdf", data: b.toString("base64") } });
    else content.push({ type: "text", text: await F.readXlsx(b.buffer.slice(b.byteOffset, b.byteOffset + b.length)).catch(() => fs.readFileSync(f, "utf8")) });
  }
  /* 提示词排最前面 + 挂缓存 —— 跟页面里一个顺序，测出来才算数 */
  content.unshift({ type: "text", text: S.提示词, cache_control: { type: "ephemeral" } });
  const j = await 打({ model: 模型, max_tokens: 64000, messages: [{ role: "user", content }] });
  if (j.error) throw new Error(j.error.message || "识别失败");
  const J = S.剥JSON(取文(j));
  if (!J) throw new Error("剥不出格子表");
  return { J: J, u: j.usage, 路: "全量" };
}

(async () => {
  const 上限 = parseInt(process.argv[2], 10) || 5;
  const 家 = fs.readdirSync(根).filter(d => fs.statSync(path.join(根, d)).isDirectory());
  /* 每家挑一份（多的先不跑，先把「家数」铺开 —— 格式是按家分的） */
  const 活 = [];
  家.forEach(d => {
    const fs2 = fs.readdirSync(path.join(根, d)).filter(x => /\.(xlsx|xls|png|jpg|jpeg|pdf)$/i.test(x));
    if (fs2.length) 活.push({ 家: d, 文件: [path.join(根, d, fs2[0])] });
  });
  /* 断点续跑 —— 老板 2026-08-04：「查一下记录，跑了哪些，哪些没跑，接着去」。
     不加这个的话每次都从第一家 slice，已经跑成的会整个重跑一遍，白花钱。
     判据只认「跑成了没有」：上次报错的（余额不够、超时）算没跑，会重来。 */
  const 续 = process.argv.includes("--续");
  const 读旧 = f => { try { return JSON.parse(fs.readFileSync(f, "utf8")); } catch (e) { return null; } };
  let 已成 = new Set();
  if (续) {
    const 旧 = 读旧(出) || [];
    /* 「跑成」= 真读出货来了。读出 0 品的不算跑成 ——
       2026-08-04 事故就是它们顶着「没报错」混过去的，下次续跑必须重来。 */
    已成 = new Set(旧.filter(r => !r.错 && r.品 > 0).map(r => r.家));
    console.log("续跑：老记录里已经跑成 " + 已成.size + " 家，这些跳过\n");
  }
  /* --只 <关键词>　只跑名字里含这几个字的那家，查问题用（不受 --续 跳过的限制）
     --存格子　　　 把 AI 返回的原始格子表原样存下来 ——
                    用来一刀切开「AI 根本没填格子」还是「读结构把行吞了」。 */
  const 只i = process.argv.indexOf("--只");
  const 只 = 只i > 0 ? (process.argv[只i + 1] || "") : "";
  const 存格子 = process.argv.includes("--存格子");
  let 待 = 活.filter(it => !已成.has(it.家));
  if (只) { 待 = 活.filter(it => it.家.includes(只)); console.log("只跑名字含「" + 只 + "」的：" + 待.length + " 家\n"); }
  const 跑 = 待.slice(0, 上限);
  console.log("一共 " + 活.length + " 家有单，还没跑成 " + 待.length + " 家，这次跑 " + 跑.length + " 家\n");

  const 册 = {};
  let 结果 = [];
  let 进 = 0, 出t = 0, 成 = 0, 败 = 0, 缓写 = 0, 缓中 = 0;
  for (let i = 0; i < 跑.length; i++) {
    const it = 跑[i];
    const 名 = path.basename(it.文件[0]);
    process.stdout.write((i + 1) + "/" + 跑.length + " " + it.家.slice(0, 22) + " … ");
    try {
      const { J, u, 路 } = await 读一份(it.文件);
      if (存格子) {
        const gp = path.join(__dirname, "调试-格子表-" + it.家.replace(/[\\/:*?"<>|]/g, "_") + ".json");
        fs.writeFileSync(gp, JSON.stringify(J, null, 1), "utf8");
        console.log("\n   原始格子表已存 → " + path.basename(gp));
      }
      const r = S.读结构(J);
      进 += (u && u.input_tokens) || 0; 出t += (u && u.output_tokens) || 0;
      缓写 += (u && u.cache_creation_input_tokens) || 0;
      缓中 += (u && u.cache_read_input_tokens) || 0;
      const ci = 猜客户(it.家);
      const cid = ci >= 0 ? D.custs[ci][0] : "";
      let 点 = 0;
      if (cid) 点 = B.学一单(册, cid, r.lines);
      const 段 = r.lines.reduce((a, L) => a + (L.segs || []).length, 0);
      const 坏 = S.校验说人话(r.校验);
      成++;
      console.log(路 + "　" + r.lines.length + " 品 / " + 段 + " 段" +
        (点 ? ("　点位+" + 点) : "") + (坏.length ? ("　⛔ " + 坏.length) : "　✅"));
      结果.push({ 家: it.家, 文件: 名, 路: 路, 客户: cid, 品: r.lines.length, 段: 段,
                  校验: 坏, 没读懂: r.没读懂的, 点位: 点,
                  量: Math.round(r.lines.reduce((a, L) => a + (L.qty || 0), 0) * 100) / 100 });
    } catch (e) {
      败++; console.log("❌ " + e.message.slice(0, 70));
      结果.push({ 家: it.家, 文件: 名, 错: e.message });
    }
  }

  /* 续跑时合并写回：这次跑过的那几家用新结果顶掉，没碰的原样留着。
     直接覆盖会把之前 50 家的记录抹掉 —— 那等于钱白花了。 */
  if (续) {
    const 旧结 = 读旧(出) || [];
    const 这次 = new Set(结果.map(r => r.家));
    结果 = 旧结.filter(r => !这次.has(r.家)).concat(结果);
    const 旧册 = 读旧(册出) || {};
    Object.keys(旧册).forEach(c => { 册[c] = Object.assign({}, 旧册[c], 册[c] || {}); });
  }
  fs.writeFileSync(出, JSON.stringify(结果, null, 1), "utf8");
  fs.writeFileSync(册出, JSON.stringify(册, null, 1), "utf8");
  const 家数 = Object.keys(册).length;
  const 点数 = Object.keys(册).reduce((a, c) => a + Object.keys(册[c]).length, 0);
  console.log("\n══════════════════════════");
  console.log("跑成 " + 成 + " 份，没跑成 " + 败 + " 份");
  console.log("点位册攒到 " + 家数 + " 家 / " + 点数 + " 个点位　→ " + path.basename(册出));
  console.log("明细 → " + path.basename(出));
  /* Claude Opus 5 官价：$5/百万进、$25/百万出（2026-08-04 查的官方定价页）。
     ⚠ 之前这里按 $15/$75 算，那是【已弃用的 Opus 4.1】的价 —— 多报了整整 3 倍。 */
  const 价 = { "claude-opus-5": [5, 25], "claude-sonnet-5": [2, 10], "claude-haiku-4-5-20251001": [1, 5] };
  const 进价 = (价[模型] || [5, 25])[0], 出价 = (价[模型] || [5, 25])[1];
  /* 缓存：写 1.25 倍进价、命中只要 0.1 倍 */
  const 美 = (进 * 进价 + 出t * 出价 + 缓写 * 进价 * 1.25 + 缓中 * 进价 * 0.1) / 1e6;
  console.log("token：进 " + 进.toLocaleString() + " / 出 " + 出t.toLocaleString() +
    "　缓存写 " + 缓写.toLocaleString() + " / 命中 " + 缓中.toLocaleString());
  console.log("约 $" + 美.toFixed(2) + "（约 ¥" + (美 * 7.2).toFixed(1) + "）" +
    (缓中 ? ("　缓存省了约 $" + ((缓中 * 进价 * 0.9) / 1e6).toFixed(2)) : ""));
})().catch(e => { console.log("出错：" + e.message); process.exit(1); });
