/* 配送开单台 · 后端
   纯 Node 内置模块，不装任何依赖 —— 少一个会坏的东西。
   单进程 = 所有请求天然串行，2-3 人并发不需要额外的锁。

   跑法： node server.js
   监听： 127.0.0.1:8788   （只听本机，外网经 Caddy 反代过来）
*/
"use strict";
const http = require("http");
const fs = require("fs");
const path = require("path");

/* 线上还是 8788（Caddy 就是往这个口反代的，别动）。
   留个 KAIDAN_PORT 口子是给测试用的 —— 2026-08-09 吃过亏：
   测试和线上抢同一个固定端口，上一次没杀干净的服务器占着 8788，
   测试就跑去打了那台残留的，55 张真单当成自己刚存的三张，整段红得莫名其妙。
   测试改成每次挑个空端口，从此不再抢。 */
const PORT = parseInt(process.env.KAIDAN_PORT || "8788", 10) || 8788;
const HOST = "127.0.0.1";
const DATA = process.env.KAIDAN_DATA || "/var/www/kaidan-data";
const ORDERS_DIR = path.join(DATA, "orders");
const SEQ_FILE = path.join(DATA, "seq.json");
const OVERLAY_FILE = path.join(DATA, "overlay.json");
const CONFIG_FILE = path.join(DATA, "config.json");
const VERSION = "1.0.0";

fs.mkdirSync(ORDERS_DIR, { recursive: true });

/* ---------- 小工具 ---------- */
const readJSON = (f, dflt) => {
  try { return JSON.parse(fs.readFileSync(f, "utf8")); } catch (e) { return dflt; }
};
// 目录被误删/盘没挂上时，写入会 ENOENT 然后整张单悄悄丢掉。
// 每次写之前补一下目录，成本可以忽略，换掉一整类"单子不见了"的事故。
const ensureDir = () => { fs.mkdirSync(ORDERS_DIR, { recursive: true }); };
const writeJSONAtomic = (f, obj) => {
  ensureDir();
  const tmp = f + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(obj, null, 2), "utf8");
  fs.renameSync(tmp, f);          // rename 是原子的，写一半断电也不会留半个文件
};
const today = () => {
  const d = new Date(Date.now() + 8 * 3600 * 1000);   // 固定按东八区算日期
  return d.toISOString().slice(0, 10);
};
const nowISO = () => new Date().toISOString();
const send = (res, code, obj) => {
  const body = JSON.stringify(obj);
  res.writeHead(code, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "content-length": Buffer.byteLength(body)
  });
  res.end(body);
};
const fail = (res, code, msg, extra) =>
  send(res, code, Object.assign({ ok: false, error: msg }, extra || {}));

function readBody(req, limitMB = 32) {
  return new Promise((resolve, reject) => {
    const chunks = []; let n = 0;
    req.on("data", c => {
      n += c.length;
      if (n > limitMB * 1024 * 1024) { reject(new Error("请求体太大")); req.destroy(); return; }
      chunks.push(c);
    });
    req.on("end", () => {
      const s = Buffer.concat(chunks).toString("utf8");
      if (!s.trim()) return resolve({});
      try { resolve(JSON.parse(s)); } catch (e) { reject(new Error("请求体不是合法 JSON")); }
    });
    req.on("error", reject);
  });
}

/* ---------- 单号：服务器发号 ----------
   前端自己算号，同一天开第二单会重号（原来永远是 -01）。
   改成向服务器要，单进程串行，三个人同时点保存也不会撞。 */
// 按单据日期发号，不是按"今天" —— 补昨天的单时，
// 单号里的日期要跟单据上印的下单日一致，否则对不上账。
function nextOrderNo(orderDate) {
  const d = /^\d{4}-\d{2}-\d{2}$/.test(orderDate || "") ? orderDate : today();
  const seq = readJSON(SEQ_FILE, {});
  seq[d] = (seq[d] || 0) + 1;
  // 只留最近 90 天，别让文件无限长
  const keys = Object.keys(seq).sort();
  while (keys.length > 90) delete seq[keys.shift()];
  writeJSONAtomic(SEQ_FILE, seq);
  return "XS" + d.replace(/-/g, "") + "-" + String(seq[d]).padStart(2, "0");
}

/* ---------- 开单记录：逐条追加 ----------
   一行一张单。两个人同时存各写各的行，不可能互相覆盖。 */
