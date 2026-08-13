/* 把 Excel / Word / PDF / 文本 文件读成文字
   ============================================================
   老板 8/2：「可不可以直接把 PDF 或者 word 文档或者 excel 表格拖进去，自动识别」

   分工：
     .xlsx .docx  —— 浏览器里自己解（它们本质是 zip），不花钱、不上传、最准
     .csv .txt    —— 直接读
     .pdf         —— 交给识别接口（PDF 认原生文档，比转图片准）
     图片         —— 还是走原来那条路

   为什么 Excel 要自己解不丢给模型看图：
     表格截图会糊、合并单元格会错行；直接读单元格拿到的是原始值，
     数量 2.5 不会变成 25，这是钱的事。

   解出来的文字仍旧送去让模型整理成「商品名<TAB>明细」，
   因为合并单元格、两级表头那些规矩都写在识别提示词里，别抄两份。 */
(function (root) {
  "use strict";

  /* ---------- 最小 unzip：只解 deflate 和 store ----------
     浏览器自带 DecompressionStream('deflate-raw')，不用外部库。 */
  async function unzip(buf) {
    const dv = new DataView(buf);
    const u8 = new Uint8Array(buf);
    /* 从尾巴往前找 EOCD */
    let eocd = -1;
    for (let i = u8.length - 22; i >= 0 && i > u8.length - 66000; i--) {
      if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
    }
    if (eocd < 0) throw new Error("不是有效的 zip（xlsx/docx 都是 zip）");
    const n = dv.getUint16(eocd + 10, true);
    let off = dv.getUint32(eocd + 16, true);
    const out = {};
    for (let k = 0; k < n; k++) {
      if (dv.getUint32(off, true) !== 0x02014b50) break;
      const method = dv.getUint16(off + 10, true);
      const csize = dv.getUint32(off + 20, true);
      const nameLen = dv.getUint16(off + 28, true);
      const exLen = dv.getUint16(off + 30, true);
      const cmLen = dv.getUint16(off + 32, true);
      const lho = dv.getUint32(off + 42, true);
      const name = new TextDecoder("utf-8").decode(u8.subarray(off + 46, off + 46 + nameLen));
      const lNameLen = dv.getUint16(lho + 26, true);
      const lExLen = dv.getUint16(lho + 28, true);
      const start = lho + 30 + lNameLen + lExLen;
      const raw = u8.subarray(start, start + csize);
      let data;
      if (method === 0) data = raw;
      else if (method === 8) {
        const ds = new DecompressionStream("deflate-raw");
        const ab = await new Response(new Blob([raw]).stream().pipeThrough(ds)).arrayBuffer();
        data = new Uint8Array(ab);
      } else throw new Error("这个 zip 用了不认识的压缩方式");
      out[name] = data;
      off += 46 + nameLen + exLen + cmLen;
    }
    return out;
  }

  const txt = u8 => new TextDecoder("utf-8").decode(u8);
  const unesc = s => String(s)
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'").replace(/&#(\d+);/g, (m, d) => String.fromCharCode(+d))
    .replace(/&amp;/g, "&");

  /* ---------- Excel ---------- */
  /* A1 → 列号 0 */
  function colOf(ref) {
    let c = 0;
    for (let i = 0; i < ref.length; i++) {
      const ch = ref.charCodeAt(i);
      if (ch < 65 || ch > 90) break;
      c = c * 26 + (ch - 64);
    }
    return c - 1;
  }

  /* 出「每张表的格子」——[{n:第几张, rows:[[格,格,…],…]}]
     为什么要这个：Excel 的格子我们本地看得一清二楚，
     根本不需要让 AI 把几百个数字再抄一遍 —— 它抄才最容易抄错，还最烧钱。
     4号豆制品那张：让 AI 全抄是 进4万/出4.6万；
     只让它认表头、搬运我们自己干，是 进2千/出200 —— 省 99%，还更准。 */
  async function readXlsxGrid(buf) {
    const z = await unzip(buf);
    /* 共享字符串 */
    const shared = [];
    if (z["xl/sharedStrings.xml"]) {
      const x = txt(z["xl/sharedStrings.xml"]);
      const re = /<si>([\s\S]*?)<\/si>/g; let m;
      while ((m = re.exec(x)) !== null) {
        const parts = m[1].match(/<t[^>]*>([\s\S]*?)<\/t>/g) || [];
        shared.push(unesc(parts.map(t => t.replace(/<[^>]+>/g, "")).join("")));
      }
    }
    /* 工作表：按 workbook 里的顺序，只取有内容的 */
    const sheets = Object.keys(z).filter(k => /^xl\/worksheets\/sheet\d+\.xml$/.test(k))
      .sort((a, b) => (+a.match(/\d+/)[0]) - (+b.match(/\d+/)[0]));
    const out = [];
    sheets.forEach(key => {
      const x = txt(z[key]);
      const rows = [];
      const rowRe = /<row[^>]*>([\s\S]*?)<\/row>/g; let rm;
      while ((rm = rowRe.exec(x)) !== null) {
        const cells = [];
        /* ★ 2026-08-04 修：空格子会把后面的数字吸过来 —— 数量落到别的商品头上。

           Excel 写出来的空格子是【自闭合】的：<c r="B4" s="3"/>
           原来这条正则第一个分支是 <c r="..."([^>]*)>([\s\S]*?)<\/c>，
           ([^>]*) 会把结尾那个 "/" 一起吃掉、当成普通属性，
           于是 <c r="B4" s="3"/> 也能匹配上，body 一路找到【后面某个格子的 </c>】，
           把人家的 <v> 捞进来 —— D 列的 1 就这么塞进了 B 列。

           好好多 8.5 那张真单：桂华店「炸豆卜1」读成了「饺子皮1」，
           罗村店「散装豆皮1」读成了「乡下烟干1」。整张表跟着串位，
           而且总计对不上还被我误判成「客户把总计填错了」。
           这是最贵的一种错：金额没问题、商品全错，单子打出来看不出来。

           改法：属性用【非贪婪】，然后明确二选一 —— 要么 "/>" 结束（空格子），
           要么 ">…</c>"（有内容）。 */
        const cRe = /<c\s+r="([A-Z]+\d+)"([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g;
        let cm;
        while ((cm = cRe.exec(rm[1])) !== null) {
          const ref = cm[1], attr = cm[2] || "", body = cm[3] || "";
          const ci = colOf(ref);
          let v = "";
          const inline = body.match(/<t[^>]*>([\s\S]*?)<\/t>/);
          const vm = body.match(/<v>([\s\S]*?)<\/v>/);
          if (/t="s"/.test(attr) && vm) v = shared[+vm[1]] || "";
          else if (inline) v = unesc(inline[1]);
          else if (vm) v = unesc(vm[1]);
          cells[ci] = String(v).trim();
        }
        for (let i = 0; i < cells.length; i++) if (cells[i] === undefined) cells[i] = "";
        if (cells.some(c => c !== "")) rows.push(cells);
      }
      if (rows.length) out.push({ n: out.length + 1, rows: rows });
    });
    if (!out.length) throw new Error("这个 Excel 里没读到内容");
    return out;
  }

  /* 老路子要的纯文字：几张表首尾相接，每张前面标一行。
     不标号的话读的人分不出「这是第二张表」还是「上一张表还没完」。
     2026-08-03「4号豆制品.xlsx」踩到：一个工作簿里 6 张表，
     两张透视表 + 一张 540 行明细，装的是【同一张单】——
     不分表就成了同一张单读三遍，数量直接三倍。 */
  async function readXlsx(buf) {
    const gs = await readXlsxGrid(buf);
    return gs.map(g => "### 第 " + g.n + " 张工作表\n" +
      g.rows.map(r => r.join("\t")).join("\n")).join("\n\n");
  }

  /* ---------- Word ---------- */
  async function readDocx(buf) {
    const z = await unzip(buf);
    const d = z["word/document.xml"];
    if (!d) throw new Error("这个 Word 文件里没找到正文");
    let x = txt(d);
    /* 表格单元格之间用 Tab，行之间换行，表格外的段落各成一行。
       顺序不能反：单元格里也裹着 <w:p>，先把 </w:p> 换成换行的话，
       一个单元格就成了一行，整张表散架。所以先吃掉单元格里的段落收尾。 */
    x = x.replace(/<\/w:p>\s*<\/w:tc>/g, "</w:tc>")
         .replace(/<\/w:tc>/g, "\t")
         .replace(/<\/w:tr>/g, "\n")
         .replace(/<\/w:p>/g, "\n");
    const parts = x.match(/<w:t[^>]*>([\s\S]*?)<\/w:t>|\t|\n/g) || [];
    const s = parts.map(p => (p === "\t" || p === "\n") ? p : unesc(p.replace(/<[^>]+>/g, ""))).join("");
    const lines = s.split("\n").map(l => l.replace(/\t+$/, "").trim()).filter(Boolean);
    if (!lines.length) throw new Error("这个 Word 文件里没读到文字");
    return lines.join("\n");
  }

  /* Word 里的表格 → 跟 Excel 一样的格子，好走「只认表头」那条便宜路。
     Word 单据十有八九就是一张表；把连着的、列数一样的行当成一张表。
     拆不出像样的表（正文全是句子）就返回空数组 —— 上层照旧走全量识别。 */
  async function readDocxGrid(buf) {
    const s = await readDocx(buf);
    const rows = s.split("\n").map(l => l.split("\t"));
    const 表 = [];
    let cur = null;
    rows.forEach(r => {
      /* 一格的行不算表格行（那是标题、段落） */
      if (r.length < 2) { cur = null; return; }
      if (!cur) { cur = { n: 表.length + 1, rows: [] }; 表.push(cur); }
      cur.rows.push(r.map(c => String(c == null ? "" : c).trim()));
    });
    /* 太短的（一两行）不当表 —— 认表那一步靠表头和行数判断，两行看不出什么 */
    return 表.filter(t => t.rows.length >= 3);
  }

  /* ---------- 入口 ---------- */
  const 类型 = f => {
    const n = (f.name || "").toLowerCase();
    if (/^image\//.test(f.type || "")) return "图片";
    if (/\.(xlsx|xlsm)$/.test(n)) return "excel";
    if (/\.xls$/.test(n)) return "老excel";
    if (/\.docx$/.test(n)) return "word";
    if (/\.doc$/.test(n)) return "老word";
    if (/\.pdf$/.test(n) || f.type === "application/pdf") return "pdf";
    if (/\.(csv|txt|tsv)$/.test(n) || /^text\//.test(f.type || "")) return "文本";
    return "";
  };

  /* 读一个文件 → {kind, text?, b64?, mime?, name}
     kind: "文字"（已经拿到文字，直接用）｜"pdf"（要送去识别）｜"图片"｜"不认识" */
  async function readOne(f) {
    const t = 类型(f);
    const name = f.name || "文件";
    if (t === "图片") {
      const b64 = await new Promise((res, rej) => {
        const fr = new FileReader();
        fr.onload = () => res(String(fr.result).split(",")[1]);
        fr.onerror = rej; fr.readAsDataURL(f);
      });
      return { kind: "图片", b64: b64, mime: f.type, name: name };
    }
    if (t === "pdf") {
      const b64 = await new Promise((res, rej) => {
        const fr = new FileReader();
        fr.onload = () => res(String(fr.result).split(",")[1]);
        fr.onerror = rej; fr.readAsDataURL(f);
      });
      return { kind: "pdf", b64: b64, mime: "application/pdf", name: name };
    }
    if (t === "文本") {
      const s = await f.text();
      return { kind: "文字", text: s, name: name };
    }
    if (t === "excel") {
      /* 格子一起带上 —— 有格子就能走「AI 只认表头、搬运本地干」那条便宜路。
         文字也留着：认表那一步万一没跑成，还能退回「全文发给 AI」的老路。 */
      const buf = await f.arrayBuffer();
      const grid = await readXlsxGrid(buf);
      const text = grid.map(g => "### 第 " + g.n + " 张工作表\n" +
        g.rows.map(r => r.join("\t")).join("\n")).join("\n\n");
      return { kind: "文字", text: text, grid: grid, name: name };
    }
    if (t === "word") {
      /* 格子一起带上 —— Word 里的表格也能走「只认表头」那条便宜路。
         拆不出表格（正文全是句子）时 grid 是空的，上层照旧走全量识别。 */
      const buf = await f.arrayBuffer();
      const text = await readDocx(buf);
      let grid = [];
      try { grid = await readDocxGrid(buf); } catch (e) { grid = []; }
      return { kind: "文字", text: text, grid: (grid.length ? grid : null), name: name };
    }
    if (t === "老excel") throw new Error("「" + name + "」是老式 .xls。用 Excel 打开另存成 .xlsx 再拖进来，或者直接截图。");
    if (t === "老word") throw new Error("「" + name + "」是老式 .doc。用 Word 打开另存成 .docx 再拖进来，或者直接截图。");
    throw new Error("「" + name + "」这种文件不认识。支持：图片、PDF、Excel(.xlsx)、Word(.docx)、csv/txt");
  }

  root.GM_FILE = { readOne: readOne, readXlsx: readXlsx, readXlsxGrid: readXlsxGrid, readDocxGrid: readDocxGrid, readDocx: readDocx, unzip: unzip, 类型: 类型 };
})(typeof window !== "undefined" ? window : globalThis);
