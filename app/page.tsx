'use client';
import Teacher from './teacher';
export default function Home(){
 const isStaticHost = typeof window !== 'undefined' && window.location.hostname.endsWith('github.io');
 return <Teacher demo={isStaticHost}/>;
}
