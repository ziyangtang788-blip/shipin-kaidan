/* 查历史单：门店有没有串到别家去 —— 2026-08-09
   ============================================================
   为什么要查：8/9 之前有个 bug ——
   换客户走「横幅点确认」那条路时，门店下拉根本没重建，
   上一单的店名（比如真实惠的「叠北店」）原封不动留在下拉里，
   跟着新客户（惠雅超市）一起存进了订单记录的 shop 字段。
   代码已经修好了，但【修之前存下来的单可能已经串了】，得回头捞出来看。

   怎么跑（这台机器直连不上服务器，所以走浏览器）：
     1. 浏览器打开 https://choeyy88.com/ ，等页面加载完
     2. 按 F12 → 切到「控制台 / Console」
     3. 把【本文件从下面那行分割线往下】整段复制进去，回车
     4. 等几秒，控制台会打出一张表；同时自动下载一个 csv

   只列对不上的那几张，对得上的一个字都不打。
   ────────────────────────────────────────────────────────────
   下面整段复制：
*/

(async () => {
  const 天数 = 400;                       /* 往回查多少天，不够就调大 */
  const 从 = new Date(Date.now() - 天数 * 86400000).toISOString().slice(0, 10);

  /* ── 这家客户名下【应该】有哪些店 ── */
  const GM = window.GM_SHOP || {};
  /* 人自己加的店记在覆盖层里。本机一份、服务器一份，两份都要 ——
     只看本机的话，别台电脑加的店会被当成「串单」，冤枉一片。 */
  let 人加的 = {};
  const 并进来 = ov => {
    const s = (ov && ov.shops) || {};
    for (const cid of Object.keys(s))
      (s[cid] || []).forEach(n => {
        人加的[cid] = 人加的[cid] || [];
        if (人加的[cid].indexOf(n) < 0) 人加的[cid].push(n);
      });
  };
  try { 并进来(JSON.parse(localStorage.getItem("gm_ov_v2") || "{}")); } catch (e) { }
  try {
    const ovr = await fetch("/api/overlay", { cache: "no-store" }).then(x => x.json());
    并进来((ovr && ovr.data) || ovr);
  } catch (e) { console.warn("服务器覆盖层没拉到，只按本机的算 —— 可能会多冤枉几张", e); }
  function 应有的店(cid) {
    const a = [];
    const g = GM[cid];
    if (g && g.店) g.店.forEach(x => { if (a.indexOf(x[0]) < 0) a.push(x[0]); });
    (人加的[cid] || []).forEach(s => { if (a.indexOf(s) < 0) a.push(s); });
    return a;
  }
  /* 这个店名是【别家】的吗？是的话把那一家的名字说出来，好判断是不是串单 */
  function 是谁家的(店名) {
    const 谁 = [];
    for (const cid of Object.keys(GM)) {
      const g = GM[cid];
      if (g && g.店 && g.店.some(x => x[0] === 店名)) 谁.push((g.单 || cid));
    }
    for (const cid of Object.keys(人加的)) {
      if ((人加的[cid] || []).indexOf(店名) >= 0 && 谁.indexOf(cid) < 0) 谁.push(cid + "(手加)");
    }
    return 谁.join(" / ");
  }

  const r = await fetch("/api/orders?limit=1000&from=" + 从, { cache: "no-store" });
  const j = await r.json();
  const rows = (j && j.rows) || [];
  console.log("捞到 " + rows.length + " 张单（" + 从 + " 起）");

  const 坏 = [];
  rows.forEach(o => {
    const 店 = (o.shop || "").trim();
    if (!店) return;                       /* 没填门店的不算问题 */
    const 该有 = 应有的店(o.customer_id);
    if (该有.indexOf(店) >= 0) return;      /* 对得上，跳过 */
    坏.push({
      单号: o.order_no,
      日期: o.order_date,
      客户: o.customer_name,
      客户号: o.customer_id,
      存着的门店: 店,
      这店其实是谁家的: 是谁家的(店) || "（谁家都不是）",
      这家应有的门店: 该有.join(" / ") || "（这家没有门店）"
    });
  });

  if (!坏.length) {
    console.log("%c✅ 查完了：" + rows.length + " 张单，没有一张的门店串到别家去。",
      "color:#2E9E5B;font-size:14px");
    return;
  }
  console.log("%c⚠ 有 " + 坏.length + " 张单的门店对不上（共查 " + rows.length + " 张）",
    "color:#E0533D;font-size:14px");
  console.table(坏);

  /* 存成 csv，好拿去一张张改 */
  const 表头 = Object.keys(坏[0]);
  const 转 = v => '"' + String(v == null ? "" : v).replace(/"/g, '""') + '"';
  const csv = "﻿" + [表头.join(",")].concat(
    坏.map(x => 表头.map(k => 转(x[k])).join(","))).join("\r\n");
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  a.download = "门店串单-" + new Date().toISOString().slice(0, 10) + ".csv";
  a.click();
  console.log("已经下载：" + a.download);
})();
