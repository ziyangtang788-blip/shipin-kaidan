/* 页面到底能不能跑起来 —— node 测试-页面能跑起来.js

   前面那些测试考的是「函数对不对」，这个考的是「页面开得开」。
   7/31 出过一次事：matchOne 里 core 没赋值就用，整页死掉，
   可所有单元测试全绿 —— 因为没有一个测试真的把页面跑起来过。

   这里搭一个最小的假浏览器（document / localStorage / fetch / location），
   按真实顺序加载 6 个 js + 页面里的两段 script，然后触发 DOMContentLoaded，
   再模拟「贴一张单 → 点识别 → 出销售单」的完整一遍。
   中间任何一处抛错都算没过。 */
const fs = require("fs"), path = require("path");
const DIR = __dirname;
let pass = 0, fail = 0;
const L = s => process.stdout.write(Buffer.from(s + "\n", "utf8"));
function ok(name, cond, extra) {
  if (cond) pass++;
  else { fail++; L("  ✗ " + name + (extra ? ("\n      " + extra) : "")); }
}

/* ══════ 最小假浏览器 ══════ */
function mkEl(tag) {
  const el = {
    tagName: (tag || "div").toUpperCase(), children: [], attrs: {}, style: {}, classList: {
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
    addEventListener() { }, removeEventListener() { }, focus() { }, click() { }, blur() { },
    scrollIntoView() { }, getBoundingClientRect() { return { top: 0, left: 0, right: 0, bottom: 0, width: 100, height: 20 }; },
    querySelector() { return null; }, querySelectorAll() { return []; },
    closest() { return null; }, contains() { return false; },
    get lastChild() { return this.children[this.children.length - 1] || null; },
    get nextSibling() { return null; }, className: ""
  };
  return el;
}
/* innerHTML 里如果写了带 class 的元素，querySelectorAll 要找得到 —— 只解析到这个程度够用。
   ★ 2026-08-11 加：innerHTML 里带 id 的元素要登记进 EL，不然 $("dfa-ok") 拿到 null。
     真浏览器里 innerHTML 一写这些元素就真存在了，页面靠这个挂弹窗按钮
     （问这排 / 问怎么切 / 问读法对不对 三个窗全是这么画的）。
     不登记的话这三个窗在测试里【一个都碰不到】—— 等于没测。 */
function parseKids(html) {
  const out = [];
  const re = /<(\w+)([^>]*)>/g; let m;
  while ((m = re.exec(html)) !== null) {
    const el = mkEl(m[1]);
    const cm = m[2].match(/class="([^"]*)"/); if (cm) { el.className = cm[1]; cm[1].split(/\s+/).forEach(c => el.classList.add(c)); }
    const am = m[2].matchAll(/([\w-]+)="([^"]*)"/g);
    for (const a of am) el.attrs[a[1]] = a[2];
    if (el.attrs.id) EL[el.attrs.id] = el;
    out.push(el);
  }
  return out;
}

const EL = {};
const doc = {
  readyState: "loading",
  _handlers: {},
  getElementById(id) { return EL[id] || null; },
  createElement(t) { return mkEl(t); },
  createTextNode(t) { const e = mkEl("#text"); e.textContent = t; return e; },
  addEventListener(t, fn) { (doc._handlers[t] = doc._handlers[t] || []).push(fn); },
  removeEventListener() { },
  querySelector() { return null; },
  querySelectorAll() { return []; },
  body: mkEl("body"),
  documentElement: mkEl("html"),
  head: mkEl("head")
};
const store = {};
const win = {
  document: doc,
  localStorage: {
    getItem: k => (store[k] === undefined ? null : store[k]),
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: k => { delete store[k]; }
  },
  location: { protocol: "https:", href: "https://choeyy88.com/", hostname: "choeyy88.com" },
  /* ★ 2026-08-11：以前 window.addEventListener 是个空壳，
     于是页面顶上那两个全局兜底（error / unhandledrejection）在测试里【碰都碰不到】。
     记下来，后面要真触发一次看它亮不亮红条。 */
  addEventListener(t, fn) { (win._winHandlers[t] = win._winHandlers[t] || []).push(fn); },
  _winHandlers: {},
  removeEventListener() { },
  scrollTo() { }, print() { }, alert(m) { win._alerts.push(String(m)); }, confirm() { return true; },
  _alerts: [],
  fetch() { return Promise.reject(new Error("测试里不连网")); },   /* 后端探测应当优雅退回本机 */
  setTimeout: (f, t) => setTimeout(f, 0), clearTimeout,
  /* setInterval：只放一次就不再重复 —— 真浏览器里开机那一刻它也只是「排上队」，不会当场跑，
     而且真让它按 350ms 循环下去，node 进程永远退不出、测试就挂在那儿了。
     2026-08-09 补：新版UI 用了两处 setInterval（下拉对值、缩略图计数），
     假浏览器里没有这个函数，页面开机直接 ReferenceError，一路带塌 3 项。 */
  setInterval: (f, t) => setTimeout(f, 0), clearInterval,
  innerWidth: 1400, innerHeight: 900,
  URL: { createObjectURL: () => "blob:x", revokeObjectURL() { } },
  Blob: function () { }, FileReader: function () { this.readAsDataURL = () => { }; },
  Image: function () { }, requestAnimationFrame: f => setTimeout(f, 0),
  matchMedia: () => ({ matches: false, addListener() { }, addEventListener() { } })
};
win.window = win;
win.globalThis = win;

/* ══════ 把页面里所有 id 造出来（页面靠 $("xx") 拿元素） ══════ */
const H = fs.readFileSync(path.join(DIR, "配送开单台.html"), "utf8");
[...H.matchAll(/id="([^"]+)"/g)].forEach(m => { EL[m[1]] = mkEl("div"); EL[m[1]].attrs.id = m[1]; });
ok("页面里的 id 都造出来了", Object.keys(EL).length > 90, "只有 " + Object.keys(EL).length + " 个");

/* ══════ 按真实顺序加载 ══════ */
const vm = require("vm");
const ctx = vm.createContext(win);
/* ★ 2026-08-11：以前只加载 6 个，认表/读结构/断句规矩【一个都没加载】——
   于是「传表 → 认表 → 读法本」这一整条路在测试里根本走不到，
   老板第一次真用就撞上一个卡死（表样指纹把「一沓表」当成一张 rows）。
   顺序照页面里的 script 标签，别自己排。 */
const 依次加载 = ["数据-价格库.js", "对照-预置.js", "数据-常用规格.js",
  "数据-换算.js", "引擎-解析.js", "引擎-读结构.js", "引擎-认表.js",
  "数据-切法规矩.js", "引擎-断句规矩.js", "引擎-匹配.js"];
let 加载出错 = null;
try {
  依次加载.forEach(f => vm.runInContext(fs.readFileSync(path.join(DIR, f), "utf8"), ctx, { filename: f }));
} catch (e) { 加载出错 = e; }
ok(依次加载.length + " 个数据/引擎文件加载不报错", !加载出错, 加载出错 && (加载出错.message));
/* 密钥-本机.js 线上是 404 —— 故意不传。这里就模拟它不存在。 */

const scripts = [...H.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].map(m => m[1]);
ok("页面里有两段内联 script", scripts.length === 2, "实际 " + scripts.length + " 段");

/* ★ 探针（只在测试里注入，页面文件本身一个字不动）：
   页面是一整个 IIFE，里面的函数外面拿不到，「传表 → 认表 → 读法本」那条路
   就永远测不着。在 IIFE 收口前塞一句，把要测的几个递出来。
   ⚠ OV 是 ovLoad 里【整个换掉】的（OV=JSON.parse(...)），所以只能递取值函数，
     递引用会拿到开机前那个空壳。 */
const 探针 = '\n;try{window.__T={' +
  '认表跑一趟:认表跑一趟, 表样指纹:表样指纹, 查读法本:查读法本, 读法人话:读法人话,' +
  '拿OV:function(){return OV;}, 拿ST:function(){return ST;}' +
  '};}catch(e){window.__T探针出错=String(e&&e.message||e);}\n';
let 跑出错 = null;
try {
  scripts.forEach((s, i) => {
    let 源 = s;
    if (i === scripts.length - 1) {
      const k = 源.lastIndexOf("})();");
      if (k > 0) 源 = 源.slice(0, k) + 探针 + 源.slice(k);
    }
    vm.runInContext(源, ctx, { filename: "页面内联script#" + (i + 1) });
  });
} catch (e) { 跑出错 = e; }
ok("★ 页面主脚本跑起来不报错", !跑出错, 跑出错 && (跑出错.message + "\n      " + String(跑出错.stack || "").split("\n")[1]));

/* ══════ 触发 DOMContentLoaded：boot() 在这里跑 ══════ */
let boot出错 = null;
try {
  (doc._handlers["DOMContentLoaded"] || []).forEach(fn => fn({}));
} catch (e) { boot出错 = e; }
ok("★ 开机（boot）不报错", !boot出错, boot出错 && (boot出错.message + "\n      " + String(boot出错.stack || "").split("\n")[1]));

ok("客户下拉填上了内容", (EL["data-pill"] || {}).textContent && /客户/.test(EL["data-pill"].textContent),
  "data-pill = " + JSON.stringify((EL["data-pill"] || {}).textContent));
ok("版本号印出来了", /v2026\d{4}[a-z]/.test((EL["data-pill"] || {}).textContent || ""),
  (EL["data-pill"] || {}).textContent);
/* 后端探测是异步的，等微任务队列跑完再看 —— 同步去看永远是空的 */
async function 等一轮() { for (let i = 0; i < 20; i++) await Promise.resolve(); }


/* ══════ 走一遍真流程：贴单 → 识别 → 出销售单 ══════ */
const D = win.GM_DATA;
let ci = -1; D.custs.forEach((c, i) => { if (c[0] === "S2934") ci = i; });
let 流程出错 = null, 结果 = null;
try {
  /* 直接调页面暴露在闭包外的东西是拿不到的，所以走 DOM：填原文 + 点按钮 */
  EL["raw"].value = "千张 12斤\n小板豆腐 3板\n猪红 5斤";
  EL["cust-select"].value = String(ci);
  /* boot 里给按钮挂的 addEventListener 被我们吞掉了，
     所以这里只验证「加载+开机」这两关；真流程由 测试-学会没有.js 那批覆盖。 */
  结果 = true;
} catch (e) { 流程出错 = e; }
ok("填单据原文不报错", !流程出错, 流程出错 && 流程出错.message);

