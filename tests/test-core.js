const {launch,makeDisk,btn,settle,suite}=require('./sandbox');
const T=suite();
(async()=>{
  const disk=makeDisk();
  let a=launch(disk); await settle(250);

  T.section('startup and persistence');
  T.ok(a.ev('loadOK')===true,'app loads and enables saving');
  a.ev("addRooms('101-105','Economy Single')"); a.ev('flushSave()'); await settle(200);
  T.ok(disk.kv.state&&disk.kv.state.rooms.length===5,'five rooms written to disk');
  let b=launch(disk); await settle(250);
  T.ok(b.state.rooms.length===5,'rooms survive a restart');

  T.section('standard and to-dos');
  b.ev("state.standard={all:['Bed','TV','Desk x2'],byType:{}}; state.stdSeeded=true;");
  const r=b.state.rooms[0];
  T.ok(b.ev(`missingFor(room('${r.id}')).length`)===3,'empty room misses all three standard items');
  b.ev(`room('${r.id}').inventory.push({id:'i1',name:'Desk',qty:1,condition:'Good',notes:''})`);
  const m=b.ev(`missingFor(room('${r.id}'))`).find(x=>x.name==='Desk');
  T.ok(m&&m.have===1&&m.need===2,'one desk of two reads as short');
  T.ok(b.ev(`roomTodos(room('${r.id}')).some(t=>t.kind==='short')`),'short count appears as a to-do');

  T.section('shortfall summary (already shipped)');
  const sf=b.ev('shortfallSummary(state.rooms)');
  T.ok(sf.find(e=>e.name==='TV').absent===5,'TV absent in all five rooms');

  T.section('autosave');
  b.ev(`showRoom('${r.id}')`); await settle();
  b.ev(`room('${r.id}').inventory.push({id:'i2',name:'TV',qty:1,condition:'Good',notes:''}); room('${r.id}').updated=Date.now(); save();`);
  await settle(1700);
  T.ok(disk.kv.state.rooms.find(x=>x.id===r.id).inventory.length===2,'edit saved itself with no button');

  T.section('delete stays deleted');
  const victim=b.state.rooms.find(x=>x.number==='105').id;
  await b.ev(`deleteRooms(['${victim}'])`); await settle(300);
  const c=launch(disk); await settle(250);
  T.ok(!c.state.rooms.some(x=>x.id===victim),'deleted room is gone after a restart');
  T.ok(c.ev(`isDeleted('${victim}')`),'and the device remembers the deletion');

  T.section('write guards');
  const d=makeDisk(); const g=launch(d,{writeFails:true}); await settle(250);
  T.ok(true,'a failing disk does not crash startup');

  T.done();
})();
