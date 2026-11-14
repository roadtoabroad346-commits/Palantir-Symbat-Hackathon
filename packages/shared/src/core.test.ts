import {describe,it,expect} from 'vitest';
import {MockAiStartifyClient,seedStudents,piiGuard,points,funnel,stageDistribution,attribute,cpa,compliance,messageVariants,balance,levelFor,redeemBalance,fraudCheck,challengeScore,rubricScore,badges,rank,validateTeam,parseNicknameCsv,codeActive,activationHealth,seasonRollover,csv} from './index';
describe('shared adapter and privacy',()=>{
 it('seeds repeatably and emits events',async()=>{expect(seedStudents(10)).toEqual(seedStudents(10));const c=new MockAiStartifyClient();let count=0;const off=c.subscribe(()=>count++);c.simulateRegistrations(3);off();c.simulateRegistrations(1);expect(count).toBe(3);expect((await c.verifySchoolCode('bad')).valid).toBe(false);expect((await c.verifySchoolCode('START-001')).valid).toBe(true);});
 it('blocks PII in Latin and Cyrillic',()=>{for(const s of ['a@b.com','+7 (701) 222-33-44','John Smith','Иван Иванов'])expect(piiGuard(s).length).toBeGreaterThan(0);expect(piiGuard('Orbit42')).toEqual([]);});
});
describe('growth',()=>{
 it('counts attribution, funnel and CPA',()=>{const es=[{type:'visit',linkCode:'a'},{type:'registered',linkCode:'a'},{type:'published',linkCode:'b'}];expect(funnel(attribute(es,'a'))).toEqual({visit:1,registered:1,started:0,published:0});expect(cpa(100,20)).toBe(5);expect(cpa(10,0)).toBeNull();expect(stageDistribution([{stage:3}])[2].count).toBe(1);});
 it('checks every compliance rule',()=>{expect(compliance({audience:'student',budgetUsd:2,text:'teacher'}).some(r=>r.level==='block')).toBe(true);expect(compliance({audience:'parent',minAge:16,budgetUsd:2,text:'teacher'}).some(r=>r.level==='block')).toBe(true);expect(compliance({audience:'parent',budgetUsd:0,text:'Send your email'}).some(r=>r.level==='block')).toBe(true);expect(compliance({audience:'parent',budgetUsd:0,text:'Build a startup'})[0].level).toBe('warn');expect(compliance({audience:'parent',budgetUsd:0,text:'Join with a teacher'})[0].level).toBe('pass');});
 it('generates three local variants',()=>{expect(messageVariants({country:'UZ',audience:'parent',channel:'instagram',language:'ru',tone:'friendly'})).toHaveLength(3);});
});
describe('ambassadors',()=>{
 it('ledger is balance and levels follow thresholds',()=>{expect(balance([{delta:300},{delta:-100}])).toBe(200);expect(levelFor(200).name).toBe('Silver');expect(levelFor(599).name).toBe('Silver');expect(levelFor(1500).name).toBe('Lead');});
 it('cannot overspend or redeem out of stock',()=>{expect(redeemBalance(200,100,1)).toBe(100);expect(()=>redeemBalance(50,100,1)).toThrow();expect(()=>redeemBalance(200,100,0)).toThrow();});
 it('detects bursts and duplicates',()=>{expect(fraudCheck(Array.from({length:20},()=>({ts:'2026-01-01T00:00:00Z'})))).toBe(true);expect(fraudCheck([{ts:'2026-01-01',nickname:'nova'},{ts:'2026-01-02',nickname:'Nova'}])).toBe(true);expect(fraudCheck([{ts:'2026-01-01'}])).toBe(false);});
});
describe('challenges',()=>{
 it('weights scores and rubric',()=>{expect(challengeScore(10,2,4,80)).toBe(56);expect(rubricScore([40,80],[1,3])).toBe(70);expect(()=>rubricScore([101],[1])).toThrow();});
 it('awards all badges with unique consecutive days',()=>{expect(badges({started:1,published:1,countries:['KZ','UZ'],days:['2026-01-01','2026-01-02','2026-01-03']})).toHaveLength(4);expect(badges({started:0,published:0,countries:['KZ'],days:[]})).toEqual([]);});
 it('validates team size and PII',()=>{expect(()=>validateTeam([{nickname:'a',studentRef:'a'}])).toThrow();expect(()=>validateTeam([{nickname:'John Smith',studentRef:'a'},{nickname:'Nova',studentRef:'b'}])).toThrow();});
});
describe('portal',()=>{
 it('reports CSV errors by line without losing good rows',()=>{const p=parseNicknameCsv('nickname\nOrbit42\na@b.com\nJohn Smith\n+77012223344');expect(p.valid).toEqual(['Orbit42']);expect(p.errors.map(e=>e.row)).toEqual([3,4,5]);});
 it('gates codes and computes health',()=>{expect(codeActive(false,'active')).toBe(false);expect(codeActive(true,'paused')).toBe(false);expect(codeActive(true,'pilot')).toBe(true);expect(activationHealth([]).startedShare).toBe(0);expect(activationHealth([{stage:0,status:'none'},{stage:10,status:'published'}]).publishedShare).toBe(.5);});
});
describe('league',()=>{
 it('uses shared points and stable tie breakers',()=>{expect(points(3,2)).toBe(23);const base={points:10,published:1,ts:'2026-01-02'};expect(rank([{...base,id:'a'},{...base,id:'b',published:2},{...base,id:'c',ts:'2026-01-01'}]).map(r=>r.id)).toEqual(['b','c','a']);});
 it('retains season history',()=>{const h=[{points:10}];expect(seasonRollover(h,{points:20})).toEqual([{points:10},{points:20}]);expect(h).toHaveLength(1);});
 it('escapes CSV formulas and quotes',()=>{expect(csv([{nickname:'=SUM(A1)',idea:'"hi"'}])).toContain("'=SUM(A1)");});
});
