/* Behaves like netlify/functions/sync.mjs: per-room revisions, compare-and-set,
   409 on a stale write, tombstones on delete. */
function makeServer(opts={}){
  const rooms={},photos={},tombs={}; let meta=null;
  return {rooms,photos,tombs,get meta(){return meta},async handle(url,init){
    if(opts.down) throw new Error('offline');
    const u=new URL(url,'https://x.test'), a=u.searchParams.get('action'), id=u.searchParams.get('id');
    const method=(init&&init.method)||'GET', body=init&&init.body?JSON.parse(init.body):null;
    const R=(o,s=200)=>({status:s,async json(){return JSON.parse(JSON.stringify(o))}});
    if(a==='manifest'){ const st={}; for(const k in rooms) st[k]={updated:rooms[k].updated||0,rev:rooms[k].rev||0,number:rooms[k].number};
      return R({ok:true,rooms:st,photos:Object.keys(photos),deleted:Object.keys(tombs),meta}); }
    if(a==='room'&&method==='DELETE'){ if(opts.deleteFails) return R({ok:false},500); delete rooms[id]; tombs[id]=1; return R({ok:true}); }
    if(a==='room'&&!body) return rooms[id]?R({ok:true,room:rooms[id]}):R({ok:false},404);
    if(a==='room'&&body){ if(tombs[body.room.id]) return R({ok:false,deleted:true},410);
      const cur=rooms[body.room.id], cr=cur?(cur.rev||0):0;
      if(cur&&(body.baseRev||0)!==cr) return R({ok:false,conflict:true,room:cur},409);
      const sv=JSON.parse(JSON.stringify(body.room)); sv.rev=cr+1; rooms[sv.id]=sv; return R({ok:true,rev:sv.rev}); }
    if(a==='photo'&&body){ if(!body.id||!body.full) return R({ok:false},400); if(!photos[body.id]) photos[body.id]=body; return R({ok:true}); }
    if(a==='photo') return photos[id]?R({ok:true,photo:photos[id]}):R({ok:false},404);
    if(a==='meta'&&body){ if(!meta||(body.updated||0)>=(meta.updated||0)) meta=body; return R({ok:true}); }
    return R({ok:false},400);
  }};
}
module.exports={makeServer};
