/* 看某家客户在观麦里到底有哪些品：node 工具-看客户品.js 裕丰 春花
   写对照表之前必须先看这个 —— 凭下单表上的叫法瞎写目标，就是制造认错。 */
global.window = {};
require("./数据-价格库.js");
const D = window.GM_DATA;
const L = s => process.stdout.write(Buffer.from(s + "\n", "utf8"));
process.argv.slice(2).forEach(kw => {
  const hits = D.custs.map((c, i) => ({ i, id: c[0], n: c[1] })).filter(c => c.n.indexOf(kw) >= 0 || c.id === kw);
  if (!hits.length) { L("？找不到客户：" + kw); return; }
  hits.forEach(c => {
    L("══════ " + c.id + "  " + c.n + " ══════");
    D.items.forEach(t => { if (t[0] === c.i) L("   " + t[2] + "  [" + t[3] + "]  ¥" + t[4] + (t[5] ? "  规格:" + t[5] : "")); });
  });
});
