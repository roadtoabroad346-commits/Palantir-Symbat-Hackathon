import {it,expect,afterAll} from 'vitest';
import {db,service} from './lib';
afterAll(()=>db.$disconnect());
it('keeps codes inactive before consent and rejects PII import',async()=>{
 const result=await service.mutate('registerSchool',{name:'orbit-school',country:'KZ',city:'Astana',type:'club'},'teacher');const schoolId=result.redirect.split('selection=')[1];const made=await service.mutate('createClass',{schoolId,name:'orbit-class',gradeRange:'7-9'},'teacher');const classId=made.redirect.split('/')[2];expect((await db.classGroup.findUniqueOrThrow({where:{id:classId}})).active).toBe(false);
 await service.mutate('consent',{schoolId,consent:'true'},'teacher');expect((await db.classGroup.findUniqueOrThrow({where:{id:classId}})).active).toBe(true);
 await expect(service.mutate('import',{classId,csv:'nickname\nhello@example.org'},'teacher')).rejects.toThrow('Row');await service.mutate('import',{classId,csv:'nickname\nNovaSafe'},'teacher');expect(await db.studentEntry.count({where:{classId}})).toBe(1);
 await db.studentEntry.deleteMany({where:{classId}});await db.classGroup.delete({where:{id:classId}});await db.school.delete({where:{id:schoolId}});
});
