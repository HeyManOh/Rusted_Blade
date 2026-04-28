'use strict';
// ═══════════════════════════════════════════════════════════════════════
// Frontline: Castle Defense — Authoritative Game Server
// Express + Socket.IO, 60Hz tick rate, in-memory rooms
// ═══════════════════════════════════════════════════════════════════════
const express=require('express');const http=require('http');const {Server}=require('socket.io');
const path=require('path');
const app=express();const server=http.createServer(app);
const io=new Server(server,{cors:{origin:'*',methods:['GET','POST']}});
app.use(express.static(path.join(__dirname,'public')));
app.get('/',(req,res)=>res.sendFile(path.join(__dirname,'public','index.html')));

// ── Constants (must match client) ──────────────────────────────────────
const BW=900,BH=500,GRID=32,GY=BH-60;
const WORLD_W=2400,PVP_WORLD_W=3600;
const TICK_RATE=60,TICK_MS=1000/TICK_RATE;
const MAX_PLAYERS_PER_ROOM=4;

// ── Room registry ──────────────────────────────────────────────────────
const rooms=new Map();// roomCode → Room

function genCode(){
  const chars='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let c='';for(let i=0;i<5;i++)c+=chars[Math.floor(Math.random()*chars.length)];
  return c;
}




// ── Noop stubs (rendering/client-only functions) ─────────
function spawnFX(){}
function txt(){}
function rb(){}
function pix(){}
function hpBar(){}
function drawPixelBox(){}
let GAME_T=0;
let GAME_FLASH=false;

const GUN_DEFS=[
  {name:'Pistol',   color:'#b0bec5',cd:14,dmg:1, spread:0,   pellets:1, spd:7, startAmmo:Infinity,icon:'PST'},
  {name:'SMG',      color:'#80cbc4',cd:5, dmg:1, spread:.08, pellets:1, spd:7, startAmmo:80,      icon:'SMG'},
  {name:'Shotgun',  color:'#ffcc80',cd:30,dmg:1, spread:.35, pellets:6, spd:6, startAmmo:24,      icon:'SHT'},
  {name:'Sniper',   color:'#ef9a9a',cd:45,dmg:4, spread:0,   pellets:1, spd:14,startAmmo:12,      icon:'SNP'},
  {name:'Grenade',  color:'#ce93d8',cd:60,dmg:3, spread:.1,  pellets:1, spd:5, startAmmo:8,       icon:'GRN',explosive:true},
  {name:'LMG',      color:'#a5d6a7',cd:8, dmg:1, spread:.05, pellets:1, spd:6, startAmmo:120,     icon:'LMG'},
  {name:'Minigun',  color:'#ff8f00',cd:2, dmg:1, spread:.12, pellets:1, spd:8, startAmmo:300,     icon:'MNI'},
  {name:'Plasma',   color:'#00e5ff',cd:20,dmg:6, spread:0,   pellets:1, spd:10,startAmmo:20,      icon:'PLS',plasma:true},
  // 20 new weapons
  {name:'Revolver', color:'#d4a017',cd:22,dmg:3, spread:0,   pellets:1, spd:9, startAmmo:18,      icon:'REV'},
  {name:'Burst',    color:'#80deea',cd:18,dmg:1, spread:.04, pellets:3, spd:8, startAmmo:60,      icon:'BST'},
  {name:'Rocket',   color:'#ff5722',cd:90,dmg:8, spread:0,   pellets:1, spd:6, startAmmo:6,       icon:'RKT',explosive:true},
  {name:'Flak',     color:'#ffb74d',cd:35,dmg:2, spread:.5,  pellets:8, spd:5, startAmmo:32,      icon:'FLK',explosive:true},
  {name:'Rail',     color:'#e040fb',cd:55,dmg:7, spread:0,   pellets:1, spd:18,startAmmo:10,      icon:'RLG',plasma:true},
  {name:'Laser',    color:'#ff4081',cd:3, dmg:1, spread:0,   pellets:1, spd:16,startAmmo:200,     icon:'LSR'},
  {name:'Crossbow', color:'#8d6e63',cd:40,dmg:5, spread:0,   pellets:1, spd:11,startAmmo:15,      icon:'CBW'},
  {name:'Flamer',   color:'#ff6d00',cd:4, dmg:1, spread:.3,  pellets:1, spd:4, startAmmo:150,     icon:'FLM'},
  {name:'IceCast',  color:'#b3e5fc',cd:25,dmg:2, spread:.1,  pellets:1, spd:7, startAmmo:30,      icon:'ICE'},
  {name:'Thunder',  color:'#ffd600',cd:50,dmg:5, spread:.15, pellets:2, spd:12,startAmmo:16,      icon:'THN'},
  {name:'Scatter',  color:'#69f0ae',cd:28,dmg:1, spread:.25, pellets:10,spd:7, startAmmo:40,      icon:'SCT'},
  {name:'Cannon',   color:'#b0bec5',cd:80,dmg:9, spread:0,   pellets:1, spd:4, startAmmo:8,       icon:'CAN',explosive:true},
  {name:'Saw',      color:'#ff1744',cd:6, dmg:2, spread:.02, pellets:1, spd:5, startAmmo:60,      icon:'SAW'},
  {name:'Void',     color:'#7c4dff',cd:35,dmg:5, spread:0,   pellets:1, spd:8, startAmmo:12,      icon:'VID',plasma:true},
  {name:'Dbl Shot', color:'#ffe082',cd:20,dmg:2, spread:.05, pellets:2, spd:9, startAmmo:50,      icon:'DBL'},
  {name:'Mortar',   color:'#a1887f',cd:70,dmg:6, spread:.2,  pellets:1, spd:3, startAmmo:10,      icon:'MRT',explosive:true},
  {name:'Stake',    color:'#c8e6c9',cd:30,dmg:4, spread:0,   pellets:1, spd:13,startAmmo:20,      icon:'STK'},
  {name:'Shotgun+', color:'#ff8a65',cd:28,dmg:2, spread:.4,  pellets:9, spd:7, startAmmo:18,      icon:'SH+'},
  {name:'Nuke',     color:'#ff0000',cd:120,dmg:12,spread:0,  pellets:1, spd:3, startAmmo:3,       icon:'NUK',explosive:true},
  {name:'Chainsaw', color:'#cc0000',cd:1, dmg:1, spread:.5,  pellets:1, spd:2, startAmmo:180,     icon:'CSW'},
  {name:'ArcBlast', color:'#00ccff',cd:45,dmg:4, spread:.6,  pellets:5, spd:9, startAmmo:14,      icon:'ARC',plasma:true},
  {name:'Cluster',  color:'#ff6600',cd:75,dmg:2, spread:.15, pellets:4, spd:5, startAmmo:12,      icon:'CLU',explosive:true},
  {name:'Phantom',  color:'#aa44ff',cd:30,dmg:3, spread:0,   pellets:1, spd:12,startAmmo:24,      icon:'PHM',plasma:true},
  {name:'BFG',      color:'#00ff44',cd:150,dmg:20,spread:0,  pellets:1, spd:5, startAmmo:2,       icon:'BFG',plasma:true},
  // Melee weapons
  {name:'Sword',     color:'#c0c0ff',cd:25, dmg:4, spread:.8,  pellets:5, spd:2, startAmmo:Infinity,icon:'SWD',melee:true},
  {name:'Axe',       color:'#cc6622',cd:35, dmg:7, spread:.6,  pellets:3, spd:2, startAmmo:Infinity,icon:'AXE',melee:true},
  {name:'Spear',     color:'#88aaff',cd:20, dmg:5, spread:.15, pellets:1, spd:3, startAmmo:Infinity,icon:'SPR',melee:true},  {name:'AntiAir',  color:'#80deea',cd:25,dmg:2, spread:.04, pellets:8, spd:8, startAmmo:40, icon:'AAR', upward:true},
  {name:'G.Missile',  color:'#ff3d00',cd:90,dmg:12,spread:0,   pellets:1, spd:5, startAmmo:6,  icon:'GMS', explosive:true, guided:true},
];
const MATERIALS=[
  {id:'wood',    name:'Wood',   costMult:1,  hpMult:1,   color:'#a1887f',dark:'#6d4c41',light:'#d7ccc8'},
  {id:'steel',   name:'Steel', costMult:2,  hpMult:2.5, color:'#78909c',dark:'#37474f',light:'#b0bec5'},
  {id:'concrete',name:'Concr', costMult:3,  hpMult:4,   color:'#757575',dark:'#424242',light:'#bdbdbd'},
  {id:'titanium',name:'Titan', costMult:5,  hpMult:8,   color:'#4fc3f7',dark:'#0277bd',light:'#b3e5fc'},
];
const STRUCT_DEFS=[
  {id:'wall',           name:'Wall',        cost:1, w:GRID,   h:GRID*2,   baseHp:20, blocksEnemy:true, blocksPlayer:true, onTop:false,turretType:null},
  {id:'platform',       name:'Platform',    cost:1, w:GRID*2, h:10,       baseHp:12, blocksEnemy:false,blocksPlayer:false,onTop:true, turretType:null},
  {id:'tower',          name:'Tower',       cost:3, w:GRID,   h:GRID*3,   baseHp:40, blocksEnemy:true, blocksPlayer:true, onTop:false,turretType:null},
  {id:'gate',           name:'Gate',        cost:2, w:GRID,   h:GRID*2,   baseHp:15, blocksEnemy:true, blocksPlayer:false,onTop:false,turretType:null},
  {id:'barricade',      name:'Barricade',   cost:1, w:GRID*2, h:GRID/2+4, baseHp:10, blocksEnemy:false, blocksPlayer:false,onTop:false,turretType:null},
  {id:'turret_basic',   name:'Turret',      cost:5, w:GRID,   h:GRID,     baseHp:8,  blocksEnemy:false,blocksPlayer:false,onTop:false,turretType:'basic',  range:260},
  {id:'turret_sniper',  name:'Sniper Trt',  cost:8, w:GRID,   h:GRID,     baseHp:6,  blocksEnemy:false,blocksPlayer:false,onTop:false,turretType:'sniper', range:500},
  {id:'turret_mortar',  name:'Mortar',      cost:10,w:GRID,   h:GRID+8,   baseHp:10, blocksEnemy:false,blocksPlayer:false,onTop:false,turretType:'mortar', range:350},
  {id:'turret_mini',    name:'Minigun Trt', cost:14,w:GRID,   h:GRID,     baseHp:12, blocksEnemy:false,blocksPlayer:false,onTop:false,turretType:'mini',   range:220},
  {id:'turret_plasma',  name:'Plasma Trt',  cost:35,w:GRID,   h:GRID+4,   baseHp:15, blocksEnemy:false,blocksPlayer:false,onTop:false,turretType:'plasma', range:380},
  {id:'turret_cannon',  name:'Cannon',      cost:18,w:GRID,   h:GRID+6,   baseHp:14, blocksEnemy:false,blocksPlayer:false,onTop:false,turretType:'cannon', range:320},
  // 10 new structures
  {id:'turret_rocket',  name:'Rkt Turret',  cost:22,w:GRID,   h:GRID+4,   baseHp:10, blocksEnemy:false,blocksPlayer:false,onTop:false,turretType:'rocket', range:420},
  {id:'turret_laser',   name:'Laser Trt',   cost:28,w:GRID,   h:GRID+2,   baseHp:8,  blocksEnemy:false,blocksPlayer:false,onTop:false,turretType:'laser',  range:460},
  {id:'turret_flak',    name:'Flak Gun',    cost:20,w:GRID,   h:GRID+6,   baseHp:12, blocksEnemy:false,blocksPlayer:false,onTop:false,turretType:'flak',   range:280},
  {id:'trap_spike',     name:'Spike Trap',  cost:4, w:GRID,   h:8,        baseHp:30, blocksEnemy:false,blocksPlayer:false,onTop:false,turretType:null,isTrap:true,trapType:'spike'},
  {id:'trap_freeze',    name:'Freeze Trap', cost:8, w:GRID,   h:8,        baseHp:20, blocksEnemy:false,blocksPlayer:false,onTop:false,turretType:null,isTrap:true,trapType:'freeze'},
  {id:'trap_fire',      name:'Fire Trap',   cost:6, w:GRID,   h:8,        baseHp:20, blocksEnemy:false,blocksPlayer:false,onTop:false,turretType:null,isTrap:true,trapType:'fire'},
  {id:'wall_spikes',    name:'SpkWall',     cost:3, w:GRID,   h:GRID*2,   baseHp:25, blocksEnemy:true, blocksPlayer:true, onTop:false,turretType:null,spiked:true},
  {id:'bunker',         name:'Bunker',      cost:18,w:GRID*5, h:GRID*3,   baseHp:120,blocksEnemy:true, blocksPlayer:true, onTop:true, turretType:null,isMinifort:true},
  {id:'fence',          name:'Fence',       cost:1, w:GRID*2, h:GRID,     baseHp:8,  blocksEnemy:true, blocksPlayer:false,onTop:false,turretType:null},
  {id:'ladder',         name:'Ladder',      cost:1, w:GRID/2, h:GRID*3,   baseHp:8,  blocksEnemy:false,blocksPlayer:false,onTop:false,turretType:null,isLadder:true},
  {id:'stairway',       name:'Stairway',    cost:2, w:GRID*3, h:GRID*2,   baseHp:12, blocksEnemy:false,blocksPlayer:false,onTop:false,turretType:null,isStair:true},
  {id:'bomb',           name:'Bomb',        cost:25,w:GRID,   h:GRID,     baseHp:999,blocksEnemy:false,blocksPlayer:false,onTop:false,turretType:null,isBomb:true},
  {id:'fortress',       name:'Fortress',    cost:50,w:GRID*7, h:GRID*4,   baseHp:200,blocksEnemy:true, blocksPlayer:true, onTop:true, turretType:null,isFortress:true},
  {id:'shield_gen',     name:'ShieldGen',   cost:30,w:GRID*2, h:GRID+8,   baseHp:25, blocksEnemy:false,blocksPlayer:false,onTop:false,turretType:null,isShieldGen:true,shieldRadius:120},
  {id:'ammo_depot',     name:'AmmoDep',     cost:12,w:GRID*2, h:GRID,     baseHp:20, blocksEnemy:false,blocksPlayer:false,onTop:false,turretType:null,isAmmoDepot:true},
];

// ── Player Skins ─────────────────────────────────────────────────────────
const SKINS=[];// stripped for server

let playerSkins=[0,0,0,0];// skin index per player slot
// Turret immunity map
const TURRET_IMMUNE={
  ironclad:['basic'],       // immune to basic turret
  specter:['sniper'],       // immune to sniper
  mudwall:['mortar'],       // immune to mortar (hides underground-like)
  plasmaskin:['plasma'],    // immune to plasma
  rockethide:['rocket'],    // immune to rocket
  lasertrap:['laser'],      // immune to laser
  flakshell:['flak'],       // immune to flak
  miniwall:['mini'],        // immune to minigun turret
  cannonproof:['cannon'],   // immune to cannon
  voidform:['basic','sniper','mortar','plasma','rocket','laser','flak','mini','cannon'], // immune to ALL turrets
};
const ENEMY_CODEX=[];// stripped for server





// ── Achievements & Unlockable Skins ──────────────────────────────────────
const ACHIEVEMENTS=[];// stripped for server

let achieveStats={structs:0,maxWaveNoBuilds:0,kills:0,meleeKills:0};
// ── Account system ──────────────────────────────────────────────────
let _accounts={};try{_accounts=JSON.parse(localStorage.getItem('frontline_accounts')||'{}');}catch(e){}
let _currentUser=localStorage.getItem('frontline_user')||'';
let accountState=_currentUser&&_accounts[_currentUser]?'lobby':'login';// skip login if already logged in
let accountInput='';// current text being typed
let accountField='user';// 'user' or 'pass'
let accountUser='';// username being entered
let accountPass='';// password being entered
let accountMsg='';// feedback message
let accountMode='login';// 'login' or 'register'

// Load save data for current user
function _loadUserSave(){
  if(!_currentUser)return;
  const acc=_accounts[_currentUser];
  if(!acc)return;
  try{
    if(acc.skins)acc.skins.forEach(s=>unlockedSkins.add(s));
    if(acc.hi)hi=acc.hi;
    if(acc.playerSkins)acc.playerSkins.forEach((s,i)=>{if(i<4)playerSkins[i]=s;});
  }catch(e){}
}
function _saveUserData(){
  // Save to guest slot always
  try{localStorage.setItem('frontline_save',JSON.stringify({skins:[...unlockedSkins],hi,playerSkins:[...playerSkins]}));}catch(e){}
  if(!_currentUser||!_accounts[_currentUser])return;
  _accounts[_currentUser].skins=[...unlockedSkins];
  _accounts[_currentUser].hi=hi;
  _accounts[_currentUser].playerSkins=[...playerSkins];
  try{localStorage.setItem('frontline_accounts',JSON.stringify(_accounts));}catch(e){}
}
function _hashPass(s){// simple djb2
  let h2=5381;for(let i=0;i<s.length;i++)h2=((h2<<5)+h2)+s.charCodeAt(i);
  return (h2>>>0).toString(16);
}
if(_currentUser&&_accounts[_currentUser])_loadUserSave();

// Load persisted data
let _saved={};try{_saved=JSON.parse(localStorage.getItem('frontline_save')||'{}');}catch(e){}
let unlockedSkins=new Set(['soldier']);// guest starts with soldier only; skins loaded after login
let recentAchieve=null,achieveTimer=0;

