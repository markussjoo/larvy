'use client';
import {useEffect,useRef,useState} from 'react';
import {validLessonFile} from './lesson-files';
import {uploadMaterial} from './material-import';
import {encodeLesson,parseLesson,validImage,validateLesson,validExercise,validLessonMedia,validMediaUrl,type Exercise,type LessonMedia,type LessonNode} from './lesson-format';
const allowed=new Set(['p','div','br','strong','b','em','i','u','s','h2','h3','ul','ol','li','blockquote','span','font','figure','figcaption','table','thead','tbody','tr','th','td']);
function fromDOM(root:Node):LessonNode[]{return Array.from(root.childNodes).flatMap((node):LessonNode[]=>{
 if(node.nodeType===3)return [{tag:'#text',text:node.textContent||''}];if(node.nodeType!==1)return [];
 const el=node as HTMLElement,tag=el.tagName.toLowerCase();if(el.dataset.editorSpacer==='true'&&!(el.textContent||'').trim()&&!el.querySelector('img,[data-lesson-exercise],[data-lesson-media],[data-lesson-file]'))return [];if(el.dataset.lessonExercise){try{const exercise=JSON.parse(el.dataset.lessonExercise);if(validExercise(exercise))return [{tag:'exercise',exercise}]}catch{}return []}if(el.dataset.lessonMedia){try{const media=JSON.parse(el.dataset.lessonMedia);if(validLessonMedia(media))return [{tag:'media',media}]}catch{}return []}if(el.dataset.lessonFile){try{const file=JSON.parse(el.dataset.lessonFile);if(validLessonFile(file))return [{tag:'file',file}]}catch{}return []}if(tag==='img')return validImage((el as HTMLImageElement).src)?[{tag:'img',src:(el as HTMLImageElement).src,alt:(el as HTMLImageElement).alt.slice(0,250)}]:[];
 if(['script','style','iframe','object'].includes(tag))return [];
 const children=fromDOM(el);if(!allowed.has(tag))return children;
 const hand=el.classList.contains('lesson-handwriting')||/LarvyHand/i.test(el.getAttribute('face')||el.style.fontFamily);
 return [{tag,children,...(hand?{hand:true}:tag==='font'||!!el.style.fontFamily||el.classList.contains('lesson-normal')?{hand:false}:{})}];
})}
function buildMediaPillElement(m:LessonMedia):HTMLElement{
 const item=document.createElement('span');
 item.dataset.lessonMedia=JSON.stringify(m);
 item.contentEditable='false';
 item.className='lesson-media-pill';
 item.style.display='inline-flex';
 item.style.alignItems='center';
 item.style.gap='6px';
 item.style.padding='4px 11px';
 item.style.margin='2px 5px';
 item.style.borderRadius='999px';
 item.style.border='1px solid #8b5cf6';
 item.style.background='rgba(124, 58, 237, 0.16)';
 item.style.color='#c4b5fd';
 item.style.fontWeight='600';
 item.style.fontSize='13px';
 item.style.cursor='pointer';
 item.style.verticalAlign='middle';
 const icon=m.kind==='audio'?'🔊':m.kind==='video'?'🎬':'🔗';
 item.textContent=icon+' '+m.title+' ▶';
 item.title='Klicka för att redigera eller ta bort mediaspår';
 return item;
}
function fill(root:HTMLElement,body:string){root.replaceChildren();const nodes=parseLesson(body);if(!nodes){root.textContent=body;return}const build=(n:LessonNode):Node=>{if(n.tag==='#text')return document.createTextNode(n.text||'');if(n.tag==='exercise'){const item=document.createElement('div');item.dataset.lessonExercise=JSON.stringify(n.exercise);item.contentEditable='false';item.className='lesson-exercise';const hasKey=(n.exercise!.type==='choice'||n.exercise!.type==='gap')&&n.exercise!.correctOptions&&n.exercise!.correctOptions.length>0;const typeLabel=n.exercise!.type==='text'?'Textfält':n.exercise!.type==='choice'?'Kryssalternativ':n.exercise!.type==='gap'?'Interaktiva linjer / lucktext':'Tabell / Ordlista';item.textContent='✎ '+n.exercise!.prompt+' · '+typeLabel+(hasKey?' (Självrättande)':'')+' · Klicka för att redigera';return item}if(n.tag==='media'&&n.media){return buildMediaPillElement(n.media)}if(n.tag==='file'){const item=document.createElement('span');item.dataset.lessonFile=JSON.stringify(n.file);item.contentEditable='false';item.className='lesson-file-attachment';item.textContent='▤ '+n.file!.name+' · Bilaga';return item}const el=document.createElement(n.tag==='font'?'span':n.tag);if(n.hand!==undefined)el.className=n.hand?'lesson-handwriting':'lesson-normal';if(n.tag==='img'){(el as HTMLImageElement).src=n.src!;(el as HTMLImageElement).alt=n.alt||'';(el as HTMLImageElement).draggable=true;(el as HTMLElement).style.maxWidth='100%';(el as HTMLElement).style.borderRadius='8px';(el as HTMLElement).style.cursor='pointer'}else n.children?.forEach(c=>el.appendChild(build(c)));return el};nodes.forEach((n,idx)=>{if(n.tag==='exercise'&&(idx===0||nodes[idx-1].tag==='exercise')){const spacer=document.createElement('p');spacer.dataset.editorSpacer='true';spacer.style.margin='4px 0';spacer.style.minHeight='18px';spacer.appendChild(document.createElement('br'));root.appendChild(spacer)}root.appendChild(build(n))});if(nodes.length>0&&nodes[nodes.length-1].tag==='exercise'){const endSpacer=document.createElement('p');endSpacer.dataset.editorSpacer='true';endSpacer.style.margin='4px 0';endSpacer.style.minHeight='18px';endSpacer.appendChild(document.createElement('br'));root.appendChild(endSpacer)}}
export default function LessonEditor({value,onChange,disabled,demo=false}:{value:string;onChange:(value:string)=>void;disabled:boolean;demo?:boolean}){
 const editor=useRef<HTMLDivElement>(null),lastValue=useRef(''),selection=useRef<Range|null>(null),imageInput=useRef<HTMLInputElement>(null),audioInput=useRef<HTMLInputElement>(null),videoInput=useRef<HTMLInputElement>(null),selectedImage=useRef<HTMLImageElement|null>(null);
 const anchorTarget=useRef<{el:HTMLElement;position:'before'|'after'}|null>(null);
 const [error,setError]=useState(''),[imageBusy,setImageBusy]=useState(false),[mediaBusy,setMediaBusy]=useState<'audio'|'video'|''>(''),[hasImage,setHasImage]=useState(false),[imgAlign,setImgAlign]=useState<'left'|'center'|'right'>('center');
 const [mediaItem,setMediaItem]=useState<LessonMedia|null>(null),[mediaFormKind,setMediaFormKind]=useState<'audio'|'video'|'embed'|''>(''),[mediaFile,setMediaFile]=useState<File|null>(null),[linkUrl,setLinkUrl]=useState(''),[linkTitle,setLinkTitle]=useState(''),[cursorHint,setCursorHint]=useState('');
 useEffect(()=>{if(editor.current&&value!==lastValue.current){fill(editor.current,value);lastValue.current=value;selection.current=null;anchorTarget.current=null;selectedImage.current=null;setHasImage(false);setExercise(null);setMediaItem(null);setMediaFormKind('');setMediaFile(null)}},[value]);
 function remember(){
  const s=window.getSelection();
  if(s?.rangeCount&&editor.current?.contains(s.anchorNode)){
   const r=s.getRangeAt(0);
   const container=r.startContainer.nodeType===1?(r.startContainer as HTMLElement):r.startContainer.parentElement;
   // Do not overwrite a valid text cursor if selection is on a non-editable block
   if(!container?.closest('[contenteditable="false"]')){
    selection.current=r.cloneRange();
    anchorTarget.current=null;
    const textPreview=(container?.textContent||'').trim().slice(0,45);
    setCursorHint(textPreview?`Vid texten: "${textPreview}${textPreview.length>=45?'…':''}"`:'Vid markörens rad');
   }
  }
 }
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
  const picture=document.createElement('img');picture.src=src;picture.alt=file.name.replace(/\.[^.]+$/,'').slice(0,250);
  if(!insertNodeElementAtCursor(picture))throw Error('Bilden ryms inte i lektionen.');
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
  let found=false;
  const nodes=fromDOM(editor.current);
  const update=(n:LessonNode):LessonNode=>{if(n.exercise?.id===q.id){found=true;return {tag:'exercise',exercise:q}}return {...n,...(n.children?{children:n.children.map(update)}:{})}};
  const updatedNodes=nodes.map(update);
  if(found){
   const body=encodeLesson(updatedNodes);if(!validateLesson(body)){setError('Lektionen är för stor eller har för många uppgifter.');return}
   fill(editor.current,body);selection.current=null;emit();setExercise(null);setError('');
   return;
  }
  const exEl=document.createElement('div');
  exEl.dataset.lessonExercise=JSON.stringify(q);
  exEl.contentEditable='false';
  exEl.className='lesson-exercise';
  if(!insertNodeElementAtCursor(exEl)){setError('Lektionen är för stor eller har för många uppgifter.');return}
  setExercise(null);setError('')
 }
 function createMediaElement(m:LessonMedia):HTMLElement{
  return buildMediaPillElement(m);
 }
 function insertNodeElementAtCursor(el:HTMLElement):boolean{
  if(!editor.current)return false;
  // 1. If user clicked a specific block (exercise or media) or placed an anchorTarget, insert relative to that block!
  if(anchorTarget.current&&editor.current.contains(anchorTarget.current.el)&&anchorTarget.current.el.parentElement){
   const target=anchorTarget.current.el;
   if(anchorTarget.current.position==='before'){
    target.parentElement!.insertBefore(el,target);
   }else{
    target.parentElement!.insertBefore(el,target.nextSibling);
   }
  }else if(selection.current&&editor.current.contains(selection.current.commonAncestorContainer)){
   // 2. Use the saved Range from selection.current directly without calling editor.focus() first
   const range=selection.current.cloneRange();
   const anchorEl=range.startContainer.nodeType===1?(range.startContainer as HTMLElement):range.startContainer.parentElement;
   const nonEditableBlock=anchorEl?.closest<HTMLElement>('[contenteditable="false"]');
   if(nonEditableBlock&&editor.current.contains(nonEditableBlock)&&nonEditableBlock.parentElement){
    nonEditableBlock.parentElement.insertBefore(el,nonEditableBlock.nextSibling);
   }else{
    // If cursor is inside a top-level block (p, h2, div, blockquote) and we are inserting a block-level element (div),
    // insert right after the current paragraph/heading if at the end, or split/insert cleanly
    let topChild:HTMLElement|null=anchorEl;
    while(topChild&&topChild.parentElement&&topChild.parentElement!==editor.current){
     topChild=topChild.parentElement;
    }
    if(el.tagName==='DIV'&&topChild&&topChild.parentElement===editor.current&&['P','H2','H3','BLOCKQUOTE'].includes(topChild.tagName)){
     // Check if cursor is near the start of the block
     const preRange=document.createRange();
     preRange.selectNodeContents(topChild);
     preRange.setEnd(range.startContainer,range.startOffset);
     const beforeText=preRange.toString().trim();
     if(!beforeText&&topChild.textContent?.trim()){
      editor.current.insertBefore(el,topChild);
     }else{
      editor.current.insertBefore(el,topChild.nextSibling);
     }
    }else{
     range.deleteContents();
     range.insertNode(el);
    }
   }
  }else{
   // 3. Fallback: append at the end of editor
   editor.current.appendChild(el);
  }
  const body=encodeLesson(fromDOM(editor.current));
  if(!validateLesson(body)){
   el.remove();
   return false;
  }
  fill(editor.current,body);
  lastValue.current=body;
  onChange(body);
  return true;
 }
 function insertMediaAtCursor(m:LessonMedia):boolean{
  const el=createMediaElement(m);
  return insertNodeElementAtCursor(el);
 }
 function moveSelectedMedia(direction:'up'|'down'){
  if(!mediaItem||!editor.current)return;
  const nodes=fromDOM(editor.current);
  const idx=nodes.findIndex(n=>n.media?.id===mediaItem.id);
  if(idx>=0){
   const targetIdx=direction==='up'?idx-1:idx+1;
   if(targetIdx>=0&&targetIdx<nodes.length){
    const copy=[...nodes];
    const [moved]=copy.splice(idx,1);
    copy.splice(targetIdx,0,moved);
    const body=encodeLesson(copy);
    if(validateLesson(body)){
     fill(editor.current,body);
     emit();
    }
   }
   return;
  }
  // Fallback DOM move if nested inside a block
  const el=Array.from(editor.current.querySelectorAll<HTMLElement>('[data-lesson-media]')).find(node=>{
   try{return JSON.parse(node.dataset.lessonMedia||'{}').id===mediaItem.id}catch{return false}
  });
  if(!el||!el.parentElement)return;
  const parent=el.parentElement;
  if(direction==='up'&&el.previousElementSibling){
   parent.insertBefore(el,el.previousElementSibling);
  }else if(direction==='down'&&el.nextElementSibling){
   parent.insertBefore(el,el.nextElementSibling.nextElementSibling);
  }
  emit();
 }
 async function saveMediaItem(){
  if(!editor.current)return;
  if(mediaFormKind){
   setError('');
   const cleanUrl=linkUrl.trim();
   if(!mediaFile&&!cleanUrl){
    setError(mediaFormKind==='audio'?'Välj en ljudfil eller klistra in en länk till ljudet.':mediaFormKind==='video'?'Välj en videofil eller klistra in en länk till filmen.':'Ange en webblänk (https://...).');
    return;
   }
   if(!mediaFile&&cleanUrl&&!validMediaUrl(cleanUrl)){
    setError('Ange en giltig webblänk som börjar med https:// eller http://');
    return;
   }
   let uploadedFile=undefined;
   if(mediaFile){
    if(mediaFile.size>50*1024*1024){setError('Filen får vara högst 50 MB.');return}
    setMediaBusy(mediaFormKind==='video'?'video':'audio');
    try{
     uploadedFile=await uploadMaterial(mediaFile,demo);
    }catch(e){
     setMediaBusy('');
     setError(e instanceof Error?e.message:'Mediafilen kunde inte laddas upp.');
     return;
    }
    setMediaBusy('');
   }
   const defaultLabel=mediaFile?mediaFile.name.replace(/\.[^.]+$/,''):(mediaFormKind==='audio'?'Ljudspår':mediaFormKind==='video'?'Filmspår':cleanUrl.slice(0,80));
   const cleanTitle=(linkTitle.trim()||defaultLabel).slice(0,200);
   const finalKind:'audio'|'video'|'embed'=uploadedFile?(mediaFormKind==='video'?'video':'audio'):(mediaFormKind==='audio'&&/\.(mp3|wav|ogg|m4a|aac|flac)(\?.*)?$/i.test(cleanUrl)?'audio':mediaFormKind==='video'&&/\.(mp4|webm|mov|m4v|ogv)(\?.*)?$/i.test(cleanUrl)?'video':mediaFormKind);
   const m:LessonMedia={
    id:'media-'+crypto.randomUUID(),
    kind:finalKind,
    title:cleanTitle,
    ...(uploadedFile?{file:uploadedFile}:{}),
    ...(cleanUrl?{url:cleanUrl}:{})
   };
   if(!insertMediaAtCursor(m)){setError('Lektionen har för många mediafiler.');return}
   setMediaFormKind('');setMediaFile(null);setLinkUrl('');setLinkTitle('');setError('');
   if(audioInput.current)audioInput.current.value='';
   if(videoInput.current)videoInput.current.value='';
   return;
  }
  if(mediaItem){
   if(!mediaItem.title.trim()){setError('Ange en rubrik för knappen.');return}
   let updatedMedia={...mediaItem};
   if(mediaFile){
    if(mediaFile.size>50*1024*1024){setError('Filen får vara högst 50 MB.');return}
    setMediaBusy(mediaItem.kind==='video'?'video':'audio');
    try{
     const uploadedFile=await uploadMaterial(mediaFile,demo);
     updatedMedia={...updatedMedia,file:uploadedFile};
    }catch(e){
     setMediaBusy('');
     setError(e instanceof Error?e.message:'Mediafilen kunde inte laddas upp.');
     return;
    }
    setMediaBusy('');
   }
   if(!updatedMedia.file&&!validMediaUrl(updatedMedia.url)){setError('Ange en giltig webblänk (https://...).');return}
   const nodes=fromDOM(editor.current);
   const update=(n:LessonNode):LessonNode=>n.media?.id===updatedMedia.id?{tag:'media',media:updatedMedia}:{...n,...(n.children?{children:n.children.map(update)}:{})};
   const body=encodeLesson(nodes.map(update));
   if(!validateLesson(body)){setError('Kunde inte spara ändringen.');return}
   fill(editor.current,body);selection.current=null;emit();setMediaItem(null);setMediaFile(null);setError('');
  }
 }
 const locked=disabled||imageBusy||!!mediaBusy;
 return <div className="lesson-editor-shell"><div style={{display:'flex',justifyContent:'space-between',alignItems:'center',flexWrap:'wrap',gap:8,margin:'14px 0 6px'}}><p className="note" style={{margin:0,fontSize:12}}>Markera text och välj formatering. Bilder, ljudspår, filmspår och länkar infogas vid markören. Klicka på en bild, ett mediaspår eller en uppgift för att redigera eller ta bort.</p>{cursorHint&&<span className="badge" style={{fontSize:11,background:'rgba(124, 58, 237, 0.16)',color:'#c4b5fd'}}>📍 Infogar: {cursorHint}</span>}</div>
 <div className="lesson-toolbar" role="toolbar" aria-label="Formatera lektionstext" onMouseDown={e=>{if((e.target as HTMLElement).closest('button'))e.preventDefault()}}>
 {([['Fet','bold'],['Kursiv','italic'],['Understruken','underline'],['Punktlista','insertUnorderedList'],['Numrerad lista','insertOrderedList']] as const).map(([label,cmd])=><button key={cmd} type="button" className="light" disabled={locked} onClick={()=>command(cmd)}>{label}</button>)}
 <button type="button" className="light" disabled={locked} onClick={()=>command('formatBlock','h2')}>Rubrik</button><button type="button" className="light" disabled={locked} onClick={()=>command('formatBlock','p')}>Brödtext</button>
 <button type="button" className="light lesson-handwriting" disabled={locked} onClick={()=>font(true)}>Handskrivet</button><button type="button" className="light" disabled={locked} onClick={()=>font(false)}>Vanligt typsnitt</button>
 <button type="button" className="light" disabled={locked} onClick={()=>command('undo')}>Ångra</button><button type="button" className="light" disabled={locked} onClick={()=>command('redo')}>Gör om</button>
 <button type="button" disabled={locked} onClick={()=>{remember();imageInput.current?.click()}}>{imageBusy?'Läser bild…':'＋ Ladda upp bild'}</button>
 <button type="button" disabled={locked} onClick={()=>{remember();setError('');setOptions('');setGapFacit('');setExercise({id:crypto.randomUUID(),type:'gap',prompt:'Fyll i rätt svar på linjen:',options:[],correctOptions:[]})}}>＋ Interaktiv uppgift</button>
 <button type="button" disabled={locked} title="Lägg in ljudspår vid markören för uppspelning i webbläsaren" style={{display:'inline-flex',alignItems:'center',gap:6}} onClick={()=>{remember();setError('');setMediaItem(null);setMediaFile(null);setLinkUrl('');setLinkTitle('');setMediaFormKind(k=>k==='audio'?'':'audio')}}>
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/></svg>
  <span>{mediaBusy==='audio'?'Laddar ljud…':'Ljudspår'}</span>
 </button>
 <button type="button" disabled={locked} title="Lägg in filmspår vid markören för uppspelning i webbläsaren" style={{display:'inline-flex',alignItems:'center',gap:6}} onClick={()=>{remember();setError('');setMediaItem(null);setMediaFile(null);setLinkUrl('');setLinkTitle('');setMediaFormKind(k=>k==='video'?'':'video')}}>
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="2" y="3" width="20" height="18" rx="2.5"/><path d="M7 3v18M17 3v18M2 9h5M17 9h5M2 15h5M17 15h5"/><polygon points="10 9 15 12 10 15 10 9" fill="currentColor"/></svg>
  <span>{mediaBusy==='video'?'Laddar film…':'Filmspår'}</span>
 </button>
 <button type="button" disabled={locked} title="Lägg in länk till film eller ljud på annan webbsida med uppspelning i webbläsaren" style={{display:'inline-flex',alignItems:'center',gap:6}} onClick={()=>{remember();setError('');setMediaItem(null);setMediaFile(null);setLinkUrl('');setLinkTitle('');setMediaFormKind(k=>k==='embed'?'':'embed')}}>
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>
  <span>Länk film / ljud</span>
 </button>
 {hasImage&&<>
  <span className="badge" style={{background:'#7c3aed',color:'#fff',fontSize:11}}>Bild markerad</span>
  <button type="button" className="light" disabled={locked} title="Flytta bild uppåt i lektionen" onClick={()=>moveSelectedImage('up')}>↑ Flytta upp</button>
  <button type="button" className="light" disabled={locked} title="Flytta bild nedåt i lektionen" onClick={()=>moveSelectedImage('down')}>↓ Flytta ner</button>
  <button type="button" className="light" disabled={locked} title="Vänsterjustera med textomslutning" onClick={()=>alignSelectedImage('left')}>Vänster</button>
  <button type="button" className="light" disabled={locked} title="Centrera bild" onClick={()=>alignSelectedImage('center')}>Centrerad</button>
  <button type="button" className="light" disabled={locked} title="Högerjustera med textomslutning" onClick={()=>alignSelectedImage('right')}>Höger</button>
  <button type="button" className="light" style={{color:'#a33232'}} disabled={locked} onClick={()=>{selectedImage.current?.remove();selectedImage.current=null;setHasImage(false);emit()}}>Ta bort bild</button>
 </>}
 </div>
 {(!!mediaFormKind||mediaItem)&&<section className="lesson-exercise" aria-label="Lägg in eller redigera media">
  <h3>{mediaFormKind==='audio'?'🔊 Lägg in knapp för ljudspår vid markören':mediaFormKind==='video'?'🎬 Lägg in knapp för filmspår vid markören':mediaFormKind==='embed'?'🔗 Lägg in knapp för länk till film eller ljud vid markören':mediaItem?.kind==='audio'?'🔊 Redigera ljudknapp':mediaItem?.kind==='video'?'🎬 Redigera filmknapp':'🔗 Redigera länkknapp'}</h3>
  <p className="muted" style={{fontSize:12,margin:'0 0 10px'}}>Knappen placeras där markören står i redigeraren ({cursorHint||'vid aktuell rad'}) och spelas upp direkt i elevens webbläsare.</p>
  <label>Knapptext / Rubrik
   <input type="text" maxLength={200} placeholder={mediaFormKind==='audio'?'T.ex. Spår 01 – Lyssna här':mediaFormKind==='video'?'T.ex. Se filmen – Berlinmuren':'T.ex. Spela upp i webbläsaren'} value={mediaFormKind?linkTitle:(mediaItem?.title||'')} onChange={e=>mediaFormKind?setLinkTitle(e.target.value):setMediaItem(m=>m?{...m,title:e.target.value}:null)}/>
  </label>
  {(mediaFormKind==='audio'||mediaFormKind==='video'||mediaItem?.kind==='audio'||mediaItem?.kind==='video')&&<div style={{margin:'10px 0'}}>
   <label style={{marginBottom:6}}>{(mediaFormKind==='audio'||mediaItem?.kind==='audio')?'Välj ljudfil från din dator (MP3, WAV, M4A, OGG)':'Välj videofil från din dator (MP4, WebM, MOV)'}</label>
   <div style={{display:'flex',alignItems:'center',gap:10,flexWrap:'wrap'}}>
    <button type="button" className="light" disabled={locked} onClick={()=>{const isAud=mediaFormKind==='audio'||mediaItem?.kind==='audio';const inp=(isAud?audioInput:videoInput).current;if(inp){inp.value='';inp.click()}}}>
     {mediaFile||mediaItem?.file?'Byt fil…':(mediaFormKind==='audio'||mediaItem?.kind==='audio')?'📂 Välj ljudfil…':'📂 Välj filmfil…'}
    </button>
    {mediaFile?<span className="badge" style={{background:'rgba(22, 163, 74, 0.2)',color:'#86efac'}}>✓ Vald fil: {mediaFile.name} ({Math.max(1,Math.round(mediaFile.size/1024))} kB)</span>:mediaItem?.file?<span className="badge" style={{background:'rgba(22, 163, 74, 0.2)',color:'#86efac'}}>✓ Sparad fil: {mediaItem.file.name}</span>:null}
   </div>
  </div>}
  {(mediaFormKind||!mediaItem?.file)&&<label>{mediaFormKind==='audio'?'Eller klistra in länk till ljud på webben (valfritt om du valt fil ovan)':mediaFormKind==='video'?'Eller klistra in länk till film på webben (YouTube, Vimeo, MP4 – valfritt om du valt fil ovan)':'Webblänk (URL till film eller ljud på annan webbsida)'}
   <input type="url" maxLength={2000} placeholder="https://www.youtube.com/watch?v=... eller https://sverigesradio.se/..." value={mediaFormKind?linkUrl:(mediaItem?.url||'')} onChange={e=>mediaFormKind?setLinkUrl(e.target.value):setMediaItem(m=>m?{...m,url:e.target.value}:null)}/>
  </label>}
  <div className="row" style={{marginTop:10,flexWrap:'wrap',gap:8}}>
   <button type="button" disabled={locked} onClick={saveMediaItem}>{mediaFormKind?'Lägg in knapp vid markören':'Spara ändring'}</button>
   {mediaItem&&<>
    <button type="button" className="light" disabled={locked} title="Flytta mediaknapp uppåt" onClick={()=>moveSelectedMedia('up')}>↑ Flytta upp</button>
    <button type="button" className="light" disabled={locked} title="Flytta mediaknapp nedåt" onClick={()=>moveSelectedMedia('down')}>↓ Flytta ner</button>
   </>}
   <button type="button" className="light" onClick={()=>{setMediaFormKind('');setMediaFile(null);setMediaItem(null)}}>Avbryt</button>
   {mediaItem&&<button type="button" className="light" style={{color:'#a33232'}} disabled={locked} onClick={()=>{const remove=(nodes:LessonNode[]):LessonNode[]=>nodes.filter(n=>n.media?.id!==mediaItem.id).map(n=>({...n,...(n.children?{children:remove(n.children)}:{})}));if(editor.current){fill(editor.current,encodeLesson(remove(fromDOM(editor.current))));emit()}setMediaItem(null)}}>Ta bort knapp</button>}
  </div>
 </section>}
 {exercise&&<section className="lesson-exercise" aria-label="Redigera uppgift"><h3>Uppgift / Fråga</h3><label>Instruktion / Fråga<textarea value={exercise.prompt} maxLength={2000} onChange={e=>setExercise({...exercise,prompt:e.target.value})}/></label><label>Svarstyp<select value={exercise.type} onChange={e=>setExercise({...exercise,type:e.target.value as Exercise['type']})}><option value="gap">Interaktiv lucktext / linje i mening (arbetsbok)</option><option value="choice">Kryssa i alternativ (flervalsfrågor)</option><option value="text">Skriva i öppet textfält</option><option value="table">Interaktiv ordlista / tabell</option></select></label>{exercise.type==='gap'&&<><label>Meningar / linjer – en per rad (använd ____ eller [blank] för lucka)<textarea value={options} placeholder={'1 heter/Berlin/Tysklands huvudstad ____\n2 slutade/andra världskriget/1945 ____\n3 Människor bodde i Östberlin ____ jobbade i Västberlin.'} rows={6} onChange={e=>setOptions(e.target.value)}/></label><label>Facit för varje rad (valfritt – motsvarande rad, tillåt flera varianter med |)<textarea value={gapFacit} placeholder={'Berlin heter Tysklands huvudstad\nAndra världskriget slutade 1945\nmen'} rows={4} onChange={e=>setGapFacit(e.target.value)}/></label></>}{exercise.type==='choice'&&<><label>Alternativ – ett per rad<textarea value={options} placeholder={'Alternativ 1\nAlternativ 2'} onChange={e=>setOptions(e.target.value)}/></label>{parsedOptions.length>=2&&<div style={{margin:'14px 0'}}><label style={{marginBottom:6}}>Facit för självrättning (valfritt – kryssa i rätt svar)</label><p className="muted" style={{fontSize:12,margin:'0 0 8px'}}>Om du markerar rätt alternativ rättas frågan automatiskt när eleven lämnar in. Facit döljs alltid för eleven tills arbetet är inlämnat.</p>{parsedOptions.map(opt=>{const checked=(exercise.correctOptions||[]).includes(opt);return <label className="lesson-option" key={opt} style={{margin:0}}><input type="checkbox" checked={checked} onChange={e=>{const prev=(exercise.correctOptions||[]).filter(c=>parsedOptions.includes(c));setExercise({...exercise,correctOptions:e.target.checked?[...prev,opt]:prev.filter(c=>c!==opt)})}}/><span>{opt} {checked&&<span className="badge" style={{marginLeft:6,background:'#2d5c40',color:'#fff'}}>Rätt svar</span>}</span></label>})}</div>}</>}<div className="row" style={{flexWrap:'wrap',gap:8}}><button type="button" disabled={locked} onClick={saveExercise}>Spara uppgift</button><button type="button" className="light" disabled={locked} title="Infoga ljudspår ovanför denna uppgift" onClick={()=>{const el=Array.from(editor.current?.querySelectorAll<HTMLElement>('[data-lesson-exercise]')||[]).find(node=>{try{return JSON.parse(node.dataset.lessonExercise||'{}').id===exercise.id}catch{return false}});if(el)anchorTarget.current={el,position:'before'};setMediaFile(null);setLinkTitle('');setLinkUrl('');setMediaFormKind('audio')}}>🔊 Lägg ljudspår vid denna uppgift</button><button type="button" className="light" disabled={locked} title="Infoga filmspår ovanför denna uppgift" onClick={()=>{const el=Array.from(editor.current?.querySelectorAll<HTMLElement>('[data-lesson-exercise]')||[]).find(node=>{try{return JSON.parse(node.dataset.lessonExercise||'{}').id===exercise.id}catch{return false}});if(el)anchorTarget.current={el,position:'before'};setMediaFile(null);setLinkTitle('');setLinkUrl('');setMediaFormKind('video')}}>🎬 Lägg filmspår vid denna uppgift</button><button type="button" className="light" disabled={locked} title="Infoga länk till film/ljud ovanför denna uppgift" onClick={()=>{const el=Array.from(editor.current?.querySelectorAll<HTMLElement>('[data-lesson-exercise]')||[]).find(node=>{try{return JSON.parse(node.dataset.lessonExercise||'{}').id===exercise.id}catch{return false}});if(el)anchorTarget.current={el,position:'before'};setMediaFile(null);setLinkTitle('');setLinkUrl('');setMediaFormKind('embed')}}>🔗 Lägg medielänk vid denna uppgift</button><button type="button" className="light" onClick={()=>setExercise(null)}>Avbryt</button><button type="button" className="light" disabled={locked} onClick={()=>{const remove=(nodes:LessonNode[]):LessonNode[]=>nodes.filter(n=>n.exercise?.id!==exercise.id).map(n=>({...n,...(n.children?{children:remove(n.children)}:{})}));if(editor.current){fill(editor.current,encodeLesson(remove(fromDOM(editor.current))));emit()}setExercise(null)}}>Ta bort uppgift</button></div></section>}<input ref={imageInput} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={e=>{const file=e.target.files?.[0];if(file)upload(file)}}/><input ref={audioInput} type="file" accept="audio/*,.mp3,.wav,.m4a,.ogg,.aac,.flac" hidden onChange={e=>{const file=e.target.files?.[0];if(file){setMediaFile(file);const cleanName=file.name.replace(/\.[^.]+$/,'').slice(0,120);if(mediaFormKind&&!linkTitle.trim())setLinkTitle(cleanName);if(mediaItem&&!mediaItem.title.trim())setMediaItem({...mediaItem,title:cleanName})}}}/><input ref={videoInput} type="file" accept="video/*,.mp4,.webm,.mov,.m4v" hidden onChange={e=>{const file=e.target.files?.[0];if(file){setMediaFile(file);const cleanName=file.name.replace(/\.[^.]+$/,'').slice(0,120);if(mediaFormKind&&!linkTitle.trim())setLinkTitle(cleanName);if(mediaItem&&!mediaItem.title.trim())setMediaItem({...mediaItem,title:cleanName})}}}/>
 <div ref={editor} id="lesson-body" role="textbox" aria-label="Lektionstext" aria-multiline="true" aria-disabled={locked} className="builder-editor lesson-content rich-lesson-editor" contentEditable={!locked} suppressContentEditableWarning onInput={emit} onKeyUp={remember} onMouseUp={remember} onBlur={remember} onClick={e=>{const item=(e.target as HTMLElement).closest<HTMLElement>('[data-lesson-exercise]');if(item){anchorTarget.current={el:item,position:'before'};setCursorHint(`Ovanför: "${(item.textContent||'').replace(/^✎\s*/,'').split('·')[0].trim().slice(0,35)}"`);try{const q=JSON.parse(item.dataset.lessonExercise!);if(validExercise(q)){setExercise(q);setOptions(q.options.join('\n'));setGapFacit(q.correctOptions?.join('\n')||'');setMediaItem(null);setMediaFormKind('')}}catch{}}const mItem=(e.target as HTMLElement).closest<HTMLElement>('[data-lesson-media]');if(mItem){anchorTarget.current={el:mItem,position:'after'};setCursorHint(`Under: "${(mItem.textContent||'').split('·')[1]?.trim().slice(0,35)||'mediaspår'}"`);try{const m=JSON.parse(mItem.dataset.lessonMedia!);if(validLessonMedia(m)){setMediaItem(m);setMediaFormKind('');setExercise(null)}}catch{}}const img=(e.target as HTMLElement).closest('img');selectedImage.current=img as HTMLImageElement|null;setHasImage(!!img)}} onPaste={e=>{e.preventDefault();command('insertText',e.clipboardData.getData('text/plain'))}} onDrop={e=>{e.preventDefault();setError('Använd knapparna i verktygsfältet för att lägga in bild, ljud eller film.')}}/>
 {error&&<p role="alert" className="error">{error}</p>}</div>
}
