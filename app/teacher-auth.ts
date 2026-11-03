import {getChatGPTUser} from './chatgpt-auth';
export async function getTeacherUser(){const user=await getChatGPTUser();return user?.email.toLowerCase()==='markus.sjoo@gmail.com'?user:null}
