// A small, validated document format. Raw imported HTML is never rendered.
export const RICH_PREFIX='LARVY_LESSON_V1:';
export const MAX_LESSON_BYTES=650000;
export type LessonNode={tag:string;text?:string;children?:LessonNode[];hand?:boolean;src?:string;alt?:string};
const tags=new Set(['p','div','br','strong','b','em','i','u','s','h2','h3','ul','ol','li','blockquote','span','font','img','figure','figcaption']);
export function validImage(src:unknown):src is string{return typeof src==='string'&&src.length<=220000&&/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(src)}
export function parseLesson(body:string):LessonNode[]|null{
 if(!body.startsWith(RICH_PREFIX))return null;
 try{const nodes=JSON.parse(body.slice(RICH_PREFIX.length));let count=0,images=0;const check=(n:any,depth:number):boolean=>{if(++count>30000||depth>40||!n||typeof n!=='object')return false;if(n.tag==='#text')return typeof n.text==='string';if(!tags.has(n.tag)||n.hand!==undefined&&typeof n.hand!=='boolean')return false;if(n.tag==='img')return ++images<=3&&validImage(n.src)&&typeof n.alt==='string'&&n.alt.length<=250;return Array.isArray(n.children)&&n.children.every((c:any)=>check(c,depth+1))};return Array.isArray(nodes)&&nodes.every(n=>check(n,0))?nodes:null}catch{return null}
}
export function encodeLesson(nodes:LessonNode[]){return RICH_PREFIX+JSON.stringify(nodes)}
export function lessonText(body:string){const nodes=parseLesson(body);if(!nodes)return body;const read=(n:LessonNode):string=>n.tag==='#text'?n.text||'':n.tag==='img'?'':n.tag==='br'?'\n':(n.children||[]).map(read).join('')+(['p','div','h2','h3','li'].includes(n.tag)?'\n':'');return nodes.map(read).join('')}
export function hasLessonContent(body:string){const nodes=parseLesson(body);return !!lessonText(body).trim()||!!nodes?.some(function image(n):boolean{return n.tag==='img'||!!n.children?.some(image)})}
export function appendLessonText(body:string,text:string){const nodes=parseLesson(body);return nodes?encodeLesson([...nodes,{tag:'p',children:[{tag:'#text',text}]}]):body.trim()?body.trimEnd()+'\n\n'+text:text}
export function validateLesson(body:string){return new TextEncoder().encode(body).length<=MAX_LESSON_BYTES&&lessonText(body).length<=150000&&(!body.startsWith(RICH_PREFIX)||parseLesson(body)!==null)}
