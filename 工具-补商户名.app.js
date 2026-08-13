/* 补商户名 —— 页面逻辑
   ==========================================
   干一件事：把开单台导出的 xlsx 里「商户名」那一列，
   换成观麦认的商户名，然后吐一个新 xlsx 出来。

   为什么要这个东西（2026-08-05）：
     我们价格库里存的是【报价单名】「三颗菜」，
     观麦导入要的是【商户名】「三颗菜三水仓」——两个不是一回事。
     观麦自己导出的订单头里，商户名是 customer.extender.resname，挂在 customer 底下；
     报价单只是 customer.salemenu_id 一个外键。一张报价单可以被好几个商户共用。
     9765 行真单里 5742 行两者不同，拿报价单名去导，一大半报「商户异常」。

   为什么单独做一个文件、不直接改开单台：
     开单台是在跑的东西。先拿这个把导入弄成功，确认没问题了，再回头改开单台。 */
(function () {
  "use strict";
  var $ = function (id) { return document.getElementById(id); };
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
    });
  }

  /* 哪几列是数字 —— 写回 xlsx 时数字要写成数字格，写成文本观麦会算不了钱 */
  var 数字列名 = { "下单数": 1, "单价": 1, "下单金额": 1 };

  var ST = { 头: null, 行: [], 名列: -1, SID列: -1, 家: [], 文件名: "" };

  /* ---------- 收文件 ---------- */
  function 收(f) {
    if (!f) return;
    if (!/\.xlsx$/i.test(f.name)) { 说("这个不是 xlsx。要开单台「导观麦」出来的那个文件。", true); return; }
    ST.文件名 = f.name;
    说("正在读…");
    var fr = new FileReader();
    fr.onload = function () {
      GM_FILE.readXlsxGrid(fr.result).then(function (g) {
        var s = Array.isArray(g) ? g[0] : g;
        var rows = (s && s.rows) || [];
        if (rows.length < 2) { 说("这个文件里没有数据行。", true); return; }
        开工(rows);
      }).catch(function (e) { 说("读不了这个文件：" + e.message, true); });
    };
    fr.readAsArrayBuffer(f);
  }

  /* ---------- 认列、分家 ---------- */
  function 开工(rows) {
    ST.头 = rows[0].map(function (x) { return String(x == null ? "" : x).trim(); });
    ST.行 = rows.slice(1);
    ST.名列 = ST.头.indexOf("商户名");
    ST.SID列 = ST.头.indexOf("商户SID");
    if (ST.名列 < 0) { 说("这个文件里没有「商户名」这一列，不像是开单台导出来的。", true); return; }
    if (ST.SID列 < 0) { 说("这个文件里没有「商户SID」这一列 —— 没有它就不知道是哪家，认不出来。", true); return; }

    /* 按报价单号分组：一个文件里可能放了好几家 */
    var 见 = {};
    ST.家 = [];
    ST.行.forEach(function (r, i) {
      var sid = String(r[ST.SID列] || "").trim();
      var 原名 = String(r[ST.名列] || "").trim();
      var k = sid + "||" + 原名;
      if (!见[k]) {
        见[k] = { sid: sid, 原名: 原名, 行数: 0, 行号: [] };
        ST.家.push(见[k]);
      }
      见[k].行数++;
      见[k].行号.push(i);
    });

    /* 查表：这个报价单号在观麦那边挂着哪几个商户 */
    ST.家.forEach(function (h) {
      var g = GM_SHOP[h.sid];
      h.店 = (g && g.店) ? g.店.map(function (x) { return x[0]; }) : [];
      if (h.店.length === 1) { h.选 = h.店[0]; h.怎么来的 = "auto"; }
      else if (h.店.length > 1) { h.选 = ""; h.怎么来的 = "要选"; }
      else { h.选 = h.原名; h.怎么来的 = "表里没有"; }
    });

    $("out").hidden = false;
    $("drop").hidden = true;
    画();
  }

  /* ---------- 画 ---------- */
  function 画() {
    var 总行 = ST.行.length;
    var 要改 = 0, 待选 = 0, 不认识 = 0;
    ST.家.forEach(function (h) {
      if (h.怎么来的 === "要选" && !h.选) 待选 += h.行数;
      else if (h.怎么来的 === "表里没有") 不认识 += h.行数;
      else if (h.选 !== h.原名) 要改 += h.行数;
    });

    $("who").innerHTML =
      '<div class="stats">' +
      '<div class="st"><div class="v">' + 总行 + '</div><div class="k">行货</div></div>' +
      '<div class="st"><div class="v">' + ST.家.length + '</div><div class="k">家</div></div>' +
      '<div class="st ' + (要改 ? "good" : "") + '"><div class="v">' + 要改 + '</div><div class="k">要改名</div></div>' +
      '<div class="st ' + (待选 ? "warn" : "") + '"><div class="v">' + 待选 + '</div><div class="k">等你选门店</div></div>' +
      (不认识 ? '<div class="st bad"><div class="v">' + 不认识 + '</div><div class="k">表里查不到</div></div>' : "") +
      '</div>' +
      '<div class="fn">' + esc(ST.文件名) + '</div>';

    var h = '<table class="grid"><tr><th>报价单号</th><th>文件里写的</th><th></th><th>要填的商户名</th><th>行数</th></tr>';
    ST.家.forEach(function (家, i) {
      var 右 = "";
      if (家.怎么来的 === "要选") {
        右 = '<select data-i="' + i + '" class="pick' + (家.选 ? "" : " need") + '">' +
          '<option value="">— 这家有 ' + 家.店.length + ' 个门店，选一个 —</option>' +
          家.店.map(function (s) {
            return '<option value="' + esc(s) + '"' + (家.选 === s ? " selected" : "") + '>' + esc(s) + '</option>';
          }).join("") + '</select>';
      } else if (家.怎么来的 === "表里没有") {
        右 = '<span class="bad">观麦近期没有这家的订单，查不到商户名 —— 原样不动，导进去可能会异常</span>';
      } else {
        右 = '<b class="ok">' + esc(家.选) + '</b>' +
          (家.选 === 家.原名 ? ' <span class="muted">（本来就是对的）</span>' : "");
      }
      h += '<tr><td class="mono">' + esc(家.sid) + '</td><td>' + esc(家.原名) + '</td>' +
        '<td class="arrow">→</td><td>' + 右 + '</td><td class="num">' + 家.行数 + '</td></tr>';
    });
    h += '</table>';
    $("detail").innerHTML = h;

    Array.prototype.forEach.call($("detail").querySelectorAll("select.pick"), function (s) {
      s.addEventListener("change", function () {
        ST.家[+this.getAttribute("data-i")].选 = this.value;
        画();
      });
    });

    var 缺 = ST.家.filter(function (x) { return x.怎么来的 === "要选" && !x.选; });
    $("dl").disabled = !!缺.length;
    说(缺.length ? ("还有 " + 缺.length + " 家没选门店") : "可以下载了");
  }

  /* ---------- 写回去 ---------- */
  function 下载() {
    var out = [ST.头.slice()];
    var 改了 = 0;
    ST.行.forEach(function (r, i) {
      var 新 = r.slice();
      var sid = String(r[ST.SID列] || "").trim();
      var 原名 = String(r[ST.名列] || "").trim();
      var 家 = null;
      for (var k = 0; k < ST.家.length; k++)
        if (ST.家[k].sid === sid && ST.家[k].原名 === 原名) { 家 = ST.家[k]; break; }
      if (家 && 家.选 && 家.选 !== 原名) { 新[ST.名列] = 家.选; 改了++; }
      out.push(新);
    });
    var 数字 = ST.头.map(function (t) { return !!数字列名[t]; });
    /* 数字列里要是文本，写出去观麦算不了钱 —— 统一转一遍 */
    for (var r = 1; r < out.length; r++)
      for (var c = 0; c < 数字.length; c++)
        if (数字[c]) out[r][c] = (+out[r][c] || 0);

    var buf = GM_EXPORT.xlsx("订单导入", out, 数字);
    var a = document.createElement("a");
    var url = URL.createObjectURL(new Blob([buf],
      { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
    a.href = url;
    a.download = ST.文件名.replace(/\.xlsx$/i, "") + "_补好商户名.xlsx";
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
    说("✓ 下载了，改了 " + 改了 + " 格商户名。拿这个去观麦导。");
  }

  function 说(s, 坏) {
    var e = $("msg"); if (!e) return;
    e.textContent = s; e.className = 坏 ? "bad" : "muted";
    if (坏 && $("out").hidden) alert(s);
  }

  /* ---------- 挂上 ---------- */
  document.addEventListener("DOMContentLoaded", function () {
    var d = $("drop");
    ["dragenter", "dragover"].forEach(function (t) {
      d.addEventListener(t, function (e) { e.preventDefault(); d.classList.add("on"); });
    });
    ["dragleave", "drop"].forEach(function (t) {
      d.addEventListener(t, function (e) { e.preventDefault(); d.classList.remove("on"); });
    });
    d.addEventListener("drop", function (e) { 收(e.dataTransfer.files[0]); });
    /* 整页也接一下，拖偏了也不至于让浏览器把文件打开 */
    ["dragover", "drop"].forEach(function (t) {
      document.addEventListener(t, function (e) { e.preventDefault(); });
    });
    $("pick").addEventListener("click", function () { $("file").click(); });
    $("file").addEventListener("change", function () { 收(this.files[0]); });
    $("dl").addEventListener("click", 下载);
    $("again").addEventListener("click", function () {
      $("out").hidden = true; $("drop").hidden = false; $("file").value = "";
    });
  });
})();
