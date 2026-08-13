/* 学到的东西存不存得住 —— node 测试-学习存服务器.js

   老板 2026-08-02：「我已学会的，为什么再次识别订单又要再学？从根本上解决掉。」

   根子：订单记录早就上服务器了，学到的对照却只写在这台浏览器的 localStorage 里。
   换台电脑、换个浏览器、清一次缓存 —— 全归零，从「已学会」打回「存疑」。

   这里测的是那条链路本身，不是函数：
     A 电脑教会 → 推服务器 → B 电脑开页面 → 不用再教
     A 电脑忘掉 → 推服务器 → B 电脑开页面 → 不会又拉回来（不然「忘掉重学」等于白做）
     忘掉之后重教 → 两边最后都是新的那个

   服务器那半边直接跑 后端-server.js 里的真函数，不另抄一份。 */
const fs = require("fs"), path = require("path");

let pass = 0, fail = 0;
const L = s => process.stdout.write(Buffer.from(s + "\n", "utf8"));
function ok(name, got, want) {
  if (JSON.stringify(got) === JSON.stringify(want)) { pass++; L("  ✅ " + name); }
  else { fail++; L("  ❌ " + name + "\n      应该 " + JSON.stringify(want) + "\n      实际 " + JSON.stringify(got)); }
}

/* ---- 服务器那半边：把 后端-server.js 里的真东西抠出来 ---- */
const S = fs.readFileSync(path.join(__dirname, "后端-server.js"), "utf8");
function grabSrv(head) {
  const i = S.indexOf(head);
  if (i < 0) throw new Error("后端里找不到 " + head + "（改名了？）");
  let d = 0;
  for (let k = S.indexOf("{", i); k < S.length; k++) {
    if (S[k] === "{") d++;
    else if (S[k] === "}") { d--; if (!d) return S.slice(i, k + 1); }
  }
  throw new Error(head + " 括号不闭合");
}
const EMPTY_OV_SRC = S.slice(S.indexOf("const EMPTY_OV ="), S.indexOf("\n", S.indexOf("const EMPTY_OV =")));
const srv = new Function(EMPTY_OV_SRC + "\n" + grabSrv("function mergeOverlay(") +
  "\nreturn {EMPTY_OV:EMPTY_OV, mergeOverlay:mergeOverlay};")();

/* ---- 假服务器：只管存一份 + 版本号，逻辑用真的 ---- */
const 服务器 = { version: 0, data: Object.assign({}, srv.EMPTY_OV) };
function POST(body) {
  const clientVer = (body.version === undefined || body.version === null) ? -1 : +body.version;
  const merged = (clientVer === 服务器.version)
    ? Object.assign({}, srv.EMPTY_OV, body.data)          /* 版本对得上 → 客户端整份说了算 */
    : srv.mergeOverlay(服务器.data, body.data);           /* 中间被别人改过 → 合并 */
  服务器.version += 1;
  服务器.data = merged;
  return { ok: true, version: 服务器.version, merged: clientVer !== (服务器.version - 1), data: 服务器.data };
}
function GET() { return { ok: true, version: 服务器.version, data: JSON.parse(JSON.stringify(服务器.data)) }; }

/* ---- 客户端那半边：把页面里的 ovAdopt / ovForget 抠出来 ---- */
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

/* 一台电脑 = 一份 OV + 页面那两个函数 */
function 电脑(名) {
  const OV = { maps: {}, gmap: {}, mem: {}, spots: [], gone: {}, dirty: {} };
  const api = new Function("OV",
    grab("ovTouch") + "\n" + grab("ovForget") + "\n" + grab("ovAdopt") +
    "\nreturn {ovTouch:ovTouch, ovForget:ovForget, ovAdopt:ovAdopt};")(OV);
  let ver = null;
  return {
    名, OV,
    教(key, sku) { OV.maps[key] = sku; delete OV.gone["maps|" + key]; api.ovTouch("maps", key); },
    忘(key) { delete OV.maps[key]; api.ovForget("maps", key); },
    会不会(key) { return OV.maps[key] || "不会"; },
    /* 页面上的 ovSync：先把服务器那份合进来，再把本地推上去 */
    开页面() { const j = GET(); ver = j.version; api.ovAdopt(j.data); this.推(); },
    推() { const j = POST({ version: ver, data: OV }); ver = j.version; OV.dirty = {}; if (j.merged) api.ovAdopt(j.data); }
  };
}

L("── ① 这台教会了，那台开页面就该认得 ──");
const A = 电脑("A"), B = 电脑("B");
A.开页面();
A.教("S3002||板||阳山水豆腐", "D8794277");
A.教("S3002||斤||小豆泡", "D3033600");
A.推();
B.开页面();
ok("B 电脑不用再教「阳山水豆腐」", B.会不会("S3002||板||阳山水豆腐"), "D8794277");
ok("B 电脑不用再教「小豆泡」", B.会不会("S3002||斤||小豆泡"), "D3033600");

