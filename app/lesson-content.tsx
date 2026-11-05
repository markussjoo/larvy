import LessonFileLink from './lesson-file-link';
import {createElement} from 'react';
import {parseLesson,type LessonNode,type Answers} from './lesson-format';
export default function LessonContent({body,answers={},onAnswer,readOnly=false}:{body:string;answers?:Answers;onAnswer?:(id:string,value:string|string[])=>void;readOnly?:boolean}){
 const nodes=parseLesson(body);
 const render=(n:LessonNode,key:number):any=>{if(n.tag==='exercise'&&n.exercise){const q=n.exercise,v=answers[q.id];return <fieldset className="lesson-exercise" key={key}><legend>{q.prompt}</legend>{q.type==='text'?<textarea aria-label={q.prompt} placeholder={onAnswer?'Skriv ditt svar här…':'Textfält för elevens svar'} maxLength={20000} value={typeof v==='string'?v:''} disabled={!onAnswer||readOnly} onChange={e=>onAnswer?.(q.id,e.target.value)}/>:q.options.map(option=><label className="lesson-option" key={option}><input type="checkbox" checked={Array.isArray(v)&&v.includes(option)} disabled={!onAnswer||readOnly} onChange={e=>{const selected=Array.isArray(v)?v:[];onAnswer?.(q.id,e.target.checked?[...selected,option]:selected.filter(x=>x!==option))}}/>{option}</label>)}</fieldset>}return n.tag==='#text'?n.text:n.tag==='file'?<LessonFileLink key={key} file={n.file!}/>:n.tag==='img'?<img key={key} src={n.src} alt={n.alt||''}/>:createElement(n.tag==='font'?'span':n.tag,{key,...(n.hand!==undefined?{className:n.hand?'lesson-handwriting':'lesson-normal'}:{})},n.tag==='br'?undefined:n.children?.map(render))};
 return <div className="lesson-content">{nodes?nodes.map(render):body}</div>
}