function checkAchievements(){
  ACHIEVEMENTS.forEach(a=>{
    if(unlockedSkins.has(a.skinUnlock)&&a.id!=='allbosses')return;// already done
    if(a.check()){
      if(!unlockedSkins.has(a.skinUnlock)){
        unlockedSkins.add(a.skinUnlock);
        recentAchieve=a;achieveTimer=220;
        // Persist to both guest save and user account
        try{localStorage.setItem('frontline_save',JSON.stringify({skins:[...unlockedSkins],hi}));}catch(e){}
        _saveUserData();
      }
    }
  });
  // Track no-builds wave progress
  if(!buildPhase&&structs.filter(s=>!s.dead&&!s.enemyBuilt).length===0){
    achieveStats.maxWaveNoBuilds=Math.max(achieveStats.maxWaveNoBuilds,wave);
  }
}
function nextSkin(cur){let n=cur;for(let i=0;i<SKINS.length;i++){n=(n+1)%SKINS.length;if(unlockedSkins.has(SKINS[n].id))return n;}return cur;}
function resetAchieveStats(){
  achieveFlags={tank_boss:false,aerial_boss:false,sniper_boss:false,conductor:false,vesper:false,colossus:false,wraith:false,swarm_queen:false};
  achieveStats={structs:0,maxWaveNoBuilds:0};
}
// Resistance map — enemy types that take 50% from certain damage sources
const RESIST_MAP={
  walk:       ['laser'],
  shoot:      ['mortar'],
  fast:       ['cannon'],
  heavy:      ['basic'],
  digger:     ['plasma'],
  bomber:     ['sniper'],
  builder:    ['mortar'],
  shield:     ['rocket'],
  flyer:      ['flak'],
  juggernaut: ['basic'],
  sneak:      ['sniper'],
  swarm:      ['cannon'],
  healer:     ['laser'],
  leaper:     ['mini'],
  berserker:  ['rocket'],
  ghost:      ['plasma'],
  tank_walker:['flak'],
  suicide:    ['sniper'],
  necro:      ['basic'],
  giant:      ['cannon'],
  phantom:    ['plasma'],
  spider:     ['laser'],
  // Immune enemies also have resist
  ironclad:   ['basic'],
  specter:    ['sniper'],
  mudwall:    ['mortar'],
  plasmaskin: ['plasma'],
  rockethide: ['rocket'],
  lasertrap:  ['laser'],
  flakshell:  ['flak'],
  miniwall:   ['mini'],
  cannonproof:['cannon'],
  voidform:   ['basic','sniper','mortar','plasma','rocket','laser','flak','mini','cannon'],
};
// Build resistance lookup from codex
const ENEMY_RESIST_MAP={};
// Will be populated after ENEMY_CODEX is parsed
function buildResistMap(){
  ENEMY_CODEX.forEach(e=>{
    if(e.resist)ENEMY_RESIST_MAP[e.type]=e.resist;
  });
}
// ── State ──────────────────────────────────────────────────────────────
let boss1v1Page=0;
let paused=false,pauseControls=false;
let achScroll=0;// achievements page scroll offset// current mode is nightmare
let nightmareUnlocked={};// set of boss variants beaten in normal mode
// WORLD_W defined in server header
const GAME_VERSION='v4.7';
const MAPS=[
  {name:'GRASSLANDS',bg:'#4a8fc4',ground:'#3a7a1a',groundTop:'#5cc832',mountains:['#2a5c8a','#3a7ab0','#5090c8'],stars:false,fog:false,fogCol:'',sunset:false,clouds:true,sunriseGrad:['#87ceeb','#4a8fc4','#2a6a9a']},
  {name:'VOLCANO',   bg:'#2a0a00',ground:'#3a1000',groundTop:'#cc3300',mountains:['#4a1a00','#601800','#3a0800'],stars:false,fog:true,fogCol:'rgba(255,80,0,0.06)',sunset:true,clouds:false,sunriseGrad:['#4a0800','#8a1a00','#cc2200']},
  {name:'ARCTIC',    bg:'#b8d4e8',ground:'#2a4a5a',groundTop:'#d4ecf7',mountains:['#8ab0c8','#a0c4d8','#c0d8ea'],stars:false,fog:true,fogCol:'rgba(200,230,255,0.08)',sunset:false,clouds:true,sunriseGrad:['#c8e0f0','#b0cce0','#90b8d0']},
  {name:'SUNSET',    bg:'#ff6b35',ground:'#1a1208',groundTop:'#cc8800',mountains:['#cc4400','#ff6622','#ff8844'],stars:false,fog:false,fogCol:'',sunset:true,clouds:true,sunriseGrad:['#ff9944','#ff6b35','#cc3300']},
  {name:'NIGHT CITY',bg:'#05050f',ground:'#0a0a18',groundTop:'#2244aa',mountains:['#0a0a18','#0c0c22','#10102a'],stars:true,fog:true,fogCol:'rgba(80,60,180,0.05)',sunset:false,clouds:false,sunriseGrad:['#05050f','#08081a','#0a0a1e']},
  {name:'FOREST',    bg:'#2a6a8a',ground:'#1a3a08',groundTop:'#4a9a1a',mountains:['#1a3a10','#223a14','#2a4818'],stars:false,fog:false,fogCol:'',sunset:false,clouds:false,sunriseGrad:['#5a9ab8','#3a7a9a','#2a5a7a'],
   features:{trees:true,platforms:true,lake:false,trenches:false}},
  {name:'WARZONE',   bg:'#2a1a08',ground:'#1a1208',groundTop:'#554433',mountains:['#1a1008','#221408','#2a1a0a'],stars:false,fog:true,fogCol:'rgba(120,90,40,0.1)',sunset:false,clouds:false,sunriseGrad:['#2a1a08','#1a1008','#120c05'],
   features:{trees:false,platforms:false,lake:false,trenches:true}},
  {name:'HIGHLANDS', bg:'#6a9abf',ground:'#1a3a1a',groundTop:'#4a8840',mountains:['#3a7090','#4a8aaa','#5a9abc'],stars:false,fog:true,fogCol:'rgba(200,220,180,0.06)',sunset:false,clouds:true,sunriseGrad:['#7aaacf','#6a9abf','#5a8aaf'],
   features:{trees:true,platforms:true,lake:true,trenches:false}},
  {name:'BADLANDS',  bg:'#8a4a10',ground:'#2a1a00',groundTop:'#aa6622',mountains:['#6a2a00','#8a3a00','#aa4a00'],stars:false,fog:false,fogCol:'',sunset:true,clouds:false,sunriseGrad:['#cc6622','#8a4a10','#5a2a00'],
   scrollable:true,
   features:{trees:false,platforms:true,lake:false,trenches:true}},
  {name:'SKYFORT',   bg:'#1a2a5a',ground:'#0a1030',groundTop:'#2244aa',mountains:['#1a2a4a','#223060','#2a3870'],stars:true,fog:true,fogCol:'rgba(40,80,200,0.06)',sunset:false,clouds:true,sunriseGrad:['#2a3a6a','#1a2a5a','#0a1a4a'],
   scrollable:true,
   features:{trees:false,platforms:true,lake:false,trenches:false,skyPlatforms:true}},
];
function diffMult(){return .7+numPlayers*.3;}
function makeGun(i){const d=GUN_DEFS[i];return{defIdx:i,name:d.name,ammo:d.startAmmo,cd:0};}
function makeP(cfg,idx){
  const ww3=MAPS[currentMap]&&MAPS[currentMap].scrollable?WORLD_W:BW;
  const sx=[ww3/2-200,ww3/2+200,ww3/2-300,ww3/2+300][idx]||ww3/2;
  const sk=SKINS[playerSkins[idx]||0];
  return{x:sx,y:GY,w:18,h:34,vy:0,onGround:true,hp:6,maxHp:6,dir:idx%2===0?1:-1,dead:false,color:cfg.color,label:cfg.label,inv:0,respawn:0,scrap:0,idx,gunSlot:0,guns:[makeGun(0)],buildMode:false,buildSel:0,matSel:0,repairCD:0,keys:cfg.keys,webbed:0,shielded:false,shieldTimer:0,skinId:sk.id,swingTimer:0};
}
function resetPlayers(){players=[];for(let i=0;i<numPlayers;i++){const p=makeP(P_CFG[i],i);p.dead=false;p.hp=p.maxHp;p.inv=90;players.push(p);}const sc=Math.ceil(30/numPlayers);players.forEach(p=>p.scrap=sc);}
function buildResistMap(){
  ENEMY_CODEX.forEach(e=>{
    if(e.resist)ENEMY_RESIST_MAP[e.type]=e.resist;
  });
}
function fireBullet(x,y,dir,isE,dmg,spd,explosive,spread,plasma,melee,pvpTeam){
  if(melee){
    enemies.forEach(e=>{if(e.dead||e.underground)return;if(Math.abs(e.x-(x+dir*18))<22&&Math.abs(e.y-y)<28){if(e.shielded){e.shieldHp-=dmg;if(e.shieldHp<=0)e.shielded=false;return;}e.hp-=dmg;if(e.hp<=0){killEnemy(e);if(achieveStats)achieveStats.meleeKills=(achieveStats.meleeKills||0)+1;}}});
    return;
  }
  if(buildPhase&&state!=='pvp')return;
  const isUp=arguments.length>11&&arguments[11];
  const j=(Math.random()-.5)*spread;
  const _b={x,y,vx:dir*spd*Math.cos(j),vy:spd*Math.sin(j),isE,dmg,life:Math.round(600/Math.max(1,spd)),explosive:!!explosive,plasma:!!plasma,r:plasma?5:explosive?6:3,cannon:false,pvpTeam};
  bullets.push(_b);return _b;
}
function explode(x,y,dmg,R=64,isEnemyExpl=false){
  
  enemies.forEach(e=>{if(e.dead)return;if(isEnemyExpl&&e.type==='boss')return;const d=Math.hypot(e.x-x,e.y-y);if(d<R){e.hp-=dmg*(1-d/R);if(e.hp<=0)killEnemy(e);}});
  structs.forEach(s=>{if(s.dead||s.id==='bomb')return;const d=Math.hypot(s.x-x,s.y-y);if(d<R){s.hp-=dmg*(1-d/R);if(s.hp<=0)destroyStruct(s);}});
  if(!post.dead&&Math.hypot(post.x-x,post.y-y)<R)post.hp=Math.max(0,post.hp-dmg*.4);
  players.forEach(p=>{if(p.dead||p.inv>0)return;if(Math.hypot(p.x-x,p.y-y)<R*.7){p.hp--;p.inv=60;}});
}
function destroyStruct(s){if(s.dead)return;s.dead=true;}
function killEnemy(e){
  if(e.dead)return;e.dead=true;
  if(achieveStats)achieveStats.kills=(achieveStats.kills||0)+1;
  if(e.type==='boss'&&e.bossVariant){
    // Set both plain and suffixed keys so all achievement checks work
    achieveFlags[e.bossVariant]=true;
    achieveFlags[e.bossVariant+'_boss']=true;// for tank_boss, aerial_boss etc.
    // Also set archon/sans/radiance specifically
    if(e.bossVariant==='archon')achieveFlags.archon_boss=true;
    if(e.bossVariant==='sans'){achieveFlags.sans_boss=true;achieveFlags['you can do this.']=true;}
    if(e.bossVariant==='caine'){achieveFlags.caine_boss=true;unlockedSkins.add('kinger');recentAchieve={name:'I think I killed Caine',icon:'KNG',col:'#cc00ff',skinUnlock:'kinger'};achieveTimer=220;_saveUserData();}
    if(e.bossVariant==='caine'){achieveFlags.caine_boss=true;unlockedSkins.add('kinger');recentAchieve={name:'I think I killed Caine',icon:'KNG',col:'#aa00ff',skinUnlock:'kinger'};achieveTimer=220;_saveUserData();}
    if(e.bossVariant==='radiance')achieveFlags.radiance_boss=true;
    if(!achieveStats)achieveStats={structs:0,maxWaveNoBuilds:0,kills:0,meleeKills:0};
    if(!achieveStats.bossKills)achieveStats.bossKills={};
    achieveStats.bossKills[e.bossVariant]=(achieveStats.bossKills[e.bossVariant]||0)+1;
    checkAchievements();
  }
  const pts={boss:500,heavy:50,fast:10,shoot:30,digger:25,bomber:40,builder:60,shield:80,flyer:35,walk:20}[e.type]||20;
  score+=pts;const sc={boss:20,heavy:5,shoot:3,bomber:3,builder:5,shield:6,flyer:2}[e.type]||1;
  for(let i=0;i<sc;i++)scraps.push({x:e.x+(Math.random()-.5)*20,y:e.y-10,vy:-2-Math.random()*2,life:500});
  if(e._drop)wdrops.push({x:e.x,y:e.y-16,gIdx:1+Math.floor(Math.random()*(GUN_DEFS.length-1)),life:600,bob:0});
  
}
function spawnAirdrop(){
  const x=80+Math.random()*(BW-160),isMedkit=Math.random()<.55;
  airdrops.push({x,y:-20,vy:1.2,type:isMedkit?'medkit':'weapon',gIdx:isMedkit?-1:Math.floor(Math.random()*GUN_DEFS.length),parachute:true,landed:false,life:600});
}
function getDef(s){return STRUCT_DEFS.find(d=>d.id===s.id)||STRUCT_DEFS[0];}
function getMat(s){return MATERIALS.find(m=>m.id===s.mat)||MATERIALS[0];}
function snapX(x){return Math.round(x/GRID)*GRID;}
function placePos(p,def){
  const reach=p.w/2+def.w/2+4;
  const snapW=def.w>=GRID*2?def.w:GRID;
  // Find a same-type struct the player is standing on/next to, to snap flush against
  const feetY=p.y;
  const standingOn=structs.find(s=>{
    if(s.dead)return false;
    const sTop=s.y-s.h;
    return (def.w===s.w||def.h===s.h)&&Math.abs(feetY-sTop)<8&&Math.abs(p.x-s.x)<s.w/2+p.w/2+4;
  });
  if(standingOn){
    // Snap flush to side, same y as the struct being stood on — no surface logic needed
    const px=standingOn.x+p.dir*(standingOn.w/2+def.w/2);
    return{x:px,y:standingOn.y};
  }
  // No adjacent same-type struct — use grid snap + surface detection
  const rawX=p.x+p.dir*reach;
  const px=p.dir>0?Math.ceil(rawX/snapW)*snapW:Math.floor(rawX/snapW)*snapW;
  const surfaces=[GY];
  structs.forEach(s=>{
    if(s.dead)return;
    if(Math.abs(s.x-px)<(s.w/2+def.w/2+2)) surfaces.push(s.y-s.h);
  });
  const SNAP_RANGE=GRID*3;
  let bestY=GY,bestDist=Math.abs(GY-p.y);
  for(const sy of surfaces){
    const dist=Math.abs(sy-p.y);
    if(dist<bestDist&&sy<=p.y+SNAP_RANGE){bestDist=dist;bestY=sy;}
  }
  return{x:px,y:bestY};
}
function tryPlace(p){if(isBoss1v1)return;// no building in 1v1 boss modeif(isBoss1v1)return;
  const cost=def.isBomb?def.cost:Math.ceil(def.cost*mat.costMult);
  if(!cheats.masterBuilder&&p.scrap<cost)return;
  const{x,y}=placePos(p,def);
  if(structs.some(s=>!s.dead&&Math.abs(s.x-x)<(s.w+def.w)/2-8&&Math.abs((s.y-s.h/2)-(y-def.h/2))<(s.h+def.h)/2-8)||y<40)return;
  const hp=def.isBomb?9999:Math.round(def.baseHp*mat.hpMult);
  const ns3={...def,x,y,hp,maxHp:hp,dead:false,shootCD:0,range:def.range||260,mat:mat.id,enemyBuilt:false};if(state==='pvp'&&p.pvpTeam!==undefined)ns3.pvpTeam=p.pvpTeam;structs.push(ns3);
  if(!cheats.masterBuilder)p.scrap-=cost;
  
  achieveStats.structs++;checkAchievements();
  // Spawn interior ladder for minifort/fortress
  if(def.isMinifort){
    const ldef=STRUCT_DEFS.find(d=>d.id==='ladder');
    if(ldef){const lx=x+def.w/2-14,ly=y;structs.push({...ldef,x:lx,y:ly,h:def.h,maxHp:ldef.baseHp,hp:ldef.baseHp,dead:false,shootCD:0,range:0,mat:'wood',enemyBuilt:false});}
  }
  if(def.isFortress){
    const ldef=STRUCT_DEFS.find(d=>d.id==='ladder');
    if(ldef){const lx=x-def.w/2+18,ly=y;structs.push({...ldef,x:lx,y:ly,h:def.h,maxHp:ldef.baseHp,hp:ldef.baseHp,dead:false,shootCD:0,range:0,mat:'wood',enemyBuilt:false});}
  }
}
function tryDemo(p){
  let best=null,bestD=80;structs.forEach(s=>{if(s.dead||s.enemyBuilt)return;const d=Math.hypot(s.x-p.x,s.y-p.y);if(d<bestD){bestD=d;best=s;}});
  if(best){const def=getDef(best),mat=getMat(best);p.scrap+=Math.floor(Math.ceil(def.cost*mat.costMult)*.5);destroyStruct(best);}
}
function tryRepair(p){if(isBoss1v1)return;// already patched
  if(p.repairCD>0)return;
  let best=null,bestNeed=0;
  structs.forEach(s=>{if(s.dead||s.isBomb)return;const need=s.maxHp-s.hp;if(need>0&&Math.hypot(s.x-p.x,s.y-p.y)<70&&need>bestNeed){bestNeed=need;best=s;}});
  if(!post.dead){const need=post.maxHp-post.hp;if(need>0&&Math.hypot(post.x-p.x,post.y-p.y)<70&&need>bestNeed){bestNeed=need;best='post';}}
  if(!best)return;
  if(!cheats.masterBuilder&&p.scrap<1)return;
  if(!cheats.masterBuilder)p.scrap--;
  p.repairCD=40;
  const _rhp2=getSkin&&getSkin(p)&&getSkin(p).id==='knight_hk'?12:5;
  if(best==='post'){post.hp=Math.min(post.maxHp,post.hp+_rhp2);}
  else{best.hp=Math.min(best.maxHp,best.hp+_rhp2);}
}
function getMC(s){return s.enemyBuilt?'#c62828':getMat(s).color;}
function getMD(s){return s.enemyBuilt?'#7f0000':getMat(s).dark;}
function getML(s){return s.enemyBuilt?'#ef5350':getMat(s).light||getMat(s).color;}
function getSkin(p){return SKINS.find(s=>s.id===p.skinId)||SKINS[0];}
function spawnMapFeatures(){
  const M2=MAPS[currentMap];
  if(M2&&M2.scrollable){
    const ldef2=STRUCT_DEFS.find(d=>d.id==='platform');
    if(ldef2){
      // Wide spread of platforms across the world
      const platPositions=[];
      for(let px2=200;px2<WORLD_W-200;px2+=180+Math.floor(px2/100)*20){
        const py2=GY-60-Math.floor(Math.random()*4)*30;
        platPositions.push({x:px2,y:py2});
      }
      platPositions.forEach(pp=>{
        structs.push({...ldef2,x:pp.x,y:pp.y,hp:999,maxHp:999,dead:false,shootCD:0,range:0,mat:'wood',enemyBuilt:false,mapFeature:true});
      });
    }
    if(M2.features&&M2.features.skyPlatforms){
      // High sky platforms with ladders
      const ldef3=STRUCT_DEFS.find(d=>d.id==='platform');
      const laddef=STRUCT_DEFS.find(d=>d.id==='ladder');
      for(let sx2=300;sx2<WORLD_W-300;sx2+=300){
        const sy2=GY-120-Math.floor(sx2/400)*20;
        if(ldef3)structs.push({...ldef3,x:sx2,y:sy2,hp:999,maxHp:999,dead:false,shootCD:0,range:0,mat:'wood',enemyBuilt:false,mapFeature:true});
        if(laddef)structs.push({...laddef,x:sx2,y:GY,h:GY-sy2,maxHp:laddef.baseHp,hp:laddef.baseHp,dead:false,shootCD:0,range:0,mat:'wood',enemyBuilt:false,mapFeature:true});
      }
    }
    return;// early return - rest of function handles non-scrollable
  }
  const M=MAPS[currentMap];
  if(!M.features)return;
  if(M.features.platforms){
    // Elevated platforms to climb — real game structs
    const plats=currentMap===5?[ // FOREST
      {x:120,y:GY-80},{x:250,y:GY-120},{x:400,y:GY-80},{x:600,y:GY-140},{x:750,y:GY-100}
    ]:[// HIGHLANDS
      {x:100,y:GY-60},{x:260,y:GY-110},{x:500,y:GY-80},{x:700,y:GY-130},{x:820,y:GY-70}
    ];
    plats.forEach(p=>{
      const pdef=STRUCT_DEFS.find(d=>d.id==='platform');
      if(pdef)structs.push({...pdef,x:p.x,y:p.y,hp:999,maxHp:999,dead:false,shootCD:0,range:0,mat:'wood',enemyBuilt:false,mapFeature:true});
    });
  }
  if(M.features.trenches){
    // Trenches — mark zones where enemies are slowed (we draw them in drawBG)
    // Stored as game data for enemy speed reduction
    mapTrenches=[{x:200,w:80},{x:500,w:80},{x:700,w:60}];
  } else {mapTrenches=[];}
  if(M.features.lake){
    // Lake — central obstacle, enemies path around it
    mapLake={x:80,w:100,active:true};
  } else {mapLake=null;}
}
function actuallySpawnWave(n){
  const dm=diffMult();const isBoss=n%5===0;
  if(isBoss){
    // 3 boss types rotating: 5=tank, 10=bomber, 15=sniper, repeating
    const allVariants=['tank','aerial','sniper','conductor','vesper','colossus','wraith','swarm_queen','archon','sans','radiance'];
const bossVariant=allVariants[Math.floor((n/5-1)%allVariants.length)];
    const fr=Math.random()>.5;
    const bossHp=bossVariant==='sans'?1:Math.round((80+n*10)*dm*({flynn:.5}[bossVariant]||1));
    const bossFlying=bossVariant==='aerial'||bossVariant==='vesper'||bossVariant==='wraith'||bossVariant==='radiance'||bossVariant==='flynn';
    const bossSpeed={tank:.45,aerial:.55,sniper:.3,conductor:.9,vesper:.8,colossus:.3,wraith:.7,swarm_queen:.4,archon:.6,sans:1.8,radiance:.5,midas:.35,archie:.6,flynn:.45,caine:.5}[bossVariant]||.45;
    const bossW={conductor:36,vesper:24,aerial:52,tank:44,colossus:60,wraith:28,swarm_queen:40,archon:32,sans:28,radiance:48}[bossVariant]||44;
    const bossH={conductor:50,vesper:44,aerial:48,tank:60,colossus:72,wraith:54,swarm_queen:48,archon:48,sans:44,radiance:52}[bossVariant]||60;
    const bossStartY=bossFlying?GY-120:GY;
    const startOff=bossVariant==='conductor'||bossVariant==='vesper'?20:80;
    enemies.push({x:fr?BW+startOff:-startOff,y:bossStartY,w:bossW,h:bossH,vy:0,onGround:!bossFlying,hp:bossHp,maxHp:bossHp,dir:fr?-1:1,type:'boss',bossVariant,speed:bossSpeed,shootCD:50,dead:false,targetPost:false,phase:0,_drop:true,shielded:false,bobOffset:0,
      // Conductor state
      beatTimer:0,beatInterval:90,attackQueue:[],attackIdx:0,spotlights:[],conductorPhase:0,
      // Vesper state
      vWallJumping:false,vJumpCD:0,vDaggerCD:0,vSlashCD:0,vParryWindow:0,vSilkTraps:[],vClones:[],vSpinning:false,vSpinTimer:0,
    });
    const escort=bossVariant==='tank'?'heavy':bossVariant==='aerial'||bossVariant==='wraith'?'flyer':bossVariant==='colossus'?'juggernaut':bossVariant==='swarm_queen'?'swarm':'shoot';
    for(let i=0;i<4+numPlayers;i++){const ef=Math.random()>.5;const ehp=Math.round(2*dm);enemies.push({x:ef?BW+20+i*30:-20-i*30,y:escort==='flyer'?GY-60-Math.random()*60:GY,w:18,h:escort==='flyer'?20:32,vy:0,onGround:escort!=='flyer',hp:ehp,maxHp:ehp,dir:ef?-1:1,type:escort,speed:.9,shootCD:60+Math.random()*40,dead:false,targetPost:false,shielded:false,bobOffset:Math.random()*Math.PI*2,throwCD:200,buildCD:400,builtCount:0,maxBuilds:0,underground:false,digging:false,digTimer:0,emergeTimer:0});}
    bossWarning=200;bossWarningType=bossVariant;
    setTimeout(spawnAirdrop,2000);return;
  }
  const count=Math.round((5+n*2)*dm);
  const waveHpBonus=1+Math.floor(n/3)*0.15;
  const typeWeights=[[.08,'walk'],[.05,'shoot'],[.04,'fast'],[.04,'heavy'],[.04,'digger'],[.04,'bomber'],[.02,'builder'],[.02,'shield'],[.04,'flyer'],[.03,'juggernaut'],[.03,'sneak'],[.02,'swarm'],[.02,'healer'],[.02,'leaper'],[.02,'berserker'],[.02,'ghost'],[.01,'tank_walker'],[.03,'suicide'],[.03,'necro'],[.03,'giant'],[.03,'phantom'],[.02,'spider'],[.04,'ironclad'],[.03,'specter'],[.03,'mudwall'],[.03,'plasmaskin'],[.03,'rockethide'],[.03,'lasertrap'],[.03,'flakshell'],[.03,'miniwall'],[.03,'cannonproof'],[.03,'voidform']];
  for(let i=0;i<count;i++){
    const fr=Math.random()>.5,tr=Math.random();let type='walk',acc=0;
    for(const[w,t]of typeWeights){acc+=w;if(tr<acc){type=t;break;}}
    const hpMap={heavy:10,fast:1,shoot:3,digger:3,bomber:4,builder:6,shield:12,walk:2,flyer:3,juggernaut:20,sneak:2,swarm:1,healer:4,leaper:3,berserker:3,ghost:2,tank_walker:18,suicide:3,necro:6,giant:30,phantom:4,spider:5,ironclad:8,specter:4,mudwall:6,plasmaskin:5,rockethide:6,lasertrap:5,flakshell:6,miniwall:5,cannonproof:8,voidform:12};
    const hp=Math.max(1,Math.round((hpMap[type]||2)*dm*waveHpBonus));
    const isFlyer=type==='flyer'||type==='ghost'||type==='phantom';
    enemies.push({x:fr?BW+8+i*22:-8-i*22,y:isFlyer?GY-80-Math.random()*80:GY,w:isFlyer?16:type==='heavy'?24:type==='shield'?22:type==='juggernaut'?28:type==='tank_walker'?32:type==='giant'?38:18,h:isFlyer?16:type==='heavy'?38:type==='shield'?36:type==='digger'?28:type==='juggernaut'?44:type==='tank_walker'?40:type==='giant'?52:34,vy:0,onGround:!isFlyer,hp,maxHp:hp,dir:fr?-1:1,type,speed:{fast:2.2,heavy:.8,digger:1.3,bomber:1.0,builder:.9,shield:.9,flyer:1.5,juggernaut:.6,sneak:1.8,swarm:1.9,healer:.8,leaper:1.6,berserker:2.5,ghost:1.2,tank_walker:.5,suicide:2.0,necro:.7,giant:.4,phantom:1.1,spider:1.8,ironclad:.8,specter:1.6,mudwall:.7,plasmaskin:1.2,rockethide:1.1,lasertrap:1.3,flakshell:1.0,miniwall:.9,cannonproof:.6,voidform:1.0}[type]||1.4,shootCD:60+Math.random()*60,dead:false,targetPost:Math.random()<.35,_drop:i===0&&n%2===0,digging:false,digTimer:0,underground:false,emergeTimer:0,throwCD:120+Math.random()*80,buildCD:200+Math.random()*100,builtCount:0,maxBuilds:2,shielded:type==='shield',shieldHp:type==='shield'?8:0,shieldAngle:0,bobOffset:Math.random()*Math.PI*2});
  }
  if(n%2===0)setTimeout(spawnAirdrop,5000+Math.random()*8000);
}
function spawnWave(n){pendingWave=n;}
function checkWave(){
  if(isBoss1v1&&!buildPhase){
    // 1v1 mode: show win screen when boss dies, respawn players on death
    if(enemies.filter(e=>!e.dead).length===0){
      // Boss defeated — show victory
      
      
    }
    return;
  }
  if(buildPhase){
    // Any player pressing Space starts the wave
    if(keys[' ']&&!readyUp){readyUp=true;}
    if(readyUp){
      buildPhase=false;readyUp=false;waveTimer=WDELAY;
      bullets=[];actuallySpawnWave(pendingWave);
      players.forEach(p=>p.buildMode=false);
    }
    return;
  }
  if(waveTimer>0){waveTimer--;return;}
  if(enemies.filter(e=>!e.dead).length===0){
    const bonus=8+wave*2;players.forEach(p=>{if(!p.dead){p.hp=Math.min(p.maxHp,p.hp+2);p.scrap+=Math.ceil(bonus/numPlayers);}});
    post.hp=Math.min(post.maxHp,post.hp+3);wave++;buildPhase=true;readyUp=false;spawnWave(wave);waveStartTime=Date.now();players.forEach(p=>p.buildMode=false);
    checkAchievements();
  }
}
function startGame(){
  isBoss1v1=false;
  state='playing';wave=1;score=0;pendingWave=1;bossWarning=0;
  resetAchieveStats();
  enemies=[];bullets=[];particles=[];scraps=[];structs=[];wdrops=[];airdrops=[];fireballs=[];blimpDropCd=0;skyBlimps=[];
  const worldW2=MAPS[currentMap]&&MAPS[currentMap].scrollable?WORLD_W:BW;
  post={x:worldW2/2,y:GY,w:48,h:52,hp:30,maxHp:30,pulse:0,dead:false};
  resetPlayers();buildPhase=true;readyUp=false;spawnWave(1);
  spawnMapFeatures();
}
function updatePlayers(){
  players.forEach((p,pi)=>{
    if(cheats.masterBuilder)p.scrap=Math.max(p.scrap,999);
    if(cheats.hitman){GUN_DEFS.forEach((gd,idx)=>{const ex=p.guns.find(g=>g.defIdx===idx);if(ex){if(gd.startAmmo!==Infinity)ex.ammo=gd.startAmmo;}else p.guns.push({defIdx:idx,name:gd.name,ammo:gd.startAmmo,cd:0});});}
    if(p.dead){if(isBoss1v1||state==='pvp')return;// pvp has its own respawn logic
    p.respawn--;if(p.respawn<=0&&!post.dead){p.dead=false;p.hp=p.maxHp;p.inv=90;const off=(pi-(numPlayers-1)/2)*50;p.x=post.x+off;p.y=GY;p.vy=0;}return;}
    if(p.inv>0&&!cheats.remedy312)p.inv--;
    if(p.swingTimer>0)p.swingTimer--;
    if(p.repairCD>0)p.repairCD--;
    if(justP(p,'build'))p.buildMode=!p.buildMode;
    if(p.buildMode){
      if(justP(p,'cycle'))p.buildSel=(p.buildSel+1)%STRUCT_DEFS.length;
      if(justP(p,'cycleBack'))p.buildSel=(p.buildSel-1+STRUCT_DEFS.length)%STRUCT_DEFS.length;
      if(justP(p,'shoot'))tryPlace(p);
      if(justP(p,'demo'))tryDemo(p);
      if(justP(p,'matL'))p.matSel=Math.max(0,p.matSel-1);
      if(justP(p,'matR'))p.matSel=Math.min(MATERIALS.length-1,p.matSel+1);
    }else{
      if(justP(p,'cycle')&&p.guns.length>1)p.gunSlot=(p.gunSlot+1)%p.guns.length;
      if(justP(p,'cycleBack')&&p.guns.length>1)p.gunSlot=(p.gunSlot-1+p.guns.length)%p.guns.length;
      const g=p.guns[p.gunSlot],gd=GUN_DEFS[g.defIdx];
      if(g.cd>0)g.cd--;
      if(!buildPhase&&keys[p.keys.shoot]&&g.cd<=0&&(cheats.hitman||g.ammo===Infinity||g.ammo>0)){
        const bx=p.x+p.dir*(p.w/2+14),by=p.y-p.h+20;
        // No auto-aim — player controls angle manually
        if(gd.upward){
          // Anti-air: fire 8 bullets in exact cardinal+diagonal directions
          // Bypass fireBullet entirely to avoid spread/aimVY corruption
          for(let i=0;i<8;i++){
            const aaAngle=(i/8)*Math.PI*2;
            bullets.push({x:bx,y:by,vx:Math.cos(aaAngle)*gd.spd,vy:Math.sin(aaAngle)*gd.spd,
              isE:false,dmg:gd.dmg,life:Math.round(600/gd.spd),explosive:false,plasma:false,
              r:3,cannon:false,bone:false,web:false,pvpTeam:p.pvpTeam});
          }
        } else {
          for(let i=0;i<gd.pellets;i++){const b2=fireBullet(bx,by,p.dir,false,gd.dmg,gd.spd,gd.explosive||false,gd.spread,gd.plasma||false,gd.melee||false,p.pvpTeam);if(gd.arc&&b2)b2.mortar=true;if(gd.guided&&b2){b2.guided=true;b2.guideTick=0;b2.r=6;b2.life=300;b2.explosive=true;}}
        }
        if(gd.melee)p.swingTimer=gd.cd;
        g.cd=gd.cd;
        if(!cheats.hitman&&g.ammo!==Infinity){g.ammo--;if(g.ammo<=0){p.guns.splice(p.gunSlot,1);if(p.gunSlot>=p.guns.length)p.gunSlot=0;}}
      }
    }
    if(keys[p.keys.repair])tryRepair(p);
    if(p.webbed>0)p.webbed--;
    const wspd=p.webbed>0?1.0:2.6;
    if(keys[p.keys.l]){p.x-=wspd;p.dir=-1;}
    if(keys[p.keys.r]){p.x+=wspd;p.dir=1;}
    if(MAPS[currentMap]&&MAPS[currentMap].name==='ARCTIC'&&state==='playing'){p.x+=0.5;}// arctic wind
    const worldW=(state==='pvp')?PVP_WORLD_W:(MAPS[currentMap]&&MAPS[currentMap].scrollable?WORLD_W:BW);
    p.x=Math.max(p.w/2,Math.min(worldW-p.w/2,p.x));
    let onLadder=false;
    structs.forEach(s=>{if(s.dead||s.id!=='ladder')return;const sx=s.x-s.w/2,sy=s.y-s.h;if(p.x+p.w/2>sx-4&&p.x-p.w/2<sx+s.w+4&&p.y>sy&&p.y-p.h<sy+s.h){onLadder=true;}});
    if(onLadder){
      p.vy=0;
      // Find the ladder struct to get its top
      const _lad=structs.find(s=>!s.dead&&s.id==='ladder'&&p.x+p.w/2>s.x-s.w/2-4&&p.x-p.w/2<s.x+s.w/2+4);
      const _ladTop=_lad?(_lad.y-_lad.h):0;
      if(keys[p.keys.j]){
        if(p.y-p.h<=_ladTop+4){// at very top of ladder — launch off
          p.vy=-10;onLadder=false;
        } else {
          p.y-=1.5;// climb up
        }
      }
      if(p.keys.dn&&keys[p.keys.dn])p.y+=2;// climb down
      p.onGround=false;
    }else{p.vy+=.5;}
    p.y+=p.vy;p.onGround=false;
    structs.forEach(s=>{
      if(s.dead||s.isBomb||s.id==='ladder')return;const def=getDef(s);
      const sx=s.x-s.w/2,sy=s.y-s.h;const inX=p.x+p.w/2>sx+2&&p.x-p.w/2<sx+s.w-2;if(!inX)return;
      if(onLadder)return;// pass through ALL structs when on ladder (fixes ceiling clip)
      if(def.onTop||s.id==='stairway'){
        let surfY=sy;if(s.id==='stairway'){const steps=6,sw=s.w/steps,sh=s.h/steps,relX=Math.max(0,Math.min(s.w-1,p.x-sx)),step=Math.floor(relX/sw);surfY=sy+s.h-(step+1)*sh;}
        if(p.vy>=0&&p.y>=surfY&&p.y<=surfY+p.vy+4){p.y=surfY;p.vy=0;p.onGround=true;}
      }else if(def.blocksPlayer){
        if(p.y>sy+2&&p.y-p.h<sy+s.h-2&&!(p.vy>=0&&p.y<=sy+p.vy+6)){if(p.x<=s.x)p.x=sx-p.w/2-1;else p.x=sx+s.w+p.w/2+1;}
        if(p.vy>=0&&p.y>=sy&&p.y<=sy+p.vy+6){p.y=sy;p.vy=0;p.onGround=true;}
      }
    });
    if(p.y>=GY){p.y=GY;p.vy=0;p.onGround=true;}
    const jumpH=cheats.grasshopper?-15:-10;
    if(justP(p,'j')&&p.onGround&&!onLadder){p.vy=jumpH;p.onGround=false;}
    scraps=scraps.filter(s=>{if(Math.abs(s.x-p.x)<22&&Math.abs(s.y-p.y)<32){p.scrap++;return false;}return true;});
    wdrops=wdrops.filter(d=>{if(Math.abs(d.x-p.x)<24&&Math.abs(d.y-p.y)<30){const gd2=GUN_DEFS[d.gIdx],ex=p.guns.find(g=>g.defIdx===d.gIdx);if(ex)ex.ammo=Math.min((ex.ammo||0)+gd2.startAmmo,gd2.startAmmo*2);else p.guns.push({defIdx:d.gIdx,name:gd2.name,ammo:gd2.startAmmo,cd:0});return false;}return true;});
    airdrops=airdrops.filter(d=>{if(!d.landed)return true;if(Math.abs(d.x-p.x)<20&&Math.abs(d.y-p.y)<20){if(d.type==='medkit'){p.hp=Math.min(p.maxHp,p.hp+3);}else{const gd2=GUN_DEFS[d.gIdx],ex=p.guns.find(g=>g.defIdx===d.gIdx);if(ex)ex.ammo=Math.min((ex.ammo||0)+gd2.startAmmo,gd2.startAmmo*2);else p.guns.push({defIdx:d.gIdx,name:gd2.name,ammo:gd2.startAmmo,cd:0});}return false;}return true;});
  });
}
function updateEnemies(){
  // Purge dead enemies to keep array small
  if(enemies.length>60)enemies=enemies.filter(e=>!e.dead);
  if(buildPhase)return;
  const eWW=state==='pvp'?PVP_WORLD_W:(MAPS[currentMap]&&MAPS[currentMap].scrollable?WORLD_W:isBoss1v1?BW*2:BW);
  enemies.forEach(e=>{
    if(e.dead)return;const lp=players.filter(p=>!p.dead);
    if(e.type==='flyer'){
      const tg=lp.length>0?lp.reduce((b,p)=>Math.hypot(p.x-e.x,p.y-e.y)<Math.hypot(b.x-e.x,b.y-e.y)?p:b):null;
      const tx=tg?tg.x:post.x,ty=tg?(tg.y-tg.h):post.y-post.h/2;
      const dx=tx-e.x,dy=ty-e.y,dist=Math.max(1,Math.hypot(dx,dy));
      e.x+=dx/dist*e.speed;e.y+=dy/dist*e.speed*.6;
      e.x=Math.max(e.w/2,Math.min(eWW-e.w/2,e.x));e.y=Math.max(40,Math.min(GY-10,e.y));
      e.shootCD--;if(e.shootCD<=0&&tg){const d2=Math.hypot(tx-e.x,ty-e.y);if(d2<300){const vx2=(tx-e.x)/d2,vy2=(ty-e.y)/d2;bullets.push({x:e.x+vx2*12,y:e.y+vy2*12,vx:vx2*4,vy:vy2*4,isE:true,dmg:1,life:120,explosive:false,plasma:false,r:3,cannon:false});}e.shootCD=80+Math.random()*40;}
      players.forEach(p=>{if(p.dead||p.inv>0)return;if(Math.hypot(p.x-e.x,p.y-e.y)<22){p.hp--;p.inv=60;if(p.hp<=0&&!cheats.remedy312){p.dead=true;const sk2=getSkin(p);p.respawn=sk2&&sk2.id==='chara'?150:300;}}});
      if(!post.dead&&Math.hypot(post.x-e.x,post.y-e.y)<36){post.hp=Math.max(0,post.hp-.04);if(post.hp<=0)post.dead=true;}
      return;
    }
    if(e.type==='digger'){
      if(e.underground){const tx=lp.length>0?lp.reduce((b,p)=>Math.abs(p.x-e.x)<Math.abs(b.x-e.x)?p:b).x:post.x;e.x+=Math.sign(tx-e.x)*1.4;e.emergeTimer--;if(e.emergeTimer<=0){e.underground=false;e.y=GY;e.vy=-6;}return;}
      const ahead=e.x+e.dir*24,wall=structs.find(s=>!s.dead&&getDef(s).blocksEnemy&&Math.abs(s.x-ahead)<s.w/2+12&&Math.abs(s.y-GY)<s.h);
      if(wall&&!e.digging){e.digging=true;e.digTimer=60;}
      if(e.digging){e.digTimer--;if(e.digTimer<=0){e.digging=false;e.underground=true;e.emergeTimer=90+Math.floor(Math.abs(post.x-e.x)/60)*10;}return;}
      const tx2=lp.length>0?lp.reduce((b,p)=>Math.abs(p.x-e.x)<Math.abs(b.x-e.x)?p:b).x:post.x;e.x+=Math.sign(tx2-e.x)*e.speed;e.dir=Math.sign(tx2-e.x);e.vy=Math.max(-12,e.vy+.5);e.y+=e.vy;if(e.y>=GY){e.y=GY;e.vy=0;}e.x=Math.max(e.w/2,Math.min(eWW-e.w/2,e.x));
      players.forEach(p=>{if(p.dead||p.inv>0)return;if(Math.abs(p.x-e.x)<18&&Math.abs(p.y-e.y)<28){p.hp--;p.inv=60;if(p.hp<=0&&!cheats.remedy312){p.dead=true;{const _sk=getSkin(p);p.respawn=_sk&&_sk.id==='chara'?150:300;}}}});
      if(!post.dead&&Math.abs(e.x-post.x)<28&&Math.abs(e.y-post.y)<40){post.hp=Math.max(0,post.hp-.05);if(post.hp<=0)post.dead=true;}return;
    }
    if(e.type==='bomber'){
      const tg=lp.length>0?lp.reduce((b,p)=>Math.abs(p.x-e.x)<Math.abs(b.x-e.x)?p:b):null;const tx=tg?tg.x:post.x;const dx=tx-e.x;
      const inTrench=mapTrenches.length>0&&mapTrenches.some(t=>e.x>t.x&&e.x<t.x+t.w)&&!e.underground&&e.type!=='flyer'&&e.type!=='ghost'&&e.type!=='phantom';
      e.x+=Math.sign(dx)*(inTrench?e.speed*0.4:e.speed);e.dir=Math.sign(dx);e.vy+=.5;e.y+=e.vy;
      structs.forEach(s=>{if(s.dead||!getDef(s).blocksEnemy)return;const sx=s.x-s.w/2,sy=s.y-s.h;if(e.x+e.w/2>sx+2&&e.x-e.w/2<sx+s.w-2){if(e.y>sy+4&&e.y-e.h<sy+s.h-4){if(e.x<=s.x)e.x=sx-e.w/2-1;else e.x=sx+s.w+e.w/2+1;}if(e.vy>=0&&e.y>=sy&&e.y<=sy+e.vy+6){e.y=sy;e.vy=0;}}});
      if(e.y>=GY){e.y=GY;e.vy=0;}{const _eww=(MAPS[currentMap]&&MAPS[currentMap].scrollable)?WORLD_W:BW;e.x=Math.max(e.w/2,Math.min(eWW-e.w/2,e.x));}
      e.throwCD--;if(e.throwCD<=0){const tdx=(tg?tg.x:post.x)-e.x,dist=Math.max(1,Math.abs(tdx)),spd=Math.min(6,dist/28);bullets.push({x:e.x+e.dir*12,y:e.y-e.h+12,vx:(tdx/dist)*spd,vy:-5-Math.random()*2,isE:true,dmg:3,life:140,explosive:true,plasma:false,r:7,cannon:false});e.throwCD=130+Math.random()*60;}
      players.forEach(p=>{if(p.dead||p.inv>0)return;if(Math.abs(p.x-e.x)<18&&Math.abs(p.y-e.y)<28){p.hp--;p.inv=60;if(p.hp<=0&&!cheats.remedy312){p.dead=true;p.respawn=300;}}});return;
    }
    if(e.type==='builder'){
      const tx=post.x;const inTrB=mapTrenches.length>0&&mapTrenches.some(t=>e.x>t.x&&e.x<t.x+t.w);e.x+=Math.sign(tx-e.x)*(inTrB?e.speed*0.4:e.speed);e.dir=Math.sign(tx-e.x);e.vy+=.5;e.y+=e.vy;
      structs.forEach(s=>{if(s.dead||!getDef(s).blocksEnemy)return;const sx=s.x-s.w/2,sy=s.y-s.h;if(e.x+e.w/2>sx+2&&e.x-e.w/2<sx+s.w-2&&e.y>sy+4&&e.y-e.h<sy+s.h-4){if(e.x<=s.x)e.x=sx-e.w/2-1;else e.x=sx+s.w+e.w/2+1;}if(e.vy>=0&&e.y>=sy&&e.y<=sy+e.vy+6&&e.x+e.w/2>sx+2&&e.x-e.w/2<sx+s.w-2){e.y=sy;e.vy=0;}});
      if(e.y>=GY){e.y=GY;e.vy=0;}e.x=Math.max(e.w/2,Math.min(eWW-e.w/2,e.x));
      e.buildCD--;if(e.buildCD<=0&&e.builtCount<e.maxBuilds){const bx=snapX(e.x+e.dir*40);if(!structs.some(s=>!s.dead&&Math.abs(s.x-bx)<(s.w+GRID*2)/2-2)&&bx>40&&bx<BW-40){structs.push({id:'barricade',x:bx,y:GY,w:GRID*2,h:GRID/2+4,hp:10,maxHp:10,dead:false,shootCD:0,range:0,turretType:null,isBomb:false,mat:'wood',enemyBuilt:true});e.builtCount++;}e.buildCD=250+Math.random()*100;}
      players.forEach(p=>{if(p.dead||p.inv>0)return;if(Math.abs(p.x-e.x)<18&&Math.abs(p.y-e.y)<28){p.hp--;p.inv=60;if(p.hp<=0&&!cheats.remedy312){p.dead=true;p.respawn=300;}}});
      if(!post.dead&&Math.abs(e.x-post.x)<28&&Math.abs(e.y-post.y)<40){post.hp=Math.max(0,post.hp-.04);if(post.hp<=0)post.dead=true;}return;
    }
    if(e.type==='shield'){
      const tx=post.x;const dx=tx-e.x;const inTrS=mapTrenches.length>0&&mapTrenches.some(t=>e.x>t.x&&e.x<t.x+t.w);if(Math.abs(dx)>30)e.x+=Math.sign(dx)*(inTrS?e.speed*0.4:e.speed);e.dir=Math.sign(dx);e.vy+=.5;e.y+=e.vy;
      structs.forEach(s=>{if(s.dead||!getDef(s).blocksEnemy)return;const sx=s.x-s.w/2,sy=s.y-s.h;if(e.x+e.w/2>sx+2&&e.x-e.w/2<sx+s.w-2&&e.y>sy+4&&e.y-e.h<sy+s.h-4){if(e.x<=s.x)e.x=sx-e.w/2-1;else e.x=sx+s.w+e.w/2+1;s.hp-=.06;if(s.hp<=0)destroyStruct(s);}if(e.vy>=0&&e.y>=sy&&e.y<=sy+e.vy+6){e.y=sy;e.vy=0;}});
      if(e.y>=GY){e.y=GY;e.vy=0;}e.x=Math.max(e.w/2,Math.min(eWW-e.w/2,e.x));
      enemies.forEach(ally=>{if(ally===e||ally.dead)return;if(Math.hypot(ally.x-e.x,ally.y-e.y)<80)ally.shielded=true;});
      players.forEach(p=>{if(p.dead||p.inv>0)return;if(Math.abs(p.x-e.x)<20&&Math.abs(p.y-e.y)<32){p.hp--;p.inv=60;if(p.hp<=0&&!cheats.remedy312){p.dead=true;p.respawn=300;}}});
      if(!post.dead&&Math.abs(e.x-post.x)<28&&Math.abs(e.y-post.y)<42){post.hp=Math.max(0,post.hp-.06);if(post.hp<=0)post.dead=true;}return;
    }
    if(e.type==='boss'){
      const bv=e.bossVariant||'tank';
      const tg=lp.length>0?lp.reduce((b,p)=>Math.hypot(p.x-e.x,p.y-e.y)<Math.hypot(b.x-e.x,b.y-e.y)?p:b):null;
      const tx=tg?tg.x:post.x,ty=tg?tg.y-tg.h/2:post.y-post.h/2;
      e.phase=e.hp<e.maxHp*.5?1:0;
      if(bv==='tank'){
        // Tank boss — charges straight, smashes walls, triple burst in phase 2
        e.x+=Math.sign(tx-e.x)*e.speed*(e.phase===1?1.4:1);e.dir=Math.sign(tx-e.x);e.vy+=.5;e.y+=e.vy;
        structs.forEach(s=>{if(s.dead||!getDef(s).blocksEnemy)return;const sx=s.x-s.w/2,sy=s.y-s.h;if(e.x+e.w/2>sx+2&&e.x-e.w/2<sx+s.w-2){if(e.y>sy+4&&e.y-e.h<sy+s.h-4){s.hp-=.8;if(s.hp<=0)destroyStruct(s);if(e.x<=s.x)e.x=sx-e.w/2-1;else e.x=sx+s.w+e.w/2+1;}if(e.vy>=0&&e.y>=sy&&e.y<=sy+e.vy+6){e.y=sy;e.vy=0;}}});
        if(e.y>=GY){e.y=GY;e.vy=0;}e.x=Math.max(e.w/2,Math.min(eWW-e.w/2,e.x));
        e.shootCD--;if(e.shootCD<=0){const bursts=e.phase===1?3:1;for(let i=0;i<bursts;i++)setTimeout(()=>{if(!e.dead){bullets.push({x:e.x+e.dir*(e.w/2+22),y:e.y-e.h+22,vx:e.dir*5,vy:-.2,isE:true,dmg:2,life:130,explosive:false,plasma:false,r:4,cannon:false});}},i*100);if(e.phase===1){bullets.push({x:e.x+e.dir*22,y:e.y-e.h+22,vx:e.dir*4,vy:-6,isE:true,dmg:3,life:150,explosive:true,plasma:false,r:8,cannon:false});}e.shootCD=e.phase===1?40:60;}
      }else if(bv==='aerial'){
        // Aerial boss — flies, drops bombs, strafes in phase 2
        if(!e.bobOffset)e.bobOffset=0;e.bobOffset+=.03;
        const bob2=Math.sin(e.bobOffset)*16;const targetY=GY-85+bob2;
        e.x+=Math.sign(tx-e.x)*e.speed;e.y+=Math.sign(targetY-e.y)*.8;
        e.x=Math.max(e.w/2,Math.min(eWW-e.w/2,e.x));e.y=Math.max(100,Math.min(GY-50,e.y));e.dir=Math.sign(tx-e.x)||1;
        e.shootCD--;if(e.shootCD<=0){
          // Drop bombs + shoot downward
          bullets.push({x:e.x,y:e.y+e.h/2,vx:e.dir*(e.phase===1?.5:0),vy:3,isE:true,dmg:3,life:180,explosive:true,plasma:false,r:8,cannon:false});
          if(e.phase===1){for(let i=-1;i<=1;i++)bullets.push({x:e.x+i*20,y:e.y+e.h/2,vx:i*.5,vy:3.5,isE:true,dmg:2,life:160,explosive:false,plasma:false,r:3,cannon:false});}
          e.shootCD=e.phase===1?45:70;
        }
      }else if(bv==='sniper'){
        // Sniper boss — stays back, fires high-damage precise shots, phase 2 goes semi-visible
        if(Math.abs(tx-e.x)>180)e.x+=Math.sign(tx-e.x)*e.speed;else if(Math.abs(tx-e.x)<100)e.x-=Math.sign(tx-e.x)*e.speed*.5;
        e.dir=Math.sign(tx-e.x)||1;e.vy+=.5;e.y+=e.vy;
        structs.forEach(s=>{if(s.dead||!getDef(s).blocksEnemy)return;const sx=s.x-s.w/2,sy=s.y-s.h;if(e.x+e.w/2>sx+2&&e.x-e.w/2<sx+s.w-2&&e.y>sy+4&&e.y-e.h<sy+s.h-4){if(e.x<=s.x)e.x=sx-e.w/2-1;else e.x=sx+s.w+e.w/2+1;}if(e.vy>=0&&e.y>=sy&&e.y<=sy+e.vy+6){e.y=sy;e.vy=0;}});
        if(e.y>=GY){e.y=GY;e.vy=0;}e.x=Math.max(e.w/2,Math.min(eWW-e.w/2,e.x));
        e.shootCD--;if(e.shootCD<=0&&tg){
          // Precise shot — aim directly at player
          const dx2=tg.x-e.x,dy2=(tg.y-tg.h/2)-(e.y-e.h+14),dist2=Math.max(1,Math.hypot(dx2,dy2));
          bullets.push({x:e.x+e.dir*20,y:e.y-e.h+14,vx:(dx2/dist2)*11,vy:(dy2/dist2)*11,isE:true,dmg:e.phase===1?4:3,life:140,explosive:false,plasma:false,r:3,cannon:false});
          if(e.phase===1){// Burst of 3 in phase 2
            for(let i=1;i<=2;i++)setTimeout(()=>{if(!e.dead&&tg&&!tg.dead){const dx3=tg.x-e.x,dy3=(tg.y-tg.h/2)-(e.y-e.h+14),d3=Math.max(1,Math.hypot(dx3,dy3));bullets.push({x:e.x+e.dir*20,y:e.y-e.h+14,vx:(dx3/d3)*11,vy:(dy3/d3)*11,isE:true,dmg:3,life:140,explosive:false,plasma:false,r:3,cannon:false});}},i*180);}
          e.shootCD=e.phase===1?50:80;
        }
            }else if(bv==='vesper'){
        if(!e.vesInit){e.vesInit=true;e.vesAtkIdx=0;e.vesAtkCD=80;e.vesTick=0;}
        e.vesTick++;
        if(tg){const vdx2=tg.x-e.x;if(Math.abs(vdx2)>60)e.x+=Math.sign(vdx2)*e.speed*1.2;else e.x-=Math.sign(vdx2)*e.speed*.4;e.dir=Math.sign(vdx2)||1;}
        e.vy+=.5;e.y+=e.vy;if(e.y>=GY){e.y=GY;e.vy=0;}e.x=Math.max(30,Math.min(eWW-30,e.x));
        e.vesAtkCD--;const vesCD2=e.phase===1?45:70;
        if(e.vesAtkCD<=0&&tg){const vpat=e.vesAtkIdx%3;e.vesAtkIdx++;
          if(vpat===0){const vdx3=tg.x-e.x,vdy3=(tg.y-tg.h/2)-(e.y-e.h/2),vd3=Math.max(1,Math.hypot(vdx3,vdy3));for(let i=-3;i<=3;i++)bullets.push({x:e.x+e.dir*14,y:e.y-e.h*.5,vx:vdx3/vd3*(8+e.phase*2)+i*0.8,vy:vdy3/vd3*(8+e.phase*2),isE:true,dmg:1,life:100,explosive:false,plasma:false,r:4,cannon:false});
          }else if(vpat===1){e.vy=-10;e.x=Math.max(40,Math.min(eWW-40,tg.x+(Math.random()>.5?40:-40)));setTimeout(()=>{if(!e.dead&&tg&&!tg.dead){const dx4=tg.x-e.x,dy4=tg.y-e.y,d4=Math.max(1,Math.hypot(dx4,dy4));for(let i=-2;i<=2;i++)bullets.push({x:e.x,y:e.y-e.h*.5,vx:dx4/d4*(7+e.phase)+i*0.7,vy:dy4/d4*(7+e.phase),isE:true,dmg:1,life:90,explosive:false,plasma:false,r:4,cannon:false});}},400);
          }else{for(let i=0;i<12+e.phase*4;i++){const a=i*(Math.PI*2/(12+e.phase*4));bullets.push({x:e.x,y:e.y-e.h*.3,vx:Math.cos(a)*(4+e.phase),vy:Math.sin(a)*(4+e.phase),isE:true,dmg:1,life:120,explosive:false,plasma:false,r:5,cannon:false});}}
          e.vesAtkCD=vesCD2;
        }
      }
      players.forEach(p=>{if(p.dead||p.inv>0)return;if(Math.abs(p.x-e.x)<26&&Math.abs(p.y-e.y)<36){p.hp-=2;p.inv=80;if(p.hp<=0&&!cheats.remedy312){p.dead=true;p.respawn=300;}}});
      if(!post.dead&&Math.abs(e.x-post.x)<34&&Math.abs(e.y-post.y)<46){post.hp=Math.max(0,post.hp-.12);if(post.hp<=0)post.dead=true;}return;
    }
    if(e.type==='boss'&&e.bossVariant==='conductor'){
      // ── CONDUCTOR: 30-attack orchestral nightmare ─────────────────
      e.phase=e.hp<e.maxHp*.5?1:0;
      // Drift toward nearest player with sinusoidal weave
      const conTgt=lp.length>0?lp.reduce((a,b)=>Math.hypot(b.x-e.x,b.y-e.y)<Math.hypot(a.x-e.x,a.y-e.y)?b:a):null;
      const conTX=conTgt?conTgt.x+(Math.sin(Date.now()/1800)*120):BW/2;
      e.x+=Math.sign(conTX-e.x)*e.speed*.6;e.dir=Math.sign(conTX-e.x)||1;
      e.vy+=.3;e.y+=e.vy;if(e.y>=GY){e.y=GY;e.vy=0;}
      e.x=Math.max(60,Math.min(BW-60,e.x));
      // Beat metronome
      if(!e.beatTimer)e.beatTimer=0;
      e.beatTimer++;
      const beatInt=e.phase===1?55:80;
      const onBeat=e.beatTimer%beatInt===0;
      if(onBeat)e.beatTimer=0;
      // Attack pool — 30 distinct attacks cycling
      if(!e.atkPool)e.atkPool=['groundwave','noterain','spotlight','crossbeam','shockring','waltz_sweep','staccato_burst','crescendo','pizzicato','tremolo','fermata_hold','sforzando','coda_mines','leitmotif','arpeggio_spread','da_capo','interlude_shield','fortissimo','pianissimo','ritardando','accelerando','diminuendo','trill_spray','glissando','syncopation','rubato','mordent','portamento','cadenza','finale'];
      if(!e.atkIdx)e.atkIdx=0;
      if(!e.atkCD)e.atkCD=0;
      e.atkCD--;
      if(e.atkCD<=0){
        const atk=e.atkPool[e.atkIdx%e.atkPool.length];e.atkIdx++;
        const cd=e.phase===1?60:90;
        switch(atk){
          case'groundwave':// shockwave rolls along ground
            for(let d2=-1;d2<=1;d2+=2)for(let i=0;i<8;i++)setTimeout(()=>{if(!e.dead)bullets.push({x:e.x+d2*i*40,y:GY-4,vx:d2*3,vy:-1,isE:true,dmg:1,life:60,explosive:false,plasma:false,r:5,cannon:false,wave:true});},i*40);break;
          case'noterain':// musical notes rain from above 8 positions
            for(let i=0;i<8;i++)setTimeout(()=>{if(!e.dead)bullets.push({x:80+i*(BW-160)/7,y:10,vx:0,vy:4,isE:true,dmg:1,life:100,explosive:false,plasma:false,r:4,cannon:false});},i*150);break;
          case'spotlight':// vertical beam at random x, telegraphed
            for(let i=0;i<(e.phase===1?4:2);i++){const sx=120+Math.random()*(BW-240);setTimeout(()=>{if(!e.dead){for(let y=0;y<GY;y+=16)bullets.push({x:sx,y,vx:0,vy:0,isE:true,dmg:1,life:20,explosive:false,plasma:false,r:6,cannon:false});}},i*300+500);}break;
          case'crossbeam':// horizontal beam sweeping
            for(let y=40;y<GY;y+=40)setTimeout(()=>{if(!e.dead)for(let x=0;x<BW;x+=24)bullets.push({x,y,vx:0,vy:0,isE:true,dmg:1,life:18,explosive:false,plasma:false,r:5,cannon:false});},y/40*180);break;
          case'shockring':// expanding ring of bullets
            for(let i=0;i<16;i++){const a=i*(Math.PI/8);bullets.push({x:e.x,y:e.y-e.h/2,vx:Math.cos(a)*4,vy:Math.sin(a)*4,isE:true,dmg:1,life:90,explosive:false,plasma:false,r:4,cannon:false});}break;
          case'staccato_burst':// rapid short bursts at player
            for(let i=0;i<(e.phase===1?12:6);i++){const p2=lp[0];if(p2){const dx3=p2.x-e.x,dy3=p2.y-e.h/2-e.y,d3=Math.max(1,Math.hypot(dx3,dy3));setTimeout(()=>{if(!e.dead&&p2&&!p2.dead)bullets.push({x:e.x,y:e.y-e.h/2,vx:dx3/d3*6,vy:dy3/d3*6,isE:true,dmg:1,life:100,explosive:false,plasma:false,r:4,cannon:false});},i*60);}}break;
          case'crescendo':// escalating ring size
            for(let wave=0;wave<5;wave++)for(let i=0;i<8+wave*4;i++){const a=i*(Math.PI*2/(8+wave*4));setTimeout(()=>{if(!e.dead)bullets.push({x:e.x,y:e.y-e.h/2,vx:Math.cos(a)*(3+wave),vy:Math.sin(a)*(3+wave),isE:true,dmg:1,life:80,explosive:false,plasma:false,r:3,cannon:false});},wave*200);}break;
          case'waltz_sweep':// 3 sweeping arcs in waltz rhythm
            for(let beat=0;beat<3;beat++)for(let i=-3;i<=3;i++)setTimeout(()=>{if(!e.dead)bullets.push({x:e.x,y:e.y-e.h/2,vx:i*(e.phase===1?2:1.5)+e.dir,vy:-3+Math.abs(i)*.5,isE:true,dmg:1,life:90,explosive:false,plasma:false,r:4,cannon:false});},beat*300+i*30);break;
          case'pizzicato':// small fast plucks at random angles
            for(let i=0;i<20;i++){const a=Math.random()*Math.PI*2;setTimeout(()=>{if(!e.dead)bullets.push({x:e.x,y:e.y-e.h/2,vx:Math.cos(a)*7,vy:Math.sin(a)*7,isE:true,dmg:1,life:60,explosive:false,plasma:false,r:3,cannon:false});},i*50);}break;
          case'tremolo':// rapid alternating left/right
            for(let i=0;i<16;i++)setTimeout(()=>{if(!e.dead)bullets.push({x:e.x,y:e.y-e.h/2,vx:(i%2===0?1:-1)*5,vy:-2,isE:true,dmg:1,life:100,explosive:false,plasma:false,r:4,cannon:false});},i*80);break;
          case'fermata_hold':// pause then massive burst
            setTimeout(()=>{if(!e.dead){for(let i=0;i<24;i++){const a=i*(Math.PI/12);bullets.push({x:e.x,y:e.y-e.h/2,vx:Math.cos(a)*5,vy:Math.sin(a)*5,isE:true,dmg:1,life:100,explosive:false,plasma:false,r:5,cannon:false});}}},1200);break;
          case'sforzando':// sudden explosive note
            explode(e.x,e.y-e.h/2,2,80);break;
          case'coda_mines':// place stationary mines
            for(let i=0;i<5;i++)setTimeout(()=>{if(!e.dead){const mx=80+Math.random()*(BW-160);const mine={x:mx,y:GY-4,vx:0,vy:0,isE:true,dmg:2,life:300,explosive:false,plasma:false,r:6,cannon:false,mine:true};bullets.push(mine);}},i*200);break;
          case'leitmotif':// repeating melodic pattern aimed at players
            for(let rep=0;rep<(e.phase===1?3:2);rep++)for(let i=0;i<5;i++){const p3=lp[rep%lp.length]||lp[0];if(!p3)break;setTimeout(()=>{if(!e.dead&&p3&&!p3.dead){const dx4=p3.x-e.x,dy4=p3.y-e.h/2-e.y,d4=Math.max(1,Math.hypot(dx4,dy4));bullets.push({x:e.x,y:e.y-e.h/2,vx:dx4/d4*5,vy:dy4/d4*5,isE:true,dmg:1,life:110,explosive:false,plasma:false,r:4,cannon:false});}},rep*800+i*120);}break;
          case'arpeggio_spread':// notes in ascending then descending spread
            for(let i=0;i<12;i++){const ay=GY-20-i*20;setTimeout(()=>{if(!e.dead){for(let d3=-1;d3<=1;d3+=2)bullets.push({x:e.x,y:ay,vx:d3*4,vy:-1,isE:true,dmg:1,life:60,explosive:false,plasma:false,r:4,cannon:false});}},i*80);}break;
          // Remaining attacks are variations
          default:
            for(let i=0;i<12;i++){const a=i*(Math.PI/6)+Date.now()/1000;bullets.push({x:e.x,y:e.y-e.h/2,vx:Math.cos(a)*4,vy:Math.sin(a)*4,isE:true,dmg:1,life:90,explosive:false,plasma:false,r:4,cannon:false});}
        }
        e.atkCD=e.phase===1?55:85;
      }
      players.forEach(p=>{if(p.dead||p.inv>0)return;if(Math.abs(p.x-e.x)<20&&Math.abs(p.y-e.y)<30){p.hp--;p.inv=60;if(p.hp<=0&&!cheats.remedy312){p.dead=true;p.respawn=300;}}});
      if(!post.dead&&Math.abs(e.x-post.x)<30&&Math.abs(e.y-post.y)<44){post.hp=Math.max(0,post.hp-.05);if(post.hp<=0)post.dead=true;}return;
    }
    if(e.type==='boss'&&e.bossVariant==='vesper'){
      // ── VESPER: Skarrsinger-inspired acrobatic silk duelist ───────
      // Wall-jump, trailing silk, parry window, 30 cycling attacks
      e.phase=e.hp<e.maxHp*.5?1:0;
      if(!e.vAtkPool)e.vAtkPool=['dive_slash','silk_trap','dagger_fan','drill_charge','parry_bait','leap_bomb','echo_clone','riposte','shadow_step','silk_web','needle_rain','counter_slash','pirouette','death_spiral','lunge_cross','aerial_waltz','scatter_throw','silk_snare','blade_storm','mirror_burst','ceiling_dive','flicker_step','thread_net','evasive_arc','final_aria','phantom_slash','veil_strike','loop_dash','cutting_dance','vanishing_act'];
      if(!e.vAtkIdx)e.vAtkIdx=0;if(!e.vAtkCD)e.vAtkCD=0;
      e.vAtkCD--;
      // Track trail
      if(!e.vTrailX)e.vTrailX=Array(6).fill(e.x);if(!e.vTrailY)e.vTrailY=Array(6).fill(e.y);
      e.vTrailX.unshift(e.x);e.vTrailX.pop();e.vTrailY.unshift(e.y);e.vTrailY.pop();
      // Wall-jump logic — bounce between walls
      if(!e.vJumpCD)e.vJumpCD=0;e.vJumpCD--;
      if(e.vJumpCD<=0&&(e.x<100||e.x>BW-100)){e.vy=-(9+Math.random()*3);e.vx=(e.x<100?1:-1)*(3+Math.random()*2);e.vWallJumping=true;e.vJumpCD=80+Math.random()*40;}
      // Gravity and movement
      if(!e.vx)e.vx=e.dir*e.speed;
      e.vx*=.97;e.x+=e.vx+(e.dir*e.speed*.5);
      e.vy+=e.vWallJumping?.2:.4;e.y+=e.vy;
      if(e.y>=GY){e.y=GY;e.vy=0;e.vWallJumping=false;}
      e.x=Math.max(20,Math.min(BW-20,e.x));e.dir=Math.sign(lp.length>0?lp[0].x-e.x:1)||1;
      // Spinning attack
      if(!e.vSpinTimer)e.vSpinTimer=0;
      if(e.vSpinning){e.vSpinTimer--;if(e.vSpinTimer<=0){e.vSpinning=false;}}
      // Parry window decay
      if(!e.vParryWindow)e.vParryWindow=0;if(e.vParryWindow>0)e.vParryWindow--;
      // Execute attacks
      if(e.vAtkCD<=0){
        const vatk=e.vAtkPool[e.vAtkIdx%e.vAtkPool.length];e.vAtkIdx++;
        switch(vatk){
          case'dive_slash':// dive diagonally at player
            if(lp[0]){const p4=lp[0];e.vy=-(8+Math.random()*3);setTimeout(()=>{if(!e.dead){e.vy=10;e.vx=Math.sign(p4.x-e.x)*(6+Math.random()*3);for(let i=0;i<5;i++){}}},300);}break;
          case'dagger_fan':// 5-way dagger spread
            for(let i=-2;i<=2;i++){const a=(i*.25)+Math.atan2(lp[0]?lp[0].y-e.y:0,lp[0]?lp[0].x-e.x:e.dir);bullets.push({x:e.x,y:e.y-e.h/2,vx:Math.cos(a)*7,vy:Math.sin(a)*7,isE:true,dmg:1,life:80,explosive:false,plasma:false,r:3,cannon:false});}break;
          case'silk_trap':// place silk snare on ground
            for(let i=0;i<3;i++){const sx2=80+Math.random()*(BW-160);if(!e.vSilkTraps)e.vSilkTraps=[];e.vSilkTraps.push({x:sx2,y:GY-3,r:18,life:300});}break;
          case'drill_charge':// spinning charge across map
            e.vSpinning=true;e.vSpinTimer=60;e.vx=e.dir*12;e.vy=-3;break;
          case'parry_bait':// flash parry window — if shot during it, counter
            e.vParryWindow=40;break;
          case'leap_bomb':// aerial bounce with impacts
            e.vy=-(10+Math.random()*4);setTimeout(()=>{if(!e.dead){explode(e.x,e.y,2,60);}},600);break;
          case'echo_clone':// shadow mirror image appears
            if(!e.vClones)e.vClones=[];e.vClones.push({x:BW-e.x,y:e.y,life:180,dir:-e.dir});break;
          case'mirror_burst':// clones all fire
            (e.vClones||[]).forEach(cl=>{for(let i=0;i<8;i++){const a=i*(Math.PI/4);bullets.push({x:cl.x,y:cl.y-20,vx:Math.cos(a)*5,vy:Math.sin(a)*5,isE:true,dmg:1,life:70,explosive:false,plasma:false,r:3,cannon:false});}});break;
          case'blade_storm':// rapid circle slice
            for(let i=0;i<20;i++){const a=i*(Math.PI/10)+Date.now()/500;setTimeout(()=>{if(!e.dead)bullets.push({x:e.x+Math.cos(a)*20,y:e.y-e.h/2+Math.sin(a)*15,vx:Math.cos(a)*5,vy:Math.sin(a)*5,isE:true,dmg:1,life:60,explosive:false,plasma:false,r:4,cannon:false});},i*40);}break;
          case'needle_rain':// silk needles from above
            for(let i=0;i<10;i++)setTimeout(()=>{if(!e.dead){const nx=60+Math.random()*(BW-120);bullets.push({x:nx,y:0,vx:0,vy:5,isE:true,dmg:1,life:90,explosive:false,plasma:false,r:3,cannon:false});}},i*120);break;
          case'death_spiral':// outward then inward spiral
            for(let i=0;i<24;i++){const a=i*(Math.PI/12);const spd=2+i*.15;setTimeout(()=>{if(!e.dead)bullets.push({x:e.x,y:e.y-e.h/2,vx:Math.cos(a)*spd,vy:Math.sin(a)*spd,isE:true,dmg:1,life:120,explosive:false,plasma:false,r:3,cannon:false});},i*60);}break;
          case'thread_net':// silk net that damages on touch
            for(let xi=0;xi<5;xi++)for(let yi=0;yi<3;yi++){const nx=100+xi*140,ny=40+yi*90;bullets.push({x:nx,y:ny,vx:0,vy:0,isE:true,dmg:1,life:180,explosive:false,plasma:false,r:8,cannon:false,silk:true});}break;
          case'ceiling_dive':// drop from very top
            e.y=20;e.vy=10;e.vWallJumping=true;break;
          case'cutting_dance':// rapid repositioning while firing
            for(let i=0;i<8;i++)setTimeout(()=>{if(!e.dead){e.x=80+Math.random()*(BW-160);e.y=GY;for(let j=0;j<4;j++){const a2=j*(Math.PI/2);bullets.push({x:e.x,y:e.y-e.h/2,vx:Math.cos(a2)*5,vy:Math.sin(a2)*5,isE:true,dmg:1,life:70,explosive:false,plasma:false,r:3,cannon:false});}}},i*200);break;
          case'final_aria':// phase 2 only — screen-filling pattern
            if(e.phase===1){for(let i=0;i<36;i++){const a=i*(Math.PI/18);setTimeout(()=>{if(!e.dead)bullets.push({x:e.x,y:e.y-e.h/2,vx:Math.cos(a)*5,vy:Math.sin(a)*5,isE:true,dmg:1,life:100,explosive:false,plasma:false,r:4,cannon:false});},i*30);}}break;
          default:// riposte/counter attack
            if(lp[0]){const p5=lp[0];const dx5=p5.x-e.x,dy5=(p5.y-p5.h/2)-(e.y-e.h/2),d5=Math.max(1,Math.hypot(dx5,dy5));for(let i=0;i<4;i++)bullets.push({x:e.x,y:e.y-e.h/2,vx:dx5/d5*6+Math.cos(i*Math.PI/2)*.5,vy:dy5/d5*6+Math.sin(i*Math.PI/2)*.5,isE:true,dmg:1,life:90,explosive:false,plasma:false,r:3,cannon:false});}
        }
        e.vAtkCD=e.phase===1?45:70;
      }
      // Silk traps damage players
      (e.vSilkTraps||[]).forEach(st=>{st.life--;players.forEach(p=>{if(p.dead||p.inv>0)return;if(Math.hypot(p.x-st.x,p.y-st.y)<st.r){p.hp--;p.inv=90;}});});
      e.vSilkTraps=(e.vSilkTraps||[]).filter(st=>st.life>0);
      // Clones
      (e.vClones||[]).forEach(cl=>{cl.life--;players.forEach(p=>{if(p.dead||p.inv>0)return;if(Math.hypot(p.x-cl.x,p.y-cl.y)<16){p.hp--;p.inv=60;}});});
      e.vClones=(e.vClones||[]).filter(cl=>cl.life>0);
      // Parry counter — if player bullet hits during parry window
      bullets.filter(b=>!b.isE).forEach(b=>{if(e.vParryWindow>0&&Math.hypot(b.x-e.x,b.y-e.y)<30){e.vParryWindow=0;// counter
        for(let i=0;i<8;i++){const a=i*(Math.PI/4);bullets.push({x:e.x,y:e.y-e.h/2,vx:Math.cos(a)*8,vy:Math.sin(a)*8,isE:true,dmg:2,life:80,explosive:false,plasma:false,r:4,cannon:false});}b.life=0;}});
      players.forEach(p=>{if(p.dead||p.inv>0)return;if(Math.abs(p.x-e.x)<20&&Math.abs(p.y-e.y)<30){p.hp--;p.inv=60;if(p.hp<=0&&!cheats.remedy312){p.dead=true;p.respawn=300;}}});
      if(!post.dead&&Math.abs(e.x-post.x)<28&&Math.abs(e.y-post.y)<42){post.hp=Math.max(0,post.hp-.05);if(post.hp<=0)post.dead=true;}return;
    }
    // Standard enemies
    let tx=post.x;
    if(!e.targetPost&&lp.length>0){const t=lp.reduce((b,p)=>Math.abs(p.x-e.x)<Math.abs(b.x-e.x)?p:b);tx=t.x;}
    const blocker=structs.find(s=>{if(s.dead||!getDef(s).blocksEnemy)return false;return Math.abs(s.x-e.x)<s.w/2+e.w/2+8&&Math.abs((s.y-s.h/2)-(e.y-e.h/2))<(s.h+e.h)/2;});
    if(blocker)tx=blocker.x;
    const dx=tx-e.x;
    const inTrench2=mapTrenches.length>0&&mapTrenches.some(t=>e.x>t.x&&e.x<t.x+t.w)&&!e.underground&&e.type!=='flyer';
    const effSpeed=inTrench2?e.speed*0.4:e.speed;
    if(e.type==='shoot'){if(Math.abs(dx)>150)e.x+=Math.sign(dx)*effSpeed;e.dir=Math.sign(dx);}else{e.x+=Math.sign(dx)*effSpeed;e.dir=Math.sign(dx);}
    e.vy+=.5;e.y+=e.vy;
    structs.forEach(s=>{if(s.dead||!getDef(s).blocksEnemy)return;const sx=s.x-s.w/2,sy=s.y-s.h;if(e.x+e.w/2>sx+2&&e.x-e.w/2<sx+s.w-2){if(e.y>sy+4&&e.y-e.h<sy+s.h-4){if(e.x<=s.x)e.x=sx-e.w/2-1;else e.x=sx+s.w+e.w/2+1;s.hp-=.05;if(s.hp<=0)destroyStruct(s);}if(e.vy>=0&&e.y>=sy&&e.y<=sy+e.vy+6){e.y=sy;e.vy=0;}}});
    if(e.y>=GY){e.y=GY;e.vy=0;e.onGround=true;}e.x=Math.max(e.w/2,Math.min(eWW-e.w/2,e.x));
    if(e.type==='shoot'||e.type==='heavy'){e.shootCD--;if(e.shootCD<=0){bullets.push({x:e.x+e.dir*(e.w/2+12),y:e.y-e.h+13,vx:e.dir*(e.type==='heavy'?5:3.5),vy:0,isE:true,dmg:e.type==='heavy'?2:1,life:120,explosive:false,plasma:false,r:3,cannon:false});e.shootCD=e.type==='heavy'?100:70+Math.random()*40;}}
    // Healer heals nearby enemies
    if(e.type==='healer'&&Math.floor(GAME_T*1000/120)%4===0){enemies.forEach(al=>{if(al===e||al.dead||al.type==='boss')return;if(Math.hypot(al.x-e.x,al.y-e.y)<60&&al.hp<al.maxHp){al.hp=Math.min(al.maxHp,al.hp+.5);}});}
    // Berserker gets faster when hurt
    if(e.type==='berserker'&&e.hp<e.maxHp*.5)e.speed=3.5;
    // Tank walker shoots slower but harder
    if(e.type==='tank_walker'){e.shootCD--;if(e.shootCD<=0){const lp2=players.filter(p=>!p.dead);const tg=lp2.length>0?lp2.reduce((b,p)=>Math.hypot(p.x-e.x,p.y-e.y)<Math.hypot(b.x-e.x,b.y-e.y)?p:b):null;if(tg){const dx2=tg.x-e.x,dy2=tg.y-e.h/2-e.y,dist2=Math.max(1,Math.hypot(dx2,dy2));bullets.push({x:e.x+e.dir*18,y:e.y-e.h+16,vx:dx2/dist2*6,vy:dy2/dist2*6,isE:true,dmg:3,life:150,explosive:true,plasma:false,r:6,cannon:true});}e.shootCD=80;}}
    // Leaper jumps toward player
    if(e.type==='leaper'&&e.onGround&&Math.floor(Date.now()/800+e.x)%20===0){const lp2=players.filter(p=>!p.dead);if(lp2.length>0&&Math.abs(lp2[0].x-e.x)<200){e.vy=-8;}}
    // Special behaviors for new enemy types
    if(e.type==='healer'&&Math.floor(Date.now()/120+e.x)%4===0){enemies.forEach(al=>{if(al===e||al.dead||al.type==='boss')return;if(Math.hypot(al.x-e.x,al.y-e.y)<60&&al.hp<al.maxHp){al.hp=Math.min(al.maxHp,al.hp+.5);}});}
    if(e.type==='berserker'&&e.hp<e.maxHp*.5&&e.speed<3.0)e.speed=3.0;
    if(e.type==='leaper'&&e.onGround&&Math.floor(Date.now()/700+e.x*0.1)%10===0){const lp2=players.filter(p=>!p.dead);if(lp2.length>0&&Math.abs(lp2[0].x-e.x)<180){e.vy=-11;}}
    if(e.type==='suicide'){const lp2=players.filter(p=>!p.dead);if(lp2.length>0&&Math.hypot(lp2[0].x-e.x,lp2[0].y-e.y)<22){e.dead=true;explode(e.x,e.y,5,70);score+=5;}}
    if(e.type==='necro'){if(!e.reanimCD)e.reanimCD=0;e.reanimCD--;if(e.reanimCD<=0){const dead2=enemies.filter(d=>d.dead&&Math.hypot(d.x-e.x,d.y-e.y)<80&&d.type!=='boss').slice(0,1);dead2.forEach(d=>{d.dead=false;d.hp=Math.ceil(d.maxHp*.4);});e.reanimCD=180;}}
    if(e.type==='spider'){if(!e.webCD)e.webCD=0;e.webCD--;if(e.webCD<=0&&lp.length>0){const tgt2=lp[0];const dx2=tgt2.x-e.x,dy2=tgt2.y-e.y,dist2=Math.max(1,Math.hypot(dx2,dy2));bullets.push({x:e.x,y:e.y-e.h/2,vx:dx2/dist2*4,vy:dy2/dist2*4,isE:true,dmg:0,life:80,explosive:false,plasma:false,r:5,cannon:false,web:true});e.webCD=80;}}
    if(e.type==='tank_walker'){e.shootCD--;if(e.shootCD<=0){const lp2=players.filter(p=>!p.dead);const tg2=lp2.length>0?lp2.reduce((b,p)=>Math.hypot(p.x-e.x,p.y-e.y)<Math.hypot(b.x-e.x,b.y-e.y)?p:b):null;if(tg2){const dx2=tg2.x-e.x,dy2=tg2.y-tg2.h/2-e.y,dist2=Math.max(1,Math.hypot(dx2,dy2));bullets.push({x:e.x+e.dir*18,y:e.y-e.h+16,vx:dx2/dist2*6,vy:dy2/dist2*6,isE:true,dmg:3,life:150,explosive:true,plasma:false,r:6,cannon:true});}e.shootCD=90;}}
    players.forEach(p=>{if(p.dead||p.inv>0)return;if(Math.abs(p.x-e.x)<18&&Math.abs(p.y-e.y)<30){p.hp--;p.inv=60;if(p.hp<=0&&!cheats.remedy312){p.dead=true;p.respawn=300;}}});
    if(mapLake&&e.x>mapLake.x&&e.x<mapLake.x+mapLake.w&&e.y>GY-8&&e.type!=='flyer'&&e.type!=='ghost'&&e.type!=='phantom'){e.x-=Math.sign(e.x-post.x)*e.speed*2;}
    if(!post.dead&&Math.abs(e.x-post.x)<28&&Math.abs(e.y-post.y)<42){post.hp=Math.max(0,post.hp-.04);if(post.hp<=0)post.dead=true;}
  });
}
function updateNewBosses(){
  if(buildPhase)return;
  const lp=players.filter(p=>!p.dead);
  enemies.forEach(e=>{
    if(e.dead||e.type!=='boss')return;
    if(e.bossVariant==='conductor'){
      e.phase=e.hp<e.maxHp*.5?1:0;
      if(!e.conInit){e.conInit=true;e.conAtkIdx=0;e.conAtkCD=80;e.conTick=0;}
      e.conTick++;
      const lpc2=lp.length>0?lp.reduce((a,b)=>Math.hypot(b.x-e.x,b.y-e.y)<Math.hypot(a.x-e.x,a.y-e.y)?b:a):null;
      // Orbit around nearest player with weave
      const conTX2=lpc2?lpc2.x+Math.sin(e.conTick/60)*140:BW/2;
      e.x+=Math.sign(conTX2-e.x)*e.speed*.7;e.dir=Math.sign(conTX2-e.x)||1;
      e.vy+=.3;e.y+=e.vy;if(e.y>=GY){e.y=GY;e.vy=0;}
      e.x=Math.max(60,Math.min(BW-60,e.x));
      e.conAtkCD--;
      const conCD=e.phase===1?50:80;
      if(e.conAtkCD<=0&&lpc2){
        const cpat=e.conAtkIdx%3;e.conAtkIdx++;
        if(cpat===0){
          // NOTE RAIN — musical notes drop from above targeting player
          for(let i=-2;i<=2;i++)setTimeout(()=>{
            if(!e.dead)bullets.push({x:lpc2.x+(i*35),y:-10,vx:(i*0.4),vy:5+e.phase*2,isE:true,dmg:1,life:90,explosive:false,plasma:true,r:5,cannon:false});
          },i*80+160);
        } else if(cpat===1){
          // SPOTLIGHT BURST — ring of bullets outward
          const n=12+e.phase*6;
          for(let i=0;i<n;i++){const a=i*(Math.PI*2/n)+e.conTick*.05;
            bullets.push({x:e.x,y:e.y-e.h*.5,vx:Math.cos(a)*(5+e.phase*2),vy:Math.sin(a)*(5+e.phase*2),isE:true,dmg:1,life:100,explosive:false,plasma:true,r:5,cannon:false});}
        } else {
          // STACCATO — rapid aimed burst at player
          const dx=lpc2.x-e.x,dy=(lpc2.y-lpc2.h/2)-(e.y-e.h*.5),d=Math.max(1,Math.hypot(dx,dy));
          for(let i=0;i<5;i++)setTimeout(()=>{if(!e.dead&&lpc2&&!lpc2.dead)
            bullets.push({x:e.x+e.dir*14,y:e.y-e.h*.5,vx:dx/d*(7+e.phase*1.5),vy:dy/d*(7+e.phase*1.5),isE:true,dmg:1,life:110,explosive:false,plasma:true,r:4,cannon:false});
          },i*60);
        }
        e.conAtkCD=conCD;
      }
      lp.forEach(p=>{if(!p.inv&&Math.abs(p.x-e.x)<22&&Math.abs(p.y-e.y)<28){p.hp--;p.inv=50;}});
      hpBar(e.x-40,e.y-e.h-12,80,5,e.hp,e.maxHp,'#ffff00','#000000');
      
    }
    if(e.bossVariant==='colossus'){
      e.phase=e.hp<e.maxHp*.33?2:e.hp<e.maxHp*.66?1:0;
      e.vy+=.5;e.y+=e.vy;if(e.y>=GY){e.y=GY;e.vy=0;}
      const lpc=lp.length>0?lp.reduce((a,b)=>Math.hypot(b.x-e.x,b.y-e.y)<Math.hypot(a.x-e.x,a.y-e.y)?b:a):null;
      if(!e.colInit){e.colInit=true;e.colAtkIdx=0;e.colAtkCD=120;e.colTick=0;}
      e.colTick++;
      // Slow stomp toward target
      if(lpc){const cdx=lpc.x-e.x;if(Math.abs(cdx)>60)e.x+=Math.sign(cdx)*e.speed;e.dir=Math.sign(cdx)||1;}
      e.x=Math.max(e.w/2,Math.min(BW-e.w/2,e.x));
      // Stomp shockwave — groundslam every 120 ticks
      if(e.y>=GY&&e.colTick%120===0&&e.phase>=0){
        for(let si=0;si<14;si++){const sx=e.x+(si-7)*30;bullets.push({x:sx,y:GY-4,vx:(si-7)*1.2,vy:-3-e.phase*2,isE:true,dmg:1,life:50,explosive:false,plasma:false,r:6,cannon:false});}
        
      }
      e.colAtkCD--;
      if(e.colAtkCD<=0){
        const pat=e.colAtkIdx%3;e.colAtkIdx++;
        const sCD=e.phase===2?60:e.phase===1?90:130;
        if(pat===0){
          // BOULDER THROW — slow heavy balls arc toward player
          if(lpc){const dx=lpc.x-e.x,dy=lpc.y-e.y,d=Math.max(1,Math.hypot(dx,dy));
            for(let bi=0;bi<3;bi++)setTimeout(()=>{if(!e.dead&&lpc&&!lpc.dead)bullets.push({x:e.x,y:e.y-e.h*0.6,vx:dx/d*(5+bi)+( Math.random()-.5)*2,vy:dy/d*4-5,isE:true,dmg:2,life:140,explosive:true,plasma:false,r:10,cannon:true});},bi*200);}
        } else if(pat===1){
          // GROUND CRACK — line of explosions tracking across floor toward player
          if(lpc){const dir2=Math.sign(lpc.x-e.x)||1;
            for(let ci=0;ci<8;ci++)setTimeout(()=>{if(!e.dead)bullets.push({x:e.x+dir2*ci*50,y:GY-2,vx:0,vy:0,isE:true,dmg:2,life:4,explosive:true,plasma:false,r:14,cannon:true});},ci*80);}
        } else {
          // LEAP SLAM — colossus jumps toward player, massive impact
          if(lpc){e.vy=-14-e.phase*3;e.x=lpc.x+(Math.random()>.5?40:-40);
            setTimeout(()=>{if(!e.dead)for(let ri=0;ri<16;ri++){const a=ri*(Math.PI/8);bullets.push({x:e.x,y:GY,vx:Math.cos(a)*(5+e.phase*2),vy:Math.sin(a)*(5+e.phase*2)-3,isE:true,dmg:2,life:80,explosive:false,plasma:false,r:7,cannon:false});}},400);}
        }
        e.colAtkCD=sCD;
      }
      hpBar(e.x-40,e.y-e.h-12,80,5,e.hp,e.maxHp,'#ff8800','#000000');
      
    } if(e.bossVariant==='wraith'){
      e.phase=e.hp<e.maxHp*.33?2:e.hp<e.maxHp*.66?1:0;
      if(!e.wrInit){e.wrInit=true;e.wrAtkIdx=0;e.wrAtkCD=100;e.wrTick=0;e.wrPhase=0;}
      e.wrTick++;
      const lpw=lp.length>0?lp.reduce((a,b)=>Math.hypot(b.x-e.x,b.y-e.y)<Math.hypot(a.x-e.x,a.y-e.y)?b:a):null;
      // Ghost float — drift toward player ominously
      if(lpw){e.x+=(lpw.x-e.x)*0.012;e.y+=(lpw.y-e.h*1.5-e.y)*0.012;}
      e.y=Math.max(60,Math.min(GY-30,e.y));e.x=Math.max(50,Math.min(BW-50,e.x));
      e.dir=lpw&&lpw.x>e.x?1:-1;
      // Phase: partial invisibility
      const wrAlpha=e.phase===2?0.45:e.phase===1?0.65:0.85;
      e.wrAtkCD--;
      const wrCD=e.phase===2?35:e.phase===1?55:80;
      if(e.wrAtkCD<=0){
        const pat=e.wrAtkIdx%4;e.wrAtkIdx++;
        if(pat===0){
          // SOUL DRAIN — cone of purple projectiles aimed at player
          if(lpw){const dx=lpw.x-e.x,dy=lpw.y-e.y,d=Math.max(1,Math.hypot(dx,dy));
            for(let i=-3;i<=3;i++)bullets.push({x:e.x,y:e.y,vx:dx/d*(6+e.phase*2)+i*0.8,vy:dy/d*(6+e.phase*2),isE:true,dmg:1,life:110,explosive:false,plasma:true,r:5,cannon:false});}
        } else if(pat===1){
          // PHASE RUSH — teleport to player then explosion
          if(lpw){e.x=lpw.x+(Math.random()>.5?45:-45);e.y=lpw.y-10;
            for(let i=0;i<20;i++){const a=i*(Math.PI/10);bullets.push({x:e.x,y:e.y,vx:Math.cos(a)*(7+e.phase*2),vy:Math.sin(a)*(7+e.phase*2),isE:true,dmg:1,life:90,explosive:false,plasma:true,r:5,cannon:false});}}
        } else if(pat===2){
          // WAIL — expanding ring of slow-moving projectiles from wraith position
          const n=16+e.phase*8;
          for(let i=0;i<n;i++){const a=i*(Math.PI*2/n)+e.wrTick*.05;bullets.push({x:e.x,y:e.y,vx:Math.cos(a)*(3+e.phase),vy:Math.sin(a)*(3+e.phase),isE:true,dmg:1,life:140,explosive:false,plasma:true,r:6,cannon:false});}
        } else if(pat===3){
          // VOID TETHER — spectres toward each player
          lp.forEach(tp=>{
            const dx=tp.x-e.x,dy=tp.y-e.y,d=Math.max(1,Math.hypot(dx,dy));
            for(let i=0;i<5;i++)setTimeout(()=>{if(!e.dead&&!tp.dead){const jitter=(Math.random()-.5)*60;bullets.push({x:e.x,y:e.y,vx:(tp.x+jitter-e.x)/d*4,vy:(tp.y-e.y)/d*4,isE:true,dmg:1,life:160,explosive:false,plasma:true,r:5,cannon:false});}},i*120);
          });
        } else {
          // VOID ERUPTION — massive ring + phase rush combo
          for(let i=0;i<24;i++){const a=i*(Math.PI/12);bullets.push({x:e.x,y:e.y,vx:Math.cos(a)*(6+e.phase*2),vy:Math.sin(a)*(6+e.phase*2),isE:true,dmg:1,life:110,explosive:false,plasma:true,r:5,cannon:false});}
          lp.forEach(tp=>{if(!tp.dead){e.x=Math.max(80,Math.min(BW-80,tp.x+(Math.random()>.5?70:-70)));e.y=Math.max(80,tp.y-30);}});
        }
        e.wrAtkCD=wrCD;
      }
      // Contact damage
      lp.forEach(p=>{if(!p.inv&&Math.abs(p.x-e.x)<20&&Math.abs(p.y-e.y)<24){p.hp--;p.inv=60;}});
      ctx.save();ctx.globalAlpha=wrAlpha;
      hpBar(e.x-40,e.y-e.h-12,80,5,e.hp,e.maxHp,'#88aaff','#000000');
      
      ctx.restore();
    } if(e.bossVariant==='swarm_queen'){
      e.phase=e.hp<e.maxHp*.33?2:e.hp<e.maxHp*.66?1:0;
      if(!e.sqInit){e.sqInit=true;e.sqAtkIdx=0;e.sqAtkCD=90;e.sqTick=0;}
      e.sqTick++;
      const lpq=lp.length>0?lp.reduce((a,b)=>Math.hypot(b.x-e.x,b.y-e.y)<Math.hypot(a.x-e.x,a.y-e.y)?b:a):null;
      e.vy+=.4;e.y+=e.vy;if(e.y>=GY){e.y=GY;e.vy=0;}
      if(lpq){const sq2dx=lpq.x-e.x;if(Math.abs(sq2dx)>80)e.x+=Math.sign(sq2dx)*e.speed*0.7;e.dir=Math.sign(sq2dx)||1;}
      e.x=Math.max(e.w/2,Math.min(BW-e.w/2,e.x));
      // Passive swarm spawn
      if(e.sqTick%80===0&&enemies.filter(e2=>!e2.dead).length<25){
        const n=2+e.phase;
        for(let i=0;i<n;i++){enemies.push({x:e.x+(Math.random()-.5)*60,y:e.y-20,w:10,h:12,vy:-3,onGround:false,hp:3,maxHp:3,dir:lpq?Math.sign(lpq.x-e.x):1,type:'fast',speed:.8+e.phase*.2,shootCD:0,dead:false,targetPost:false,phase:0,_drop:false,shielded:false});}
      }
      e.sqAtkCD--;
      const sqCD=e.phase===2?50:e.phase===1?75:100;
      if(e.sqAtkCD<=0){
        const pat=e.sqAtkIdx%3;e.sqAtkIdx++;
        if(pat===0){
          // ACID SPIT — aimed burst of 9 projectiles at player
          if(lpq){const dx=lpq.x-e.x,dy=lpq.y-e.y,d=Math.max(1,Math.hypot(dx,dy));
            for(let i=-4;i<=4;i++)bullets.push({x:e.x,y:e.y-e.h*.4,vx:dx/d*(7+e.phase*1.5)+i*0.6,vy:dy/d*(7+e.phase*1.5),isE:true,dmg:1,life:110,explosive:false,plasma:true,r:5,cannon:false});}
        } else if(pat===1){
          // EGG BARRAGE — scattered arc of explosive eggs
          for(let i=0;i<6+e.phase*3;i++){const a=Math.PI*(.15+.7*i/(5+e.phase*3));bullets.push({x:e.x,y:e.y-e.h*.5,vx:(Math.random()-.5)*6+Math.cos(a)*3,vy:-8-Math.random()*4,isE:true,dmg:2,life:150,explosive:true,plasma:false,r:9,cannon:false});}
        } else {
          // SWARM SPIRAL — circular burst of tiny stingers
          const n=18+e.phase*10;
          for(let i=0;i<n;i++){const a=i*(Math.PI*2/n);bullets.push({x:e.x,y:e.y-e.h*.3,vx:Math.cos(a)*(5+e.phase*2),vy:Math.sin(a)*(5+e.phase*2),isE:true,dmg:1,life:100,explosive:false,plasma:false,r:4,cannon:false});}
        }
        e.sqAtkCD=sqCD;
      }
      // Contact
      lp.forEach(p=>{if(!p.inv&&Math.abs(p.x-e.x)<e.w*.6&&Math.abs(p.y-e.y)<e.h*.5){p.hp--;p.inv=60;}});
      hpBar(e.x-40,e.y-e.h-12,80,5,e.hp,e.maxHp,'#88ff44','#000000');
      
    }

    if(e.type==='boss'&&e.bossVariant==='radiance'){
      e.phase=e.hp<e.maxHp*.33?2:e.hp<e.maxHp*.66?1:0;
      if(!e.radInit){e.radInit=true;e.radAtkCD=30;e.radAtkIdx=0;e.radTick=0;e.radPos=0;e.radTeleCD=0;}
      // Teleport between two anchor positions every 4 seconds
      e.radTeleCD--;
      if(e.radTeleCD<=0){e.radPos=1-e.radPos;e.radTeleCD=240;
        e.x=e.radPos===0?BW*.25:BW*.75;e.y=GY-180;}
      e.radTick++;
      const alp=players.filter(p=>!p.dead);
      const rtg=alp.length>0?alp.reduce((a,b)=>Math.hypot(b.x-e.x,b.y-e.y)<Math.hypot(a.x-e.x,a.y-e.y)?b:a):null;
      // Orbit around target constantly
      const rorbit=140+e.phase*30;
      const ort=e.radTick*(0.03+e.phase*0.01);
      if(rtg){
        const tx=rtg.x+Math.cos(ort)*rorbit;
        const ty=Math.max(40,Math.min(GY-120,rtg.y-100+Math.sin(ort*2)*40));
        e.x+=(tx-e.x)*0.05;e.y+=(ty-e.y)*0.05;
      }
      e.x=Math.max(30,Math.min(BW-30,e.x));
      // Light aura damage
      if(e.radTick%60===0&&e.phase>=1){
        alp.forEach(p=>{if(!p.inv&&Math.hypot(p.x-e.x,p.y-e.y)<70){p.hp-=1;p.inv=30;}});
      }
      e.radAtkCD--;
      const rCD=e.phase===2?12:e.phase===1?18:30;
      if(e.radAtkCD<=0){
        e.radAtkCD=rCD;
        const rpat=e.radAtkIdx%9;e.radAtkIdx++;
        if(rpat===0){
          // RADIANT ORB RING — fast expanding
          const n=3+e.phase;
          for(let i=0;i<n;i++){const a=i*(Math.PI*2/n)+(e.radTick*.05);
            bullets.push({x:e.x,y:e.y,vx:Math.cos(a)*(1.7+e.phase*.67),vy:Math.sin(a)*(1.7+e.phase*.67),isE:true,dmg:1,life:280,explosive:false,plasma:true,r:5,cannon:false,radOrb:true});}
        } else if(rpat===1){
          // PILLARS OF LIGHT — 5 aimed pillars at player
          const numP=1+Math.floor(e.phase*.5+.5);
          for(let i=0;i<numP;i++){
            const tx3=rtg?rtg.x+(i-Math.floor(numP/2))*35:50+Math.random()*(BW-100);
            
            setTimeout(()=>{if(e.dead)return;
              for(let j=0;j<6;j++)bullets.push({x:tx3+(Math.random()-0.5)*10,y:-20,vx:(Math.random()-.5)*1,vy:3+e.phase,isE:true,dmg:1,life:200,explosive:false,plasma:true,r:5,cannon:false,radOrb:true});
            },250+i*80);
          }
        } else if(rpat===2){
          // SWORD RAIN — 24 swords across screen
          for(let i=0;i<6;i++)setTimeout(()=>{
            if(e.dead)return;
            const sx2=15+Math.random()*(BW-30);
            bullets.push({x:sx2,y:-10,vx:(Math.random()-.5)*2,vy:2.3+e.phase*.67,isE:true,dmg:1,life:280,explosive:false,plasma:false,r:4,cannon:false,radSword:true});
          },i*60);
        } else if(rpat===3){
          // ROTATING BEAMS — 4 beams spinning fast
          for(let bi2=0;bi2<4;bi2++){
            const ba=e.radTick*.08+bi2*(Math.PI/2);
            for(let bi3=0;bi3<3;bi3++)setTimeout(()=>{
              if(e.dead)return;
              const a2=ba+bi3*.15;
              bullets.push({x:e.x,y:e.y,vx:Math.cos(a2)*(2.3+e.phase*.67),vy:Math.sin(a2)*(2.3+e.phase*.67),isE:true,dmg:1,life:90,explosive:false,plasma:true,r:4,cannon:false,radOrb:true});
            },bi3*25);
          }
        } else if(rpat===4){
          // SCATTER AIMED — 9-wide spread at player
          if(rtg){
            const dx6=rtg.x-e.x,dy6=rtg.y-e.y,d6=Math.max(1,Math.hypot(dx6,dy6));
            for(let si3=-2;si3<=2;si3++)bullets.push({x:e.x,y:e.y,vx:dx6/d6*(6+e.phase*2)+si3*0.7,vy:dy6/d6*(6+e.phase*2),isE:true,dmg:1,life:110,explosive:false,plasma:true,r:4,cannon:false,radOrb:true});
          }
        } else if(rpat===5){
          // FLOOR TILES — all floor dangerous
          for(let i=0;i<6;i++){
            const gx3=20+i*(BW-40)/6;
            setTimeout(()=>{if(!e.dead)bullets.push({x:gx3,y:GY-6,vx:0,vy:0,isE:true,dmg:1,life:90,explosive:false,plasma:false,r:10,cannon:false,radOrb:true,groundTile:true});},i*40);
          }
        } else if(rpat===6){
          // CONVERGING RING — around player, shrink inward
          if(rtg){
            for(let ri2=0;ri2<10;ri2++){
              const a3=ri2*(Math.PI/10);const dist3=130+e.phase*20;
              bullets.push({x:rtg.x+Math.cos(a3)*dist3,y:rtg.y+Math.sin(a3)*dist3,vx:-Math.cos(a3)*(6+e.phase*2),vy:-Math.sin(a3)*(6+e.phase*2),isE:true,dmg:1,life:55,explosive:false,plasma:true,r:5,cannon:false,radOrb:true});
            }
          }
        } else if(rpat===7){
          // TRIPLE SPIRAL — 3 interleaved spirals
          for(let sp=0;sp<3;sp++){
            for(let si4=0;si4<8;si4++)setTimeout(()=>{
              if(e.dead)return;
              const a4=si4*(Math.PI/8)+sp*(Math.PI*2/3)+e.radTick*.06;
              bullets.push({x:e.x,y:e.y,vx:Math.cos(a4)*(1.7+e.phase*.67),vy:Math.sin(a4)*(1.7+e.phase*.67),isE:true,dmg:1,life:110,explosive:false,plasma:true,r:4,cannon:false,radOrb:true});
            },si4*30+sp*10);
          }
        } else {
          // BLINDING FLASH — full screen brief + aimed
          
          alp.forEach(tp=>{
            const dx7=tp.x-e.x,dy7=tp.y-e.y,d7=Math.max(1,Math.hypot(dx7,dy7));
            for(let i=0;i<20;i++){const a5=Math.atan2(dy7,dx7)+(i-10)*0.12;
              bullets.push({x:e.x,y:e.y,vx:Math.cos(a5)*(2.67+e.phase*.67),vy:Math.sin(a5)*(2.67+e.phase*.67),isE:true,dmg:2,life:80,explosive:false,plasma:true,r:5,cannon:false,radOrb:true});}
          });
        }
      }
      // Contact
      alp.forEach(p=>{if(p.inv>0)return;if(Math.abs(p.x-e.x)<28&&Math.abs(p.y-e.y)<36){p.hp-=2;p.inv=80;}});
      return;
    }

    if(e.type==='boss'&&e.bossVariant==='sans'){
      e.phase=e.hp<=1?3:e.hp<e.maxHp*.3?2:e.hp<e.maxHp*.65?1:0;
      if(!e.sansInit){
        e.sansInit=true;e.sansAtkCD=40;e.sansAtkIdx=0;e.sansTick=0;e.sansKarma=0;
        e.sansInvincible=true;// invincible for first 3 minutes (10800 frames)
        e.sansMsg="* so. you're finally here.";e.sansMsgTimer=180;
      }
      e.sansTick++;
      // During invincible phase: dodge bullets by teleporting away from them
      // After 3 minutes (10800 frames at 60fps), sans becomes truly dangerous
      if(e.sansInvincible&&e.sansTick>=10800){
        e.sansInvincible=false;
        e.sansMsg='* but nobody came.';e.sansMsgTimer=200;
        e.speed=3.5;// massively faster movement
        e.sansAtkCD=5;// attack every ~5 frames
      }
      if(!e.sansRestTimer)e.sansRestTimer=0;if(!e.sansResting)e.sansResting=false;
      if(!e.sansInvincible&&e.sansTick%280===0&&!e.sansResting){e.sansResting=true;e.sansRestTimer=100;e.sansMsg='* ...';e.sansMsgTimer=100;}
      const lps=players.filter(p=>!p.dead);
      const stg=lps.length>0?lps.reduce((a,b)=>Math.hypot(b.x-e.x,b.y-e.y)<Math.hypot(a.x-e.x,a.y-e.y)?b:a):null;
      if(e.sansResting){e.sansRestTimer--;if(e.sansRestTimer<=0){e.sansResting=false;}else{
        e.x+=(BW/2-e.x)*0.03;e.vy+=0.5;e.y+=e.vy;if(e.y>=GY){e.y=GY;e.vy=0;}
        if(e.sansMsgTimer>0){e.sansMsgTimer--;const ma2=Math.min(1,e.sansMsgTimer/20);ctx.save();ctx.globalAlpha=ma2;ctx.restore();}
        hpBar(e.x-30,e.y-e.h-12,60,5,e.hp,e.maxHp,'#4444ff','#000000');
        if(e.sansInvincible){const secsLeft=Math.ceil(Math.max(0,10800-e.sansTick)/60);}
        return;}}
      // BULLET SENSING DODGE
      // Nightmare: teleport every 3 ticks (truly invincible chaos mode)
      // Normal: react to incoming bullets only (fair but impossible to hit)
      if(e.sansInvincible){
        e.hp=e.maxHp;// fully unkillable during invincible phase
        if(!e.sansDodgeTick)e.sansDodgeTick=0;
        e.sansDodgeTick++;
        const isNightmare=boss1v1Nightmare;// nightmare flag, not HP phase
        if(isNightmare){
          // Nightmare: constant teleportation every 3 ticks
          if(e.sansDodgeTick%3===0){
            let bX=e.x,bY=e.y,bD=-1;
            for(let _si=0;_si<30;_si++){
              const cx=80+Math.random()*(BW-160),cy=GY-20-Math.random()*160;
              const mD=bullets.reduce((mn,sb)=>sb.isE||sb.guided?mn:Math.min(mn,Math.hypot(sb.x-cx,(sb.y-(sb.r||3))-cy)),9999);
              if(mD>bD){bD=mD;bX=cx;bY=cy;}
            }
            e.x=bX;e.y=bY;
            if(e.sansDodgeTick%9===0){}
          }
        } else {
          // Normal: only dodge when a bullet is actually approaching
          const nearBullet=bullets.find(b=>!b.isE&&!b.guided&&Math.hypot(b.x-e.x,(b.y-e.h/2)-e.y)<120);
          if(nearBullet){
            let bX=e.x,bY=e.y,bD=-1;
            for(let _si=0;_si<20;_si++){
              const cx=60+Math.random()*(BW-120),cy=GY-20-Math.random()*150;
              const mD=bullets.reduce((mn,sb)=>sb.isE||sb.guided?mn:Math.min(mn,Math.hypot(sb.x-cx,(sb.y-(sb.r||3))-cy)),9999);
              if(mD>bD){bD=mD;bX=cx;bY=cy;}
            }
            e.x=bX;e.y=bY;
            
          }
        }
      }
      // Post-reveal (after 3 min): 70% dodge rate, slower attacks
      if(!e.sansInvincible){
        const anyD2=bullets.some(b=>!b.isE&&!b.guided&&Math.hypot(b.x-e.x,(b.y-e.h/2)-e.y)<80);
        if(anyD2&&Math.random()<0.70){
          let bX2=e.x,bY2=e.y,bD2=-1;
          for(let _si=0;_si<12;_si++){
            const cx=50+Math.random()*(BW-100),cy=GY-30-Math.random()*140;
            const mD=bullets.reduce((mn,sb)=>{
              if(sb.isE||sb.guided)return mn;
              return Math.min(mn,Math.hypot(sb.x-cx,(sb.y-(sb.r||3))-cy));
            },9999);
            if(mD>bD2){bD2=mD;bX2=cx;bY2=cy;}
          }
          e.x=bX2;e.y=bY2;
          
        }
      }
      // Movement — lazy teleport style
      if(!e.archonMoveCD)e.archonMoveCD=0;e.archonMoveCD--;
      if(e.archonMoveCD<=0){
        e.archonTX=stg?stg.x+(Math.random()-.5)*120:BW/2;
        e.archonTY=stg?Math.max(GY-120,stg.y-80):GY-80;
        e.archonMoveCD=e.sansInvincible?(e.phase>=2?40:e.phase===1?60:80):(e.phase>=2?8:e.phase===1?14:20);
      }
      // Movement speed: erratic when revealed, moderate during warmup
      const sansLerp=e.sansInvincible?0.12:0.22;
      e.x+=(e.archonTX-e.x)*sansLerp;e.y+=(e.archonTY-e.y)*(sansLerp*0.85);
      e.x=Math.max(20,Math.min(BW-20,e.x));e.y=Math.max(40,Math.min(GY,e.y));
      e.dir=stg&&stg.x>e.x?1:-1;
      // Karma tick
      e.sansKarma=Math.min(9,e.sansKarma+(e.phase+1)*0.008);
      if(e.sansTick%45===0&&e.sansKarma>0){
        lps.forEach(p=>{if(!p.inv){p.hp=Math.max(0,p.hp-Math.ceil(e.sansKarma/3));p.inv=20;}});
      }
      if(e.sansMsgTimer>0)e.sansMsgTimer--;
      e.sansAtkCD--;
      // Speed scales with phase dramatically
      const sCD=e.phase===3?14:e.phase===2?22:e.phase===1?32:45;
      if(e.sansAtkCD<=0){
        e.sansAtkCD=sCD;
        const atk=e.sansAtkIdx%10;e.sansAtkIdx++;
        if(atk===0){
          // BONE WALL — 3 rows rapid fire, gaps align to punish standing still
          const gapPos=stg?Math.floor((stg.x/(BW/10))):Math.floor(Math.random()*8);
          for(let row=0;row<4;row++)setTimeout(()=>{
            if(e.dead)return;
            const gap=(gapPos+row)%10;const gap2=(gapPos+2+row)%10;
            for(let xi=0;xi<10;xi++){
              if(xi===gap||xi===gap2)continue;
              bullets.push({x:xi*(BW/10)+BW/20,y:-8,vx:(Math.random()-.5)*0.5,vy:4+e.phase*1.5,isE:true,dmg:1,life:100,explosive:false,plasma:false,r:8,cannon:false,bone:true});
            }
          },row*80);
          e.sansMsg='* determined, huh.';e.sansMsgTimer=90;
        } else if(atk===1){
          // GASTER BLASTERS — fire 3 aimed beams simultaneously
          lps.forEach(tp=>{
            for(let b2=-1;b2<=1;b2++){
              const bx3=tp.x+b2*20;
              
              setTimeout(()=>{
                if(e.dead||tp.dead)return;
                for(let j=0;j<8;j++)bullets.push({x:bx3+(Math.random()-0.5)*6,y:-20,vx:(Math.random()-.5)*1.5,vy:9+e.phase*2,isE:true,dmg:2,life:60,explosive:false,plasma:true,r:5,cannon:false});
              },300);
            }
          });
          e.sansMsg='* heh heh heh.';e.sansMsgTimer=80;
        } else if(atk===2){
          // BONE SPIRAL — ring of bones expanding from sans position
          const n=12+e.phase*6;
          for(let i=0;i<n;i++){
            const a=i*(Math.PI*2/n)+(e.sansTick*0.1);
            bullets.push({x:e.x,y:e.y,vx:Math.cos(a)*(4+e.phase),vy:Math.sin(a)*(4+e.phase),isE:true,dmg:1,life:110,explosive:false,plasma:false,r:5,cannon:false,bone:true});
          }
        } else if(atk===3){
          // BLUE BONES — stationary, hurt moving players
          if(stg){
            for(let xi=0;xi<14;xi++){
              const bx4=xi*(BW/14)+BW/28;
              if(Math.abs(bx4-stg.x)>30)
                bullets.push({x:bx4,y:GY-8,vx:0,vy:0,isE:true,dmg:1,life:90,explosive:false,plasma:false,r:7,cannon:false,bone:true,blueBone:true});
            }
          }
          e.sansMsg="* don't move.";e.sansMsgTimer=90;
        } else if(atk===4){
          // ORANGE RUSH — sweeping walls force movement
          for(let t=0;t<10;t++)setTimeout(()=>{
            if(e.dead)return;
            const y4=GY-30-Math.random()*(GY-80);
            bullets.push({x:-10,y:y4,vx:8+e.phase*2,vy:0,isE:true,dmg:1,life:70,explosive:false,plasma:false,r:7,cannon:false,orangeBone:true});
            bullets.push({x:BW+10,y:y4+40,vx:-(8+e.phase*2),vy:0,isE:true,dmg:1,life:70,explosive:false,plasma:false,r:7,cannon:false,orangeBone:true});
          },t*80);
          e.sansMsg='* keep moving.';e.sansMsgTimer=90;
        } else if(atk===5){
          // AIMED BURST — 5-shot aimed directly at each player
          lps.forEach(tp=>{
            const dx5=tp.x-e.x,dy5=tp.y-e.y,d5=Math.max(1,Math.hypot(dx5,dy5));
            for(let i5=0;i5<7;i5++)setTimeout(()=>{
              if(!e.dead&&!tp.dead)bullets.push({x:e.x,y:e.y,vx:dx5/d5*(7+e.phase*1.5),vy:dy5/d5*(7+e.phase*1.5),isE:true,dmg:1,life:110,explosive:false,plasma:false,r:4,cannon:false,bone:true});
            },i5*35);
          });
        } else if(atk===6){
          // CROSS SWEEP — 4 walls from sides
          for(let d2=0;d2<4;d2++){const a=d2*Math.PI/2;
            for(let t=0;t<10;t++)setTimeout(()=>{
              if(!e.dead)bullets.push({x:e.x+Math.cos(a)*t*28,y:e.y+Math.sin(a)*t*28,vx:Math.cos(a)*(3+e.phase),vy:Math.sin(a)*(3+e.phase),isE:true,dmg:1,life:90,explosive:false,plasma:false,r:6,cannon:false,bone:true});
            },t*30);}
        } else if(atk===7){
          // KARMA EXPLOSION — scales with accumulated karma
          for(let i=0;i<Math.round(e.sansKarma)*4;i++){
            const a=i*(Math.PI*2/(Math.round(e.sansKarma)*4));
            bullets.push({x:e.x,y:e.y,vx:Math.cos(a)*6,vy:Math.sin(a)*6,isE:true,dmg:1,life:100,explosive:false,plasma:true,r:5,cannon:false});
          }
          e.sansMsg="* that's called karma.";e.sansMsgTimer=80;
        } else if(atk===8){
          // TELEPORT AMBUSH — appear next to player, close range explosion
          if(stg){
            e.x=stg.x+(Math.random()>.5?30:-30);e.y=stg.y-10;
            
            for(let i=0;i<24;i++){const a=i*(Math.PI/12);bullets.push({x:e.x,y:e.y,vx:Math.cos(a)*8,vy:Math.sin(a)*8,isE:true,dmg:2,life:70,explosive:false,plasma:true,r:5,cannon:false});}
            e.sansMsg="* and that's my cue.";e.sansMsgTimer=80;
          }
        } else {
          // FAINT CHECK — at <25% HP drop to 1, keep going
          if(!e.sansFainted&&e.hp<e.maxHp*.25){
            e.sansFainted=true;e.hp=1;e.sansKarma=8;
            e.sansMsg='* but it refused.';e.sansMsgTimer=240;
            
          }
          // Full hell barrage — phase 2/3
          const n2=24+e.phase*12;
          for(let i=0;i<n2;i++){const a=i*(Math.PI*2/n2)+e.sansTick*0.05;
            bullets.push({x:e.x,y:e.y,vx:Math.cos(a)*(5+e.phase*2),vy:Math.sin(a)*(5+e.phase*2),isE:true,dmg:2,life:120,explosive:false,plasma:e.phase>=2,r:4,cannon:false,bone:!e.phase>=2});}
        }
      }
      // Contact
      lps.forEach(p=>{if(p.inv>0)return;if(Math.abs(p.x-e.x)<22&&Math.abs(p.y-e.y)<28){p.hp-=1;p.inv=40;}});
      if(e.sansMsgTimer>0){const ma=Math.min(1,e.sansMsgTimer/30);ctx.save();ctx.globalAlpha=ma;ctx.restore();}
      return;
    }
if(e.type==='boss'&&e.bossVariant==='archon'){
      e.phase=e.hp<e.maxHp*.33?2:e.hp<e.maxHp*.66?1:0;
      if(!e.archonInit){e.archonInit=true;structs.forEach(s=>{if(!s.dead&&s.turretType){s.dead=true;}});}
      if(!e.archonTX){e.archonTX=BW/2;e.archonTY=GY-160;e.archonMoveCD=0;}
      e.archonMoveCD--;
      if(e.archonMoveCD<=0){e.archonTX=80+Math.random()*(BW-160);e.archonTY=GY-200+Math.random()*140;// fly lower
        e.archonMoveCD=e.phase===2?40:e.phase===1?60:90;}
      e.x+=(e.archonTX-e.x)*0.12;e.y+=(e.archonTY-e.y)*0.12;e.dir=e.archonTX>e.x?1:-1;
      if(!e.atkCD)e.atkCD=0;e.atkCD--;if(!e.atkTimer)e.atkTimer=0;e.atkTimer++;
      const aInt=e.phase===2?25:e.phase===1?35:50;const alp=lp;
      if(e.atkCD<=0){
        const ap=Math.floor(e.atkTimer/60)%8;
        if(ap===0){for(let at=0;at<8;at++)setTimeout(()=>{if(e.dead)return;const ag=Math.floor(Math.random()*7);for(let axi=0;axi<10;axi++){if(axi===ag||axi===ag+1)continue;bullets.push({x:axi*(BW/10)+BW/20,y:-10,vx:0,vy:3.5+e.phase*0.8,isE:true,dmg:1,life:170,explosive:false,plasma:false,r:8,cannon:false,bone:true});}},at*200);e.atkCD=e.phase===2?120:160;}
        else if(ap===1){alp.forEach((atg,ati)=>setTimeout(()=>{if(e.dead)return;setTimeout(()=>{if(!e.dead&&!atg.dead)for(let abi=0;abi<6;abi++)bullets.push({x:atg.x+(abi-3)*6,y:-20,vx:0,vy:8,isE:true,dmg:2,life:80,explosive:false,plasma:true,r:5,cannon:false});},600);},ati*300));e.atkCD=e.phase===2?100:140;}
        else if(ap===2){for(let ari=0;ari<16;ari++){const aa=ari*(Math.PI*2/16);bullets.push({x:e.x,y:e.y,vx:Math.cos(aa)*5,vy:Math.sin(aa)*5,isE:true,dmg:1,life:100,explosive:false,plasma:false,r:4,cannon:false});}e.atkCD=aInt;}
        else if(ap===3){for(let ato=0;ato<12;ato++)setTimeout(()=>{if(e.dead)return;const agy=Math.floor(Math.random()*5);for(let ayi=0;ayi<8;ayi++){if(ayi===agy||ayi===agy+1)continue;bullets.push({x:ato*(BW/12),y:ayi*(GY/8),vx:3+e.phase,vy:0,isE:true,dmg:1,life:100,explosive:false,plasma:false,r:6,cannon:false,bone:true});}},ato*150);e.atkCD=e.phase===2?140:180;}
        else if(ap===4){for(let aw=0;aw<3;aw++)setTimeout(()=>{if(e.dead)return;for(let ari2=0;ari2<12;ari2++){const ab=ari2*(Math.PI*2/12)+aw*0.5;bullets.push({x:e.x,y:e.y,vx:Math.cos(ab)*4,vy:Math.sin(ab)*4,isE:true,dmg:1,life:120,explosive:false,plasma:false,r:4,cannon:false});}},aw*120);e.atkCD=aInt*2;}
        else if(ap===5){alp.forEach(atg2=>{const adx=atg2.x-e.x,ady=atg2.y-e.y,add=Math.max(1,Math.hypot(adx,ady));for(let ai2=0;ai2<5;ai2++)setTimeout(()=>{if(!e.dead&&!atg2.dead)bullets.push({x:e.x,y:e.y,vx:adx/add*7,vy:ady/add*7,isE:true,dmg:1,life:120,explosive:false,plasma:false,r:4,cannon:false});},ai2*80);});e.atkCD=aInt;}
        else if(ap===6){for(let adr=0;adr<4;adr++){const ac=adr*Math.PI/2;for(let atw=0;atw<8;atw++)setTimeout(()=>{if(!e.dead)bullets.push({x:e.x+Math.cos(ac)*atw*30,y:e.y+Math.sin(ac)*atw*30,vx:Math.cos(ac)*3,vy:Math.sin(ac)*3,isE:true,dmg:1,life:100,explosive:false,plasma:false,r:5,cannon:false});},atw*60);}e.atkCD=aInt*3;}
        else{if(e.phase>0)setTimeout(()=>{if(!e.dead&&alp.length>0){const atg3=alp[0];e.x=atg3.x+20;e.y=atg3.y-20;for(let ai3=0;ai3<24;ai3++){const ad2=ai3*(Math.PI/12);bullets.push({x:e.x,y:e.y,vx:Math.cos(ad2)*6,vy:Math.sin(ad2)*6,isE:true,dmg:2,life:80,explosive:false,plasma:true,r:5,cannon:false});}}},300);e.atkCD=aInt*4;}
      }
      if(!e.destroyCD)e.destroyCD=0;e.destroyCD--;
      if(e.destroyCD<=0){structs.forEach(s=>{if(!s.dead&&s.turretType&&!s.mapFeature){s.dead=true;}});e.destroyCD=180;}
      players.forEach(p=>{if(p.dead||p.inv>0)return;if(Math.abs(p.x-e.x)<24&&Math.abs(p.y-e.y)<32){p.hp-=2;p.inv=80;if(p.hp<=0&&!cheats.remedy312){p.dead=true;p.respawn=300;}}});
      if(!post.dead&&Math.abs(e.x-post.x)<32){post.hp=Math.max(0,post.hp-.08);if(post.hp<=0)post.dead=true;}
    }

    if(e.bossVariant==='midas'){
      e.phase=e.hp<e.maxHp*.5?1:0;
      if(!e.miInit){e.miInit=true;e.miAtkIdx=0;e.miAtkCD=90;e.miTick=0;}
      e.miTick++;
      const lpm=lp.length>0?lp.reduce((a,b)=>Math.hypot(b.x-e.x,b.y-e.y)<Math.hypot(a.x-e.x,a.y-e.y)?b:a):null;
      if(lpm){const mdx=lpm.x-e.x;if(Math.abs(mdx)>40)e.x+=Math.sign(mdx)*e.speed;e.dir=Math.sign(mdx)||1;}
      e.vy+=.5;e.y+=e.vy;if(e.y>=GY){e.y=GY;e.vy=0;}e.x=Math.max(40,Math.min(BW-40,e.x));
      e.miAtkCD--;
      if(e.miAtkCD<=0&&lpm){const mp=e.miAtkIdx%3;e.miAtkIdx++;
        if(mp===0){for(let i=-3;i<=3;i++)bullets.push({x:lpm.x+i*30,y:-10,vx:i*.5,vy:4+e.phase,isE:true,dmg:2,life:100,explosive:false,plasma:false,r:6,cannon:false});}
        else if(mp===1){const dx=lpm.x-e.x,dy=(lpm.y-lpm.h/2)-(e.y-e.h*.5),d=Math.max(1,Math.hypot(dx,dy));
          for(let i=-2;i<=2;i++)bullets.push({x:e.x,y:e.y-e.h*.5,vx:dx/d*(8+e.phase*2)+i,vy:dy/d*(8+e.phase*2),isE:true,dmg:2,life:110,explosive:false,plasma:true,r:5,cannon:false});}
        else{e.vy=-12;e.x=Math.max(50,Math.min(BW-50,lpm.x+(Math.random()>.5?40:-40)));
          setTimeout(()=>{if(!e.dead)for(let i=0;i<12;i++){const a=i*Math.PI/6;bullets.push({x:e.x,y:GY,vx:Math.cos(a)*(6+e.phase*2),vy:Math.sin(a)*(6+e.phase*2)-2,isE:true,dmg:2,life:80,explosive:true,plasma:false,r:8,cannon:false});}},400);}
        e.miAtkCD=e.phase===1?55:90;}
      lp.forEach(p=>{if(!p.inv&&Math.abs(p.x-e.x)<e.w*.7&&Math.abs(p.y-e.y)<e.h*.6){p.hp--;p.inv=50;}});
    }
    if(e.bossVariant==='archie'){
      e.phase=e.hp<e.maxHp*.5?1:0;
      if(!e.arInit){e.arInit=true;e.arAtkIdx=0;e.arAtkCD=80;e.arTick=0;}
      e.arTick++;
      const lpa=lp.length>0?lp.reduce((a,b)=>Math.hypot(b.x-e.x,b.y-e.y)<Math.hypot(a.x-e.x,a.y-e.y)?b:a):null;
      if(lpa){e.x+=Math.sign(lpa.x-e.x)*e.speed*(1+e.phase*.3);e.dir=Math.sign(lpa.x-e.x)||1;}
      e.vy+=.5;e.y+=e.vy;if(e.y>=GY){e.y=GY;e.vy=0;}e.x=Math.max(30,Math.min(BW-30,e.x));
      if(e.arTick%70===0&&e.y>=GY)e.vy=-10;
      e.arAtkCD--;
      if(e.arAtkCD<=0&&lpa){const ap=e.arAtkIdx%3;e.arAtkIdx++;
        if(ap===0){const n=16+e.phase*8;for(let i=0;i<n;i++){const a=i*(Math.PI*2/n)+e.arTick*.1;bullets.push({x:e.x,y:e.y-e.h*.4,vx:Math.cos(a)*(5+e.phase*1.5),vy:Math.sin(a)*(5+e.phase*1.5),isE:true,dmg:1,life:100,explosive:false,plasma:false,r:4,cannon:false});}}
        else if(ap===1){for(let i=0;i<4+e.phase*2;i++)setTimeout(()=>{if(!e.dead&&lpa&&!lpa.dead)bullets.push({x:lpa.x+(Math.random()-.5)*80,y:-5,vx:(Math.random()-.5)*2,vy:5+Math.random()*3,isE:true,dmg:2,life:90,explosive:true,plasma:false,r:8,cannon:false});},i*120);}
        else{const dx2=lpa.x-e.x,dy2=(lpa.y-lpa.h/2)-(e.y-e.h*.5),d2=Math.max(1,Math.hypot(dx2,dy2));
          for(let i=0;i<3;i++)setTimeout(()=>{if(!e.dead&&lpa&&!lpa.dead)bullets.push({x:e.x,y:e.y-e.h*.4,vx:dx2/d2*10,vy:dy2/d2*10,isE:true,dmg:1,life:80,explosive:false,plasma:false,r:4,cannon:false});},i*80);}
        e.arAtkCD=e.phase===1?45:75;}
      lp.forEach(p=>{if(!p.inv&&Math.abs(p.x-e.x)<e.w*.7&&Math.abs(p.y-e.y)<e.h*.6){p.hp--;p.inv=50;}});
    }
    if(e.bossVariant==='flynn'){
      e.phase=e.hp<e.maxHp*.5?1:0;
      if(!e.flInit){e.flInit=true;e.flAtkIdx=0;e.flAtkCD=70;e.flTick=0;}
      e.flTick++;
      const lpf=lp.length>0?lp.reduce((a,b)=>Math.hypot(b.x-e.x,b.y-e.y)<Math.hypot(a.x-e.x,a.y-e.y)?b:a):null;
      if(lpf){e.x+=(lpf.x-e.x)*0.04+Math.sin(e.flTick/30)*2;e.y+=(Math.max(50,lpf.y-120)-e.y)*0.04;e.dir=lpf.x>e.x?1:-1;}
      e.y=Math.max(40,Math.min(GY-50,e.y));e.x=Math.max(30,Math.min(BW-30,e.x));
      e.flAtkCD--;
      if(e.flAtkCD<=0&&lpf){const fp=e.flAtkIdx%3;e.flAtkIdx++;
        if(fp===0){const sweepY=lpf.y-lpf.h/2;for(let i=0;i<6;i++)setTimeout(()=>{if(!e.dead)bullets.push({x:e.dir===1?-10:BW+10,y:sweepY+(Math.random()-.5)*20,vx:e.dir*(12+e.phase*3),vy:(Math.random()-.5),isE:true,dmg:1,life:60,explosive:false,plasma:true,r:4,cannon:false});},i*50);}
        else if(fp===1){e.vy=8;setTimeout(()=>{if(!e.dead){e.vy=-12;for(let i=0;i<12;i++){const a=i*(Math.PI/6);bullets.push({x:e.x,y:e.y,vx:Math.cos(a)*(7+e.phase*2),vy:Math.sin(a)*(7+e.phase*2),isE:true,dmg:1,life:90,explosive:true,plasma:false,r:7,cannon:false});}}},500);}
        else{const dx3=lpf.x-e.x,dy3=lpf.y-e.y,d3=Math.max(1,Math.hypot(dx3,dy3));for(let i=0;i<8+e.phase*4;i++)setTimeout(()=>{if(!e.dead&&lpf&&!lpf.dead)bullets.push({x:e.x+(Math.random()-.5)*20,y:e.y,vx:dx3/d3*(7+Math.random()*3),vy:dy3/d3*(7+Math.random()*3),isE:true,dmg:1,life:100,explosive:true,plasma:false,r:6,cannon:false});},i*60);}
        e.flAtkCD=e.phase===1?40:70;}
      lp.forEach(p=>{if(!p.inv&&Math.abs(p.x-e.x)<30&&Math.abs(p.y-e.y)<30){p.hp--;p.inv=50;}});
    }
    if(e.bossVariant==='caine'){
      e.phase=e.hp<e.maxHp*.33?2:e.hp<e.maxHp*.66?1:0;
      if(!e.caInit){e.caInit=true;e.caAtkIdx=0;e.caAtkCD=60;e.caTick=0;}
      e.caTick++;
      const lpc=lp.length>0?lp.reduce((a,b)=>Math.hypot(b.x-e.x,b.y-e.y)<Math.hypot(a.x-e.x,a.y-e.y)?b:a):null;
      if(e.caTick%150===0&&lpc){e.x=Math.max(50,Math.min(BW-50,lpc.x+(Math.random()>.5?80:-80)));e.y=GY;}
      if(lpc){const cdx=lpc.x-e.x;if(Math.abs(cdx)>60)e.x+=Math.sign(cdx)*e.speed*(1+e.phase*.4);e.dir=Math.sign(cdx)||1;}
      e.vy+=.5;e.y+=e.vy;if(e.y>=GY){e.y=GY;e.vy=0;}e.x=Math.max(40,Math.min(BW-40,e.x));
      e.caAtkCD--;
      if(e.caAtkCD<=0&&lpc){const cp=e.caAtkIdx%4;e.caAtkIdx++;
        if(cp===0){const n2=20+e.phase*8;for(let i=0;i<n2;i++){const a=i*(Math.PI*2/n2);bullets.push({x:e.x,y:e.y-e.h*.4,vx:Math.cos(a)*(6+e.phase*2),vy:Math.sin(a)*(6+e.phase*2),isE:true,dmg:1,life:110,explosive:false,plasma:true,r:5,cannon:false});}}
        else if(cp===1){for(let i=0;i<6+e.phase*2;i++)bullets.push({x:lpc.x+(i-3)*25,y:-5,vx:(Math.random()-.5)*2,vy:6+Math.random()*3,isE:true,dmg:2,life:80,explosive:false,plasma:false,r:5,cannon:false});}
        else if(cp===2){const dx4=lpc.x-e.x,dy4=(lpc.y-lpc.h/2)-(e.y-e.h*.5),d4=Math.max(1,Math.hypot(dx4,dy4));
          
          setTimeout(()=>{if(!e.dead&&lpc&&!lpc.dead)for(let i=-2;i<=2;i++)bullets.push({x:e.x,y:e.y-e.h*.5,vx:dx4/d4*(9+e.phase*2)+i*.8,vy:dy4/d4*(9+e.phase*2),isE:true,dmg:2,life:110,explosive:false,plasma:true,r:5,cannon:false});},300);}
        else{const cy2=lpc.y-lpc.h/2;for(let i=0;i<15;i++)setTimeout(()=>{if(!e.dead)bullets.push({x:e.dir===1?-10:BW+10,y:cy2+(Math.random()-.5)*40,vx:e.dir*(10+e.phase*3),vy:(Math.random()-.5)*2,isE:true,dmg:1,life:70,explosive:false,plasma:true,r:5,cannon:false});},i*30);}
        e.caAtkCD=e.phase===2?35:e.phase===1?50:70;}
      lp.forEach(p=>{if(!p.inv&&Math.abs(p.x-e.x)<e.w*.7&&Math.abs(p.y-e.y)<e.h*.6){p.hp--;p.inv=50;}});
    }
  });
}
function updateBullets(){
  if(buildPhase){bullets=[];return;}
  if(bullets.length>300)bullets=bullets.slice(bullets.length-300);// prevent blowup
  bullets=bullets.filter(b=>{
    b.x+=b.vx;b.y+=b.vy;if(b.explosive&&!b.guided)b.vy+=.22;b.life--;
    // Guided missile homing — angle-based rotation steering
    if(b.guided&&!b.isE){
      b.guideTick=(b.guideTick||0)+1;
      // Find nearest enemy
      const _tgtE=enemies.reduce((best,e)=>{
        if(e.dead||e.underground)return best;
        return(!best||d<best.d)?{e,d}:best;
      },null);
      if(_tgtE){
        const _spd=Math.hypot(b.vx,b.vy)||4;
        const _curAng=Math.atan2(b.vy,b.vx);
        const _desAng=Math.atan2((_tgtE.e.y-_tgtE.e.h/2)-b.y,_tgtE.e.x-b.x);
        let _dAng=_desAng-_curAng;
        while(_dAng>Math.PI)_dAng-=Math.PI*2;
        while(_dAng<-Math.PI)_dAng+=Math.PI*2;
        // Strong turn rate from frame 1 — 0.12 ramps to 0.22 rad/frame
        const _maxTurn=Math.min(0.22,0.12+b.guideTick*0.004);
        const _clampedTurn=Math.max(-_maxTurn,Math.min(_maxTurn,_dAng));
        b.vx=Math.cos(_curAng+_clampedTurn)*_spd;
        b.vy=Math.sin(_curAng+_clampedTurn)*_spd;
      }
      // Smoke trail every 2 frames
      if(b.guideTick%2===0){}
    }
    const bMaxX=state==='pvp'?PVP_WORLD_W+20:(MAPS[currentMap]&&MAPS[currentMap].scrollable?WORLD_W+20:BW+20);
    if(b.bone&&b.y>GY+5&&b.vy>0){if(b.explosive)explode(b.x,b.y,b.dmg,48,b.isE);return false;}// bone hits ground
    if(b.x<-20||b.x>bMaxX||b.y>GY+30||b.life<=0){if(b.explosive)explode(b.x,b.y,b.dmg,b.cannon?96:b.mortar?36:64,b.isE);return false;}
    if(b.plasma){let hit=false;
      if(b.isE){// enemy plasma — check player hits
        for(const p of players){if(p.dead||(p.inv>0&&!cheats.remedy312))continue;
          if(Math.abs(p.x-b.x)<14&&Math.abs(p.y-p.h/2-b.y)<20){
            if(!cheats.remedy312){p.hp-=b.dmg;p.inv=60;if(p.hp<=0){p.dead=true;p.respawn=300;}}
            plasmaHit(b.x,b.y);hit=true;break;
          }
        }
        if(!hit&&!post.dead&&Math.abs(post.x-b.x)<26&&Math.abs(post.y-post.h/2-b.y)<30){post.hp=Math.max(0,post.hp-b.dmg);if(post.hp<=0)post.dead=true;plasmaHit(b.x,b.y);hit=true;}
      } else {// player plasma — check enemy hits
        enemies.forEach(e=>{if(e.dead||e.underground||hit)return;
          if(Math.abs(e.x-b.x)<e.w/2+4&&Math.abs(e.y-e.h/2-b.y)<e.h/2+4){
            if(e.shielded){e.shieldHp-=3;if(e.shieldHp<=0)e.shielded=false;}
            else{e.hp-=b.dmg;if(e.hp<=0)killEnemy(e);}
            plasmaHit(b.x,b.y);hit=true;
          }
        });
      }
      return !hit;}
    if(b.isE){
      for(const p of players){if(p.dead||(p.inv>0&&!cheats.remedy312))continue;if(Math.abs(p.x-b.x)<14&&Math.abs(p.y-p.h/2-b.y)<20){if(b.web){p.webbed=120;return false;}if(!cheats.remedy312){p.hp-=b.dmg;p.inv=60;if(p.hp<=0){p.dead=true;p.respawn=300;}}return false;}}
      if(!post.dead&&Math.abs(post.x-b.x)<26&&Math.abs(post.y-post.h/2-b.y)<30){post.hp=Math.max(0,post.hp-b.dmg);if(post.hp<=0)post.dead=true;return false;}
      for(const s of structs){if(s.dead||s.isBomb)continue;if(b.x>=s.x-s.w/2&&b.x<=s.x+s.w/2&&b.y>=s.y-s.h&&b.y<=s.y){s.hp-=b.dmg;if(s.hp<=0)destroyStruct(s);return false;}}
    }else{
      for(const e of enemies){if(e.dead||e.underground)continue;if(b.isE&&e.type==='boss')continue;if(b.guided&&e.bossVariant==='sans')continue;// boss projectiles don't harm bosses
if(Math.abs(e.x-b.x)<e.w/2+3&&Math.abs(e.y-e.h/2-b.y)<e.h/2+3){if(b.explosive){explode(b.x,b.y,b.dmg,b.cannon?96:64,b.isE);return false;}if(e.shielded){e.shieldHp-=b.dmg;if(e.shieldHp<=0)e.shielded=false;return false;}const resist=RESIST_MAP[e.type];const rdmg=(resist&&b.src&&resist.includes(b.src))?b.dmg*0.5:b.dmg;e.hp-=rdmg;if(rdmg<b.dmg){}else if(e.hp<=0)killEnemy(e);return false;}}
    }
    return true;
  });
}
function updateStructSpecials(){
  if(buildPhase)return;
  structs.forEach(s=>{
    if(s.dead)return;
    if(s.isShieldGen){if(!s.shieldPulse)s.shieldPulse=0;s.shieldPulse++;players.forEach(p=>{if(!p.dead&&Math.hypot(p.x-s.x,p.y-s.y)<s.shieldRadius){p.shielded=true;p.shieldTimer=20;}});}
    if(s.isAmmoDepot){if(!s.reloadCD)s.reloadCD=0;s.reloadCD--;if(s.reloadCD<=0){players.forEach(p=>{if(!p.dead&&Math.abs(p.x-s.x)<60){const g=p.guns[p.gunSlot];const gd=GUN_DEFS[g.defIdx];if(g.ammo!==Infinity&&g.ammo<gd.startAmmo){g.ammo=Math.min(g.ammo+1,gd.startAmmo);}}});s.reloadCD=90;}}
    if(s.isFortress){if(!s.turretL)s.turretL={shootCD:0,side:-1};if(!s.turretR)s.turretR={shootCD:0,side:1};[s.turretL,s.turretR].forEach(t=>{if(t.shootCD>0){t.shootCD--;return;}const tx2=s.x+(t.side*(s.w/2-20));const ty2=s.y-s.h+8;const te=enemies.find(e=>!e.dead&&!e.underground&&Math.hypot(e.x-tx2,(e.y-e.h/2)-ty2)<380&&!(TURRET_IMMUNE[e.type]&&TURRET_IMMUNE[e.type].length>0));if(!te)return;const dx2=te.x-tx2,dy2=(te.y-te.h/2)-ty2,dist2=Math.max(1,Math.hypot(dx2,dy2));bullets.push({x:tx2+dx2/dist2*14,y:ty2+dy2/dist2*14,vx:dx2/dist2*8,vy:dy2/dist2*8,isE:false,dmg:3,life:140,explosive:false,plasma:false,r:4,cannon:false});t.shootCD=35;});}
  });
  players.forEach(p=>{if(p.shieldTimer>0){p.shieldTimer--;if(p.shieldTimer<=0)p.shielded=false;}});
}
function updateBombs(){
  structs.forEach(s=>{
    if(s.dead)return;
    if(s.isBomb){const trig=enemies.find(e=>!e.dead&&!e.underground&&Math.abs(e.x-s.x)<20&&Math.abs(e.y-s.y)<20);if(trig){s.dead=true;explode(s.x,s.y-s.h/2,12,120);}return;}
    // Trap logic
    if(s.isTrap&&!s.trapCD){s.trapCD=0;}
    if(s.isTrap){
      if(s.trapCD>0){s.trapCD--;return;}
      const trig=enemies.find(e=>!e.dead&&!e.underground&&Math.abs(e.x-s.x)<s.w/2+8&&Math.abs(e.y-s.y)<16);
      if(trig){
        if(s.trapType==='spike'){trig.hp-=3;s.trapCD=30;}
        else if(s.trapType==='freeze'){trig.speed=(trig.speed||1)*.3;trig.frozenTimer=90;s.trapCD=60;}
        else if(s.trapType==='fire'){explode(s.x,s.y-4,3,40);s.trapCD=80;}
      }
    }
    // Spiked wall damages enemies on contact
    if(s.spiked){
      enemies.forEach(e=>{if(e.dead)return;if(Math.abs(e.x-s.x)<s.w/2+2&&e.y-e.h<s.y&&e.y>s.y-s.h){e.hp-=.05;if(e.hp<=0)killEnemy(e);}});
    }
  });
  // Thaw frozen enemies
  enemies.forEach(e=>{if(e.frozenTimer>0){e.frozenTimer--;if(e.frozenTimer<=0)e.speed=({fast:2.2,heavy:.8,digger:1.3,bomber:1.0,builder:.9,shield:.9,flyer:1.5}[e.type]||1.4);}});
}
function updateTurrets(){
  if(buildPhase)return;
  structs.forEach(s=>{
    if(!s.turretType||s.dead)return;if(s.shootCD>0){s.shootCD--;return;}
    let te=null;
    if(state==='pvp'){const myTeam2=s.pvpTeam;te=players.find(p=>!p.dead&&p.pvpTeam!==myTeam2&&Math.hypot(p.x-s.x,(p.y-p.h/2)-(s.y-s.h/2))<(s.range||260));
    }else{te=enemies.find(e=>!e.dead&&!e.underground&&Math.hypot(e.x-s.x,(e.y-e.h/2)-(s.y-s.h/2))<s.range);}
    if(!te)return;const tedx=te.x-s.x,tedy=(te.y-(te.h||0)/2)-(s.y-s.h/2),dist=Math.max(1,Math.hypot(tedx,tedy)),vx=tedx/dist,vy=tedy/dist,ox=s.x+vx*16,oy=s.y-s.h/2+vy*16;const bpt=state==='pvp'?s.pvpTeam:undefined;
    switch(s.turretType){
      case'basic':bullets.push({x:ox,y:oy,src:'basic',vx:vx*6,vy:vy*6,isE:false,dmg:1,life:130,explosive:false,plasma:false,r:3,cannon:false,pvpTeam:bpt});s.shootCD=40;break;
      case'sniper':bullets.push({x:ox,y:oy,src:'sniper',vx:vx*12,vy:vy*12,isE:false,dmg:4,life:130,explosive:false,plasma:false,r:3,cannon:false,pvpTeam:bpt});s.shootCD=90;break;
      case'mortar':{const spd=Math.min(7,dist/30);bullets.push({x:s.x,y:s.y-s.h-2,vx:vx*spd,vy:-6+vy*2,isE:false,dmg:3,life:160,explosive:true,plasma:false,r:8,cannon:false,src:'mortar',pvpTeam:bpt});s.shootCD=120;break;}
      case'mini':bullets.push({x:ox,y:oy,src:'mini',vx:vx*9+(Math.random()-.5)*.9,vy:vy*9+(Math.random()-.5)*.9,isE:false,dmg:1,life:100,explosive:false,plasma:false,r:3,cannon:false,src:'mini',pvpTeam:bpt});s.shootCD=4;break;
      case'plasma':bullets.push({x:ox,y:oy,src:'plasma',vx:vx*10,vy:vy*10,isE:false,dmg:6,life:130,explosive:false,plasma:true,r:5,cannon:false,src:'plasma',pvpTeam:bpt});s.shootCD=60;break;
      case'cannon':bullets.push({x:ox,y:oy,src:'cannon',vx:vx*5,vy:vy*5,isE:false,dmg:5,life:140,explosive:true,plasma:false,r:10,cannon:true,src:'cannon',pvpTeam:bpt});s.shootCD=140;break;
      case'rocket':bullets.push({x:ox,y:oy,src:'rocket',vx:vx*6,vy:vy*6,isE:false,dmg:8,life:160,explosive:true,plasma:false,r:9,cannon:false,src:'rocket',pvpTeam:bpt});s.shootCD=100;break;
      case'laser':
        for(let i=0;i<3;i++)bullets.push({x:ox+vx*i*4,y:oy+vy*i*4,vx:vx*16,vy:vy*16,isE:false,dmg:1,life:60,explosive:false,plasma:true,r:3,cannon:false,src:'laser',pvpTeam:bpt});
        s.shootCD=8;break;
      case'flak':
        for(let i=0;i<5;i++){const a=Math.atan2(tedy,tedx)+(Math.random()-.5)*.5;bullets.push({x:ox,y:oy,vx:Math.cos(a)*8,vy:Math.sin(a)*8,isE:false,dmg:2,life:80,explosive:true,plasma:false,r:5,cannon:false,src:'flak',pvpTeam:bpt});}
        s.shootCD=50;break;
    }
  });
}

