/* 试读一张单：图片/PDF/Excel → AI 填格子表 → 单据行 + 校验
   用法：node 工具-试读结构.js "某张单.png" [更多文件…]

   这是新读表层的验收台。老板 2026-08-03 定的验收标准：
   「每一张的总数校验全绿」—— 分布加起来 = 表上总数，一行不差。 */
const fs = require("fs"), path = require("path"), https = require("https");
global.window = {};
require("./引擎-解析.js");
require("./引擎-读文件.js");
require("./引擎-读结构.js");
require("./引擎-认表.js");
require("./引擎-点位册.js");
const P = global.window.GM_PARSE, F = global.window.GM_FILE, S = global.window.GM_STRUCT;

/* 密钥只在本机这一份，绝不上传（deploy.ps1 里有测试盯着） */
function 密钥() {
  const t = fs.readFileSync("密钥-本机.js", "utf8");
  const m = t.match(/["']sk-ant-[^"']+["']/);
  if (!m) throw new Error("密钥-本机.js 里找不到密钥");
  return m[0].slice(1, -1);
}

const MIME = { ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".gif": "image/gif" };

async function 装料(f) {
  const ext = path.extname(f).toLowerCase();
  const b = fs.readFileSync(f);
  if (MIME[ext]) return { type: "image", source: { type: "base64", media_type: MIME[ext], data: b.toString("base64") } };
  if (ext === ".pdf") return { type: "document", source: { type: "base64", media_type: "application/pdf", data: b.toString("base64") } };
  if (ext === ".xlsx" || ext === ".xls") {
    /* Excel 先在本地转成文本再发 —— 比截图给模型准，也省 token */
    const t = await F.readXlsx(b.buffer.slice(b.byteOffset, b.byteOffset + b.length));
    return { type: "text", text: "下面是一张 Excel 下单表的内容（制表符分列）：\n\n" + t };
  }
  return { type: "text", text: fs.readFileSync(f, "utf8") };
}

function 打(payload, key) {
  return new Promise((ok, no) => {
    const body = JSON.stringify(payload);
    const r = https.request({
      hostname: "api.anthropic.com", path: "/v1/messages", method: "POST",
      headers: { "content-type": "application/json", "x-api-key": key,
                 "anthropic-version": "2023-06-01", "content-length": Buffer.byteLength(body) }
    /* ⚠ 一定要按 Buffer 收、最后再转 utf8。
       按字符串一片片拼的话，一个汉字被切在两片之间就成了乱码（点位名 → 点位��），
       JSON 直接解析不了。2026-08-03 第一次试单就栽在这儿。 */
    }, res => { const bufs = []; res.on("data", d => bufs.push(d));
                res.on("end", () => { const s = Buffer.concat(bufs).toString("utf8");
                  try { ok(JSON.parse(s)); } catch (e) { no(new Error(s.slice(0, 300))); } }); });
    r.on("error", no); r.write(body); r.end();
  });
}

/* ===== 便宜路：Excel 只让 AI 认表头，数字本地读 =====
   老板 2026-08-04：「我肯定要最便宜的方法。」
   4号豆制品.xlsx：全抄给 AI 是 进39840/出46335；只认表头是 进约2千/出约200。 */
async function 认表(files) {
  const T = global.window.GM_TABLE;
  const 表 = [];
  for (const f of files) {
    const e = path.extname(f).toLowerCase();
    if (e !== ".xlsx" && e !== ".xls") return null;      /* 混了图片就走老路 */
    const b = fs.readFileSync(f);
    表.push({ name: path.basename(f),
              grid: await F.readXlsxGrid(b.buffer.slice(b.byteOffset, b.byteOffset + b.length)) });
  }
  const 骨 = 表.map(z => "【文件：" + z.name + "】\n" + T.骨架(z.grid)).join("\n\n");
  console.log("骨架 " + 骨.length + " 字（约 " + T.估token(骨) + " token）");
  const j = await 打({ model: "claude-opus-5", max_tokens: 2000,
    messages: [{ role: "user", content: [{ type: "text", text: 骨 + "\n\n" + T.认表提示词 }] }] }, 密钥());
  if (j.error) throw new Error(j.error.message || JSON.stringify(j.error));
  const txt = (j.content || []).filter(b => b.type === "text").map(b => b.text).join("\n");
  const 读法 = S.剥JSON(txt);
  if (!读法) { console.log("❌ 没看懂这个表怎么读，AI 回的是：\n" + txt.slice(0, 800)); return null; }
  console.log("读法：" + JSON.stringify(读法, null, 1).slice(0, 900));
  const 合 = { 抬头: {}, 行: [], 没读懂的: [], 表怎么读的: null };
  表.forEach(z => {
    const J = T.摊平(z.grid, 读法);
    if (!J) return;
    合.行 = 合.行.concat(J.行 || []);
    合.没读懂的 = 合.没读懂的.concat(J.没读懂的 || []);
    if (!合.表怎么读的) 合.表怎么读的 = J.表怎么读的;
    Object.keys(J.抬头 || {}).forEach(k => { if (!合.抬头[k]) 合.抬头[k] = J.抬头[k]; });
  });
  if (!合.行.length) { console.log("❌ 按它说的读法摊不出货来"); return null; }
  return { J: 合, 用量: j.usage };
}

