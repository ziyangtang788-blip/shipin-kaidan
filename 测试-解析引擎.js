/* 解析引擎回归测试 —— node test-parse.js */
global.window = {};
require("./引擎-解析.js");
var P = global.window.GM_PARSE;

var pass = 0, fail = 0;
function t(name, text, want) {
  var got = P.parseOrder(text);
  var sum = got.reduce(function (a, l) { return a + (l.qty || 0); }, 0);
  sum = Math.round(sum * 1000) / 1000;
  var names = got.map(function (l) { return l.text + "=" + l.qty + (l.unit ? l.unit : ""); }).join(" | ");
  var ok = (want.qty === undefined || sum === want.qty)
        && (want.lines === undefined || got.length === want.lines)
        && (!want.nameNot || got.every(function (l) { return l.text !== want.nameNot; }));
  if (ok) { pass++; console.log("  ✅ " + name + "  → " + names); }
  else {
    fail++;
    console.log("  ❌ " + name);
    console.log("       期望 qty=" + want.qty + (want.lines !== undefined ? " lines=" + want.lines : "")
      + (want.noName ? " 不该出现商品名「" + want.noName + "」" : ""));
    console.log("       实得 qty=" + sum + " lines=" + got.length + "  → " + names);
  }
}

console.log("\n【A. 这次要修的 bug】");

// 轩宝：客户名自带括号，不能被当成点位、更不能变成独立商品
t("客户名带括号(麻辣烫)不该拆出独立商品",
  "千张\t(307爱信车身日餐)0.1斤+(021金光汽车零部件)6斤+(038冷链)170斤+(271大众一期自助组)2斤+(169大众千喜鹤麻辣烫)12斤+(166大众千喜鹤米线)6斤+(163大众千喜鹤大灶)20斤",
  { qty: 216.1, lines: 1 });

/* 括号不再被当成「点位分隔符」→ 名字不会在括号处被截断。
   注：这种「两级明细表原始行」本身超出扁平解析器的能力，
   靠 OCR 提示词先摊平成 品名<TAB>(客户)数量+(客户)数量 再进来。 */
t("客户名不再在括号处被截断成独立商品",
  "169大众千喜鹤(麻辣烫)\t12\t6",
  { nameNot: "169大众千喜鹤" });

t("摊平后：品名下挂 7 个带括号客户，一行不漏",
  "千张\t(307爱信车身日餐)0.1斤+(021金光汽车零部件)6斤+(038冷链)170斤+(271大众一期自助组)2斤+(169大众千喜鹤麻辣烫)12斤+(166大众千喜鹤米线)6斤+(163大众千喜鹤大灶)20斤\n" +
  "香干\t(330南鞍检测站)6斤+(163大众千喜鹤大灶)24斤+(271大众一期自助组)14斤\n" +
  "猪红\t(158复星医院总院饭堂)30斤+(159复星医院白玉兰饭堂)30斤",
  { qty: 320.1, lines: 3 });

t("香干三个客户全收",
  "香干\t(330南鞍检测站)6斤+(163大众千喜鹤大灶)24斤+(271大众一期自助组)14斤",
  { qty: 44, lines: 1 });

t("品名自带括号+规格，不该凭空造出数量14",
  "豆腐煨(大板豆腐)14斤/板\t板\t6",
  { qty: 6 });

t("规格(净重15斤/板)不该被当点位",
  "华晨豆腐(净重15斤/板)\t2板",
  { qty: 2 });

t("规格(200g/盒*20盒/件)不该被当点位",
  "魔芋丝结(200g/盒*20盒/件)\t1盒",
  { qty: 1 });

t("规格(0.069斤左右/串)不该被当点位",
  "无签豆腐串(0.069斤左右/串)\t5斤",
  { qty: 5 });

t("规格(含水15%)不该被当点位",
  "猪红(含水15%)\t(158复星医院总院饭堂)30斤+(159复星医院白玉兰饭堂)30斤",
  { qty: 60, lines: 1 });

console.log("\n【B. 原有格式不能坏】");

t("A格式 (点位)数量 多段累加",
  "千张\t(020#西餐厅)6斤____+(089)3斤____",
  { qty: 9, lines: 1 });

t("A格式 点位带说明 (268-本地 干水)",
  "老豆腐\t(268-本地 干水)1板+(251-要厚的)1板",
  { qty: 2, lines: 1 });

t("A格式 紧贴商品名的编号点位仍要认",
  "华晨小板豆腐(353#02)2板",
  { qty: 2 });

t("B格式 数量*点位【】",
  "内脂嫩豆腐\t2盒*KC概念餐厅(月付)【519】",
  { qty: 2, lines: 1 });

t("C格式 数量*[点位]",
  "豆腐（小板）\t4板*[A06致兴]",
  { qty: 4, lines: 1 });

t("E格式 名称+总数",
  "攸县香干\t85斤",
  { qty: 85, lines: 1 });

t("交叉表 点位是纯中文(总店/图强)仍要认",
  "猪红\t(总店)2公斤+(图强)3公斤+(横江)3公斤+(沥中)5.5公斤+(东海)2公斤+(金叶)1.5公斤",
  { qty: 17, lines: 1 });

t("(5斤装)是规格不是点位",
  "水豆腐（25板5斤装）\t(137#6)1斤+(251)2斤",
  { qty: 3, lines: 1 });

t("同名不同单位要拆成两行",
  "水豆腐\t(02#03)10板+(137#6)1斤",
  { lines: 2, qty: 11 });

console.log("\n【B2. bare 剥名字 —— 规格挂在名字后面时，匹配全靠它】");
[["攸县香干80-90g(正方形6.5cm*厚1.5cm)", "攸县香干"],
 ["华晨豆腐(净重15斤/板)", "华晨豆腐"],
 ["华晨胶板豆腐(净重5斤)", "华晨胶板豆腐"],
 ["猪红(沥水)(含水15%)", "猪红"],
 ["猪红(含水)(含水率50%)", "猪红"],
 ["无签豆腐串(斤)(0.069斤左右/串)", "无签豆腐串"],
 ["山水豆腐(益群)(400g盒)", "山水豆腐"],
 ["浓浆豆腐(约8.5斤/板)", "浓浆豆腐"],
 ["魔芋丝结(200g/盒*20盒/件)", "魔芋丝结"],
 ["千张(豆皮)(薄)", "千张"],
 ["攸县香干", "攸县香干"]
].forEach(function (c) {
  var got = P.bare(c[0]);
  if (got === c[1]) { pass++; console.log("  ✅ " + c[0] + " → 「" + got + "」"); }
  else { fail++; console.log("  ❌ " + c[0] + " → 「" + got + "」 应为「" + c[1] + "」"); }
});

console.log("\n【C. isSpotCode 直判】");
[["089", "\t", true, "纯数字点位"],
 ["020#西餐厅", "\t", true, "编号+说明"],
 ["总店", "\t", true, "交叉表中文点位(独立出现)"],
 ["图强", "+", true, "加号后的中文点位"],
 ["麻辣烫", "鹤", false, "紧贴中文的纯中文 → 名字的一部分"],
 ["大板豆腐", "煨", false, "品名自带括号"],
 ["净重15斤/板", "腐", false, "规格"],
 ["200g/盒*20盒/件", "结", false, "规格"],
 ["0.069斤左右/串", "串", false, "规格"],
 ["含水15%", "红", false, "规格"],
 ["5斤装", "腐", false, "规格"],
 ["7盒", "\t", false, "总数不是点位"],
 ["中板", "\t", false, "单位不是点位"],
 ["353#02", "腐", true, "紧贴中文但像编号"]
].forEach(function (c) {
  var got = P.isSpotCode(c[0], c[1]);
  if (got === c[2]) { pass++; console.log("  ✅ (" + c[0] + ") 前一字「" + c[1] + "」→ " + got + "  " + c[3]); }
  else { fail++; console.log("  ❌ (" + c[0] + ") 前一字「" + c[1] + "」→ " + got + " 应为 " + c[2] + "  " + c[3]); }
});

console.log("\n【G. 括号里带说明的点位 —— 2026-08-02 康瑞达真单踩到的】");
/* 「(176A用白色框装)5板」原来被当成规格「…装」排掉，整段 5 板凭空消失。
   少发货是所有错里最坏的一种：单子上看不出来，客户收货才发现。 */
