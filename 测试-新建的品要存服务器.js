/* 新建的品 / 改过的价，要真存到服务器 —— node 测试-新建的品要存服务器.js

   老板 2026-08-18 撞到的那个洞：
     「＋ 库里没有，新建」建的品，只活在那一台浏览器里 —— 服务器名单里压根没这个字段。
     可「客户这么叫 → 那个新品」的对照【会】上服务器。
     词上了云，货没上云 → 换台电脑打开，对照指着一个不存在的商品，
     那行退回「存疑」，界面还亮着「忘掉重学」，看着像学过了。
     线上已经攒了 4 条这种死键（轩宝「云元韧豆腐」→ XS2934-…）。

   这里演的就是他真实的场景：两台电脑共用一份。
     A 台建了个品、改了个价 → 推上去
     B 台开页面 → 必须拿得到，配得上货

   考的是【后端的合并】和【页面的收下】这两头，缺一头就等于没同步。 */
const path = require("path");
let pass = 0, fail = 0;
const L = s => process.stdout.write(Buffer.from(s + "\n", "utf8"));
function ok(name, got, want) {
  const a = JSON.stringify(got), b = JSON.stringify(want);
  if (a === b) pass++;
  else { fail++; L("  ✗ " + name + "\n      应该 " + b + "\n      实际 " + a); }
}

/* ───── 后端那头：把 mergeOverlay 抠出来跑 ───── */
const fs = require("fs");
const S = fs.readFileSync(path.join(__dirname, "后端-server.js"), "utf8");
function 抠(name) {
  const i = S.indexOf("function " + name + "(");
  if (i < 0) throw new Error("后端里找不到 " + name + "（改名了？）");
  let d = 0;
  for (let k = S.indexOf("{", i); k < S.length; k++) {
    if (S[k] === "{") d++;
    else if (S[k] === "}") { d--; if (!d) return S.slice(i, k + 1); }
  }
  throw new Error(name + " 括号不闭合");
}
const mergeOverlay = new Function(抠("mergeOverlay") + "; return mergeOverlay;")();

const 空 = () => ({ maps: {}, gmap: {}, mem: {}, spots: [], gone: {}, spotbook: {}, 排名单: {}, 切法: [], 读法本: {}, px: {}, padd: {}, plog: [] });

L("═══ 后端：新建的品、改的价，收不收 ═══");

const A = Object.assign(空(), {
  padd: { S2947: [{ prod: "云元韧豆腐", alias: "云元韧豆腐", unit: "板", price: 9.5, spec: "", sku: "XS2947-111-1" }] },
  px: { S2947: { D3042078: { p: 7.7 } } },
  plog: [{ t: "2026-08-18 10:00", who: "A台", cid: "S2947", name: "老豆腐", what: "改价", from: "7.00", to: "7.70" }],
  maps: { "S2947||板||云元韧豆腐": "XS2947-111-1" }
});
(function () {
  const 后 = mergeOverlay(空(), A);
  ok("新建的品存下来了", (后.padd.S2947 || []).length, 1);
  ok("存的是那个 sku", (后.padd.S2947 || [])[0].sku, "XS2947-111-1");
  ok("改的价存下来了", 后.px.S2947.D3042078.p, 7.7);
  ok("留痕存下来了", 后.plog.length, 1);
  ok("对照照旧", 后.maps["S2947||板||云元韧豆腐"], "XS2947-111-1");
  /* 这一条是整个洞的要害：词进去了，货也得进去 */
  const 有货 = (后.padd.S2947 || []).some(x => x.sku === 后.maps["S2947||板||云元韧豆腐"]);
  ok("★ 词指着的那个货，服务器上真有（不再是死键）", 有货, true);
})();

L("");
L("═══ 后端：两台电脑各建各的，谁的都不许丢 ═══");
(function () {
  const B = Object.assign(空(), {
    padd: { S2947: [{ prod: "B台建的", alias: "B台建的", unit: "斤", price: 3, spec: "", sku: "XS2947-222-2" }] },
    px: { S2947: { D3042109: { p: 1.2 } } }
  });
  const 一轮 = mergeOverlay(空(), A);
  const 两轮 = mergeOverlay(一轮, B);
  ok("两台建的品都在", (两轮.padd.S2947 || []).map(x => x.sku).sort(), ["XS2947-111-1", "XS2947-222-2"]);
  ok("两台改的价都在", [两轮.px.S2947.D3042078.p, 两轮.px.S2947.D3042109.p], [7.7, 1.2]);
  /* 同一个品推两次，不许变成两条 */
  const 三轮 = mergeOverlay(两轮, A);
  ok("同一个品推两次不重复", (三轮.padd.S2947 || []).length, 2);
  ok("同一条留痕推两次不重复", 三轮.plog.length, 1);
})();