async function 读一张(files) {
  /* 提示词排最前面 + 挂缓存 —— 跟页面里一个顺序，测出来才算数 */
  const content = [{ type: "text", text: S.提示词, cache_control: { type: "ephemeral" } }];
  for (const f of files) content.push(await 装料(f));
  /* ⚠ 别加 temperature —— 这个模型不收，加了整个识别直接失败。2026-08-03 踩过。 */
  /* 32000 不是随便定的：4号豆制品.xlsx 那种 41 门店 × 44 商品的透视表，
     摊平就是几百条分布，16000 装不下 —— 装不下就截断，截断就 JSON 坏，
     坏了就退回老路，于是又变成「时间戳当商品名」。2026-08-03 踩到。 */
  const j = await 打({ model: "claude-opus-5", max_tokens: 64000, messages: [{ role: "user", content }] }, 密钥());
  if (j.error) throw new Error(j.error.message || JSON.stringify(j.error));
  const txt = (j.content || []).filter(b => b.type === "text").map(b => b.text).join("\n");
  const u = j.usage || {};
  if (u.cache_creation_input_tokens || u.cache_read_input_tokens)
    console.log("缓存：写 " + (u.cache_creation_input_tokens || 0) +
                " / 命中 " + (u.cache_read_input_tokens || 0) + " token");
  return { txt, 用量: u, 停因: j.stop_reason };
}

(async () => {
  const files = process.argv.slice(2);
  if (!files.length) { console.log("用法：node 工具-试读结构.js \"某张单.png\""); process.exit(1); }
  files.forEach(f => { if (!fs.existsSync(f)) { console.log("找不到：" + f); process.exit(1); } });

  console.log("读：" + files.map(f => path.basename(f)).join("、"));

  /* 整批都是 Excel → 走「只认表头」那条便宜路（数字本地读，省 99%）。
     混了图片、或者读法不靠谱，就退回「全量识别」那条老路。 */
  let J = null, 用量 = null;
  const 便宜 = await 认表(files).catch(e => { console.log("认表没成：" + e.message); return null; });
  if (便宜) { J = 便宜.J; 用量 = 便宜.用量; console.log("（走的是「只认表头」那条便宜路）"); }
  if (!J) {
    const 全 = await 读一张(files);
    用量 = 全.用量;
    if (全.停因 && 全.停因 !== "end_turn") console.log("⚠ 模型没写完就停了：" + 全.停因);
    J = S.剥JSON(全.txt);
    if (!J) { console.log("\n❌ 剥不出格子表，AI 交的是：\n" + 全.txt.slice(0, 1200)); process.exit(1); }
  }

  const r = S.读结构(J);
  console.log("\n── 抬头 ──");
  Object.keys(r.抬头).forEach(k => { if (r.抬头[k] !== "" && r.抬头[k] !== null) console.log("   " + k + "：" + r.抬头[k]); });

  console.log("\n── 货 " + r.lines.length + " 行 ──");
  let 总量 = 0;
  r.lines.forEach((L, i) => {
    总量 += L.qty || 0;
    const 段 = (L.segs || []).map(g => (g.code ? "[" + g.code + "]" : "") + (g.没看清 ? "?" : g.qty) + (g.unit || "") + (g.note ? "(" + g.note + ")" : "")).join(" + ");
    console.log("  " + String(i + 1).padStart(2) + ". " + L.text + "  ── " + L.qty + (L.unit || "") +
      (L.总数 ? ("  表上总数 " + L.总数.qty) : "") + (L.price ? ("  单价¥" + L.price) : ""));
    if (段) console.log("       " + 段);
  });
  console.log("  合计数量 " + Math.round(总量 * 1000) / 1000);

  console.log("\n── 校验 ──");
  if (!r.校验.length) console.log("  ✅ 全绿：分布、条数、小计、页码 都对得上");
  else S.校验说人话(r.校验).forEach(s => console.log("  ⛔ " + s));

  const q = P.没看清的(), b = P.别的货(), n = P.没写数量的(), z = P.备注跟数量对不上的();
  if (q.length) console.log("  ❓ 看不清等人填 " + q.length + " 处：" + q.map(x => x.商品 + (x.点位 ? "@" + x.点位 : "")).join("、"));
  if (n.length) console.log("  ❓ 只有名字没数量 " + n.length + " 项：" + n.join("、"));
  if (b.length) console.log("  ❓ 备注写着别的单位 " + b.length + " 处");
  if (z.length) console.log("  ❓ 备注里另有一个数 " + z.length + " 处：" + z.map(x => x.商品 + " 数量列" + x.数量列 + "／备注「" + x.备注 + "」").join("；"));
  if (r.没读懂的.length) console.log("  ❓ 没读懂 " + r.没读懂的.length + " 行：" + r.没读懂的.join(" | "));

  if (用量) console.log("\n（进 " + 用量.input_tokens + " / 出 " + 用量.output_tokens + " token）");
})().catch(e => { console.log("出错：" + e.message); process.exit(1); });
