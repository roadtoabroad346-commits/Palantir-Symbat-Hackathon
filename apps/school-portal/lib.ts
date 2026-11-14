import {PrismaLibSQL} from '@prisma/adapter-libsql';
import {PrismaClient} from './generated/client';
import {makeService, type Database} from '@startify/shared/server';
const globalDb=globalThis as unknown as {db?:PrismaClient};
export const db=globalDb.db??new PrismaClient({adapter:new PrismaLibSQL({url:`file:${process.cwd().endsWith("school-portal")?process.cwd():process.cwd()+"/apps/school-portal"}/prisma/demo.db`})});
if(process.env.NODE_ENV!=='production')globalDb.db=db;
export const service=makeService('school-portal',db as unknown as Database);
