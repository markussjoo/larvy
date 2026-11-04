'use client';
import {useEffect,useRef,useState} from 'react';
import {validLessonFile} from './lesson-files';
import {encodeLesson,parseLesson,validImage,validateLesson,type LessonNode} from './lesson-format';
const allowed=new Set(['p','div','br','strong','b','em','i','u','s','h2','h3','ul','ol','li','blockquote','span','font','figure','figcaption']);
function fromDOM(root:Node):LessonNode[]{return Array.from(root.childNodes).flatMap((node):LessonNode[]=>{
 if(node.nodeType===3)return [{tag:'#text',text:node.textContent||''}];if(node.nodeType!==1)return [];
 const el=node as HTMLElement,tag=el.tagName.toLowerCase();if(el.dataset.lessonFile){try{const file=JSON.parse(el.dataset.lessonFile);if(validLessonFile(file))return [{tag:'file',file}]}catch{}return []}if(tag==='img')return validImage((el as HTMLImageElement).src)?[{tag:'img',src:(el as HTMLImageElement).src,alt:(el as HTMLImageElement).alt.slice(0,250)}]:[];
 if(['script','style','iframe','object'].includes(tag))return [];
 const children=fromDOM(el);if(!allowed.has(tag))return children;
 const hand=el.classList.contains('lesson-handwriting')||/LarvyHand/i.test(el.getAttribute('face')||el.style.fontFamily);
 return [{tag,children,...(hand?{hand:true}:tag==='font'||!!el.style.fontFamily||el.classList.contains('lesson-normal')?{hand:false}:{})}];
})}
function fill(root:HTMLElement,body:string){root.replaceChildren();const nodes=parseLesson(body);if(!nodes){root.textContent=body;return}const build=(n:LessonNode):Node=>{if(n.tag==='#text')return document.createTextNode(n.text||'');if(n.tag==='file'){const item=document.createElement('span');item.dataset.lessonFile=JSON.stringify(n.file);item.contentEditable='false';item.className='lesson-file-attachment';item.textContent='▤ '+n.file!.name+' · Bilaga';return item}const el=document.createElement(n.tag==='font'?'span':n.tag);if(n.hand!==undefined)el.className=n.hand?'lesson-handwriting':'lesson-normal';if(n.tag==='img'){(el as HTMLImageElement).src=n.src!;(el as HTMLImageElement).alt=n.alt||''}else n.children?.forEach(c=>el.appendChild(build(c)));return el};nodes.forEach(n=>root.appendChild(build(n)))}
export default function LessonEditor({value,onChange,disabled}:{value:string;onChange:(value:string)=>void;disabled:boolean}){
 const editor=useRef<HTMLDivElement>(null),lastValue=useRef(''),selection=useRef<Range|null>(null),imageInput=useRef<HTMLInputElement>(null),selectedImage=useRef<HTMLImageElement|null>(null);
 const [error,setError]=useState(''),[imageBusy,setImageBusy]=useState(false),[hasImage,setHasImage]=useState(false);
 useEffect(()=>{if(editor.current&&value!==lastValue.current){fill(editor.current,value);lastValue.current=value;selection.current=null;selectedImage.current=null;setHasImage(false)}},[value]);
 function remember(){const s=window.getSelection();if(s?.rangeCount&&editor.current?.contains(s.anchorNode))selection.current=s.getRangeAt(0).cloneRange()}
 function restore(){remember();editor.current?.focus();const s=window.getSelection();if(selection.current&&editor.current?.contains(selection.current.commonAncestorContainer)){s?.removeAllRanges();s?.addRange(selection.current)}}
 function emit(){if(!editor.current)return;const body=encodeLesson(fromDOM(editor.current));if(!validateLesson(body)){setError('Lektionen är för stor. Ta bort en bild eller korta texten innan du sparar.')}else setError('');lastValue.current=body;onChange(body);remember()}
 function command(name:string,arg?:string){restore();document.execCommand(name,false,arg);emit()}
 function font(hand:boolean){restore();const s=window.getSelection();if(!s||s.isCollapsed||!editor.current?.contains(s.anchorNode)){setError('Markera först texten som ska få ett annat typsnitt.');return}command('fontName',hand?'LarvyHand':'Arial')}
 async function upload(file:File){setImageBusy(true);setError('');try{
  if(!['image/jpeg','image/png','image/webp'].includes(file.type))throw Error('Välj en JPG-, PNG- eller WebP-bild.');
  if(file.size>15*1024*1024)throw Error('Bilden får vara högst 15 MB.');if((editor.current?.querySelectorAll('img').length||0)>=3)throw Error('Högst tre bilder per lektion.');
  const url=URL.createObjectURL(file);let img:HTMLImageElement;try{img=new Image();img.src=url;await img.decode()}finally{URL.revokeObjectURL(url)}
  const canvas=document.createElement('canvas');const scale=Math.min(1,1400/Math.max(img.width,img.height));canvas.width=Math.max(1,Math.round(img.width*scale));canvas.height=Math.max(1,Math.round(img.height*scale));const ctx=canvas.getContext('2d');if(!ctx)throw Error('Bilden kunde inte förberedas.');ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(img,0,0,canvas.width,canvas.height);
  let src='';for(const quality of [.82,.65,.45,.3]){src=canvas.toDataURL('image/jpeg',quality);if(src.length<=220000)break}canvas.width=canvas.height=0;
  if(!validImage(src))throw Error('Bilden är för detaljrik. Prova en mindre bild.');
  if(!editor.current)return;const nodes=fromDOM(editor.current);if(!validateLesson(encodeLesson([...nodes,{tag:'img',src,alt:file.name.replace(/\.[^.]+$/,'').slice(0,250)}])))throw Error('Bilden ryms inte i lektionen. Ta bort en tidigare bild eller använd en mindre bild.');
  restore();const s=window.getSelection();let range=s?.rangeCount?s.getRangeAt(0):null;if(!range||!editor.current.contains(range.commonAncestorContainer)){range=document.createRange();range.selectNodeContents(editor.current);range.collapse(false)}
  const picture=document.createElement('img');picture.src=src;picture.alt=file.name.replace(/\.[^.]+$/,'').slice(0,250);range.deleteContents();range.insertNode(picture);range.setStartAfter(picture);range.collapse(true);s?.removeAllRanges();s?.addRange(range);selection.current=range.cloneRange();emit();
 }catch(e){setError(e instanceof Error?e.message:'Bilden kunde inte läsas.')}finally{setImageBusy(false);if(imageInput.current)imageInput.current.value=''}}
 const locked=disabled||imageBusy;
 return <div className="lesson-editor-shell"><div className="lesson-toolbar" role="toolbar" aria-label="Formatera lektionstext" onMouseDown={e=>{if((e.target as HTMLElement).closest('button'))e.preventDefault()}}>
 {([['Fet','bold'],['Kursiv','italic'],['Understruken','underline'],['Punktlista','insertUnorderedList'],['Numrerad lista','insertOrderedList']] as const).map(([label,cmd])=><button key={cmd} type="button" className="light" disabled={locked} onClick={()=>command(cmd)}>{label}</button>)}
 <button type="button" className="light" disabled={locked} onClick={()=>command('formatBlock','h2')}>Rubrik</button><button type="button" className="light" disabled={locked} onClick={()=>command('formatBlock','p')}>Brödtext</button>
 <button type="button" className="light lesson-handwriting" disabled={locked} onClick={()=>font(true)}>Handskrivet</button><button type="button" className="light" disabled={locked} onClick={()=>font(false)}>Vanligt typsnitt</button>
 <button type="button" className="light" disabled={locked} onClick={()=>command('undo')}>Ångra</button><button type="button" className="light" disabled={locked} onClick={()=>command('redo')}>Gör om</button>
 <button type="button" disabled={locked} onClick={()=>{remember();imageInput.current?.click()}}>{imageBusy?'Läser bild…':'＋ Ladda upp bild'}</button>
 {hasImage&&<button type="button" className="light" disabled={locked} onClick={()=>{selectedImage.current?.remove();selectedImage.current=null;setHasImage(false);emit()}}>Ta bort markerad bild</button>}
 </div><input ref={imageInput} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={e=>{const file=e.target.files?.[0];if(file)upload(file)}}/>
 <p className="note">Markera text och välj formatering. Bilder infogas vid markören. Klicka på en bild för att kunna ta bort den.</p>
 <div ref={editor} id="lesson-body" role="textbox" aria-label="Lektionstext" aria-multiline="true" aria-disabled={locked} className="builder-editor lesson-content rich-lesson-editor" contentEditable={!locked} suppressContentEditableWarning onInput={emit} onKeyUp={remember} onMouseUp={remember} onBlur={remember} onClick={e=>{const img=(e.target as HTMLElement).closest('img');selectedImage.current=img as HTMLImageElement|null;setHasImage(!!img)}} onPaste={e=>{e.preventDefault();command('insertText',e.clipboardData.getData('text/plain'))}} onDrop={e=>{e.preventDefault();setError('Använd Ladda upp bild för att lägga in bilder.')}}/>
 {error&&<p role="alert" className="error">{error}</p>}</div>
}
