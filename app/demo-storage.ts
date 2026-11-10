import {validAnswers,isInteractiveMaterial,materialLessonBody,validateLesson,hasLessonContent,stripAnswerKey,gradeLesson} from './lesson-format';
// Isolated, device-local teacher demonstration. Never accesses production APIs.
const KEY='larvy-teacher-demo-v2';
const isSubmitted=(status:string)=>['Inlämnad','Godkänd','Ej godkänd'].includes(status);
function seedData(){
 const now=new Date().toISOString();
 const students=[
  {id:'s-1',name:'Alice Lindström',group:'Klass 1'},
  {id:'s-2',name:'Liam Bergström',group:'Klass 1'},
  {id:'s-3',name:'Astrid Sjöberg',group:'Klass 1'},
  {id:'s-4',name:'Noah Holm',group:'Klass 2'},
  {id:'s-5',name:'Vera Sandberg',group:'Klass 2'},
  {id:'s-6',name:'William Engström',group:'Klass 2'},
  {id:'s-7',name:'Alma Nyström',group:'Klass 3'},
  {id:'s-8',name:'Hugo Wallin',group:'Klass 3'},
  {id:'s-9',name:'Elsa Ekström',group:'Klass 3'},
 ];
 const invitations=students.map((s,i)=>({
  id:'inv-'+(i+1),
  studentId:s.id,
  code:'DEMO000'+(i+1),
  created:now,
  usedAt:null,
  usedBy:null,
 }));
 const materials=[
  {
   id:'m-1',
   kind:'Lektion',
   title:'Fotosyntesen och växternas liv',
   publishedAt:now,
   body:'LARVY_LESSON_V1:'+JSON.stringify([
    {tag:'h2',children:[{tag:'#text',text:'Hur växter skapar energi'}]},
    {tag:'p',children:[{tag:'#text',text:'Fotosyntesen är den process där gröna växter använder solljus, vatten och koldioxid för att bilda druvsocker och syre.'}]},
    {tag:'exercise',exercise:{id:'q-lesson-1',type:'choice',prompt:'Vilka tre delar behövs för att fotosyntesen ska fungera?',options:['Solljus','Vatten','Koldioxid','Kvävgas'],correctOptions:['Solljus','Vatten','Koldioxid']}},
    {tag:'exercise',exercise:{id:'q-lesson-2',type:'text',prompt:'Förklara med egna ord varför fotosyntesen är viktig för oss människor.',options:[]}},
   ]),
  },
  {
   id:'m-2',
   kind:'Prov',
   title:'Biologiprov: Ekosystem & Fotosyntes',
   publishedAt:now,
   body:'LARVY_LESSON_V1:'+JSON.stringify([
    {tag:'p',children:[{tag:'#text',text:'Besvara flervalsfrågorna och fritextfrågan nedan. Flervalsfrågorna rättas automatiskt vid inlämning.'}]},
    {tag:'exercise',exercise:{id:'q-exam-1',type:'choice',prompt:'Vilken gas bildas som restprodukt vid fotosyntesen?',options:['Syre','Koldioxid','Metan'],correctOptions:['Syre']}},
    {tag:'exercise',exercise:{id:'q-exam-2',type:'choice',prompt:'Var i växtcellen sker fotosyntesen?',options:['I kloroplasterna','I cellkärnan','I cellväggen'],correctOptions:['I kloroplasterna']}},
    {tag:'exercise',exercise:{id:'q-exam-3',type:'text',prompt:'Ge ett exempel på en näringskedja i en svensk skog.',options:[]}},
   ]),
  },
  {
   id:'m-3',
   kind:'Lektion',
   title:'Språkvägen C1 – Kapitel 5 Berlinmuren (Grammatik)',
   publishedAt:now,
   body:'LARVY_LESSON_V1:'+JSON.stringify([
    {tag:'div',children:[{tag:'div',children:[{tag:'span',children:[{tag:'#text',text:'Kapitel 5 – Berlinmuren'}]},{tag:'span',children:[{tag:'#text',text:'Språkvägen s. 184–186'}]}]}]},
    {tag:'h2',children:[{tag:'#text',text:'E Substantiv'}]},
    {tag:'p',children:[{tag:'#text',text:'Skriv substantiven i singular eller plural.'}]},
    {tag:'exercise',exercise:{id:'q-substantiv-singular-plural',type:'gap',prompt:'Skriv substantiven i singular eller plural:',options:['1. flera gränser ____','2. flera somrar ____','3. en dag ____','4. flera murar ____','5. flera huvudstäder ____'],correctOptions:['en gräns','en sommar','flera dagar','en mur','en huvudstad']}},
    {tag:'h2',children:[{tag:'#text',text:'Bestämd eller obestämd form'}]},
    {tag:'p',children:[{tag:'#text',text:'Skriv substantiven i bestämd eller obestämd form.'}]},
    {tag:'exercise',exercise:{id:'q-substantiv-bestamd-obestamd',type:'gap',prompt:'Fyll i rätt form av substantiven:',options:['6. (ett krig) Efter ____ delade man Tyskland i två delar.','7. (en gräns) ____ mellan Öst- och Västberlin var öppen före 1961.','8. (en sommar) Under ____ 1961 flydde tusentals människor.','9. (en dag) Ibland flydde 5 000 människor under ____ ...','10. (en mur) 1961 byggdes en ____ runt Västberlin.'],correctOptions:['kriget','Gränsen','sommaren','en enda dag','mur']}}
   ]),
  },
 ];
 const plans=[
  {id:'p-1',studentId:'s-1',materialId:'m-1',due:'2026-11-20',status:'Inlämnad',grade:'',comment:'Självrättning: 1 av 1 rätt på flervalsfrågor.',answers:JSON.stringify({'q-lesson-1':['Solljus','Vatten','Koldioxid'],'q-lesson-2':'För att växterna producerar syre som vi andas och mat till djur och människor.'}),updated:now},
  {id:'p-2',studentId:'s-1',materialId:'m-2',due:'2026-11-25',status:'Ej påbörjad',grade:'',comment:'',answers:'{}',updated:now},
  {id:'p-3',studentId:'s-1',materialId:'m-3',due:'2026-11-28',status:'Ej påbörjad',grade:'',comment:'',answers:'{}',updated:now},
  {id:'p-4',studentId:'s-2',materialId:'m-3',due:'2026-11-28',status:'Ej påbörjad',grade:'',comment:'',answers:'{}',updated:now},
  {id:'p-5',studentId:'s-2',materialId:'m-1',due:'2026-11-20',status:'Ej påbörjad',grade:'',comment:'',answers:'{}',updated:now},
  {id:'p-6',studentId:'s-4',materialId:'m-2',due:'2026-11-25',status:'Inlämnad',grade:'',comment:'Självrättning: 2 av 2 rätt på flervalsfrågor.',answers:JSON.stringify({'q-exam-1':['Syre'],'q-exam-2':['I kloroplasterna'],'q-exam-3':'Blåbärsris -> Skogsmus -> Räv'}),updated:now},
 ];
 return {students,materials,plans,invitations,drafts:[]};
}
function read(){
 const saved=localStorage.getItem(KEY);
 if(saved){
  try{
   const parsed=JSON.parse(saved);
   if(parsed&&Array.isArray(parsed.students)&&parsed.students.length>0)return parsed;
  }catch{}
 }
 const initial=seedData();
 localStorage.setItem(KEY,JSON.stringify(initial));
 return initial;
}
function reply(value:any,status=200){return Response.json(value,{status})}
export async function demoFetch(input:RequestInfo|URL,init?:RequestInit){try{const path=String(input),data=read(),b=init?.body?JSON.parse(String(init.body)):null,now=new Date().toISOString(),id=crypto.randomUUID();if(path==='/api/import-web')return reply({error:'Webbimport kräver lärarinloggning. Du kan testa med PDF, Word eller inklistrad text här i demovyn.'},400);
if(path.startsWith('/api/student/')){const studentId=decodeURIComponent(path.slice('/api/student/'.length)),student=data.students.find((s:any)=>s.id===studentId);if(!student)return reply({error:'Välj en demoelev i lärarvyn först.'},404);if(!b)return reply({student,plans:data.plans.filter((x:any)=>x.studentId===studentId).map((plan:any)=>{const m=data.materials.find((m:any)=>m.id===plan.materialId);const fullBody=materialLessonBody(m?.kind||'Lektion',m?.body||'');return {...plan,title:m?.title||'',body:isSubmitted(plan.status)?fullBody:stripAnswerKey(fullBody),kind:m?.kind||'Lektion'}})});const plan=data.plans.find((x:any)=>x.id===b.planId&&x.studentId===studentId),material=data.materials.find((m:any)=>m.id===plan?.materialId);const fullBody=material?materialLessonBody(material.kind,material.body):'';if(!plan||!material||!isInteractiveMaterial(material.kind)||typeof b.submit!=='boolean'||!validAnswers(fullBody,b.answers))return reply({error:'Ogiltiga svar'},400);if(isSubmitted(plan.status))return reply({error:'Momentet är redan inlämnat eller bedömt.'},409);const autoGrade=b.submit?gradeLesson(fullBody,b.answers):null;const autoSummary=autoGrade&&autoGrade.totalGradable>0?`Självrättning: ${autoGrade.correctCount} av ${autoGrade.totalGradable} rätt på flervalsfrågor.`:'';const nextComment=autoSummary?(plan.comment?`${autoSummary}\n${plan.comment}`:autoSummary):plan.comment;Object.assign(plan,{answers:JSON.stringify(b.answers),status:b.submit?'Inlämnad':'Pågår',comment:nextComment,updated:now});localStorage.setItem(KEY,JSON.stringify(data));return reply({ok:true,status:plan.status,comment:nextComment,...(b.submit?{body:fullBody,autoGrade:{correctCount:autoGrade!.correctCount,totalGradable:autoGrade!.totalGradable}}:{})})}
if(path==='/api/teacher'){if(!b)return reply(data);if(b.action==='student'){if(!b.name?.trim()||!b.group?.trim())return reply({error:'Ange namn och klass'},400);data.students.push({id,name:b.name.trim(),group:b.group.trim()});const code=crypto.randomUUID().replaceAll('-','').toUpperCase();data.invitations.push({id:crypto.randomUUID(),studentId:id,code,created:now,usedAt:null});localStorage.setItem(KEY,JSON.stringify(data));return reply({ok:true,studentId:id,code})}if(b.action==='material')data.materials.push({id,kind:b.kind==='Uppgift'?'Lektion':b.kind,title:b.title,body:b.body});else if(b.action==='update-material'){const material=data.materials.find((m:any)=>m.id===b.id);if(!material)return reply({error:'Innehållet hittades inte.'},404);if(!b.title?.trim()||typeof b.body!=='string'||!validateLesson(b.body)||!hasLessonContent(b.body))return reply({error:'Kontrollera rubrik och innehåll.'},400);Object.assign(material,{kind:b.kind==='Uppgift'?'Lektion':b.kind,title:b.title.trim(),body:b.body});localStorage.setItem(KEY,JSON.stringify(data));return reply({ok:true,updatedMaterialId:material.id})}else if(b.action==='duplicate-material'){const src=data.materials.find((m:any)=>m.id===b.id);if(!src)return reply({error:'Innehållet hittades inte.'},404);data.materials.unshift({id,kind:src.kind,title:(src.title+' (Kopia)').slice(0,160),body:src.body,publishedAt:''});localStorage.setItem(KEY,JSON.stringify(data));return reply({ok:true,duplicatedMaterialId:id})}else if(b.action==='publish-material'){const material=data.materials.find((m:any)=>m.id===b.id);if(!material||!isInteractiveMaterial(material.kind))return reply({error:'Momentet hittades inte.'},404);if(!material.title.trim()||!validateLesson(material.body)||!hasLessonContent(material.body))return reply({error:'Momentet behöver en rubrik och giltigt innehåll innan publicering.'},400);if(!material.publishedAt)material.publishedAt=now;localStorage.setItem(KEY,JSON.stringify(data));return reply({ok:true,publishedMaterialId:material.id})}else if(b.action==='assign'){if(!b.materialIds?.length)return reply({error:'Välj minst ett moment'},400);let targetStudents=data.students.filter((s:any)=>s.id===b.studentId);if(typeof b.group==='string'&&b.group.trim())targetStudents=b.group==='*'?data.students:data.students.filter((s:any)=>s.group?.trim()===b.group.trim());else if(Array.isArray(b.studentIds)&&b.studentIds.length)targetStudents=data.students.filter((s:any)=>b.studentIds.includes(s.id));if(!targetStudents.length)return reply({error:'Välj mottagare'},400);const existingSet=new Set(data.plans.map((p:any)=>`${p.studentId}:${p.materialId}`));let assignedCount=0,skippedCount=0;for(const st of targetStudents){for(const materialId of b.materialIds){if(existingSet.has(`${st.id}:${materialId}`)){skippedCount++;continue}data.plans.push({id:crypto.randomUUID(),studentId:st.id,materialId,due:b.due,status:'Ej påbörjad',grade:'',comment:'',updated:now});assignedCount++}}localStorage.setItem(KEY,JSON.stringify(data));return reply({ok:true,assignedCount,skippedCount,studentCount:targetStudents.length})}else if(b.action==='delete-materials'){const rawIds=Array.isArray(b.materialIds)?b.materialIds:(typeof b.id==='string'?[b.id]:[]);const ids=[...new Set(rawIds.filter((x:any)=>typeof x==='string'&&x.length>0))] as string[];if(!ids.length)return reply({error:'Markera minst en lektion eller ett prov att radera.'},400);const set=new Set(ids);const before=data.materials.length;data.materials=data.materials.filter((m:any)=>!set.has(m.id));if(data.materials.length===before)return reply({error:'Det markerade innehållet hittades inte.'},404);data.plans=data.plans.filter((p:any)=>!set.has(p.materialId));if(Array.isArray(data.drafts))data.drafts.forEach((d:any)=>{if(d.materialId&&set.has(d.materialId)){d.materialId=null;d.status='draft'}});localStorage.setItem(KEY,JSON.stringify(data));return reply({ok:true,deletedMaterialIds:ids})}else if(b.action==='result'){const p=data.plans.find((p:any)=>p.id===b.id);if(!p)return reply({error:'Momentet saknas'},404);if(b.status==='Godkänd'&&b.grade==='F'||b.status==='Ej godkänd'&&['A','B','C','D','E','G','VG'].includes(b.grade))return reply({error:'Betyget stämmer inte med status'},400);Object.assign(p,{status:b.status,grade:b.grade,comment:b.comment,updated:now})}else if(b.action==='delete-student'){const s=data.students.find((s:any)=>s.id===b.studentId);if(!s||s.name!==b.confirmName)return reply({error:'Bekräfta elevens namn'},400);data.students=data.students.filter((s:any)=>s.id!==b.studentId);data.plans=data.plans.filter((p:any)=>p.studentId!==b.studentId);data.invitations=data.invitations.filter((i:any)=>i.studentId!==b.studentId);localStorage.setItem(KEY,JSON.stringify(data));return reply({ok:true,deletedStudentId:b.studentId})}else if(b.action==='new-invitation'){const code=crypto.randomUUID().replaceAll('-','').toUpperCase();data.invitations=data.invitations.filter((i:any)=>i.studentId!==b.studentId);data.invitations.push({id,studentId:b.studentId,code,created:now,usedAt:null});localStorage.setItem(KEY,JSON.stringify(data));return reply({ok:true,studentId:b.studentId,code})}else return reply({error:'Okänd demoåtgärd'},400)}
else if(path==='/api/lesson-drafts'){if(!b)return reply({drafts:data.drafts});if(b.action==='delete'){const draft=data.drafts.find((d:any)=>d.id===b.id&&d.updated===b.updated);if(!draft)return reply({error:'Utkastet har ändrats eller finns inte längre.'},409);data.drafts=data.drafts.filter((d:any)=>d.id!==b.id);localStorage.setItem(KEY,JSON.stringify(data));return reply({ok:true,deletedDraftId:b.id})}if(b.action==='save'){if(typeof b.body!=='string'||!validateLesson(b.body))return reply({error:'Lektionen är för stor eller innehåller ogiltigt material.'},400);const draft={id:b.id||id,title:b.title,body:b.body,sources:JSON.stringify(b.sources),status:'draft',materialId:null,updated:now};const i=data.drafts.findIndex((d:any)=>d.id===draft.id);if(i>=0&&data.drafts[i].status!=='draft')return reply({error:'Utkastet är redan färdigt.'},409);if(i>=0)data.drafts[i]=draft;else data.drafts.unshift(draft);localStorage.setItem(KEY,JSON.stringify(data));return reply({draft})}if(b.action==='publish'){const draft=data.drafts.find((d:any)=>d.id===b.id&&d.status==='draft');if(!draft||!hasLessonContent(draft.body))return reply({error:'Utkastet saknas eller är tomt'},400);if(b.updated!==undefined&&b.updated!==draft.updated)return reply({error:'Utkastet har ändrats. Ladda om listan.'},409);const targetKind=b.kind==='Prov'?'Prov':'Lektion';data.materials.push({id,kind:targetKind,title:draft.title,body:draft.body});Object.assign(draft,{status:'published',materialId:id,updated:now})}else return reply({error:'Okänd demoåtgärd'},400)}else return reply({error:'Denna funktion ingår inte i demonstrationen'},400);localStorage.setItem(KEY,JSON.stringify(data));return reply({ok:true})}catch{return reply({error:'Demodata kunde inte sparas. Kontrollera webbläsarens lagringsinställningar.'},400)}}
