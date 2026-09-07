/* ============================================================
   匹配引擎 —— 从「下单表上写的词」找到「这家客户的哪个商品」

   这份代码原来长在 配送开单台.html 里，体检脚本和对词工具各抄了一份。
   一天之内因为「改了页面忘了改抄本」踩了三次，所以抽出来共用。
   页面、体检、对词工具、测试，从此跑的是同一份。

   函数体跟原来一字未改，只是把依赖收进一个 C（上下文）里传进来：
     C.DATA        价格库
     C.IDX         buildIndex 建的索引
     C.OV          覆盖层（学过的对照 maps、叫法本 gmap）
     C.usedN       (cid,sku) -> 这家最近下过几次
     C.seedLookup  (cid,text,unit) -> 预置对照
     C.learnedSku  (ci,text,unit) -> 学过的对照
   ============================================================ */
(function(root){
  "use strict";
  var P=root.GM_PARSE;
  var norm=P.norm,bare=P.bare,unitNorm=P.unitNorm,toHalf=P.toHalf;

  /* ===== 验收线：工具什么时候可以自己拍板 =====
     老板的原话：「你可以让他去选择，让他去学习，但是不能识别错误。」
     所以只有下面这几种结果算「有把握」，会直接落到单子上；
     其余一律弹出来让人点，点完就学会了。

     这份名单必须只有一处 —— 页面拿它决定哪一行弹下拉，
     体检拿它决定哪一条算静默事故。两边各写一份的话，
     总有一天页面放行了、体检还当它会问人，事故就漏过去了。
     （今天就栽过：「按最近下单习惯」那一步页面直接落单、体检当它会问人，
       818 条静默认错一条没报出来。） */
  var ASK={ none:1, fuzzy:1, cross:1, gmap:1, nocust:1 };
  function commits(how){ return !ASK[how]; }

  function better(DATA,usedN,ci,a,b){
    var cid=DATA.custs[ci][0];
    var ua=usedN(cid,DATA.items[a][6]), ub=usedN(cid,DATA.items[b][6]);
    if(ua!==ub) return ua>ub?a:b;
    var pa=DATA.items[a][4], pb=DATA.items[b][4];
    if((pa>0)!==(pb>0)) return pa>0?a:b;
    return a;
  }

  function buildIndex(DATA,usedN){
    var IDX;
    IDX={byCust:{},aliasAll:{}};
    DATA.items.forEach(function(it,i){
      /* ★★ 2026-09-07：这家客户删掉的品，索引里一个字都不许留 ——
         留了就还搜得到、还配得上，等于没删（老板：「停售的直接删掉」）。
         记号是 配送开单台.html 的 applyPX() 按覆盖层盖上去的。 */
      if(it._del) return;
      var ci=it[0];
      if(!IDX.byCust[ci]) IDX.byCust[ci]={list:[],alias:{},aliasU:{},bare:{},bareAll:{},prod:{},prodU:{},sku:{}};
      var b=IDX.byCust[ci];
      b.list.push(i); b.sku[it[6]]=i;
      var a=norm(it[2]); b.alias[a]=(b.alias[a]===undefined)?i:better(DATA,usedN,ci,b.alias[a],i);
      /* aliasU/prodU 留全部同名项 —— 同名不同单位是两个商品、两个价：
         阳春面[包]¥225 vs 阳春面[公斤]¥7、响铃卷（包）¥6 vs 响铃卷（件）¥192。
         只留一个会「看着完全命中、实际差几十倍」，这是最危险的静默错。 */
      (b.aliasU[a]=b.aliasU[a]||[]).push(i);
      /* bare 只留一个「最可能」的；bareAll 留全部 —— 同名不同规格要靠它挑
         （华晨豆腐 15斤/板 和 5斤/板 剥完都是「华晨豆腐」，差三倍价钱） */
      var ba=bare(it[2]);
      if(ba){
        b.bare[ba]=(b.bare[ba]===undefined)?i:better(DATA,usedN,ci,b.bare[ba],i);
        (b.bareAll[ba]=b.bareAll[ba]||[]).push(i);
      }
      if(!IDX.aliasAll[a]) IDX.aliasAll[a]=[]; IDX.aliasAll[a].push(i);
    });
    DATA.items.forEach(function(it,i){
      var ci=it[0], b=IDX.byCust[ci];
      var pn=norm(DATA.prods[it[1]]); b.prod[pn]=(b.prod[pn]===undefined)?i:better(DATA,usedN,ci,b.prod[pn],i);
      (b.prodU[pn]=b.prodU[pn]||[]).push(i);
      var pb=bare(DATA.prods[it[1]]); if(pb&&b.bare[pb]===undefined) b.bare[pb]=i;
    });
    return IDX;
  }

  /* 这家客户的价格表，是不是本来就靠「光名字后面那截」区分商品？
     是的话，教会一个词之后就不该把「光名字」也一起记下 ——
     碧源的水豆腐有 5斤装/7斤装/按斤三种，记了「水豆腐」这个光名字，
     等于拿先教的那个去顶后面所有同名的行。
     判断口径跟匹配时的 corePool 一致：一模一样，或者前面多几个字。 */
  function bareRisky(DATA,b,ba,unit){
    if(!ba||ba.length<2) return false;
    var p=b.list.filter(function(i){
      var ab=bare(DATA.items[i][2]);
      return ab&&(ab===ba||(ab.length>ba.length&&ab.slice(-ba.length)===ba));
    });
    if(unit){ var s=p.filter(function(i){ return DATA.items[i][3]===unit; }); if(s.length) p=s; }
    if(p.length<2) return false;
    var k={};
    p.forEach(function(i){ var t=DATA.items[i]; k[t[1]+"|"+t[3]+"|"+t[4]]=1; });
    return Object.keys(k).length>1;
  }

  /* 取一段文字里的「规格数字」，顺便把公斤折成斤。
     客户写「胶盒水豆腐 2.6kg」，价格库里叫「尝元小板豆腐（5斤）」——
     光比 2.6 和 5 永远对不上，折一下（2.6kg=5.2斤≈5斤）才对得上。
     折出来的数同时保留原数：3.5kg 既留 3.5 也留 7，两边哪个能对上都算。
     小数点后一位以内的差当同一个数（5.2 认成 5）：板货斤数本来就是约数。 */
  function specNums(text){
    var t=norm(text), out=(t.match(/\d+(\.\d+)?/g)||[]).slice();
    var re=/(\d+(?:\.\d+)?)\s*(?:kg|公斤|千克)/gi, m;
    while((m=re.exec(t))!==null){
      var 斤=parseFloat(m[1])*2;
      if(!(斤>0)) continue;
      [斤, Math.round(斤), Math.round(斤*10)/10].forEach(function(v){
        var s=String(v);
        if(out.indexOf(s)<0) out.push(s);
      });
    }
    return out;
  }

  function pickBySpec(DATA,grp,text,unit){
    var nums=specNums(text);
    var best=-1,bestScore=0,tie=0;
    grp.forEach(function(i){
      var it=DATA.items[i], s=norm((it[2]||"")+"|"+(it[5]||"")), sc=0;
      if(unit&&it[3]===unit) sc+=2;
      nums.forEach(function(x){
        if(new RegExp("(^|[^0-9])"+x+"([^0-9]|$)").test(s)) sc+=3;
      });
      if(sc>bestScore){ bestScore=sc; best=i; tie=0; }
      else if(sc===bestScore&&sc>0){ tie++; }
    });
    /* 并列第一 = 这个数字区分不了它们（牛皮豆干250g 和 牛皮豆干250g（40包/件）
       都含 250，一个 ¥7 一个 ¥280）→ 认输，交给人选 */
    if(tie>0) return -1;
    return bestScore>=3?best:-1;   /* 至少靠一个数字对上才算挑得出来 */
  }

  /* priceHint：客户单据上自己写的单价（识别时带出来的，见 引擎-解析.js 的「摘单价」）。
     这是最硬的证据 —— 名字像不像是猜的，客户白纸黑字写的价钱不是。
     只在「本来要弹窗问人」的时候用它，而且必须只有一条候选对得上价才算数。 */
  /* ===== 反义词闸门 =====
     客户白纸黑字写「大块」，配到「小块」上 —— 人一眼就知道不对，机器不该看不见。
     2026-08-02 真单上踩到：以前教过「猪红→猪血（小块）」，
     这次客户写「猪红 20斤（大块）」，光名字剥完还是「猪红」，
     于是顶着「已学会」的绿标配到小块上，一声不吭。

     规矩：下单表写了一边，配到的商品写着另一边 —— 一律交给人，
     并且把写对那一边的候选排到第一个，回车就是对的。
     只认这几对反义词，不认「有没有」—— 「客家豆腐」配「客家豆腐（大板）」
     不算冲突，那是客户没写而已，不是写反了。 */
  var 反义=[["大","小"],["厚","薄"],["老","嫩"],["粗","细"],["生","熟"],
            ["长","短"],["圆","扁"],["咸","甜"],["干","湿"]];
  function 词冲突(DATA,b,text,i){
    if(i<0||!b) return null;
    var t=norm(text), it=DATA.items[i], nm=norm((it[2]||"")+(it[5]||""));
    for(var k=0;k<反义.length;k++){
      var a=反义[k][0], z=反义[k][1];
      var 表a=t.indexOf(a)>=0, 表z=t.indexOf(z)>=0;
      if(表a===表z) continue;                       /* 两边都写或都没写 → 没信息 */
      var 要=表a?a:z, 反=表a?z:a;
      if(nm.indexOf(要)>=0) continue;                /* 配到的正好写着同一边 → 没冲突 */
      if(nm.indexOf(反)<0) continue;                 /* 配到的两边都没写 → 只是没写，不是写反 */
      /* 写反了。找这家客户里写对那一边的同门，排第一个当默认 */
      var ba=bare(it[2]), 好=[];
      b.list.forEach(function(x){
        var s=norm((DATA.items[x][2]||"")+(DATA.items[x][5]||""));
        if(s.indexOf(要)>=0&&bare(DATA.items[x][2]).indexOf(ba.replace(new RegExp(反,"g"),""))>=0) 好.push(x);
      });
      if(!好.length){
        b.list.forEach(function(x){
          var s=norm((DATA.items[x][2]||"")+(DATA.items[x][5]||""));
          if(s.indexOf(要)>=0&&s.indexOf(norm(bare(text)).slice(0,2))>=0) 好.push(x);
        });
      }
      return {want:要,got:反,cands:好};
    }
    return null;
  }

  /* ===== 一个计价单位等于几个散称单位 =====
     老板 2026-08-02：「客户要 18 斤，我给他 6 斤的，刚好就是 3 板。
     要 15 斤，6 斤的就不对，要给他 5 斤的。这个一定要对得上它总数。」

     所以得先知道「一板几斤」。三个地方找，越靠前越可信：
       ① 规格字段：「12盒/件」「40条/件」「0.4斤/块」
       ② 商品名里带的：「水豆腐7斤/板」
       ③ 商品名括号里的数 + 计价单位：「水豆腐（6斤）」+ 单位板 → 一板 6 斤

     ⚠「（14-15斤）」这种范围一律不算 —— 算 14 还是 15 差一板的钱，
       宁可弹窗问人。凑不出整数的也不许硬凑。 */
  var 小单位="(?:斤|公斤|kg|KG|克|g|G|条|串|块|片|个|只|盒|包|袋)";
  var 大单位="(?:板|件|箱|包|桶|袋|盒|扎|块)";
  function 一份几个(DATA,i){
    if(i<0||!DATA.items[i]) return null;
    var it=DATA.items[i], u=unitNorm(it[3]||"");
    if(!u) return null;
    var 名=toHalf(String(it[2]||"")), 规=toHalf(String(it[5]||""));

    /* ①② 「N小单位/大单位」这种写法，规格字段和商品名都找一遍 */
    var re=new RegExp("([0-9]+(?:\\.[0-9]+)?)\\s*("+小单位+")\\s*[\\/／]\\s*("+大单位+")");
    var m=规.match(re)||名.match(re);
    if(m){
      var n1=parseFloat(m[1]), s1=unitNorm(m[2]), b1=unitNorm(m[3]);
      /* 「1板/板」这种自己等于自己的没信息 */
      if(n1>0&&s1&&b1&&s1!==b1) return {n:n1,小:s1,大:b1,据:"规格 "+m[0]};
    }

    /* ③ 商品名括号里的斤数 + 计价单位。「水豆腐（6斤）」单位板 → 一板 6 斤 */
    var 括=名.match(/[（(]([^（()）]{1,20})[）)]/g)||[];
    for(var k=0;k<括.length;k++){
      var 内=括[k].slice(1,-1);
      var 数=内.match(/[0-9]+(?:\.[0-9]+)?/g)||[];
      if(数.length!==1) continue;                       /* 14-15斤 这种范围，不算 */
      var mu=内.match(new RegExp("([0-9]+(?:\\.[0-9]+)?)\\s*("+小单位+")\\s*$"));
      if(!mu) continue;
      var n2=parseFloat(mu[1]), s2=unitNorm(mu[2]);
      if(!(n2>0)||!s2||s2===u) continue;
      return {n:n2,小:s2,大:u,据:"商品名 "+括[k]};
    }
    return null;
  }

  /* 客户写的单位 ≠ 计价单位时，数量要乘几。
     返回 {mul,memo}；换不了返回 null（换不了就得问人，不能闷着算）。 */
  function 换算比(DATA,i,客户单位){
    var u0=unitNorm(客户单位||"");
    if(!u0||i<0||!DATA.items[i]) return null;
    var u1=unitNorm(DATA.items[i][3]||"");
    if(!u1||u0===u1) return null;                       /* 单位一样，不用换 */
    var r=一份几个(DATA,i);
    if(!r) return null;
    if(u0===r.小&&u1===r.大) return {mul:1/r.n,memo:"1"+r.大+"="+r.n+r.小+"（"+r.据+"）"};
    if(u0===r.大&&u1===r.小) return {mul:r.n,  memo:"1"+r.大+"="+r.n+r.小+"（"+r.据+"）"};
    return null;
  }

  /* ⛔ 2026-08-18 删掉了「斤怎么算」（客户报斤数时自动折成板）。
     老板原话：「不要不要不要，就是按照他下单的单位来，不要搞复杂了。
      他单位里面有就有，仓库里面有这个品就有；如果仓库里面没这个品、
      没这个单位，就直接跳出来让他自己选择就行了。这样很容易出错。」
     那条规矩是 8/2 定的稿（拿这货所有板型去除，除得尽就折板），
     跟观麦 9758 行也对得上 —— 但它会替人拿主意，错了看不出来。
     完整推导和例子在 git 里，看 2026-08-18 之前那版。
     现在只剩一句：客户写什么单位就按什么单位，仓库没有就弹出来让人挑。
     散称/根 这两个小工具下面还在用，留着。 */
  var 散称=P.散称;
  function 根(s){ return bare(s).replace(/[板盒件包箱桶袋]+$/,""); }


  /* 没写清楚时按哪一头算（GM_DEFAULT_SIDE，见 对照-预置.js）：
     「烟干」不写厚薄就是薄，写了「厚」才给厚。油片同理。
     这是生意上的默认，全公司通用，不用一家一家教。
     只在「客户两边都没写」时才动手；写了哪边就听哪边。 */
  function 默认那头(DATA,b,text,i,table){
    if(!table||i<0||!b) return -1;
    var t=norm(text);
    var keys=Object.keys(table);
    for(var k=0;k<keys.length;k++){
      if(t.indexOf(norm(keys[k]))<0) continue;
      var 该=table[keys[k]];                       /* 该给哪一头，比如「薄」 */
      var 另=null;
      for(var p=0;p<反义.length;p++){
        if(反义[p][0]===该) 另=反义[p][1];
        else if(反义[p][1]===该) 另=反义[p][0];
      }
      if(!另) continue;
      if(t.indexOf(该)>=0||t.indexOf(另)>=0) return -1;   /* 客户写了，听他的 */
      var nm=norm((DATA.items[i][2]||"")+(DATA.items[i][5]||""));
      if(nm.indexOf(该)>=0) return -1;                    /* 已经是该给的那头 */
      if(nm.indexOf(另)<0) return -1;                     /* 配到的两头都不沾，不管 */
      /* 配到了不该给的那头 —— 换成该给的那头 */
      var ba=bare(DATA.items[i][2]).replace(new RegExp(另,"g"),"");
      var 好=-1;
      b.list.forEach(function(x){
        if(好>=0) return;
        var s=norm((DATA.items[x][2]||"")+(DATA.items[x][5]||""));
        if(s.indexOf(该)>=0&&bare(DATA.items[x][2]).replace(new RegExp(该,"g"),"")===ba
           &&DATA.items[x][3]===DATA.items[i][3]) 好=x;
      });
      return 好;
    }
    return -1;
  }



  /* 客户报的是斤数、货只按板卖 → 换成凑得整的那种板。
     单独包一层，是因为里头几道闸门有 return 早退（教过的直接放行），
     写在里面会被跳过 —— 这一道必须每次都跑到。 */
  /* ===== 单位闸门 =====
     客户白纸黑字写「板」，配到按斤卖的货上 —— 一板 ¥9.5、一斤 ¥1.46，差 6 倍。
     2026-08-02 轩宝真单：「尝元韧豆腐5斤/板/厚度3cm 板 2」配到「尝元韧豆腐（斤）」，
     2 板出成 2 斤 ¥2.92。

     规矩：客户写的单位跟配到的商品对不上，而且换算不出比例（不知道一板几斤）
           → 同一族里有同单位的货就改配它；没有就交给人。
     换算得出比例的不归这条管 —— 那边「18斤=3板」已经把数量折过去了。 */
  function 单位对不上(DATA,b,unit,i){
    var u0=unitNorm(unit||"");
    if(!u0||i<0||!b) return null;
    var u1=unitNorm(DATA.items[i][3]||"");
    if(!u1||u0===u1) return null;
    /* ⛔ 2026-08-18 删掉了「能换算就放过去」这一条。
       原来写的是：能算出「1板=6斤」就交给后面那道折板去处理。
       可 8/18 老板把折板整个砍了（「不许系统转换」），后面没人接手了 ——
       再放过去就是「客户要 18 斤、单子开 18 板」，多发六倍，一声不吭。
       现在：单位不一样就是不一样，先找同单位的那条，找不到交给人。 */
    /* 同族的判断放松一点：库里同一个货常常两种写法
       （「尝元韧豆腐（斤）」和「尝元韧豆腐豆腐（6.5斤）」），
       严格相等就找不到同单位的那条，默认还是落在斤货上。 */
    var g=根(DATA.items[i][2]), 好=[];
    if(!g||g.length<2) return null;
    b.list.forEach(function(x){
      if(x===i||unitNorm(DATA.items[x][3]||"")!==u0) return;
      var g2=根(DATA.items[x][2]);
      if(!g2) return;
      if(g2===g||g2.indexOf(g)>=0||g.indexOf(g2)>=0) 好.push(x);
    });
    return 好.length?好:null;
  }

  /* 单位对不上、同族里也找不到同单位的 —— 至少把「单位对得上的」排到前面当默认。
     三颗菜「水豆腐/板 12板」，库里叫「尝元小板豆腐」，词根对不上（水豆腐 vs 尝元小板豆腐），
     默认就落在「水豆腐[斤]¥1.2」上 —— 单位明明写着板。
     它本来就会弹窗（不是闷着算错），但默认摆错，人得多点一下。
     2026-08-02 三颗菜真单上看到的。 */
  function 同单位的排前面(DATA,unit,cands){
    var u0=unitNorm(unit||"");
    if(!u0||!cands||cands.length<2) return cands;
    var 对=[],剩=[];
    cands.forEach(function(x){
      (unitNorm(DATA.items[x][3]||"")===u0?对:剩).push(x);
    });
    return 对.length?对.concat(剩):cands;
  }

  /* 表格有「规格」列时，解析会把它并进商品名（华晨豆腐 + 7斤/板 → 华晨豆腐 7斤/板），
     好处是能分开 7斤板 ¥8 和 15斤板 ¥17。
     坏处是并完之后有时反而配不上了：
       「水豆腐/板」            → 预置命中 尝元小板豆腐[板] ¥4.5   ✓
       「水豆腐/板 中板/约5斤」  → 预置配不上，掉到 水豆腐[斤] ¥1.2  ✗
     2026-08-02 三颗菜真单上踩到（33 行全掉）。

     所以：并过规格的，两个名字都试一遍 —— 谁认得准用谁。
     多一条线索不该让结果变差，这是底线。 */
  function matchOne(C,ci,text,unit,priceHint,qtyHint,opts){
    var r=认一遍(C,ci,text,unit,priceHint,qtyHint);
    var n0=opts&&opts.名原;
    if(n0&&norm(n0)!==norm(text)&&!(r&&r.i>=0&&commits(r.how))){
      var r2=认一遍(C,ci,n0,unit,priceHint,qtyHint);
      if(r2&&r2.i>=0&&(commits(r2.how)||!(r&&r.i>=0))) return r2;
    }
    return r;
  }

  function 认一遍(C,ci,text,unit,priceHint,qtyHint){
    var r=各道闸门(C,ci,text,unit,priceHint);
    /* 单位对不上又换算不出 → 改配同单位的那条；没有就交给人 */
    if(r&&r.i>=0){
      var 教U=C.learnedSku?C.learnedSku(ci,text,unit):null;
      /* ⛔ 2026-08-18：学过的对照【也要过单位这一关】。
         原来「学过的」直接放行，是因为后面还有一道「斤怎么算」兜着：
         教过「优质豆腐 → 水豆腐（6斤）[板]」，客户写 18斤 → 那道折成 3 板。
         8/18 老板把折板整个砍了（「不许系统转换」），这道兜底就没了 ——
         再放行的话，客户要 18 斤，单子上直接开 18 板，多发六倍，一声不吭。
         那正是 8/2 老板拍桌子的那件事（「现在还是变成 18 板」）。
         现在：学过的也一样，单位对不上就找同单位的那条；没有就交给人。
         ⚠ 单位本来就一样的，这一道原样放过去，学过的照旧秒配。 */
      var 教到的单位=(教U!==null&&教U===C.DATA.items[r.i][6])?unitNorm(C.DATA.items[r.i][3]||""):null;
      var 学过且单位一致=(教到的单位!==null)&&(!unitNorm(unit||"")||教到的单位===unitNorm(unit||""));
      if(!学过且单位一致){
        var 同=单位对不上(C.DATA,C.IDX.byCust[ci],unit,r.i);
        if(同){
          /* 改配同单位那条之前，规格得对得上。
             轩宝「尝元韧豆腐5斤/板」→ 库里同单位的是「6.5斤」那条 ¥9.5，
             真价是 5斤板 ¥7（库里根本没有）。规格对不上还敢拍板，
             就是把 ¥7 闷成 ¥9.5 —— 交给人，让他用「＋库里没有，新建」补。 */
          var 规=specNums(text), 服=(同.length===1);
          if(服&&规.length){
            var s同=norm((C.DATA.items[同[0]][2]||"")+"|"+(C.DATA.items[同[0]][5]||""));
            /* 小数点也要算进边界：不排除的话「5」会在「6.5」里配上，
               6.5斤板 就冒充成了 5斤板。 */
            服=规.some(function(x){ return new RegExp("(^|[^0-9.])"+x.replace(".","\\.")+"([^0-9.]|$)").test(s同); });
          }
          r=服 ? {i:同[0],how:"byunit",cands:同}
               : {i:同[0],how:"fuzzy",cands:同,单位不符:true};
        }
        else if(unitNorm(unit||"")&&unitNorm(C.DATA.items[r.i][3]||"")!==unitNorm(unit||"")
                &&commits(r.how)){
          /* 同单位的一条都没有 —— 不敢拍板。
             闷着按「2板当2斤」算，一板的钱就没了。
             候选里单位对得上的排前面，回车就是对的。
             ⛔ 2026-08-18 去掉了这里的「&& 换算不出」：原来只要算得出
                「1板=6斤」就照旧拍板，指望后面那道折板去换。折板 8/18 砍了，
                再拍板就是客户要 18 斤、单子开 18 板。单位不一样一律交给人。 */
          var cs0=同单位的排前面(C.DATA,unit,
            (r.cands&&r.cands.length?r.cands:[r.i]).slice());
          r={i:cs0[0],how:"fuzzy",cands:cs0,单位不符:true};
        }
      }
    }
    /* ⛔⛔ 2026-08-18 老板拍板：【系统不许再自己折板】。原话：
         「不要不要不要，就是按照他下单的单位来，不要搞复杂了。
          他单位里面有就有，仓库里面有这个品就有；
          如果仓库里面没这个品、没这个单位，就直接跳出来让他自己选择就行了。
          不然又搞又复杂，这样很容易出错。」

       原来这儿还有最后一道「斤怎么算」：客户写斤 → 拿这货所有板型去除，
       除得尽就折成板。那是 8/2 定的稿，跟观麦 9758 行也对得上。
       但它会替人拿主意，出错了看不出来。老板 8/18 推翻了它。

       现在的规矩只有一句：**客户写什么单位，就按什么单位。**
         仓库里有这个品 + 这个单位 → 直接用（上面「单位对不上」那道已经在做）
         没有                     → 标成存疑，弹出来让人自己挑
       折板这件事交给人，系统一步都不许替他算。

       ⚠ 老规矩的完整推导和例子留在 git 里（这次删掉的 斤怎么算 函数），
         哪天要翻回去，看 2026-08-18 之前那版。 */
    return r;
  }

  function 各道闸门(C,ci,text,unit,priceHint){
    var r=matchCore(C,ci,text,unit,priceHint);
    var b0=C.IDX.byCust[ci];
    /* 先按「没写就按这头」的规矩纠一下，再走反义词闸门。
       这是老板定死的生意规矩（烟干不写就是薄），不是机器在猜 ——
       所以纠完直接拍板，不再弹窗问，否则每张单都要点一遍。
       只有「厚/薄这一对」被规矩定死了；要是还剩别的候选，照旧问人。 */
    if(r&&r.i>=0){
      var d=默认那头(C.DATA,b0,text,r.i,C.defaultSide);
      if(d>=0) r={i:d,how:"default",cands:[d]};
    }
    /* 「按斤还是按板」不在这里判 —— 那一道要拿到数量才算得了，
       统一挪到 matchOne 最后（见「斤怎么算」）。 */
    if(r&&r.i>=0&&commits(r.how)){
      /* 人拿这个词原样教过 → 他自己看着两边点的，那就算数，别拦。
         learnedSku 只按整词查、不查光名字，正好是这条分界线：
           教过「猪红」→ 下次写「猪红」，不拦
           教过「猪红」→ 这次写「猪红(大块)」，是光名字沾过去的，要拦 */
      var 教过=C.learnedSku?C.learnedSku(ci,text,unit):null;
      if(教过!==null&&教过===C.DATA.items[r.i][6]) return r;
      var 冲=词冲突(C.DATA,b0,text,r.i);
      if(冲){
        var cs=冲.cands.concat([r.i]).filter(function(x,ix,arr){ return arr.indexOf(x)===ix; });
        return {i:cs[0],how:"fuzzy",cands:cs,clash:冲};
      }
    }
    return r;
  }

  function matchCore(C,ci,text,unit,priceHint){
    var DATA=C.DATA,IDX=C.IDX,OV=C.OV,usedN=C.usedN,seedLookup=C.seedLookup,learnedSku=C.learnedSku;
    var b=IDX.byCust[ci]; if(!b) return {i:-1,how:"nocust",cands:[]};
    var cid=DATA.custs[ci][0], n=norm(text), ba=bare(text);
    var hasBa=!!(ba&&ba!==n);

    /* 一堆候选里，单价跟单据写的对得上的挑出来；正好一条就用它 */
    function 按价定(g){
      if(!(priceHint>=0)||!g||g.length<2) return -1;
      var hit=g.filter(function(i){ return Math.abs((+DATA.items[i][4]||0)-priceHint)<0.005; });
      return hit.length===1?hit[0]:-1;
    }
    /* 本来要返回「弹窗问人」的地方，先给单价一次机会 */
    function 问之前(g,cands){
      var k=按价定(g);
      if(k>=0) return {i:k,how:"price",cands:cands||g};
      return null;
    }

    /* 一组候选里「商品+单位+价」是不是完全一样 —— 一样就随便挑都不会错 */
    function allSame(g){
      if(!g||!g.length) return true;
      var k={};
      g.forEach(function(i){ var t=DATA.items[i]; k[t[1]+"|"+t[3]+"|"+t[4]]=1; });
      return Object.keys(k).length<=1;
    }
    /* 「光名字」沾边的全部候选（相等或互相包含）—— blindRisk 和第 5 步共用一份 */
    var candBare=[];
    if(ba&&ba.length>=2){
      b.list.forEach(function(i){
        var ab=bare(DATA.items[i][2]);
        if(ab&&(ab===ba||ab.indexOf(ba)>=0||ba.indexOf(ab)>=0)) candBare.push(i);
      });
      candBare.sort(function(x,y){
        return ((bare(DATA.items[x][2])===ba)?0:1)-((bare(DATA.items[y][2])===ba)?0:1);
      });
    }
    /* 单位那列空着的时候，别急着放弃，但也别瞎推。
       ⚠ 从名字里推单位试过了，不可靠 —— 规格单位 ≠ 销售单位：
          「豆皮结8斤」的 8斤 是名字不是数量；
          「无签豆腐串(0.069斤左右/串)」按串包装、按斤卖；
          「尝元豆腐串（串）」括号里写串、实际单位是包。
       所以只用一个硬证据：这家客户最近真的下过哪一个。 */
    var blindRisk = !unit && candBare.length>1 && !allSame(candBare);
    /* 这里原来有一步「按最近下单习惯」：候选里只有一个最近下过单，就直接选它，不问人。
       删掉了，三条理由：
         ① 它是猜的。下单历史只有 7 天，7 天没下过不等于不下。
            「阳春面」[没识别出单位] 有 ¥225/包 和 ¥7/公斤 两个，
            靠"最近下过公斤那个"就拍板，赌错一次差 218 块。
         ② 它还骗过体检。这一步的结果不弹下拉、直接落到单子上，
            可老版体检没把它算进「工具自己拍板」的名单，818 条静默认错一条没报。
         ③ 删了反而更准：这 818 条往下走到预置和规格判断，414 条直接判对了，
            剩下 404 条老老实实弹出来让人点。
       inferUnit 同理留在引擎里备用，不参与「确定」的判断。 */

    /* 1. 学过的 —— 人亲手教过的，权威最高，排在预置和一切猜测前面。
          查的时候按「单位」分开查，教「水豆腐[斤]」不会连「水豆腐[板]」一起改掉。 */
    var ls=learnedSku(ci,text,unit);
    if(ls!==null) return {i:b.sku[ls],how:"learned",cands:[]};
    /* 「把括号剥掉再查一次学过的」那一步挪到最后去了（见下面第 5b 步）。
       它只是个弱线索，不该抢在预置前面 ——
       抢了的话，「水豆腐」这个词一旦被教过，同一家的「水豆腐（5斤装）」
       就会放着查过账的预置不用，改成弹出来问人。 */

    /* 客户没写牌子，库里却挂着两个牌子 ——
       「厚烟干（包）」¥13.5 和「尝元厚烟干（包）」¥2.9 是两个商品，差 10.6 元。
       表上写的短名，字面上跟 ¥13.5 那条一模一样，所以原来会自信地挑它，
       可客户十有八九只是没写「尝元」两个字。这种一律交给人点，不许闭眼选。

       只认「一模一样」和「前面多几个字」（尝元X ⊃ X）这两种，
       不认「后面多几个字」—— 千张 和 千张结 是两个东西，不该为这个犹豫。

       ⚠ 这一段必须排在预置前面：下面的预置那步要用 core 和 brisk。
          原先它长在 byName 前面（也就是预置之后），var 提升让 core 在预置那步是
          undefined，core.slice() 每次都抛 TypeError —— 整个匹配全废。
          页面和体检脚本各存一份的时候，只有页面这份摆错了，体检还是绿的，
          谁也没发现。合成一份就是为了断掉这种事。 */
    function corePool(){
      if(!ba||ba.length<2) return [];
      var hasExact=b.list.some(function(i){ return bare(DATA.items[i][2])===ba; });
      var p=b.list.filter(function(i){
        var ab=bare(DATA.items[i][2]);
        if(!ab) return false;
        if(ab===ba) return true;
        if(ab.length<=ba.length) return false;
        if(ab.slice(-ba.length)===ba) return true;          /* 尝元X ⊃ X：前面多几个字 */
        /* 后面多几个字（凉皮面筋 ⊃ 凉皮）只在「库里根本没有一个正好叫这个名的」时才算对手。
           雅食乐表上写「凉皮」，库里只有 卷卷凉皮 ¥3.3 和 凉皮面筋 ¥10 ——
           两个都只沾一半，闭眼挑一个就错了 ¥6.7/斤。
           反过来「千张」库里就叫千张，那 千张结/千张丝 不该让它犹豫。 */
        if(!hasExact&&ab.slice(0,ba.length)===ba) return true;
        return false;
      });
      if(unit){ var s=p.filter(function(i){ return DATA.items[i][3]===unit; }); if(s.length) p=s; }
      /* 规格数字对不上的，不算「另一种可能」，别拿它逼人做选择题。
         表上写「水豆腐（5斤装）」，库里那个「九龙水豆腐（14-15斤）」是 14-15 斤，
         跟 5 斤明摆着不是一回事 —— 留着它只会让每一行水豆腐都弹一次。
         只在「两边都写了数字、而且一个都对不上」时才排除；
         有一边没写数字就不敢排，那种是真分不清（厚烟干 / 尝元厚烟干）。 */
      var tn=specNums(text);          /* 公斤已经折成斤了 */
      if(tn.length){
        p=p.filter(function(i){
          var s=norm((DATA.items[i][2]||"")+"|"+(DATA.items[i][5]||""));
          var cn=specNums(s);
          if(!cn.length) return true;
          return cn.some(function(x){ return tn.indexOf(x)>=0; });
        });
        /* 全被排掉是正常结果，别兜回去 —— 那正说明「没有第二种可能」，
           这一行不用问人。core 只用来判有没有歧义，答案不从这里取。 */
      }
      /* 名字一模一样的排前面 —— 弹出来让人选的时候，这个是默认选中的那一条 */
      p.sort(function(x,y){
        return ((bare(DATA.items[x][2])===ba)?0:1)-((bare(DATA.items[y][2])===ba)?0:1);
      });
      return p;
    }
    var core=corePool();
    var brisk=(core.length>1&&!allSame(core))?core:null;

    /* 2. 预置对照（可按单位区分）
          预置里「老豆腐→老豆腐（斤）」不该把「老豆腐（15斤）板」也吃掉 ——
          剥掉括号后名字一样，但单位不同就是两个商品，差 26 块。
          所以命中之后还要过一道单位关，对不上就当没命中，交给后面的规格判断。 */
    /* 预置写成 {"盒":"千叶豆腐（包）"} 这种「点名了单位」的形式时，跳过单位关：
       下单表写盒、价格库记包，机器判不了，但写预置的人已经判过了。
       写成光字符串的还是要过单位关 —— 那种键太粗，会把同名不同单位的品一起吃掉。

       另一头：预置键只是「光名字」沾上的（loose），而下单表写的正好是价格库里的真名，
       这种要让真名赢。「山水豆腐」的预置不该把「山水豆腐（500g/盒）」也一起吃掉。 */
    var sv=seedLookup(cid,text,unit);
    if(sv&&sv.loose&&brisk) sv=null;      /* 光名字沾上的预置，遇到牌子分歧就作废 */

    /* 候选池还要把预置指的那个算进去，再比一次 ——
       雅食乐的「小板豆腐」预置说是 ¥5 的28规格，可库里正好有个叫「小板豆腐5-6斤」的 ¥5.8，
       两个是不同商品。只比名字看不出这个矛盾，得把预置的答案摆进来一起比。

       试过一版「客户最近没买过的那个就不算数」，能少问 290 次，
       但历史只有 7 天，7 天没买不等于不买 —— 赌这个就等于留了条静默认错的路。
       宁可多问，不留。 */
    var pool2=core.slice(),st=sv?b.alias[norm(sv.sku)]:undefined;
    if(st!==undefined){
      /* 预置的答案排第一：既然要弹出来问，默认就该是人当初查过账定下的那个，
         点一下确认就行。不这么排的话，厨鲜达的「豆腐串」会默认停在
         「尝元豆腐串（50串/包）」¥25 上 —— 顺手一确认就是 ¥5 开成 ¥250。 */
      var ki=pool2.indexOf(st); if(ki>=0) pool2.splice(ki,1);
      pool2.unshift(st);
    }
    /* 预置就是「人查过账定下的答案」，它的本职正是解决 core 里这种同门歧义。
       原来这里先弹窗、再看预置，等于永远轮不到预置 ——
       8/1 实单上有 26 行明明在表里配好了，却还在问人，全卡在这一句。

       所以分两种：
         · 词是照原样写死在表里的（非 loose）→ 先兑现，这是人拍的板
         · 只是「光名字」沾上来的（loose）    → 仍然被歧义闸门拦住，
                                              那种沾上来的本来就不算人拍过板
       这一改把「配了不生效」堵死；代价是预置写错的话会静默算错，
       所以 体检-会不会认错.js 必须保持 0，那是这条路唯一的安全网。 */
    if(pool2.length>1&&!allSame(pool2)) return 问之前(pool2)||{i:pool2[0],how:"fuzzy",cands:pool2};

    if(sv&&!(sv.loose&&b.alias[n]!==undefined)){
      var si=b.alias[norm(sv.sku)];
      if(si!==undefined&&(sv.byUnit||!unit||DATA.items[si][3]===unit)&&!blindRisk) return {i:si,how:"seed",cands:[]};
    }

    /* 名字完全命中，但同名可能挂着好几个单位 —— 必须靠单位定，定不了就交给人。
       阳春面[包]¥225 / 阳春面[公斤]¥7 —— 闭眼选一个能错 218 块。 */
    function byName(g,how){
      if(!g||!g.length) return null;
      var r=null;
      if(unit){
        var s=g.filter(function(i){ return DATA.items[i][3]===unit; });
        /* 单位一个都对不上 —— 名字再像也不是它。往下走，别在这儿定。
           「炸腐竹」[包]¥90 和「炸腐竹（斤）」[斤]¥18 是两个东西，差 72 块。 */
        if(!s.length) return null;
        r=(s.length===1||allSame(s))?{i:s[0],how:how,cands:g}:(问之前(s)||{i:s[0],how:"fuzzy",cands:s});
      }else{
        if(blindRisk) return null;                            /* 没单位又有分歧 → 让第 5 步按规格挑 */
        r=(g.length===1||allSame(g))?{i:g[0],how:how,cands:g}:(问之前(g)||{i:g[0],how:"fuzzy",cands:g});
      }
      if(r.how!=="fuzzy"&&brisk) return 问之前(brisk)||{i:brisk[0],how:"fuzzy",cands:brisk};
      return r;
    }
    /* 3. 叫法精确 */
    var r3=byName(b.aliasU[n],"exact"); if(r3) return r3;
    /* 4. 商品名精确 */
    var r4=byName(b.prodU[n],"prod");   if(r4) return r4;
    /* 5. 按「光名字」找。两条踩过的坑一起堵：
          ① 价格库里带「尝元」前缀，客户表上从来不写 —— 尝元浓浆豆腐 ⊃ 浓浆豆腐，
             得认得出来。所以候选放宽到「包含关系」，不再要求完全相等。
          ② 放宽之后必须靠单位把关：表上写「板」就绝不能配到「浓浆豆腐（斤）」
             那个 1.1 元的（13 板按斤算，一单差 102.70）。 */
    if(ba&&ba.length>=2){
      var cand5=candBare;
      if(cand5.length){
        var pool=cand5, unitMiss=false;
        if(unit){
          var same=cand5.filter(function(i){ return DATA.items[i][3]===unit; });
          if(same.length) pool=same;      /* 单位对得上的优先 */
          else unitMiss=true;             /* 一个都对不上 → 别硬认，标存疑 */
        }
        var pick=pickBySpec(DATA,pool,text,unit);
        var exact=pool.filter(function(i){ return bare(DATA.items[i][2])===ba; });

        /* 反过来的那种歧义：表上的词比库里的名字【长】——
             「焗香干」配到「香干」、「攸县豆干」配到「豆干」，
             等于把客户写的限定词（焗、攸县）当成噪音丢掉了。
           丢掉之后，如果库里还有一堆同词根的品（香干/烟香干/攸县香干/白香干…），
           那这一丢就是在赌 —— 8.1 那天两条认错都是这么来的，
           实际客户要的是 烟香干 ¥3.2 和 攸县香干 ¥3.6。
           所以：丢了字、而且库里同词根的品不止一个 → 一律交给人点。
           「千张豆皮 → 千张」这种不受影响，因为库里带「千张」的就它一个。

           返回同词根的那一组（不止一个就是有风险），交给人点的时候
           把这一组整个摆出来 —— 正确答案就在里头，别让人自己去翻。 */
        function dropKin(i){
          if(i===undefined||i<0) return null;
          var ab=bare(DATA.items[i][2]);
          if(!ab||ab.length>=ba.length||ba.indexOf(ab)<0) return null;   /* 没丢字 */
          var kin=b.list.filter(function(j){
            var jb=bare(DATA.items[j][2]);
            return jb&&jb.indexOf(ab)>=0;
          });
          if(unit){ var s=kin.filter(function(j){ return DATA.items[j][3]===unit; }); if(s.length) kin=s; }
          if(kin.length<2||allSame(kin)) return null;
          kin.sort(function(x,y){ return (x===i?0:1)-(y===i?0:1); });   /* 原来挑中的排第一 */
          return kin;
        }

        /* 挑出「这一步认为是它」的那个：
           ① 候选之间没有实质分歧（同商品同单位同价）→ 随便挑都不会错
           ② 规格数字对上（老豆腐（15斤）里的 15 命中「尝元老豆腐（15斤）」）
           ③ 单位给了 + 光名字完全相等 */
        /* 光名字对上了，规格数字却明摆着矛盾 —— 这种也不能定。
           耀琳表上写「胶板水豆腐/5斤」报价 5.5/板，剥完光名字正好等于库里的
           「胶板水豆腐7斤）」¥7，于是闭眼配了过去 —— 5斤 和 7斤 差 ¥1.5/板。
           正解是「尝元小板豆腐（5斤）」¥5.5，名字不像但规格对得上。
           规矩：两边都写了数字、而且一个都对不上 → 交给人点。
           有一边没写数字就不算矛盾（那是没信息，不是有冲突）。 */
        function specClash(i){
          var tn=specNums(text);          /* 公斤已经折成斤了 */
          if(!tn.length) return false;
          var s=norm((DATA.items[i][2]||"")+"|"+(DATA.items[i][5]||""));
          var cn=specNums(s);
          if(!cn.length) return false;
          return !cn.some(function(x){ return tn.indexOf(x)>=0; });
        }
        var got=-1;
        if(!unitMiss&&allSame(pool)) got=pool[0];
        else if(!unitMiss&&pick>=0) got=pick;
        else if(!unitMiss&&unit&&exact.length===1&&allSame(pool.filter(function(i){
             return DATA.items[i][3]===DATA.items[exact[0]][3];
           }))) got=exact[0];
        if(got>=0){
          var kin=dropKin(got);
          if(kin) return 问之前(kin)||{i:kin[0],how:"fuzzy",cands:kin};   /* 丢了字又有同门 → 交给人 */
          /* 规格数字打架 → 交给人。但默认值不能还停在打架的那条：
             表上写「靓胶板豆腐7斤」，默认却停在「胶板豆腐4.5斤」¥5.5，
             人顺手一回车就是 ¥8 开成 ¥5.5，一板差 2.5 元。
             2026-08-02 江云生鲜真单上踩到，8.5 板差了 ¥21.25。
             所以先按规格数字重挑一个当默认，挑不出来才退回原来那条。 */
          if(specClash(got)){
            var 按规格=pickBySpec(DATA,pool,text,unit);
            var d0=(按规格>=0&&!specClash(按规格))?按规格:got;
            return 问之前(pool)||
                   {i:d0,how:"fuzzy",cands:[d0].concat(pool.filter(function(i){return i!==d0;}))};
          }
          return {i:got,how:"loose",cands:pool};
        }
        /* 剩下的全部存疑 —— 宁可让人点一下，也不能默默认错。
           默认停在哪一条：教过的光名字优先（人的判断最接近），其次按规格挑出来的。 */
        var lb2=learnedSku(ci,ba,unit), d5=(lb2!==null&&b.sku[lb2]!==undefined)?b.sku[lb2]
                :(pick>=0?pick:(exact.length?exact[0]:pool[0]));
        return 问之前(cand5,[d5].concat(cand5.filter(function(i){return i!==d5;})))||
               {i:d5,how:"fuzzy",cands:[d5].concat(cand5.filter(function(i){return i!==d5;}))};
      }
    }

    /* 5b. 最后一招：这个词剥掉括号之后，人教过。
           教过「猪红(含水率50%)」，表上写「猪红(沥水)(含水15%)」也该想得起来。
           但只「填答案」不「拍板」—— 括号里装的不一定是噪音，也可能正是规格：
           碧源「水豆腐（5斤装）」¥5.3 和「水豆腐（7斤装）」¥7.8 剥完都是「水豆腐」，
           先教了 5斤装，7斤装那行要是顶着绿标配到 5斤装上，一板差 2.5 元，人看不出来。
           所以摆出来让人扫一眼，答案已经填好，回车就过。 */
    if(hasBa){
      var lb=learnedSku(ci,ba,unit);
      if(lb!==null&&b.sku[lb]!==undefined){
        var li=b.sku[lb];
        return {i:li,how:"fuzzy",cands:[li].concat(b.list.filter(function(i){
          return i!==li&&DATA.items[i][3]===DATA.items[li][3];
        }))};
      }
    }

    /* 6. 叫法本：你以前教过这个词，或者别的客户就是这么叫的 → 在这家找同一个商品。
          这一步要排在「包含关系」前面 —— 「别人管这个东西就叫这个名」比
          「名字里有几个字重合」靠谱得多。 */
    var pI=-1, via="";
    if(OV.gmap[n]!==undefined){ pI=OV.gmap[n]; via="gmap"; }
    else if(hasBa&&OV.gmap[ba]!==undefined){ pI=OV.gmap[ba]; via="gmap"; }
    else if(IDX.aliasAll[n]){ pI=DATA.items[IDX.aliasAll[n][0]][1]; via="cross"; }
    else if(hasBa&&IDX.aliasAll[ba]){ pI=DATA.items[IDX.aliasAll[ba][0]][1]; via="cross"; }
    if(pI>=0){
      var same=[];
      b.list.forEach(function(i){ if(DATA.items[i][1]===pI) same.push(i); });
      if(unit) same.sort(function(x,y){return (DATA.items[y][3]===unit)-(DATA.items[x][3]===unit);});
      if(same.length) return {i:same[0],how:via,cands:same};
    }

    /* 7. 实在不行，看名字有没有重合；单位对得上的优先 */
    var cands=[];
    b.list.forEach(function(i){
      var it=DATA.items[i], a=norm(it[2]), ab=bare(it[2]);
      var sc=-1;
      if(a.indexOf(n)>=0||n.indexOf(a)>=0) sc=Math.abs(a.length-n.length);
      else if(ab&&ba&&(ab.indexOf(ba)>=0||ba.indexOf(ab)>=0)) sc=Math.abs(ab.length-ba.length)+0.5;
      if(sc>=0){ if(unit&&it[3]===unit) sc-=3; cands.push([i,sc]); }
    });
    cands.sort(function(x,y){return x[1]-y[1];});
    if(cands.length) return {i:cands[0][0],how:"fuzzy",cands:cands.map(function(c){return c[0];})};

    /* 8. 括号里那截才是真商品名。
          轩宝写「豆腐嫂（大板豆腐）」—— 前面是牌子，括号里的「大板豆腐」才是货。
          剥括号的规矩（bare）正好把有用的那截扔了，剩下「豆腐嫂」谁也认不出。
          所以最后再拿括号里的字试一次。只摆出来让人点，不拍板 ——
          括号里更多时候装的是规格，敢拍板迟早出事。
          2026-08-02 轩宝真单上踩到：整行认不出，人得自己去搜。 */
    var 括内=[];
    (toHalf(text).match(/[（(]([^（()）]{2,20})[）)]/g)||[]).forEach(function(s){
      var w=norm(s.slice(1,-1));
      if(w&&w.length>=2&&!/^[0-9.]/.test(w)) 括内.push(w);
    });
    for(var q=0;q<括内.length;q++){
      var w2=括内[q], 中=[];
      b.list.forEach(function(i){
        var a=norm(DATA.items[i][2]);
        if(a.indexOf(w2)>=0||w2.indexOf(a)>=0) 中.push(i);
      });
      if(!中.length) continue;
      if(unit) 中.sort(function(x,y){ return (DATA.items[y][3]===unit)-(DATA.items[x][3]===unit); });
      return {i:中[0],how:"fuzzy",cands:中,括内:w2};
    }

    /* 9. 中间少了个字：客户写「九龙豆腐」，库里叫「九龙水豆腐（斤）」。
          前面第 7 道要的是「一个是另一个的整段」，中间插了个「水」就断了，
          于是整行「认不出」—— 人只能自己去搜索框敲，很容易敲错。
          2026-08-03 碧源真单上踩到：九龙豆腐被人手挑成「水豆腐 ¥1.30」，
          真价是「九龙水豆腐（斤）¥2.00」，一行差 ¥0.70。

          改成：客户那几个字【按顺序】都在候选名里出现（子序列），就摆出来。
          「九龙豆腐」→ 九龙水豆腐 ✓（九·龙·豆·腐 顺序都在）
          再卡三道，免得摆出一堆不相干的：
            · 光名字至少 3 个字（两个字的太容易乱撞）
            · 开头两个字必须一样（「九龙」）—— 那是最像牌子的一截
            · 只摆出来让人点，绝不拍板（how:"fuzzy" = 存疑）
          老板的规矩：拿不准就摆出来问，别闷声挑一个。 */
    var 净=bare(text);
    if(净.length>=3){
      var 头=净.slice(0,2), 子=[];
      b.list.forEach(function(i){
        var a2=bare(DATA.items[i][2]);
        if(a2.length<净.length) return;              /* 比客户写的还短，不可能包得下 */
        if(a2.slice(0,2)!==头) return;               /* 开头两个字得一样 */
        var p=0;
        for(var k=0;k<a2.length&&p<净.length;k++) if(a2.charAt(k)===净.charAt(p)) p++;
        if(p===净.length) 子.push([i,a2.length-净.length]);
      });
      if(子.length){
        /* 单位对得上的排前面，长度差小的排前面 —— 回车就是最像的那个 */
        子.sort(function(x,y){
          var du=(unit?((DATA.items[y[0]][3]===unit)-(DATA.items[x[0]][3]===unit)):0);
          return du||(x[1]-y[1]);
        });
        return {i:子[0][0],how:"fuzzy",cands:子.map(function(c){return c[0];}),中间少字:true};
      }
    }

    return {i:-1,how:"none",cands:[]};
  }

  root.GM_MATCH={ commits:commits, ASK:ASK, buildIndex:buildIndex, matchOne:matchOne, pickBySpec:pickBySpec, better:better, bareRisky:bareRisky,
                  一份几个:一份几个, 换算比:换算比 };
})(typeof window!=="undefined"?window:globalThis);