function tryRepair(p){
  structs.forEach(s=>{if(!s.dead&&Math.abs(p.x-s.x)<50){const def=getDef(s);if(def){s.hp=Math.min(s.maxHp,s.hp+3);}}});
}
function makeGunS(i){const d=GUN_DEFS[i];return{defIdx:i,name:d.name,ammo:d.startAmmo,cd:0};}
// Override getSkin to return dummy
function getSkinServer(p){return{id:p.skinId||'soldier',style:'soldier',body:p.color||'#4fc3f7',leg:'#334455',boot:'#222222',stripe:'#ffffff',visor:'#1a1a2e',melee:false};}

class GameRoom {
  constructor(code){
    this.code=code;
    this.sockets=[];// [{socket, playerIdx}]
    this.hostSocket=null;
    this.state='lobby';// lobby|playing|over
    this.tickInterval=null;
    this.inputs={};// socketId → {l,r,j,shoot,build,demo,cycle,cycleBack,matL,matR,repair,buildSel,matSel}
    this.chatLog=[];

    // ── Per-room game state (mirrors client globals) ──
    this.enemies=[];this.bullets=[];this.particles=[];this.scraps=[];
    this.structs=[];this.wdrops=[];this.airdrops=[];this.fireballs=[];
    this.skyBlimps=[];this.blimpDropCd=0;
    this.mapTrenches=[];this.mapLake=null;
    this.players=[];this.post={x:BW/2,y:GY,w:48,h:52,hp:30,maxHp:30,pulse:0,dead:false};
    this.wave=1;this.score=0;this.hi=0;
    this.waveTimer=0;this.buildPhase=true;this.readyUp=false;
    this.pendingWave=1;this.bossWarning=0;this.bossWarningType=0;
    this.bossWarningTimer=0;
    this.isBoss1v1=false;this.boss1v1Nightmare=false;this.boss1v1Variant='';
    this.pvpPosts=[];this.pvpTeamScore={1:0,2:0};
    this.currentMap=0;this.numPlayers=1;
    this.camX=0;this.waveStartTime=0;
    this.isBoss1v1=false;this.boss1v1Nightmare=false;
    this.pvpTeam1Score=0;this.pvpTeam2Score=0;
    this.achieveFlags={};
    this.BUILD_TIME=9999999;
    this.tick=0;
  }

