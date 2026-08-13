/* 订单记录 —— 存得进、编号不撞、调得出
   node 测试-订单记录.js

   两头都测：
     · 前端：从 配送开单台.html 里抠 ordLocalNo / ordPack 出来跑（不另抄一份）
     · 后端：真起一个 后端-server.js 子进程，用 HTTP 打它，打完杀掉

   为什么值得单独测：单号原来写死 "-01"，一天开十张单全叫同一个号，
   而这种错在页面上完全看不出来 —— 打印出来是好的，回头对账才发现。 */
const fs = require("fs"), path = require("path"), http = require("http");
const { spawn } = require("child_process");
const os = require("os");

let pass = 0, fail = 0;
const L = s => process.stdout.write(Buffer.from(s + "\n", "utf8"));
function ok(name, got, want) {
  const g = JSON.stringify(got), w = JSON.stringify(want);
  if (g === w) { pass++; }
  else { fail++; L("  ✗ " + name + "\n      应该 " + w + "\n      实际 " + g); }
}

/* ═══════════ 一、前端：本机兜底的编号 ═══════════ */
const H = fs.readFileSync(path.join(__dirname, "配送开单台.html"), "utf8");
function grab(name) {
  const i = H.indexOf("function " + name + "(");
  if (i < 0) throw new Error("页面里找不到 " + name + "（改名了？）");
  let d = 0;
  for (let k = H.indexOf("{", i); k < H.length; k++) {
    if (H[k] === "{") d++;
    else if (H[k] === "}") { d--; if (!d) return H.slice(i, k + 1); }
  }
  throw new Error(name + " 括号不闭合");
}

let STORE = "[]";
const localStorage = {
  getItem: () => STORE,
  setItem: (k, v) => { STORE = v; }
};
const src = grab("ordLocalAll") + "\n" + grab("ordLocalPut") + "\n" + grab("ordLocalNo");
const FE = new Function("localStorage",
  src + "\nreturn {all:ordLocalAll, put:ordLocalPut, no:ordLocalNo};")(localStorage);

L("── 前端·本机编号 ──");
ok("第一张是 -01", FE.no("2026-08-01"), "XS20260801-01");
FE.put({ order_no: "XS20260801-01", order_date: "2026-08-01" });
ok("存过一张之后是 -02", FE.no("2026-08-01"), "XS20260801-02");
FE.put({ order_no: "XS20260801-02", order_date: "2026-08-01" });
FE.put({ order_no: "XS20260801-03", order_date: "2026-08-01" });
ok("存过三张之后是 -04", FE.no("2026-08-01"), "XS20260801-04");
ok("换一天重新从 -01 起", FE.no("2026-08-02"), "XS20260802-01");
ok("倒回前一天也不受影响", FE.no("2026-07-31"), "XS20260731-01");
/* 乱序存进来（-03 先于 -02）时也要接着最大的往下发 */
STORE = "[]";
FE.put({ order_no: "XS20260801-05", order_date: "2026-08-01" });
FE.put({ order_no: "XS20260801-02", order_date: "2026-08-01" });
ok("按最大号往下发，不是按条数", FE.no("2026-08-01"), "XS20260801-06");

/* ═══════════ 二、后端：真起一个服务器打它 ═══════════ */
const DATA = fs.mkdtempSync(path.join(os.tmpdir(), "kdtest-"));
/* ★ 2026-08-09：别再抢 8788 那个固定端口。
   吃过一次亏：上一次跑完服务器没杀干净，一直占着 8788。
   这一次起的绑不上端口就悄悄死了，可测试照样往 127.0.0.1:8788 打 ——
   打的是那台残留的、装着几十张单的服务器，「三张都在」变成「55」，
   后端整段红得莫名其妙，其实代码好好的；反过来它要是碰巧答对了，就是【假绿】。
   现在每次自己挑一个当下空着的端口，谁也不碍着谁。 */