const monthFile = ym => path.join(ORDERS_DIR, ym + ".jsonl");

function appendOrder(order) {
  ensureDir();
  const ym = String(order.order_date || today()).slice(0, 7);
  fs.appendFileSync(monthFile(ym), JSON.stringify(order) + "\n", "utf8");
}

function listMonths() {
  try {
    return fs.readdirSync(ORDERS_DIR)
      .filter(f => /^\d{4}-\d{2}\.jsonl$/.test(f))
      .map(f => f.slice(0, 7)).sort().reverse();
  } catch (e) { return []; }
}

// 一张单改了再存，会以同一个 order_no 再追加一行。
// 文件是只追加的（并发安全），所以「改」= 追加一条新版本，
// 读的时候从新往旧扫，同号只认第一次见到的那条 —— 也就是最新那版。
function scanOrders(filter) {
  const { from, to, q, limit } = filter;
  const out = [];
  const seen = new Set();
  const kw = (q || "").trim().toLowerCase();
  for (const ym of listMonths()) {
    if (from && ym < String(from).slice(0, 7)) continue;
    if (to && ym > String(to).slice(0, 7)) continue;
    let text = "";
    try { text = fs.readFileSync(monthFile(ym), "utf8"); } catch (e) { continue; }
    const lines = text.split("\n");
    for (let i = lines.length - 1; i >= 0; i--) {     // 新的排前面
      const s = lines[i]; if (!s.trim()) continue;
      let o; try { o = JSON.parse(s); } catch (e) { continue; }
      if (seen.has(o.order_no)) continue;     // 旧版本，跳过
      seen.add(o.order_no);
      if (from && o.order_date < from) continue;
      if (to && o.order_date > to) continue;
      if (kw) {
        const hay = (o.order_no + " " + o.customer_name + " " + o.customer_id + " " + (o.note || "")).toLowerCase();
        if (hay.indexOf(kw) < 0) continue;
      }
      out.push({
        order_no: o.order_no, order_date: o.order_date, deliver_date: o.deliver_date,
        customer_id: o.customer_id, customer_name: o.customer_name, shop: o.shop || "",
        line_count: (o.lines || []).length,
        total_qty: o.total_qty, total_amount: o.total_amount,
        note: o.note || "", created_at: o.created_at, created_by: o.created_by || ""
      });
      if (out.length >= (limit || 300)) return out;
    }
  }
  return out;
}

function findOrder(no) {
  for (const ym of listMonths()) {
    let text = "";
    try { text = fs.readFileSync(monthFile(ym), "utf8"); } catch (e) { continue; }
    const lines = text.split("\n");
    for (let i = lines.length - 1; i >= 0; i--) {
      const s = lines[i]; if (!s.trim()) continue;
      if (s.indexOf('"' + no + '"') < 0) continue;    // 先粗筛，快
      let o; try { o = JSON.parse(s); } catch (e) { continue; }
      if (o.order_no === no) return o;
    }
  }
  return null;
}

/* ---------- 共享对照：版本号乐观锁 + 合并 ----------
   对照表是整体读写，没法追加。两人同时教东西时，
   后提交的那个不报错、不覆盖，而是合并 —— 谁教的都不丢。 */
/* gone = 人特意「忘掉重学」的键。不带这一份的话，合并会把忘掉的又拉回来：
   本地删了、服务器还留着，下次开页面又同步下来 —— 那个教错的答案阴魂不散。 */
/* spotbook = 点位册：一家客户一本，记住这家的送货点都叫什么。
   跟 maps（商品叫法）一个待遇 —— 存服务器，换电脑不丢。 */
/* 排名单（2026-08-09 老板定的）：一个名字 → 它是什么。全网通用，跟商品叫法一个待遇。
     "万寿" → 点位　　"早餐" → 餐次　　"8/1" → 日期　　"大板" → 规格
   干什么用的：表里横着一排收货方，机器拦下可疑的问人一次，
   人答完就记住 —— 【别每天问同一句】。这才是记这本东西的唯一理由。
   ⚠ 记的是【单个名字】不是【整排】：客户加一个收货点，其余的还认得，不用重问。 */
/* 切法 = 「帮我认一下」学到的断句规矩（一家一条或几条，见 引擎-断句规矩.js）。
   跟 spots 一个待遇：去重追加。这台电脑教会的，换台电脑也认得 ——
   不然「教一次就够了」这句话只在教的那台机器上成立。 */