  addPlayer(socket){
    if(this.sockets.length>=MAX_PLAYERS_PER_ROOM)return false;
    const idx=this.sockets.length;
    this.sockets.push({socket,playerIdx:idx});
    if(idx===0)this.hostSocket=socket;
    this.inputs[socket.id]={l:false,r:false,j:false,shoot:false,build:false,demo:false,cycle:false,cycleBack:false,matL:false,matR:false,repair:false,space:false,buildSel:0,matSel:0,dir:1,prevShoot:false,prevBuild:false,prevDemo:false,prevCycle:false,prevCycleBack:false,prevMatL:false,prevMatR:false,prevRepair:false,prevSpace:false};
    return idx;
  }

  removePlayer(socketId){
    const idx=this.sockets.findIndex(s=>s.socket.id===socketId);
    if(idx<0)return;
    this.sockets.splice(idx,1);
    delete this.inputs[socketId];
    // Update host
    if(this.sockets.length>0)this.hostSocket=this.sockets[0].socket;
    // If game running, mark player dead
    if(this.state==='playing'&&this.players[idx]){this.players[idx].dead=true;}
  }

  startGame(mapIndex){
    this.state='playing';
    this.currentMap=mapIndex||0;
    this.numPlayers=this.sockets.length;
    this.wave=1;this.score=0;this.pendingWave=1;this.bossWarning=0;
    this.enemies=[];this.bullets=[];this.particles=[];this.scraps=[];
    this.structs=[];this.wdrops=[];this.airdrops=[];this.fireballs=[];
    this.skyBlimps=[];this.blimpDropCd=0;
    const worldW2=MAPS[this.currentMap]&&MAPS[this.currentMap].scrollable?WORLD_W:BW;
    this.post={x:worldW2/2,y:GY,w:48,h:52,hp:30,maxHp:30,pulse:0,dead:false};
    this.buildPhase=true;this.readyUp=false;
    // Init players
    this.players=[];
    for(let i=0;i<this.numPlayers;i++){
      const cfg=P_CFG[i]||P_CFG[0];
      const sx=[worldW2/2-200,worldW2/2+200,worldW2/2-300,worldW2/2+300][i]||worldW2/2;
      this.players.push({
        x:sx,y:GY,w:18,h:34,vy:0,onGround:true,
        hp:6,maxHp:6,dir:i%2===0?1:-1,dead:false,
        color:cfg.color,label:cfg.label,inv:90,respawn:0,
        scrap:Math.ceil(30/this.numPlayers),idx:i,
        gunSlot:0,guns:[makeGunS(0)],buildMode:false,buildSel:0,matSel:0,
        repairCD:0,webbed:0,shielded:false,shieldTimer:0,
        skinId:'soldier',swingTimer:0,walkT:0,pvpTeam:i<2?1:2,
        _prev:{},
      });
    }
    this.spawnMapFeaturesRoom();
    this.spawnWaveRoom(1);
    this.waveStartTime=Date.now();
    this.startTick();
    this.broadcast('game_start',{mapIndex:this.currentMap,numPlayers:this.numPlayers});
  }

