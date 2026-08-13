/* ============================================================
   观麦 · 重爬全部报价单的商品价格 —— 出一张 CSV，喂给 工具-生成价格库.ps1

   什么时候要跑：观麦那边改过价、加过商品、开过新客户。
   我们库里的价是【爬那天】的快照，不重爬就一直用旧价，
   导进观麦的金额直接是错的 —— 这是错钱，不是小事。

   用法：
     1. 登进观麦，随便停在哪一页都行（要 station.guanmai.cn 这个域名下）
     2. F12 → 控制台 → 粘贴本文件全部内容 → 回车
     3. 等它跑完（一张报价单一行进度），自动下载
          观麦_全部报价单_商品价格.csv   ← 存到「下载」文件夹，别改名
     4. 回项目文件夹，右键跑 工具-生成价格库.ps1 → 生成新的 数据-价格库.js
     5. node 全部检查.js，过了才上传

   列名跟 2026-07-28 那份一模一样 —— 生成脚本只认列名，改一个字就读不出来。

   数据全程在你自己的浏览器里，用你自己的登录状态，不经过任何第三方。
   ============================================================ */
(async function () {
  const BASE = "https://station.guanmai.cn";
  const LIMIT = 200;    // 每页拉多少条商品
  const GAP = 130;      // 请求间隔毫秒，别把人家服务器打疼了
  const RETRY = 2;

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  async function api(url, t) {
    t = t || 0;
    try {
      const res = await fetch(url, { credentials: "include" });
      const j = await res.json();
      if (j.code !== 0) throw new Error(j.msg || ("code=" + j.code));
      return j;
    } catch (e) {
      if (t < RETRY) { await sleep(800 * (t + 1)); return api(url, t + 1); }
      throw e;
    }
  }

  /* CSV 里逗号、引号、换行都得包起来，不然列会串位 */
  function esc(v) {
    const s = (v === null || v === undefined) ? "" : String(v);
    return '"' + s.replace(/"/g, '""') + '"';
  }
  function download(rows, cols, filename) {
    const csv = [cols.map(esc).join(",")]
      .concat(rows.map((r) => cols.map((c) => esc(r[c])).join(",")))
      .join("\r\n");
    const a = document.createElement("a");
    /* 开头那个 BOM 是给 Excel 看的，少了它中文全乱码 */
    a.href = URL.createObjectURL(new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" }));
    a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
  }

  /* 列名照抄 2026-07-28 那份 CSV，一个字都不能改 —— 生成脚本按列名读 */
  const COLS = ["报价单ID", "客户名", "启用状态", "商品名", "商品编码", "客户叫法(规格名)",
    "规格编码", "一级分类", "二级分类", "品类", "销售单位", "销售规格", "销售价(元)",
    "基本单位", "销售单价(元/基本单位)", "外部编码", "上架状态", "库存均价(元)", "最近采购价(元)"];

  /* ⚠ 2026-08-10 踩过的坑：观麦这个接口返回的是【分】，不是元。
     直接写进 CSV 就是全库 ×100，换库之后每一单都错 100 倍，
     而且生成成功、体检全绿，一路绿灯看不出来。
     所以这里不写死除不除，爬完看数据自己认：
       返回分 → 一水儿的整数（600 / 380 / 250）
       返回元 → 一定有小数（6.50 / 3.80 / 2.50）
     认完把结论打在控制台上，你自己再拿一眼熟的价对一下。 */
  const 生价 = [];                                   /* 先原样存着，最后统一换算 */
  const n2 = (v) => {
    if (v === null || v === undefined || v === "") return "";
    const n = Number(v);
    if (!isFinite(n)) return "";
    if (n > 0) 生价.push(n);
    return n;                                        /* 先放数字，收完再转字符串 */
  };
  function 认单位() {
    const 有价 = 生价.filter(x => x > 0);
    if (!有价.length) return 1;
    const 带小数 = 有价.filter(x => Math.abs(x - Math.round(x)) > 1e-9).length;
    const 排 = 有价.slice().sort((a, b) => a - b);
    const 中位 = 排[Math.floor(排.length / 2)];
    /* 有一成以上带小数 → 是元；否则清一色整数 + 中位数够大 → 是分 */
    if (带小数 / 有价.length > 0.01) { console.log("单位判定：【元】（" + 带小数 + " 条带小数）→ 不除"); return 1; }
    if (中位 >= 50) { console.log("单位判定：【分】（全是整数，中位数 " + 中位 + "）→ 除以 100"); return 100; }
    console.log("单位判定：【元】（全是整数但中位数才 " + 中位 + "）→ 不除");
    return 1;
  }

  console.log("① 拉报价单清单…");
  const 单 = (await api(BASE + "/salemenu/sale/list?type=-1&with_sku_num=1&q=")).data || [];
  console.log("   共 " + 单.length + " 张报价单");

  const out = [];
  let 空单 = 0, 失败 = [];

  for (let i = 0; i < 单.length; i++) {
    const m = 单[i];
    let off = 0, got = 0, total = null;
    try {
      /* 一张报价单可能几百条，分页拉到拉完为止 */
      for (;;) {
        const u = BASE + "/product/sku_salemenu/list?category1_ids=[]&category2_ids=[]" +
          "&pinlei_ids=[]&text=&salemenu_id=" + encodeURIComponent(m.id) +
          "&offset=" + off + "&limit=" + LIMIT + "&is_sale";
        const j = await api(u);
        const arr = j.data || [];
        if (total === null) total = (j.pagination && j.pagination.count) || arr.length;

        arr.forEach(function (s) {
          out.push({
            "报价单ID": m.id,
            "客户名": m.name || s.salemeun_name || "",
            "启用状态": m.is_active ? "启用" : "停用",
            "商品名": s.spu_name || "",
            "商品编码": s.spu_id || "",                       /* C 码：商品本体，跨客户通用 */
            "客户叫法(规格名)": s.sku_name || "",              /* 这家客户嘴里叫什么 */
            "规格编码": s.sku_id || "",                        /* ★ D 码：导观麦「商品ID」填这个 */
            "一级分类": s.category_name_1 || "",
            "二级分类": s.category_name_2 || "",
            "品类": s.pinlei_name || "",
            "销售单位": s.sale_unit_name || "",
            /* 「1板/板」「40条/件」这种：几个基本单位装成一个销售单位 */
            "销售规格": (s.sale_ratio || 1) + (s.std_unit_name || "") + "/" + (s.sale_unit_name || ""),
            "销售价(元)": n2(s.sale_price),
            "基本单位": s.std_unit_name || "",
            "销售单价(元/基本单位)": n2(s.std_sale_price),
            "外部编码": s.outer_id || "",
            "上架状态": s.state === 1 ? "上架" : "下架",
            "库存均价(元)": n2(s.stock_avg_price),
            "最近采购价(元)": n2(s.latest_purchase_price)
          });
        });

        got += arr.length;
        off += LIMIT;
        if (arr.length < LIMIT || got >= total) break;
        await sleep(GAP);
      }
      if (!got) 空单++;
      console.log("   [" + (i + 1) + "/" + 单.length + "] " + m.id + " " + (m.name || "") + " → " + got + " 条");
    } catch (e) {
      失败.push({ id: m.id, name: m.name, why: String(e.message || e) });
      console.warn("   [" + (i + 1) + "/" + 单.length + "] " + m.id + " " + (m.name || "") + " ✗ " + e.message);
    }
    await sleep(GAP);
  }

  window.__gmPRICE = out;   /* 万一下载被浏览器拦了，控制台里还能捞回来 */

  console.log("");
  console.log("报价单 " + 单.length + " 张｜商品 " + out.length + " 条｜空报价单 " + 空单 + " 张");
  if (失败.length) {
    console.warn("⚠ 有 " + 失败.length + " 张没拉下来，别拿这份去生成价格库，先补：");
    console.table(失败);
  }

  /* 统一换算 + 转成两位小数的字符串 —— 生成脚本按文本读，必须两位 */
  const 除 = 认单位();
  const 价格列 = ["销售价(元)", "销售单价(元/基本单位)", "库存均价(元)", "最近采购价(元)"];
  out.forEach(function (r) {
    价格列.forEach(function (c) {
      r[c] = (r[c] === "" || r[c] === null || r[c] === undefined) ? "" : (Number(r[c]) / 除).toFixed(2);
    });
  });
  /* 眼睛过一遍：拿几条你天天见的价对一下，不对就别往下走 */
  const 样 = out.filter(r => /攸县香干|尝元小板豆腐（5斤）|尝元中板豆腐（7斤）/.test(r["客户叫法(规格名)"])).slice(0, 5);
  if (样.length) { console.log("抽几条给你对眼："); 样.forEach(r => console.log("   " + r["客户名"] + " " + r["客户叫法(规格名)"] + " = " + r["销售价(元)"] + " 元/" + r["销售单位"])); }

  download(out, COLS, "观麦_全部报价单_商品价格.csv");
  console.log("已下载：观麦_全部报价单_商品价格.csv（别改名，生成脚本按这个名字找）");
  console.log("下一步：项目文件夹里右键跑 工具-生成价格库.ps1");
  if (!失败.length) console.log("重下一次就敲：__gmDL()");
  window.__gmDL = function () { download(window.__gmPRICE, COLS, "观麦_全部报价单_商品价格.csv"); };
})();
