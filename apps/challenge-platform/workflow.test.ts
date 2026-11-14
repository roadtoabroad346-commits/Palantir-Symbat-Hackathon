import {mkdtempSync,readFileSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {DatabaseSync} from 'node:sqlite';
import {beforeAll,afterAll,expect,it} from 'vitest';
import {PrismaLibSQL} from '@prisma/adapter-libsql';
import {PrismaClient} from './generated/client';
import {makeService,type Database} from '@startify/shared/server';

const directory=mkdtempSync(join(tmpdir(),'startify-workflow-'));
const file=join(directory,'demo.db');
const sqlite=new DatabaseSync(file);
sqlite.exec(readFileSync(new URL('./prisma/migrations/001_init.sql',import.meta.url),'utf8'));
sqlite.close();
const db=new PrismaClient({adapter:new PrismaLibSQL({url:'file:'+file})});
const service=makeService('challenge-platform',db as unknown as Database);
beforeAll(async()=>{await service.seed();await service.seed();},30000);
afterAll(async()=>{await db.$disconnect();rmSync(directory,{recursive:true,force:true});});

it('renders all challenge views including frozen results and seeded profiles',async()=>{
  expect(await db.challenge.count()).toBe(3);expect(await db.team.count()).toBe(18);
  for(const path of ['/challenges','/challenges/challenge-0','/challenges/challenge-2','/teams/team-0','/judge','/admin','/showcase']){
    const view=await service.view(path,'admin');expect(view.metrics.length).toBe(4);
    expect(view.forms.length+view.tables.length+view.cards.length).toBeGreaterThan(0);
  }
  expect((await service.view('/showcase')).cards).toHaveLength(3);
  expect(await service.exportCsv()).toContain('points');
});
it('validates challenge configuration, creates teams, scores and freezes them',async()=>{
  const input={title:'workflow-orbit',theme:'a better school',startAt:'2026-11-01',endAt:'2027-02-01',rubric:'impact,feasibility',rubricWeights:'1,1',autoWeight:.5};
  await expect(service.mutate('createChallenge',input,'teacher')).rejects.toThrow('admin');
  await expect(service.mutate('createChallenge',{...input,endAt:'2026-01-01'},'admin')).rejects.toThrow('End');
  await expect(service.mutate('createChallenge',{...input,rubricWeights:'1'},'admin')).rejects.toThrow('rubric');
  const result=await service.mutate('createChallenge',input,'admin');const challengeId=result.redirect.split('/')[2];
  const team={challengeId,name:'workflow-team',schoolCode:'START-001',members:'NovaFlow,KZ\nOrbitFlow,UZ'};
  await expect(service.mutate('createTeam',team,'judge')).rejects.toThrow('student');
  await expect(service.mutate('createTeam',{...team,schoolCode:'BAD'},'student')).rejects.toThrow('Invalid school');
  await expect(service.mutate('createTeam',{...team,members:'NovaFlow,XX\nOrbitFlow,UZ'},'student')).rejects.toThrow('ISO');
  const made=await service.mutate('createTeam',team,'student');const teamId=made.redirect.split('/')[2];
  expect((await service.view('/teams/'+teamId)).cards.some(c=>c.title==='Cross-border team')).toBe(true);
  await service.view('/challenges/'+challengeId);
  await expect(service.mutate('judge',{teamId,judgeId:'judge-0',scores:'60,80'},'admin')).rejects.toThrow('judge');
  await service.mutate('judge',{teamId,judgeId:'judge-0',scores:'60,80'},'judge');
  expect((await db.judgeScore.findFirstOrThrow({where:{teamId}})).total).toBe(70);
  await service.mutate('judge',{teamId,judgeId:'judge-0',scores:'80,100'},'judge');
  expect((await db.judgeScore.findFirstOrThrow({where:{teamId}})).total).toBe(90);
  await expect(service.mutate('simulate',{},'student')).rejects.toThrow('teacher');
  await service.mutate('simulate',{},'teacher');
  await expect(service.mutate('close',{challengeId},'teacher')).rejects.toThrow('admin');
  await service.mutate('close',{challengeId},'admin');
  await expect(service.mutate('close',{challengeId},'admin')).rejects.toThrow('Already');
  await expect(service.mutate('judge',{teamId,judgeId:'judge-0',scores:'0,0'},'judge')).rejects.toThrow('frozen');
  await expect(service.mutate('createTeam',team,'student')).rejects.toThrow('not open');
  expect((await service.view('/challenges/'+challengeId)).forms).toHaveLength(0);
  await expect(service.mutate('unknown',{},'admin')).rejects.toThrow('Unknown');
});