  spawnMapFeaturesRoom(){
    const M=MAPS[this.currentMap];
    this.mapTrenches=[];this.mapLake=null;
    if(M&&M.features){
      if(M.features.trenches)this.mapTrenches=[{x:200,w:80},{x:500,w:80},{x:700,w:60}];
      if(M.features.lake)this.mapLake={x:360,w:160};
    }
  }

  spawnWaveRoom(n){
    this.pendingWave=n;
    this.waveTimer=30;// 0.5s delay
  }

  startTick(){
    if(this.tickInterval)clearInterval(this.tickInterval);
    this.tickInterval=setInterval(()=>this.gameTick(),TICK_MS);
  }

  stopTick(){
    if(this.tickInterval){clearInterval(this.tickInterval);this.tickInterval=null;}
  }

  // ── MAIN SERVER GAME TICK ───────────────────────────────────────────
  gameTick(){
    if(this.state!=='playing')return;
    this.tick++;
    GAME_T=Date.now()/1000;
    GAME_FLASH=Math.floor(GAME_T*1000/400)%2===0;

    // Bind room arrays to globals so game functions can use them
    this._bindGlobals();

    // Apply inputs to players
    this._applyInputs();

    // Run game logic
    this._updateGameLogic();

    // Unbind
    this._unbindGlobals();

    // Send state snapshot (throttled: full state every 2 ticks, delta every tick)
    if(this.tick%2===0){
      this.broadcast('state',this._buildState());
    }
  }