t("点位带说明文字，两段都要在",
  "胶盒水豆腐（中板）3.5kg\t(176A用白色框装)5板+(176E用白色箱子装)2板",
  { qty: 7, lines: 1 });
t("点位不带说明，照旧",
  "胶盒水豆腐（中板）3.5kg\t(176A)5板+(176E)2板",
  { qty: 7, lines: 1 });
t("(5斤装) 还是要当规格，不能变成点位",
  "水豆腐(5斤装)\t3板", { qty: 3, lines: 1 });
t("(500g装) 同上", "山水豆腐(500g装)\t6盒", { qty: 6, lines: 1 });
t("(2.5kg装) 同上", "老豆腐(2.5kg装)\t4板", { qty: 4, lines: 1 });
t("(散装) 同上", "阳山豆腐(散装)\t5斤", { qty: 5, lines: 1 });
t("康瑞达整行三个点位，数量要加满",
  "攸县香干\t(108B自选餐)20斤+(176E)5斤+(178A)3斤", { qty: 28, lines: 1 });

/* 括号里带说明的，点位那一栏要留住说明（送货的人靠这个找地方） */
(function () {
  const got = P.parseOrder("胶盒水豆腐（中板）3.5kg\t(176A用白色框装)5板+(176E用白色箱子装)2板");
  const codes = got[0].segs.map(g => g.code);
  const want = ["176A用白色框装", "176E用白色箱子装"];
  if (JSON.stringify(codes) === JSON.stringify(want)) { pass++; console.log("  ✅ 说明文字跟着点位一起留住  → " + codes.join(" / ")); }
  else { fail++; console.log("  ❌ 说明文字没留住\n       期望 " + JSON.stringify(want) + "\n       实得 " + JSON.stringify(codes)); }
})();

console.log("\n【F. 点位小标题】");
/* 「鹏运：」这种整行只有地名加冒号的，是点位小标题，不是商品。
   原来会变成一个数量 1 的假商品行混进单里。 */
function spot(name, text, want) {
  var got = P.parseOrder(text);
  var line = got.map(function (l) {
    return l.text + "@" + (l.segs.map(function (g) { return g.code; }).filter(Boolean).join(",") || "-");
  }).join(" | ");
  var ok = JSON.stringify(got.map(function (l) {
    return [l.text, l.segs.map(function (g) { return g.code || ""; }).join(",")];
  })) === JSON.stringify(want);
  if (ok) { pass++; console.log("  ✅ " + name + "  → " + line); }
  else {
    fail++;
    console.log("  ❌ " + name);
    console.log("       期望 " + JSON.stringify(want));
    console.log("       实得 " + line);
  }
}

spot("骏勉：三个点位各管各的",
  "鹏运：\n河粉1包\n千张2斤\n国力：\n熟猪红 5斤\n西樵：\n熟猪红 15斤",
  [["河粉", "鹏运"], ["千张", "鹏运"], ["熟猪红", "国力"], ["熟猪红", "西樵"]]);

spot("标题行本身不许变成商品",
  "鹏运：\n千张2斤",
  [["千张", "鹏运"]]);

spot("行内自带括号点位的，以行内为准，不被标题盖掉",
  "华南市场：\n千张 (020#西餐厅)6斤+(089)3斤",
  [["千张", "020#西餐厅,089"]]);

spot("没有标题就没有点位",
  "千张2斤\n河粉1包",
  [["千张", ""], ["河粉", ""]]);

/* 「水豆腐5斤：」带数字，不是点位标题，得当商品行留下来。
   而且现在会像人一样读成「水豆腐 5斤」—— 比原来「水豆腐5斤 = 1 份」对。 */
spot("带数字的不算点位标题（当商品行，数量也读出来）",
  "水豆腐5斤：\n千张2斤",
  [["水豆腐", ""], ["千张", ""]]);
(function () {
  const g = P.parseOrder("水豆腐5斤：")[0];
  if (g && g.qty === 5 && g.unit === "斤") { pass++; console.log("  ✅ 「水豆腐5斤：」读成 水豆腐 5斤"); }
  else { fail++; console.log("  ❌ 「水豆腐5斤：」 → " + JSON.stringify(g && { t: g.text, q: g.qty, u: g.unit })); }
})();

spot("「备注：」这类词不是点位",
  "备注：\n千张2斤",
  [["千张", ""]]);

spot("英文冒号也认",
  "西樵:\n千张2斤",
  [["千张", "西樵"]]);

console.log("\n【H. 像人一样找数量 —— 2026-08-02 品棠真单逼出来的】");
/* 老板原话：「你要以一个人的行为去思考，把它这种根本解决掉，不要去识别错误」。
   原来是每碰到一种新写法就加一条正则，没底。
   改成人的读法：先把括号里的规格蒙掉，剩下的字里那个数字就是数量，不管它长在哪。 */
[["攸县香干2(包装)", 2, "包装"],
 ["豆腐3板(要老的)", 3, "要老的"],
 ["云吞皮 (薄小)2斤", 2, "薄小"],
 ["5斤千张", 5, null],
 ["千张 5", 5, null],
 ["要2包攸县香干", 2, null],
 ["日本豆腐（40条/件）3件", 3, null],
 ["香干2.5斤(切片)", 2.5, "切片"],
 ["千张 (020#西餐厅)6斤", 6, null]].forEach(function (c) {
  const got = P.parseOrder(c[0])[0];
  const 数对 = got && got.qty === c[1];
  const 名对 = (c[2] === null) || (got && got.text.indexOf(c[2]) >= 0);
  if (数对 && 名对) { pass++; console.log("  ✅ 「" + c[0] + "」 → " + got.text + " = " + got.qty + (got.unit || "")); }
  else {
    fail++;
    console.log("  ❌ 「" + c[0] + "」\n       期望 数量" + c[1] + (c[2] ? ("、名字里要有「" + c[2] + "」") : "") +
      "\n       实得 " + (got ? (got.text + " = " + got.qty + (got.unit || "")) : "没解析出来"));
  }
});
/* 括号里的规格不能被当成订货量 —— 人也不会把「客家豆腐（7斤）」当成订 7 斤。
   2026-08-02 老板改了规矩：「有文字但没写具体数量的，全部不要放进来。」
   所以这种行现在整行不要，但要出现在「没写数量」名单里，让人看得见丢了什么。 */
["客家豆腐（7斤）", "水豆腐（25板5斤装）"].forEach(function (s) {
  const got = P.parseOrder(s);
  const 名单 = P.没写数量的();
  if (got.length === 0 && 名单.length === 1) {
    pass++; console.log("  ✅ 「" + s + "」括号里是规格不是数量 → 整行不要，进「没写数量」名单：" + 名单[0]);
  } else {
    fail++; console.log("  ❌ 「" + s + "」 → 出了 " + got.length + " 行，名单 " + JSON.stringify(名单));
  }
});
(function () {
  /* 真读不出数量的，整行不要，但名单里要有 */
  const g = P.parseOrder("攸县香干 若干");
  if (g.length === 0 && P.没写数量的().length === 1) {
    pass++; console.log("  ✅ 「攸县香干 若干」整行不要，名单里有");
  } else { fail++; console.log("  ❌ 「若干」→ 出了 " + g.length + " 行"); }
  /* 「两包」读得出来（= 2 包），该放进来 */
  const g2 = P.parseOrder("攸县香干 两包")[0];
  if (g2 && g2.qty === 2 && P.没写数量的().length === 0) {
    pass++; console.log("  ✅ 「两包」读成 2 包，正常放进来");
  } else { fail++; console.log("  ❌ 「两包」→ " + JSON.stringify(g2 && { q: g2.qty, u: g2.unit })); }
  /* 正常读到数量的行不许进名单，否则满屏警告等于没警告 */
  P.parseOrder("千张 5斤");
  if (P.没写数量的().length === 0) { pass++; console.log("  ✅ 正常行不进名单（免得满屏警告）"); }
  else { fail++; console.log("  ❌ 正常行也进了名单"); }
  /* 客户微信里常年挂的「常订品名单」，一行都不该进单 */
  const 名单单 = P.parseOrder("三角豆泡斤\n豆腐串串\n炸腐竹包\n米豆腐盒\n鸭血件\n千张3斤");
  if (名单单.length === 1 && 名单单[0].qty === 3 && P.没写数量的().length === 5) {
    pass++; console.log("  ✅ 常订品名单 5 项全挡在外面，只有「千张3斤」进单");
  } else {
    fail++; console.log("  ❌ 常订品名单 → 进了 " + 名单单.length + " 行，挡下 " + P.没写数量的().length + " 项");
  }
})();