const PORT = 20000 + (process.pid % 20000);
const srv = spawn(process.execPath, [path.join(__dirname, "后端-server.js")],
  { env: Object.assign({}, process.env, { KAIDAN_DATA: DATA, KAIDAN_PORT: String(PORT) }), stdio: "ignore" });
/* 测试自己中途死了也得把服务器带走，不然下一次又是这一出 */
["exit", "SIGINT", "SIGTERM", "uncaughtException"].forEach(e =>
  process.on(e, () => { try { srv.kill(); } catch (x) { } }));

const req = (m, p, b) => new Promise((res, rej) => {
  const d = b ? Buffer.from(JSON.stringify(b), "utf8") : null;
  const r = http.request({
    host: "127.0.0.1", port: PORT, path: p, method: m,
    headers: d ? { "content-type": "application/json; charset=utf-8", "content-length": d.length } : {}
  }, x => {
    const cs = [];
    x.on("data", c => cs.push(c));
    x.on("end", () => {
      try { res({ status: x.statusCode, json: JSON.parse(Buffer.concat(cs).toString("utf8")) }); }
      catch (e) { rej(new Error("回的不是 JSON：" + Buffer.concat(cs).toString("utf8").slice(0, 120))); }
    });
  });
  r.on("error", rej);
  if (d) r.write(d);
  r.end();
});

const waitUp = async () => {
  for (let i = 0; i < 40; i++) {
    try { await req("GET", "/api/health"); return true; }
    catch (e) { await new Promise(r => setTimeout(r, 100)); }
  }
  throw new Error("后端 3 秒内没起来");
};

const ORDER = (cid, name, date, amt) => ({
  customer_id: cid, customer_name: name, order_date: date,
  total_qty: 1, total_amount: amt, created_by: "谭彩萍",
  raw: name + " 要 1 板",
  lines: [{ i: 1, name: "尝元小板豆腐（5斤）", unit: "板", qty: 1, price: amt, amount: amt, ok: true }]
});