  _bindGlobals(){
    // Temporarily set module-level variables for game functions
    _room=this;
    enemies=this.enemies;
    bullets=this.bullets;
    particles=this.particles;
    scraps=this.scraps;
    structs=this.structs;
    wdrops=this.wdrops;
    airdrops=this.airdrops;
    players=this.players;
    post=this.post;
    wave=this.wave;
    score=this.score;
    buildPhase=this.buildPhase;
    readyUp=this.readyUp;
    waveTimer=this.waveTimer;
    pendingWave=this.pendingWave;
    bossWarning=this.bossWarning;
    bossWarningType=this.bossWarningType;
    currentMap=this.currentMap;
    numPlayers=this.numPlayers;
    isBoss1v1=this.isBoss1v1;
    boss1v1Nightmare=this.boss1v1Nightmare;
    boss1v1Variant=this.boss1v1Variant;
    mapTrenches=this.mapTrenches;
    mapLake=this.mapLake;
    fireballs=this.fireballs;
    skyBlimps=this.skyBlimps;
    blimpDropCd=this.blimpDropCd;
    pvpPosts=this.pvpPosts;
    camX=this.camX;
  }

  _unbindGlobals(){
    this.enemies=enemies;
    this.bullets=bullets;
    this.particles=particles;
    this.scraps=scraps;
    this.structs=structs;
    this.wdrops=wdrops;
    this.airdrops=airdrops;
    this.players=players;
    this.post=post;
    this.wave=wave;
    this.score=score;
    this.buildPhase=buildPhase;
    this.readyUp=readyUp;
    this.waveTimer=waveTimer;
    this.pendingWave=pendingWave;
    this.bossWarning=bossWarning;
    this.bossWarningType=bossWarningType;
    this.mapTrenches=mapTrenches;
    this.mapLake=mapLake;
    this.fireballs=fireballs;
    this.skyBlimps=skyBlimps;
    this.blimpDropCd=blimpDropCd;
    this.pvpPosts=pvpPosts;
    this.camX=camX;
  }

