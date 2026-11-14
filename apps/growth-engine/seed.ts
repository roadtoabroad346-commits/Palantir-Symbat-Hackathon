import {db,service} from './lib';
service.seed().then(()=>console.log('Deterministic demo seed ready')).finally(()=>db.$disconnect());
