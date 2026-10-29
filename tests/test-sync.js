const {launch,makeDisk,btn,settle,suite}=require('./sandbox');
const {makeServer}=require('./fakeserver');
const T=suite();
(async()=>{
  const server=makeServer();
  const dA=makeDisk(), dB=makeDisk();
  const A=launch(dA,{server}); await settle(400);
  A.ev("state.rooms=[]; addRooms('101,102','Economy Single')");
  const id=n=>A.state.rooms.find(r=>r.number===n).id;
  A.ev(`room('${id('101')}').inventory.push({id:'i1',name:'TV',qty:1,condition:'Good',notes:''}); room('${id('101')}').updated=Date.now();`);
  await A.ev('syncNow(true)'); await settle(400);

  T.section('two phones');
  T.ok(Object.keys(server.rooms).length===2,'phone A publishes both rooms');
  const B=launch(dB,{server}); await settle(700);
  T.ok(B.state.rooms.length===2,'phone B pulls them down on open');
  T.ok(B.state.rooms.find(r=>r.number==='101').inventory.length===1,'including the item phone A recorded');

  T.section('both phones edit the same room');
  B.ev(`(()=>{const r=room('${id('101')}'); r.inventory.push({id:'i2',name:'Microwave',qty:1,condition:'Good',notes:''}); r.updated=Date.now()+5;})()`);
  A.ev(`(()=>{const r=room('${id('101')}'); r.inventory.push({id:'i3',name:'Fridge',qty:1,condition:'Good',notes:''}); r.updated=Date.now()+5;})()`);
  await B.ev('syncNow(true)'); await settle(400);
  await A.ev('syncNow(true)'); await settle(500);
  await B.ev('syncNow(true)'); await settle(500);
  const names=r=>r.inventory.map(i=>i.name).sort().join();
  T.ok(names(A.state.rooms.find(r=>r.number==='101'))==='Fridge,Microwave,TV','phone A ends with all three items');
  T.ok(names(B.state.rooms.find(r=>r.number==='101'))==='Fridge,Microwave,TV','phone B converges on the same three');

  T.section('photos travel');
  await A.ev(`idbPut('photos',{id:'ph1',roomId:'${id('102')}',full:{size:9},thumb:{size:9},ts:1})`);
  A.ev(`(()=>{const r=room('${id('102')}'); r.photos.push('ph1'); r.photoNotes={ph1:'cracked tile'}; r.updated=Date.now()+20;})()`);
  await A.ev('syncNow(true)'); await settle(500);
  await B.ev('syncNow(true)'); await settle(600);
  T.ok(!!server.photos.ph1&&!!dB.photos.ph1,'photo uploads from A and downloads to B');
  T.ok(B.state.rooms.find(r=>r.number==='102').photoNotes.ph1==='cracked tile','and its note comes with it');

  T.section('the room standard travels');
  A.ev("saveStandard('__all__','Bed\\nWorking AC\\nWorking heat'); state.standardUpdated=Date.now()+50;");
  await A.ev('syncNow(true)'); await settle(400);
  await B.ev('syncNow(true)'); await settle(400);
  T.ok(B.ev('state.standard.all.join()')==='Bed,Working AC,Working heat','an edit to the standard reaches the other phone');

  T.section('delete stays deleted');
  const r102=id('102');
  await A.ev(`deleteRooms(['${r102}'])`); await settle(400);
  T.ok(!server.rooms[r102]&&server.tombs[r102],'gone from the server with a tombstone');
  await B.ev('syncNow(true)'); await settle(500);
  T.ok(!B.state.rooms.some(r=>r.number==='102'),'phone B drops it');
  await B.ev('syncNow(true)'); await A.ev('syncNow(true)'); await settle(500);
  T.ok(!A.state.rooms.some(r=>r.number==='102')&&!server.rooms[r102],'and B never pushes it back');

  T.section('delete when the server call fails');
  const s2=makeServer({deleteFails:true}), d2=makeDisk();
  const C=launch(d2,{server:s2}); await settle(400);
  C.ev("state.rooms=[]; addRooms('201,202','')"); await C.ev('syncNow(true)'); await settle(400);
  const gone=C.state.rooms.find(r=>r.number==='202').id;
  await C.ev(`deleteRooms(['${gone}'])`); await settle(300);
  await C.ev('syncNow(true)'); await settle(500);
  T.ok(!C.state.rooms.some(r=>r.id===gone),'the room does not come back on sync');
  const C2=launch(d2,{server:s2}); await settle(700);
  T.ok(!C2.state.rooms.some(r=>r.id===gone),'nor after reopening the app');

  T.section('offline');
  const s3=makeServer({down:true}), d3=makeDisk();
  const D=launch(d3,{server:s3}); await settle(400);
  D.ev("state.rooms=[]; addRooms('301','')"); D.ev('flushSave()'); await settle(300);
  T.ok(d3.kv.state.rooms.length===1,'work saves locally with no signal');
  T.ok(D.ev('syncState.err')!=='','the app knows it is offline');
  const live=makeServer(); const D2=launch(d3,{server:live}); await settle(800);
  T.ok(Object.values(live.rooms).some(r=>r.number==='301'),'it publishes once signal is back');

  T.done();
})();
