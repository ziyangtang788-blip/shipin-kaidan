/* 门店必须跟着客户走 —— node 测试-门店跟客户.js

   2026-08-09 出的事故：
     上一单开的是「真实惠生活超市」，选了门店「叠北店」。
     换到「惠雅超市」（观麦那边一家店都没有）之后，
     门店下拉里还挂着叠北店，而且是选中状态 —— 老板截图为证。
     这个值会写进订单记录的 shop 字段、和导观麦的「商户名」那一列，
     等于数据串了。

   根因：重建门店下拉的只有 fillShop()，而换客户有四条路，
     当时只有「下拉里选客户」那一条调了它。走「横幅点确认」那条
     （识别完最常走的一条）压根没碰门店，下拉连 option 列表都是上一家的。

   这个测试盯三件事：
     ① 换客户 → 门店名单换、旧选择清掉（真的跑一遍，不是看源码）
     ② 换客户的四条路【每一条】都调 fillShop（看源码，防将来又漏一条）
     ③ shopNow() 的保险丝还在 —— 万一又冒出第五条路，也不许把别家店名交出去
*/
const fs = require("fs"), path = require("path");
const DIR = __dirname;
let pass = 0, fail = 0;
const L = s => process.stdout.write(Buffer.from(s + "\n", "utf8"));
function ok(name, cond, extra) {
  if (cond) pass++;
  else { fail++; L("  ✗ " + name + (extra ? ("\n      " + extra) : "")); }
}

/* ══════ 最小假浏览器 ══════
   跟 测试-页面能跑起来.js 那个基本一样，只有一处不同：
   元素的 addEventListener 要【记下来】，不能吞掉 ——
   这个测试就是要去按那些按钮。 */
function mkEl(tag) {
  const el = {
    tagName: (tag || "div").toUpperCase(), children: [], attrs: {}, style: {}, _ev: {},
    classList: {
      _s: new Set(), add(x) { this._s.add(x); }, remove(x) { this._s.delete(x); },
      toggle(x, on) { on ? this._s.add(x) : this._s.delete(x); }, contains(x) { return this._s.has(x); }
    },
    _html: "", value: "", textContent: "", hidden: false, disabled: false, checked: false,
    options: [], selectedIndex: 0, files: [],
    get innerHTML() { return this._html; },
    set innerHTML(v) { this._html = String(v); this.children = parseKids(String(v)); },
    setAttribute(k, v) { this.attrs[k] = String(v); },
    getAttribute(k) { return this.attrs[k] === undefined ? null : this.attrs[k]; },
    removeAttribute(k) { delete this.attrs[k]; },
    appendChild(c) { this.children.push(c); c.parentNode = this; return c; },
    insertBefore(c) { this.children.push(c); c.parentNode = this; return c; },
    removeChild(c) { const i = this.children.indexOf(c); if (i >= 0) this.children.splice(i, 1); return c; },
    addEventListener(t, fn) { (this._ev[t] = this._ev[t] || []).push(fn); },
    removeEventListener() { },
    发(t, e) { (this._ev[t] || []).forEach(fn => fn.call(this, e || { preventDefault() { } })); },
    focus() { }, click() { this.发("click"); }, blur() { },
    scrollIntoView() { }, getBoundingClientRect() { return { top: 0, left: 0, right: 0, bottom: 0, width: 100, height: 20 }; },
    querySelector() { return null; }, querySelectorAll(sel) { return this.children.filter(c => 配得上(c, sel)); },
    closest() { return null; }, contains() { return false; },
    get lastChild() { return this.children[this.children.length - 1] || null; },
    get nextSibling() { return null; }, className: ""
  };
  return el;
}
/* 只认得两种选择器：".类名" 和 "[属性]" —— 够这个测试用 */
function 配得上(el, sel) {
  sel = String(sel || "");
  if (sel[0] === ".") return el.classList.contains(sel.slice(1));
  const m = sel.match(/^\[([\w-]+)\]$/);
  if (m) return el.attrs[m[1]] !== undefined;
  return el.tagName === sel.toUpperCase();
}
function parseKids(html) {
  const out = [];
  const re = /<(\w+)([^>]*)>/g; let m;
  while ((m = re.exec(html)) !== null) {
    const el = mkEl(m[1]);
    const cm = m[2].match(/class="([^"]*)"/); if (cm) { el.className = cm[1]; cm[1].split(/\s+/).forEach(c => el.classList.add(c)); }
    const am = m[2].matchAll(/([\w-]+)="([^"]*)"/g);
    for (const a of am) el.attrs[a[1]] = a[2];
    out.push(el);
  }
  return out;
}

