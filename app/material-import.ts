import {storeDemoFile,type LessonFile,validLessonFile} from './lesson-files';
import {loadPdfReader,readPdfText,PDF_IMPORT_VERSION} from './pdf-import';
export type CollectedMaterial={name:string;attachment:LessonFile;text?:string;warning?:string};
export async function uploadMaterial(file:File,demo:boolean):Promise<LessonFile>{
 if(file.size>15*1024*1024)throw Error('Filen får vara högst 15 MB.');
 if(demo)return storeDemoFile(file);
 const form=new FormData();form.append('file',file);const response=await fetch('/api/lesson-files',{method:'POST',body:form});let data:any;
 try{data=await response.json()}catch{throw Error('Servern kunde inte ta emot filen. Försök igen.')}
 if(!response.ok)throw Error(data.error||'Filen kunde inte laddas upp.');
 if(!validLessonFile(data.file))throw Error('Servern returnerade inte en giltig bilaga.');return data.file;
}
export async function extractMaterialText(file:File,onProgress:(message:string)=>void=()=>{}):Promise<string|null>{
 const ext=file.name.split('.').pop()?.toLowerCase(),header=new TextDecoder().decode(await file.slice(0,5).arrayBuffer());
 let text:string;
 if(ext==='pdf'||file.type==='application/pdf'||header==='%PDF-'){
  onProgress('Läser PDF…');const reader=await loadPdfReader();reader.GlobalWorkerOptions.workerSrc='/pdf-worker-'+PDF_IMPORT_VERSION+'.mjs';
  text=await readPdfText(new Uint8Array(await file.arrayBuffer()),reader,(page,total)=>onProgress(`Läser PDF · sida ${page} av ${total}`),{onOcrProgress:onProgress});
 }else if(ext==='docx'||file.type==='application/vnd.openxmlformats-officedocument.wordprocessingml.document'){
  onProgress('Läser Word-dokument…');const mammoth=await import('mammoth');text=(await mammoth.extractRawText({arrayBuffer:await file.arrayBuffer()})).value;
 }else if(['txt','md','csv','tsv','json','xml','log'].includes(ext||'')){
  onProgress('Läser text…');text=await file.text();
 }else if(ext==='html'||ext==='htm'){
  const doc=new DOMParser().parseFromString(await file.text(),'text/html');doc.querySelectorAll('script,style,nav,footer').forEach(n=>n.remove());text=doc.body.textContent||'';
 }else return null;
 text=text.normalize('NFC').replace(/\r\n?/g,'\n').replace(/\n{4,}/g,'\n\n').trim();
 if(!text)throw Error('Ingen läsbar text hittades.');
 if(text.length>150000)throw Error('Texten är för lång för en lektion. Dela upp materialet.');return text;
}
export async function collectMaterial(file:File,demo:boolean,onProgress:(message:string)=>void):Promise<CollectedMaterial>{
 onProgress('Laddar upp originalfil…');const attachment=await uploadMaterial(file,demo);
 try{const text=await extractMaterialText(file,onProgress);return {name:file.name,attachment,...(text?{text}:{})}}
 catch(error){return {name:file.name,attachment,warning:'Originalfilen är sparad som bilaga. '+(error instanceof Error?error.message:'Texttolkningen kunde inte slutföras.')}}
}
