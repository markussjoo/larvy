import {getChatGPTUser, type ChatGPTUser} from './chatgpt-auth';
const DEFAULT_TEACHER: ChatGPTUser = {
  userId: 'teacher_markus',
  displayName: 'Markus Sjöö',
  email: 'markus.sjoo@gmail.com',
  fullName: 'Markus Sjöö',
};
export async function getTeacherUser(): Promise<ChatGPTUser> {
  const user = await getChatGPTUser();
  if (user && (user.email.toLowerCase() === 'markus.sjoo@gmail.com' || user.email.toLowerCase() === 'seedy@sites.test')) {
    return user;
  }
  return DEFAULT_TEACHER;
}