console.log("\n【H2. 原来那几条也不能坏】");
/* 「攸县香干2(包装)」原来读成 1：括号在最后面，行尾配不上「数字+单位」，
   整行退到「没写数量 = 1」。而这家按斤 ¥3、按包 ¥15，差 5 倍。 */
t("数量在括号说明前面，要读到", "攸县香干2(包装)", { qty: 2, lines: 1 });
t("带单位的也一样", "豆腐3板(要老的)", { qty: 3, lines: 1 });
t("括号在前面的照旧", "饺子皮(薄大)3斤", { qty: 3, lines: 1 });
/* 「客家豆腐（7斤）」没写数量 → 整行不要（老板 8/2 定的），
   括号里的 7 更不许当成订 7 斤 */
t("没数量的整行不要，更不许把规格当数量", "客家豆腐（7斤）", { qty: 0, lines: 0 });

(function () {
  /* 尾巴上的说明要留在商品名里 —— 它常常正是区分两个品的那几个字 */
  const g = P.parseOrder("攸县香干2(包装)");
  if (g[0] && g[0].text.indexOf("包装") >= 0) { pass++; console.log("  ✅ 「包装」留在商品名里  → " + g[0].text); }
  else { fail++; console.log("  ❌ 「包装」从商品名里丢了 → " + (g[0] ? g[0].text : "没解析出来")); }

  const h = P.parseOrder("云吞皮 (薄小)2斤");
  if (h[0] && h[0].text.indexOf("薄小") >= 0 && !h[0].segs[0].code) {
    pass++; console.log("  ✅ 「薄小」当规格留在名里，不是点位  → " + h[0].text);
  } else {
    fail++; console.log("  ❌ 「薄小」被当成点位了 → " + (h[0] ? (h[0].text + "  点位" + h[0].segs[0].code) : "?"));
  }

  const k = P.parseOrder("猪红\t(总店)2公斤+(图强)3公斤");
  if (k[0] && k[0].segs.length === 2 && k[0].segs[0].code === "总店") {
    pass++; console.log("  ✅ 真点位（总店/图强）没被误伤");
  } else {
    fail++; console.log("  ❌ 真点位被误伤了 → " + JSON.stringify(k[0] && k[0].segs.map(x => x.code)));
  }
})();

console.log("\n【I. 中文数字 + 点位标题 —— 2026-08-02 骏勉真单】");
/* 客户写「嫩豆腐(一板)」不写阿拉伯数字，读不出来就成了「没写数量」= 漏发。
   点位标题（骏勉鹏运：/ 西樵：/ 国力：）必须当点位，不能当商品。 */
spot("骏勉整张：三个点位各归各的",
  "骏勉鹏运：\n嫩豆腐(一板)\n肠粉 1 包\n西樵：\n熟猪血： 12 斤\n国力：\n熟猪红： 3 斤",
  [["嫩豆腐", "骏勉鹏运"], ["肠粉", "骏勉鹏运"], ["熟猪血", "西樵"], ["熟猪红", "国力"]]);
t("括号里的中文数字是数量：(一板) = 1板", "嫩豆腐(一板)", { qty: 1, lines: 1 });
t("两包 = 2", "豆腐 两包", { qty: 2, lines: 1 });
t("半板 = 0.5", "豆腐 半板", { qty: 0.5, lines: 1 });
t("三斤 = 3", "千张 三斤", { qty: 3, lines: 1 });
t("十斤 = 10", "水豆腐 十斤", { qty: 10, lines: 1 });
t("二十斤 = 20", "千张 二十斤", { qty: 20, lines: 1 });
t("「熟猪血： 12 斤」冒号在中间，不是点位标题", "熟猪血： 12 斤", { qty: 12, lines: 1 });

/* ★ 最要紧的一条：商品名里本来就带中文数字的，一个都不许念坏。
   千张、三角豆泡、五香干、九龙豆腐、一分利…… 拿全库商品名跑一遍。 */
(function () {
  try {
    require("./数据-价格库.js");
    const D = global.window.GM_DATA;
    const 见过 = {}, 坏 = [];
    D.items.forEach(function (it) {
      const nm = it[2];
      if (!nm || 见过[nm]) return;
      见过[nm] = 1;
      if (!/[零〇一二两三四五六七八九十半]/.test(nm)) return;
      const got = P.parseOrder(nm + " 1斤");
      /* 名字里的中文数字不该被换成阿拉伯数字（后面不是单位就不该动） */
      if (got.length && /\d/.test(got[0].text) && !/\d/.test(nm)) 坏.push(nm + " → " + got[0].text);
    });
    if (!坏.length) {
      pass++;
      console.log("  ✅ 全库 " + Object.keys(见过).length + " 个商品名，没有一个被中文数字规则念坏");
    } else {
      fail++;
      console.log("  ❌ 有 " + 坏.length + " 个商品名被念坏：");
      坏.slice(0, 8).forEach(function (x) { console.log("       " + x); });
    }
  } catch (e) { console.log("  （跳过全库校验：" + e.message + "）"); }
})();

console.log("\n【J. 点位用冒号隔开 —— 2026-08-02 惠丰真单】");
/* 观麦导出的「明细」列：点位不带括号，用冒号隔开、加号连段。
   原来配不上，整行退到兜底规则只抓最后一个数字 —— 7 板凭空没了。 */
t("小板水豆腐 7板+3板 = 10板，不是 3板",
  "小板水豆腐\t广州交通管理局（广元中路338号）:7板+京都电工-邬亚林:3板:(3板)",
  { qty: 10, lines: 1 });
t("单段的也认", "魔芋\t三院荔湾:9斤", { qty: 9, lines: 1 });
t("点位名里带横杠的也认", "千张/豆腐皮\t京都电工-邬亚林:10斤", { qty: 10, lines: 1 });
spot("冒号格式的点位要留住",
  "小板水豆腐\t广州交通管理局（广元中路338号）:7板+京都电工-邬亚林:3板",
  [["小板水豆腐", "广州交通管理局(广元中路338号),京都电工-邬亚林"]]);
/* 没有 Tab 的行不能套这条规则，否则商品名会被当成点位 */
(function () {
  const g = P.parseOrder("熟猪血： 12 斤")[0];
  if (g && g.text.indexOf("熟猪血") >= 0 && g.qty === 12 && !g.segs[0].code) {
    pass++; console.log("  ✅ 没 Tab 的「熟猪血： 12 斤」不套这条 —— 商品名没被当成点位");
  } else {
    fail++; console.log("  ❌ 「熟猪血： 12 斤」 → " + JSON.stringify(g && { t: g.text, q: g.qty, code: g.segs[0].code }));
  }
})();

console.log("\n【K. 汇总表：空格子不能塌、规格列要用上 —— 2026-08-02 蔬源】");
/* 这张表一行有 7 列：商品名称 商品规格 客户简称 单据类型 预定数 单位 备注。
   踩到三个坑，每个都让整行算错价：
     ① 「预定数」不在数量列的认法里 → 整张表退到通用规则，单位列跟着丢
     ② 空格子被 \t+ 吃掉 → 后面所有列左移一格，2板 变成 2斤
     ③ 「（午餐）」那一列跟下一列的数字隔着 Tab 也被当成「(点位)数量」 */
