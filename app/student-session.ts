import {getDb} from '../db';
import {studentSessions} from '../db/schema';
import {and,eq,gt} from 'drizzle-orm';
export const cookieName='__Host-larvy-student';
export async function digest(value:string){return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value)))).map(x=>x.toString(16).padStart(2,'0')).join('')}
export function cookieToken(req:Request){const raw=req.headers.get('cookie')?.split(';').map(s=>s.trim()).find(s=>s.startsWith(cookieName+'='))?.slice(cookieName.length+1)||'';return /^[a-f0-9]{64}$/.test(raw)?raw:''}
export async function getStudentSession(req:Request){const token=cookieToken(req);if(!token)return null;const [session]=await getDb().select().from(studentSessions).where(and(eq(studentSessions.tokenHash,await digest(token)),gt(studentSessions.expires,new Date().toISOString())));return session||null}
export function sessionCookie(token:string,maxAge=2592000){return `${cookieName}=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`}