/* 读法本 = 「这张表怎么读」（2026-08-11 老板定的）。
   指纹（这张表长什么样）→ 识别答出来、人点头确认过的那份读法：
   用第几张表、表头在第几行、哪列是商品/数量/单位/点位/分布。
   为什么要存：以前每传一次表都重新问一遍识别，答案用完就扔 ——
   同一家同一张表，天天重问、天天重赌一次。老板 8/11：
   「来新表得先调 AI 识别正确之后交给人去判断，好了之后给他一个专注的表。」
   ⚠ 合并这儿【必须列出来】：这个 out 是白名单，漏掉一个字段，
     换台电脑一同步就被整份抹掉，人还以为是自己没教过。 */
const EMPTY_OV = { maps: {}, gmap: {}, mem: {}, spots: [], price: {}, gone: {}, spotbook: {}, 排名单: {}, 切法: [], 读法本: {}, 列读法: {}, 碎片角色: {}, px: {}, padd: {}, plog: [], cadd: {}, cgone: {} };

function loadOverlay() {
  const o = readJSON(OVERLAY_FILE, null);
  if (!o || typeof o !== "object") return { version: 0, updated_at: null, data: EMPTY_OV };
  o.data = Object.assign({}, EMPTY_OV, o.data || {});
  o.version = o.version || 0;
  return o;
}