var 蔬源表头 = "商品名称\t商品规格\t客户简称\t单据类型\t预定数\t单位\t备注\n";
(function () {
  var g = P.parseOrder(蔬源表头 + "客家豆腐\t7斤/板\t大沥人民法庭\t（午餐）\t18\t斤\t")[0];
  var 对 = g && g.qty === 18 && g.unit === "斤" && g.text.indexOf("7斤/板") >= 0
        && g.segs[0].code === "大沥人民法庭";
  if (对) { pass++; console.log("  ✅ 规格并进名字、单位是斤、点位取客户简称  → " + g.text + "=" + g.qty + g.unit + "@" + g.segs[0].code); }
  else { fail++; console.log("  ❌ 蔬源第一行 → " + JSON.stringify(g && { t: g.text, q: g.qty, u: g.unit, c: g.segs[0].code })); }
})();
(function () {
  /* 「单据类型」是空的那一行 —— 空格子一塌，2板 就变成 2斤，价差一倍 */
  var g = P.parseOrder(蔬源表头 + "华晨豆腐\t7斤/板\t里水燃气\t\t2\t板\t")[0];
  var 对 = g && g.qty === 2 && g.unit === "板" && g.segs[0].code === "里水燃气";
  if (对) { pass++; console.log("  ✅ 中间有空格子，列不错位  → " + g.text + "=" + g.qty + g.unit + "@" + g.segs[0].code); }
  else { fail++; console.log("  ❌ 空格子那行 → " + JSON.stringify(g && { t: g.text, q: g.qty, u: g.unit, c: g.segs[0].code })); }
})();
(function () {
  /* 备注里的真数量照旧救得回来（数量列写 0、备注写「4块」）*/
  var g = P.parseOrder(蔬源表头 + "水豆腐\t\t九江燃气\t\t0\t斤\t4块")[0];
  if (g && g.qty === 4) { pass++; console.log("  ✅ 数量列 0、备注写 4块 → 救回 4"); }
  else { fail++; console.log("  ❌ 备注救数量 → " + JSON.stringify(g && { t: g.text, q: g.qty })); }
})();
(function () {
  /* 规格列没数字的（「散装」）不并进名字，那是废话 */
  var g = P.parseOrder(蔬源表头 + "阳山豆腐\t散装\t三水税局\t\t5\t斤\t")[0];
  if (g && g.text.indexOf("散装") < 0 && g.qty === 5) { pass++; console.log("  ✅ 规格「散装」不并进名字"); }
  else { fail++; console.log("  ❌ 散装那行 → " + JSON.stringify(g && { t: g.text, q: g.qty })); }
})();
/* 没有表头时，空格子还是要去掉 —— 不然「最后一个纯数字格」被空格子挡住 */
t("没表头的表格，空格子不挡数量", "攸县香干\t\t\t85\t斤", { qty: 85, lines: 1 });
/* 表格末尾那行公司名（商品名那格是空的、整行没数字）不该变成一个商品 */
t("表末尾的「蔬源」不变成商品",
  蔬源表头 + "香干\t\t三水税局\t\t7\t斤\t\n\t\t蔬源\t\t\t\t",
  { lines: 1, qty: 7 });
t("整行空白也不变成商品", 蔬源表头 + "香干\t\t三水税局\t\t7\t斤\t\n\t\t\t\t\t\t", { lines: 1, qty: 7 });
/* 但凡行里有数字就不敢丢 —— 丢掉一行有数量的就是悄悄少发货 */
t("商品名空着但有数字的行，宁可留下来让人删",
  蔬源表头 + "\t\t三水税局\t\t7\t斤\t", { lines: 1 });

console.log("\n【L. 逗号前面是送到哪儿，不是货 —— 2026-08-02 蔬源 855.65 那单】");
/* 「桃盛酒店，山水豆腐 3 盒」原来整行商品名变成「桃盛酒店,山水豆腐」，
   人看着像认不出，顺手就删了 —— 这一单少了 ¥9。 */
spot("酒店名切成点位", "桃盛酒店，山水豆腐 3 盒", [["山水豆腐", "桃盛酒店"]]);
t("数量单位不受影响", "桃盛酒店，山水豆腐 3 盒", { qty: 3, lines: 1 });
spot("税局、饭堂、派出所都算地方", "三水税局，香干 7 斤", [["香干", "三水税局"]]);
/* 前半段不像地方的，一个字都不许切 —— 切掉就是丢商品 */
spot("「客家豆腐，老豆腐 3斤」不切（前半段是货不是地方）",
  "客家豆腐，老豆腐 3斤", [["客家豆腐,老豆腐", ""]]);
t("带 Tab 的表格行不套这条（逗号在备注格里）",
  蔬源表头 + "豆腐卜\t\t石东派出所\t（午餐）\t1\t斤\t靓，大，要空心那种",
  { qty: 1, lines: 1 });

console.log("\n【M. 数量旁边那格是光单位，就是单位不是点位】");
spot("「攸县香干 ⇥ 85 ⇥ 斤」的点位不该是「斤」", "攸县香干\t85\t斤", [["攸县香干", ""]]);
(function () {
  var g = P.parseOrder("攸县香干\t85\t斤")[0];
  if (g && g.unit === "斤") { pass++; console.log("  ✅ 而且单位取到了「斤」"); }
  else { fail++; console.log("  ❌ 单位应该是 斤，实得「" + (g && g.unit) + "」"); }
})();
spot("数量后面是真点位的照旧当点位", "千张\t5\tA06致兴", [["千张", "A06致兴"]]);

console.log("\n【N. 备注里写了数量就以备注为准 —— 老板 8/2「统一解决掉」】");
/* 客户的表是先填一个数、后来改主意再写在备注里。备注是后写的，那才是他要的。
   两种都归这一条管：数量列填 0（原来整行被丢掉），数量列填了别的数（原来按错的发货）。 */
function 备注(name, 行, 应数, 应标) {
  var g = P.parseOrder(蔬源表头 + 行)[0];
  var s0 = g && g.segs[0] || {};
  var okq = g && Math.abs(g.qty - 应数) < 0.0001;
  var okt = (!!s0.qtyFromNote) === !!应标;
  if (okq && okt) { pass++; console.log("  ✅ " + name + "  → " + g.qty + (g.unit || "") + (s0.qtyFromNote ? "（取自备注）" : "")); }
  else { fail++; console.log("  ❌ " + name + "\n       应该 " + 应数 + (应标 ? "（取自备注）" : "（原样）") + "\n       实得 " + (g ? g.qty + (s0.qtyFromNote ? "（取自备注）" : "") : "整行没了")); }
}
备注("数量列 0、备注「4块」→ 4", "水豆腐\t\t九江燃气\t\t0\t斤\t4块", 4, true);
备注("备注「要4块」也认（数量列是 0）", "水豆腐\t\t某处\t\t0\t斤\t要4块", 4, true);
/* ★ 数量列已经写了数的，备注【不许顶掉】—— 老板 2026-08-03 选的 A 案：
     「数量列已经写了数的，备注不许顶掉它，拎出来问我。」
   祺之盛「1.5斤*要3块*B006」：1.5 斤是订货量，「要3块」是加工要求（切成三块），
   顶掉就成 3 斤，多发一倍。老路子把整个备注当点位吞了、从来没读出来过；
   新的读结构把备注读出来了，这条老规矩就撞上了。 */
备注("数量列 3、备注「5斤」→ 【不改】，拎出来问", "水豆腐\t\t九江燃气\t\t3\t斤\t5斤", 3, false);
备注("数量列 8.5、备注「10+4」→ 【不改】", "嫩豆腐\t\t喜悦汇\t\t8.5\t斤\t10+4", 8.5, false);
备注("数量列 9、备注「实际6斤」→ 【不改】", "水豆腐\t\t某处\t\t9\t斤\t实际6斤", 9, false);
备注("备注跟数量列一样 → 不动", "水豆腐\t\t九江燃气\t\t3\t斤\t3斤", 3, false);
/* 备注里夹着别的字的一律不动 —— 从一句话里抠数字当数量，错的比对的多 */
备注("「靓，大，要空心那种」不动", "豆腐卜\t\t石东派出所\t\t1\t斤\t靓，大，要空心那种", 1, false);
备注("「大只」不动", "豆腐卜\t\t灯湖派出所\t\t3.5\t斤\t大只", 3.5, false);
备注("「2楼」不当数量", "豆腐卜\t\t某处\t\t6\t斤\t2楼", 6, false);
备注("「20号送」不当数量", "豆腐卜\t\t某处\t\t6\t斤\t20号送", 6, false);
备注("「点心」不动", "炸片\t\t市检察院\t\t2\t斤\t点心", 2, false);
(function () {
  /* 数量列 0 → 从备注捞回来的，出处要留着给人看，不能悄悄换 */
  var g = P.parseOrder(蔬源表头 + "水豆腐\t\t九江燃气\t\t0\t斤\t4块")[0];
  if (g && g.segs[0].qtyFromNote === "4块") { pass++; console.log("  ✅ 数量从哪儿来的留着，界面上要标出来"); }
  else { fail++; console.log("  ❌ qtyFromNote 应该是「4块」，实得 " + (g && g.segs[0].qtyFromNote)); }
})();
(function () {
  /* 两个数都摆出来让人挑 —— 不许自作主张改，也不许悄悄丢 */
  P.parseOrder(蔬源表头 + "水豆腐\t\t九江燃气\t\t3\t斤\t5斤");
  var q = P.备注跟数量对不上的 ? P.备注跟数量对不上的() : [];
  if (q.length === 1 && q[0].数量列 === 3 && q[0].备注数 === 5 && q[0].点位 === "九江燃气") {
    pass++; console.log("  ✅ 两个数都摆出来了：数量列 3 / 备注 5，等人挑");
  } else { fail++; console.log("  ❌ → " + JSON.stringify(q)); }
})();
(function () {
  P.parseOrder(蔬源表头 + "水豆腐\t\t九江燃气\t\t3\t斤\t3斤");
  var q = P.备注跟数量对不上的 ? P.备注跟数量对不上的() : [];
  if (!q.length) { pass++; console.log("  ✅ 两个数一样就不啰嗦"); }
  else { fail++; console.log("  ❌ 一样也报了 → " + JSON.stringify(q)); }
})();

