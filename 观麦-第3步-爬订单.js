/* ============================================================
   观麦 · 第 3 步：拉最近 N 天的订单 + 订单明细，导出两个 CSV

   用法：
     1. 在观麦「订单 / 订单列表」页面
     2. F12 → 控制台 → 粘贴本文件全部内容 → 回车
     3. 等它跑完（会一页页报进度），自动下载两个 CSV

   输出：
     观麦_订单头_最近N天.csv    —— 一行一张订单（客户、地址、金额、日期、备注…）
     观麦_订单明细_最近N天.csv  —— 一行一个商品（订单号、规格、数量、单价、金额…）
     两张表用「订单号」关联。

   数据全程在你自己的浏览器里，用你自己的登录状态。
   ============================================================ */
(async function () {
  const BASE = "https://station.guanmai.cn";
  const DAYS = 30;      // ← 想拉多少天改这里
  const LIMIT = 100;    // 每页条数
  const GAP = 130;      // 请求间隔毫秒
  const RETRY = 2;

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const p2 = (n) => (n < 10 ? "0" : "") + n;
  const fmt = (d) => d.getFullYear() + "-" + p2(d.getMonth() + 1) + "-" + p2(d.getDate()) + "+00:00";

  const end = new Date(); end.setDate(end.getDate() + 1);
  const start = new Date(); start.setDate(start.getDate() - DAYS);
  const S = fmt(start), E = fmt(end);

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

  /* 把嵌套对象拍平成一层，最多两层 */
  function flat(o, prefix, out, depth) {
    out = out || {}; prefix = prefix || ""; depth = depth || 0;
    for (const k in o) {
      const v = o[k];
      const key = prefix + k;
      if (v === null || v === undefined) out[key] = "";
      else if (Array.isArray(v)) out[key] = v.length ? JSON.stringify(v).slice(0, 300) : "";
      else if (typeof v === "object") {
        if (depth < 2) flat(v, key + ".", out, depth + 1);
        else out[key] = JSON.stringify(v).slice(0, 300);
      }
      else out[key] = v;
    }
    return out;
  }

  async function pull(name, build) {
    const rows = [];
    let offset = 0, total = null;
    while (true) {
      const j = await api(build(offset));
      const d = j.data || {};
      const list = d.list || [];
      if (total === null) {
        total = (d.pagination && d.pagination.count) != null ? d.pagination.count : list.length;
        console.log("%c▶ " + name + "：共 " + total + " 条，开始拉…", "color:#3D8B5C;font-weight:bold;font-size:14px");
      }
      list.forEach((x) => rows.push(flat(x)));
      offset += LIMIT;
      console.log("　" + name + " " + Math.min(offset, total) + " / " + total);
      if (list.length < LIMIT || offset >= total) break;
      await sleep(GAP);
    }
    return rows;
  }

  function download(rows, filename, firstCols) {
    if (!rows.length) { console.warn(filename + " 没有数据"); return; }
    const set = {};
    rows.forEach((r) => { for (const k in r) set[k] = 1; });
    let cols = Object.keys(set).sort();
    (firstCols || []).slice().reverse().forEach((c) => {
      const i = cols.indexOf(c);
      if (i >= 0) { cols.splice(i, 1); cols.unshift(c); }
    });
    const esc = (v) => '"' + String(v == null ? "" : v).replace(/"/g, '""') + '"';
    const csv = [cols.map(esc).join(",")]
      .concat(rows.map((r) => cols.map((c) => esc(r[c])).join(",")))
      .join("\r\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" }));
    a.download = filename;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    console.log("%c⬇ " + filename + "（" + rows.length + " 行 / " + cols.length + " 列）", "color:#3D8B5C;font-weight:bold");
  }

  console.log("%c时间范围：" + S.replace("+", " ") + " ~ " + E.replace("+", " "),
              "color:#3D8B5C;font-weight:bold;font-size:15px");

  try {
    /* 1. 订单头 */
    const orders = await pull("订单头", (off) =>
      BASE + "/station/orders?start_date_new=" + S + "&end_date_new=" + E +
      "&query_type=1&search_text=&search_type=1&address_label_id=[]&address_ids=[]" +
      "&hotel_type=0&order_process_type_id_list=[]&limit=" + LIMIT + "&offset=" + off);

    await sleep(400);

    /* 2. 订单明细（跨订单，带 order_id） */
    const skus = await pull("订单明细", (off) =>
      BASE + "/station/order/order_sku_list?start_date_new=" + S + "&end_date_new=" + E +
      "&query_type=1&search_text=&category1_ids=[]&category2_ids=[]&pinlei_ids=[]" +
      "&order_process_type_id_list=[]&address_ids=[]&limit=" + LIMIT + "&offset=" + off);

    window.__gmORDERS = orders;
    window.__gmSKUS = skus;

    download(orders, "观麦_订单头_最近" + DAYS + "天.csv",
      ["id", "date_time_str", "customer.name", "customer.address", "customer.salemenu_id",
       "customer.receiver_name", "create_user", "total_price", "sale_money_with_freight", "route_name", "remark"]);
    download(skus, "观麦_订单明细_最近" + DAYS + "天.csv",
      ["order_id", "id", "spu_id", "quantity", "std_real_quantity", "actual_received_money"]);

    console.log("%c✅ 全部完成：订单 " + orders.length + " 张 / 明细 " + skus.length + " 行",
                "color:#3D8B5C;font-weight:bold;font-size:16px");
    console.log("没下载成功的话，敲 __gmRedown() 重来一次。");
    window.__gmRedown = function () {
      download(window.__gmORDERS, "观麦_订单头_最近" + DAYS + "天.csv", ["id"]);
      download(window.__gmSKUS, "观麦_订单明细_最近" + DAYS + "天.csv", ["order_id"]);
    };
  } catch (e) {
    console.error("出错了：" + e.message + "　（登录过期就刷新页面重登再来）");
  }
})();
