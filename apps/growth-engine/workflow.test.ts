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
const service=makeService('growth-engine',db as unknown as Database);
beforeAll(async()=>{await service.seed();await service.seed();},30000);
afterAll(async()=>{await db.$disconnect();await removeDirectory(directory);});

it('builds meaningful seeded views for each growth route',async()=>{
  expect(await db.campaign.count()).toBe(10);
  expect(await db.trackedEvent.count()).toBe(2000);
  for(const path of ['/','/campaigns','/campaigns/new','/campaigns/campaign-0','/analytics','/compliance']){
    const view=await service.view(path,'growth-manager');
    expect(view.app).toBe('growth-engine');expect(view.metrics.length).toBeGreaterThan(0);
    expect(view.forms.length+view.cards.length+view.tables.length).toBeGreaterThan(0);
  }
  const analytics=await service.view('/analytics');
  expect(analytics.tables.some(t=>t.title.includes('Top 3'))).toBe(true);
  expect((await service.exportCsv())).toContain('cpaPublished');
});
it('attributes valid events, records referral visits and rejects unknown identifiers',async()=>{
  const link=await db.referralLink.findFirstOrThrow();
  await service.mutate('event',{linkCode:link.code,type:'registered',country:'UZ'},'viewer');
  await service.visit(link.code);
  expect(await db.trackedEvent.count({where:{linkCode:link.code,type:'registered'}})).toBe(56);
  await expect(service.visit('missing-link')).rejects.toThrow('Unknown');
  await expect(service.mutate('event',{linkCode:'missing',type:'visit',country:'KZ'})).rejects.toThrow('Unknown');
  await expect(service.mutate('event',{linkCode:link.code,type:'unknown',country:'KZ'})).rejects.toThrow('Invalid type');
  await expect(service.mutate('event',{linkCode:link.code,type:'visit',country:'XX'})).rejects.toThrow('Invalid country');
  await expect(service.view('/campaigns/missing')).rejects.toThrow('not found');
});
it('keeps optional-rule editing authorized and mandatory rules unavailable',async()=>{
  await expect(service.mutate('rule',{key:'mention',enabled:'false'},'viewer')).rejects.toThrow('growth-manager');
  await service.mutate('rule',{key:'mention',enabled:'false'},'growth-manager');
  expect((await db.complianceRule.findUniqueOrThrow({where:{key:'mention'}})).enabled).toBe(false);
  expect((await service.view('/compliance')).tables[0].rows.some(r=>r[1]==='—')).toBe(true);
  await service.view('/campaigns/campaign-0');
  await expect(service.mutate('rule',{key:'adult',enabled:'false'},'growth-manager')).rejects.toThrow('Invalid key');
  await service.mutate('rule',{key:'mention',enabled:'true'},'growth-manager');
});
it('validates campaign input boundaries and simulates attributed activity',async()=>{
  const input={name:'workflow-orbit',country:'KZ',audience:'teacher',channel:'telegram',language:'en',tone:'friendly',budgetUsd:0,minAge:18};
  await expect(service.mutate('createCampaign',{...input,name:''},'growth-manager')).rejects.toThrow('Required');
  await expect(service.mutate('createCampaign',{...input,budgetUsd:-1},'growth-manager')).rejects.toThrow('Invalid');
  await expect(service.mutate('createCampaign',{...input,tone:'teacher@example.org'},'growth-manager')).rejects.toThrow('Email');
  const made=await service.mutate('createCampaign',input,'growth-manager');
  expect((await service.view(made.redirect)).cards).toHaveLength(4);
  expect((await service.view(made.redirect)).metrics.some(m=>m.value==='—')).toBe(true);
  await service.mutate('simulate',{n:8},'growth-manager');
  expect(await db.trackedEvent.count()).toBe(2010);
  await expect(service.mutate('simulate',{n:0},'growth-manager')).rejects.toThrow('Invalid');
  await expect(service.mutate('unknown',{},'growth-manager')).rejects.toThrow('Unknown');
});
