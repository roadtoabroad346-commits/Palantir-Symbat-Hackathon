import {it,expect,afterAll} from 'vitest';
import {db,service} from './lib';
afterAll(()=>db.$disconnect());
it('requires adult confirmation and awards approval once',async()=>{
 await expect(service.mutate('join',{nickname:'OrbitX',country:'KZ',city:'Astana',conduct:'true'})).rejects.toThrow('18+');
 const id='test-'+Date.now();await db.submission.create({data:{id,taskId:'task-0',ambassadorId:'amb-0',proof:'demo',status:'pending'}});
 await service.mutate('review',{submissionId:id,status:'approved'},'admin');expect(await db.pointsLedger.count({where:{refId:id}})).toBe(1);await expect(service.mutate('review',{submissionId:id,status:'approved'},'admin')).rejects.toThrow('Already');await db.pointsLedger.deleteMany({where:{refId:id}});await db.submission.delete({where:{id}});
});
