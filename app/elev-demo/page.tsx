 'use client';
import {useEffect,useState} from 'react';
import {demoFetch} from '../demo-storage';
import StudentPortal from '../student-portal';
export default function Demo(){const [students,setStudents]=useState<{id:string;name:string;group?:string}[]>([]),[id,setId]=useState('');useEffect(()=>{const params=new URLSearchParams(window.location.search),requested=params.get('elev');demoFetch('/api/teacher').then(r=>r.json()).then((d:any)=>{setStudents(d.students);setId(d.students.some((s:any)=>s.id===requested)?requested:d.students[0]?.id||'')})},[]);return <><div className="demo-student-picker"><b>Elevvy · välj elev att testa som</b><label>Välj elev<select value={id} onChange={e=>setId(e.target.value)}>{students.map(s=><option key={s.id} value={s.id}>{s.name}{s.group?' ('+s.group+')':''}</option>)}</select></label>{!students.length&&<p>Skapa en elev och tilldela en lektion i <a href="/larare-demo">lärarvyn</a>.</p>}</div>{id&&<StudentPortal key={id} id={id} demo/>}</>}
