 'use client';
import {useEffect,useState} from 'react';
import {demoFetch} from '../demo-storage';
import StudentPortal from '../student-portal';
export default function Demo(){const [students,setStudents]=useState<{id:string;name:string}[]>([]),[id,setId]=useState('');useEffect(()=>{demoFetch('/api/teacher').then(r=>r.json()).then((d:any)=>{setStudents(d.students);setId(d.students[0]?.id||'')})},[]);return <><div className="demo-student-picker"><b>Elevdemo · sparas i denna webbläsare</b><label>Välj demoelev<select value={id} onChange={e=>setId(e.target.value)}>{students.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select></label>{!students.length&&<p>Skapa en demoelev och tilldela en lektion i <a href="/larare-demo">lärarvyn</a>.</p>}</div>{id&&<StudentPortal key={id} id={id} demo/>}</>}
