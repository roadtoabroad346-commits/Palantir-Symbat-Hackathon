import {randomUUID} from 'node:crypto';
import {afterAll,expect,it} from 'vitest';
import {db,service} from './lib';

afterAll(()=>db.$disconnect());

it('preserves an already published project when simulating later team progress',async()=>{
  const challengeId=`regression-challenge-${randomUUID()}`;
  const teamId=`regression-team-${randomUUID()}`;
  try{
    await db.challenge.create({data:{
      id:challengeId,title:'regression-orbit',theme:'demo',
      startAt:new Date('2026-11-01'),endAt:new Date('2027-02-01'),
      status:'open',rubricJson:'["impact"]',weightsJson:'{"auto":0.5,"rubric":[1]}',
    }});
    await db.team.create({data:{id:teamId,challengeId,name:'regression-orbit',schoolCode:'START-001',country:'KZ'}});
    await db.teamMember.createMany({data:[
      {id:randomUUID(),teamId,studentRef:randomUUID(),nickname:'NovaSafe',country:'KZ'},
      {id:randomUUID(),teamId,studentRef:randomUUID(),nickname:'OrbitSafe',country:'UZ'},
    ]});
    await db.progressSnapshot.create({data:{id:randomUUID(),teamId,started:2,published:1,avgStage:5,ts:new Date('2026-11-02')}});

    await service.mutate('simulate',{n:1},'teacher');

    const latest=await db.progressSnapshot.findFirstOrThrow({where:{teamId},orderBy:{ts:'desc'}});
    expect(latest.published).toBeGreaterThanOrEqual(1);
  }finally{
    await db.teamBadge.deleteMany({where:{teamId}});
    await db.progressSnapshot.deleteMany({where:{teamId}});
    await db.teamMember.deleteMany({where:{teamId}});
    await db.team.deleteMany({where:{id:teamId}});
    await db.challenge.deleteMany({where:{id:challengeId}});
  }
});
