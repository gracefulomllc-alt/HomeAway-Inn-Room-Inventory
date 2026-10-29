/* A phone opening the link for the first time must end up with every room and
   every photo the team has — no restore, no backup file. */
const fs=require('fs');
const {launch,makeDisk,settle,suite}=require('./sandbox');
const {makeServer}=require('./fakeserver');
const T=suite();
const HTML=fs.readFileSync(__dirname+'/../public/index.html','utf8');
const SEED=HTML.split('<script id="seedData" type="application/json">')[1].split('</script>')[0];
(async()=>{
  /* Terel's phone: the starter rooms plus real work and 30 photos */
  const server=makeServer(), dT=makeDisk();
  const Tr=launch(dT,{server}); Tr.sb.document.getElementById('seedData').textContent=SEED;
  await Tr.ev('applySeed()'); await settle(300);
  const ids=Tr.state.rooms.map(r=>r.id);
  for(let k=0;k<30;k++){
    const rid=ids[k%10];
    await Tr.ev(`idbPut('photos',{id:'ph${k}',roomId:'${rid}',full:{size:9},thumb:{size:9},ts:${k}})`);
    Tr.ev(`room('${rid}').photos.push('ph${k}')`);
  }
  Tr.ev(`(()=>{const r=room('${ids[0]}'); r.inventory.push({id:'q',name:'TV',qty:1,condition:'Damaged',notes:'cracked'}); r.notes='surveyed'; r.updated=Date.now();})()`);
  Tr.ev("addRooms('130','Economy Single')");
  await Tr.ev('syncNow(true)'); await settle(600);
  T.section('the server has the team’s work');
  T.ok(Object.keys(server.rooms).length===Tr.state.rooms.length,'every room is on the server');
  T.ok(Object.keys(server.photos).length===30,'all 30 photos are on the server');

  /* Her phone: opens the link for the first time */
  const dH=makeDisk();
  const H=launch(dH,{server}); H.sb.document.getElementById('seedData').textContent=SEED;
  await settle(1500);
  T.section('a brand-new phone, just opening the link');
  T.ok(H.state.rooms.length===Tr.state.rooms.length,'every room arrives, including ones added after the starter list');
  const h0=H.state.rooms.find(r=>r.id===ids[0]);
  T.ok(h0&&h0.notes==='surveyed'&&h0.inventory.some(i=>i.condition==='Damaged'),'with the survey work in it');
  T.ok(Object.keys(dH.photos).length===30,'all 30 photos download');
  T.ok(H.state.rooms.reduce((n,r)=>n+r.photos.length,0)===30,'each linked to its room');

  T.section('a phone that was closed halfway through');
  const s2=makeServer(); Object.assign(s2.rooms,JSON.parse(JSON.stringify(server.rooms))); Object.assign(s2.photos,server.photos);
  const dP=makeDisk();
  let calls=0; const flaky={rooms:s2.rooms,photos:s2.photos,async handle(u,i){ if(/action=photo&id=/.test(u)&&++calls>10) throw new Error('closed'); return s2.handle(u,i); }};
  const P=launch(dP,{server:flaky}); P.sb.document.getElementById('seedData').textContent=SEED;
  await settle(1200);
  const got=Object.keys(dP.photos).length;
  T.ok(got>=10&&got<30,'some photos arrived before the app was closed ('+got+')');
  const P2=launch(dP,{server:s2}); await settle(1500);
  T.ok(Object.keys(dP.photos).length===30,'reopening finishes the rest on its own');

  T.section('Get latest from team');
  T.ok(/Get latest from team/.test(HTML),'the menu has a one-tap full refresh');
  const before=H.state.rooms.find(r=>r.id===ids[1]);
  H.ev(`room('${ids[1]}').rev=999`);                    // a phone that has somehow got ahead of the server
  s2.rooms[ids[1]].notes='server truth';
  const H2=launch(dH,{server:s2}); await settle(900);
  await H2.ev('refreshFromTeam()'); await settle(900);
  T.ok(H2.state.rooms.find(r=>r.id===ids[1]).notes==='server truth','it pulls every room again, whatever the phone thinks it has');

  T.section('a phone that restored an old backup');
  /* the backup carries revs from another history and a stale syncBase */
  const rid=ids[2];
  H2.ev(`(()=>{const r=room('${rid}'); r.rev=999; r.inventory.push({id:'bk1',name:'Lamp',qty:1,condition:'Good',notes:''}); r.updated=1; markSynced(r);})()`);
  await H2.ev('writeState()');
  s2.rooms[rid].work=[{id:'w9',text:'Fix leak',done:false,ts:5}]; s2.rooms[rid].rev=3; s2.rooms[rid].updated=Date.now();
  const H3=launch(dH,{server:s2}); await settle(1200);
  const r3=H3.state.rooms.find(r=>r.id===rid);
  T.ok(r3.work.some(w=>w.text==='Fix leak'),'team work still arrives on its own, no restore or button needed');
  /* a real restore now marks rooms as needing upload */
  const src=fs.readFileSync(__dirname+'/../public/index.html','utf8');
  T.ok(/delete r\.syncBase/.test(src)&&/delete inc\.syncBase/.test(src),'restored and merged rooms are sent back up to the team');
  T.ok(!/r\.photos=r\.photos\.filter\(pid=>present\.has\(pid\)\)/.test(src),'restore no longer strips links to photos that are still on the server');
  T.done();
})();
