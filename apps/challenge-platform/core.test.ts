import {it,expect,afterAll} from 'vitest';
import {db,service} from './lib';
afterAll(()=>db.$disconnect());
it('freezes results and rejects later judge writes',async()=>{
 const id='test-'+Date.now();await db.challenge.create({data:{id,title:'test-orbit',theme:'demo',startAt:new Date(),endAt:new Date('2027-02-01'),status:'open',rubricJson:'["impact"]',weightsJson:'{"auto":0.5,"rubric":[1]}'}});
 const result=await service.mutate('createTeam',{challengeId:id,name:'orbit-test',schoolCode:'START-001',members:'NovaTT,KZ\nPixelTT,UZ'},'student');const teamId=result.redirect.split('/')[2];expect(await db.teamBadge.count({where:{teamId,badgeId:'Cross-border team'}})).toBe(1);
 await service.mutate('close',{challengeId:id},'admin');const frozen=(await db.challenge.findUniqueOrThrow({where:{id}})).frozenJson;await expect(service.mutate('judge',{teamId,judgeId:'judge-0',scores:'80'},'judge')).rejects.toThrow('frozen');expect((await db.challenge.findUniqueOrThrow({where:{id}})).frozenJson).toBe(frozen);
 await db.teamBadge.deleteMany({where:{teamId}});await db.teamMember.deleteMany({where:{teamId}});await db.team.delete({where:{id:teamId}});await db.challenge.delete({where:{id}});
});
