 'use client';
import {useState} from 'react';
import LessonContent from './lesson-content';
import {lessonExercises,type Answers} from './lesson-format';
export default function LessonWork({body,initialAnswers='{}',status,save}:{body:string;initialAnswers?:string;status:string;save:(answers:Answers,submit:boolean)=>Promise<string>}){
 const [answers,setAnswers]=useState<Answers>(()=>{try{return JSON.parse(initialAnswers)}catch{return {}}}),[busy,setBusy]=useState(false),[message,setMessage]=useState(''),[error,setError]=useState(''),[dirty,setDirty]=useState(false);
 const locked=['Inlämnad','Godkänd','Ej godkänd'].includes(status),questions=lessonExercises(body);
 async function persist(submit:boolean){setBusy(true);setMessage('');setError('');try{await save(answers,submit);setDirty(false);setMessage(submit?'Lektionen är inlämnad.':'Dina svar är sparade.')}catch(e){setError(e instanceof Error?e.message:'Kunde inte spara svaren')}finally{setBusy(false)}}
 return <><LessonContent body={body} answers={answers} readOnly={locked||busy} onAnswer={(id,value)=>{setAnswers(a=>({...a,[id]:value}));setDirty(true);setMessage('')}}/>{questions.length>0&&!locked&&<p className="note">{dirty?'Du har osparade svar.':'Svara i lektionen. Flera kryssalternativ kan väljas.'}</p>}{!locked&&<div className="actions">{questions.length>0&&<button className="light" disabled={busy} onClick={()=>persist(false)}>Spara svar</button>}<button disabled={busy} onClick={()=>persist(true)}>{busy?'Sparar…':'Lämna in lektion'}</button></div>}{locked&&<p className="note">Lektionen är inlämnad. Dina sparade svar visas ovan.</p>}{message&&<p className="success" role="status">{message}</p>}{error&&<p className="error" role="alert">{error}</p>}</>
}
