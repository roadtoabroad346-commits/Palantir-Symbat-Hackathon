import {PrismaLibSQL} from '@prisma/adapter-libsql';
import {PrismaClient} from './generated/client';
import {makeService, type Database} from '@startify/shared/server';
const globalDb=globalThis as unknown as {db?:PrismaClient};
export const db=globalDb.db??new PrismaClient({adapter:new PrismaLibSQL({url:`file:${process.cwd().endsWith("challenge-platform")?process.cwd():process.cwd()+"/apps/challenge-platform"}/prisma/demo.db`})});
if(process.env.NODE_ENV!=='production')globalDb.db=db;
export const service=makeService('challenge-platform',db as unknown as Database);
