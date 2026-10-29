const {launch,makeDisk,btn,settle,suite}=require('./sandbox');
const T=suite();
function makeServer(){
  const rooms={},photos={},tombs={}; let meta=null;
  return {rooms,photos,async handle(url,init){
    const u=new URL(url,'https://x.test'), a=u.searchParams.get('action'), id=u.searchParams.get('id');
    const method=(init&&init.method)||'GET', body=init&&init.body?JSON.parse(init.body):null;
    const R=(o,s=200)=>({status:s,async json(){return JSON.parse(JSON.stringify(o))}});
    if(a==='manifest'){ const st={}; for(const k in rooms) st[k]={updated:rooms[k].updated||0,rev:rooms[k].rev||0};
      return R({ok:true,rooms:st,photos:Object.keys(photos),deleted:Object.keys(tombs),meta}); }
    if(a==='room'&&method==='DELETE'){ delete rooms[id]; tombs[id]=1; return R({ok:true}); }
    if(a==='room'&&!body) return rooms[id]?R({ok:true,room:rooms[id]}):R({ok:false},404);
    if(a==='room'&&body){ if(tombs[body.room.id]) return R({ok:false,deleted:true},410);
      const cur=rooms[body.room.id], cr=cur?(cur.rev||0):0;
      if(cur&&(body.baseRev||0)!==cr) return R({ok:false,conflict:true,room:cur},409);
      const sv=JSON.parse(JSON.stringify(body.room)); sv.rev=cr+1; rooms[sv.id]=sv; return R({ok:true,rev:sv.rev}); }
    if(a==='photo'&&body){ if(!body.id||!body.full) return R({ok:false},400); photos[body.id]=body; return R({ok:true}); }
    if(a==='photo') return photos[id]?R({ok:true,photo:photos[id]}):R({ok:false},404);
    if(a==='meta'){ meta=body; return R({ok:true}); }
    return R({ok:false},400);
  }};
}
(async()=>{
  const disk=makeDisk();
  const a=launch(disk); await settle(250);
  a.ev("state.rooms=[]; addRooms('114,115','Economy Single');");
  const id=n=>a.state.rooms.find(r=>r.number===n).id;

  T.section('common fixes dropdown');
  a.ev('showHandyman()'); await settle();
  await a.click(btn({hmnew:'1'}));
  const sheet=a.els.sheetBody.innerHTML;
  T.ok(/id="hmFix"/.test(sheet),'the add sheet has a common-fixes dropdown');
  const opts=(sheet.match(/<select id="hmFix">[\s\S]*?<\/select>/)||[''])[0].match(/<option/g)||[];
  T.ok(opts.length-1===16,'a short general list — 16 choices');
  T.ok(!/optgroup/.test(sheet),'one flat list, no sub-groups');
  T.ok(/Leak or plumbing/.test(sheet)&&/AC or heat/.test(sheet)&&/Door or lock/.test(sheet),'general terms rather than specific faults');
  const sel=a.sb.document.getElementById('hmFix'); sel.id='hmFix'; sel.value='Leak or plumbing';
  await a.fire('change',sel);
  T.ok(a.sb.document.getElementById('hmNewText').value==='Leak or plumbing','picking one fills the description');
  await a.click(btn({hmpick:id('114')}));
  await a.click(btn({hmsave:'1'}));
  const j=a.state.rooms.find(r=>r.number==='114').work.find(w=>w.task==='Leak or plumbing');
  T.ok(!!j,'and it saves as the job');
  T.ok(j&&!j.photoId,'a job with no photo is fine — the photo is optional');
  T.ok(a.sb.document.getElementById('hmFix').value==='','the dropdown resets for the next job');

  T.section('typing your own still works');
  a.sb.document.getElementById('hmNewText').value='Mirror fogged behind glass';
  await a.click(btn({hmsave:'1'}));
  T.ok(a.state.rooms.find(r=>r.number==='114').work.some(w=>w.task==='Mirror fogged behind glass'),'free text is still accepted');

  T.section('optional photo on a job');
  a.ev("pendingJobPhoto={id:'ph-1',roomId:'',full:{size:9},thumb:{size:9},ts:1}; pendingJobPhotoURL='blob:prev';");
  T.ok(/Remove photo/.test(a.ev('jobPhotoBoxHTML()')),'a picked photo shows a preview with Remove');
  a.sb.document.getElementById('hmNewText').value='Water stain on ceiling';
  await a.click(btn({hmpick:id('115')}));
  await a.click(btn({hmsave:'1'}));
  const jp=a.state.rooms.find(r=>r.number==='115').work.find(w=>w.task==='Water stain on ceiling');
  T.ok(jp&&jp.photoId==='ph-1','the photo is attached to the job');
  T.ok(disk.photos['ph-1']&&disk.photos['ph-1'].roomId===id('115'),'stored, and filed under the right room');
  T.ok(a.ev('pendingJobPhoto')===null,'the next job starts without a photo');
  T.ok(/Take photo/.test(a.ev('jobPhotoBoxHTML()')),'and the photo buttons are back');
  a.ev("pendingJobPhoto={id:'ph-x',roomId:'',full:{size:9},thumb:{size:9},ts:1}; pendingJobPhotoURL='blob:p';");
  await a.click(btn({hmphotoclear:'1'}));
  T.ok(a.ev('pendingJobPhoto')===null,'Remove photo drops it before saving');

  T.section('the photo shows where the job does');
  a.ev("hmFilter='open'; renderTodo();");
  T.ok(new RegExp('data-view="ph-1"').test(a.els.todoView.innerHTML),'thumbnail on the handyman list, tap to enlarge');
  T.ok(/data-jobphoto="/.test(a.els.todoView.innerHTML),'jobs without a photo get a camera button');
  a.ev(`showRoom('${id('115')}')`); await settle();
  T.ok(/data-thumbid="ph-1"/.test(a.els.workList.innerHTML),'and inside the room’s job list');

  T.section('tap to enlarge, and in the printed report');
  a.ev("showHandyman()"); await settle();
  await a.click(btn({troom:id('115'),view:'ph-1'}));
  T.ok(a.els.lightbox.classList.contains('on'),'tapping a job thumbnail opens it full size from the handyman list');
  await a.ev("exportReport('all','all',false)"); await settle(200);
  T.ok(/class="jp"/.test(a.els.reportRoot.innerHTML),'the printed report shows the job photo beside the job');
  a.ev('clearReport()');

  T.section('room job editor gets the dropdown too');
  a.ev('sheetWork(null)');
  T.ok(/id="wFix"/.test(a.els.sheetBody.innerHTML),'adding a job from inside a room offers common fixes');
  const wsel=a.sb.document.getElementById('wFix'); wsel.id='wFix'; wsel.value='Clogged drain';
  await a.fire('change',wsel);
  T.ok(a.sb.document.getElementById('wTask').value==='Clogged drain','and fills the job name');

  T.section('job photos travel between phones');
  const server=makeServer(), d1=makeDisk(), d2=makeDisk();
  const staff=launch(d1,{server}); await settle(300);
  staff.ev("state.rooms=[]; addRooms('201','');");
  const rid=staff.state.rooms[0].id;
  await staff.ev("idbPut('photos',{id:'jp-9',roomId:'"+rid+"',full:{size:9},thumb:{size:9},ts:1})");
  staff.ev(`room('${rid}').work.push({id:'w9',task:'Fix AC',priority:'Normal',status:'notdone',notes:'',assignee:'Handyman',photoId:'jp-9'}); room('${rid}').updated=Date.now();`);
  await staff.ev('syncNow(true)'); await settle(400);
  T.ok(!!server.photos['jp-9'],'the job photo uploads');
  const hm=launch(d2,{server}); await settle(700);
  T.ok(!!d2.photos['jp-9'],'and downloads to the handyman’s phone');
  T.ok(hm.state.rooms[0].work[0].photoId==='jp-9','still linked to the job');

  T.section('deleting a room cleans up job photos');
  await a.ev(`deleteRooms(['${id('115')}'])`); await settle(300);
  T.ok(!disk.photos['ph-1'],'the job photo is removed with the room');

  T.done();
})();
