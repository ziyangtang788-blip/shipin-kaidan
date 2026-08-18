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

  /* ---------- 老式 .xls（BIFF8）★ 2026-08-18 ----------
     老板当场撞到：微信里发来的「豆腐(1).xls」拖进去没反应。
     诊断页逐步打出来，卡在这儿 —— 不是拖拽坏了，是这个引擎只会解 zip
     （.xlsx/.docx 本质是 zip），老 .xls 是完全另一种东西（OLE2 复合文档 + BIFF 记录），
     原来一句 throw 就打发了：「用 Excel 另存成 .xlsx 再拖进来」。
     可他收到的单子就是这种，客户不会为他另存。

     ⚠ 一个数都不许读错 —— 拿他那张真单（毅服采购单，40 行）跟 SheetJS
       逐格比过：165 个非空格子，一个不差。测试里用自造的 BIFF 钉住。 */

  /* RK 是 Excel 省地方的存法：低两位是标志，剩下 30 位要么是整数，要么是 double 的高位 */
  function rk值(v) {
    let x;
    if (v & 0x02) x = v >> 2;
    else {
      const b = new ArrayBuffer(8), d = new DataView(b);
      d.setUint32(4, v & 0xFFFFFFFC, true); x = d.getFloat64(0, true);
    }
    return (v & 0x01) ? x / 100 : x;
  }

  /* 把 OLE2 复合文档里的 Workbook 那一股取出来 */
  function 取Workbook(u8) {
    const dv = new DataView(u8.buffer, u8.byteOffset, u8.length);
    const SS = 1 << dv.getUint16(30, true), MS = 1 << dv.getUint16(32, true);
    const fat = [], fatSecs = [];
    const nFat = dv.getUint32(44, true);
    for (let i = 0; i < Math.min(nFat, 109); i++) {
      const s = dv.getUint32(76 + i * 4, true); if (s <= 0xFFFFFFFA) fatSecs.push(s);
    }
    /* 大文件：FAT 扇区号在头里排不下，接在 DIFAT 链上 */
    let d = dv.getUint32(68, true);
    for (let g = 0; d <= 0xFFFFFFFA && g < dv.getUint32(72, true) + 8; g++) {
      const off = (d + 1) * SS;
      for (let k = 0; k < SS - 4; k += 4) { const s = dv.getUint32(off + k, true); if (s <= 0xFFFFFFFA) fatSecs.push(s); }
      d = dv.getUint32(off + SS - 4, true);
    }
    fatSecs.forEach(s => { for (let k = 0; k < SS; k += 4) fat.push(dv.getUint32((s + 1) * SS + k, true)); });

    const 链 = st => { const c = []; let s = st, g = 0; while (s <= 0xFFFFFFFA && g++ < 200000) { c.push(s); s = fat[s]; } return c; };
    function 读链(st, size) {
      const cs = 链(st), out = new Uint8Array(cs.length * SS);
      cs.forEach((s, i) => out.set(u8.subarray((s + 1) * SS, (s + 1) * SS + SS), i * SS));
      return size ? out.subarray(0, size) : out;
    }
    const dir = 读链(dv.getUint32(48, true));
    const dd = new DataView(dir.buffer, dir.byteOffset, dir.length);
    const ents = [];
    for (let i = 0; (i + 1) * 128 <= dir.length; i++) {
      const o = i * 128, nl = dd.getUint16(o + 64, true); if (!nl) continue;
      let name = ""; for (let k = 0; k < nl - 2; k += 2) name += String.fromCharCode(dd.getUint16(o + k, true));
      const type = dir[o + 66]; if (!type) continue;
      ents.push({ name: name, type: type, start: dd.getUint32(o + 116, true), size: dd.getUint32(o + 120, true) });
    }
    const wb = ents.filter(e => e.type === 2 && /^(Workbook|Book)$/i.test(e.name))[0];
    if (!wb) throw new Error("这个 .xls 里没有 Workbook");
    if (wb.size >= 4096) return 读链(wb.start, wb.size);
    /* 小于 4K 的流放在「迷你流」里，另有一套扇区表 */
    const root = ents.filter(e => e.type === 5)[0];
    const mini = 读链(root.start);
    const mf = [];
    链(dv.getUint32(60, true)).forEach(s => { for (let k = 0; k < SS; k += 4) mf.push(dv.getUint32((s + 1) * SS + k, true)); });
    const out = new Uint8Array(Math.ceil(wb.size / MS) * MS);
    let s = wb.start, i = 0;
    while (s <= 0xFFFFFFFA) { out.set(mini.subarray(s * MS, s * MS + MS), i * MS); s = mf[s]; i++; }
    return out.subarray(0, wb.size);
  }

  /* Workbook 那一股 → 每张表的格子 */
  function 解BIFF(s) {
    const dv = new DataView(s.buffer, s.byteOffset, s.length);
    const recs = []; let p = 0;
    while (p + 4 <= s.length) {
      const t = dv.getUint16(p, true), l = dv.getUint16(p + 2, true);
      if (p + 4 + l > s.length) break;
      recs.push({ t: t, p: p + 4, l: l }); p += 4 + l;
    }
    /* ---- 共享字符串表。字符串会被 CONTINUE 记录从中间切断，
           而且续块开头还有一个【新的】8位/16位标志字节 —— 不认这一条就整表串位。 ---- */
    const SST = [];
    let si = -1; for (let i = 0; i < recs.length; i++) if (recs[i].t === 0x00FC) { si = i; break; }
    if (si >= 0) {
      const blocks = [{ p: recs[si].p, end: recs[si].p + recs[si].l }];
      for (let k = si + 1; k < recs.length && recs[k].t === 0x003C; k++)
        blocks.push({ p: recs[k].p, end: recs[k].p + recs[k].l });
      const n = dv.getUint32(blocks[0].p + 4, true);
      let bi = 0, o = blocks[0].p + 8;
      const 挪 = () => { while (bi < blocks.length && o >= blocks[bi].end) { bi++; if (bi < blocks.length) o = blocks[bi].p; } };
      for (let i = 0; i < n && bi < blocks.length; i++) {
        挪(); if (bi >= blocks.length) break;
        const cch = dv.getUint16(o, true); o += 2;
        const flags = s[o]; o += 1;
        let rich = 0, far = 0;
        if (flags & 0x08) { rich = dv.getUint16(o, true); o += 2; }
        if (flags & 0x04) { far = dv.getUint32(o, true); o += 4; }
        let str = "", got = 0, wide = !!(flags & 0x01);
        while (got < cch) {
          挪(); if (bi >= blocks.length) break;
          const room = blocks[bi].end - o;
          const can = wide ? Math.min(cch - got, room >> 1) : Math.min(cch - got, room);
          for (let k = 0; k < can; k++) { str += String.fromCharCode(wide ? dv.getUint16(o, true) : s[o]); o += wide ? 2 : 1; }
          got += can;
          if (got < cch) {
            bi++; if (bi >= blocks.length) break;
            o = blocks[bi].p; wide = !!(s[o] & 0x01); o += 1;
          }
        }
        o += rich * 4 + far;
        SST.push(str);
      }
    }
    const 串 = (o, lenBytes) => {
      const cch = lenBytes === 1 ? s[o] : dv.getUint16(o, true); o += lenBytes;
      const flags = s[o]; o += 1; let str = "";
      for (let k = 0; k < cch; k++) { str += String.fromCharCode((flags & 0x01) ? dv.getUint16(o, true) : s[o]); o += (flags & 0x01) ? 2 : 1; }
      return str;
    };
    const 表 = []; let cur = null;
    const put = (r, c, v) => {
      if (!cur) return;
      while (cur.rows.length <= r) cur.rows.push([]);
      const row = cur.rows[r]; while (row.length <= c) row.push("");
      row[c] = v;
    };
    for (let i = 0; i < recs.length; i++) {
      const rec = recs[i], o = rec.p, t = rec.t;
      if (t === 0x0809) { if (!cur) cur = { rows: [] }; continue; }
      if (t === 0x000A) { if (cur && cur.rows.length) { 表.push(cur); cur = null; } continue; }
      if (!cur) continue;
      if (t === 0x00FD) put(dv.getUint16(o, true), dv.getUint16(o + 2, true), SST[dv.getUint32(o + 6, true)] || "");
      else if (t === 0x0203) put(dv.getUint16(o, true), dv.getUint16(o + 2, true), dv.getFloat64(o + 6, true));
      else if (t === 0x027E) put(dv.getUint16(o, true), dv.getUint16(o + 2, true), rk值(dv.getUint32(o + 6, true)));
      else if (t === 0x00BD) {                      /* 一条记录里连着好几格 */
        const r = dv.getUint16(o, true); let c = dv.getUint16(o + 2, true), q = o + 4;
        while (q + 6 <= rec.p + rec.l - 2) { put(r, c++, rk值(dv.getUint32(q + 2, true))); q += 6; }
      }
      else if (t === 0x0204 || t === 0x00D6) put(dv.getUint16(o, true), dv.getUint16(o + 2, true), 串(o + 6, 2));
      else if (t === 0x0006) {                      /* 公式：结果是数就用数；是字，紧跟着一条 STRING */
        const r = dv.getUint16(o, true), c = dv.getUint16(o + 2, true);
        if (dv.getUint16(o + 12, true) === 0xFFFF) {
          const k = s[o + 6];
          if (k === 0) { const nx = recs[i + 1]; put(r, c, (nx && nx.t === 0x0207) ? 串(nx.p, 2) : ""); }
          else if (k === 1) put(r, c, s[o + 8] ? "TRUE" : "FALSE");
          else put(r, c, "");
        } else put(r, c, dv.getFloat64(o + 6, true));
      }
    }
    if (cur && cur.rows.length) 表.push(cur);
    return 表.map((t, i) => ({ n: i + 1, rows: t.rows }));
  }

  function 读老excel(buf) {
    const u8 = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
    return 解BIFF(取Workbook(u8)).filter(t => t.rows.length >= 3);
  }

  /* ---------- 顶着 .xls 名字的 HTML 表格 ----------
     很多进销存系统（观麦也是）导出的「Excel」其实是一张 HTML 表格换了后缀，
     Excel 打得开，所以没人发现。他 Downloads 里那三张销售单就是这种。
     按后缀当老 .xls 去解会当场炸，所以要按【文件头】认，不认后缀。 */
  function 读HTML表(text) {
    const 去标签 = h => String(h)
      .replace(/<br\s*\/?>/gi, " ").replace(/<[^>]+>/g, "")
      .replace(/&nbsp;/gi, " ").replace(/&amp;/gi, "&")
      .replace(/&lt;/gi, "<").replace(/&gt;/gi, ">").replace(/&quot;/gi, '"')
      .replace(/&#(\d+);/g, (m, d) => String.fromCharCode(+d))
      .replace(/\s+/g, " ").trim();
    const 表 = [], tables = String(text).match(/<table[\s\S]*?<\/table>/gi) || [];
    tables.forEach((tb, i) => {
      const rows = [];
      (tb.match(/<tr[\s\S]*?<\/tr>/gi) || []).forEach(tr => {
        const cells = [];
        (tr.match(/<t[dh][\s\S]*?<\/t[dh]>/gi) || []).forEach(td => {
          cells.push(去标签(td));
          /* 合并格：后面补几个空的，列号才不会整行左移 */
          const cs = /colspan\s*=\s*"?(\d+)/i.exec(td);
          for (let k = 1; k < (cs ? +cs[1] : 1); k++) cells.push("");
        });
        if (cells.length) rows.push(cells);
      });
      if (rows.length >= 3) 表.push({ n: 表.length + 1, rows: rows });
    });
    return 表;
  }

  /* 按【头几个字节】认这个文件到底是什么 —— 后缀会骗人 */
  function 认文件头(u8) {
    if (u8.length >= 8 && u8[0] === 0xD0 && u8[1] === 0xCF && u8[2] === 0x11 && u8[3] === 0xE0) return "ole2";
    if (u8.length >= 2 && u8[0] === 0x50 && u8[1] === 0x4B) return "zip";
    let i = 0;
    if (u8[0] === 0xEF && u8[1] === 0xBB && u8[2] === 0xBF) i = 3;      /* UTF-8 BOM */
    while (i < u8.length && (u8[i] === 0x20 || u8[i] === 0x09 || u8[i] === 0x0A || u8[i] === 0x0D)) i++;
    if (u8[i] === 0x3C) return "html";                                   /* '<' */
    return "";
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
    if (t === "excel" || t === "老excel") {
      /* 格子一起带上 —— 有格子就能走「AI 只认表头、搬运本地干」那条便宜路。
         文字也留着：认表那一步万一没跑成，还能退回「全文发给 AI」的老路。

         ★ 2026-08-18：不再按后缀分 .xlsx / .xls，改成按【文件头】认。
           后缀天天骗人：微信发来的 .xls 是真老 Excel（OLE2），
           进销存导出的 .xls 其实是 HTML 表格，还有人把 .xlsx 改名叫 .xls。
           认错一次的后果就是「拖进去没反应」，老板 8/18 撞了一整天。 */
      const buf = await f.arrayBuffer();
      const u8 = new Uint8Array(buf);
      const 头 = 认文件头(u8);
      let grid;
      if (头 === "zip") grid = await readXlsxGrid(buf);
      else if (头 === "ole2") grid = 读老excel(u8);
      else if (头 === "html") grid = 读HTML表(new TextDecoder("utf-8").decode(u8));
      else throw new Error("「" + name + "」打不开 —— 它既不是 Excel 也不是表格文件。用 Excel 打开另存成 .xlsx 再拖进来，或者直接截图。");
      if (!grid.length) throw new Error("「" + name + "」里没找到表格。直接截图拖进来也行。");
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
    if (t === "老word") throw new Error("「" + name + "」是老式 .doc。用 Word 打开另存成 .docx 再拖进来，或者直接截图。");
    throw new Error("「" + name + "」这种文件不认识。支持：图片、PDF、Excel(.xlsx/.xls)、Word(.docx)、csv/txt");
  }

  root.GM_FILE = { readOne: readOne, readXlsx: readXlsx, readXlsxGrid: readXlsxGrid, readDocxGrid: readDocxGrid, readDocx: readDocx, unzip: unzip, 类型: 类型, 读老excel: 读老excel, 读HTML表: 读HTML表, 认文件头: 认文件头 };
})(typeof window !== "undefined" ? window : globalThis);
