import {spawn} from 'node:child_process';
import assert from 'node:assert/strict';
const name=process.argv[2];
const apps=['growth-engine','ambassador-platform','challenge-platform','school-portal','school-league'];
const port=3001+apps.indexOf(name);
const paths={
 'growth-engine':['/campaigns','/campaigns/new','/campaigns/campaign-0','/analytics','/compliance'],
 'ambassador-platform':['/join','/dashboard','/tasks','/rewards','/leaderboard','/admin'],
 'challenge-platform':['/challenges','/challenges/challenge-0','/teams/team-0','/judge','/admin','/showcase'],
 'school-portal':['/register','/dashboard','/classes/class-0','/lesson-kit','/reports','/partner'],
 'school-league':['/','/schools/school-0','/join','/card','/admin']};
const roles={'growth-engine':'growth-manager','ambassador-platform':'admin','challenge-platform':'admin','school-portal':'teacher','school-league':'teacher'};
const server=spawn('pnpm',['--filter',name,'start'],{stdio:['ignore','pipe','pipe'],detached:true,env:{...process.env,DEMO_PRODUCTION:'1'}});let logs='';server.stdout.on('data',b=>logs+=b);server.stderr.on('data',b=>logs+=b);
const origin=`http://127.0.0.1:${port}`;
try{
 let ready=false;for(let i=0;i<120;i++){if(server.exitCode!==null)throw new Error(logs);try{const r=await fetch(origin);if(r.ok){ready=true;break;}}catch{}await new Promise(r=>setTimeout(r,500));}assert(ready,'Startup timeout: '+logs);
 for(const path of paths[name]){const r=await fetch(origin+path);assert.equal(r.status,200,path);assert((await r.text()).includes('Demo')||(await fetch(origin+path).then(r=>r.text())).includes('Демоданные'));}
 const baseline=await fetch(origin+'/api/state').then(r=>r.json());
 const otherApp=apps.find(app=>app!==name);
 const foreignCookie=`demo-role-${otherApp}=${roles[name]}; demo-role=${roles[name]}`;
 const foreignState=await fetch(origin+'/api/state',{headers:{cookie:foreignCookie}}).then(r=>r.json());
 assert.equal(foreignState.role,baseline.role,'Other apps and legacy cookies must not change this app role');
 const session=await fetch(origin+'/api/session',{method:'POST',headers:{'Content-Type':'application/json',Origin:origin},body:JSON.stringify({role:roles[name]})});assert.equal(session.status,200);const cookie=session.headers.get('set-cookie').split(';')[0];assert(cookie.startsWith(`demo-role-${name}=`),'Session cookie must be scoped by app name');
 const signedIn=await fetch(origin+'/api/state',{headers:{cookie:cookie+'; '+foreignCookie}}).then(r=>r.json());assert.equal(signedIn.role,roles[name],'Own role cookie must survive other app cookies');
 const before=await fetch(origin+'/api/state').then(r=>r.json());const sim=await fetch(origin+'/api/simulate?n=4',{headers:{cookie}});assert.equal(sim.status,200,await sim.text());const after=await fetch(origin+'/api/state').then(r=>r.json());assert.notDeepEqual(after.metrics,before.metrics,'Simulation must change metrics');
 const csv=await fetch(origin+'/api/export');assert.equal(csv.status,200);assert(csv.headers.get('content-type').includes('text/csv'));assert((await csv.text()).length>20);
 console.log(`${name}: ${paths[name].length} routes + isolated role cookie + simulation + CSV passed`);
}finally{try{process.kill(-server.pid,'SIGTERM');}catch{}}