L("");
L("═══ 后端：门店名单（同一个洞，8/18 顺手补的）═══");
(function () {
  const A2 = Object.assign(空(), { shops: { S12738: ["八部"] } });
  const B2 = Object.assign(空(), { shops: { S12738: ["九部"], S2947: ["总店"] } });
  const 后 = mergeOverlay(mergeOverlay(空(), A2), B2);
  /* ⚠ 别拿 sort() 比中文 —— JS 按字符码排，「九」排在「八」前面，
     期望值写成人眼顺序就会假报错（2026-08-18 我自己踩了一次）。按「在不在」比。 */
  const 店 = 后.shops.S12738 || [];
  ok("两台各填的店都在", [店.length, 店.indexOf("八部") >= 0, 店.indexOf("九部") >= 0], [2, true, true]);
  ok("别家的店也在", 后.shops.S2947, ["总店"]);
  ok("同一家推两次不重复", (mergeOverlay(后, A2).shops.S12738 || []).length, 2);
})();

L("");
L("═══ 后端：把价「还原成观麦的」，不许被服务器又拉回来 ═══");
(function () {
  const 有价 = mergeOverlay(空(), A);
  const 还原 = Object.assign(空(), { gone: { "px|S2947|D3042078": 1 } });
  const 后 = mergeOverlay(有价, 还原);
  ok("还原掉的价真没了", (后.px.S2947 || {}).D3042078, undefined);
  ok("别人建的品没被误伤", (后.padd.S2947 || []).length, 1);
})();

L("");
L("═══ 页面那头：服务器传回来的，收不收得下 ═══");
/* 把页面里的 ovAdopt 抠出来跑。它依赖的东西用假的顶上，
   只考「有没有把 padd/px/plog 收进来」。 */
(function () {
  const H = fs.readFileSync(path.join(__dirname, "配送开单台.html"), "utf8");
  const i = H.indexOf("function ovAdopt(");
  if (i < 0) { fail++; L("  ✗ 页面里找不到 ovAdopt"); return; }
  let d = 0, src = "";
  for (let k = H.indexOf("{", i); k < H.length; k++) {
    if (H[k] === "{") d++;
    else if (H[k] === "}") { d--; if (!d) { src = H.slice(i, k + 1); break; } }
  }
  const OV = { maps: {}, gmap: {}, mem: {}, spots: [], gone: {}, dirty: {}, spotbook: {}, px: {}, padd: {}, plog: [], shops: {}, 切法: [], 排名单: {}, 读法本: {} };
  let 重建过 = 0;
  const 假 = { applyAdd: () => 重建过++, applyPX: () => { }, buildIndex: () => { }, window: {} };
  const ovAdopt = new Function("OV", "applyAdd", "applyPX", "buildIndex", "window",
    src + "; return ovAdopt;")(OV, 假.applyAdd, 假.applyPX, 假.buildIndex, 假.window);

  const 服务器那份 = mergeOverlay(空(), Object.assign({}, A, { shops: { S2947: ["总店", "分店"] } }));
  ovAdopt(服务器那份);
  ok("★ 换台电脑：门店名单收下来了", (OV.shops.S2947 || []).sort(), ["分店", "总店"]);
  ok("★ 换台电脑：新建的品收下来了", (OV.padd.S2947 || []).length, 1);
  ok("★ 换台电脑：改的价收下来了", (OV.px.S2947 || {}).D3042078.p, 7.7);
  ok("★ 换台电脑：留痕收下来了", OV.plog.length, 1);
  ok("收下之后重建了索引（不重建就配不上货）", 重建过 > 0, true);

  /* 再收一次，不许翻倍 */
  ovAdopt(服务器那份);
  ok("同一份收两次不翻倍", (OV.padd.S2947 || []).length, 1);
  ok("留痕收两次不翻倍", OV.plog.length, 1);

  /* 本机刚改的价，不许被服务器那份冲掉 */
  OV.px.S2947 = OV.px.S2947 || {};
  OV.px.S2947.D3042078 = { p: 9.9 };
  OV.dirty["px|S2947|D3042078"] = 1;
  ovAdopt(服务器那份);
  ok("★ 本机刚改的价，不许被服务器冲回去", OV.px.S2947.D3042078.p, 9.9);

  /* 本机点了「还原」，不许被服务器拉回来 */
  delete OV.dirty["px|S2947|D3042078"];
  delete OV.px.S2947.D3042078;
  OV.gone["px|S2947|D3042078"] = 1;
  ovAdopt(服务器那份);
  ok("★ 本机还原掉的价，不许被服务器拉回来", (OV.px.S2947 || {}).D3042078, undefined);
})();

L("");
L(fail ? ("有 " + fail + " 项没过（通过 " + pass + " 项）") : ("全部通过：" + pass + " 项"));
process.exit(fail ? 1 : 0);
