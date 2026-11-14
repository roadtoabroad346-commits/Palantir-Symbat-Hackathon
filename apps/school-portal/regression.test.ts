import {afterAll, expect, it} from 'vitest';
import {randomUUID} from 'node:crypto';
import {db, service} from './lib';

afterAll(() => db.$disconnect());

it('uses the class owning school for metrics and navigation when opening a class directly', async () => {
  const schoolId = `test-school-${randomUUID()}`;
  const classId = `test-class-${randomUUID()}`;
  try {
    await db.school.create({data: {
      id: schoolId, name: 'orbit-school', country: 'UZ', city: 'Tashkent',
      type: 'club', status: 'pilot', consentConfirmed: true,
    }});
    await db.classGroup.create({data: {
      id: classId, schoolId, name: 'orbit-club', gradeRange: '7–9', code: `TEST-${randomUUID()}`, active: true,
    }});
    await db.studentEntry.create({data: {
      id: randomUUID(), classId, nickname: 'NovaReview42', studentRef: randomUUID(), stage: 7, status: 'started',
    }});

    const view = await service.view(`/classes/${classId}`, 'teacher');

    expect(view.extra?.selection).toBe(schoolId);
    expect(view.metrics.find(metric => metric.label === 'Ученики школы|School students')?.value).toBe(1);
    expect(view.metrics.find(metric => metric.label === 'Начаты|Started')?.value).toBe(1);
  } finally {
    await db.studentEntry.deleteMany({where: {classId}});
    await db.classGroup.deleteMany({where: {id: classId}});
    await db.school.deleteMany({where: {id: schoolId}});
  }
});