  _applyInputs(){
    this.sockets.forEach(({socket,playerIdx})=>{
      const inp=this.inputs[socket.id];
      const p=this.players[playerIdx];
      if(!p||p.dead||!inp)return;
      const wspd=p.webbed>0?1.0:2.6;
      if(inp.l){p.x-=wspd;p.dir=-1;}
      if(inp.r){p.x+=wspd;p.dir=1;}
      if(inp.j&&p.onGround){p.vy=-10;p.onGround=false;}
      // Moving flag for animation
      p._moving=inp.l||inp.r;
      if(p._moving)p.walkT=(p.walkT||0)+1.5;
      else p.walkT=(p.walkT||0)*0.6;
      // Build mode toggle
      if(inp.build&&!inp.prevBuild){
        p.buildMode=!p.buildMode;
        if(p.buildMode&&inp.buildSel!==undefined)p.buildSel=inp.buildSel;
      }
      if(inp.cycle&&!inp.prevCycle)p.buildSel=(p.buildSel+1)%STRUCT_DEFS.length;
      if(inp.cycleBack&&!inp.prevCycleBack)p.buildSel=(p.buildSel+STRUCT_DEFS.length-1)%STRUCT_DEFS.length;
      if(inp.matL&&!inp.prevMatL)p.matSel=(p.matSel+MATERIALS.length-1)%MATERIALS.length;
      if(inp.matR&&!inp.prevMatR)p.matSel=(p.matSel+1)%MATERIALS.length;
      // Shoot/place
      if(inp.shoot&&!inp.prevShoot){
        if(p.buildMode){
          tryPlace(p);
        } else {
          const g=p.guns[p.gunSlot];const gd=GUN_DEFS[g.defIdx];
          if(g.cd<=0&&(g.ammo>0||g.ammo===Infinity)){
            if(g.ammo!==Infinity)g.ammo--;
            g.cd=gd.cd;
            fireBullet(p.x+(p.dir*10),p.y-p.h*.6,p.dir,false,gd.dmg,gd.spd,gd.explosive,gd.spread,gd.plasma,gd.melee,p.pvpTeam);
          }
        }
      }
      // Gun cycle (mouse wheel equivalent)
      if(inp.gunCycle){p.gunSlot=(p.gunSlot+1)%p.guns.length;}
      if(inp.gunCycleBack){p.gunSlot=(p.gunSlot+p.guns.length-1)%p.guns.length;}
      // Demo
      if(inp.demo&&!inp.prevDemo)tryDemo(p);
      // Repair
      if(inp.repair&&!inp.prevRepair)tryRepair(p);
      // Wave start (space)
      if(inp.space&&!inp.prevSpace&&buildPhase&&!readyUp){readyUp=true;}
      // Update prev states
      ['shoot','build','demo','cycle','cycleBack','matL','matR','repair','space'].forEach(k=>inp['prev'+k.charAt(0).toUpperCase()+k.slice(1)]=inp[k]);
    });
  }

