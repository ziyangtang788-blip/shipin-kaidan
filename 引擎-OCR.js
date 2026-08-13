/* 认字这一层 —— 图片/扫描件先过 OCR，把字认准了再交给 AI 认结构
   ============================================================
   老板 2026-08-09 定的分工：

     OCR：只管把字认准，一个字不改        ← 它准，还知道自己准不准
     AI ：只管说「哪一格是品名、哪一格是数量」← 它懂业务

   谁也不干对方的活。AI 干得越少，出错的机会越少。

   ⚠ Excel / Word 不走这条 —— 它们的格子浏览器本地读得到，
     过一道 OCR 是白花钱，而且多一道手就多一处能出错。
     （规矩总表 §5.5.5：老板 8/4「我肯定要最便宜的方法」）

   实测（2026-08-09，7 张最难的真单，对着 49 份基线数）：
     一分利-东莞  密表 67 段        品9 段67 量97      全中
     佛山碧源    一行混板和斤      品8 段17 量86.5    全中，板是板斤是斤
     聚农商贸    166 段，最密的     段166              一段不差
     三棵菜      矩阵表 50 行       段50               全中
     优品联华    手写便条          品8 量49           全中
   —— 数字、单位、点位号，7 张全对。1~7 秒一张，一张不到一分钱。

   ⚠ 已知的坑：它会【自信地认错字】
     千张→干张、烟熏→烟重、豆制品→豆蕉品，置信度都给 0.99。
     置信度那道闸抓得住「糊」，抓不住「认错」。
     好在这类错撞不出钱的问题 —— 名字配不上价格库就报存疑，走弹窗让人挑。
     真正致命的是数字读错，而数字这一关 OCR 反而比看图稳。
   ============================================================ */
(function (root) {
  "use strict";

  var 接口 = "https://api.mistral.ai/v1/ocr";
  var 模型 = "mistral-ocr-latest";

  /* 低于这个分就当「这个字我没把握」，数量位直接换成 ?，
     走已有的橙色+空数量框那一套（规矩总表 §5.5）。
     0.7 是拍的：实测正常的字都在 0.95 以上，
     给低分的是 ✕(0.14) ↓(0.65) 🖊️(0.54) 这类符号 —— 分数本身可信。 */
  var 没把握 = 0.7;

  /* 表格是单独一份资源，正文里只留个 [tbl-0.md] 链接，得自己拼回去 */
  function 拼回表格(页) {
    var 表 = (页.tables || []).map(function (t) { return t.content || ""; }).join("\n\n");
    var 正文 = 页.markdown || "";
    return 表 ? 正文.replace(/\[tbl-\d+\.(md|html)\]\([^)]*\)/g, 表) : 正文;
  }

  /* 正文的字和表格里的字，置信度分两套存，合起来看 */
  function 收置信(页) {
    var a = ((页.confidence_scores || {}).word_confidence_scores || []).slice();
    (页.tables || []).forEach(function (t) {
      a = a.concat(t.word_confidence_scores || []);
    });
    return a;
  }
  function 分(w) { return w.confidence !== undefined ? w.confidence : w.score; }
  function 字(w) { return w.text || w.word || ""; }

  /* 一张图 → { 文本, 没把握的字[], 平均分, 最低分 }
     发请求这件事交给外面 —— 浏览器里要走后端代理（密钥不能落前端），
     node 里直接调。这儿只管拼请求体和拆响应，两边共用同一份。 */
  function 请求体(b64, mime) {
    return {
      model: 模型,
      document: { type: "image_url", image_url: "data:" + mime + ";base64," + b64 },
      table_format: "markdown",            /* 表格直接嵌成 markdown 表，好往格子表里搬 */
      confidence_scores_granularity: "word" /* ★ 逐字置信度 —— 接 OCR 最值钱的就是这个 */
    };
  }

  function 拆响应(j) {
    var 页们 = (j && j.pages) || [];
    var 文本 = [], 全部词 = [];
    页们.forEach(function (p) {
      文本.push(拼回表格(p));
      全部词 = 全部词.concat(收置信(p));
    });
    var 低 = 全部词.filter(function (w) { return 分(w) < 没把握; });
    var 分们 = 全部词.map(分).filter(function (x) { return typeof x === "number"; });
    return {
      文本: 文本.join("\n\n"),
      页数: 页们.length,
      词数: 全部词.length,
      没把握的: 低.map(function (w) { return { 字: 字(w), 分: 分(w) }; }),
      平均分: 分们.length ? 分们.reduce(function (a, b) { return a + b; }, 0) / 分们.length : null,
      最低分: 分们.length ? Math.min.apply(null, 分们) : null
    };
  }

  /* 把「没把握的字」标进文本 —— 数量位置的换成 ?，让下游按老规矩处理。
     ⚠ 只动数字，不动名字和点位：名字读错了配不上库会报存疑，
       那条路本来就有；点位读错了是另一回事（规矩总表 §五点六）。 */
  function 标不确定(文本, 没把握的) {
    if (!没把握的 || !没把握的.length) return 文本;
    var out = 文本;
    没把握的.forEach(function (w) {
      var s = String(w.字 || "").trim();
      if (!s || !/^[0-9]+(\.[0-9]+)?$/.test(s)) return;   /* 只换纯数字 */
      /* 前后有边界才换，免得 "1" 把 "11" 也换了 */
      out = out.replace(new RegExp("(^|[^0-9.])" + s.replace(/\./g, "\\.") + "([^0-9.]|$)", "g"),
        function (m, a, b) { return a + "?" + b; });
    });
    return out;
  }

  root.GM_OCR = {
    接口: 接口, 模型: 模型, 没把握: 没把握,
    请求体: 请求体, 拆响应: 拆响应, 标不确定: 标不确定
  };
})(typeof window !== "undefined" ? window : globalThis);
