const {launch,makeDisk,btn,settle,suite}=require('./sandbox');
const T=suite();
(async()=>{
  T.section('Working heat on the checklist');
  const d0=makeDisk();
  const fresh=launch(d0); await settle(300);
  const std=fresh.ev('state.standard.all');
  T.ok(std.includes('Working heat')&&std.includes('Working AC'),'a new phone gets both heat and AC');
  T.ok(std.indexOf('Working heat')===std.indexOf('Working AC')+1,'heat sits right after AC');

  const d1=makeDisk();
  d1.kv.state={v:1,rooms:[],standard:{all:['Bed','Working AC','TV'],byType:{}},stdSeeded:true};
  const old=launch(d1); await settle(300);
  T.ok(old.ev("state.standard.all.join()")==='Bed,Working AC,Working heat,TV','an existing standard gains heat beside AC');
  old.ev("saveStandard('__all__','Bed\\nWorking AC\\nTV')"); old.ev('flushSave()'); await settle(200);
  const again=launch(d1); await settle(300);
  T.ok(!again.ev("state.standard.all").includes('Working heat'),'removing it yourself sticks — it does not come back');

  const d2=makeDisk();
  d2.kv.state={v:1,rooms:[],standard:{all:['Bed','Working heat','Working AC'],byType:{}},stdSeeded:true};
  const dup=launch(d2); await settle(300);
  T.ok(dup.ev("state.standard.all.filter(x=>x==='Working heat').length")===1,'never added twice');

  T.section('room photos: tap to edit');
  const disk=makeDisk();
  const a=launch(disk); await settle(250);
  a.ev("state.rooms=[]; addRooms('114','')");
  const rid=a.state.rooms[0].id;
  for(const id of ['p1','p2','p3']) await a.ev(`idbPut('photos',{id:'${id}',roomId:'${rid}',full:{size:9},thumb:{size:9},ts:1})`);
  a.ev(`room('${rid}').photos=['p1','p2','p3']`);
  a.ev(`showRoom('${rid}')`); await settle(200);
  T.ok(/data-editphoto="p2"/.test(a.els.photoGrid.innerHTML),'each photo opens an edit sheet');
  T.ok(!/data-delphoto/.test(a.els.photoGrid.innerHTML),'no more one-tap × delete on the thumbnail');

  await a.click(btn({editphoto:'p2'}));
  const sh=a.els.sheetBody.innerHTML;
  T.ok(/Photo 2 of 3/.test(sh)&&/id="phNote"/.test(sh),'the sheet shows which photo and a note box');
  T.ok(/Move earlier/.test(sh)&&/Retake/.test(sh)&&/Replace from library/.test(sh)&&/Delete photo/.test(sh),'with move, retake, replace and delete');

  T.section('notes');
  a.sb.document.getElementById('phNote').value='  Stain   by window ';
  await a.click(btn({phsave:'p2'}));
  T.ok(a.state.rooms[0].photoNotes.p2==='Stain by window','note saved, spacing tidied');
  a.ev(`renderRoom()`); await settle(150); T.ok(/class="phnote">Stain by window/.test(a.els.photoGrid.innerHTML),'shown under the thumbnail');
  await a.click(btn({editphoto:'p2'}));
  a.sb.document.getElementById('phNote').value='';
  await a.click(btn({phsave:'p2'}));
  T.ok(!('p2' in a.state.rooms[0].photoNotes),'clearing the box removes the note');
  a.ev(`room('${rid}').photoNotes.p2='Stain by window'`);

  T.section('reorder');
  await a.click(btn({phmove:'p2',dir:'-1'}));
  T.ok(a.state.rooms[0].photos.join()==='p2,p1,p3','Move earlier swaps it forward');
  await a.click(btn({phmove:'p2',dir:'-1'}));
  T.ok(a.state.rooms[0].photos.join()==='p2,p1,p3','cannot move past the first slot');
  await a.click(btn({phmove:'p2',dir:'1'}));
  await a.click(btn({phmove:'p2',dir:'1'}));
  T.ok(a.state.rooms[0].photos.join()==='p1,p3,p2','Move later walks it to the end');

  T.section('replace keeps the slot and the note');
  a.ev("makePhotoRecord=async(f,rid)=>({id:'new1',roomId:rid,full:{size:9},thumb:{size:9},ts:2})");
  await a.ev(`replacePhoto('${rid}','p2',{})`); await settle(150);
  const r=a.state.rooms[0];
  T.ok(r.photos.join()==='p1,p3,new1','new photo takes the old one’s place');
  T.ok(r.photoNotes.new1==='Stain by window'&&!r.photoNotes.p2,'the note moves to the new photo');
  T.ok(!disk.photos.p2&&!!disk.photos.new1,'old image removed from storage, new one saved');

  T.section('delete asks first');
  a.sb.confirm=()=>false;
  await a.click(btn({phdel:'p1'}));
  T.ok(a.state.rooms[0].photos.includes('p1'),'cancelling the confirm keeps the photo');
  a.sb.confirm=()=>true;
  await a.click(btn({phdel:'p1'}));
  T.ok(!a.state.rooms[0].photos.includes('p1')&&!disk.photos.p1,'confirming deletes it');

  T.section('saved and synced');
  await settle(1700);
  T.ok(disk.kv.state.rooms[0].photos.join()==='p3,new1','order and replacement saved without pressing anything');
  T.ok(disk.kv.state.rooms[0].photoNotes.new1==='Stain by window','note saved too');
  const m=a.ev(`mergeRooms(room('${rid}'),{...JSON.parse(JSON.stringify(room('${rid}'))),photoNotes:{p3:'Other phone note'}}).room.photoNotes`);
  T.ok(m.p3==='Other phone note'&&m.new1==='Stain by window','notes from two phones combine');

  T.section('report');
  await a.ev("exportReport('all','all',false)"); await settle(200);
  T.ok(/<figcaption>Stain by window<\/figcaption>/.test(a.els.reportRoot.innerHTML),'notes print under the photo');
  a.ev('clearReport()');
  T.done();
})();
