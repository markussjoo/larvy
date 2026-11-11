import {validLessonFile,type LessonFile} from './lesson-files';
import {parseWorkbookTextToNodes} from './workbook-parser';
import {convertAiJsonToLessonNodes,parseRawTextToAiWorkbook} from './ai-pdf-parser';

// A small, validated document format. Raw imported HTML is never rendered.
export const RICH_PREFIX='LARVY_LESSON_V1:';
export const MAX_LESSON_BYTES=2500000;

export type TableData = {
  headers: string[];
  rows: { cells: string[]; editable: boolean[] }[];
};

export type Exercise = {
  id: string;
  type: 'text' | 'choice' | 'gap' | 'table';
  prompt: string;
  options: string[];
  correctOptions?: string[];
  tableData?: TableData;
};

export type Answers = Record<string, string | string[]>;

export function validExercise(e: any): e is Exercise {
  if (!e || typeof e.id !== 'string' || !/^[a-zA-Z0-9_-]{1,80}$/.test(e.id)) return false;
  if (!['text', 'choice', 'gap', 'table'].includes(e.type)) return false;
  if (typeof e.prompt !== 'string' || !e.prompt.trim() || e.prompt.length > 2000) return false;
  if (!Array.isArray(e.options) || e.options.length > 100) return false;
  if (!e.options.every((x: any) => typeof x === 'string' && x.length <= 1000)) return false;

  if (e.type === 'text') {
    return e.options.length === 0 && (!e.correctOptions || (Array.isArray(e.correctOptions) && e.correctOptions.length === 0));
  }
  if (e.type === 'choice') {
    return e.options.length >= 2 && new Set(e.options).size === e.options.length && (
      e.correctOptions === undefined ||
      (Array.isArray(e.correctOptions) && e.correctOptions.length <= e.options.length &&
       new Set(e.correctOptions).size === e.correctOptions.length &&
       e.correctOptions.every((x: any) => typeof x === 'string' && e.options.includes(x)))
    );
  }
  if (e.type === 'gap') {
    return e.options.length >= 1 && (
      e.correctOptions === undefined ||
      (Array.isArray(e.correctOptions) && e.correctOptions.every((x: any) => typeof x === 'string'))
    );
  }
  if (e.type === 'table') {
    if (!e.tableData || !Array.isArray(e.tableData.headers) || !Array.isArray(e.tableData.rows)) return false;
    const colCount = e.tableData.headers.length;
    if (colCount < 1 || colCount > 10 || e.tableData.rows.length > 100) return false;
    return e.tableData.rows.every((r: any) =>
      Array.isArray(r.cells) && r.cells.length === colCount &&
      Array.isArray(r.editable) && r.editable.length === colCount
    );
  }
  return false;
}

export function lessonExercises(body:string):Exercise[]{const out:Exercise[]=[];const walk=(n:LessonNode)=>{if(n.exercise)out.push(n.exercise);n.children?.forEach(walk)};parseLesson(body)?.forEach(walk);return out}

export function validAnswers(body:string,a:any){
  if(!a||typeof a!=='object'||Array.isArray(a))return false;
  const questions=lessonExercises(body);
  return Object.keys(a).length<=questions.length&&Object.entries(a).every(([id,v])=>{
    const q=questions.find(q=>q.id===id);
    if (!q) return false;
    if (q.type === 'text') {
      return typeof v === 'string' && v.length <= 20000;
    }
    if (q.type === 'choice') {
      return Array.isArray(v) && v.length <= q.options.length && new Set(v).size === v.length && v.every(x => typeof x === 'string' && q.options.includes(x));
    }
    if (q.type === 'gap') {
      return Array.isArray(v) && v.every(x => typeof x === 'string' && x.length <= 2000);
    }
    if (q.type === 'table') {
      return Array.isArray(v) && v.every(x => typeof x === 'string' && x.length <= 1000);
    }
    return false;
  });
}