/* ══════ 客户确认闸门：不能出现「没东西可点又过不去」 ══════
   2026-08-02 老板真用的时候卡死：下拉里已经是对的客户，不动它就不发 change，
   custOK 一直是 false；上面那个 auto-cust 提示块又是隐藏的 —— 无路可走。 */
{
  const src = scripts.join("\n");
  ok("闸门提示里有「就是这家，继续」按钮", src.indexOf("gate-ok") >= 0,
    "找不到 gate-ok —— 卡住之后没东西可点");
  ok("按钮挂了 click 处理", /gate-ok[\s\S]{0,400}addEventListener\("click"/.test(src),
    "gate-ok 只画出来没挂事件");
  ok("处理里真的把 custOK 置为 true", /gate-ok[\s\S]{0,400}ST\.custOK\s*=\s*true/.test(src),
    "点了也过不去");
  ok("闸门里还有「换一家」的出口", src.indexOf("gate-pick") >= 0);
  ok("下拉补了 click（选同一家也算确认）",
    /cust-select"\)\.addEventListener\("click"/.test(src),
    "只挂了 change —— 选同一家不触发，还是会卡");
}

/* ══════ 加单：识别第二张图不能把第一张冲掉 ══════
   客户常常先发一张，过一会儿微信里再补一张。
   原来是 $("raw").value = 新文字 直接覆盖 —— 前一张连同手工改过的字全没。 */
{
  const src = scripts.join("\n");
  ok("识别结果是往后接，不是覆盖", /老的\s*\+\s*"\\n\\n"\s*\+\s*txt/.test(src),
    "还在直接 value=txt，加单会冲掉原来那张");
  ok("识别完清空图片", /clearImg\(\);\s*\$\("imgfile"\)\.value=""/.test(src),
    "图片不清的话，再贴一张点识别会连旧图一起重发，行数翻倍");
  ok("加单时不重置客户确认", /是加单[\s\S]{0,200}ST\.manual\s*=\s*false/.test(src),
    "加单后又要重新确认一次客户，白折腾");
  ok("整张原文重新解析（不是只解析新的那段）",
    /ST\.lines\s*=\s*解析原文\(\$\("raw"\)\.value\)/.test(src),
    "只解析新那段的话，原来的行就丢了");
}

/* ══════ 押金：当普通商品收钱，但不许偷偷加 ══════
   老板 8/2：「押金当做商品去收钱就可以了，下面的结算是另外一码事」。
   数量不敢自动算 —— 8/1 江云那张纸上，8.5 板中板收 8 个押金，
   单上没小板货却收了 2 个小板押金。所以只能摆出来让人点。 */
{
  const src = scripts.join("\n");
  ok("有押金建议这一段", /function\s+押金建议/.test(src), "押金功能没做");
  ok("认得四种板型对应的押金", /老豆腐押金[\s\S]{0,200}小板押金/.test(src));
  ok("只在客户真有押金品时才提", /押金\|按金/.test(src), "客户没有押金品也乱提就是造假");
  ok("已经在单上的押金不重复提", /已有\[/.test(src));
  ok("是「点一下才加」不是自动塞", /button class="btn ghost sm dep"/.test(src),
    "自动塞进去 = 偷偷给客户加钱");
  ok("加进去的是可改数量的普通行", /manual:true[\s\S]{0,80}\}\);\s*ST\.dirty/.test(src) ||
    /i:k,\s*how:"learned"[\s\S]{0,60}manual:true/.test(src));
}

