import {NextRequest,NextResponse} from 'next/server';
import {service} from '../../../lib';
export async function GET(req:NextRequest,{params}:{params:Promise<{code:string}>}){const {code}=await params;try{await service.visit(code);return NextResponse.redirect(new URL('/?ref='+encodeURIComponent(code),req.url));}catch{return NextResponse.json({error:'Unknown demo referral'},{status:404});}}
