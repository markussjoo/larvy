'use client';
import {useEffect,useState} from 'react';
import {readDemoFile,type LessonFile} from './lesson-files';
export default function LessonFileLink({file}:{file:LessonFile}){
 const [error,setError]=useState(''),[url,setUrl]=useState('');
 useEffect(()=>{if(!file.demo)return;let disposed=false,localUrl='';setUrl('');setError('');readDemoFile(file.id).then(blob=>{if(disposed)return;localUrl=URL.createObjectURL(blob);setUrl(localUrl)},e=>{if(!disposed)setError(e instanceof Error?e.message:'Filen kunde inte hämtas.')});return()=>{disposed=true;if(localUrl)URL.revokeObjectURL(localUrl)}},[file.id,file.demo]);
 return <span className="lesson-file-attachment"><a href={file.demo?url||'#':'/api/lesson-files/'+file.id} download={file.name} aria-disabled={file.demo&&!url} onClick={e=>{if(file.demo&&!url){e.preventDefault();setError('Filen förbereds. Försök igen om en stund.')}}}>▤ {file.name} <small>↓ {file.demo&&!url&&!error?'Förbereder fil…':'Ladda ner'} · {file.size<1024*1024?Math.ceil(file.size/1024)+' kB':(file.size/1024/1024).toFixed(1)+' MB'}</small></a>{error&&<span role="alert" className="error">{error}</span>}</span>
}
