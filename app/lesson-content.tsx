import LessonFileLink from './lesson-file-link';
import {createElement} from 'react';
import {parseLesson,type LessonNode} from './lesson-format';
export default function LessonContent({body}:{body:string}){
 const nodes=parseLesson(body);
 const render=(n:LessonNode,key:number):any=>n.tag==='#text'?n.text:n.tag==='file'?<LessonFileLink key={key} file={n.file!}/>:n.tag==='img'?<img key={key} src={n.src} alt={n.alt||''}/>:createElement(n.tag==='font'?'span':n.tag,{key,...(n.hand!==undefined?{className:n.hand?'lesson-handwriting':'lesson-normal'}:{})},n.tag==='br'?undefined:n.children?.map(render));
 return <div className="lesson-content">{nodes?nodes.map(render):body}</div>
}
