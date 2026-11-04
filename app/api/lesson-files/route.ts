import {env} from 'cloudflare:workers';
import {getTeacherUser} from '../../teacher-auth';
export const dynamic='force-dynamic';
const MAX=15*1024*1024;
export async function POST(req:Request){
 const user=await getTeacherUser();if(!user)return Response.json({error:'Lärarinloggning krävs'}, {status:401});
 if(req.headers.get('origin')!==new URL(req.url).origin)return Response.json({error:'Otillåtet ursprung'},{status:403});
 if(!env.BUCKET)return Response.json({error:'Fillagringen är inte tillgänglig. Försök igen senare.'},{status:503});
 if(Number(req.headers.get('content-length')||0)>MAX+65536)return Response.json({error:'Filen får vara högst 15 MB.'},{status:413});
 try{
  const data=await req.formData(),file=data.get('file');
  if(!file||typeof file==='string'||typeof file.arrayBuffer!=='function')return Response.json({error:'Välj en fil.'},{status:400});
  if(file.size>MAX)return Response.json({error:'Filen får vara högst 15 MB.'},{status:413});
  const bytes=await file.arrayBuffer();if(bytes.byteLength>MAX)return Response.json({error:'Filen får vara högst 15 MB.'},{status:413});
  const id=crypto.randomUUID(),name=(file.name||'fil').replace(/[\x00-\x1f\x7f]/g,'').slice(0,250)||'fil';
  await env.BUCKET.put('lesson-files/'+id,bytes,{httpMetadata:{contentType:'application/octet-stream'},customMetadata:{owner:user.userId,name:encodeURIComponent(name)}});
  return Response.json({file:{id,name,size:bytes.byteLength}},{headers:{'Cache-Control':'no-store'}});
 }catch{return Response.json({error:'Filen kunde inte laddas upp. Försök igen.'},{status:400})}
}
