import {it,expect,afterAll} from 'vitest';
import {db,service} from './lib';
afterAll(()=>db.$disconnect());
it('persists variants, referral attribution and blocks paid minors',async()=>{
 const d={name:'test-orbit',country:'UZ',audience:'parent',channel:'instagram',language:'ru',tone:'friendly',budgetUsd:100,minAge:18};
 await expect(service.mutate('createCampaign',{...d,audience:'student'},'growth-manager')).rejects.toThrow('18+');
 const made=await service.mutate('createCampaign',d,'growth-manager');const id=made.redirect.split('/')[2];expect(await db.messageVariant.count({where:{campaignId:id}})).toBe(3);const link=await db.referralLink.findFirstOrThrow({where:{campaignId:id}});const before=await db.trackedEvent.count({where:{linkCode:link.code}});await service.visit(link.code);expect(await db.trackedEvent.count({where:{linkCode:link.code}})).toBe(before+1);
 await db.trackedEvent.deleteMany({where:{linkCode:link.code}});await db.referralLink.deleteMany({where:{campaignId:id}});await db.messageVariant.deleteMany({where:{campaignId:id}});await db.campaign.delete({where:{id}});
});