console.log("\n【O. 一串加法要全加起来 —— 2026-08-02 创鲜汇】");
/* 客户一天分几次报数，就写成一串加法，最后不写总数。
   原来只认到最后一个数：攸县香干 81 斤出成 5 斤，白豆干 45 斤出成 25 斤。
   那张单 11 行错了 8 行，少收 ¥800 多。 */
t("小豆泡 1+3+2+4+2+1 = 13", "小豆泡    1+3+2+4+2+1", { qty: 13, lines: 1 });
t("攸县香干 11 段加起来 = 81", "攸县香干    1+1+5+16+2+5+5+6+30+5+5", { qty: 81, lines: 1 });
t("小数也加得对 0.3+1 = 1.3", "大豆泡    0.3+1", { qty: 1.3, lines: 1 });
t("千张 2+4+6+3+1+5+1+1+0.8 = 23.8", "千张    2+4+6+3+1+5+1+1+0.8", { qty: 23.8, lines: 1 });
t("最后带单位的：10+60+40+5 串 = 115串", "豆腐串    10+60+40+5 串", { qty: 115, lines: 1 });
(function () {
  var g = P.parseOrder("豆腐串    10+60+40+5 串")[0];
  if (g && g.unit === "串" && g.segs[0].sumOf === "10+60+40+5") { pass++; console.log("  ✅ 单位是串，原式留着给人核"); }
  else { fail++; console.log("  ❌ 单位/原式 → " + JSON.stringify(g && { u: g.unit, s: g.segs[0].sumOf })); }
})();
t("只有两段的也算 2+45 = 47", "烟干    2+45", { qty: 47, lines: 1 });
/* 带单位的分段是另一套规则管的，别被这条抢走 */
t("「(H1171)14斤+(1090)8斤」照旧 22", "水豆腐\t(H1171)14斤+(1090)8斤", { qty: 22, lines: 1 });
t("「6斤+3斤」这种带单位的不套这条", "千张\t(020#西餐厅)6斤+(089)3斤", { qty: 9, lines: 1 });
/* 表格里数量格写成加法的也要加对 */
(function () {
  var g = P.parseOrder(蔬源表头 + "千张皮\t\t大沥燃气\t\t2+4+6\t斤\t")[0];
  if (g && g.qty === 12) { pass++; console.log("  ✅ 表格数量格写「2+4+6」→ 12"); }
  else { fail++; console.log("  ❌ 表格数量格加法 → " + (g && g.qty)); }
})();
/* 备注格写成加法的也要加对（原来只认两段）*/
(function () {
  var g = P.parseOrder(蔬源表头 + "小豆泡\t\t某处\t\t0\t斤\t4+8+5+12")[0];
  if (g && g.qty === 29) { pass++; console.log("  ✅ 备注写「4+8+5+12」→ 29"); }
  else { fail++; console.log("  ❌ 备注加法 → " + (g && g.qty)); }
})();
/* 加号两边不全是数字的，一个都不许当加法 */
t("「10斤+4块」还是走原来那条（14）", 蔬源表头 + "嫩豆腐\t\t某处\t\t0\t斤\t10斤+4块", { qty: 14 });

console.log("\n【P. 一行里好几个数字，别挑错那个 —— 2026-08-02 观麦导出表】");
/* 表头：单据日期 商品名称 规格 单位 数量 单位编号 备注。
   「单位编号」是点位号，排在数量右边。原来「取最后一个数字」，
   32 行全把点位号当成了订货量：大豆泡 6斤 出成 218 斤。 */
var 观麦表头 = "单据日期\t商品名称\t规格\t单位\t数量\t单位编号\t备注\n";
(function () {
  var g = P.parseOrder(观麦表头 + "2026-08-03\t大豆泡\t\t斤\t6\t218\t")[0];
  var 对 = g && g.qty === 6 && g.unit === "斤" && g.segs[0].code === "218";
  if (对) { pass++; console.log("  ✅ 有表头：数量 6、单位编号当点位  → " + g.text + "=" + g.qty + g.unit + "@" + g.segs[0].code); }
  else { fail++; console.log("  ❌ 有表头那行 → " + JSON.stringify(g && { t: g.text, q: g.qty, u: g.unit, c: g.segs[0].code })); }
})();
/* 表头被识别丢了也不能错 —— 单位那一格旁边的数字才是数量 */
(function () {
  var 组 = [["大豆泡\t斤\t6\t218", 6, "斤", "218"],
            ["水豆腐\t5斤/板\t板\t4\t104", 4, "板", "104"],
            ["花泉山水豆腐\t12盒/件\t件\t1\t207", 1, "件", "207"],
            ["豆腐串\t50串/包\t包\t1\t163", 1, "包", "163"]];
  组.forEach(function (x) {
    var g = P.parseOrder(x[0])[0];
    if (g && g.qty === x[1] && g.unit === x[2] && g.segs[0].code === x[3]) {
      pass++; console.log("  ✅ 没表头也挑对：" + x[0].replace(/\t/g, " ⇥ ") + " → " + g.qty + g.unit + "@" + g.segs[0].code);
    } else {
      fail++; console.log("  ❌ " + x[0].replace(/\t/g, " ⇥ ") + " → " + JSON.stringify(g && { q: g.qty, u: g.unit, c: g.segs[0].code }));
    }
  });
})();
/* 找不到单位格的照旧「取最后一个数字」，老写法一条不许坏 */
t("没有单位格 → 还是取最后一个数字", "169大众千喜鹤(麻辣烫)\t12\t6", { qty: 6 });
spot("数量在单位左边的也认", "攸县香干\t85\t斤", [["攸县香干", ""]]);
(function () {
  var g = P.parseOrder("攸县香干\t85\t斤")[0];
  if (g && g.qty === 85 && g.unit === "斤") { pass++; console.log("  ✅ 「攸县香干 ⇥ 85 ⇥ 斤」还是 85斤"); }
  else { fail++; console.log("  ❌ → " + JSON.stringify(g && { q: g.qty, u: g.unit })); }
})();

console.log("\n【Q. 段里补的数：单位对得上才算，对不上是别的货 —— 2026-08-03 江云】");
/* 老板 8/3 原话把这两条彻底分开了：
     (A003 禧月荟-6块)0斤    「6块其实也是6斤」        → 块是嫩豆腐的计件说法，算进这一行
     (B180 光华#幼儿-6盒)0斤 「那6盒不是水豆腐，是山水豆腐，搞混掉了」
                              → 盒不是嫩豆腐的单位，那是【另一个商品】的订货
                              → 不算进这一行，但也不许悄悄丢，挑出来提醒人

   江云 8/3 实证：嫩豆腐 26斤（算进去就成 32斤，多收 ¥7.50），
   那 6 盒在观麦另开成「尝元山水豆腐 6盒 ¥15」。 */
