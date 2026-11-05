import {validLessonFile,type LessonFile} from './lesson-files';
// A small, validated document format. Raw imported HTML is never rendered.
export const RICH_PREFIX='LARVY_LESSON_V1:';
export const MAX_LESSON_BYTES=650000;
export type Exercise={id:string;type:'text'|'choice';prompt:string;options:string[]};
export type Answers=Record<string,string|string[]>;
export function validExercise(e:any):e is Exercise{return !!e&&typeof e.id==='string'&&/^[a-zA-Z0-9_-]{1,80}$/.test(e.id)&&['text','choice'].includes(e.type)&&typeof e.prompt==='string'&&!!e.prompt.trim()&&e.prompt.length<=2000&&Array.isArray(e.options)&&e.options.length<=20&&e.options.every((x:any)=>typeof x==='string'&&!!x.trim()&&x.length<=300)&&new Set(e.options).size===e.options.length&&(e.type==='text'?e.options.length===0:e.options.length>=2)}
export function lessonExercises(body:string):Exercise[]{const out:Exercise[]=[];const walk=(n:LessonNode)=>{if(n.exercise)out.push(n.exercise);n.children?.forEach(walk)};parseLesson(body)?.forEach(walk);return out}
export function validAnswers(body:string,a:any){if(!a||typeof a!=='object'||Array.isArray(a))return false;const questions=lessonExercises(body);return Object.keys(a).length<=questions.length&&Object.entries(a).every(([id,v])=>{const q=questions.find(q=>q.id===id);return !!q&&(q.type==='text'?typeof v==='string'&&v.length<=20000:Array.isArray(v)&&v.length<=q.options.length&&new Set(v).size===v.length&&v.every(x=>typeof x==='string'&&q.options.includes(x)))})}
export const isLesson=(kind:string)=>kind==='Lektion'||kind==='Uppgift';
export type LessonNode={tag:string;text?:string;children?:LessonNode[];hand?:boolean;src?:string;alt?:string;file?:LessonFile;exercise?:Exercise};
const tags=new Set(['p','div','br','strong','b','em','i','u','s','h2','h3','ul','ol','li','blockquote','span','font','img','figure','figcaption','file','exercise']);
export function validImage(src:unknown):src is string{return typeof src==='string'&&src.length<=220000&&/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(src)}
export function parseLesson(body:string):LessonNode[]|null{
 if(!body.startsWith(RICH_PREFIX))return null;
 try{const nodes=JSON.parse(body.slice(RICH_PREFIX.length));let count=0,images=0;const ids=new Set<string>();const check=(n:any,depth:number):boolean=>{if(++count>30000||depth>40||!n||typeof n!=='object')return false;if(n.tag==='#text')return typeof n.text==='string';if(!tags.has(n.tag)||n.hand!==undefined&&typeof n.hand!=='boolean')return false;if(n.tag==='exercise'){if(!validExercise(n.exercise)||ids.has(n.exercise.id)||ids.size>=100)return false;ids.add(n.exercise.id);return true}if(n.tag==='file')return validLessonFile(n.file);if(n.tag==='img')return ++images<=3&&validImage(n.src)&&typeof n.alt==='string'&&n.alt.length<=250;return Array.isArray(n.children)&&n.children.every((c:any)=>check(c,depth+1))};return Array.isArray(nodes)&&nodes.every(n=>check(n,0))?nodes:null}catch{return null}
}
export function encodeLesson(nodes:LessonNode[]){return RICH_PREFIX+JSON.stringify(nodes)}
export function lessonText(body:string){const nodes=parseLesson(body);if(!nodes)return body;const read=(n:LessonNode):string=>n.tag==='#text'?n.text||'':n.tag==='exercise'?n.exercise?.prompt||'':n.tag==='file'?n.file?.name||'':n.tag==='img'?'':n.tag==='br'?'\n':(n.children||[]).map(read).join('')+(['p','div','h2','h3','li'].includes(n.tag)?'\n':'');return nodes.map(read).join('')}
export function hasLessonContent(body:string){const nodes=parseLesson(body);return !!lessonText(body).trim()||!!nodes?.some(function image(n):boolean{return n.tag==='img'||n.tag==='file'||!!n.children?.some(image)})}
export function appendLessonText(body:string,text:string){const nodes=parseLesson(body);return nodes?encodeLesson([...nodes,{tag:'p',children:[{tag:'#text',text}]}]):body.trim()?body.trimEnd()+'\n\n'+text:text}
export function validateLesson(body:string){return new TextEncoder().encode(body).length<=MAX_LESSON_BYTES&&lessonText(body).length<=150000&&(!body.startsWith(RICH_PREFIX)||parseLesson(body)!==null)}

export function appendLessonFile(body:string,file:LessonFile){return encodeLesson([...(parseLesson(body)||(body?[{tag:'p',children:[{tag:'#text',text:body}]}]:[])),{tag:'file',file}])}

export function materialLessonBody(kind:string,body:string){return kind==='Uppgift'&&!lessonExercises(body).length?encodeLesson([...(parseLesson(body)||[{tag:'p',children:[{tag:'#text',text:body}]}]),{tag:'exercise',exercise:{id:'legacy-task',type:'text',prompt:'Skriv ditt svar på uppgiften',options:[]}}]):body}
