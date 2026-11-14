import {cookies} from 'next/headers';
import {Dashboard} from '@startify/shared/ui';
import {service} from '../../lib';
export const dynamic='force-dynamic';
export default async function Page({params}:{params:Promise<{path?:string[]}>}){const {path=[]}=await params;const jar=await cookies();return <Dashboard initial={await service.view('/'+path.join('/'),jar.get('demo-role')?.value)} />;}
