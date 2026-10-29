/* Every kind of edit on one phone must show up on the others — not just additions. */
const {launch,makeDisk,settle,suite}=require('./sandbox');
const {makeServer}=require('./fakeserver');
const T=suite();
(async()=>{
  const server=makeServer(), dA=makeDisk(), dB=makeDisk(), dC=makeDisk();
  const A=launch(dA,{server}); await settle(400);
  A.ev("state.rooms=[]; addRooms('114','Economy Single')");
  const rid=A.state.rooms[0].id;
  A.ev(`(()=>{const r=room('${rid}');
    r.inventory.push({id:'a',name:'TV',qty:1,condition:'Damaged',notes:''},{id:'b',name:'Lamp',qty:2,condition:'Good',notes:''},{id:'c',name:'Chair',qty:1,condition:'Good',notes:''});
    r.work.push({id:'j',task:'Fix AC',priority:'Normal',status:'complete',notes:'',assignee:'Handyman'});
    r.status='complete'; r.notes='old note'; r.updated=Date.now();})()`);
  await A.ev('syncNow(true)'); await settle(400);
  const B=launch(dB,{server}); await settle(700);
  const C=launch(dC,{server}); await settle(700);
  const rb=()=>B.state.rooms.find(r=>r.id===rid);
  T.ok(rb()&&rb().inventory.length===3,'B starts with the same room');

  /* edits on A that are not additions */
  A.ev(`(()=>{const r=room('${rid}');
    r.inventory.find(i=>i.id==='a').condition='Good';        // handyman fixed the TV
    r.inventory.find(i=>i.id==='b').qty=1;                   // a lamp went missing
    r.inventory=r.inventory.filter(i=>i.id!=='c');           // chair removed
    r.work.find(w=>w.id==='j').status='notdone';             // job reopened
    r.status='progress';                                     // room reopened
    r.number='115';                                          // renamed
    r.type='Superior Double';                                // reclassified
    r.notes='new note';                                      // note rewritten
    r.updated=Date.now()+10; })()`);
  await A.ev('syncNow(true)'); await settle(400);
  await B.ev('syncNow(true)'); await settle(500);

  T.section('phone B receives every kind of change');
  const r=rb();
  T.ok(r.inventory.find(i=>i.id==='a').condition==='Good','condition change (Damaged → Good)');
  T.ok(r.inventory.find(i=>i.id==='b').qty===1,'quantity lowered');
  T.ok(!r.inventory.some(i=>i.id==='c'),'item removed');
  T.ok(r.work.find(w=>w.id==='j').status==='notdone','job reopened');
  T.ok(r.status==='progress','room reopened');
  T.ok(r.number==='115','room renamed');
  T.ok(r.type==='Superior Double','room type changed');
  T.ok(r.notes==='new note','note rewritten, not glued onto the old one');

  T.section('and B does not undo it on the server');
  await B.ev('syncNow(true)'); await settle(400);
  await C.ev('syncNow(true)'); await settle(500);
  const rc=C.state.rooms.find(x=>x.id===rid);
  T.ok(rc.inventory.length===2&&rc.number==='115'&&rc.status==='progress','a third phone ends up with A’s version');
  T.ok(server.rooms[rid].inventory.length===2,'server holds A’s version');

  T.section('phones that stay open pick up changes without being touched');
  T.ok(B.ev("typeof startAutoSync==='function'"),'there is a background sync loop');

  T.section('both phones edit the same room before syncing');
  const s2=makeServer(), e1=makeDisk(), e2=makeDisk();
  const P=launch(e1,{server:s2}); await settle(400);
  P.ev("state.rooms=[]; addRooms('201','')");
  const id2=P.state.rooms[0].id;
  P.ev(`(()=>{const r=room('${id2}'); r.inventory.push({id:'t',name:'TV',qty:1,condition:'Good',notes:''},{id:'l',name:'Lamp',qty:1,condition:'Good',notes:''},{id:'d',name:'Desk',qty:2,condition:'Good',notes:''}); r.notes='base'; r.updated=Date.now();})()`);
  await P.ev('syncNow(true)'); await settle(400);
  const Q=launch(e2,{server:s2}); await settle(700);
  P.ev(`(()=>{const r=room('${id2}'); r.inventory.find(i=>i.id==='t').condition='Damaged'; r.inventory=r.inventory.filter(i=>i.id!=='l'); r.updated=Date.now()+5;})()`);
  Q.ev(`(()=>{const r=room('${id2}'); r.inventory.find(i=>i.id==='d').qty=1; r.inventory.push({id:'f',name:'Fridge',qty:1,condition:'Good',notes:''}); r.notes='from Q'; r.updated=Date.now()+5;})()`);
  await P.ev('syncNow(true)'); await settle(400);
  await Q.ev('syncNow(true)'); await settle(500);
  await P.ev('syncNow(true)'); await settle(500);
  for(const [nm,ph] of [['phone P',P],['phone Q',Q]]){
    const r=ph.state.rooms.find(x=>x.id===id2), g=n=>r.inventory.find(i=>i.name===n);
    T.ok(g('TV')&&g('TV').condition==='Damaged',nm+': P’s condition change kept');
    T.ok(!g('Lamp'),nm+': P’s removal kept');
    T.ok(g('Desk')&&g('Desk').qty===1,nm+': Q’s quantity change kept');
    T.ok(!!g('Fridge'),nm+': Q’s addition kept');
    T.ok(r.notes==='from Q',nm+': Q’s note kept (only Q changed it)');
  }

  T.section('a phone still holding data from before this update');
  const s3=makeServer(), f1=makeDisk(), f2=makeDisk();
  const U=launch(f1,{server:s3}); await settle(400);
  U.ev("state.rooms=[]; addRooms('301','')");
  const id3=U.state.rooms[0].id;
  U.ev(`(()=>{const r=room('${id3}'); r.inventory.push({id:'x',name:'TV',qty:1,condition:'Damaged',notes:''}); r.updated=Date.now();})()`);
  await U.ev('syncNow(true)'); await settle(400);
  const V=launch(f2,{server:s3}); await settle(700);
  V.ev(`(()=>{const r=room('${id3}'); delete r.syncBase; r.inventory.push({id:'n',name:'Lamp',qty:1,condition:'Good',notes:''});})()`);   // old-style copy plus a new item
  U.ev(`(()=>{const r=room('${id3}'); r.inventory.find(i=>i.id==='x').condition='Good'; r.updated=Date.now()+9;})()`);
  await U.ev('syncNow(true)'); await settle(400);
  await V.ev('syncNow(true)'); await settle(500);
  const sv=s3.rooms[id3];
  T.ok(sv.inventory.find(i=>i.id==='x').condition==='Good','the old copy does not overwrite the newer fix');
  T.ok(sv.inventory.some(i=>i.id==='n'),'but what it added is kept');

  T.section('the same room number created on two phones');
  const s4=makeServer(), g1=makeDisk(), g2=makeDisk();
  const X=launch(g1,{server:s4}); const Y=launch(g2,{server:s4}); await settle(400);
  X.ev("state.rooms=[]; addRooms('401','')"); Y.ev("state.rooms=[]; addRooms('401','')");
  X.ev(`state.rooms[0].inventory.push({id:'a1',name:'TV',qty:1,condition:'Good',notes:''})`);
  Y.ev(`state.rooms[0].inventory.push({id:'b1',name:'Bed',qty:1,condition:'Good',notes:''})`);
  await X.ev('syncNow(true)'); await settle(300);
  await Y.ev('syncNow(true)'); await settle(500);
  await X.ev('syncNow(true)'); await settle(500);
  await Y.ev('syncNow(true)'); await settle(500);
  T.ok(X.state.rooms.length===1&&Y.state.rooms.length===1,'each phone ends with one room 401');
  T.ok(X.state.rooms[0].id===Y.state.rooms[0].id,'the same one on both');
  T.ok(X.state.rooms[0].inventory.length===2,'with both phones’ items');
  T.ok(Object.values(s4.rooms).filter(r=>r.number==='401').length===1,'and one copy on the server');

  T.section('photo links survive a slow download');
  const s5=makeServer(), h1=makeDisk(), h2=makeDisk();
  const W=launch(h1,{server:s5}); await settle(400);
  W.ev("state.rooms=[]; addRooms('501','')");
  const id5=W.state.rooms[0].id;
  await W.ev(`idbPut('photos',{id:'pp',roomId:'${id5}',full:{size:9},thumb:{size:9},ts:1})`);
  W.ev(`(()=>{const r=room('${id5}'); r.photos.push('pp'); r.updated=Date.now();})()`);
  await W.ev('syncNow(true)'); await settle(400);
  delete s5.photos.pp;                                  // image not reachable yet
  const Z=launch(h2,{server:s5}); await settle(700);
  await Z.ev('syncNow(true)'); await settle(400);
  T.ok(s5.rooms[id5].photos.includes('pp'),'a phone that could not fetch the image does not wipe the link');

  T.done();
})();
