const fs=require('fs');
const {launch,makeDisk,btn,settle,suite}=require('./sandbox');
const T=suite();
const B1='/mnt/user-data/uploads/room-survey-full-2026-08-20.json';
const B2='/mnt/user-data/uploads/room-survey-full-2026-08-20-1.json';
const HTML=fs.readFileSync(__dirname+'/../public/index.html','utf8');
(async()=>{
  T.section('starter data on a brand-new phone');
  const seed=HTML.split('<script id="seedData" type="application/json">')[1].split('</script>')[0];
  const dS=makeDisk();
  const S=launch(dS); S.sb.document.getElementById('seedData').textContent=seed;
  await S.ev('applySeed()'); await settle(300);
  T.ok(S.state.rooms.length===25,'25 rooms load on first open');
  T.ok(S.ev("state.standard.all.includes('Working heat')"),'the standard includes Working heat');
  T.ok(S.state.rooms.every(r=>!r.inventory.length),'every room starts empty');

  const have=f=>fs.existsSync(f);
  if(have(B1)){
    T.section('restore your real backup (8 rooms, 45 photos)');
    const d=makeDisk(); const a=launch(d); await settle(250);
    a.ev("addRooms('999','')"); a.ev('flushSave()'); await settle(200);
    a.ev(`pendingRestore=${fs.readFileSync(B1,'utf8')}`);
    await a.ev('applyRestore()'); await settle(500);
    T.ok(d.kv.state.rooms.length===8,'8 rooms land on disk');
    T.ok(Object.keys(d.photos).length===45,'all 45 photos stored');
    T.ok(d.kv.state.rooms.reduce((n,r)=>n+r.photos.length,0)===45,'every photo still linked to its room');
    T.ok(d.kv.state.rooms.find(r=>r.number==='125').inventory.length===32,'room 125 keeps its 32 items');
    T.ok(!a.state.rooms.some(r=>r.number==='999'),'restore replaces what was there');
    const r2=launch(d); await settle(300);
    T.ok(r2.ev("state.standard.all.includes('Working heat')"),'heat is added to the restored standard on next open');

    if(have(B2)){
      T.section('merge your second backup into the first');
      a.ev(`(()=>{const data=${fs.readFileSync(B2,'utf8')}; pendingMerge={data,plan:buildMergePlan(data)};})()`);
      await a.ev('applyMerge()'); await settle(600);
      const nums=a.state.rooms.map(r=>String(r.number));
      T.ok(['107','110','111','114','116','117','118','119','120','122','123','124','125'].every(n=>nums.includes(n)),'all 13 numbered rooms from both sessions present');
      T.ok(new Set(nums).size===nums.length,'no duplicate room numbers');
      T.ok(a.state.rooms.find(r=>r.number==='125').inventory.length===32,'room 125 combined without losing items');
      T.ok(Object.keys(d.photos).length>=45,'photos kept');
    }
  } else T.ok(true,'backup files not present in this environment — skipped');

  T.section('Save now still verifies (used by autosave)');
  const dv=makeDisk(); const v=launch(dv); await settle(250);
  v.ev("state.rooms=[]; addRooms('501','')"); const rid=v.state.rooms[0].id;
  v.ev(`showRoom('${rid}')`); await settle();
  v.ev(`room('${rid}').inventory.push({id:'x',name:'Bed',qty:1,condition:'Good',notes:''}); room('${rid}').updated=Date.now(); save();`);
  await settle(1700);
  T.ok(dv.kv.state.rooms[0].inventory.length===1&&v.state.rooms[0].savedAt>0,'an edit autosaves and is verified');

  T.section('hold menu on the board');
  v.ev('showBoard()'); await settle();
  v.ev(`sheetRoomActions('${rid}')`);
  const m=v.els.sheetBody.innerHTML;
  T.ok(/Open room/.test(m)&&/Change room number/.test(m)&&/Mark complete/.test(m)&&/Delete room 501/.test(m),'open, rename, complete and delete are all there');
  v.sb.prompt=()=>'502';
  await v.click(btn({renameroom:rid}));
  T.ok(v.state.rooms[0].number==='502','rename works');
  await v.click(btn({quickcomplete:rid}));
  T.ok(v.state.rooms[0].status==='complete','mark complete works');
  v.ev(`sheetRoomActions('${rid}')`);
  T.ok(/Reopen for editing/.test(v.els.sheetBody.innerHTML),'a finished room offers Reopen instead');
  T.done();
})();
