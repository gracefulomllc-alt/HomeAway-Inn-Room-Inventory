const {launch,makeDisk,btn,settle,suite}=require('./sandbox');
const T=suite();

/* fake server shaped like the real sync function */
function makeServer(){
  const rooms={},photos={},tombs={}; let meta=null;
  return {rooms,async handle(url,init){
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
    if(a==='photo') return body?R({ok:true}):R({ok:false},404);
    if(a==='meta'){ meta=body; return R({ok:true}); }
    return R({ok:false},400);
  }};
}

(async()=>{
  const disk=makeDisk();
  const a=launch(disk); await settle(250);
  a.ev("state.rooms=[]; addRooms('114,115,116','Economy Single');");
  const id=n=>a.state.rooms.find(r=>r.number===n).id;

  T.section('staff add jobs for the handyman');
  a.ev(`room('${id('114')}').work.push({id:'j1',task:'Fix bathroom fan',priority:'High',status:'notdone',notes:'',assignee:'Handyman'})`);
  a.ev(`room('${id('116')}').work.push({id:'j2',task:'Deep clean',priority:'Normal',status:'notdone',notes:'',assignee:'Housekeeping'})`);
  a.ev(`room('${id('115')}').inventory.push({id:'d1',name:'Desk lamp',qty:1,condition:'Damaged',notes:'cord frayed'})`);
  a.ev("todoTab='handyman'; showTodo();"); await settle();
  let html=a.els.todoView.innerHTML;
  T.ok(/Fix bathroom fan/.test(html),'a handyman job appears on his list');
  T.ok(!/Deep clean/.test(html),'a housekeeping job does not');
  T.ok(/Desk lamp/.test(html)&&/Reported damaged/.test(html),'a damaged item shows up automatically');
  T.ok(/class="rn">114</.test(html)&&/class="rn">115</.test(html),'grouped room by room');
  T.ok(!/class="rn">116</.test(html),'a room with nothing for him is left out');

  T.section('anyone can add to his list');
  await a.click(btn({hmnew:'1'}));
  T.ok(/Add a job for the handyman/.test(a.els.sheetBody.innerHTML),'the big Add button opens the quick-add sheet');
  T.ok(new RegExp('data-hmpick="'+id('116')+'"').test(a.els.sheetBody.innerHTML),'every room is offered as a tap target');
  await a.click(btn({hmpick:id('116')}));
  a.sb.document.getElementById('hmNewText').value='  Tighten   door hinge ';
  await a.click(btn({hmsave:'1'}));
  const added=a.state.rooms.find(r=>r.number==='116').work.find(w=>w.task==='Tighten door hinge');
  T.ok(!!added,'tap a room, type the problem, Add — spacing tidied');
  T.ok(added&&added.assignee==='Handyman','and it is assigned to the handyman');
  T.ok(/Added to room 116/.test(a.els.hmAddedNote.innerHTML),'the sheet confirms and stays open for the next one');
  T.ok(a.sb.document.getElementById('hmNewText').value==='','the text box clears for the next job');
  a.sb.document.getElementById('hmNewText').value='Squeaky door';
  await a.click(btn({hmsave:'1'}));
  T.ok(a.state.rooms.find(r=>r.number==='116').work.some(w=>w.task==='Squeaky door'),'a second job goes to the same room without re-picking');
  await a.click(btn({hmnew:'1'}));
  a.sb.document.getElementById('hmNewText').value='No room chosen';
  a.ev("sheetPickRoom=''");
  await a.click(btn({hmsave:'1'}));
  T.ok(!a.state.rooms.some(r=>r.work.some(w=>w.task==='No room chosen')),'nothing is added until a room is tapped');
  a.sb.document.getElementById('hmIn-'+id('114')).value='Replace shower head';
  await a.click(btn({troom:id('114'),hmadd:'1'}));
  T.ok(a.state.rooms.find(r=>r.number==='114').work.some(w=>w.task==='Replace shower head'),'the per-room box adds a job there');

  T.section('the handyman checks things off');
  await a.click(btn({troom:id('114'),hmstatus:'j1',st:'progress'}));
  T.ok(a.state.rooms.find(r=>r.number==='114').work.find(w=>w.id==='j1').status==='progress','Started marks it in progress');
  await a.click(btn({troom:id('114'),hmstatus:'j1',st:'complete'}));
  const j1=a.state.rooms.find(r=>r.number==='114').work.find(w=>w.id==='j1');
  T.ok(j1.status==='complete'&&j1.doneAt>0,'Done completes it and stamps the time');
  html=a.els.todoView.innerHTML;
  T.ok(!/Fix bathroom fan/.test(html),'it leaves the open list');
  await a.click(btn({troom:id('115'),hmfixed:'d1'}));
  const lamp=a.state.rooms.find(r=>r.number==='115').inventory.find(i=>i.id==='d1');
  T.ok(lamp.condition==='Good','Fixed sets the item back to Good');
  T.ok(/Fixed .* \(was Damaged\)/.test(lamp.notes)&&/cord frayed/.test(lamp.notes),'and keeps a note of what it was');

  T.section('done list and undo');
  await a.click(btn({hmfilter:'done'}));
  html=a.els.todoView.innerHTML;
  T.ok(/Fix bathroom fan/.test(html),'finished jobs show under Done');
  await a.click(btn({troom:id('114'),hmstatus:'j1',st:'notdone'}));
  T.ok(a.state.rooms.find(r=>r.number==='114').work.find(w=>w.id==='j1').status==='notdone','Reopen puts it back');
  await a.click(btn({hmfilter:'open'}));

  T.section('staff can tick off for him too');
  T.ok(a.ev("ASSIGNEES.includes('Handyman')"),'jobs keep a who-it-is-for field');
  await a.click(btn({troom:id('114'),workdone:'j1'}));
  T.ok(a.state.rooms.find(r=>r.number==='114').work.find(w=>w.id==='j1').status==='complete','the to-do Done button completes the same job');

  T.section('saved without pressing anything');
  await settle(1700);
  T.ok(disk.kv.state.rooms.find(r=>r.number==='116').work.some(w=>w.task==='Tighten door hinge'),'additions autosave');

  T.section('older jobs with no assignee');
  a.ev(`room('${id('116')}').work.push({id:'old',task:'Patch wall',priority:'Normal',status:'notdone',notes:''})`);
  const fixed=a.ev(`normalizeRoom(JSON.parse(JSON.stringify(room('${id('116')}'))))`);
  T.ok(fixed.work.find(w=>w.id==='old').assignee==='Handyman','jobs from before this update go to the handyman');

  T.section('his phone and a staff phone, synced');
  const server=makeServer();
  const dS=makeDisk(), dH=makeDisk();
  const staff=launch(dS,{server}); await settle(300);
  staff.ev("state.rooms=[]; addRooms('201','');"); 
  const rid=staff.state.rooms[0].id;
  staff.ev(`room('${rid}').work.push({id:'s1',task:'Fix AC',priority:'Urgent',status:'notdone',notes:'',assignee:'Handyman'}); room('${rid}').updated=Date.now();`);
  await staff.ev('syncNow(true)'); await settle(300);
  const hm=launch(dH,{server,location:{search:'?view=handyman'}}); await settle(600);
  T.ok(hm.ev('todoTab')==='handyman','his bookmark opens straight to his list');
  T.ok(hm.state.rooms[0].work.some(w=>w.task==='Fix AC'),'he receives the job staff added');
  hm.ev(`(()=>{ const w=room('${rid}').work.find(x=>x.id==='s1'); w.status='complete'; w.doneAt=Date.now(); room('${rid}').updated=Date.now()+5; })()`);
  await hm.ev('syncNow(true)'); await settle(300);
  staff.ev(`room('${rid}').notes='staff edit'; room('${rid}').updated=Date.now()+10;`);
  await staff.ev('syncNow(true)'); await settle(400);
  const onStaff=staff.state.rooms[0].work.find(w=>w.id==='s1');
  T.ok(onStaff.status==='complete','his Done reaches the staff phone');
  T.ok(server.rooms[rid].work.find(w=>w.id==='s1').status==='complete','and a stale staff phone does not undo it');

  T.section('easy to find');
  a.ev('showBoard()'); await settle();
  T.ok(/Handyman list/.test(a.els.hmBanner.innerHTML),'a Handyman banner sits at the top of the board');
  T.ok(/open job/.test(a.els.hmBanner.innerHTML),'showing how many jobs are open');
  T.ok(Number(a.els.hmBadge.textContent)>0,'the top-bar button carries a count');
  await a.click(btn({},'hmBtn'));
  T.ok(a.ev('todoTab')==='handyman'&&/Handyman/.test(a.els.title.innerHTML),'the top-bar button opens his list');
  a.ev('showBoard()'); await settle();
  await a.click(btn({openhm:'1'}));
  T.ok(a.ev('todoTab')==='handyman','so does the banner');
  await a.click(btn({},'todoBtn'));
  T.ok(a.ev('todoTab')!=='handyman','the To-do button still goes to the general list');

  T.section('reports');
  const rep=a.ev("(()=>{ const sc=document.getElementById('sheetBody'); sheetReport(); return sc.innerHTML; })()");
  T.ok(/Handyman work list/.test(rep),'the report can print just the handyman list');

  T.done();
})();
