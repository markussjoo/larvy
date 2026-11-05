 'use client';
import {createRoot} from 'react-dom/client';
import LessonContent from './lesson-content';
export function openLessonPreview(title:string,body:string){
 const preview=window.open('','_blank','popup,width=1050,height=850,scrollbars=yes,resizable=yes');
 if(!preview)return false;
 preview.opener=null;preview.document.title='Förhandsvisning – '+(title||'Lektion');
 document.querySelectorAll('link[rel="stylesheet"],style').forEach(style=>preview.document.head.appendChild(style.cloneNode(true)));
 preview.document.documentElement.lang='sv';preview.document.body.className=document.body.className;
 const root=preview.document.createElement('div');root.style.cssText='max-width:1000px;margin:0 auto;padding:32px 24px';preview.document.body.appendChild(root);
 createRoot(root).render(<article className="lesson-preview finished-lesson"><small>FÖRHANDSVISNING · SPARAT UTKAST</small><h1>{title||'Lektionen saknar rubrik'}</h1><LessonContent body={body||'Ingen text ännu.'}/></article>);
 preview.focus();return true;
}
