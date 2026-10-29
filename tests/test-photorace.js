/* Taking a photo wakes the app, which syncs while the photo is still being
   processed. The photo must still end up in the room. */
const {launch,makeDisk,settle,suite}=require('./sandbox');
const {makeServer}=require('./fakeserver');
const T=suite();
(async()=>{
  const server=makeServer(), dA=makeDisk(), dB=makeDisk();
  const A=launch(dA,{server}); await settle(400);
  A.ev("state.rooms=[]; addRooms('114','')");
  const rid=A.state.rooms[0].id;
  await A.ev('syncNow(true)'); await settle(300);
  const B=launch(dB,{server}); await settle(700);

  /* someone else edits the room, so the server copy is newer than B's */
  A.ev(`(()=>{const r=room('${rid}'); r.notes='edited on A'; r.updated=Date.now()+5;})()`);
  await A.ev('syncNow(true)'); await settle(300);

  /* B takes a photo; processing is slow, and a sync runs in the middle */
  B.ev("decodeSource=async()=>{ await new Promise(r=>setTimeout(r,300)); return {width:100,height:100,close(){}}; }");
  B.ev("encode=async()=>({size:9})");
  const adding=B.ev(`addPhotos('${rid}',[{type:'image/jpeg'}])`);
  await settle(50);
  await B.ev('syncNow(true)');             // the wake-up sync
  await adding; await settle(200);

  const r=B.state.rooms.find(x=>x.id===rid);
  T.section('photo taken while a sync runs');
  T.ok(r.photos.length===1,'the photo is attached to the room');
  T.ok(r.notes==='edited on A','and the other phone’s edit still came through');
  await B.ev('flushSave()'); await settle(200);
  T.ok(dB.kv.state.rooms.find(x=>x.id===rid).photos.length===1,'it is saved to the phone');
  await B.ev('syncNow(true)'); await settle(400);
  T.ok(server.rooms[rid].photos.length===1,'and reaches the server for the other phones');

  T.section('first sync after updating (every room re-merged)');
  const s2=makeServer(), d1=makeDisk(), d2=makeDisk();
  const C=launch(d1,{server:s2}); await settle(400);
  C.ev("state.rooms=[]; addRooms('201','')");
  const id2=C.state.rooms[0].id;
  await C.ev('syncNow(true)'); await settle(300);
  const D=launch(d2,{server:s2}); await settle(700);
  C.ev(`(()=>{const r=room('${id2}'); r.notes='newer'; r.updated=Date.now()+5;})()`);
  await C.ev('syncNow(true)'); await settle(300);
  D.ev(`delete room('${id2}').syncBase`);  // phone still holding data from before the update
  D.ev("decodeSource=async()=>{ await new Promise(r=>setTimeout(r,300)); return {width:100,height:100,close(){}}; }");
  D.ev("encode=async()=>({size:9})");
  const add2=D.ev(`addPhotos('${id2}',[{type:'image/jpeg'}])`);
  await settle(50); await D.ev('syncNow(true)'); await add2; await settle(200);
  T.ok(D.state.rooms.find(x=>x.id===id2).photos.length===1,'the photo survives the first post-update sync');
  T.section('photos already lost on her phone come back');
  const d3=makeDisk(); const E=launch(d3); await settle(300);
  E.ev("state.rooms=[]; addRooms('301,302','')");
  const a3=E.state.rooms[0].id, b3=E.state.rooms[1].id;
  await E.ev(`idbPut('photos',{id:'lost1',roomId:'${a3}',full:{size:9},thumb:{size:9},ts:1})`);
  await E.ev(`idbPut('photos',{id:'gone',roomId:'deleted-room',full:{size:9},thumb:{size:9},ts:1})`);
  await E.ev(`idbPut('photos',{id:'linked',roomId:'${b3}',full:{size:9},thumb:{size:9},ts:1})`);
  E.ev(`room('${b3}').photos.push('linked')`);
  E.ev('flushSave()'); await settle(200);
  const E2=launch(d3); await settle(400);
  const ra=E2.state.rooms.find(r=>r.id===a3), rb=E2.state.rooms.find(r=>r.id===b3);
  T.ok(ra.photos.includes('lost1'),'the unlinked photo is put back in its room on open');
  T.ok(rb.photos.length===1,'a photo already linked is not duplicated');
  T.ok(!E2.state.rooms.some(r=>r.photos.includes('gone')),'a photo from a deleted room is left alone');
  await E2.ev(`removePhoto('${b3}','linked')`); await settle(60);
  const E3=launch(d3); await settle(400);
  T.ok(!E3.state.rooms.find(r=>r.id===b3).photos.includes('linked'),'a photo you deleted on purpose does not come back');
  T.done();
})();
