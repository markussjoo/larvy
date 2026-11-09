import {env} from 'cloudflare:workers';
import {getTeacherUser} from '../../../teacher-auth';
import {getStudentSession} from '../../../student-session';
export const dynamic='force-dynamic';
const missing=()=>new Response('Filen hittades inte eller saknar åtkomst.',{status:404,headers:{'Cache-Control':'no-store'}});
export async function GET(req:Request,{params}:{params:Promise<{id:string}>}){
 const {id}=await params;if(!/^[a-f0-9-]{36}$/.test(id)||!env.BUCKET)return missing();
 const user=await getTeacherUser(),session=await getStudentSession(req);if(!user&&!session)return missing();
 const file=await env.BUCKET.head('lesson-files/'+id);if(!file?.customMetadata?.owner)return missing();
 const owner=file.customMetadata.owner;
 if(user?.userId!==owner){
  if(!env.DB)return missing();
  const access=await env.DB.prepare(`SELECT p.id FROM plans p JOIN materials m ON m.id=p.material_id WHERE m.owner=? AND p.owner=m.owner AND instr(m.body,?)>0 AND (p.student_id=? OR EXISTS (SELECT 1 FROM invitations i WHERE i.student_id=p.student_id AND i.owner=m.owner AND i.used_by=?)) LIMIT 1`).bind(owner,id,session?.studentId||'',user?.userId||'').first();
  if(!access)return missing();
 }
 const object=await env.BUCKET.get('lesson-files/'+id);if(!object)return missing();
 const encodedName=file.customMetadata.name||'fil';
 return new Response(object.body,{headers:{'Content-Type':'application/octet-stream','Content-Disposition':`attachment; filename="download"; filename*=UTF-8''${encodedName.replace(/'/g,'%27')}`,'Content-Length':String(object.size),'X-Content-Type-Options':'nosniff','Content-Security-Policy':"sandbox; default-src 'none'",'Cache-Control':'private, no-store'}});
}