/** Normalize answer text for robust, tolerant comparison */
export function normalizeAnswerText(text: string): string {
  return (text || '')
    .trim()
    .toLowerCase()
    .replace(/[.,/#!$%^&*;:{}=\-_`~()?]/g, '') // strip trailing/leading punctuation
    .replace(/\s+/g, ' ');
}

export function matchesExpectedAnswer(userAnswer: string, expectedVariantsString: string): boolean {
  const user = normalizeAnswerText(userAnswer);
  if (!user) return false;
  // Variants can be separated by |, /, or semicolon
  const variants = expectedVariantsString
    .split(/[|/;]/)
    .map(v => normalizeAnswerText(v))
    .filter(Boolean);
  
  if (variants.includes(user)) return true;
  // Also support matching if the user wrote with or without Swedish leading articles (t.ex. "en mur" vs "mur")
  return variants.some(v => {
    const stripArticle = (s: string) => s.replace(/^(ett|en|den|det|de|flera)\s+/i, '').trim();
    return stripArticle(v) === stripArticle(user);
  });
}

export const isLesson=(kind:string)=>kind==='Lektion'||kind==='Uppgift';
export const isInteractiveMaterial=(kind:string)=>isLesson(kind)||kind==='Prov';

export type AutoGradeResult={totalGradable:number;correctCount:number;totalChoice:number;totalText:number;details:Record<string,{correct:boolean;expected:string[];given:string[]}>};

export function gradeLesson(body:string,answers:Answers):AutoGradeResult{
  const exercises=lessonExercises(body);
  let totalGradable=0,correctCount=0,totalChoice=0,totalText=0;
  const details:AutoGradeResult['details']={};
  for(const q of exercises){
    if(q.type==='text'){totalText++;continue}
    if(q.type==='choice'){
      totalChoice++;
      if(q.correctOptions&&q.correctOptions.length>0){
        totalGradable++;
        const given=Array.isArray(answers[q.id])?(answers[q.id] as string[]):[];
        const expected=q.correctOptions;
        const isCorrect=given.length===expected.length&&expected.every(opt=>given.includes(opt));
        if(isCorrect)correctCount++;
        details[q.id]={correct:isCorrect,expected,given};
      }
      continue;
    }
    if(q.type==='gap'){
      if(q.correctOptions&&q.correctOptions.some(opt=>!!opt.trim())){
        const given=Array.isArray(answers[q.id])?(answers[q.id] as string[]):[];
        const expected=q.correctOptions;
        expected.forEach((exp, idx) => {
          if (!exp.trim()) return;
          totalGradable++;
          const userAns = given[idx] || '';
          const isRowCorrect = matchesExpectedAnswer(userAns, exp);
          if (isRowCorrect) correctCount++;
        });
        const isAllCorrect = expected.every((exp, idx) => {
          if (!exp.trim()) return true;
          const userAns = given[idx] || '';
          return matchesExpectedAnswer(userAns, exp);
        });
        details[q.id]={correct:isAllCorrect,expected,given};
      }
      continue;
    }
    if(q.type==='table'){
      if(q.correctOptions&&q.correctOptions.some(opt=>!!opt.trim())){
        const given=Array.isArray(answers[q.id])?(answers[q.id] as string[]):[];
        const expected=q.correctOptions;
        expected.forEach((exp, idx) => {
          if (!exp.trim()) return;
          totalGradable++;
          const userAns = given[idx] || '';
          if (matchesExpectedAnswer(userAns, exp)) correctCount++;
        });
        const isAllCorrect = expected.every((exp, idx) => {
          if (!exp.trim()) return true;
          const userAns = given[idx] || '';
          return matchesExpectedAnswer(userAns, exp);
        });
        details[q.id]={correct:isAllCorrect,expected,given};
      }
      continue;
    }
  }
  return {totalGradable,correctCount,totalChoice,totalText,details};
}

export function stripAnswerKey(body:string):string{
  const nodes=parseLesson(body);
  if(!nodes)return body;
  const clean=(n:LessonNode):LessonNode=>({
    ...n,
    ...(n.exercise?{
      exercise:{
        id:n.exercise.id,
        type:n.exercise.type,
        prompt:n.exercise.prompt,
        options:n.exercise.options,
        ...(n.exercise.tableData?{tableData:n.exercise.tableData}:{})
      }
    }:{}),
    ...(n.children?{children:n.children.map(clean)}:{}),
  });
  return encodeLesson(nodes.map(clean));
}

export type LessonNode={
  tag:string;
  text?:string;
  children?:LessonNode[];
  hand?:boolean;
  src?:string;
  alt?:string;
  file?:LessonFile;
  exercise?:Exercise;
};

const tags=new Set([
  'p','div','br','strong','b','em','i','u','s','h2','h3','ul','ol','li','blockquote','span','font','img','figure','figcaption','file','exercise',
  'table','thead','tbody','tr','th','td'
]);

export function validImage(src:unknown):src is string{return typeof src==='string'&&src.length<=500000&&/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(src)}

export function parseLesson(body:string):LessonNode[]|null{
  if(!body.startsWith(RICH_PREFIX))return null;
  try{
    const nodes=JSON.parse(body.slice(RICH_PREFIX.length));
    let count=0,images=0;
    const ids=new Set<string>();
    const check=(n:any,depth:number):boolean=>{
      if(++count>30000||depth>40||!n||typeof n!=='object')return false;
      if(n.tag==='#text')return typeof n.text==='string';
      if(!tags.has(n.tag)||n.hand!==undefined&&typeof n.hand!=='boolean')return false;
      if(n.tag==='exercise'){
        if(!validExercise(n.exercise)||ids.has(n.exercise.id)||ids.size>=100)return false;
        ids.add(n.exercise.id);
        return true;
      }
      if(n.tag==='file')return validLessonFile(n.file);
      if(n.tag==='img')return ++images<=12&&validImage(n.src)&&typeof n.alt==='string'&&n.alt.length<=250;
      return Array.isArray(n.children)&&n.children.every((c:any)=>check(c,depth+1));
    };
    return Array.isArray(nodes)&&nodes.every(n=>check(n,0))?nodes:null;
  }catch{
    return null;
  }
}

export function encodeLesson(nodes:LessonNode[]){return RICH_PREFIX+JSON.stringify(nodes)}

export function lessonText(body:string){
  const nodes=parseLesson(body);
  if(!nodes)return body;
  const read=(n:LessonNode):string=>
    n.tag==='#text'?n.text||'':
    n.tag==='exercise'?n.exercise?.prompt||'':
    n.tag==='file'?n.file?.name||'':
    n.tag==='img'?'':
    n.tag==='br'?'\n':
    (n.children||[]).map(read).join('')+(['p','div','h2','h3','li','tr'].includes(n.tag)?'\n':'');
  return nodes.map(read).join('');
}

export function hasLessonContent(body:string){
  const nodes=parseLesson(body);
  return !!lessonText(body).trim()||!!nodes?.some(function image(n):boolean{return n.tag==='img'||n.tag==='file'||n.tag==='exercise'||!!n.children?.some(image)});
}

export function appendLessonText(body: string, text: string) {
  // If text is JSON from AI or starts with { "exercises": ... }
  let newNodes: LessonNode[];
  const trimmed = text.trim();
  if (trimmed.startsWith('{') && trimmed.includes('"exercises"') || trimmed.startsWith('```json')) {
    const aiData = parseRawTextToAiWorkbook(trimmed);
    newNodes = convertAiJsonToLessonNodes(aiData);
  } else {
    // If text contains workbook patterns (blanks '____', tables '|', checkboxes '[ ]', chapters), parse into interactive workbook nodes!
    const hasWorkbookPatterns = /Kapitel\s+\d+|Språkvägen|____|\[\s*\]|\|\s*[^|]+\s*\|/i.test(text);
    newNodes = hasWorkbookPatterns
      ? parseWorkbookTextToNodes(text)
      : (text.split(/\r?\n\s*\r?\n/).map(p => p.trim()).filter(Boolean)).map(p => ({
          tag: "p" as const,
          children: [{ tag: "#text" as const, text: p }]
        }));
  }

  const existing = parseLesson(body);
  if (existing) {
    return encodeLesson([...existing, ...newNodes]);
  }
  if (body.trim()) {
    return encodeLesson([{ tag: "p", children: [{ tag: "#text", text: body.trim() }] }, ...newNodes]);
  }
  return encodeLesson(newNodes);
}

export function validateLesson(body:string){return new TextEncoder().encode(body).length<=MAX_LESSON_BYTES&&lessonText(body).length<=150000&&(!body.startsWith(RICH_PREFIX)||parseLesson(body)!==null)}

export function appendLessonFile(body:string,file:LessonFile){return encodeLesson([...(parseLesson(body)||(body?[{tag:'p',children:[{tag:'#text',text:body}]}]:[])),{tag:'file',file}])}

export function appendLessonImage(body: string, image: { src: string; alt?: string; width?: number; height?: number }): string {
  const existing = parseLesson(body) || (body ? [{ tag: "p" as const, children: [{ tag: "#text" as const, text: body }] }] : []);
  const imgNode: LessonNode = {
    tag: "img",
    src: image.src,
    alt: (image.alt || "").slice(0, 160)
  };
  return encodeLesson([...existing, imgNode]);
}

export function materialLessonBody(kind:string,body:string){return kind==='Uppgift'&&!lessonExercises(body).length?encodeLesson([...(parseLesson(body)||[{tag:'p',children:[{tag:'#text',text:body}]}]),{tag:'exercise',exercise:{id:'legacy-task',type:'text',prompt:'Skriv ditt svar på uppgiften',options:[]}}]):body}

export function lessonFiles(body:string):LessonFile[]{const files=new Map<string,LessonFile>();const walk=(nodes:LessonNode[])=>nodes.forEach(n=>{if(n.tag==='file'&&n.file)files.set(n.file.id,n.file);if(n.children)walk(n.children)});walk(parseLesson(body)||[]);return [...files.values()]}

export function removeLessonFiles(body:string,ids:string[]){const nodes=parseLesson(body);if(!nodes)return body;const selected=new Set(ids);const prune=(nodes:LessonNode[]):LessonNode[]=>nodes.filter(n=>n.tag!=='file'||!n.file||!selected.has(n.file.id)).map(n=>({...n,...(n.children?{children:prune(n.children)}:{})}));return encodeLesson(prune(nodes))}
