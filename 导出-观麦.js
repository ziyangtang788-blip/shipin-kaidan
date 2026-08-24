/* 导成观麦能导入的表 —— 老板 2026-08-03 定：走 Excel 导入，一行存疑都不许导
   ============================================================

   为什么能做：我们每一行都存着观麦自己的编号
     客户编号 S2999　商品编码 D4108101　数量/单位　单价　点位　送货日期
   商品编码是最要紧的 —— 有它就不会配错货，不靠名字去猜。

   ⚠⚠ 列名要照观麦的导入模板改，就改下面这一处（列名表）。
      老板去观麦后台「订单导入 → 下载模板」，把那个 Excel 发过来，
      照着它的表头把 标题 改一遍就完事，别的地方一个字都不用动。
   ============================================================ */
(function (root) {
  "use strict";

  /* ========== 列名 ==========
     观麦「批量导入订单 → 模板设置」是【我们定列名、他做一次映射】。
     所以列名直接照抄观麦「系统名称」下拉里的原词 —— 映射时一对一，不用猜。

     ⚠ 收货日期、运营时间不放表里 —— 那两个在导入弹窗上选。
     ⚠ 标题所在行 = 1

     ⚠⚠ 2026-08-05 实测更正：多带列【是碍事的】。
        观麦按第几列认，模板里映了几列，文件就得正好是那几列、那个顺序。
        多一列就把后面全挤歪，报「第N列应该为：xx」——
        以前导出 14 列撞 9 列模板，就是这么报的「第3列应该为：商品名」。

     商品名填的是【这个客户在观麦里的叫法】（我们的 ours），
     不是客户手写的词 —— 观麦是拿这个名字去这家的报价单里配货的。 */
  /* 是不是观麦发的真商品ID。我们自己给新建品编的码长这样：X{客户号}-{时间戳}-{随机数}。
     只此一处判断 —— 别处再抄一份，改一处漏一处。 */
  function 真码(sku) {
    var s = String(sku == null ? "" : sku).trim();
    return /^X[^-]*-\d{10,}-/.test(s) ? "" : s;
  }

  /* 这张单开给哪个门店 → [商户名, 商户SID]
     商户名和 SID 必须出自同一次判断，各算各的迟早会出现「名字是A仓、SID是B仓」。 */
  function 门店(o) {
    var g = (root.GM_SHOP || {})[o && o.customer_id];
    var 店 = (g && g.店) || [];
    if (o && o.shop) {                                   /* 人选了门店，最准 */
      for (var i = 0; i < 店.length; i++) if (店[i][0] === o.shop) return 店[i];
      return [o.shop, ""];                               /* 表里没有这个店：名字照给，SID 空着 */
    }
    if (店.length === 1) return 店[0];                    /* 只有一个商户，直接用 */
    return [(o && o.customer_name) || "", ""];           /* 兜底：报价单名（多门店的在建表时已拦下） */
  }

  var 列名 = [
    /* ── 必映的三个（观麦下拉里一定有）── */
    /* ★ 2026-08-05：这一列要填【观麦的商户名】，不是我们价格库里的报价单名。
       踩到的坑：拿「三颗菜」去导，观麦直接报「商户异常」——
       因为「三颗菜」是【报价单名】，观麦要的是【商户名】「三颗菜三水仓」。
       9765 行真单里有 5742 行两者不一样，光拿报价单名导，一大半都进不去。

       一个报价单底下常挂好几个商户，那几个其实就是【门店】：
         三颗菜 → 三水仓 / 白云仓 / 菜运达供应链
       所以：人在页面上选了门店 → 用门店名；
             没选、而且这家只有一个商户 → 自动用那一个（106/124 家是这种）；
             都没有 → 退回报价单名（多半会异常，但总比空着强，人看得见）。
       对照表在 数据-商户名.js，是从观麦订单明细里数出来的，不是猜的。 */
    { 标题: "商户名", 取: function (r, o) { return 门店(o)[0]; } },
    { 标题: "商品名", 取: function (r) { return r.ours || r.name; } },
    { 标题: "下单数", 取: function (r) { return r.qty; }, 数字: true },

    /* ── 数量和钱 ── */
    { 标题: "单位", 取: function (r) { return r.unit; } },
    { 标题: "单价", 取: function (r) { return r.price; }, 数字: true },

    /* ── 备注和点位：观麦分了三个位，别拼一起 ── */
    { 标题: "商品备注", 取: function (r) { return r.note || ""; } },
    { 标题: "订单备注", 取: function (r, o) { return o.note || ""; } },
    { 标题: "客户点位", 取: function (r) { return r.code || ""; } },

    /* ★ 商户SID —— S3797453 这种，是【开给谁】，一家门店一个。
       2026-08-05 实测：SID 说了算。故意把商户名写错成「江云」、SID 填对，
       观麦照样落到「江云生鲜配送/S3797453」，6 行全进、金额对得上。
       所以那 62 家「报价单名 ≠ 商户名」的，靠这一列就解决了。

       ⚠ 千万别填 o.customer_id —— 那是【报价单号】S2984，是一张价目表，
         好几个门店共用。以前就是填了它，观麦一路报错。 */
    { 标题: "商户SID", 取: function (r, o) { return 门店(o)[1]; } },

    /* ★ 商品ID —— D3196709 这种，观麦内部的规格ID，一条报价单里一个货一个码。
       2026-08-05 实测：填 D 码，观麦直接按码取货，「商品未完全识别」那条黄杠没了。

       为什么非要它：观麦本来是拿【商品名】去这家报价单里搜。
       我们价格库 5680 条里有 302 条名字是同一家另一条的子串
       （「香干」包在「攸县香干 / 卤香干 / 白香干 / 五香干」里），涉及 96 家客户 ——
       搜出一堆它拿不准，就弹黄杠要人一条条点。给了码就不用猜了。

       码是同源的：本来就是从观麦自己的报价单里导出来的，5680 条一条不缺。
       ⚠ 取 sku（第 7 个字段，D 码），不是 spuId（C 码，商品本体，跨客户通用）。 */
    /* ⚠⚠ 2026-08-24 老板：「我新加产品没有编号，也导入不进去。」
       就地新建的品，系统给它编了一个【自己的假码】：X+客户号+时间戳+随机数。
       那串东西观麦根本不认识，填进「商品ID」它直接报【商品不存在】，整单进不去。
       ⛔ 拿假码去撞，比不填还糟 —— 不填的话观麦会退回去【按商品名】在这家报价单里配货，
         顶多弹一条「商品未完全识别」的黄杠让人点一下，货还是能进。
       所以：自己编的码（X 开头）一律留空，真码（观麦发的 D 码）照填。
       ★ 治本的办法在页面那头：新建品的时候可以把观麦的商品ID 一起填进来。 */
    { 标题: "商品ID", 取: function (r) { return 真码(r.sku); } }

    /* 这 10 列的【顺序】是观麦后台模板定死的，两边必须一模一样：
         商户名 商品名 下单数 单位 单价 商品备注 订单备注 客户点位 商户SID 商品ID
       要加列只能往【末尾】加，还得先去后台把模板一起改。
       踩过的坑：模板里漏了「客户点位」那一行，导进去点位就是空的，不报错、不吭声。

       下拉里还有这些，实测过或者算过账，一律不出列：
         自定义编码   那是【商品】的自定义编码，不是商户的 —— 填了 6 行全报「商品不存在」
         销售单位     跟「单位」重复
         下单金额     观麦自己拿 下单数×单价 算，125.60 分毫不差
         订单分批号 / 订单类型 / 税率 / 是否打印   观麦的业务字段，走系统默认最稳 */
  ];

  /* ========== 拦：一行存疑都不许导 ==========
     老板 2026-08-03 定的。导进观麦的东西改起来麻烦，
     宁可导之前多点两下，也不能把没确认的塞进系统。 */
  function 挡不挡(rows) {
    var 拦 = [];
    (rows || []).forEach(function (r, i) {
      if (!r.ok || !r.sku) { 拦.push({ 第: i + 1, 名: r.name || "(空)", 因: "认不出，没有商品编码" }); return; }
      if (r.存疑) { 拦.push({ 第: i + 1, 名: r.name, 因: "还没确认（存疑）" }); return; }
      if (!(r.qty > 0)) { 拦.push({ 第: i + 1, 名: r.name, 因: "数量是 " + r.qty }); return; }
      if (r.price === null || r.price === undefined) { 拦.push({ 第: i + 1, 名: r.name, 因: "没有单价" }); }
    });
    return 拦;
  }

  /* 一张单（或者一批单）→ 二维表，第一行是表头。
     一个文件里放好几家也行 —— 观麦按「商户名」分单。 */
  function 建表(单) {
    var 单们 = Array.isArray(单) ? 单 : [单];
    var 拦 = [], 序 = 0;
    var 要选门店 = [];
    单们.forEach(function (o) {
      /* ★ 门店没选就别导（2026-08-05）
         这家报价单底下挂着好几个商户（＝好几个门店），不知道开给哪个。
         硬导过去观麦一定报「商户异常」，白跑一趟还得回来重导。
         宁可现在拦住，把几个门店摆出来让人点一下 —— 跟「一行存疑都不许导」一条线。

         ⚠ 这条不进「拦」：拦是【某一行】有问题，门店是【整张单】的事。
            混进去会把行号顶掉一位（第1行的问题报成第2行），人照着行号去找就找错。 */
      var g = (root.GM_SHOP || {})[o && o.customer_id];
      if (g && g.店 && g.店.length > 1 && !(o && o.shop)) {
        要选门店.push({ 单: (o && o.order_no) || "", 客户: (o && o.customer_name) || "",
                        cid: o && o.customer_id, 店: g.店.map(function (x) { return x[0]; }) });
      }
      挡不挡((o && o.lines) || []).forEach(function (x) {
        拦.push({ 第: 序 + x.第, 单: o.order_no || "", 客户: o.customer_name || "", 名: x.名, 因: x.因 });
      });
      序 += ((o && o.lines) || []).length;
    });
    if (拦.length || 要选门店.length) return { ok: false, 拦: 拦, 要选门店: 要选门店 };
    var 出 = [列名.map(function (c) { return c.标题; })];
    单们.forEach(function (o) {
      ((o && o.lines) || []).forEach(function (r) {
        出.push(列名.map(function (c) {
          var v = c.取(r, o);
          if (v === null || v === undefined) v = "";
          return c.数字 ? (+v || 0) : String(v);
        }));
      });
    });
    return { ok: true, rows: 出, 数字列: 列名.map(function (c) { return !!c.数字; }), 单数: 单们.length };
  }

  /* ================= 写 xlsx =================
     xlsx 就是一个 zip 包着几个 xml。这里不压缩（store），
     省掉一整个压缩库 —— 单据几十行，文件小得很，没必要压。
     字符串走 inlineStr，省掉 sharedStrings.xml 那一层。 */
  var CRC = (function () {
    var t = new Int32Array(256);
    for (var n = 0; n < 256; n++) {
      var c = n;
      for (var k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
      t[n] = c;
    }
    return t;
  })();
  function crc32(buf) {
    var c = -1;
    for (var i = 0; i < buf.length; i++) c = CRC[(c ^ buf[i]) & 0xFF] ^ (c >>> 8);
    return (c ^ -1) >>> 0;
  }
  function utf8(s) {
    if (typeof TextEncoder !== "undefined") return new TextEncoder().encode(s);
    return new Uint8Array(Buffer.from(s, "utf8"));   /* node 里跑测试用 */
  }
  function esc(s) {
    return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }
  function 列号(n) {                 /* 0 → A, 26 → AA */
    var s = "";
    n = n + 1;
    while (n > 0) { var m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = ((n - m) / 26) | 0; }
    return s;
  }

  function sheetXml(rows, 数字列) {
    var b = ['<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
      '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>'];
    rows.forEach(function (r, ri) {
      b.push('<row r="' + (ri + 1) + '">');
      r.forEach(function (v, ci) {
        var ref = 列号(ci) + (ri + 1);
        var 是数 = ri > 0 && 数字列 && 数字列[ci] && typeof v === "number" && isFinite(v);
        if (是数) b.push('<c r="' + ref + '"><v>' + v + '</v></c>');
        else if (v === "" || v === null || v === undefined) b.push('<c r="' + ref + '"/>');
        else b.push('<c r="' + ref + '" t="inlineStr"><is><t xml:space="preserve">' + esc(v) + '</t></is></c>');
      });
      b.push('</row>');
    });
    b.push('</sheetData></worksheet>');
    return b.join("");
  }

  function zip(files) {
    var 本 = [], 央 = [], off = 0;
    files.forEach(function (f) {
      var 名 = utf8(f.name), 数 = utf8(f.data), c = crc32(数);
      var h = new Uint8Array(30 + 名.length);
      var dv = new DataView(h.buffer);
      dv.setUint32(0, 0x04034b50, true); dv.setUint16(4, 20, true); dv.setUint16(6, 0x0800, true);
      dv.setUint16(8, 0, true);                       /* 不压缩 */
      dv.setUint16(10, 0, true); dv.setUint16(12, 0, true);
      dv.setUint32(14, c, true); dv.setUint32(18, 数.length, true); dv.setUint32(22, 数.length, true);
      dv.setUint16(26, 名.length, true); dv.setUint16(28, 0, true);
      h.set(名, 30);
      本.push(h, 数);
      var d = new Uint8Array(46 + 名.length);
      var dv2 = new DataView(d.buffer);
      dv2.setUint32(0, 0x02014b50, true); dv2.setUint16(4, 20, true); dv2.setUint16(6, 20, true);
      dv2.setUint16(8, 0x0800, true); dv2.setUint16(10, 0, true);
      dv2.setUint16(12, 0, true); dv2.setUint16(14, 0, true);
      dv2.setUint32(16, c, true); dv2.setUint32(20, 数.length, true); dv2.setUint32(24, 数.length, true);
      dv2.setUint16(28, 名.length, true);
      dv2.setUint32(42, off, true);
      d.set(名, 46);
      央.push(d);
      off += h.length + 数.length;
    });
    var 央长 = 央.reduce(function (a, x) { return a + x.length; }, 0);
    var e = new Uint8Array(22), dv3 = new DataView(e.buffer);
    dv3.setUint32(0, 0x06054b50, true);
    dv3.setUint16(8, files.length, true); dv3.setUint16(10, files.length, true);
    dv3.setUint32(12, 央长, true); dv3.setUint32(16, off, true);
    var 全 = 本.concat(央, [e]);
    var 总 = 全.reduce(function (a, x) { return a + x.length; }, 0);
    var out = new Uint8Array(总), p = 0;
    全.forEach(function (x) { out.set(x, p); p += x.length; });
    return out;
  }

  function xlsx(表名, rows, 数字列) {
    return zip([
      { name: "[Content_Types].xml", data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
        '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
        '<Default Extension="xml" ContentType="application/xml"/>' +
        '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
        '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>' +
        '</Types>' },
      { name: "_rels/.rels", data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>' +
        '</Relationships>' },
      { name: "xl/workbook.xml", data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" ' +
        'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>' +
        '<sheet name="' + esc(表名 || "Sheet1").slice(0, 31) + '" sheetId="1" r:id="rId1"/></sheets></workbook>' },
      { name: "xl/_rels/workbook.xml.rels", data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>' +
        '</Relationships>' },
      { name: "xl/worksheets/sheet1.xml", data: sheetXml(rows, 数字列) }
    ]);
  }

  root.GM_EXPORT = { 列名: 列名, 挡不挡: 挡不挡, 建表: 建表, xlsx: xlsx, crc32: crc32, 列号: 列号 };
})(typeof window !== "undefined" ? window : globalThis);