L("");
L("── ② 两台各教各的，谁教的都不丢 ──");
A.教("S3002||斤||大豆泡", "D3033599");
B.教("S3002||板||老豆腐", "D3033528");
A.推(); B.推();
A.开页面(); B.开页面();
ok("A 也有 B 教的老豆腐", A.会不会("S3002||板||老豆腐"), "D3033528");
ok("B 也有 A 教的大豆泡", B.会不会("S3002||斤||大豆泡"), "D3033599");

L("");
L("── ③ 忘掉重学：忘掉的不许被同步拉回来 ──");
/* 这条不做的话，「教错了能改回来」就是白做的：
   本地删了、服务器还留着，下次开页面又拉回来，错的答案阴魂不散。 */
A.忘("S3002||斤||小豆泡");
A.推();
ok("A 自己忘掉了", A.会不会("S3002||斤||小豆泡"), "不会");
A.开页面();
ok("A 再开页面，没被服务器拉回来", A.会不会("S3002||斤||小豆泡"), "不会");
B.开页面();
ok("B 那台也跟着忘掉了", B.会不会("S3002||斤||小豆泡"), "不会");

L("");
L("── ④ 忘掉之后重教，两台最后都是新的那个 ──");
A.教("S3002||斤||小豆泡", "D9999999");
A.推();
ok("A 是新的", A.会不会("S3002||斤||小豆泡"), "D9999999");
A.开页面();
ok("A 再开页面还是新的（旧的忘掉名单不许再删它）", A.会不会("S3002||斤||小豆泡"), "D9999999");
B.开页面();
ok("B 拿到的也是新的", B.会不会("S3002||斤||小豆泡"), "D9999999");

L("");
L("── ⑤ 断网时教的，连上就补推 ──");
const C = 电脑("C");
C.开页面();
C.教("S3002||斤||千张", "D2866496");     /* 假装这几步没网，只在本机 */
C.教("S3002||包||香干", "D5555555");
C.开页面();                              /* 网回来了，开一次页面 */
B.开页面();
ok("B 拿到断网时教的千张", B.会不会("S3002||斤||千张"), "D2866496");
ok("B 拿到断网时教的香干", B.会不会("S3002||包||香干"), "D5555555");
ok("C 自己的也没被服务器盖掉", C.会不会("S3002||斤||千张"), "D2866496");

L("");
L("── ⑥ 忘掉名单不许无限长 ──");
const D2 = 电脑("D");
for (let i = 0; i < 900; i++) D2.忘("S9999||斤||词" + i);
ok("本机忘掉名单封顶 800", Object.keys(D2.OV.gone).length <= 800, true);
D2.开页面();
ok("服务器上的也封顶 800", Object.keys(服务器.data.gone).length <= 800, true);

L("");
L("── ⑦ 读法本（这张表怎么读）不许在合并时被抹掉 ★2026-08-11 ──");
/* mergeOverlay 里的 out 是【白名单】：漏列一个字段，两台电脑一撞版本就整份没了，
   人还以为是自己没确认过。读法本尤其要命 —— 没了就退回「每传一次表重问一次识别」，
   而且没有任何提示。 */
{
  const 甲 = { 读法本: { "5×WWQNN": { 读法: { 版式: "明细", 表头在第几行: 0, 商品列: 1, 数量列: 4 },
                                      确认于: "2026-08-11 09:00", 客户: "裕丰" } } };
  const 乙 = { 读法本: { "4×NWQS": { 读法: { 版式: "明细", 表头在第几行: 1, 分布列: 4 },
                                     确认于: "2026-08-11 10:00", 客户: "朱鲜生" } } };
  const 合 = srv.mergeOverlay(Object.assign({}, srv.EMPTY_OV, 甲),
                              Object.assign({}, srv.EMPTY_OV, 乙));
  ok("EMPTY_OV 里有读法本这一格", Array.isArray(合.读法本) === false && !!合.读法本, true);
  ok("★ 两台电脑各认了一张表，合完两张都在",
    Object.keys(合.读法本 || {}).sort(), ["4×NWQS", "5×WWQNN"]);
  ok("★「表头在第0行」= 没有表头，合并不许把它弄丢或变成 1",
    合.读法本["5×WWQNN"].读法.表头在第几行, 0);

  /* 同一张表改版了重认 —— 后确认的那份说了算 */
  const 旧 = { 读法本: { "同一张": { 读法: { 数量列: 4 }, 确认于: "2026-08-01 09:00" } } };
  const 新 = { 读法本: { "同一张": { 读法: { 数量列: 6 }, 确认于: "2026-08-11 09:00" } } };
  const 合2 = srv.mergeOverlay(Object.assign({}, srv.EMPTY_OV, 旧),
                               Object.assign({}, srv.EMPTY_OV, 新));
  ok("同一张表重认过，听后确认的那份", 合2.读法本["同一张"].读法.数量列, 6);
}

L("");
L(fail ? ("有 " + fail + " 项没过（通过 " + pass + " 项）") : ("全部通过：" + pass + " 项"));
process.exit(fail ? 1 : 0);
