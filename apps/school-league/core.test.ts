import {it,expect,afterAll} from 'vitest';
import {db,service} from './lib';
afterAll(()=>db.$disconnect());
it('publishes into the current season, freezes and rolls over without losing history',async()=>{
 const season=await db.season.findFirst({where:{active:true}});if(season)await db.season.update({where:{id:season.id},data:{active:false}});
 const existing=await db.school.findFirst();const id='test-season-'+Date.now(),schoolId=existing?.id??'test-school-'+Date.now();if(!existing)await db.school.create({data:{id:schoolId,slug:schoolId,name:'orbit-school',country:'KZ',city:'Astana',code:'START-001'}});await db.season.create({data:{id,title:'test',startAt:new Date(),endAt:new Date('2027-02-01'),active:true,frozen:false}});await db.pointsSnapshot.create({data:{id,seasonId:id,schoolId,started:0,published:0,points:0}});
 try{
  await service.mutate('publish',{schoolId,nickname:'NovaX',title:'eco orbit',idea:'a greener playground'},'student');expect((await db.pointsSnapshot.findFirstOrThrow({where:{seasonId:id,schoolId}})).points).toBe(11);
  await service.mutate('freeze',{},'teacher');await expect(service.mutate('publish',{schoolId,nickname:'PixelX',title:'eco orbit',idea:'a greener playground'},'student')).rejects.toThrow('frozen');
  await service.mutate('newSeason',{title:'next-orbit'},'teacher');expect((await db.pointsSnapshot.findFirstOrThrow({where:{seasonId:id,schoolId}})).points).toBe(11);const next=await db.season.findFirstOrThrow({where:{active:true}});expect(next.id).not.toBe(id);expect((await db.pointsSnapshot.findFirstOrThrow({where:{seasonId:next.id,schoolId}})).points).toBe(0);
  await db.pointsSnapshot.deleteMany({where:{seasonId:next.id}});await db.season.delete({where:{id:next.id}});
 }finally{
  const students=await db.student.findMany({where:{schoolId,nickname:{in:['NovaX','PixelX']}}});await db.project.deleteMany({where:{studentId:{in:students.map(s=>s.id)}}});await db.student.deleteMany({where:{id:{in:students.map(s=>s.id)}}});await db.pointsSnapshot.deleteMany({where:{seasonId:id}});await db.season.delete({where:{id}});if(!existing)await db.school.delete({where:{id:schoolId}});if(season)await db.season.update({where:{id:season.id},data:{active:true}});
 }
});