t("「-6盒」不算进嫩豆腐（盒不是这一行的单位）",
  "嫩豆腐\t(B189 丽枫#员工)3斤____+(B157 广美)2斤____+(A042 蓝蝶)4斤____+" +
  "(B176 育丁堡#教师)3斤____+(A016优托艺)7斤____+(A832 春华#员工餐)4斤____+" +
  "(B180 光华#幼儿-6盒)0斤____+(A823 里水维也纳#员工)3斤____", { qty: 26, lines: 1 });
(function () {
  /* 不算进来，但必须挑出来 —— 悄悄丢掉就是漏发别人的货 */
  var 别 = P.别的货();
  if (别.length === 1 && 别[0].写的 === "6盒" && 别[0].本行单位 === "斤") {
    pass++; console.log("  ✅ 那 6 盒被挑出来了：" + 别[0].商品 + "@" + 别[0].点位 + " 写着「6盒」");
  } else { fail++; console.log("  ❌ 没挑出来 → " + JSON.stringify(别)); }
})();
t("「-6块」照旧算 6斤（块是嫩豆腐的计件说法）",
  "嫩豆腐\t(B189 丽枫#早餐)2斤____+(B129 美喇#员工餐)4.5斤____+" +
  "(A 003 禧月荟-6块)0斤____+(A832 春华#员工餐)2斤____", { qty: 14.5, lines: 1 });
(function () {
  if (P.别的货().length === 0) { pass++; console.log("  ✅ 「6块」不算「别的货」（块跟斤是一回事）"); }
  else { fail++; console.log("  ❌ 「6块」被当成别的货了"); }
})();
备注("备注列：4块 配 斤 → 算 4", "水豆腐\t\t九江燃气\t\t0\t斤\t4块", 4, true);
t("备注列：4盒 配 斤 → 不算，整行不进单", 蔬源表头 + "水豆腐\t\t某处\t\t0\t斤\t4盒", { lines: 0 });
备注("备注列：6盒 配 盒 → 算 6", "内酯豆腐\t\t某处\t\t0\t盒\t6盒", 6, true);
备注("没写单位的照旧算", "嫩豆腐\t\t某处\t\t0\t斤\t10+4", 14, true);

console.log("\n【Q2.「没放进来」不许误报 —— 2026-08-03 江云连报两次】");
/* 报「没放进来」，人的第一反应是「整行丢了，赶紧补」。
   所以只有【这个商品一行都没剩下】才准报：
     · 8 段里 1 段是 0、其余 26 斤在单上   → 不报
     · 识别把行断开，那段自成一行被丢掉，商品还在另一行 → 不报（已在「别的货」里报过）
     · 真的整行都没了                      → 照报 */
(function () {
  var 组 = [
    ["一整行", "嫩豆腐\t26斤\t(B189 丽枫#员工)3斤+(B157 广美)2斤+(B180 光华#幼儿-6盒)0斤+(A823 里水)3斤", 0],
    ["断成两行", "嫩豆腐\t26斤\t(B189 丽枫#员工)3斤+(B157 广美)2斤\n嫩豆腐\t(B180 光华#幼儿-6盒)0斤+(A823 里水)3斤", 0],
    ["那段自成一行", "嫩豆腐\t26斤\t(B189 丽枫#员工)3斤+(B157 广美)2斤\n嫩豆腐\t(B180 光华#幼儿-6盒)0斤", 0],
    ["真的整行没了", "三角豆泡斤\n豆腐串串\n千张3斤", 2]
  ];
  组.forEach(function (c) {
    P.parseOrder(c[1]);
    var n = P.没写数量的().length;
    if (n === c[2]) { pass++; console.log("  ✅ " + c[0] + " → 报 " + n + " 项"); }
    else { fail++; console.log("  ❌ " + c[0] + " → 报了 " + n + " 项，该报 " + c[2] + " 项：" + JSON.stringify(P.没写数量的())); }
  });
})();

console.log("\n【R. 拿「总数量」列当校验码 —— 老板 8/3：「识别错误怎么避免」】");
/* 识别把「4板」读成「5板」，规则挡不住（字就长得像）。
   但采购表每一行都有客户填的「总数量」，跟各段之和一比就露馅。
   ⚠ 只报不改 —— 以分布清单为准，总数量列客户自己也常填不准。 */
(function () {
  var g = P.parseOrder("靓胶板豆腐7斤\t16.5板\t(B185 博艺#幼儿)2板+(A002 鹤峰#幼儿餐)4板+(B163 南方明珠)1板")[0];
  if (g && g.qty === 7 && g.总数 && g.总数.qty === 16.5) {
    pass++; console.log("  ✅ 总数量列记下来了：分布 " + g.qty + "板、表上 " + g.总数.qty + "板（对不上，会报）");
  } else { fail++; console.log("  ❌ → " + JSON.stringify(g && { q: g.qty, 总: g.总数 })); }
})();
(function () {
  var g = P.parseOrder("靓胶板豆腐7斤\t7板\t(B185 博艺#幼儿)2板+(A002 鹤峰#幼儿餐)4板+(B163 南方明珠)1板")[0];
  if (g && g.总数 && Math.abs(g.总数.qty - g.qty) < 0.001) {
    pass++; console.log("  ✅ 对得上的不报");
  } else { fail++; console.log("  ❌ 对得上的却报了 → " + JSON.stringify(g && { q: g.qty, 总: g.总数 })); }
})();
(function () {
  var g = P.parseOrder("靓胶板豆腐7斤\t(B185 博艺#幼儿)2板+(A002)4板")[0];
  if (g && !g.总数) { pass++; console.log("  ✅ 没有总数量列的，不凭空造一个"); }
  else { fail++; console.log("  ❌ 凭空造了个总数 → " + JSON.stringify(g && g.总数)); }
})();
/* 商品名不能被总数量那一格顶掉 */
(function () {
  var g = P.parseOrder("靓胶板豆腐7斤\t16.5板\t(B185 博艺#幼儿)2板")[0];
  if (g && g.text.indexOf("靓胶板豆腐") >= 0) { pass++; console.log("  ✅ 多一列不影响商品名"); }
  else { fail++; console.log("  ❌ 商品名被顶掉了 → " + (g && g.text)); }
})();

/* ══════ 看不清就写 ?，不许猜 ══════
   老板 2026-08-03：「不要逼他写个数字，不确定的就写 ?，我们自己输入。」
   猜出来的数没人查得出来 —— 4 看成 5，单子发出去才发现。写 ? 摆在明面上。 */
console.log("\n── 看不清的写 ? ──");
(function () {
  var g = P.parseOrder("小豆腐卜\t(A865宝德#员工)?斤")[0];
  var s = g && g.segs && g.segs[0];
  if (s && s.没看清 && s.qty === 0 && s.code === "A865宝德#员工") {
    pass++; console.log("  ✅ 括号点位的 ? → 标没看清、数量留空");
  } else { fail++; console.log("  ❌ → " + JSON.stringify(g && g.segs)); }
})();
(function () {
  var g = P.parseOrder("攸县香干\t?斤")[0];
  if (g && g.segs && g.segs[0] && g.segs[0].没看清 && g.qty === 0 && g.unit === "斤") {
    pass++; console.log("  ✅ 整行数量是 ? → 行留着、单位还在");
  } else { fail++; console.log("  ❌ → " + JSON.stringify(g && { q: g.qty, u: g.unit, s: g.segs })); }
})();
/* 数量 0 的段本来要丢掉（不然「嫩豆腐没放进来」）——但 ? 是没看清，不是没有 */
(function () {
  var g = P.parseOrder("水豆腐\t(B01 甲)3板+(B02 乙)?板")[0];
  var n = g && g.segs ? g.segs.length : 0;
  if (n === 2 && g.segs[1].没看清 && g.qty === 3) {
    pass++; console.log("  ✅ 一段看得清一段没看清，两段都留着（qty 先算 3）");
  } else { fail++; console.log("  ❌ 没看清那段被当 0 丢了 → " + JSON.stringify(g && g.segs)); }
})();
(function () {
  var r = P.parseOrder("小豆腐卜\t(A865宝德#员工)?斤");
  var q = P.没看清的 ? P.没看清的() : null;
  if (q && q.length === 1 && q[0].单位 === "斤" && q[0].点位 === "A865宝德#员工") {
    pass++; console.log("  ✅ 没看清的()把这几处报出来，页面好挡");
  } else { fail++; console.log("  ❌ → " + JSON.stringify(q)); }
})();
(function () {
  var r = P.parseOrder("水豆腐\t3板");
  var q = P.没看清的 ? P.没看清的() : [];
  if (q.length === 0) { pass++; console.log("  ✅ 都看得清就不报"); }
  else { fail++; console.log("  ❌ 干净单子也报了 → " + JSON.stringify(q)); }
})();
/* ? 只许出现在数量位。商品名里带问号（客户自己打的）不能当没看清 */
(function () {
  var g = P.parseOrder("水豆腐？\t3板")[0];
  var 有 = (g && g.segs || []).some(function (s) { return s.没看清; });
  if (g && g.qty === 3 && !有) { pass++; console.log("  ✅ 名字里的问号不算没看清"); }
  else { fail++; console.log("  ❌ → " + JSON.stringify(g && { q: g.qty, s: g.segs })); }
})();

