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
const service=makeService('school-league',db as unknown as Database);
beforeAll(async()=>{await service.seed();await service.seed();},30000);
afterAll(async()=>{await db.$disconnect();await removeDirectory(directory);});

it('renders public league, code entry, card, profile and season views',async()=>{
  expect(await db.school.count()).toBe(20);expect(await db.student.count()).toBe(400);
  for(const path of ['/','/join','/card','/schools/school-0','/admin']){
    const view=await service.view(path,'teacher');expect(view.metrics.length).toBe(4);
    expect(view.forms.length+view.tables.length+view.cards.length).toBeGreaterThan(0);
  }
  expect((await service.view('/')).tables).toHaveLength(3);
  expect((await service.view('/card','student','school-0')).extra?.project.nickname).toBeTruthy();
  expect(await service.exportCsv()).toContain('published');
  await expect(service.view('/schools/missing')).rejects.toThrow('not found');
  await expect(service.visit('unknown')).rejects.toThrow('Unavailable');
});
it('validates school code and privacy and updates ranks only in an unfrozen season',async()=>{
  await expect(service.mutate('joinSchool',{schoolCode:'bad'})).rejects.toThrow('Invalid school');
  expect((await service.mutate('joinSchool',{schoolCode:'START-001'})).redirect).toBe('/?selection=school-0');
  const input={schoolId:'school-0',nickname:'NovaFlow',title:'eco orbit',idea:'a greener school'};
  await expect(service.mutate('publish',input,'visitor')).rejects.toThrow('student');
  await expect(service.mutate('publish',{...input,nickname:'test@example.org'},'student')).rejects.toThrow('Email');
  await expect(service.mutate('publish',{...input,title:'x'.repeat(61)},'student')).rejects.toThrow('40/60/160');
  const before=await db.pointsSnapshot.findFirstOrThrow({where:{seasonId:'season-0',schoolId:'school-0'}});
  await service.mutate('publish',input,'student');
  expect((await db.pointsSnapshot.findFirstOrThrow({where:{id:before.id}})).points).toBe(before.points+11);
  await service.mutate('simulate',{n:2},'teacher');
  await expect(service.mutate('freeze',{},'student')).rejects.toThrow('teacher');
  await service.mutate('freeze',{},'teacher');
  await service.view('/');
  await expect(service.mutate('simulate',{n:1},'teacher')).rejects.toThrow('frozen');
  await expect(service.mutate('publish',input,'student')).rejects.toThrow('frozen');
  await service.mutate('newSeason',{title:'next orbit'},'teacher');
  expect((await db.pointsSnapshot.findFirstOrThrow({where:{id:before.id}})).points).toBeGreaterThan(before.points);
  const fresh=await db.season.findFirstOrThrow({where:{active:true}});
  expect(fresh.id).not.toBe('season-0');
  expect((await service.view('/')).metrics.find(m=>m.label.includes('Started'))?.value).toBe(0);
  await expect(service.mutate('unknown',{},'teacher')).rejects.toThrow('Unknown');
});
