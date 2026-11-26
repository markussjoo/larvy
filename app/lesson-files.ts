export type LessonFile={id:string;name:string;size:number;demo?:boolean};
const MAX_MEDIA_SIZE=50*1024*1024;
export function validLessonFile(file:any):file is LessonFile{return !!file&&typeof file.id==='string'&&/^[a-f0-9-]{36}$/.test(file.id)&&typeof file.name==='string'&&file.name.length>0&&file.name.length<=250&&Number.isSafeInteger(file.size)&&file.size>=0&&file.size<=MAX_MEDIA_SIZE&&(file.demo===undefined||typeof file.demo==='boolean')}
const memoryDemoFiles=new Map<string,Blob>();
function openFiles():Promise<IDBDatabase>{return new Promise((resolve,reject)=>{const req=indexedDB.open('larvy-demo-files',1);req.onupgradeneeded=()=>req.result.createObjectStore('files');req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(Error('Webbläsaren kan inte spara bilagor. Kontrollera lagringsinställningarna.'))})}
export async function storeDemoFile(file:File):Promise<LessonFile>{
 const id=crypto.randomUUID();
 const name=file.name.slice(0,250)||'fil';
 memoryDemoFiles.set(id,file);
 try{
  const db=await openFiles();
  try{
   await new Promise<void>((resolve,reject)=>{const tx=db.transaction('files','readwrite');tx.objectStore('files').put(file,id);tx.oncomplete=()=>resolve();tx.onerror=()=>reject(Error('Filen kunde inte sparas i webbläsaren.'));tx.onabort=()=>reject(Error('Filen kunde inte sparas.'))});
  }finally{db.close()}
 }catch{}
 return {id,name,size:file.size,demo:true};
}
export async function readDemoFile(id:string):Promise<Blob>{
 const mem=memoryDemoFiles.get(id);
 if(mem)return mem;
 const db=await openFiles();
 try{
  return await new Promise((resolve,reject)=>{const req=db.transaction('files').objectStore('files').get(id);req.onsuccess=()=>req.result instanceof Blob?resolve(req.result):reject(Error('Demofilen finns inte i den här webbläsaren. Ladda upp den igen.'));req.onerror=()=>reject(Error('Filen kunde inte öppnas.'))});
 }finally{db.close()}
}
