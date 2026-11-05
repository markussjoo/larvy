'use client';
import {use} from 'react';
import StudentPortal from '../../student-portal';
export default function Student({params}:{params:Promise<{id:string}>}){return <StudentPortal id={use(params).id}/>}