function mergeOverlay(base, incoming) {
  const out = {
    maps: Object.assign({}, base.maps, incoming.maps || {}),
    gmap: Object.assign({}, base.gmap, incoming.gmap || {}),
    price: Object.assign({}, base.price, incoming.price || {}),
    mem: Object.assign({}, base.mem),
    spots: (base.spots || []).slice(),
    切法: (base.切法 || []).slice(),
    spotbook: {},
    /* 排名单：跟 maps 一个待遇 —— 后教的盖前面的。
       两台电脑各教了不同的名字，两边都留着。 */
    排名单: Object.assign({}, base.排名单, incoming.排名单 || {}),
    /* 读法本：一张表样一条，后确认的盖前面的（表改版了就该听新的那份）。 */
    读法本: Object.assign({}, base.读法本, incoming.读法本 || {}),
    /* 列读法 = 「这家这张表，哪一列是什么」（2026-08-24 老板：一整列不许不问就扔掉）。
       跟读法本一个待遇：一张表样一条，后确认的盖前面的。
       ⚠ 漏在这张名单外面 = 页面推上来整份被丢掉，教了等于没教（8/18 padd 那个洞）。 */
    列读法: Object.assign({}, base.列读法, incoming.列读法 || {}),
    /* 碎片角色 = 「明细那一格切碎之后，这一类碎片是什么」（2026-08-27 老板定的底层逻辑）。
       跟 列读法 一个待遇 —— 漏了这一行，换台电脑一撞版本，教会的就被静默抹掉。 */
    碎片角色: Object.assign({}, base.碎片角色, incoming.碎片角色 || {}),
    /* cadd = 页面上新增的客户（观麦那边有、我们价格库这份死文件里还没有的）。
       ⚠ 跟 padd 一个待遇：漏在这张白名单外面，换台电脑一同步就被整份抹掉，
         人还以为客户没加成 —— 8/18 padd 那个洞就是这么来的。 */
    cadd: Object.assign({}, base.cadd, incoming.cadd || {}),
    /* cgone = 删掉的客户。跟 cadd 一个待遇 —— 漏了这一行，
       这台删了推上去，换台电脑照样看得见，两边看到的客户不一样。 */
    cgone: Object.assign({}, base.cgone, incoming.cgone || {}),
    /* ★ 2026-08-18：px / padd / plog 原来【不在这张名单里】，
       页面推上来整份被丢掉 —— 老板 8/18 撞了一天的那个洞。

       后果不是「少存一样」那么轻：
         · 「＋ 库里没有，新建」建的品（padd）只活在那一台浏览器里
         · 可「客户这么叫 → 那个新品」的对照（maps）【会】上服务器
         → 词上了云，货没上云。换台电脑打开，对照指着一个不存在的商品，
           那一行退回「存疑」，界面还亮着「忘掉重学」，看着像学过了。
           线上已经攒了 4 条这种死键（轩宝「云元韧豆腐」）。
         · 改过的价（px）同理，只在一台电脑上；清一次缓存就没了。
       ⚠ who 故意不同步 —— 那是「这台机器前面坐的是谁」，每台不一样。 */
    px: {}, padd: {}, plog: [],
    /* 门店名单：一个客户底下好几家店，人一家家填进去的。同样不在原来那张名单上。
       丢了不会报错 —— 只是下拉框里那几家店悄悄没了，人得重填一遍。 */
    shops: {}
  };
  /* shops：按客户合并，店名去重（两台电脑各填各的店，都留着） */
  for (const cid of new Set([].concat(Object.keys(base.shops || {}), Object.keys(incoming.shops || {}))))
    out.shops[cid] = Array.from(new Set([].concat((base.shops || {})[cid] || [], (incoming.shops || {})[cid] || [])));
  /* px：按客户合并，同一个规格后改的盖前面（跟 maps 一个待遇） */
  for (const cid of new Set([].concat(Object.keys(base.px || {}), Object.keys(incoming.px || {}))))
    out.px[cid] = Object.assign({}, (base.px || {})[cid], (incoming.px || {})[cid]);
  /* padd：按 sku 去重追加。sku 带时间戳天生不撞，
     所以两台电脑各建各的都留着，谁的都不丢 —— 这是「新建」最要紧的一条。 */
  for (const cid of new Set([].concat(Object.keys(base.padd || {}), Object.keys(incoming.padd || {})))) {
    const 见 = new Set(), 出 = [];
    for (const a of [].concat((base.padd || {})[cid] || [], (incoming.padd || {})[cid] || [])) {
      if (!a || !a.sku || 见.has(a.sku)) continue;
      见.add(a.sku); 出.push(a);
    }
    out.padd[cid] = 出;
  }
  /* plog：改价留痕，老板要的「改价要留痕」。去重追加，新的在前，留最近 2000 条。 */
  {
    const 见 = new Set(), 全 = [];
    for (const l of [].concat(incoming.plog || [], base.plog || [])) {
      const k = JSON.stringify(l);
      if (见.has(k)) continue;
      见.add(k); 全.push(l);
    }
    out.plog = 全.slice(0, 2000);
  }
  /* 点位册：按客户合并，同一个点谁见得多听谁的（别让偶尔读飘的那次顶掉常见写法） */
  const 客 = new Set([].concat(Object.keys(base.spotbook || {}), Object.keys(incoming.spotbook || {})));
  for (const cid of 客) {
    const a = (base.spotbook || {})[cid] || {}, b = (incoming.spotbook || {})[cid] || {};
    const o = Object.assign({}, a);
    for (const k of Object.keys(b)) {
      if (!o[k]) { o[k] = b[k]; continue; }
      const x = o[k], y = b[k];
      o[k] = ((y.n || 0) > (x.n || 0)) ? Object.assign({}, y, { n: (x.n || 0) + (y.n || 0) })
                                       : Object.assign({}, x, { n: (x.n || 0) + (y.n || 0) });
    }
    out.spotbook[cid] = o;
  }
  // mem：按客户合并，次数相加，点位/叫法取并集
  for (const cid of Object.keys(incoming.mem || {})) {
    const a = out.mem[cid], b = incoming.mem[cid];
    if (!a) { out.mem[cid] = b; continue; }
    out.mem[cid] = {
      n: Math.max(a.n || 0, b.n || 0),
      keys: Object.assign({}, a.keys, b.keys),
      spots: Object.assign({}, a.spots, b.spots),
      heads: Array.from(new Set([].concat(a.heads || [], b.heads || []))).slice(-6)
    };
  }
  // spots：去重追加
  const seen = new Set(out.spots.map(s => JSON.stringify(s)));
  for (const s of (incoming.spots || [])) {
    const k = JSON.stringify(s);
    if (!seen.has(k)) { seen.add(k); out.spots.push(s); }
  }
  // 切法：跟 spots 一样去重追加 —— 两台电脑各教了一家，两边都留着
  const 见切 = new Set(out.切法.map(s => JSON.stringify(s)));
  for (const s of (incoming.切法 || [])) {
    const k = JSON.stringify(s);
    if (!见切.has(k)) { 见切.add(k); out.切法.push(s); }
  }
  // gone：两边的忘掉名单并起来，然后照着删。
  // 排在最后 —— 先合并再删，才轮得到删掉刚被对方合进来的那些。
  out.gone = Object.assign({}, base.gone, incoming.gone || {});
  for (const g of Object.keys(out.gone)) {
    const i = g.indexOf("|");
    if (i < 0) continue;
    const f = g.slice(0, i), key = g.slice(i + 1);
    if ((f === "maps" || f === "gmap") && out[f]) delete out[f][key];
    /* 改价「还原成观麦的」也要跟着删，不然下次同步又被拉回来 —— 键是 px|客户号|规格编码 */
    else if (f === "px" && out.px) {
      const j = key.indexOf("|");
      if (j > 0 && out.px[key.slice(0, j)]) delete out.px[key.slice(0, j)][key.slice(j + 1)];
    }
  }
  // 忘掉名单只留最近 800 条，再多就没意义了 —— 那些键早被重教覆盖过
  const gk = Object.keys(out.gone);
  if (gk.length > 800) for (const k of gk.slice(0, gk.length - 800)) delete out.gone[k];
  return out;
}

