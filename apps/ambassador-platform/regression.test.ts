import {afterAll, expect, it} from 'vitest';
import {randomUUID} from 'node:crypto';
import {db, service} from './lib';

afterAll(() => db.$disconnect());

it('resumes future referral points after admin resolves a historical burst', async () => {
  const ambassadorId = `test-review-${randomUUID()}`;
  const flagId = randomUUID();
  try {
    await db.ambassador.create({data: {
      id: ambassadorId, nickname: 'OrbitReview42', country: 'KZ', city: 'Astana', age18Confirmed: true,
    }});
    await db.referralLink.create({data: {id: randomUUID(), ambassadorId, code: `TEST-${randomUUID()}`}});
    const burstAt = new Date(Date.now() - 10_000);
    await db.referralEvent.createMany({data: Array.from({length: 20}, (_, i) => ({
      id: randomUUID(), ambassadorId, studentRef: randomUUID(), nickname: `ReviewOrbit${i}`,
      type: 'registered', ts: burstAt,
    }))});
    await db.fraudFlag.create({data: {id: flagId, ambassadorId, reason: 'Reviewed demo burst'}});

    await service.mutate('resolve', {flagId}, 'admin');
    await service.mutate('simulate', {ambassadorId, n: 1}, 'ambassador');

    const ledger = await db.pointsLedger.findMany({where: {ambassadorId}});
    expect(ledger.reduce((total, row) => total + row.delta, 0)).toBe(1);
    expect(await db.fraudFlag.count({where: {ambassadorId, resolved: false}})).toBe(0);
  } finally {
    await db.pointsLedger.deleteMany({where: {ambassadorId}});
    await db.referralEvent.deleteMany({where: {ambassadorId}});
    await db.fraudFlag.deleteMany({where: {ambassadorId}});
    await db.referralLink.deleteMany({where: {ambassadorId}});
    await db.ambassador.deleteMany({where: {id: ambassadorId}});
  }
});