  _updateGameLogic(){
    // Gun cooldowns
    this.players.forEach(p=>{if(!p.dead)p.guns.forEach(g=>{if(g.cd>0)g.cd--;});});
    // Invincibility countdowns
    this.players.forEach(p=>{if(p.inv>0)p.inv--;if(p.shieldTimer>0)p.shieldTimer--;});
    // Wave start pending
    if(this.waveTimer>0){
      this.waveTimer--;
      if(this.waveTimer===0)actuallySpawnWave(this.pendingWave);
    }
    // Run all updates using the globally-bound state
    try{updatePlayers();}catch(e){/* silent */}
    try{updateEnemies();}catch(e){/* silent */}
    try{updateNewBosses();}catch(e){/* silent */}
    try{updateBullets();}catch(e){/* silent */}
    try{updateStructSpecials();}catch(e){/* silent */}
    try{updateBombs();}catch(e){/* silent */}
    try{updateTurrets();}catch(e){/* silent */}
    try{checkWave();}catch(e){/* silent */}
    // Volcanic fireballs
    if(MAPS[this.currentMap]&&MAPS[this.currentMap].name==='VOLCANO'&&!buildPhase){
      if(Math.random()<0.006)fireballs.push({x:Math.random()*BW,y:GY-220-Math.random()*100,vy:1+Math.random()*2,vx:(Math.random()-.5)*2,r:6+Math.random()*4});
      fireballs=fireballs.filter(fb=>{
        fb.x+=fb.vx;fb.y+=fb.vy;fb.vy+=0.25;
        if(fb.y>=GY-4)return false;
        players.forEach(p=>{if(!p.dead&&!p.inv&&Math.hypot(p.x-fb.x,p.y-fb.y)<fb.r+12){p.hp--;p.inv=60;}});
        enemies.forEach(e=>{if(!e.dead&&Math.hypot(e.x-fb.x,e.y-fb.y)<fb.r+12){e.hp-=2;if(e.hp<=0)killEnemy(e);}});
        return fb.y<GY+10;
      });
      this.fireballs=fireballs;
    }
    // Check game over
    if(post.dead&&this.state==='playing'){
      this.state='over';
      this.stopTick();
      this.broadcast('game_over',{wave:wave,score:score});
    }
  }

  _buildState(){
    // Build compressed state snapshot to send to all clients
    return {
      t:this.tick,
      state:this.state,
      wave,score,buildPhase,bossWarning,bossWarningType,
      waveTimer:this.waveTimer,
      players:this.players.map(p=>({
        x:p.x,y:p.y,vy:p.vy,dir:p.dir,dead:p.dead,hp:p.hp,maxHp:p.maxHp,
        inv:p.inv,scrap:p.scrap,idx:p.idx,color:p.color,label:p.label,
        gunSlot:p.gunSlot,buildMode:p.buildMode,buildSel:p.buildSel,matSel:p.matSel,
        skinId:p.skinId,walkT:p.walkT||0,onGround:p.onGround,shielded:p.shielded,
        _moving:p._moving||false,vy:p.vy||0,
        guns:p.guns.map(g=>({defIdx:g.defIdx,name:g.name,ammo:g.ammo,cd:g.cd}))
      })),
      post:{x:post.x,y:post.y,hp:post.hp,maxHp:post.maxHp,dead:post.dead},
      enemies:enemies.filter(e=>!e.dead).map(e=>({
        x:e.x,y:e.y,w:e.w,h:e.h,hp:e.hp,maxHp:e.maxHp,dir:e.dir,
        type:e.type,dead:e.dead,phase:e.phase,bossVariant:e.bossVariant,
        underground:e.underground,shielded:e.shielded,flying:e.flying,
        speed:e.speed,sansInvincible:e.sansInvincible,sansTick:e.sansTick,
        beatTimer:e.beatTimer,bobOffset:e.bobOffset
      })),
      bullets:bullets.map(b=>({x:b.x,y:b.y,vx:b.vx,vy:b.vy,r:b.r,isE:b.isE,plasma:b.plasma,explosive:b.explosive,guided:b.guided,bone:b.bone,cannon:b.cannon,silk:b.silk})),
      structs:structs.filter(s=>!s.dead).map(s=>({id:s.id,x:s.x,y:s.y,w:s.w,h:s.h,hp:s.hp,maxHp:s.maxHp,mat:s.mat,dead:s.dead,turretType:s.turretType})),
      scraps:scraps.map(s=>({x:s.x,y:s.y})),
      wdrops:wdrops.map(d=>({x:d.x,y:d.y,gIdx:d.gIdx,bob:d.bob||0})),
      fireballs:this.fireballs.map(f=>({x:f.x,y:f.y,r:f.r})),
      camX:this._computeCamX(),
      elapsed:waveStartTime>0?Math.floor((Date.now()-waveStartTime)/1000):0,
    };
  }

  _computeCamX(){
    const M=MAPS[this.currentMap];
    if(M&&M.scrollable&&this.players.length>0){
      const alive=this.players.filter(p=>!p.dead);
      if(alive.length>0){
        const avgX=alive.reduce((s,p)=>s+p.x,0)/alive.length;
        const target=Math.max(0,Math.min(WORLD_W-BW,avgX-BW/2));
        this.camX+=(target-this.camX)*0.08;
      }
    } else this.camX=0;
    return this.camX;
  }

  broadcast(event,data){
    this.sockets.forEach(({socket})=>socket.emit(event,data));
  }

  toJSON(){
    return {code:this.code,playerCount:this.sockets.length,state:this.state,map:MAPS[this.currentMap]?.name||'?'};
  }
}

// Module-level game state (bound from room during tick)
let _room=null;
let enemies=[],bullets=[],particles=[],scraps=[],structs=[],wdrops=[],airdrops=[],fireballs=[],skyBlimps=[],blimpDropCd=0;
let players=[],post={};
let wave=1,score=0,hi=0,buildPhase=true,readyUp=false,waveTimer=0,pendingWave=1;
let bossWarning=0,bossWarningType=0,bossWarningTimer=0;
let currentMap=0,numPlayers=1,isBoss1v1=false,boss1v1Nightmare=false,boss1v1Variant='';
let mapTrenches=[],mapLake=null,pvpPosts=[],camX=0;
let waveStartTime=0,pvpTeam1Score=0,pvpTeam2Score=0;
let state='lobby';
let achieveFlags={};
const cheats={grasshopper:false,remedy312:false,masterBuilder:false,hitman:false,shapeshifter:false};

// Override getSkin to return dummy (server doesn't need skin data)
function getSkin(p){return{id:p.skinId||'soldier',style:'soldier',body:p.color,leg:'#334455',boot:'#222222',stripe:'#ffffff',visor:'#1a1a2e',melee:false};}

// Override makeGun for server (no skin dependency)
function makeGunS(i){const d=GUN_DEFS[i];return{defIdx:i,name:d.name,ammo:d.startAmmo,cd:0};}

// tryRepair helper
function tryRepair(p){
  structs.forEach(s=>{if(!s.dead&&Math.abs(p.x-s.x)<50){const def=getDef(s);if(def){s.hp=Math.min(s.maxHp,s.hp+3);}}});
}


// ═══════════════════════════════════════════════════════════════════════
// Socket.IO Event Handlers
// ═══════════════════════════════════════════════════════════════════════
io.on('connection',(socket)=>{
  console.log('Connected:',socket.id);
  let myRoom=null;
  let myPlayerIdx=-1;

  // ── CREATE ROOM ──────────────────────────────────────────────────────
  socket.on('create_room',({skinId,name})=>{
    let code=genCode();
    while(rooms.has(code))code=genCode();
    const room=new GameRoom(code);
    rooms.set(code,room);
    myRoom=room;
    myPlayerIdx=room.addPlayer(socket);
    room.players=[];// will be set on startGame
    socket.join(code);
    socket.emit('room_created',{code,playerIdx:myPlayerIdx});
    console.log('Room created:',code);
  });

  // ── JOIN ROOM ────────────────────────────────────────────────────────
  socket.on('join_room',({code,skinId,name})=>{
    const room=rooms.get(code.toUpperCase());
    if(!room){socket.emit('error',{msg:'Room not found'});return;}
    if(room.sockets.length>=MAX_PLAYERS_PER_ROOM){socket.emit('error',{msg:'Room full'});return;}
    if(room.state==='playing'){socket.emit('error',{msg:'Game already in progress'});return;}
    myRoom=room;
    myPlayerIdx=room.addPlayer(socket);
    socket.join(code);
    socket.emit('room_joined',{code,playerIdx:myPlayerIdx,numPlayers:room.sockets.length});
    // Notify others
    socket.to(code).emit('player_joined',{playerIdx:myPlayerIdx,numPlayers:room.sockets.length});
    console.log('Player joined room:',code,'idx:',myPlayerIdx);
  });

  // ── START GAME (host only) ───────────────────────────────────────────
  socket.on('start_game',({mapIndex,skinIds})=>{
    if(!myRoom||socket.id!==myRoom.hostSocket?.id){socket.emit('error',{msg:'Only host can start'});return;}
    if(myRoom.sockets.length<1){socket.emit('error',{msg:'Need at least 1 player'});return;}
    // Set player skins
    if(skinIds&&Array.isArray(skinIds)){
      myRoom.sockets.forEach(({socket:s,playerIdx:pi})=>{
        if(skinIds[pi]!==undefined)myRoom.sockets[pi].skinId=skinIds[pi];
      });
    }
    myRoom.startGame(mapIndex||0);
    console.log('Game started in room:',myRoom.code,'map:',mapIndex);
  });

  // ── PLAYER INPUT ────────────────────────────────────────────────────
  socket.on('input',(inp)=>{
    if(!myRoom)return;
    const existing=myRoom.inputs[socket.id];
    if(!existing)return;
    // Merge input (keep prev states)
    Object.assign(existing,inp);
  });

  // ── SKIN SELECTION ──────────────────────────────────────────────────
  socket.on('set_skin',(skinId)=>{
    if(!myRoom||myPlayerIdx<0)return;
    const p=myRoom.players[myPlayerIdx];
    if(p)p.skinId=skinId;
  });

  // ── CHAT ────────────────────────────────────────────────────────────
  socket.on('chat',(msg)=>{
    if(!myRoom)return;
    const safe=String(msg).slice(0,120);
    myRoom.broadcast('chat',{playerIdx:myPlayerIdx,msg:safe});
  });

  // ── REQUEST LOBBY LIST ──────────────────────────────────────────────
  socket.on('list_rooms',()=>{
    const open=[...rooms.values()].filter(r=>r.state==='lobby'&&r.sockets.length<4).map(r=>r.toJSON());
    socket.emit('rooms_list',open);
  });

  // ── DISCONNECT ───────────────────────────────────────────────────────
  socket.on('disconnect',()=>{
    console.log('Disconnected:',socket.id);
    if(!myRoom)return;
    myRoom.removePlayer(socket.id);
    if(myRoom.sockets.length===0){
      myRoom.stopTick();
      rooms.delete(myRoom.code);
      console.log('Room deleted:',myRoom.code);
    } else {
      myRoom.broadcast('player_left',{playerIdx:myPlayerIdx,numPlayers:myRoom.sockets.length});
    }
  });
});

// ── Clean up empty rooms periodically ─────────────────────────────────
setInterval(()=>{
  rooms.forEach((room,code)=>{
    if(room.sockets.length===0){room.stopTick();rooms.delete(code);}
  });
},60000);

// ── Start server ────────────────────────────────────────────────────────
const PORT=process.env.PORT||3000;
server.listen(PORT,()=>console.log(`Frontline server running on port ${PORT}`));