const EL = {};
const doc = {
  readyState: "loading", _handlers: {},
  getElementById(id) { return EL[id] || null; },
  createElement(t) { return mkEl(t); },
  createTextNode(t) { const e = mkEl("#text"); e.textContent = t; return e; },
  addEventListener(t, fn) { (doc._handlers[t] = doc._handlers[t] || []).push(fn); },
  removeEventListener() { }, querySelector() { return null; }, querySelectorAll() { return []; },
  body: mkEl("body"), documentElement: mkEl("html"), head: mkEl("head")
};
const store = {};
const win = {
  document: doc,
  localStorage: {
    getItem: k => (store[k] === undefined ? null : store[k]),
    setItem: (k, v) => { store[k] = String(v); }, removeItem: k => { delete store[k]; }
  },
  location: { protocol: "https:", href: "https://choeyy88.com/", hostname: "choeyy88.com" },
  addEventListener() { }, removeEventListener() { },
  scrollTo() { }, print() { }, alert(m) { win._alerts.push(String(m)); }, confirm() { return true; },
  _alerts: [],
  fetch() { return Promise.reject(new Error("测试里不连网")); },
  setTimeout: (f) => setTimeout(f, 0), clearTimeout,
  /* 跟 测试-页面能跑起来.js 里那份假浏览器保持一致：只放一次，不真循环，
     否则 node 退不出。新版UI 用了 setInterval，缺这一行页面开机就 ReferenceError。 */
  setInterval: (f) => setTimeout(f, 0), clearInterval,
  innerWidth: 1400, innerHeight: 900,
  URL: { createObjectURL: () => "blob:x", revokeObjectURL() { } },
  Blob: function () { }, FileReader: function () { this.readAsDataURL = () => { }; },
  Image: function () { }, requestAnimationFrame: f => setTimeout(f, 0),
  matchMedia: () => ({ matches: false, addListener() { }, addEventListener() { } })
};
win.window = win; win.globalThis = win;

const H = fs.readFileSync(path.join(DIR, "配送开单台.html"), "utf8");
[...H.matchAll(/id="([^"]+)"/g)].forEach(m => { EL[m[1]] = mkEl("div"); EL[m[1]].attrs.id = m[1]; });

const vm = require("vm");
const ctx = vm.createContext(win);
["数据-价格库.js", "对照-预置.js", "数据-常用规格.js", "数据-换算.js",
  "数据-商户名.js", "引擎-解析.js", "引擎-匹配.js"].forEach(f => {
    const p = path.join(DIR, f);
    if (fs.existsSync(p)) vm.runInContext(fs.readFileSync(p, "utf8"), ctx, { filename: f });
  });
const scripts = [...H.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].map(m => m[1]);
let 起飞出错 = null;
try {
  scripts.forEach((s, i) => vm.runInContext(s, ctx, { filename: "页面内联script#" + (i + 1) }));
  (doc._handlers["DOMContentLoaded"] || []).forEach(fn => fn({}));
} catch (e) { 起飞出错 = e; }
ok("★ 页面跑得起来", !起飞出错, 起飞出错 && (起飞出错.message + "\n      " + String(起飞出错.stack || "").split("\n")[1]));
if (起飞出错) { L("\n" + pass + " 过 / " + fail + " 挂"); process.exit(1); }

/* ══════ 找出这次事故里的两家 ══════ */
const D = win.GM_DATA;
const 找 = id => { let n = -1; D.custs.forEach((c, i) => { if (c[0] === id) n = i; }); return n; };
const 真实惠 = 找("S3005");     /* 观麦挂着叠北 / 联和 / 旺南三家店 */
const 惠雅 = 找("S4708");       /* 观麦一家店都没有 */
ok("价格库里找得到真实惠(S3005)", 真实惠 >= 0);
ok("价格库里找得到惠雅超市(S4708)", 惠雅 >= 0);
const G = win.GM_SHOP || {};
ok("叠北店确实是真实惠名下的", ((G["S3005"] || {}).店 || []).some(x => x[0].indexOf("叠北") >= 0));
/* 惠雅超市在观麦只挂着它自己一个商户（就叫「惠雅超市」），
   跟叠北店半点关系都没有 —— 这是这次事故的关键前提。 */
ok("惠雅超市名下没有叠北店",
  !((G["S4708"] || {}).店 || []).some(x => x[0].indexOf("叠北") >= 0),
  "惠雅超市真有叠北店的话这个测试的前提就不成立了");

const 客 = EL["cust-select"], 店 = EL["shop-select"];

/* ══════ ① 真的跑一遍：真实惠选叠北 → 换惠雅 ══════ */
{
  客.value = String(真实惠); 客.发("change");
  ok("选了真实惠，下拉里列得出叠北店", 店.innerHTML.indexOf("叠北") >= 0,
    "shop-select = " + 店.innerHTML.slice(0, 200));

  /* 人手点中叠北店 */
  const 叠北 = (G["S3005"].店.find(x => x[0].indexOf("叠北") >= 0) || [])[0];
  店.value = 叠北; 店.发("change");
  ok("叠北店选得上", 店.value === 叠北, "shop-select.value = " + JSON.stringify(店.value));

  /* ★ 事故动作：换成惠雅超市 */
  客.value = String(惠雅); 客.发("change");
  ok("★ 换客户后，叠北店【不许】还选着", 店.value === "",
    "shop-select.value 还是 " + JSON.stringify(店.value) + " —— 数据串了");
  ok("★ 换客户后，下拉里【不许】还列着叠北店", 店.innerHTML.indexOf("叠北") < 0,
    "option 列表还是上一家的：" + 店.innerHTML.slice(0, 200));
  ok("「上次选的」也跟着清掉了", (店.getAttribute("data-上次") || "") === "",
    "data-上次 = " + JSON.stringify(店.getAttribute("data-上次")) +
    " —— 选一下「＋新增门店…」再弹回来又会串");
}

