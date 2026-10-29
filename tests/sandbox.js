/* Loads the app into an isolated sandbox with a fake browser and a fake
   database that persists across "launches". Shared by every test file. */
const fs=require('fs'), vm=require('vm');
const SRC=__dirname+'/../public/index.html';
function appJS(){ return fs.readFileSync(SRC,'utf8').split('<script>')[1].split('</script>')[0]; }
function makeDisk(){ return {kv:{},photos:{}}; }
function launch(disk,opts={}){
  const els={};
  const mk=()=>({innerHTML:'',value:'',textContent:'',style:{},dataset:{},disabled:false,src:'',
    classList:{_s:new Set(),add(...c){c.forEach(x=>this._s.add(x))},remove(...c){c.forEach(x=>this._s.delete(x))},
      toggle(c,v){(v===undefined?!this._s.has(c):v)?this._s.add(c):this._s.delete(c)},contains(c){return this._s.has(c)}},
    addEventListener(){},setAttribute(){},removeAttribute(){},appendChild(){},remove(){},click(){},
    closest(){return null},focus(){},select(){},scrollIntoView(){}});
  let clickHandler=null; const listeners={};
  const sb={
    document:{getElementById:id=>(els[id]=els[id]||mk()),createElement:()=>mk(),querySelectorAll:()=>[],
      addEventListener(t,f){ if(t==='click') clickHandler=f; (listeners[t]=listeners[t]||[]).push(f); },
      body:{classList:{add(){},remove(){}}},head:{appendChild(){}},visibilityState:'visible'},
    window:{addEventListener(){},scrollTo(){},print(){},open(){return null}},
    navigator:{},location:Object.assign({protocol:'https:',origin:'https://x.test',pathname:'/',search:''},opts.location||{}),
    URL:(()=>{ class U extends URL{} U.createObjectURL=()=>'blob:x'+Math.random(); U.revokeObjectURL=()=>{}; return U; })(),
    URLSearchParams,Image:function(){},
    alert:m=>sb.__alerts.push(String(m)),confirm:()=>true,prompt:()=>opts.promptValue??null,
    setInterval:()=>0,setTimeout,clearTimeout,Promise,JSON,Date,Math,Object,Array,String,Number,Set,Map,
    isNaN,parseInt,parseFloat,console,encodeURIComponent,decodeURIComponent,__alerts:[],__els:els,
    FileReader:function(){ this.readAsDataURL=b=>setTimeout(()=>{this.result='data:image/jpeg;base64,x';this.onload&&this.onload()},0) },
    fetch:async(u,init)=>{
      if(String(u).startsWith('data:')) return {blob:async()=>({size:9})};
      if(opts.server) return opts.server.handle(u,init);
      throw new Error('offline');
    },
    indexedDB:{open(){const q={};setTimeout(()=>{const sf=st=>({
      get(k){const r={};setTimeout(()=>{r.result=disk[st][k];r.onsuccess&&r.onsuccess()},0);return r},
      put(v,k){const r={};setTimeout(()=>{ if(opts.writeFails){r.onerror&&r.onerror();return}
        disk[st][k===undefined?v.id:k]=JSON.parse(JSON.stringify(v));r.onsuccess&&r.onsuccess()},0);return r},
      delete(k){const r={};setTimeout(()=>{delete disk[st][k];r.onsuccess&&r.onsuccess()},0);return r},
      getAll(){const r={};setTimeout(()=>{r.result=Object.values(disk[st]);r.onsuccess&&r.onsuccess()},0);return r},
      getAllKeys(){const r={};setTimeout(()=>{r.result=Object.keys(disk[st]);r.onsuccess&&r.onsuccess()},0);return r}});
      const conn={closed:false,close(){this.closed=true},transaction(st){ if(this.closed){const e=new Error('The database connection is closing.');e.name='InvalidStateError';throw e;} return {objectStore:()=>sf(st)}; }};
      (sb.__conns=sb.__conns||[]).push(conn);
      q.onsuccess&&q.onsuccess({target:{result:conn}});},0);return q}}
  };
  sb.globalThis=sb; vm.createContext(sb);
  vm.runInContext(appJS()+'\n;globalThis.__ctx=(code)=>eval(code);',sb);
  const ev=c=>sb.__ctx(c);
  return {sb,els,ev,
    get state(){return ev('state')},
    click:async el=>{ await clickHandler({target:el}); await new Promise(r=>setTimeout(r,40)); },
    fire:async (type,target)=>{ for(const f of (listeners[type]||[])) await f({target}); await new Promise(r=>setTimeout(r,20)); }};
}
/* a fake button that answers closest() from its own data attributes */
function btn(attrs={},id=''){
  const o={id,dataset:{...attrs},hasAttribute:a=>a in attrs,
    classList:{add(){},remove(){},contains(){return false}},
    closest(sel){
      if(sel==='button, img[data-view]') return o;
      const m=/^\[data-([a-z]+)\]$/.exec(sel); if(m) return (m[1] in attrs)?o:null;
      return null; }};
  return o;
}
const settle=(ms=150)=>new Promise(r=>setTimeout(r,ms));
function suite(){
  const fail=[]; let pass=0;
  return {ok(c,m){ c?pass++:fail.push(m); console.log((c?'  PASS  ':'  FAIL  ')+m); },
    section(t){ console.log('\n--- '+t+' ---'); },
    done(){ console.log('\n'+(fail.length?'FAILURES: '+fail.length:'ALL PASSED')+'  ('+pass+' passed)');
      process.exit(fail.length?1:0); }};
}
module.exports={launch,makeDisk,btn,settle,suite,appJS};