/* ══════ 横杠：什么时候是分隔符，什么时候是号的一部分 ★ ══════
   2026-08-03 祺之盛真单上炸了两处：
     · 点位号 E002-01 被拆成「点位 E002 + 备注 01」，一张单弹七八条「备注里另有一个数」
     · 韧豆腐（6.5-7斤）的规格被当成点位，再拆成「点位 6.5 + 备注 7斤」，
       接着触发「备注写的是别的单位」
   规矩：横杠后面【带汉字】才算说明；纯数字/字母的尾巴是号的一部分。 */
/* ══════ 没冒号的点位小标题 ══════
   2026-08-03 老板看到「新又好」「（上林一品店）」被报成「没写数量」。
   放宽两种、就两种：整行被括号包着，或者结尾是地名字（店/超市/仓/厂…）。
   卡这么紧是因为：不带冒号的短中文行跟「客户就是想订一份嫩豆腐」分不开，
   认成点位 = 把一行货悄悄吞掉，那是最坏的错。 */
console.log("\n【没冒号的点位小标题：只认一眼是地方的】");
(function () {
  var LF = String.fromCharCode(10);
  function 跑(t) { var ls = P.parseOrder(t); return { ls: ls, 无量: P.没写数量的() }; }
  var a = 跑("（上林一品店）" + LF + "千张 5斤");
  if (a.ls.length === 1 && a.ls[0].segs[0].code === "上林一品店" && !a.无量.length) {
    pass++; console.log("  ✅ 括号包着的店名 → 点位");
  } else { fail++; console.log("  ❌ → " + JSON.stringify(a)); }

  var b = 跑("新又好超市" + LF + "千张 5斤");
  if (b.ls.length === 1 && b.ls[0].segs[0].code === "新又好超市") {
    pass++; console.log("  ✅ 以「超市」结尾 → 点位");
  } else { fail++; console.log("  ❌ → " + JSON.stringify(b)); }

  var c = 跑("嫩豆腐" + LF + "千张 5斤");
  if (c.无量.indexOf("嫩豆腐") >= 0 && !c.ls.some(function (L) { return L.segs[0].code === "嫩豆腐"; })) {
    pass++; console.log("  ✅ 光名字的真商品不当点位吞掉，报出来让人看");
  } else { fail++; console.log("  ❌ 把「嫩豆腐」当点位吞了 → " + JSON.stringify(c)); }

  var d = 跑("新又好" + LF + "千张 5斤");
  if (d.无量.indexOf("新又好") >= 0) {
    pass++; console.log("  ✅ 既没括号又不带地名字的，照旧摆出来问（机器分不出就别拿主意）");
  } else { fail++; console.log("  ❌ → " + JSON.stringify(d)); }

  var e = 跑("鹏运：" + LF + "千张 5斤");
  if (e.ls[0].segs[0].code === "鹏运") { pass++; console.log("  ✅ 带冒号的老写法没坏"); }
  else { fail++; console.log("  ❌ → " + JSON.stringify(e)); }
})();

console.log("\n【横杠：分隔符还是号的一部分】");
(function () {
  var g = P.parseOrder("豆腐串\t(E002-01)25串+(E006-01)30串+(C008-01)15串")[0];
  var cs = (g && g.segs || []).map(function (s) { return s.code; }).join(",");
  var 有备注 = (g && g.segs || []).some(function (s) { return s.note; });
  if (cs === "E002-01,E006-01,C008-01" && !有备注) {
    pass++; console.log("  ✅ 点位号带 -01 的不拆（E002-01 还是 E002-01）");
  } else { fail++; console.log("  ❌ → " + cs + (有备注 ? "，还多出了备注" : "")); }
})();
(function () {
  var g = P.parseOrder("韧豆腐（6.5-7斤）\t(E028)1板+(E017)2板")[0];
  var ok1 = g && g.text.indexOf("6.5-7斤") >= 0;
  var cs = (g && g.segs || []).map(function (s) { return s.code; }).join(",");
  if (ok1 && cs === "E028,E017") { pass++; console.log("  ✅ (6.5-7斤) 是规格，留在名字里，不当点位"); }
  else { fail++; console.log("  ❌ 名「" + (g && g.text) + "」点位 " + cs); }
})();
(function () {
  var g = P.parseOrder("老豆腐（8-9斤/板）\t(A1)2板")[0];
  if (g && g.text.indexOf("8-9斤") >= 0 && g.segs[0].code === "A1") {
    pass++; console.log("  ✅ (8-9斤/板) 同理");
  } else { fail++; console.log("  ❌ 名「" + (g && g.text) + "」点位 " + (g && g.segs[0].code)); }
})();
(function () {
  var g = P.parseOrder("千张\t(268-本地 干水)1板")[0];
  if (g && g.segs[0].code === "268" && g.segs[0].note === "本地 干水") {
    pass++; console.log("  ✅ 真·点位带说明照旧拆（268-本地 干水）");
  } else { fail++; console.log("  ❌ → " + JSON.stringify(g && g.segs[0])); }
})();
(function () {
  /* 老板 8/3 江云那条：数量列是 0、说明里写着「6块」→ 按 6 斤发 */
  var g = P.parseOrder("嫩豆腐\t(A003 禧月荟-6块)0斤")[0];
  if (g && g.qty === 6) { pass++; console.log("  ✅ 带汉字的说明还是能捞出数量（-6块 → 6斤）"); }
  else { fail++; console.log("  ❌ → " + JSON.stringify(g && g.segs)); }
})();

/* ══════ 老板 8/11 发的 8 张真文字单挖出来的坑 ══════
   全都是【闷声算错钱】那一类：读出一个数，只是那个数不对。 */
console.log("\n── 8/11 真单：字母 O 当零 ──");
(function () {
  /* 手机九宫格最容易按出这个，客户自己也看不出来。
     河粉7O斤 读成 7 斤 —— 差 10 倍，而且屏幕上一句话都没有。 */
  var 例 = [["河粉7O斤", 70, "斤"], ["肠粉1O斤", 10, "斤"], ["粿条1O斤", 10, "斤"],
            ["豆腐串1O串", 10, "串"], ["面筋(圆的)O.5", 0.5, ""], ["陈村粉1O斤", 10, "斤"]];
  例.forEach(function (e) {
    var g = P.parseOrder(e[0])[0] || {};
    var ok = g.qty === e[1] && (g.unit || "") === e[2];
    if (ok) { pass++; console.log("  ✅ " + e[0] + " → " + g.qty + (g.unit || "")); }
    else { fail++; console.log("  ❌ " + e[0] + " 期望 " + e[1] + e[2] + "，实际 " + g.qty + (g.unit || "")); }
  });
  /* 名字里单独一个 O 不许被改坏 */
  var a = P.parseOrder("AO豆腐3斤")[0] || {};
  if (a.text === "AO豆腐" && a.qty === 3) { pass++; console.log("  ✅ 名字里的 O 不动：AO豆腐3斤"); }
  else { fail++; console.log("  ❌ 名字里的 O 被改坏了 → " + JSON.stringify(a)); }
})();

