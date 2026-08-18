/* 拿存下来的真表格子表离线跑一遍，记下每家读出什么 —— 改引擎前后各跑一次，逐家比。
   node 真表快照.js 拍   /   node 真表快照.js 比
   ⚠ 一分钱不花：格子表是 8/18 批量跑真单 --存格子 存下来的，不再问 AI。 */
const fs=require('fs');
global.window={};
['./数据-价格库.js','./对照-预置.js','./数据-常用规格.js','./数据-换算.js',
 './引擎-解析.js','./引擎-读结构.js'].forEach(f=>require(f));
const S=global.window.GM_STRUCT;
const 存='真表快照.json';
function 跑(){
  const 出={};
  fs.readdirSync('.').filter(f=>/^调试-格子表-.*\.json$/.test(f)).sort().forEach(f=>{
    let j; try{ j=JSON.parse(fs.readFileSync(f,'utf8')); }catch(e){ return; }
    if(!j||!Array.isArray(j.行)) return;
    const r=S.读结构(j);
    出[f.replace(/^调试-格子表-|\.json$/g,'')]={
      行:(r.lines||[]).length,
      段:(r.lines||[]).reduce((a,L)=>a+((L.segs||[]).length),0),
      量:Math.round((r.lines||[]).reduce((a,L)=>a+(L.qty||0),0)*100)/100,
      校验:(r.校验||[]).length,
      话:(r.只有话||[]).length,
      名:(r.lines||[]).map(L=>L.text+'|'+(L.unit||'')+'|'+(L.qty||0)).join('§')
    };
  });
  return 出;
}
const 干=process.argv[2]||'拍';
if(干==='拍'){
  const o=跑(); fs.writeFileSync(存,JSON.stringify(o,null,1),'utf8');
  const n=Object.keys(o).length;
  console.log('📷 拍好了 —— '+n+' 张真表');
  console.log('   共 '+Object.values(o).reduce((a,x)=>a+x.行,0)+' 行 / '
    +Object.values(o).reduce((a,x)=>a+x.段,0)+' 段');
  console.log('   → '+存+'\n改完跑：node 真表快照.js 比');
}else{
  const 旧=JSON.parse(fs.readFileSync(存,'utf8')), 新=跑();
  let 变=[];
  Object.keys(旧).forEach(k=>{
    const a=旧[k],b=新[k];
    if(!b){ 变.push([k,'这家读不出来了','','']); return; }
    ['行','段','量','校验','话'].forEach(x=>{ if(a[x]!==b[x]) 变.push([k,x,a[x],b[x]]); });
    if(a.名!==b.名&&a.行===b.行){
      const A=a.名.split('§'),B=b.名.split('§');
      A.forEach((t,i)=>{ if(t!==B[i]) 变.push([k,'第'+(i+1)+'行',t,B[i]]); });
    }
  });
  Object.keys(新).forEach(k=>{ if(!旧[k]) 变.push([k,'多出来一家','',新[k].行+'行']); });
  if(!变.length){ console.log('✅ 35 张真表，一格都没变。'); process.exit(0); }
  console.log('⚠ 变了 '+变.length+' 处：\n');
  变.slice(0,60).forEach(r=>console.log('  '+r[0]+'　'+r[1]+'：'+r[2]+' → '+r[3]));
  if(变.length>60) console.log('  …还有 '+(变.length-60)+' 处');
  fs.writeFileSync('真表变了什么.csv','\ufeff客户,哪一项,改前,改后\n'+
    变.map(r=>r.map(x=>'"'+String(x).replace(/"/g,'""')+'"').join(',')).join('\n'),'utf8');
  console.log('\n清单 → 真表变了什么.csv');
}