/* ---------- 代理 Claude 识别：密钥只在服务器 ---------- */
function proxyOCR(payload) {
  const cfg = readJSON(CONFIG_FILE, {});
  const key = cfg.anthropic_key || process.env.ANTHROPIC_API_KEY || "";
  if (!key) return Promise.reject(Object.assign(new Error("服务器上还没配密钥"), { code: 428 }));
  const body = JSON.stringify(payload);
  return new Promise((resolve, reject) => {
    const req = require("https").request({
      hostname: "api.anthropic.com", path: "/v1/messages", method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
        "content-length": Buffer.byteLength(body)
      },
      timeout: 180000
    }, r => {
      const cs = [];
      r.on("data", c => cs.push(c));
      r.on("end", () => {
        const t = Buffer.concat(cs).toString("utf8");
        try { resolve({ status: r.statusCode, json: JSON.parse(t) }); }
        catch (e) { resolve({ status: r.statusCode, json: { error: { message: t.slice(0, 500) } } }); }
      });
    });
    req.on("timeout", () => { req.destroy(new Error("识别超时（3分钟）")); });
    req.on("error", reject);
    req.write(body); req.end();
  });
}

/* ---------- 代理 Mistral OCR：密钥同样只在服务器 ----------
   2026-08-09 加。跟上面那个 proxyOCR 是两码事：
     proxyOCR  → Anthropic，管「哪一格是什么」（看得懂业务）
     proxyOCR2 → Mistral OCR，管「把字认准」（认得准，还知道自己准不准）
   分工见 引擎-OCR.js 开头。 */
function proxyOCR2(payload) {
  const cfg = readJSON(CONFIG_FILE, {});
  const key = cfg.mistral_key || process.env.MISTRAL_API_KEY || "";
  if (!key) return Promise.reject(Object.assign(new Error("服务器上还没配 OCR 密钥"), { code: 428 }));
  const body = JSON.stringify(payload);
  return new Promise((resolve, reject) => {
    const req = require("https").request({
      hostname: "api.mistral.ai", path: "/v1/ocr", method: "POST",
      headers: {
        "content-type": "application/json",
        "authorization": "Bearer " + key,
        "content-length": Buffer.byteLength(body)
      },
      timeout: 120000
    }, r => {
      const cs = [];
      r.on("data", c => cs.push(c));
      r.on("end", () => {
        const t = Buffer.concat(cs).toString("utf8");
        try { resolve({ status: r.statusCode, json: JSON.parse(t) }); }
        catch (e) { resolve({ status: r.statusCode, json: { error: { message: t.slice(0, 500) } } }); }
      });
    });
    req.on("timeout", () => { req.destroy(new Error("OCR 超时（2 分钟）")); });
    req.on("error", reject);
    req.write(body); req.end();
  });
}

