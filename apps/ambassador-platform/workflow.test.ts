import {mkdtempSync,readFileSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {DatabaseSync} from 'node:sqlite';
import {beforeAll,afterAll,expect,it} from 'vitest';
import {PrismaLibSQL} from '@prisma/adapter-libsql';
import {PrismaClient} from './generated/client';
import {makeService,removeDirectory,type Database} from '@startify/shared/server';

const directory=mkdtempSync(join(tmpdir(),'startify-workflow-'));
const file=join(directory,'demo.db');
const sqlite=new DatabaseSync(file);
sqlite.exec(readFileSync(new URL('./prisma/migrations/001_init.sql',import.meta.url),'utf8'));
sqlite.close();
const db=new PrismaClient({adapter:new PrismaLibSQL({url:'file:'+file})});
const service=makeService('ambassador-platform',db as unknown as Database);
beforeAll(async()=>{await service.seed();await service.seed();},30000);
afterAll(async()=>{await db.$disconnect();await removeDirectory(directory);});

it('shows all ambassador routes, gated admin and leaderboard order',async()=>{
  expect(await db.ambassador.count()).toBe(20);
  for(const path of ['/join','/dashboard','/tasks','/rewards','/leaderboard','/admin']){
    const view=await service.view(path,'admin');expect(view.metrics.length).toBe(4);
    expect(view.forms.length+view.cards.length+view.tables.length).toBeGreaterThan(0);
  }
  expect((await service.view('/admin','ambassador')).tables).toHaveLength(0);
  expect((await service.view('/dashboard','ambassador','amb-19')).title).toContain('Lead');
  const leaderboard=await service.view('/leaderboard');
  const scores=leaderboard.tables[0].rows.map(r=>Number(r[3]));
  expect(scores).toEqual([...scores].sort((a,b)=>b-a));
  expect(await service.exportCsv()).toContain('ambassadorId');
  await service.visit('AMB-1');
});
it('enrolls an adult, validates proofs and rejects tasks without authorization',async()=>{
  await expect(service.mutate('join',{adult:'true'})).rejects.toThrow('18+');
  const joined=await service.mutate('join',{adult:'true',conduct:'true',nickname:'NovaAdult',country:'UZ',city:'Tashkent'});
  const ambassadorId=joined.redirect.split('selection=')[1];
  expect((await db.ambassador.findUniqueOrThrow({where:{id:ambassadorId}})).age18Confirmed).toBe(true);
  expect((await service.view('/dashboard','ambassador',ambassadorId)).title).toContain('NovaAdult');
  await expect(service.mutate('submitTask',{taskId:'task-0',proof:'https://example.org',ambassadorId},'visitor')).rejects.toThrow('ambassador');
  await expect(service.mutate('submitTask',{taskId:'task-0',proof:'http://example.org',ambassadorId},'ambassador')).rejects.toThrow('HTTPS');
  await expect(service.mutate('submitTask',{taskId:'task-2',proof:'many',ambassadorId},'ambassador')).rejects.toThrow('count');
  for(const [taskId,proof] of [['task-0','https://example.org/proof'],['task-1','A club presentation'],['task-2','5']]){
    await service.mutate('submitTask',{taskId,proof,ambassadorId},'ambassador');
  }
  expect(await db.submission.count({where:{ambassadorId}})).toBe(3);
  const submission=await db.submission.findFirstOrThrow({where:{ambassadorId}});
  await expect(service.mutate('review',{submissionId:submission.id,status:'approved'},'ambassador')).rejects.toThrow('admin');
  await service.mutate('review',{submissionId:submission.id,status:'rejected'},'admin');
  expect(await db.pointsLedger.count({where:{refId:submission.id}})).toBe(0);
});
it('redeems atomically, fulfills once and reports insufficient balance',async()=>{
  await expect(service.mutate('redeem',{rewardId:'reward-0'},'admin')).rejects.toThrow('ambassador');
  await service.mutate('redeem',{ambassadorId:'amb-19',rewardId:'reward-0'},'ambassador');
  expect((await db.reward.findUniqueOrThrow({where:{id:'reward-0'}})).stock).toBe(9);
  const redemption=await db.redemption.findFirstOrThrow({where:{ambassadorId:'amb-19'}});
  await expect(service.mutate('fulfill',{redemptionId:redemption.id},'ambassador')).rejects.toThrow('admin');
  await service.mutate('fulfill',{redemptionId:redemption.id},'admin');
  expect((await db.redemption.findUniqueOrThrow({where:{id:redemption.id}})).status).toBe('fulfilled');
  await expect(service.mutate('redeem',{ambassadorId:'amb-1',rewardId:'reward-7'},'ambassador')).rejects.toThrow('Insufficient');
});
it('flags bursts, pauses task points and resumes future referrals after review',async()=>{
  await expect(service.mutate('simulate',{n:1},'visitor')).rejects.toThrow('ambassador');
  await expect(service.mutate('simulate',{n:1,ambassadorId:'missing'},'admin')).rejects.toThrow('Referral');
  await service.mutate('simulate',{n:1,ambassadorId:'amb-0'},'admin');
  expect(await db.pointsLedger.count({where:{ambassadorId:'amb-0',refType:'referral'}})).toBe(1);
  await service.mutate('simulate',{n:20,ambassadorId:'amb-0'},'admin');
  const flag=await db.fraudFlag.findFirstOrThrow({where:{ambassadorId:'amb-0',resolved:false}});
  await service.view('/admin','admin');
  await expect(service.mutate('review',{submissionId:'submission-0',status:'approved'},'admin')).rejects.toThrow('Resolve fraud');
  await expect(service.mutate('resolve',{flagId:flag.id},'ambassador')).rejects.toThrow('admin');
  await service.mutate('resolve',{flagId:flag.id},'admin');
  await expect(service.mutate('resolve',{flagId:flag.id},'admin')).rejects.toThrow('Already');
  await service.mutate('simulate',{n:1,ambassadorId:'amb-0'},'admin');
  expect(await db.pointsLedger.count({where:{ambassadorId:'amb-0',refType:'referral'}})).toBe(2);
  await service.mutate('review',{submissionId:'submission-0',status:'approved'},'admin');
  expect(await db.pointsLedger.count({where:{refId:'submission-0'}})).toBe(1);
  await service.view('/admin','admin');
  await expect(service.mutate('unknown',{},'admin')).rejects.toThrow('Unknown');
});
