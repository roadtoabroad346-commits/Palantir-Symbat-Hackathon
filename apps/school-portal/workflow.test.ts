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
const service=makeService('school-portal',db as unknown as Database);
beforeAll(async()=>{await service.seed();await service.seed();},30000);
afterAll(async()=>{await db.$disconnect();await removeDirectory(directory);});

it('renders all school views with appropriate partner gating',async()=>{
  expect(await db.school.count()).toBe(12);expect(await db.classGroup.count()).toBe(30);expect(await db.studentEntry.count()).toBe(300);
  for(const path of ['/dashboard','/register','/classes/class-0','/classes/class-2','/lesson-kit','/reports','/partner']){
    const view=await service.view(path,'teacher');expect(view.metrics.length).toBeGreaterThan(0);
    expect(view.forms.length+view.tables.length+view.cards.length).toBeGreaterThan(0);
  }
  expect((await service.view('/lesson-kit')).cards).toHaveLength(4);
  expect((await service.view('/partner','teacher')).tables).toHaveLength(0);
  expect((await service.view('/partner','partner-manager')).chart).toHaveLength(4);
  expect((await service.view('/dashboard','teacher','school-2')).forms.some(f=>f.op==='consent')).toBe(true);
});
it('registers, gates consent, validates imports and saves period snapshots',async()=>{
  const input={name:'workflow-school',country:'KZ',city:'Astana',type:'club'};
  await expect(service.mutate('registerSchool',input,'partner-manager')).rejects.toThrow('teacher');
  const made=await service.mutate('registerSchool',input,'teacher');const schoolId=made.redirect.split('selection=')[1];
  const result=await service.mutate('createClass',{schoolId,name:'workflow-class',gradeRange:'7–9'},'teacher');const classId=result.redirect.split('/')[2];
  await expect(service.mutate('import',{classId,csv:'NovaFlow'},'teacher')).rejects.toThrow('consent');
  await expect(service.mutate('consent',{schoolId},'teacher')).rejects.toThrow('Confirm');
  await service.mutate('consent',{schoolId,consent:'true'},'teacher');
  await expect(service.mutate('import',{classId,csv:'nickname\nJohn Smith'},'teacher')).rejects.toThrow('Row');
  await expect(service.mutate('import',{classId,csv:'nickname'},'teacher')).rejects.toThrow('No nicknames');
  await service.mutate('import',{classId,csv:'nickname\nNovaFlow\nOrbitFlow'},'teacher');
  await expect(service.mutate('import',{classId,csv:'NovaFlow'},'teacher')).rejects.toThrow('already');
  await service.mutate('simulate',{},'teacher');
  expect((await db.studentEntry.findFirstOrThrow({where:{classId}})).stage).toBe(1);
  await expect(service.mutate('report',{schoolId,period:'wrong'},'teacher')).rejects.toThrow('YYYY');
  await service.mutate('report',{schoolId,period:'2026-11'},'teacher');
  const report=await db.report.findFirstOrThrow({where:{schoolId}});
  expect(await service.exportCsv(report.id)).toContain('NovaFlow');
  expect(await service.exportCsv()).toContain('nickname');
  expect((await service.view('/reports','teacher',schoolId)).tables[0].rows).toHaveLength(1);
  await service.view('/dashboard','teacher',schoolId);
  await service.view('/classes/'+classId,'teacher',schoolId);
});
it('changes school pipeline status, disables paused codes and keeps notes visible',async()=>{
  const result=await service.mutate('registerSchool',{name:'partner-school',country:'UZ',city:'Tashkent',type:'secondary',consent:'true'},'teacher');const schoolId=result.redirect.split('selection=')[1];
  const made=await service.mutate('createClass',{schoolId,name:'partner-class',gradeRange:'8–10'},'teacher');const classId=made.redirect.split('/')[2];
  await expect(service.mutate('partnerUpdate',{schoolId,status:'active'},'teacher')).rejects.toThrow('partner-manager');
  await service.mutate('partnerUpdate',{schoolId,status:'paused',note:'Run a club workshop'},'partner-manager');
  expect((await db.classGroup.findUniqueOrThrow({where:{id:classId}})).active).toBe(false);
  await service.mutate('partnerUpdate',{schoolId,status:'active',note:''},'partner-manager');
  expect((await db.classGroup.findUniqueOrThrow({where:{id:classId}})).active).toBe(true);
  const view=await service.view('/partner','partner-manager');
  expect(view.tables.some(t=>t.rows.some(r=>r.includes('Run a club workshop')))).toBe(true);
  await expect(service.mutate('createClass',{},'partner-manager')).rejects.toThrow('teacher');
  await expect(service.mutate('unknown',{},'teacher')).rejects.toThrow('Unknown');
});