/* ---------- 路由 ---------- */
const server = http.createServer(async (req, res) => {
  const u = new URL(req.url, "http://x");
  const p = u.pathname.replace(/\/+$/, "") || "/";
  const m = req.method;

  try {
    if (p === "/api/health") {
      const months = listMonths();
      let total = 0;
      for (const ym of months) {
        try { total += fs.readFileSync(monthFile(ym), "utf8").split("\n").filter(s => s.trim()).length; }
        catch (e) { }
      }
      const cfg = readJSON(CONFIG_FILE, {});
      return send(res, 200, {
        ok: true, version: VERSION, data_dir: DATA,
        orders: total, months: months.length,
        overlay_version: loadOverlay().version,
        key_configured: !!(cfg.anthropic_key || process.env.ANTHROPIC_API_KEY),
        server_date: today()
      });
    }

    if (p === "/api/orders" && m === "GET") {
      return send(res, 200, {
        ok: true,
        rows: scanOrders({
          from: u.searchParams.get("from") || "",
          to: u.searchParams.get("to") || "",
          q: u.searchParams.get("q") || "",
          limit: Math.min(1000, parseInt(u.searchParams.get("limit") || "300", 10) || 300)
        })
      });
    }

    if (p === "/api/orders" && m === "POST") {
      const b = await readBody(req);
      if (!b || !Array.isArray(b.lines) || !b.lines.length)
        return fail(res, 400, "这张单没有明细行，没存");
      if (!b.customer_id) return fail(res, 400, "缺客户编号，没存");
      const od = b.order_date || today();
      const order = {
        order_no: b.order_no && String(b.order_no).trim() ? String(b.order_no).trim() : nextOrderNo(od),
        order_date: od,
        deliver_date: b.deliver_date || "",
        customer_id: String(b.customer_id),
        customer_name: b.customer_name || "",
        shop: b.shop || "",                 // 门店：一个客户底下好几家店，记录里要分得开
        note: b.note || "",
        source: b.source || "开单台",
        raw: b.raw || "",                 // 客户原文，将来「照这张再开一单」要用
        created_by: b.created_by || "",
        total_qty: +b.total_qty || 0,
        total_amount: +b.total_amount || 0,
        /* 「后面对，总数不用管」按过哪几行 —— 单据上不印，只在记录里留个交代。
           客户回头问「你怎么发 17 板不是 16.5」，翻这里。 */
        判过的: Array.isArray(b.判过的) ? b.判过的.slice(0, 50) : [],
        created_at: nowISO(),
        lines: b.lines
      };
      appendOrder(order);
      return send(res, 200, { ok: true, order_no: order.order_no, created_at: order.created_at });
    }

    if (p.startsWith("/api/orders/") && m === "GET") {
      const no = decodeURIComponent(p.slice("/api/orders/".length));
      const o = findOrder(no);
      if (!o) return fail(res, 404, "找不到这张单：" + no);
      return send(res, 200, { ok: true, order: o });
    }

    if (p === "/api/overlay" && m === "GET") {
      const o = loadOverlay();
      return send(res, 200, { ok: true, version: o.version, updated_at: o.updated_at, data: o.data });
    }

    if (p === "/api/overlay" && m === "POST") {
      const b = await readBody(req);
      if (!b || typeof b.data !== "object" || !b.data) return fail(res, 400, "没有 data");
      const cur = loadOverlay();
      const clientVer = (b.version === undefined || b.version === null) ? -1 : +b.version;
      const merged = (clientVer === cur.version)
        ? Object.assign({}, EMPTY_OV, b.data)          // 版本对得上，直接用客户端的
        : mergeOverlay(cur.data, b.data);              // 中间被别人改过 → 合并，谁教的都不丢
      const next = { version: cur.version + 1, updated_at: nowISO(), data: merged };
      writeJSONAtomic(OVERLAY_FILE, next);
      return send(res, 200, {
        ok: true, version: next.version, merged: clientVer !== cur.version, data: next.data
      });
    }

    if (p === "/api/ocr" && m === "POST") {
      const b = await readBody(req);
      if (!b || !Array.isArray(b.messages)) return fail(res, 400, "缺 messages");
      let r;
      try { r = await proxyOCR(b); }
      catch (e) { return fail(res, e.code === 428 ? 428 : 502, e.message || "识别请求失败"); }
      return send(res, r.status === 200 ? 200 : r.status, r.json);
    }

    if (p === "/api/ocr2" && m === "POST") {
      const b = await readBody(req);
      if (!b || !b.document) return fail(res, 400, "缺 document");
      let r;
      try { r = await proxyOCR2(b); }
      catch (e) { return fail(res, e.code === 428 ? 428 : 502, e.message || "OCR 请求失败"); }
      return send(res, r.status === 200 ? 200 : r.status, r.json);
    }

    return fail(res, 404, "没有这个接口：" + p);
  } catch (e) {
    console.error("[err]", p, e && e.message);
    return fail(res, 500, e && e.message ? e.message : "服务器出错");
  }
});

server.listen(PORT, HOST, () => {
  console.log("开单台后端 v" + VERSION + " → http://" + HOST + ":" + PORT);
  console.log("数据目录 " + DATA);
});
