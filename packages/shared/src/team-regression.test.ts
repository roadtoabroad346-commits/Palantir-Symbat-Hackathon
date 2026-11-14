import {describe,expect,it} from 'vitest';
import {validateTeam} from './index';

describe('team member identity boundaries',()=>{
  it.each(['','   ','\t\n'])('rejects an empty or whitespace-only nickname %j',nickname=>{
    expect(()=>validateTeam([
      {nickname,studentRef:'opaque-a'},
      {nickname:'OrbitSafe',studentRef:'opaque-b'},
    ])).toThrow();
  });

  it.each(['','   ',undefined])('rejects a missing opaque studentRef %j',studentRef=>{
    const members=[
      {nickname:'NovaSafe',studentRef},
      {nickname:'OrbitSafe',studentRef:'opaque-b'},
    ] as unknown as Parameters<typeof validateTeam>[0];
    expect(()=>validateTeam(members)).toThrow();
  });
});