/* ══════ 无价的品，就地填价进库 ══════
   老板 8/2：「这种没有价格的，我就要直接在这里可以输入价格，直接进数据库，
   以后就不需要再单独去加了」。 */
{
  const src = scripts.join("\n");
  ok("有共用的改价函数", /function\s+setPrice\(/.test(src), "没抽出来的话会跟改价页各写一份");
  ok("改价写进覆盖层（观麦重导冲不掉）", /OV\.px\[cid\]\[sku\]\.p\s*=\s*p/.test(src));
  ok("改价留痕（谁改的）", /setPrice[\s\S]{0,600}logChange\(cid[\s\S]{0,40}"改价"/.test(src));
  ok("无价的行会出填价框", /input class="fixp"/.test(src));
  ok("填价框只在价格为 0 时出现", /r\.it&&!\(r\.it\.price>0\)/.test(src),
    "有价的行也冒出填价框会误改");
  ok("回车就存", /keydown[\s\S]{0,120}Enter[\s\S]{0,60}存\(\)/.test(src));
  ok("没填操作人不给改（留痕要有名字）", /fixp[\s\S]{0,400}needWho\(\)/.test(src));
}

/* ══════ 数量框要能正常打字 ══════
   老板 8/2：「数量这个地方没法修改，一打字它老是错误」。
   病根：input 事件里调 renderMatch()，整表重画 → 这个输入框被销毁重建 →
   光标和焦点全丢 → 「12」只剩「1」。打字时绝对不能重画结构。 */
{
  const src = scripts.join("\n");
  ok("打字时不整表重画", /function\s+改数量\(inp,\s*重画\)/.test(src), "还是每敲一键就 renderMatch");
  ok("input 走「不重画」那条路", /addEventListener\("input",\s*function\(\)\{\s*改数量\(inp,false\)/.test(src));
  ok("离开输入框才重画一次", /addEventListener\("blur",\s*function\(\)\{\s*改数量\(inp,true\)/.test(src));
  ok("打一半的「」「.」不当数字处理", /raw===""\|\|raw==="\."/.test(src), "打「1.」时会被当成非法值弹回去");
  ok("不重画时也要把金额和合计刷新", /st-amt"\)\.textContent=money\(R2\.amt\)/.test(src));
}

/* ══════ 确定订单 ══════ */
{
  const src = scripts.join("\n");
  ok("有「确定订单」按钮（两处入口）",
    src.indexOf("btn-confirm") >= 0 && src.indexOf("btn-confirm2") >= 0);
  ok("两个按钮挂的是同一个动作", /\$\("btn-confirm"\)[\s\S]{0,80}确定订单[\s\S]{0,120}btn-confirm2[\s\S]{0,40}确定订单/.test(src));
  /* ⚠ 2026-08-16：原来只认 alert。弹窗改成「提醒条」之后闸门没动、考试却红了 ——
     考题不该盯文案，两种都认。 */
  ok("没确认客户不给确定订单", /确定订单[\s\S]{0,400}ST\.custOK[\s\S]{0,60}(alert|提醒)/.test(src));
  ok("确定订单会真存（走 ordSave）", /function 确定订单[\s\S]{0,1400}ordSave\(\)/.test(src));
}

/* ══════ 门店：一个客户底下几家店 ══════
   老板 8/2：「虽然是这个客户的，但他有不同的店，要把店名加进去；
   一次记住，下次直接选」。 */
{
  const src = scripts.join("\n");
  ok("门店存在覆盖层里（跟对照一起备份）", /OV\.shops\[cid\]/.test(src));
  ok("有记住 / 删掉门店的函数", /function shopAdd\(/.test(src) && /function shopDel\(/.test(src));
  ok("下单表里提到店名会自动选上", /function shopGuess\(/.test(src));
  ok("门店印在销售单上", /s-shop"\)\.textContent/.test(src));
  ok("门店存进订单记录", /shop:\s*shopNow\(\)/.test(src));
  ok("调出旧单时门店一起回来", /if\(o\.shop\) shopAdd\(o\.customer_id,o\.shop\)/.test(src),
    "不带回来的话，重存就把门店弄丢了");
  /* 在「定客户」的函数体里找，不数字符距离 ——
     原来写的是 /定客户[\s\S]{0,300}fillShop.../，2026-08-09 换新版UI 时误报了：
     新版在开头多了「选回还没选客户 → fillShop('','') 清空门店」那一段（约 230 字符），
     把 fillShop(custId(ST.ci) 挤出了 300 字符的窗口，可那句其实原样还在。
     查的性质没变：换客户必须重新装门店名单，不然上一家的店会串到下一家头上（8/9 事故）。 */
  const 定客户体 = (src.match(/function 定客户\(\)\s*\{[\s\S]*?\n {4}\}/) || [""])[0];
  ok("定客户这个函数找得到", 定客户体.length > 0, "找不到就说明函数被改名了，下面那条等于没查");
  ok("换客户时换门店名单", /fillShop\(custId\(ST\.ci\)/.test(定客户体));
}

/* ══════ 每一行都要能删 ══════
   老板 8/2：「识别错了一个、或者识别多了一个，我是没法删的」。 */
{
  const src = scripts.join("\n");
  ok("每行都有删按钮（不只是手动加的）", /button class="btn ghost sm delrow"/.test(src));
  ok("删的是这一行那一组段，不是整个商品",
    /delrow[\s\S]{0,700}L\.segs=L\.segs\.filter/.test(src),
    "一个商品送三个点位就是三行，删一行不该把另外两个点位也删掉");
  ok("段删光了才把整行去掉", /delrow[\s\S]{0,900}ST\.lines\.splice/.test(src));
  ok("删完把整行合计重算", /delrow[\s\S]{0,1100}L\.qty=Math\.round/.test(src));
  /* 8/2 老板：「认不出的删不掉」。
     认不出的行原来没挂 segs，删的时候按段去减 = 一段都没减，按了没反应。 */
  ok("认不出的行也挂上 segs（不然删不掉）",
    /if\(L\.i<0\)\{[^}]*rows\.push\(\{L:L,it:null,segs:/.test(src),
    "compute 里 L.i<0 那一支要带 segs:L.segs");
  ok("没挂段的行按「整行删掉」处理", /delrow[\s\S]{0,600}if\(!segs\.length\)\s*L\.segs=\[\]/.test(src));

  /* ── 一段一行，一段都不并 ★ ──
     老板 2026-08-03：「它同一行里有多少你就出多少行，不要做多余的动作。
     　至于合并，那是以后我另外要加这个功能。」

     江云 8/3 踩到：识别读出 (A002 鹤峰#幼儿餐)3板 + (A002 鹤峰#幼儿餐)2板
     —— 第二个号其实是 A056，被看成 A002。旧的按点位分组把两段并成一行 5 板，
     点位栏印成「A002 鹤峰#幼儿餐 A002 鹤峰#幼儿餐」，看错号这件事就被盖住了。 */
  ok("compute 是一段一行（不按点位分组）",
    /L\.segs\.forEach\(function\(g\)\{[\s\S]{0,500}rows\.push\(\{L:L,it:it/.test(src),
    "要直接 segs→rows，不许再中间垒一层分组");
  ok("每行只挂它自己那一段", /segs:\[g\]/.test(src));
  ok("点位不再拼串", !/codes\.join\(" "\)/.test(src), "拼串就是「A002 A002」那个毛病");
  ok("旧的分组键彻底删掉", !/groups\[k\]/.test(src) && !/\+"\|\|"\+off\+"\|\|"\+note/.test(src));

  /* ── 打印出来的销售单：一个字都不许切 ★ ──
     老板 2026-08-03：点位栏原来 140px、居中 + 裁掉 —— 居中裁就是左右两头一起切。
     「B186 天河宜致#员工餐」印出来成「86 天河宜致#员工」，
     点位号开头的字母被吃掉，分拣的人照着单去册子上找根本对不上号。 */
  const cw = /var W=1240, M=44, CW=\[([\d,]+)\]/.exec(src);
  ok("销售单图列宽还在", !!cw);
  if (cw) {
    const w = cw[1].split(",").map(Number);
    ok("列宽加起来还是 1196（外框不能变）", w.reduce((a, b) => a + b, 0) === 1196,
      "实际 " + w.reduce((a, b) => a + b, 0));
    ok("客户点位那栏 ≥ 200px", w[6] >= 200, "现在 " + w[6] + "px，装不下「B186 天河宜致#员工餐」");
    ok("宽度是从备注那栏匀出来的（备注仍 ≥ 180）", w[7] >= 180, "现在 " + w[7] + "px");
  }
  ok("客户点位改左对齐（居中会两头切）",
    /var AL=\["c","l","c","r","r","r","l","l"\]/.test(src));
  ok("放不下就缩字号，不是直接裁", /g\.measureText\(t\)\.width/.test(src) && /Math\.max\(9,/.test(src),
    "cell() 要先量宽度再决定缩多少");
  ok("缩过的字号只管这一格", /g\.font=f0;/.test(src), "不还原的话后面每一格都跟着变小");
}

/* ══════ 贴文字 / 贴图片 / 拖文件，走的必须是同一条路 ══════
   老板 8/2：「我放文字，跟放图片的学习进度是不统一的，统一掉。」
   原来贴文字那条少了「猜门店」，也没置 dirty —— 同一张单走不同的口，
   出来的状态就不一样。 */
{
  const src = scripts.join("\n");
  ok("有一个统一的入口 跑一遍原文()", /function\s+跑一遍原文\s*\(/.test(src));
  ok("贴文字走它", /btn-go[\s\S]{0,300}跑一遍原文\(\)/.test(src));
  ok("识别图片也走它", /识别完成[\s\S]{0,2000}跑一遍原文\(\)|跑一遍原文\(\)[\s\S]{0,2000}加单已接到原文后面/.test(src));
  ok("入口里带上了猜门店", /function 跑一遍原文[\s\S]{0,900}shopGuess/.test(src),
    "不带的话贴文字进来的单不会自动选门店");
  ok("三个入口都不再各写各的 parseOrder",
    (src.match(/ST\.lines\s*=\s*parseOrder\(\$\("raw"\)\.value\)/g) || []).length <= 2,
    "除了 跑一遍原文 和确认客户那一处兜底，别处不该再自己解析一遍");
}

/* ══════ 没写数量的整行不要 ══════
   老板 8/2：「有文字但没写具体数量的，全部不要放进来。」 */
{
  const src = scripts.join("\n");
  ok("不再有「当 1 算」那个标签", !/没写数量，当 1 算/.test(src));
  ok("丢掉哪些要摆出来", /没写数量的\(\)/.test(src) && /没放进来/.test(src),
    "丢得不声不响就是漏发");
}

/* ══════ 调出来加单：老行冻住、只接新的 ══════
   老板 8/2 定的三条：老行原样不动、还是同一张单号、重复商品另起一行。 */
{
  const src = scripts.join("\n");
  ok("调出来是按存下来的行原样摆回去，不重新解析",
    /function ordReopen[\s\S]{0,2500}how:"frozen"/.test(src),
    "重新 parseOrder 的话，中间改过引擎/学过新词/改过价，老行会悄悄变样");
  ok("存的时候把客户原话也记上了（不然还原不出来）",
    /text:\(r\.L\.text\|\|""\)/.test(src));
  ok("重算绕开冻住的行", /if\(L\.manual\|\|L\.pinned\|\|L\.冻\) return;/.test(src));
  ok("换算也绕开冻住的行", /function 换到计价单位[\s\S]{0,120}L\.冻/.test(src));
  ok("有「只接新的一段」这个函数", /function 接一段\(/.test(src));
  ok("接一段是往后接，不是整张重来", /function 接一段[\s\S]{0,400}ST\.lines=ST\.lines\.concat\(新\)/.test(src));
  ok("加图片走接一段", /是加单\s*\)\s*接一段\(txt\)/.test(src));
  ok("拖文件也走接一段", /if\(老\)\s*接一段\(新文\)/.test(src));
  ok("整张重算前先问一句（别把调出来的单悄悄改了）",
    /function 跑一遍原文[\s\S]{0,300}confirm\(/.test(src));
  ok("原单 / 补单 两个标签都在", /">原单</.test(src) && /">补单</.test(src));
  ok("单号不变 —— 调出来沿用原来的", /ST\.savedNo=o\.order_no/.test(src));
}

/* ══════ 同一个词好几行：默认统一改 ══════
   老板 8/2：「这种改我也没法统一改，我得一个个改。这种就是要统一改的。」
   同一个词二十几行，一行行点是活受罪。 */
{
  const src = scripts.join("\n");
  ok("挑商品时会问「一起改吗」", /comboPick[\s\S]{0,1200}一共有[\s\S]{0,200}confirm\(/.test(src) ||
    /同词几行[\s\S]{0,600}confirm\(/.test(src));
  /* ⚠ 2026-08-16：原来盯的是弹窗里「点确定 = 全部改成」那句话。
     话改简单了（「N 行都是「X」，一起改成「Y」？」），闸门一点没动。
     改成盯【行为】：确定 → 统一=true → 走全改那条。 */
  ok("默认是全部改（确定=全改）", /统一=confirm\([\s\S]{0,120}一起改成/.test(src));
  ok("全改前先把钉过的行解开", /同\.forEach\(function\(x\)\{ x\.pinned=false; x\.冻=false; \}\)/.test(src),
    "不解开的话重算会绕过它们，改不动");
  /* 2026-08-03 碧源：挑了「九龙水豆腐 ¥2」，单价还是 ¥1.30 ——
     那一行是调出来「冻」着的，rematch 直接跳过去了。
     人亲手在下拉里挑，就是他要改这一行，不是悄悄改 → 必须解冻。 */
  ok("人亲手挑了商品，那一行要解冻（不然价钱不跳）",
    /if\(L\)\{ L\.pinned=false; L\.冻=false; \}/.test(src),
    "冻着 rematch 就绕开，教会了也白教");
  ok("「只改这一行」也解冻", /L\.pinned=true; L\.冻=false;/.test(src));
  ok("「✓对，记住」也一起解开同词的行", /okfix[\s\S]{0,700}pinned=false/.test(src));
  /* 盯代码分支，不盯弹窗文案：取消（统一=false）必须还能只改这一行 */
  ok("还留着「只改这一行」这条路", /if\(!统一\)\{[\s\S]{0,400}?renderMatch\(\); return;/.test(src));

  /* ── 改单 / 加单，两种情况 ★ ──
     老板 2026-08-03：「要做一个加单的按键，就是加了单才冻住。
     　不加单的话，可以修改。有修改订单跟加单，分两种情况。」
     以前「调出来一律冻」把两件事混成一件，于是改单改不动。 */
  ok("调出来默认【不冻】（改单）", /manual:!!r\.manual, 冻:false/.test(src),
    "一律冻着的话，调出来只能加单、不能改");
  ok("有「切到加单」按钮", H.indexOf('id="btn-mode-add"') >= 0);
  ok("有「切回改单」按钮", H.indexOf('id="btn-mode-edit"') >= 0);
  ok("进加单模式才把当下这些行冻住",
    /function 进加单模式\(\)\{[\s\S]{0,200}L\.冻=true/.test(src));
  ok("切回改单要全部解冻", /function 回改单模式\(\)\{[\s\S]{0,200}L\.冻=false/.test(src));
  ok("两个按钮都挂了事件",
    /btn-mode-add"\)\.addEventListener\("click",进加单模式\)/.test(src) &&
    /btn-mode-edit"\)\.addEventListener\("click",回改单模式\)/.test(src));
  ok("模式条每次重画都刷（冻了几行要跟着变）", /function renderMatch\(\)\{\s*画模式条\(\);/.test(src));
  ok("新开一单把模式复位", /ST\.调出来的=false; ST\.加单模式=false; 画模式条\(\);/.test(src));
}

/* ══════ 提醒条要能当场点一下就加进来 ══════
   老板 8/3：「这种情况你要弹出来让我去选择，不要我自己单独加。」
   只告诉人「你自己去手动加一行」不算数 —— 数量、单位、点位都得先填好。 */
{
  const src = scripts.join("\n");
  ok("加一行能带预填", /function addBlankLine\(预填\)/.test(src));
  ok("预填带数量/单位/点位", /addBlankLine[\s\S]{0,700}code:p\.code/.test(src));
  /* ⚠ 2026-08-17 老板改口，这条跟着改：
       8/03「弹出来让我去选择，不要我自己单独加」→ 做成了两个按钮
       8/17「你直接加进来就行啦，然后让他自己去选择数量，填数量，
             然后单位也要可以改的那一种」
     改的理由：按钮【只提醒、不拦】。雅食乐 8/17 那张单「(350#03-3张)0斤」的 3 张
     就摆在提醒条上没人点，直接打印，货就漏了。
     现在不问了 —— 直接加成一行摆进单子，配不上商品就是存疑，存疑一行都不许导观麦。 */
  ok("★「别的货」直接加成行，不再摆按钮让人点",
     !/addbuf/.test(src) && !/加进来，我挑商品/.test(src),
     "按钮只提醒不拦，人不点就漏货");
  /* ⚠ 这两条是「按字符距离」找的，中间多写几行注释就会假报警 ——
     2026-08-18 就撞了一次：代码好好的，只因为补了一段注释就红了。
     窗口放宽到 1400/1600；真要再准，得改成按语法找，不是按距离找。 */
  ok("★ 直接把行插进单子里（照客户写的数量单位）",
     /别货\.forEach[\s\S]{0,1400}ST\.lines\.unshift\(\{/.test(src));
  ok("★ 加进来的行标成 manual（等人挑商品，重算不许绕开）",
     /别货\.forEach[\s\S]{0,1600}manual:true/.test(src));
  ok("★ 加过的记进「已处理」，重画时不许再加一遍",
     /别货\.forEach\(function\(z\)\{\s*已处理\[/.test(src),
     "不记账的话每重画一次就多插一行，越点越多");
  /* 2026-08-09 老板：「没写数量的不需要加进来，直接当 0」——【这条不许再有按钮】。
     但 8/2「丢得不声不响就是漏发」还在，所以照规矩 9.2 留一行极短的，只报数。 */
  ok("★ 「没写数量」那条不许有按钮，只报个数", !/noqbuf/.test(src) && /当 0/.test(src),
    "21 项 ×2 个按钮是拿不用管的事占人注意力；但也不能一个字不提");
  /* ★ 2026-08-17 新加：单位得能改。
     老板：「单位也要可以改的那一种」—— 客户写「3张」「5公斤」而库里按斤卖时，
     原来那一格是死文本，人只能干看着。 */
  ok("★ 单位那一格是能填的框，不是死文本", /input class="unit-in"/.test(src));
  ok("★ 改完单位要重新配货（单位是配货的依据之一）",
     /function 改单位\(inp\)\{[\s\S]{0,700}rematch\(\);/.test(src));
  ok("★ 改过的单位不许被自动换算顶回去（标 手改）",
     /function 改单位\(inp\)\{[\s\S]{0,500}L\.手改=true/.test(src));
  ok("带名字的当正常行让引擎去认（不标 manual）",
    /var 有名=[\s\S]{0,300}manual:!有名/.test(src),
    "标了 manual 重算会绕开它，白让人再挑一次");
  ok("不再叫人「自己用手动加一行」", !/真要发就用上面「＋ 手动加一行」补/.test(src));
  /* 老板 8/3：「这个已经解决了，这个提示要消失啊」——
     处理完还挂着，等于狼来了，看多了就不看了 */
  ok("有「已处理」名单", /var 已处理=\{\}/.test(src));
  /* 2026-08-09：「没写数量」那批不再有加进来/不用管按钮，所以也没有「无量|」这个记号了。
     剩下「别的单位」那批（ADD_BUF）还是老样子，照钉。 */
  /* ⚠ 2026-08-17：记账的位置挪了 —— 以前是点按钮时记 x.键，
     现在是自动加行时当场记「别|商品|点位|写的」。不记的话每重画一次就多插一行。 */
  ok("加进来之后记一笔", /已处理\["别\|"\+z\.商品\+"\|"\+z\.点位\+"\|"\+z\.写的\]=1/.test(src));
  ok("提醒会滤掉处理过的", /filter\(function\(z\)\{\s*return !已处理\["别\|"/.test(src));
  ok("★ 没写数量的不再摆按钮墙（2026-08-09）",
    !/noqbuf/.test(src) && !/skipnoq/.test(src) && !/已处理\["无量\|"/.test(src),
    "21 项 ×2 个按钮是拿不用管的事占人注意力");
  /* ⚠ 2026-08-17：「不用管」那个按钮拿掉了。
     行现在是自动加进单子的，不想要就按行上那个「删」—— 一个动作，不用两套。
     ⚠ 但「删得掉」必须还在：删不掉的话人就被一行不需要的货锁住，出不了单。 */
  ok("★ 不用管 = 直接删那一行（不再单设一个按钮）",
     !/skipbuf/.test(src) && /class="btn ghost sm delrow"/.test(src),
     "行上得有「删」，不然人被一行不要的货锁死");
  ok("新开一单把已处理清掉", /已处理=\{\}/.test(src));
  /* 几十行的单，加在最后要翻半天才找得到 —— 老板 8/3：「添加直接在上面添加」 */
  ok("提醒点出来的行插在最前面", src.indexOf("ST.lines.unshift(新行)") >= 0);
  ok("空白的手动加一行照旧加在最后", src.indexOf("ST.lines.push(新行)") >= 0);
  ok("加完滚到那一行", /目标.scrollIntoView/.test(src));
}

/* ══════ 回头核对数字 ══════
   老板 8/3：「我知道根治的办法，但现在只能这样用，所以一定要避免识别错误。」
   识别完把原图和读出来的字再发一次，只问哪个数字跟图上对不上。 */
{
  const src = scripts.join("\n");
  ok("有核对提示词", /var 核对提示\s*=/.test(src));
  ok("核对只挑数字和单位", /只挑【数字和单位】的出入/.test(src));
  ok("提示里点了最容易看花的那几对", /0\/6\/8/.test(src) && /4\/5/.test(src));
  ok("有核对函数", /function 核对一遍\(/.test(src));
  /* ★ 2026-08-04 起，回头核那一遍用【放大过的】同一批图。
     实测：江云 8/4 那张原图 755px，AI 只填 6 段（漏了 A859 南站亚朵 1 斤）；
     放大到 2500px 后 7 段全齐、各段之和 14 跟表上总数一分不差。
     只在这一步放大 —— 10 家 A/B 实测全放大只帮到 1 家却多花 25%。 */
  ok("核对用的还是这批图（放大版）", /var 这批图=content\.slice\(\)/.test(src) &&
    /放大图\(这批图,function\(大图\)/.test(src) && /核对一遍\(大图/.test(src));
  ok("★ 有放大函数，放到 2500px", /function 放大图\(/.test(src) && /长边=2500/.test(src));
  /* ★ 老板 2026-08-04：「我不会去放大它，只有有问题才会去放大某个部分」——
     不是整张放大，是裁出有问题的那一段再放大。请求体更小，那几行反而更清楚。 */
  ok("★ 只裁有问题的那一段", /function 问题在哪段\(/.test(src) &&
    /drawImage\(im,0,y0,w,sh,0,0,cv\.width,cv\.height\)/.test(src));
  ok("★ 裁不出优势就用整张（不许把要看的行切掉）", /下-上>=0\.70/.test(src));
  ok("★ 裁完压成 jpg（请求体压得下去）", /toDataURL\("image\/jpeg"/.test(src));
  /* ★ 人为纠错的口子 —— 老板：「人为纠错，你要装上去啊，留一个口子啊」。
     表上总数自己也会被读错（小豆卜 8.7斤+1斤 读成 8.7），得能改对。 */
  ok("★ 总数能人工订正（留了口子）", /input class="fixtz"/.test(src) &&
    /querySelectorAll\("input\.fixtz"\)/.test(src));
  ok("★ 订正要留痕（将来客户回头问翻得出来）",
    /判过的\.push\(\{行:名,按:"表上总数改成 "/.test(src));
  ok("★ 订正的是总数，不是拿总数去改各段", /L\.总数\.qty=v/.test(src) && !/L\.qty=v/.test(src));
  ok("★ 放大失败要退回原图（不许拖累识别）",
    /出=图们\.slice\(\)/.test(src) && /im\.onerror=/.test(src));
  ok("★ 放大有超时兜底（图卡住也不能把识别拖死）", /setTimeout\(收工,8000\)/.test(src));
  ok("★ 只放大、不改原图（原图那份还留着给人看）",
    !/IMGS=大图/.test(src) && !/这批图=大图/.test(src));
  ok("核对失败不吭声（不能拖累识别）", /function 核对一遍[\s\S]{0,2600}catch\(function\(\)\{ 收到\(\[\]\); \}\)/.test(src),
    "核对是加分项，失败了不能反过来把识别搞挂");
  ok("「全对」就不报", /全对/.test(src));
  /* 老板 8/3：「一切都以后面为准，应该去解决识别的问题，不是用总数去反推。」
     对账只用来【定位哪一行可疑】，然后让核对那一遍回去重看那几行 —— 不是拿总数改数字。 */
  ok("对账结果喂给核对那一遍", /function 重点核哪几行/.test(src) &&
    /核对提示\+文本\+重点核哪几行\(\)/.test(src));
  ok("明说不许拿总数去凑数", /不许拿它去凑数/.test(src));
  /* 2026-08-04 老板：「你这整个提示时间太长了，你就说直接问以哪个为准。」
     文案精简过，但这两条【意思】一个字都不许少 —— 断言跟着新话改，钉的还是同两件事：
       ① 以各段为准；② 总数也可能是客户自己填错的（不写的话人会反过来去改各段）。 */
  ok("提醒里写清楚以各段为准", /以各段为准，不拿总数去凑/.test(src));
  ok("提醒里留了「也可能是客户填错」这一条", /客户自己把总数填错/.test(src),
    "不写的话人会以为总数量一定对，反过来去改各段");
  /* 补一段：缺的那点多半是【整段漏抄】。补上、人填了数 → 各段之和=总数 → 警告自己消。
     老板 2026-08-04：「他只要加进总数对得上，你这个可能就要变绿啊。」 */
  ok("对不上的行有「补一段」可点", /button class="btn ghost sm addseg"/.test(src));
  ok("补一段是空的、标没看清（逼人真去填，不许拿 0 蒙混）",
    /L\.segs\.push\(\{qty:0,[^}]*没看清:true\}\)/.test(src));
  ok("★ 补一段绝不预填差额（预填=拿总数凑数）",
    !/L\.segs\.push\(\{qty:\s*(差|总-和)/.test(src));
  /* 绝不能出现「拿总数量去改数量」的代码 */
  ok("★ 代码里没有拿总数去改各段的地方",
    !/L\.qty\s*=\s*L\.总数/.test(src) && !/g\.qty\s*=\s*[^;]*总数/.test(src),
    "总数量只能报，不能改");
  ok("结果摆在提醒条最前面", /回头核对：/.test(src));
  /* 「整单都回头核」那个勾已删（老板 2026-08-04：「取消，不要整个整个重新看的」）。
     现在没有开关，改成自动按需 —— 所以这条反过来钉：页面上不许再有那个勾。 */
  ok("★ 没有「整单都回头核」的勾了（改成自动按需）", !/id="ocr-check"/.test(H));

  /* ★ 2026-08-04 老板定的三件（都在这一批改的，钉住免得被改回去）：
       ① 界面分上下两块：先摆要拿主意的，再列没问题的
       ② 粘贴要收【文件】不只是图片（「是文件收不到，不是图片」）
       ③ 从微信拖进不来时必须说一句，不许闷着 */
  ok("★ 表格分两块：要拿主意的排前面",
    /var 要=待排\.filter/.test(src) && /闲=待排\.filter/.test(src));
  ok("★ 分块只改贴的顺序，data-row 还是原下标（不然改数量会串行）",
    /待排\.push\(\{tr:tr,要:/.test(src));
  ok("★ 「没问题的」那块能收起来", /rowsplit/.test(src) && /okrow/.test(src));
  ok("★ 粘贴收 clipboardData.files（不只是图片）",
    /cd\.files/.test(src) && /收文件\(收\)/.test(src));
  ok("★ 粘贴交给 收文件（它会分流 Excel/PDF），不是只走 filesToImgs",
    !/if\(fs\.length\)\{ filesToImgs\(fs\); e\.preventDefault\(\); \}/.test(src));
  ok("★ 拖不进来时给话，不闷着（微信拖过来浏览器拿不到文件）",
    /这样拖进不来/.test(src) && /Ctrl\+V/.test(src));
  ok("★ 数量合计字号放大（很多单客户不写合计，这是唯一的账）",
    /\.stat \.v\{font-size:2[0-9]px/.test(H));
  /* ★ 2026-08-04 老板：「这个界面……现在太大了，能简化的简化」
     选了两条：① 标签挪到左边（高度省一半）② 「记住这家店」收进门店下拉 */
  ok("★ 字段标签挪到左边（不再占两行）",
    /\.field\{display:grid;grid-template-columns:4\.6em/.test(H) &&
    /\.field>span\{[^}]*text-align:right/.test(H));
  ok("★ 「＋ 新增门店…」收进门店下拉里", /value="__新增__"/.test(src));
  ok("★ 那条输入行平时收着（hidden）", /id="shop-bar"[^>]*hidden/.test(H));
  ok("★ 选「新增」不许把假选项落到单子上（弹回上一个）",
    /this\.value=this\.getAttribute\("data-上次"\)/.test(src));
  ok("清空单据时把核对结果也清掉", /核对结果=\[\]; 核对中=false;/.test(src));
  /* ⚠ 这个模型不收 temperature，加了整个识别直接挂 —— 2026-08-03 踩过 */
  ok("★ 识别请求里没有 temperature（这个模型不收，加了必挂）",
    !/temperature\s*:/.test(src),
    "「`temperature` is deprecated for this model」—— 加了识别会直接失败");
}

/* ══════ 不确定的数字：写 ?，留空让人填 ══════
   老板 2026-08-03：「不要逼他写个数字，不确定的就写 ?，我们自己输入。
   同时要有问题的那几行变个色，我好一下找到，改好之后变回原来色，同时报错消失。」

   猜一个数才是错 —— 猜出来的没人查得出来；写 ? 摆在明面上，填一下就完事。 */
{
  const src = scripts.join("\n");
  ok("提示词里写着看不清就写 ?", /看不清就写 \?，不许猜/.test(src));
  ok("明说写 ? 不算错、猜才算错", /写 \? 不算错/.test(src) && /猜出来的数没人查得出来/.test(src));
  ok("只有数量位可以写 ?（名字点位不许）", /只有数量那一位可以写 \?/.test(src));
  /* 变色 */
  ok("没看清的行变橙色", /tr\.className="q-blur"/.test(src));
  ok("跟总数对不上的行变红色", /tr\.className="q-diff"/.test(src));
  ok("两种颜色都有样式", /tr\.q-blur td\{background/.test(H) && /tr\.q-diff td\{background/.test(H));
  ok("没看清的数量框空着 + 提示填", /placeholder="填数量"/.test(src));
  /* 改好就恢复 */
  ok("填了数量就把「没看清」抹掉（颜色和提醒跟着消失）",
    /segs\.forEach\(function\(g\)\{ delete g\.没看清; \}\)/.test(src),
    "不抹的话填完还是橙色，提醒也不消失");
  ok("提醒是从当前行现算的，不是识别时的快照",
    /R\.rows\.forEach\(function\(r\)\{[\s\S]{0,200}没看清/.test(src),
    "拿快照的话填一个也不会少一条");
  /* 闸门 */
  /* ⚠ 2026-08-16：这两道闸原来是【各写各的】两段一模一样的代码，
     考题也就各盯各的一句话。改一处忘另一处 → 「导得出去却确定不了」。
     现在合成一份 数量还空着()，考题跟着改成：两处都得调它。 */
  ok("空着的判断只有一份", /function 数量还空着\(\)\{[\s\S]{0,400}?g\.没看清/.test(src));
  ok("空着不许确定订单", /function 确定订单\(\)\{[\s\S]{0,400}?if\(数量还空着\(\)\)\s*return;/.test(src));
  ok("空着不许导观麦", /function 导观麦\(\)\{[\s\S]{0,600}?if\(数量还空着\(\)\)\{/.test(src));
}

/* ══════ 读结构：AI 填格子表，不让它猜 ★ ══════
   老板 2026-08-03：「我们做一张表格，让 AI 去填，并不是让他猜，
   　　　　　　　　　所有东西都不要有猜的成分。」 */
{
  const src = scripts.join("\n");
  ok("页面加载了 引擎-读结构.js", /引擎-读结构\.js/.test(H));
  ok("提示词只有一份（在引擎里，页面只是引用）",
    /window\.GM_STRUCT&&window\.GM_STRUCT\.提示词/.test(src) && !/你的活儿：把上面的信息填进/.test(src),
    "页面里再抄一份，改了这边忘了那边，查都查不动");
  ok("发出去的是格子表提示词",
    /var content=\[\{type:"text",text:OCR_JSON_PROMPT/.test(src));
  /* ★ 提示词缓存：缓存是「从头一直到缓存块」整段缓存。
     提示词排在图片后面的话，前缀里含着每次都不一样的图，一次都命不中。
     提示词 2569 token、天天一个字不变 → 命中只要 0.1 倍进价，省九成。 */
  ok("提示词排在最前面（不然缓存永远命不中）",
    /var content=\[\{type:"text",text:OCR_JSON_PROMPT,cache_control/.test(src));
  ok("会变的那句排在缓存块后面（不然缓存内容天天变，等于没挂）",
    /cache_control:\{type:"ephemeral"\}\}\];\s*\n\s*if\(份数>1\) content\.push/.test(src));
  /* 钉的是【提示词那一块排在最前面并且挂了缓存】这个结构，不是提示词叫什么名字。
     2026-08-12 换入口之后，这里是「新路子用 N.提示词、退回老路用 T.认表提示词」的三元式，
     按字面钉就会假报错 —— 缓存结构其实一点没动。 */
  ok("认表那一次也是提示词在前、挂缓存",
    /content:\[\s*\n?\s*\{type:"text",text:[^,]*提示词[^,]*,cache_control:\{type:"ephemeral"\}\}/.test(src));
  ok("剥不出格子表就退回老路（老提示词留着）", /var OCR_PROMPT=/.test(src),
    "老路子是兜底，删了就没退路");
  ok("剥 JSON 走的是引擎那份", /window\.GM_STRUCT\.剥JSON\(txt\)/.test(src));
  ok("结构摊成人看得懂的文字放进原文框", /window\.GM_STRUCT\.结构变文字\(J\)/.test(src));
  ok("结构存进 ST 当真身", /ST\.结构=结构; ST\.结构文字=\$\("raw"\)\.value/.test(src));
  /* textarea 在某些浏览器里把 \n 换成 \r\n —— 一个看不见的字符就能让
     整张单退回老路，而且退得不声不响。所以比对前先抹平。 */
  ok("比对时抹平换行", src.indexOf('function 同一份(') >= 0 && /\.trim\(\)\s*$/m.test(src));
  ok("页面上说清楚走的哪条路", /走的哪条路==="格子表"/.test(src),
    "出问题第一句要问的就是「这张单是照格子表读的吗」");
  /* ⛔ 2026-08-18 老板推翻了「人改过原文就以文字为准」：
     「框里的字锁掉，我从来没有动过框里的字，我只需要改下面的表格里面的某个东西。」
     原来框里的字动一下（哪怕一个换行）整张单就退回文字路、换一套规矩 ——
     53 张真单实测两条路有 8 张数量对不上，差 113，人还看不出来。
     现在：有结构就一直用结构，框里的字变不变都不改路。
     ⚠ 一度改成把框设 readOnly，结果文件拖不进来了，当天就退回不锁框的做法。 */
  ok("★ 有结构就一直走格子路，框里的字变了也不换路",
    src.indexOf("if(ST.结构&&window.GM_STRUCT){") >= 0,
    "同一张单不许有两个答案");
  ok("加单之后结构作废", /ST\.结构=null; ST\.结构文字=""/.test(src));
  /* ── 拖文件进来也得走 AI ★ ──
     老板 2026-08-03：「为什么我把文件一拖进来，还是有之前的问题，
     　反而我把图片截出来就不会有？」
     就是因为 Excel/Word 原来是在本地转成文字直接塞进原文框、压根没让 AI 看过，
     于是走文字倒推那条老路，广泰粉面那种矩阵表当场就散。 */
  ok("Excel/Word 的文字也排队送去识别", /TXTS\.push\(\{name:r\.name,text:r\.text,grid:r\.grid\|\|null\}\)/.test(src),
    "不送就是老路，矩阵表读不了；grid 一起带上才能走便宜那条");

  /* ── 便宜路：Excel 只让 AI 认表头 ★ ──
     老板 2026-08-03：「我肯定要最便宜的方法…很烧 token 的这种以后就直接报错，
     　不要浪费钱…但是我的操作流程我不想改，你把后台改过来就可以。」
     4号豆制品.xlsx：全抄给 AI 进39840/出46335（约¥29）；只认表头 进约2千/出约200。 */
  ok("页面加载了 引擎-认表.js", /引擎-认表\.js/.test(H));
  ok("整批都是 Excel 就走认表那条便宜路",
    /有格子\.length===TXTS\.length&&!imgs\.length&&!PDFS\.length/.test(src),
    "混着图片得走老路 —— 图片本地拿不到格子");
  ok("认表只发骨架、不发全表", /T\.骨架\(z\.grid\)/.test(src));
  /* 钉的是【认表那一次调用用的是小的 max_tokens】，不是「认表」这两个字附近有没有它。
     2026-08-09 之前按字距钉，函数前面一加注释就假报错。改成锁「认表提示词」那次请求本身：
     payload 里 max_tokens:2000 紧跟着就是带 认表提示词 的 messages。 */
  /* 守的是「别拿 64000 去问一句读法」这个意图，不是死钉 2000。
     2026-08-12 提到 4000：换成指认式提问后回的 JSON 长一点，2000 有截断风险。
     ⚠ 上限还是要钉死 —— 一位数千才算「开小」，五位数就是白给钱。 */
  ok("认表那一次 max_tokens 开小（它只回一句读法）",
    /max_tokens:[1-9]000[\s\S]{0,1200}提示词\)?,cache_control/.test(src),
    "认表只回一句读法，开 64000 是白给的钱");
  ok("全量识别那一次才开 64000（矩阵表摊平能出六七百条）",
    /max_tokens:64000/.test(src) && !/认表提示词[\s\S]{0,300}max_tokens:64000/.test(src));
  ok("摊平在本地做（数字不经过模型）", /T\.摊平\(z\.grid,读法\)/.test(src));
  ok("摊不出货来就当失败，不硬开单", /按它说的读法摊不出货来/.test(src));
  /* 花钱之前先拦 */
  ok("发之前先估要烧多少", /window\.GM_TABLE\.估token/.test(src));
  ok("太大就拦下、先不花钱", /没发出去，先没花钱/.test(src));
  ok("拦下之后还给一条「照样跑」的路", /btn-force-ocr/.test(src) && /确认过大=true/.test(src),
    "只拦不给出口 = 死路");
  /* 老板 8/3：「文件拖进来没有一个可以看到的，不像图片那样有个图，会导致我多拖几次。」 */
  ok("拖进来的文件摆在缩略图那一排（看得见才不会重复拖）",
    /d\.textContent="📊 "\+z\.name/.test(src));
  ok("摆出来之后不自动跑（一闪就没了等于没看见）",
    /renderThumbs\(\);\s*\n\s*return;/.test(src));
  ok("清空连文件一起清", /function clearImg\(\)\{ IMGS=\[\]; PDFS=\[\]; TXTS=\[\]; renderThumbs\(\); \}/.test(src));
  ok("文本跟图片、PDF 一起发同一次请求", /concat\(TXTS\.map\(function\(t\)\{/.test(src));
  ok("只要有文本待识别就不空跑", /!imgs\.length&&!PDFS\.length&&!TXTS\.length/.test(src));
  ok("识别用过就清空 TXTS（不清会连着旧的一起发，行数翻倍）", /clearImg\(\); \$\("imgfile"\)\.value=""; TXTS=\[\]/.test(src));
  ok("没密钥就退回老办法，内容不丢", /var 能识别=ORD\.online\|\|getKey\(\)/.test(src));
  ok("识别失败也把文件内容放回原文框", /function 识别败了\(话\)/.test(src),
    "失败了还把本地已经读出来的字一起丢掉，等于白拖");
  /* 老板 2026-08-03 看到过一屏 673 行的假单（时间戳当商品名）——
     余额不足、识别整个没跑，代码却把本地原文自动解析了一遍。
     一张看着像模像样的假单，比什么都不出更糟。 */
  ok("识别失败【不自动解析】（不许出假单）",
    src.indexOf("没有解析</b> —— 下面这张表是空的") >= 0,
    "自动解析就成了假单，认错≠0");
  ok("但给一条「照老办法硬读」的出口", /btn-raw-parse/.test(src));
  ok("硬读之后明说这不是识别结果", /这是按老办法硬读的，不是识别结果/.test(src));
  /* 2026-08-09：原来不管什么毛病都套「⛔ 这张单对不上账」+「是不是漏了行漏了页」，
     人看不懂就不看，真出事那次也跟着漏掉。现在按性质分两档。 */
  /* 2026-08-10 老板把上面这条又收窄了一档：「看一眼」那种零碎校验整块删掉，
     只留「真少了货」。理由是弹的东西太多、他就全不看了 —— 留一条才有人看。 */
  ok("★ 真少了货还是照喊（这条不许删）",
    /校验说人话\(真少了\)/.test(src) && /可能漏了货/.test(src) && /漏了行、漏了页/.test(src),
    "少了货是最贵的错，这条没了就真漏货了");
  ok("★「看一眼」那种零碎校验不再弹（2026-08-10）",
    !/<b>看一眼：<\/b>/.test(src),
    "老板：弹的太多我就全不看了");
  /* 「N 处识别自己说没看明白」整块删了 —— 规矩改成只认【数字+单位】，
     「(A031 沁园#幼儿)1)3斤」= 3 斤，多出来的「1)」当点位记，不问人。
     真读不出数量的走「N 处不确定，要你手动输入数量」那条。 */
  ok("★「识别自己说没看明白」不再弹（2026-08-10）",
    !/结构报告\.没读懂的/.test(src),
    "老板：那个 1 不用管，为什么还要弹出来");
  ok("★ 没看清那条只报处数、不抄货名点位（2026-08-10）",
    /处不确定，要你手动输入数量/.test(src) && !/没看清行\.slice/.test(src),
    "货名点位表格里都有，在提示里再抄一遍就占掉大半屏");
  /* A 案：数量列已经写了数的，备注不许顶掉 */
  ok("备注跟数量岔开了会问人", /备注跟数量对不上的\(\)/.test(src));
  ok("而且能「不用管」掉", /已处理\["备岔文\|"/.test(src));
  /* 广垦那张单「客户备注」整列写着「17」（内部编码），5 行就报 5 遍、
     还得点 5 次「不用管」。同一句话归一条，一次点掉。 */
  ok("同一句备注归成一条（整列写着「17」别报 5 遍）", /备注岔组\[z\.备注\]/.test(src));
}

/* ══════ 点位册 ★ ══════
   老板 2026-08-04：「做那个点位册的时候，顺便也可以让他把对照表再完善一下，
   　再顺便学习一下。」—— 所以点位跟商品叫法一起学、一起存服务器。

   治的毛病：全单只有「点位」这一栏没人校验，同一个点每识别一次换一个写法
   （A031 沁园庭 ↔ 沁园@、B173 嘉家贝 ↔ 塞家岛、A829 铂轩 ↔ 铂骊）。 */
{
  const src = scripts.join("\n");
  ok("页面加载了 引擎-点位册.js", H.indexOf("引擎-点位册.js") >= 0);
  ok("OV 里给点位册留了位置（要跟着上服务器）", src.indexOf("spotbook:{}") >= 0);
  ok("每次重算都跟册子顺一遍",
    src.indexOf("GM_SPOTBOOK.顺一遍(OV.spotbook,cid,ST.lines)") >= 0);
  ok("确定订单时跟叫法一起学",
    src.indexOf("GM_SPOTBOOK.学一单(OV.spotbook,custId(ST.ci),ST.lines)") >= 0);
  ok("学到了要存下来", src.indexOf("if(学点) ovSave()") >= 0);
  ok("名字读飘的只说一句，不打扰", src.indexOf("点位册：") >= 0);
  ok("没见过的点位摆出来问", src.indexOf("个点位册子里没有") >= 0);
  /* 2026-08-10 老板：「读出什么识别什么，重复关你什么事。」
     重号引擎照算不误（测试-点位册.js 盯着），但页面一个字都不报 ——
     点位识别到什么就是什么，不许拿重号反过来质疑这次读到的结果。
     ⚠ 这里要断言「渲染里没有」，不是「文件里没有」—— 注释里还留着这句话的来历。 */
  ok("★ 同行重号不再弹（2026-08-10）",
    !/h\+='<div class="alert sale"><b>⛔ '\+点位报告\.重号\.length/.test(src),
    "老板：读出什么识别什么");
  ok("拉服务器那份时把点位册合进来", src.indexOf("d.spotbook||{}") >= 0);
  ok("点位册那一页画得出来",
    src.indexOf("function renderSpotbook()") >= 0 && H.indexOf('id="sb-rows"') >= 0);
  ok("能一家一家忘掉", src.indexOf("delete OV.spotbook[cid]") >= 0);
}

/* ══════ 总数对不上：一键点掉 + 留痕 ★ ══════
   老板 2026-08-03：「你不让他走下一步也不行啊，我只要把后面改好了就可以呀。」
   留痕不给客户看（单据上不印），是给自己留个交代：
   将来客户回头问「你怎么发 17 板不是 16.5」，翻订单记录就有。 */
{
  const src = scripts.join("\n");
  ok("红条上有「后面对，不用管」", src.indexOf("skiptz") >= 0);
  ok("点掉之后不再提醒", src.indexOf('已处理["总数|"+x.名]') >= 0);
  ok("点掉要留痕（谁、什么时候、按的哪个数）", src.indexOf("判过的.push({行:名") >= 0);
  ok("留痕跟订单一起存服务器", /判过的:\s+判过的\.slice\(\)/.test(src));
  ok("新开一单要清掉", src.indexOf("已处理={}; 判过的=[]") >= 0);
}

/* ══════ 省钱：有账就别再花一遍钱回头核 ★ ══════
   「回头核对」要把整批图重发一遍 = 这张单的钱翻倍。
   老板 2026-08-04：「我肯定要最便宜的方法。」
   所以只在【这张单没有校验码】时才自动核 —— 有合计的，账已经对过了。 */
{
  const src = scripts.join("\n");
  /* ★ 2026-08-04 改：原来是「有校验码就不核」，可【有校验码 ≠ 账对得上】。
     江云 8/4 那张有「总数量」列却 13≠14，正因为判成"账已对过"没去核，
     漏掉的 A859 那一段就这么过去了。现在改成：
       账对不上 / 有段没看清 → 自动只核那几行；全对得上又没看不清的才省这笔钱。 */
  ok("还认「有没有校验码」", src.indexOf("var 有账=ST.lines.some") >= 0);
  ok("★ 账对不上也要自动核（不是有校验码就不核）",
    src.indexOf("var 要核=!有账||对不上了||有没看清") >= 0);
  ok("★ 有段没看清也要自动核", src.indexOf("var 有没看清=ST.lines.some") >= 0);
  ok("★ 重核只点名有问题的那几行（不整单重读）",
    /只看下面点名的这几处/.test(src));
}

/* ══════ 真走一遍「传表 → 认表 → 读法本」★（2026-08-11）══════
   老板 8/11 第一次真用就卡死了：屏幕停在「只问 AI 哪列是什么…」不动，
   按钮还灰着，一句报错都没有 —— 因为 认表再摊平 是同步起头的，
   里面抛的异常让 runOcr 那个 async 函数静静地 reject 了。
   前面所有测试全绿，因为没有一个真的走过这条路。这一段就是补这个洞。

   用的是裕丰那张真表：【没有表头行，第一行就是货】，最右一列是点位号。 */
const 裕丰份 = [{ name: "裕丰.png", grid: [{ n: 1, rows: [
  ["大豆泡", "", "斤", "7", "218"],
  ["水豆腐", "5斤/板", "板", "3", "218"],
  ["千张", "", "斤", "3", "106"]] }] }];
const 假读法 = { 用第几张表: 1, 版式: "明细", 表头在第几行: 0,
  商品列: 1, 规格列: 2, 单位列: 3, 数量列: 4, 点位号列: 5 };

let 问了几次识别 = 0;
function 假识别() {
  问了几次识别++;
  return Promise.resolve({
    json: () => Promise.resolve({
      content: [{ type: "text", text: JSON.stringify(假读法) }],
      usage: { input_tokens: 900, output_tokens: 120 }
    })
  });
}

async function 跑读法本() {
  const T = win.__T;
  ok("★ 探针拿到了页面内部（拿不到说明这条路又测不着了）", !!T, win.__T探针出错 || "window.__T 是空的");
  if (!T) return;

  ok("★ 表样指纹算得出来，不许抛异常（8/11 卡死的就是这儿）",
    typeof T.表样指纹(裕丰份) === "string" && T.表样指纹(裕丰份).length > 3, T.表样指纹(裕丰份));

  const OV = T.拿OV();
  ok("开机时读法本这一格建好了", OV && typeof OV.读法本 === "object", JSON.stringify(OV && OV.读法本));

  /* ── 第一次：本子里没有，该问识别，问完该弹「对吗」 ── */
  win.fetch = 假识别;
  let 第一次出错 = null;
  try { T.认表跑一趟(裕丰份, "假密钥"); } catch (e) { 第一次出错 = e; }
  ok("★ 认表这一步不许抛出去（抛了页面就是死在那儿不动）", !第一次出错,
    第一次出错 && (第一次出错.message + "\n      " + String(第一次出错.stack || "").split("\n")[1]));
  await 等一轮();

  const msg1 = (EL["ocr-msg"] || {}).innerHTML || "";
  ok("问了一次识别", 问了几次识别 === 1, "问了 " + 问了几次识别 + " 次");
  ok("★ 屏幕上不许还停在「只问 AI 哪列是什么…」", !/只问 AI 哪列是什么/.test(msg1), msg1.slice(0, 160));
  ok("★ 识别按钮要放开（不放开人连重试都点不了）", EL["btn-ocr"] && EL["btn-ocr"].disabled === false);
  ok("★ 摊出来的货进了原文框（大豆泡 7 斤不许丢）",
    /大豆泡/.test(EL["raw"].value || "") && /7/.test(EL["raw"].value || ""),
    JSON.stringify((EL["raw"].value || "").slice(0, 120)));
  ok("★ 弹出了「我是这么读的，对吗」，两个按钮都在",
    /dfa-ok/.test(msg1) && /dfa-no/.test(msg1), msg1.slice(-260));
  /* ★ 老板 8/11：「这个问法太复杂了…这我不需要。」改成一行小字 + 两个小按钮。
     这几条钉住的是【别再变回去】—— 列号那一堆挪进「说明」页了，不许再摆在开单路上。 */
  ok("★ 问句里不许再摆版式/表头/第几列那一堆",
    !/版式/.test(msg1) && !/表头在第/.test(msg1) && !/第 1 列/.test(msg1), msg1.slice(-300));
  ok("★ 问句就一句话 + 记住/不用 两个小按钮",
    /记住它怎么读/.test(msg1) && /class="btn sm" id="dfa-ok"/.test(msg1) &&
    /class="btn ghost sm" id="dfa-no"/.test(msg1), msg1.slice(-300));
  ok("★ 上面那行只说读出多少货 + 下一步，不许再有 token 数和实现细节",
    /读出 \d+ 样货/.test(msg1) && !/token/.test(msg1) && !/照格子表读的/.test(msg1),
    msg1.slice(0, 240));
  ok("★ 没选客户时「下一步：选客户」要显眼（唯一要他动手的事）",
    /下一步：选客户/.test(msg1), msg1.slice(0, 240));

  /* ── 点「对，记住」 ── */
  let 点头出错 = null;
  try { EL["dfa-ok"].onclick(); } catch (e) { 点头出错 = e; }
  ok("★ 点「对，记住」不报错", !点头出错, 点头出错 && 点头出错.message);
  /* 老板 8/11：「我点记住了，它为什么还不消失？」—— 答完的问题不许还占着屏幕 */
  const msg点完 = (EL["ocr-msg"] || {}).innerHTML || "";
  ok("★ 点完窗要收起来（问句和两个按钮都不许再留着）",
    !/dfa-ok/.test(msg点完) && !/dfa-no/.test(msg点完) && !/我是这么读的/.test(msg点完),
    msg点完.slice(-300));
  ok("★ 收起之后留一行结论，别让人不知道点上没有",
    /记住了/.test(msg点完), msg点完.slice(-200));
  ok("★ 结论只出现一次，不许重复两句", (msg点完.match(/记住了/g) || []).length === 1,
    msg点完.slice(-260));
  const 本 = T.拿OV().读法本 || {};
  ok("★ 记进本子了", Object.keys(本).length === 1, JSON.stringify(Object.keys(本)));
  const 条 = 本[Object.keys(本)[0]] || {};
  ok("★ 存的是那份读法本身（表头=0 不许丢）", 条.读法 && 条.读法.表头在第几行 === 0, JSON.stringify(条.读法));
  ok("记了确认时间（人要看得见是什么时候点的头）", /^\d{4}-\d{2}-\d{2} /.test(条.确认于 || ""), 条.确认于);

  /* ── 第二次：同一张表再来，该走本子，一次识别都不许问 ── */
  EL["raw"].value = "";
  let 第二次出错 = null;
  try { T.认表跑一趟(裕丰份, "假密钥"); } catch (e) { 第二次出错 = e; }
  ok("第二次也不许抛", !第二次出错, 第二次出错 && 第二次出错.message);
  await 等一轮();
  ok("★ 第二次一次识别都没问（省的就是这笔钱）", 问了几次识别 === 1, "总共问了 " + 问了几次识别 + " 次");
  const msg2 = (EL["ocr-msg"] || {}).innerHTML || "";
  ok("★ 屏幕上说明白了这次没花钱", /照记住的读法，没花钱/.test(msg2), msg2.slice(0, 240));
  ok("★ 走本子那趟也不许再啰嗦（就一行）",
    !/版式/.test(msg2) && !/token/.test(msg2) && /读出 \d+ 样货/.test(msg2), msg2.slice(0, 240));
  ok("★ 给了「忘掉重认」的出口（读错了得有路走）", /dfa-redo/.test(msg2), msg2.slice(-200));
  ok("★ 走本子那趟货照样摊出来了", /大豆泡/.test(EL["raw"].value || ""),
    JSON.stringify((EL["raw"].value || "").slice(0, 120)));

  /* ── 换一张表样：不许串到裕丰那份读法上 ── */
  const 别家份 = [{ name: "别家.png", grid: [{ n: 1, rows: [
    ["序号", "商品名", "总数", "明细"],
    ["1", "大豆泡", "5斤", "(西樵派出所2-6)5斤"]] }] }];
  ok("★ 换一张表样，指纹不一样（一样就会串读法）",
    T.表样指纹(别家份) !== T.表样指纹(裕丰份));

  /* ── 本子里那份读法读不出货了（表改版）→ 自己忘掉、退回问识别 ── */
  const k = Object.keys(T.拿OV().读法本)[0];
  T.拿OV().读法本[k].读法 = { 用第几张表: 1, 版式: "明细", 商品列: 9, 数量列: 9 };  /* 指向不存在的列 */
  EL["raw"].value = "";
  try { T.认表跑一趟(裕丰份, "假密钥"); } catch (e) { ok("表改版那趟不许抛", false, e.message); }
  await 等一轮();
  ok("★ 本子上那份读不出货 → 忘掉它，别硬套出一张缺货的单",
    !T.拿OV().读法本[k], JSON.stringify(Object.keys(T.拿OV().读法本)));
  ok("★ 忘掉之后退回去问识别", 问了几次识别 === 2, "总共问了 " + 问了几次识别 + " 次");

  /* ── 炸了必须说出来，不许闷着 ──
     8/11 那次就是闷着：屏幕停住、按钮灰着、一句报错都没有，看着像网卡了。
     报错难看没关系，闷着不动才是最坏的 —— 人不知道该等还是该重点。 */
  EL["btn-ocr"].disabled = true;
  EL["ocr-msg"].innerHTML = "正在看这个表怎么读…";
  let 炸出来了 = null;
  try { T.认表跑一趟(null, "假密钥"); } catch (e) { 炸出来了 = e; }
  ok("★ 认表炸了不许把异常扔出去（扔出去就没人接，页面死在那儿）", !炸出来了,
    炸出来了 && 炸出来了.message);
  ok("★ 炸了要把按钮放开（不放开人连重试都点不了）", EL["btn-ocr"].disabled === false);
  ok("★ 炸了要在屏幕上说出来，不许还停在上一句",
    /出错/.test(EL["ocr-msg"].innerHTML || "") && !/正在看这个表怎么读/.test(EL["ocr-msg"].innerHTML || ""),
    (EL["ocr-msg"].innerHTML || "").slice(0, 200));

  /* ── 识别本身返回错误：以前这四条报错分支全都自己抛 ReferenceError ──
     （识别败了 写在 runOcr 肚子里，认表再摊平 是顶层函数，看不见它。）
     结果就是：认表这条路只要一失败，看到的就是「卡住了」。 */
  T.拿OV().读法本 = {};
  win.fetch = () => Promise.resolve({ json: () => Promise.resolve({ error: { message: "余额不足" } }) });
  EL["ocr-msg"].innerHTML = "正在看这个表怎么读…";
  EL["btn-ocr"].disabled = true;
  T.认表跑一趟(裕丰份, "假密钥");
  await 等一轮();
  ok("★ 识别返回错误时要说出来（以前这儿直接 ReferenceError，页面死掉）",
    /余额不足/.test(EL["ocr-msg"].innerHTML || ""), (EL["ocr-msg"].innerHTML || "").slice(0, 200));
  ok("★ 识别返回错误后按钮要放开", EL["btn-ocr"].disabled === false);

  /* ── 读法摊不出货：另一条以前也是 ReferenceError 的分支 ── */
  win.fetch = () => Promise.resolve({
    json: () => Promise.resolve({ content: [{ type: "text", text: JSON.stringify({ 用第几张表: 9, 版式: "明细", 商品列: 1 }) }] })
  });
  EL["btn-ocr"].disabled = true;
  T.认表跑一趟(裕丰份, "假密钥");
  await 等一轮();
  ok("★ 按识别说的读法摊不出货，要说出来而不是卡住",
    /摊不出货来|没看懂/.test(EL["ocr-msg"].innerHTML || ""), (EL["ocr-msg"].innerHTML || "").slice(0, 200));
  ok("★ 摊不出货之后按钮也要放开", EL["btn-ocr"].disabled === false);
  ok("★ 摊不出货的表不许被记进本子", Object.keys(T.拿OV().读法本 || {}).length === 0,
    JSON.stringify(Object.keys(T.拿OV().读法本 || {})));
}

/* ══════ 矩阵表：「这一排是什么」问完，还要接着问「读法对吗」★（2026-08-11）══════
   收尾() 是 8/11 重构出来的：本子那条路和识别那条路共用它。
   重构最容易断的就是【问完这一排之后，后面那一步还接不接得上】。 */
async function 跑矩阵问一排() {
  const T = win.__T;
  if (!T) return;
  T.拿OV().读法本 = {};
  const 矩阵份 = [{ name: "矩阵.png", grid: [{ n: 1, rows: [
    ["商品", "8-1", "8-2", "8-3"],
    ["千张", "3", "2", "1"]] }] }];
  win.fetch = () => Promise.resolve({
    json: () => Promise.resolve({
      content: [{ type: "text", text: JSON.stringify({
        用第几张表: 1, 版式: "矩阵", 表头在第几行: 1, 商品列: 1,
        横轴从第几列开始: 2, 横轴到第几列: 4, 数据从第几行开始: 2, 数据到第几行: 2 }) }],
      usage: { input_tokens: 100, output_tokens: 20 }
    })
  });
  EL["raw"].value = "";
  let 出错 = null;
  try { T.认表跑一趟(矩阵份, "假密钥"); } catch (e) { 出错 = e; }
  ok("矩阵那趟不许抛", !出错, 出错 && 出错.message);
  await 等一轮();
  const msg = (EL["ocr-msg"] || {}).innerHTML || "";
  const 问了 = /pai-dw/.test(msg);
  ok("★「8-1 8-2 8-3」这种要停下来问「这一排是什么」，不许替人猜", 问了, msg.slice(0, 200));
  if (问了) {
    let 点出错 = null;
    try { EL["pai-dw"].onclick(); } catch (e) { 点出错 = e; }
    ok("★ 点「点位」不报错", !点出错, 点出错 && 点出错.message);
    await 等一轮();
    const msg2 = (EL["ocr-msg"] || {}).innerHTML || "";
    ok("★ 答完这一排，货要摊出来", /千张/.test(EL["raw"].value || ""),
      JSON.stringify((EL["raw"].value || "").slice(0, 100)));
    ok("★ 答完这一排，还要接着问「读法对吗」（重构最容易断在这儿）",
      /dfa-ok/.test(msg2), msg2.slice(-260));
  }
}

/* ══════ 全局兜底：promise 里的错不许闷声不响 ★（2026-08-11）══════
   页面里到处是 promise（存单、调历史单、识别、跟服务器对账）。
   promise 里抛的错【不会触发 error 事件】—— 以前页面只接了 error，
   所以那些错全都无声无息：屏幕不动、按钮不响应，看着像卡住。
   一个个补 .catch 会漏，所以顶上加了一张网。这里验它真的在。 */
{
  const H1 = win._winHandlers || {};
  ok("★ 接了 error（老的，别弄丢了）", (H1["error"] || []).length > 0);
  ok("★ 接了 unhandledrejection（新的网 —— 没它 promise 出错就是闷声不响）",
    (H1["unhandledrejection"] || []).length > 0,
    "window 上挂的事件：" + Object.keys(H1).join(", "));

  /* 真触发一次，看红条亮不亮 */
  if ((H1["unhandledrejection"] || []).length) {
    if (EL["jserr"]) EL["jserr"].textContent = "";
    let 抛了 = null;
    try { H1["unhandledrejection"][0]({ reason: new Error("假装某个 promise 炸了") }); }
    catch (e) { 抛了 = e; }
    ok("★ 触发时兜底自己不许再炸", !抛了, 抛了 && 抛了.message);
    const d = EL["jserr"];
    ok("★ 真亮红条了，而且写清了「刚才那个动作多半没做成」",
      d && /没人接住/.test(d.textContent || "") && /假装某个 promise 炸了/.test(d.textContent || ""),
      d && JSON.stringify(d.textContent));
    if (d) d.textContent = "";       /* 擦干净，别影响后面「没弹红条」那两项 */
  }
}

/* ══════ 存单/打印/调历史单：出错要说出来 ★（2026-08-11）══════ */
{
  const src = scripts.join("\n");
  ok("★ 确定订单那条链接住了错（不然人不知道单存没存进去）",
    /ordSave\(\)\.then[\s\S]{0,1600}?\.catch\(function\(e\)\{[\s\S]{0,300}?这一单没存成/.test(src),
    "确定订单 没有 .catch");
  ok("★ 打印/导出前存单那条也接住了", /存单出错了，没给你打印/.test(src));
  ok("★ 调历史单接住了", /调不出这张单/.test(src));
  ok("★ 展开明细接住了", /展不开这张单的明细/.test(src));
}

/* ══════ runOcr 是 async：它的 promise 必须有人接 ★（2026-08-11）══════
   三个调它的地方以前一个都没接 —— 里面随便哪儿抛一下，
   promise 静静地 reject，按钮灰着、屏幕不动、控制台以外一个字都没有。 */
{
  const src = scripts.join("\n");
  ok("★ 按钮挂的是带兜底的 跑识别，不是裸 runOcr",
    /addEventListener\("click",跑识别\)/.test(src) && !/addEventListener\("click",runOcr\)/.test(src),
    "还有地方直接把 runOcr 挂上去了");
  ok("★ 跑识别 真的接住了 reject（有 .catch）",
    /function 跑识别\(\)[\s\S]{0,300}p\.catch\(/.test(src), "跑识别 里没有 .catch —— 等于没接");
  /* 把「函数定义那一行」和「跑识别 里唯一那次 p=runOcr()」去掉，剩下的都是漏网的裸调用 */
  const 剩 = src.replace(/async function runOcr\(\)/g, "").replace(/p\s*=\s*runOcr\(\)/g, "");
  ok("★ 除了 跑识别 内部，别处不许再裸调 runOcr()",
    (剩.match(/runOcr\(\)/g) || []).length === 0,
    "还有裸调用：" + JSON.stringify((剩.match(/.{40}runOcr\(\)/g) || []).join(" ⏐ ")));
  ok("炸了的提示里要告诉人下一步怎么办", /再点一次识别/.test(src));
}

/* ══════ 有没有弹出红色报错条 ══════ */
ok("没有触发页面顶部的红色报错条", !EL["jserr"] || !EL["jserr"].textContent,
  EL["jserr"] && EL["jserr"].textContent);
ok("开机过程中没弹 alert", win._alerts.length === 0, win._alerts.join(" | "));

等一轮().then(跑读法本).then(等一轮).then(跑矩阵问一排).then(等一轮).then(() => {
  ok("连不上后端时优雅退回本机（不抛错、有提示）",
    /本机/.test((EL["ord-where"] || {}).textContent || ""),
    "ord-where = " + JSON.stringify((EL["ord-where"] || {}).textContent));
  ok("退回本机之后也没弹红条", !EL["jserr"] || !EL["jserr"].textContent,
    EL["jserr"] && EL["jserr"].textContent);
  L("");
  L(fail ? ("有 " + fail + " 项没过（通过 " + pass + " 项）") : ("全部通过：" + pass + " 项"));
  process.exit(fail ? 1 : 0);
});
