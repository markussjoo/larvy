'use client';
import {useEffect,useRef,useState} from 'react';
import {validLessonFile} from './lesson-files';
import {encodeLesson,parseLesson,validImage,validateLesson,validExercise,type Exercise,type LessonNode} from './lesson-format';
const allowed=new Set(['p','div','br','strong','b','em','i','u','s','h2','h3','ul','ol','li','blockquote','span','font','figure','figcaption','table','thead','tbody','tr','th','td']);
function fromDOM(root:Node):LessonNode[]{return Array.from(root.childNodes).flatMap((node):LessonNode[]=>{
 if(node.nodeType===3)return [{tag:'#text',text:node.textContent||''}];if(node.nodeType!==1)return [];
 const el=node as HTMLElement,tag=el.tagName.toLowerCase();if(el.dataset.lessonExercise){try{const exercise=JSON.parse(el.dataset.lessonExercise);if(validExercise(exercise))return [{tag:'exercise',exercise}]}catch{}return []}if(el.dataset.lessonFile){try{const file=JSON.parse(el.dataset.lessonFile);if(validLessonFile(file))return [{tag:'file',file}]}catch{}return []}if(tag==='img')return validImage((el as HTMLImageElement).src)?[{tag:'img',src:(el as HTMLImageElement).src,alt:(el as HTMLImageElement).alt.slice(0,250)}]:[];
 if(['script','style','iframe','object'].includes(tag))return [];
 const children=fromDOM(el);if(!allowed.has(tag))return children;
 const hand=el.classList.contains('lesson-handwriting')||/LarvyHand/i.test(el.getAttribute('face')||el.style.fontFamily);
 return [{tag,children,...(hand?{hand:true}:tag==='font'||!!el.style.fontFamily||el.classList.contains('lesson-normal')?{hand:false}:{})}];
})}
function fill(root:HTMLElement,body:string){root.replaceChildren();const nodes=parseLesson(body);if(!nodes){root.textContent=body;return}const build=(n:LessonNode):Node=>{if(n.tag==='#text')return document.createTextNode(n.text||'');if(n.tag==='exercise'){const item=document.createElement('div');item.dataset.lessonExercise=JSON.stringify(n.exercise);item.contentEditable='false';item.className='lesson-exercise';const hasKey=(n.exercise!.type==='choice'||n.exercise!.type==='gap')&&n.exercise!.correctOptions&&n.exercise!.correctOptions.length>0;const typeLabel=n.exercise!.type==='text'?'Textfält':n.exercise!.type==='choice'?'Kryssalternativ':n.exercise!.type==='gap'?'Interaktiva linjer / lucktext':'Tabell / Ordlista';item.textContent='✎ '+n.exercise!.prompt+' · '+typeLabel+(hasKey?' (Självrättande)':'')+' · Klicka för att redigera';return item}if(n.tag==='file'){const item=document.createElement('span');item.dataset.lessonFile=JSON.stringify(n.file);item.contentEditable='false';item.className='lesson-file-attachment';item.textContent='▤ '+n.file!.name+' · Bilaga';return item}const el=document.createElement(n.tag==='font'?'span':n.tag);if(n.hand!==undefined)el.className=n.hand?'lesson-handwriting':'lesson-normal';if(n.tag==='img'){(el as HTMLImageElement).src=n.src!;(el as HTMLImageElement).alt=n.alt||'';(el as HTMLImageElement).draggable=true;(el as HTMLElement).style.maxWidth='100%';(el as HTMLElement).style.borderRadius='8px';(el as HTMLElement).style.cursor='pointer'}else n.children?.forEach(c=>el.appendChild(build(c)));return el};nodes.forEach(n=>root.appendChild(build(n)))}
export default function LessonEditor({value,onChange,disabled}:{value:string;onChange:(value:string)=>void;disabled:boolean}){
 const editor=useRef<HTMLDivElement>(null),lastValue=useRef(''),selection=useRef<Range|null>(null),imageInput=useRef<HTMLInputElement>(null),selectedImage=useRef<HTMLImageElement|null>(null);
 const [error,setError]=useState(''),[imageBusy,setImageBusy]=useState(false),[hasImage,setHasImage]=useState(false),[imgAlign,setImgAlign]=useState<'left'|'center'|'right'>('center');
 useEffect(()=>{if(editor.current&&value!==lastValue.current){fill(editor.current,value);lastValue.current=value;selection.current=null;selectedImage.current=null;setHasImage(false);setExercise(null)}},[value]);
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
 const [exercise,setExercise]=useState<Exercise|null>(null),[options,setOptions]=useState(''),[gapFacit,setGapFacit]=useState('');
 const parsedOptions=Array.from(new Set(options.split('\n').map(s=>s.trim()).filter(Boolean)));

 function moveSelectedImage(direction: 'up' | 'down') {
  const img = selectedImage.current;
  if (!img || !editor.current) return;
  const parent = img.parentElement;
  if (!parent) return;

  if (direction === 'up') {
   const prev = img.previousElementSibling;
   if (prev) {
    parent.insertBefore(img, prev);
   } else if (parent !== editor.current && parent.previousElementSibling) {
    parent.parentElement?.insertBefore(img, parent);
   }
  } else {
   const next = img.nextElementSibling;
   if (next) {
    parent.insertBefore(img, next.nextElementSibling);
   } else if (parent !== editor.current && parent.nextElementSibling) {
    parent.parentElement?.insertBefore(img, parent.nextElementSibling.nextElementSibling);
   }
  }
  emit();
 }

 function alignSelectedImage(align: 'left' | 'center' | 'right') {
  const img = selectedImage.current;
  if (!img) return;
  setImgAlign(align);
  if (align === 'center') {
   img.style.display = 'block';
   img.style.margin = '16px auto';
   img.style.float = 'none';
  } else if (align === 'left') {
   img.style.display = 'inline-block';
   img.style.float = 'left';
   img.style.margin = '8px 16px 8px 0';
  } else {
   img.style.display = 'inline-block';
   img.style.float = 'right';
   img.style.margin = '8px 0 8px 16px';
  }
  emit();
 }
 function saveExercise(){if(!exercise||!editor.current)return;
  let q: Exercise;
  if (exercise.type === 'choice') {
   const opts=options.split('\n').map(s=>s.trim()).filter(Boolean);
   const validCorrect=(exercise.correctOptions||[]).filter(c=>opts.includes(c));
   q={id:exercise.id,type:'choice',prompt:exercise.prompt,options:opts,...(validCorrect.length?{correctOptions:validCorrect}:{})};
   if(!validExercise(q)){setError('Ange en fråga och minst två unika alternativ, ett per rad.');return}
  } else if (exercise.type === 'gap') {
   const opts=options.split('\n').map(s=>s.trim()).filter(Boolean);
   const facitList=gapFacit.split('\n').map(s=>s.trim());
   q={id:exercise.id,type:'gap',prompt:exercise.prompt,options:opts,...(facitList.some(Boolean)?{correctOptions:facitList}:{})};
   if(!validExercise(q)){setError('Ange minst en rad med mening eller linje.');return}
  } else if (exercise.type === 'table') {
   q={id:exercise.id,type:'table',prompt:exercise.prompt,options:exercise.options,tableData:exercise.tableData,correctOptions:exercise.correctOptions};
   if(!validExercise(q)){setError('Tabellen saknar kolumner eller rader.');return}
  } else {
   q={id:exercise.id,type:'text',prompt:exercise.prompt,options:[]};
   if(!validExercise(q)){setError('Ange en fråga.');return}
  }
  const nodes=fromDOM(editor.current);let found=false;
  const update=(n:LessonNode):LessonNode=>{if(n.exercise?.id===q.id){found=true;return {tag:'exercise',exercise:q}}return {...n,...(n.children?{children:n.children.map(update)}:{})}};
  const next=nodes.map(update);if(!found)next.push({tag:'exercise',exercise:q},{tag:'p',children:[{tag:'#text',text:''}]});
  const body=encodeLesson(next);if(!validateLesson(body)){setError('Lektionen är för stor eller har för många uppgifter.');return}
  fill(editor.current,body);selection.current=null;emit();setExercise(null);setError('')
 }
 const locked=disabled||imageBusy;
 return <div className="lesson-editor-shell"><p className="note" style={{margin:'14px 0 6px',fontSize:12}}>Markera text och välj formatering. Bilder infogas vid markören. Klicka på en bild för att kunna ta bort den.</p>
 <div className="lesson-toolbar" role="toolbar" aria-label="Formatera lektionstext" onMouseDown={e=>{if((e.target as HTMLElement).closest('button'))e.preventDefault()}}>
 {([['Fet','bold'],['Kursiv','italic'],['Understruken','underline'],['Punktlista','insertUnorderedList'],['Numrerad lista','insertOrderedList']] as const).map(([label,cmd])=><button key={cmd} type="button" className="light" disabled={locked} onClick={()=>command(cmd)}>{label}</button>)}
 <button type="button" className="light" disabled={locked} onClick={()=>command('formatBlock','h2')}>Rubrik</button><button type="button" className="light" disabled={locked} onClick={()=>command('formatBlock','p')}>Brödtext</button>
 <button type="button" className="light lesson-handwriting" disabled={locked} onClick={()=>font(true)}>Handskrivet</button><button type="button" className="light" disabled={locked} onClick={()=>font(false)}>Vanligt typsnitt</button>
 <button type="button" className="light" disabled={locked} onClick={()=>command('undo')}>Ångra</button><button type="button" className="light" disabled={locked} onClick={()=>command('redo')}>Gör om</button>
 <button type="button" disabled={locked} onClick={()=>{remember();imageInput.current?.click()}}>{imageBusy?'Läser bild…':'＋ Ladda upp bild'}</button>
 <button type="button" disabled={locked} onClick={()=>{setError('');setOptions('');setGapFacit('');setExercise({id:crypto.randomUUID(),type:'gap',prompt:'Fyll i rätt svar på linjen:',options:[],correctOptions:[]})}}>＋ Interaktiv uppgift</button>
 {hasImage&&<>
  <span className="badge" style={{background:'#7c3aed',color:'#fff',fontSize:11}}>Bild markerad</span>
  <button type="button" className="light" disabled={locked} title="Flytta bild uppåt i lektionen" onClick={()=>moveSelectedImage('up')}>↑ Flytta upp</button>
  <button type="button" className="light" disabled={locked} title="Flytta bild nedåt i lektionen" onClick={()=>moveSelectedImage('down')}>↓ Flytta ner</button>
  <button type="button" className="light" disabled={locked} title="Vänsterjustera med textomslutning" onClick={()=>alignSelectedImage('left')}>Vänster</button>
  <button type="button" className="light" disabled={locked} title="Centrera bild" onClick={()=>alignSelectedImage('center')}>Centrerad</button>
  <button type="button" className="light" disabled={locked} title="Högerjustera med textomslutning" onClick={()=>alignSelectedImage('right')}>Höger</button>
  <button type="button" className="light" style={{color:'#a33232'}} disabled={locked} onClick={()=>{selectedImage.current?.remove();selectedImage.current=null;setHasImage(false);emit()}}>Ta bort bild</button>
 </>}
 </div>{exercise&&<section className="lesson-exercise" aria-label="Redigera uppgift"><h3>Uppgift / Fråga</h3><label>Instruktion / Fråga<textarea value={exercise.prompt} maxLength={2000} onChange={e=>setExercise({...exercise,prompt:e.target.value})}/></label><label>Svarstyp<select value={exercise.type} onChange={e=>setExercise({...exercise,type:e.target.value as Exercise['type']})}><option value="gap">Interaktiv lucktext / linje i mening (arbetsbok)</option><option value="choice">Kryssa i alternativ (flervalsfrågor)</option><option value="text">Skriva i öppet textfält</option><option value="table">Interaktiv ordlista / tabell</option></select></label>{exercise.type==='gap'&&<><label>Meningar / linjer – en per rad (använd ____ eller [blank] för lucka)<textarea value={options} placeholder={'1 heter/Berlin/Tysklands huvudstad ____\n2 slutade/andra världskriget/1945 ____\n3 Människor bodde i Östberlin ____ jobbade i Västberlin.'} rows={6} onChange={e=>setOptions(e.target.value)}/></label><label>Facit för varje rad (valfritt – motsvarande rad, tillåt flera varianter med |)<textarea value={gapFacit} placeholder={'Berlin heter Tysklands huvudstad\nAndra världskriget slutade 1945\nmen'} rows={4} onChange={e=>setGapFacit(e.target.value)}/></label></>}{exercise.type==='choice'&&<><label>Alternativ – ett per rad<textarea value={options} placeholder={'Alternativ 1\nAlternativ 2'} onChange={e=>setOptions(e.target.value)}/></label>{parsedOptions.length>=2&&<div style={{margin:'14px 0'}}><label style={{marginBottom:6}}>Facit för självrättning (valfritt – kryssa i rätt svar)</label><p className="muted" style={{fontSize:12,margin:'0 0 8px'}}>Om du markerar rätt alternativ rättas frågan automatiskt när eleven lämnar in. Facit döljs alltid för eleven tills arbetet är inlämnat.</p>{parsedOptions.map(opt=>{const checked=(exercise.correctOptions||[]).includes(opt);return <label className="lesson-option" key={opt} style={{margin:0}}><input type="checkbox" checked={checked} onChange={e=>{const prev=(exercise.correctOptions||[]).filter(c=>parsedOptions.includes(c));setExercise({...exercise,correctOptions:e.target.checked?[...prev,opt]:prev.filter(c=>c!==opt)})}}/><span>{opt} {checked&&<span className="badge" style={{marginLeft:6,background:'#2d5c40',color:'#fff'}}>Rätt svar</span>}</span></label>})}</div>}</>}<div className="row"><button type="button" disabled={locked} onClick={saveExercise}>Spara uppgift</button><button type="button" className="light" onClick={()=>setExercise(null)}>Avbryt</button><button type="button" className="light" disabled={locked} onClick={()=>{const remove=(nodes:LessonNode[]):LessonNode[]=>nodes.filter(n=>n.exercise?.id!==exercise.id).map(n=>({...n,...(n.children?{children:remove(n.children)}:{})}));if(editor.current){fill(editor.current,encodeLesson(remove(fromDOM(editor.current))));emit()}setExercise(null)}}>Ta bort uppgift</button></div></section>}<input ref={imageInput} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={e=>{const file=e.target.files?.[0];if(file)upload(file)}}/>
 <div ref={editor} id="lesson-body" role="textbox" aria-label="Lektionstext" aria-multiline="true" aria-disabled={locked} className="builder-editor lesson-content rich-lesson-editor" contentEditable={!locked} suppressContentEditableWarning onInput={emit} onKeyUp={remember} onMouseUp={remember} onBlur={remember} onClick={e=>{const item=(e.target as HTMLElement).closest<HTMLElement>('[data-lesson-exercise]');if(item){try{const q=JSON.parse(item.dataset.lessonExercise!);if(validExercise(q)){setExercise(q);setOptions(q.options.join('\n'));setGapFacit(q.correctOptions?.join('\n')||'')}}catch{}}const img=(e.target as HTMLElement).closest('img');selectedImage.current=img as HTMLImageElement|null;setHasImage(!!img)}} onPaste={e=>{e.preventDefault();command('insertText',e.clipboardData.getData('text/plain'))}} onDrop={e=>{e.preventDefault();setError('Använd Ladda upp bild för att lägga in bilder.')}}/>
 {error&&<p role="alert" className="error">{error}</p>}</div>
}