(async () => {
  try {
    await waitUp();
    /* 换了空端口还不够 —— 再确认一句：答话的确实是【我们刚起的这一台】。
       我们的数据目录是刚开的空临时目录，所以订单必须是 0 条。
       不是 0，就说明打到别人家去了，那测出来的绿也是假绿，宁可不测。 */
    {
      const 开局 = await req("GET", "/api/orders");
      const n = ((开局.json && 开局.json.rows) || []).length;
      if (n !== 0) {
        L("  ✗ " + PORT + " 上答话的不是我们刚起的那台服务器（它手里有 " + n + " 张单，我们的应该是 0 张）");
        L("      别人占着这个端口。测出来的结果不作数，先查清楚：");
        L("      netstat -ano | findstr :" + PORT + "　→　taskkill /PID <号> /F");
        srv.kill();
        try { fs.rmSync(DATA, { recursive: true, force: true }); } catch (e) { }
        process.exit(1);
      }
    }
    L("");
    L("── 后端·发号 ──");
    const a = await req("POST", "/api/orders", ORDER("S2934", "轩宝", "2026-08-01", 6.85));
    ok("第一张 -01", a.json.order_no, "XS20260801-01");
    const b = await req("POST", "/api/orders", ORDER("S4317", "雅食乐", "2026-08-01", 6));
    ok("同一天第二张 -02（原来永远是 -01）", b.json.order_no, "XS20260801-02");
    const c = await req("POST", "/api/orders", ORDER("S2977", "惠丰", "2026-07-31", 5.5));
    ok("补昨天的单，号跟着单据日期走", c.json.order_no, "XS20260731-01");

    L("");
    L("── 后端·查得回来 ──");
    const all = (await req("GET", "/api/orders")).json;
    ok("三张都在", all.rows.length, 3);
    const q1 = (await req("GET", "/api/orders?q=" + encodeURIComponent("雅食乐"))).json;
    ok("按中文客户名搜得到", q1.rows.map(r => r.order_no), ["XS20260801-02"]);
    const q2 = (await req("GET", "/api/orders?q=S2934")).json;
    ok("按客户编号搜得到", q2.rows.map(r => r.order_no), ["XS20260801-01"]);
    const q3 = (await req("GET", "/api/orders?from=2026-08-01&to=2026-08-01")).json;
    ok("按日期滤，7/31 那张不该出现", q3.rows.length, 2);

    const one = (await req("GET", "/api/orders/XS20260801-01")).json;
    ok("调得出单张", one.order.order_no, "XS20260801-01");
    ok("客户名没串码", one.order.customer_name, "轩宝");
    ok("原文留住了（将来照着再开一单要用）", one.order.raw, "轩宝 要 1 板");
    ok("开单人留住了", one.order.created_by, "谭彩萍");
    ok("明细行还在", one.order.lines.length, 1);

    L("");
    L("── 后端·该拦的要拦住 ──");
    const e1 = await req("POST", "/api/orders", { customer_id: "S2934", lines: [] });
    ok("空单不给存", e1.status, 400);
    const e2 = await req("POST", "/api/orders", { lines: [{ i: 1 }] });
    ok("没客户编号不给存", e2.status, 400);
    const e3 = await req("GET", "/api/orders/XS29991231-99");
    ok("查不存在的单返回 404", e3.status, 404);
    const after = (await req("GET", "/api/orders")).json;
    ok("被拦下的没混进记录里", after.rows.length, 3);

    L("");
    L("── 后端·自带的单号优先 ──");
    const f = await req("POST", "/api/orders",
      Object.assign(ORDER("S2934", "轩宝", "2026-08-01", 9), { order_no: "XS20260801-99" }));
    ok("前端已经有号就用它，不重新发", f.json.order_no, "XS20260801-99");

    L("");
    L("── 后端·调出来改了再存，是覆盖不是新增 ──");
    /* 「调出来改」会用同一个单号再存一次。文件只追加（并发安全），
       读的时候同号只认最新那条 —— 列表里必须还是一张单。 */
    const before = (await req("GET", "/api/orders")).json.rows.length;
    await req("POST", "/api/orders",
      Object.assign(ORDER("S2934", "轩宝", "2026-08-01", 66), { order_no: "XS20260801-01" }));
    const after2 = (await req("GET", "/api/orders")).json;
    ok("单数没变多", after2.rows.length, before);
    ok("列表里是改过的金额", after2.rows.find(r => r.order_no === "XS20260801-01").total_amount, 66);
    const v = (await req("GET", "/api/orders/XS20260801-01")).json.order;
    ok("调单张也是最新那版", v.total_amount, 66);

    L("");
    L("── 后端·手动加的行能原样存回来 ──");
    const g = await req("POST", "/api/orders", {
      customer_id: "S2934", customer_name: "轩宝", order_date: "2026-08-01",
      total_qty: 2, total_amount: 20, raw: "千张 1斤",
      lines: [
        { i: 1, name: "千张", unit: "斤", qty: 1, price: 6, amount: 6, ok: true, manual: false, sku: "A1" },
        { i: 2, name: "电话补的", unit: "板", qty: 1, price: 14, amount: 14, ok: true, manual: true, sku: "B2" }
      ]
    });
    const back = (await req("GET", "/api/orders/" + g.json.order_no)).json.order;
    ok("手动那一行的 manual 标记留住了", back.lines[1].manual, true);
    ok("手动那一行的 sku 留住了（重开时靠它找回来）", back.lines[1].sku, "B2");
  } catch (e) {
    fail++; L("  ✗ 后端测试炸了：" + (e && e.message));
  } finally {
    srv.kill();
    try { fs.rmSync(DATA, { recursive: true, force: true }); } catch (e) { }
    L("");
    L(fail ? ("有 " + fail + " 项没过（通过 " + pass + " 项）") : ("全部通过：" + pass + " 项"));
    process.exit(fail ? 1 : 0);
  }
})();