/* ══════ ②「新一单」不许把上一单的店带过来 ══════ */
{
  客.value = String(真实惠); 客.发("change");
  const 叠北 = (G["S3005"].店.find(x => x[0].indexOf("叠北") >= 0) || [])[0];
  店.value = 叠北; 店.发("change");
  ok("（铺垫）叠北店选着", 店.value === 叠北);
  EL["btn-new"].发("click");
  ok("★ 点「新一单」之后门店清空了", 店.value === "",
    "还剩 " + JSON.stringify(店.value) + " —— 上一单的店跟着跑到下一单去了");
}

/* ══════ ③ 事故原路重演：横幅上点「确认是惠雅超市」 ══════
   8/9 老板截图里那一下就是这个。走的不是下拉，是识别完弹出来的横幅。 */
{
  /* 铺垫：上一单是真实惠，选了叠北店 */
  客.value = String(真实惠); 客.发("change");
  const 叠北 = (G["S3005"].店.find(x => x[0].indexOf("叠北") >= 0) || [])[0];
  店.value = 叠北; 店.发("change");
  ok("（铺垫）叠北店选着", 店.value === 叠北);

  /* 下一单：贴新原文 → 点「识别并计价」→ 横幅列出候选客户 */
  EL["btn-new"].发("click");                       /* 新一单，ST.manual 归零 */
  EL["raw"].value = "惠雅超市\n千张 12斤\n水豆腐 5板";
  EL["btn-go"].发("click");
  const 候选 = EL["auto-cust"].querySelectorAll("[data-pick]");
  ok("横幅上列出了候选客户", 候选.length > 0,
    "auto-cust = " + EL["auto-cust"].innerHTML.slice(0, 200));

  const 那颗 = 候选.find(b => b.attrs["data-pick"] === String(惠雅));
  ok("候选里有惠雅超市", !!那颗,
    "只列了 " + 候选.map(b => b.attrs["data-pick"]).join(","));
  if (那颗) {
    那颗.发("click");                              /* ★ 事故那一下 */
    /* 选中的要么是空，要么必须是惠雅自己名下的店 ——
       （原文头一行就写着「惠雅超市」，被 shopGuess 认出来直接选上，那是对的。） */
    const 惠雅的店 = ((G["S4708"] || {}).店 || []).map(x => x[0]);
    ok("★ 横幅确认惠雅超市后，选中的店必须是惠雅自己的",
      店.value === "" || 惠雅的店.indexOf(店.value) >= 0,
      "shop-select.value = " + JSON.stringify(店.value) + " —— 这就是 8/9 的事故");
    ok("★ 横幅确认后，下拉里【不许】还列着叠北店", 店.innerHTML.indexOf("叠北") < 0,
      "option 列表还是上一家的：" + 店.innerHTML.slice(0, 200));
  }
}

/* ══════ ④ 换客户的每一条路都得调 fillShop（看源码，防将来又漏） ══════ */
{
  const src = scripts.join("\n");
  /* 横幅上「✓ 确认是 XXX」那个按钮 —— 8/9 事故走的就是这一条 */
  ok("★ 横幅点确认客户时会重建门店",
    /data-pick[\s\S]{0,600}?fillShop\(custId\(ci\)/.test(src),
    "applyGuess 的 data-pick 里没有 fillShop —— 就是 8/9 那个事故的原样");
  /* AI 很有把握时自动预选那一条 */
  ok("★ AI 自动预选客户时也会重建门店",
    /ST\.ci=top\.ci[\s\S]{0,400}?fillShop\(custId\(top\.ci\)/.test(src),
    "sure 分支没有 fillShop");
  /* 下拉里选客户那一条（本来就有，别被人改没了） */
  ok("下拉里选客户时会重建门店",
    /function\s+定客户\(\)[\s\S]{0,400}?fillShop\(custId\(ST\.ci\)/.test(src));
  /* 调历史单那一条 */
  ok("调历史单时门店跟着单子走",
    /fillShop\(o\.customer_id,\s*o\.shop/.test(src));
  /* 保险丝 */
  ok("★ shopNow() 有保险丝：店不属于当前客户就当没选",
    /function shopNow\(\)\{[\s\S]{0,400}?shopsOf\(custId\(ST\.ci\)\)\.indexOf\(s\.value\)<0/.test(src),
    "保险丝没了 —— 将来再冒出一条换客户的新路，又会串一次");
}

L("");
L(fail ? ("门店跟客户：" + pass + " 过 / " + fail + " 挂") : ("门店跟客户：全过（" + pass + " 项）"));
process.exit(fail ? 1 : 0);