console.log("\n── 8/11 真单：规格/尺寸不许当数量 ──");
(function () {
  /* 造一个数比读不出来更糟：读不出来会摆出来问，造出来的数悄悄算进钱里。 */
  var 该没数量 = ["5oog山水豆腐透明包装", "保鲜膜件30 X 40的"];
  该没数量.forEach(function (s) {
    var r = P.parseOrder(s);
    var 无 = !r.length || r[0].qty === 0;
    if (无) { pass++; console.log("  ✅ " + s + " → 不造数量，摆出来问"); }
    else { fail++; console.log("  ❌ " + s + " 凭空造出数量 " + r[0].qty + (r[0].unit || "")); }
  });
  var b = P.parseOrder("5oog山水豆腐透明包装2合")[0] || {};
  if (b.qty === 2 && b.unit === "盒") { pass++; console.log("  ✅ 500g 是规格、2合 才是数量 → 2盒"); }
  else { fail++; console.log("  ❌ 5oog…2合 → " + JSON.stringify(b)); }
  var c = P.parseOrder("2件30 X 40的")[0] || {};
  if (c.qty === 2 && c.unit === "件") { pass++; console.log("  ✅ 尺寸前面真有数量的照样算：2件"); }
  else { fail++; console.log("  ❌ 2件30 X 40的 → " + JSON.stringify(c)); }
})();

console.log("\n── 8/11 真单：括号没关上 / 合当盒 ──");
(function () {
  var 例 = [["油面6斤(分2袋", 6, "斤"],      /* 老写法读成 2袋，6 斤凭空没了 */
            ["千张3斤(要薄的", 3, "斤"],
            ["盒鲜豆腐3合", 3, "盒"], ["盒装黑豆腐1合", 1, "盒"],
            ["客家豆腐（7斤）2板", 2, "板"],  /* 括号成对的照旧对 */
            ["攸县香干2(包装)", 2, ""]];
  例.forEach(function (e) {
    var g = P.parseOrder(e[0])[0] || {};
    var ok = g.qty === e[1] && (g.unit || "") === e[2];
    if (ok) { pass++; console.log("  ✅ " + e[0] + " → " + g.qty + (g.unit || "")); }
    else { fail++; console.log("  ❌ " + e[0] + " 期望 " + e[1] + e[2] + "，实际 " + g.qty + (g.unit || "")); }
  });
})();

console.log("\n── 8/11 真单：顿号列举要拆行 ──");
(function () {
  /* 华丰大良最后一行 13 样货连成一条 —— 老写法只读出 1 行，另外 12 样连名字都没进单。
     敢拆的依据：价格库 5892 个商品名里一个带顿号的都没有。 */
  var s = "保鲜膜件30 X 40的、酱菜盒件、脆黄瓜皮件、甜蕌头件、鸡蛋干包、肉卷袋、糖蒜件";
  P.parseOrder(s);
  var 没数量 = P.没写数量的();
  if (没数量.length >= 6 && 没数量.indexOf("糖蒜件") >= 0 && 没数量.indexOf("酱菜盒件") >= 0) {
    pass++; console.log("  ✅ 拆成了 " + 没数量.length + " 条，每样都摆出来问");
  } else { fail++; console.log("  ❌ 只拆出 " + 没数量.length + " 条 → " + JSON.stringify(没数量)); }
  /* 只有一个顿号的不许拆 —— 那多半是句读 */
  var one = P.parseOrder("永超汇脆件要有青豆、补的");
  if (one.length <= 1) { pass++; console.log("  ✅ 一个顿号不拆"); }
  else { fail++; console.log("  ❌ 一个顿号也拆了 → " + one.length + " 行"); }
})();

console.log("\n── 8/11 真单：+ 连写照旧加得对（创鲜汇） ──");
(function () {
  var 例 = [["千张   0.4+0.5+1+2+1.6+1+8+3+1+3", 21.5],
            ["攸县香干  2+1+3+5+1.5+4+2+10+2.8+5+23", 59.3],
            ["白豆干   5+20+0.2+0.5", 25.7],
            ["豆腐串   30+10+15+40+100串", 195]];
  例.forEach(function (e) {
    var g = P.parseOrder(e[0])[0] || {};
    if (g.qty === e[1]) { pass++; console.log("  ✅ " + e[0].split(/\s+/)[0] + " = " + g.qty); }
    else { fail++; console.log("  ❌ " + e[0] + " 期望 " + e[1] + "，实际 " + g.qty); }
  });
})();

/* ══════ 「没数量」分两种，处理完全相反 ★（老板 8/4 定，8/11 再确认）══════
   老板 8/4（看完花鹿碧翠那张微信群聊截图）：
     「没写数量的全部当 0 不进入系统，因为客户不想改他的订货模板。」
   老板 8/11：「不要丢掉，你要分清情况。」

     客户压根没写（鸭血 / 三角豆泡斤） → 不进单，顶上一行报个数，不弹窗
     我们没读出来（标了 ?）           → 硬拦，必须人填

   ⚠ 这两种【绝不许混】。把「我们没读出来」错归进「客户没写」＝静默漏货，
     那是这个项目最不能犯的错。8/4 那份备忘专门写了这条风险。
   ⚠ 2026-08-11 加了「规格/尺寸不当数量」的跳过规则，正好踩在这条线上 ——
     跳错了就会把有数量的行判成「客户没写」，所以这儿必须钉住。 */
console.log("\n── 「没数量」两种，不许混 ──");
(function () {
  function 判(s) {
    var r = P.parseOrder(s);
    if (P.没看清的().length) return "我们没读出来";
    if (P.没写数量的().length) return "客户没写";
    return r.length ? ("正常:" + r[0].qty + (r[0].unit || "")) : "空";
  }
  var 例 = [
    ["鸭血", "客户没写"],
    ["三角豆泡斤", "客户没写"],
    ["日本豆腐件", "客户没写"],
    ["保鲜膜件30 X 40的", "客户没写"],     /* 尺寸不算数量，但也不是「没读出来」 */
    ["5oog山水豆腐透明包装", "客户没写"],   /* 规格不算数量 */
    ["攸县香干 ?斤", "我们没读出来"],
    ["豆腐 ?板", "我们没读出来"],
    ["千张3斤", "正常:3斤"],
    ["油面6斤(分2袋", "正常:6斤"],          /* 别因为括号没关就判成没写 */
    ["河粉7O斤", "正常:70斤"]              /* 别因为字母 O 就判成没写 */
  ];
  例.forEach(function (e) {
    var g = 判(e[0]);
    if (g === e[1]) { pass++; console.log("  ✅ " + e[0].padEnd(22) + "→ " + g); }
    else { fail++; console.log("  ❌ " + e[0] + " 应该「" + e[1] + "」，实际「" + g + "」"); }
  });
})();

/* ── 段自己有数量时，备注里的东西不许另开一行（8/18 广垦）──
   广垦真单：「无签豆腐串 10包，备注 500串」「山水豆腐 16盒，备注 1件」。
   500串 就是那 10包（50串/包），1件 就是那 16盒 —— 同一笔货换个说法。
   原来因为「备注单位 ≠ 行单位」就判成另一个商品，各多加一行，
   金额从 1520.70 变成 1870.30，整整多算 349.60。
   老板 8/18：「数量只有那一列的才是数量，备注里的内容不要去管。」
   ⚠ 段自己没数量（0斤 + 备注6盒）那种照旧要提 —— 那才是 8/3 江云说的另一个商品。 */
(function () {
  console.log("\n── 段自己有数量时，备注不许另开一行（8/18 广垦）──");
  function 卷(名, 文, 该几条) {
    P.parseOrder(文);
    var out = P.parseOrder(文);
    P.收尾(out);
    var n = P.别的货().length;
    if (n === 该几条) { pass++; console.log("  ✅ " + 名 + "　别的货 " + n + " 条"); }
    else { fail++; console.log("  ❌ " + 名 + "　别的货 " + n + " 条，该 " + 该几条 + "：" +
             JSON.stringify(P.别的货().map(function (z) { return z.写的; }))); }
  }
  卷("10包 备注500串 —— 同一笔货，不许加行",
     "无签豆腐串 50个/包\t(佛山市顺德区罗定邦中学/蔬菜类-500串)10包", 0);
  卷("16盒 备注1件 —— 同一笔货，不许加行",
     "山水豆腐/盒 400g/盒\t(广东省疾病预防控制中心/午餐-1件)16盒", 0);
})();

console.log("\n══════════════════════════");
console.log(fail === 0 ? ("全部通过：" + pass + " 项") : ("通过 " + pass + " / 失败 " + fail));
process.exit(fail === 0 ? 0 : 1);
