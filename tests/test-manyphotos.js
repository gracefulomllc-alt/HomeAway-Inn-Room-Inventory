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
  T.done();
})();
