'use client';
import LessonContent from './lesson-content';
import LessonWork from './lesson-work';
import {isLesson,isInteractiveMaterial,type Answers} from './lesson-format';
import {demoFetch} from './demo-storage';
import ThemeToggle from './theme-toggle';
import {useEffect,useState} from 'react';
type Moment={id:string;title:string;kind:string;body:string;due:string;status:string;grade:string;comment:string;answers?:string};
type MessageItem={id:string;senderType:'teacher'|'student';senderId:string;senderName:string;recipientType:'student'|'class'|'all'|'teacher';recipientId:string;recipientName:string;content:string;created:string};
type PeerStudent={id:string;name:string;group:string};
const sections=[{name:'Lektion',kind:'Lektion',icon:'▤',tone:'sage',desc:'Läs, öva och besvara uppgifter i lektionen.'},{name:'Prov',kind:'Prov',icon:'▦',tone:'peach',desc:'Visa vad du har lärt dig.'},{name:'Meddelanden',kind:'Meddelanden',icon:'💬',tone:'peach',desc:'Kommunicera med din lärare eller klasskamrater.'},{name:'Framsteg/Resultat',kind:'',icon:'↗',tone:'lavender',desc:'Se hur långt du har kommit.'}];
const done=(p:Moment)=>['Inlämnad','Godkänd','Ej godkänd'].includes(p.status);
export default function StudentPortal({id,demo=false}:{id:string;demo?:boolean}){const request=demo?demoFetch:fetch;const [data,setData]=useState<{student:{id?:string;name:string;group:string};plans:Moment[]}|null>(null),[error,setError]=useState(''),[tab,setTab]=useState('Översikt');
const [messages,setMessages]=useState<MessageItem[]>([]);
const [peers,setPeers]=useState<PeerStudent[]>([]);
const [msgRecipientType,setMsgRecipientType]=useState<'teacher'|'student'>('teacher');
const [msgTargetStudentId,setMsgTargetStudentId]=useState('');
const [msgContent,setMsgContent]=useState('');
const [msgSending,setMsgSending]=useState(false);
const [msgFeedback,setMsgFeedback]=useState('');

async function loadMessages(){
 try{
  const r=await request('/api/messages?studentId='+encodeURIComponent(id));
  if(r.ok){
   const d:any=await r.json();
   setMessages(d.messages||[]);
  }
 }catch{}
}

async function loadPeers(){
 if(demo){
  try{
   const r=await demoFetch('/api/teacher');
   if(r.ok){
    const d:any=await r.json();
    setPeers((d.students||[]).filter((s:any)=>s.id!==id));
   }
  }catch{}
 }
}

useEffect(()=>{
 request('/api/student/'+encodeURIComponent(id)).then(async r=>{
  const d:any=await r.json();
  if(!r.ok)throw Error(d.error);
  setData(d);
 }).catch(e=>setError(e.message));
 loadMessages();
 loadPeers();
},[id,demo]);

async function handleSendMessage(e:React.FormEvent){
 e.preventDefault();
 if(!msgContent.trim()||!data)return;
 setMsgSending(true);
 setMsgFeedback('');
 try{
  let recipientName='Läraren';
  let recipientId='teacher';
  if(msgRecipientType==='student'){
   const target=peers.find(p=>p.id===msgTargetStudentId);
   if(!target)throw new Error('Välj en klasskamrat.');
   recipientId=target.id;
   recipientName=target.name;
  }
  const r=await request('/api/messages',{
   method:'POST',
   headers:{'Content-Type':'application/json'},
   body:JSON.stringify({
    senderType:'student',
    senderId:id,
    senderName:data.student.name,
    recipientType:msgRecipientType,
    recipientId,
    recipientName,
    content:msgContent.trim()
   })
  });
  const res:any=await r.json();
  if(!r.ok)throw new Error(res.error||'Kunde inte skicka meddelande');
  setMsgContent('');
  setMsgFeedback('Meddelandet skickades till '+recipientName+'!');
  await loadMessages();
 }catch(err){
  setMsgFeedback(err instanceof Error?err.message:'Kunde inte skicka meddelandet.');
 }finally{
  setMsgSending(false);
 }
}

const all=data?.plans||[],complete=all.filter(done).length;
const selected=sections.find(s=>s.name===tab);
const visible=all.filter(p=>(selected?.kind==='Lektion'?isLesson(p.kind):p.kind===selected?.kind));
function thumb(kind:string){return '/images/'+({Lektion:'lektion',Uppgift:'uppgifter',Prov:'prov'}[kind]||'framsteg')+'.svg'}
function result(p:Moment){return <div className="student-result"><span><small>RESULTAT</small><b>{p.status==='Godkänd'?'Godkänd':p.status==='Ej godkänd'?'Ej godkänd':p.status==='Inlämnad'?'Inväntar bedömning':'Inte genomfört'}</b></span><span><small>BETYG</small><b>{p.grade||'Ej betygsatt'}</b></span>{p.comment&&<p><small>ÅTERKOPPLING & SJÄLVRÄTTNING</small>{p.comment}</p>}</div>}

return <div className="student-shell"><aside className="student-sidebar"><div className="sidebar-brand-row"><div className="student-logo">lärvy<span>◒</span></div><ThemeToggle/></div><small>Din plats för lärande</small><nav>{[{name:'Översikt',icon:'◫'},...sections].map(s=><button key={s.name} className={tab===s.name?'active':''} aria-current={tab===s.name?'page':undefined} onClick={()=>setTab(s.name)}>{s.icon} &nbsp;{s.name}</button>)}</nav><div className="student-sidebar-bottom"><span className="student-dot"/> ELEVVY<p>Små steg. Nya möjligheter.</p></div></aside><main className="student-main"><header><span className="muted">MIN SKOLDAG / {tab.toUpperCase()}</span><div className="student-account"><a className="view-switch" href="/larare-demo" title="Tillfällig genväg till lärarvyn">⇄ Växla till lärarvy</a><span>{data?.student.name||'Elev'}</span><span className="student-avatar">{data?.student.name.split(' ').map(x=>x[0]).slice(0,2).join('')||'E'}</span><button className="light" hidden={demo} onClick={async()=>{const r=await fetch('/api/student/logout',{method:'POST'});if(r.ok)window.location.href='/aktivera'}}>Logga ut</button></div></header>{error?<div className="panel"><p className="error">{error}</p><a href="/aktivera">Logga in som elev ↗</a></div>:!data?<p>Hämtar elevsidan…</p>:<><div className="student-heading"><div><small>KLASS {data.student.group}</small><h1>{tab==='Översikt'?`Hej ${data.student.name.split(' ')[0]}!`:tab}</h1><p className="muted">{tab==='Översikt'?'Din undervisning, samlad på ett ställe.':selected?.desc}</p></div><span className="student-pill">{complete} / {all.length} avklarade</span></div>
{tab==='Översikt'&&<><section className="student-welcome"><div><small>ETT STEG I TAGET</small><h2>Ditt nästa steg börjar här.</h2><p>Hitta dina lektioner, jobba med uppgifter och följ dina framsteg.</p><button onClick={()=>setTab('Framsteg/Resultat')}>Visa mina framsteg ↗</button></div><div className="student-orbit" aria-hidden="true">✳</div></section><h3 className="student-section-title">Vad vill du arbeta med?</h3><div className="student-departments">{sections.map(s=>{const items=s.kind?all.filter(p=>(s.kind==='Lektion'?isLesson(p.kind):p.kind===s.kind)):all,n=items.filter(done).length;return <button className={'student-department '+s.tone} key={s.name} onClick={()=>setTab(s.name)}><img className="section-thumbnail" src={thumb(s.kind)} alt=""/><div className="department-content"><h3>{s.name}</h3><p>{s.desc}</p><div className="student-meter"><span style={{width:`${items.length?n/items.length*100:0}%`}}/></div><small>{n} av {items.length} avklarade · {items.length-n} kvar</small></div><span className="department-arrow" aria-hidden="true">↗</span></button>})}</div><div className="panel"><h3>Kvar att göra</h3>{all.filter(p=>!done(p)).length?all.filter(p=>!done(p)).map(p=><div className="student-list-row" key={p.id}><span className={'student-mini-icon '+(sections.find(s=>s.kind===(isLesson(p.kind)?'Lektion':p.kind))?.tone||'sage')}>{sections.find(s=>s.kind===(isLesson(p.kind)?'Lektion':p.kind))?.icon}</span><div><b>{p.title}</b><small>{p.kind} · {p.due||'Inget datum angivet'}</small></div><button className="light" onClick={()=>setTab(sections.find(s=>s.kind===(isLesson(p.kind)?'Lektion':p.kind))?.name||'Översikt')}>Öppna ↗</button></div>):<p className="muted">{all.length?'Allt är avklarat. Bra jobbat!':'Din lärare har inte tilldelat några moment ännu.'}</p>}</div></>}
{tab==='Framsteg/Resultat'&&<><div className="student-progress-banner"><div><small>DIN RESA</small><h2>{complete} av {all.length} moment avklarade</h2><p>{all.length-complete} kvar att göra</p></div><strong>{all.length?Math.round(complete/all.length*100):0}%</strong></div><div className="student-summary-grid">{sections.filter(s=>s.kind).map(s=>{const items=all.filter(p=>(s.kind==='Lektion'?isLesson(p.kind):p.kind===s.kind)),n=items.filter(done).length;return <section className={'student-summary '+s.tone} key={s.name}><div className="summary-title"><img className="section-thumbnail small" src={thumb(s.kind)} alt=""/><h3>{s.name}</h3></div><div className="student-metrics"><div><strong>{items.length}</strong><small>Totalt</small></div><div><strong>{n}</strong><small>Avklarade</small></div><div><strong>{items.length-n}</strong><small>Kvar</small></div></div><div className="student-meter"><span style={{width:`${items.length?n/items.length*100:0}%`}}/></div></section>})}</div><p className="muted">Avklarade moment är inlämnade eller bedömda av läraren. Ett genomfört prov kan fortfarande invänta bedömning eller behöva kompletteras.</p><div className="panel"><h3>Provresultat</h3>{all.filter(p=>p.kind==='Prov').map(p=><div className="student-exam-result" key={p.id}><h3>{p.title}</h3>{result(p)}</div>)}{!all.some(p=>p.kind==='Prov')&&<p className="muted">Inga prov tilldelade ännu.</p>}</div></>}
{selected?.kind==='Meddelanden'&&<div className="messages-container">
 <form className="panel message-composer" onSubmit={handleSendMessage}>
  <h3>Skriv ett meddelande</h3>
  <label>Vem vill du skriva till?</label>
  <div className="actions" style={{marginTop:6,marginBottom:16}}>
   <button type="button" className={msgRecipientType==='teacher'?'':'light'} onClick={()=>setMsgRecipientType('teacher')}>Läraren 👩‍🏫</button>
   <button type="button" className={msgRecipientType==='student'?'':'light'} onClick={()=>{setMsgRecipientType('student');if(!msgTargetStudentId&&peers[0])setMsgTargetStudentId(peers[0].id)}} disabled={!peers.length}>Klasskamrat 👤</button>
  </div>
  {msgRecipientType==='teacher'&&<p className="muted">Meddelandet skickas direkt till din lärare.</p>}
  {msgRecipientType==='student'&&<>
   <label htmlFor="student-msg-peer">Välj elev</label>
   <select id="student-msg-peer" value={msgTargetStudentId||peers[0]?.id||''} onChange={e=>setMsgTargetStudentId(e.target.value)}>
    {peers.map(p=><option key={p.id} value={p.id}>{p.name} ({p.group})</option>)}
   </select>
  </>}
  <label htmlFor="student-msg-content">Ditt meddelande</label>
  <textarea id="student-msg-content" rows={3} maxLength={1000} value={msgContent} onChange={e=>setMsgContent(e.target.value)} placeholder="Skriv ett meddelande här..." required/>
  {msgFeedback&&<p className={msgFeedback.includes('skickades')?'success':'error'} style={{margin:'8px 0'}}>{msgFeedback}</p>}
  <div className="actions" style={{justifyContent:'space-between',alignItems:'center'}}>
   <span className="muted" style={{fontSize:12}}>{msgContent.length}/1000 tecken</span>
   <button disabled={msgSending||!msgContent.trim()}>{msgSending?'Skickar...':'Skicka ✉'}</button>
  </div>
 </form>

 <div className="panel">
  <h3>Mina meddelanden ({messages.length})</h3>
  <div className="message-list" style={{marginTop:14}}>
   {messages.map(m=>{
    const isMe=m.senderId===id;
    return <article key={m.id} className="message-card" style={isMe?{borderLeft:'4px solid #10b981'}:{borderLeft:'4px solid #7c3aed'}}>
     <div className="message-header">
      <div className="message-sender">
       <span>{isMe?'Du':m.senderName}</span>
       <span className={'message-badge '+(m.senderType==='teacher'?'message-badge-teacher':'message-badge-student')}>{m.senderType==='teacher'?'Lärare':'Elev'}</span>
      </div>
      <span className="message-time">{new Date(m.created).toLocaleString('sv-SE', {dateStyle:'short',timeStyle:'short'})}</span>
     </div>
     <div className="message-recipient-info">
      <span>Till:</span>
      <b>{m.recipientType==='all'?'Alla elever':m.recipientType==='class'?`Klass ${m.recipientId}`:m.recipientId===id?'Dig':m.recipientName}</b>
      <span className={'message-badge '+(m.recipientType==='all'?'message-badge-all':m.recipientType==='class'?'message-badge-class':'message-badge-student')}>{m.recipientType==='all'?'Gemensamt anslag':m.recipientType==='class'?'Klassutskick':m.recipientType==='teacher'?'Lärare':'Direktmeddelande'}</span>
     </div>
     <p className="message-content">{m.content}</p>
    </article>;
   })}
   {!messages.length&&<p className="muted">Du har inga meddelanden än.</p>}
  </div>
 </div>
</div>}
{selected?.kind&&selected.kind!=='Meddelanden'&&<><div className={'student-category-banner '+selected.tone}><img className="section-thumbnail" src={thumb(selected.kind)} alt=""/><div><b>{visible.length} {tab==='Lektion'?'lektioner':tab==='Prov'?'prov':'uppgifter'}</b><p>{visible.filter(done).length} avklarade · {visible.filter(p=>!done(p)).length} kvar att göra</p></div></div>{visible.map(p=><article className="panel student-moment" key={p.id}><div className="row"><span className="badge">{isLesson(p.kind)?'Lektion':p.kind}</span><span className={'badge '+(done(p)?'student-complete':'')}>{p.status}</span></div><h3>{p.title}</h3>{isInteractiveMaterial(p.kind)?<LessonWork key={p.id} body={p.body} initialAnswers={p.answers} status={p.status} kind={p.kind} save={async(answers:Answers,submit:boolean)=>{const r=await request('/api/student/'+encodeURIComponent(id),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({planId:p.id,answers,submit})});const d:any=await r.json();if(!r.ok)throw Error(d.error||'Kunde inte spara');setData(prev=>prev?{...prev,plans:prev.plans.map(x=>x.id===p.id?{...x,status:d.status,comment:d.comment??x.comment,body:d.body||x.body,answers:JSON.stringify(answers)}:x)}:prev);return d}}/>:<LessonContent body={p.body}/>}<p className="muted">Datum: {p.due||'Ej satt'}</p>{p.kind==='Prov'?result(p):(p.grade||p.comment)&&result(p)}</article>)}{!visible.length&&<div className="panel"><h3>Här är det tomt än så länge</h3><p className="muted">Din lärare har inte tilldelat några {tab==='Lektion'?'lektioner':tab==='Prov'?'prov':'uppgifter'} ännu.</p></div>}</>}
<p className="note">Planering och resultat hämtas från läraren. Både lektionssvar och prov kan sparas och lämnas in digitalt här, med automatisk rättning av flervalsfrågor.</p></>}</main></div>}
