/* "It only lets her take one photo" — taking photo after photo in one room. */
const fs=require('fs');
const {launch,makeDisk,settle,suite}=require('./sandbox');
const {makeServer}=require('./fakeserver');
const T=suite();
const HTML=fs.readFileSync(__dirname+'/../public/index.html','utf8');
(async()=>{
  const server=makeServer(), d=makeDisk();
  const A=launch(d,{server}); await settle(400);
  A.ev("state.rooms=[]; addRooms('118','')");
  const rid=A.state.rooms[0].id;
  A.ev("decodeSource=async()=>({width:100,height:100,close(){}})");
  A.ev("encode=async()=>({size:9})");

  T.section('room already linked to photos that live on other phones');
  A.ev(`(()=>{const r=room('${rid}'); for(let i=0;i<9;i++) r.photos.push('elsewhere'+i);})()`);
  await A.ev(`addPhotos('${rid}',[{type:'image/jpeg'}])`);
  await A.ev(`addPhotos('${rid}',[{type:'image/jpeg'}])`);
  await A.ev(`addPhotos('${rid}',[{type:'image/jpeg'}])`);
  const r=A.state.rooms[0];
  T.ok(r.photos.filter(x=>!/^elsewhere/.test(x)).length===3,'three photos in a row all go in (was capped at 10 counting hidden links)');

  T.section('Take photo button, tapped again and again');
  T.ok(/function openPicker/.test(HTML)&&/document\.body\.appendChild\(inp\)/.test(HTML),'the camera picker stays attached to the page while the camera is open');
  T.ok(/inp\.value=''/.test(HTML),'the picker resets so the next shot always registers');
  T.ok(/openPicker\(id==='camBtn'/.test(HTML),'Take photo uses it');
  T.ok(/MAX_PHOTOS = 40/.test(HTML),'up to 40 photos per room');
  await A.ev('flushSave()'); await A.ev('syncNow(true)'); await settle(300);
  T.ok(server.rooms[rid].photos.length===12,'all of them reach the other phones');

  T.section('iPhone drops storage while the camera is open');
  const B=launch(makeDisk(),{server:makeServer()}); await settle(400);
  B.ev("state.rooms=[]; addRooms('120','')");
  const bid=B.state.rooms[0].id;
  B.ev("decodeSource=async()=>({width:100,height:100,close(){}})");
  B.ev("encode=async()=>({size:9})");
  for(let k=0;k<5;k++){
    B.sb.__conns.forEach(c=>c.closed=true);          // camera opened → connection lost
    await B.ev(`addPhotos('${bid}',[{type:'image/jpeg'}])`);
    await settle(30);
  }
  T.ok(B.state.rooms[0].photos.length===5,'five photos in a row, each after the connection was dropped');
  B.sb.__conns.forEach(c=>c.closed=true);
  const dB=B.disk||null;
  B.ev(`room('${bid}').notes='after camera'; room('${bid}').updated=Date.now(); save()`);
  await B.ev('flushSave()'); await settle(200);
  const saved=await B.ev('idbGet("kv","state")');
  T.ok(saved&&saved.rooms[0].notes==='after camera','room notes still save after the connection was dropped');
  T.ok(/function idbReq/.test(HTML),'every storage call retries on a lost connection');
  T.done();
})();
