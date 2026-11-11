import {getTeacherUser} from '../../teacher-auth';
import {getDb} from '../../../db';
import {messages,students,invitations} from '../../../db/schema';
import {and,eq,or} from 'drizzle-orm';
import {getStudentSession} from '../../student-session';

export const dynamic = 'force-dynamic';

const json = (v: unknown, s = 200) =>
  Response.json(v, { status: s, headers: { 'Cache-Control': 'no-store' } });

export async function GET(req: Request) {
  const teacher = await getTeacherUser();
  const studentSession = await getStudentSession(req);

  if (!teacher && !studentSession) {
    return json({ error: 'Behörighet saknas. Logga in.' }, 401);
  }

  const db = getDb();
  const url = new URL(req.url);

  // If teacher logged in
  if (teacher) {
    const owner = teacher.userId;
    const allMessages = await db
      .select()
      .from(messages)
      .where(eq(messages.owner, owner))
      .orderBy(messages.created);
    return json({ messages: allMessages.reverse() });
  }

  // If student session
  if (studentSession) {
    const studentId = studentSession.studentId;
    const [student] = await db
      .select()
      .from(students)
      .where(eq(students.id, studentId));
    if (!student) {
      return json({ error: 'Elev hittades inte.' }, 404);
    }
    const studentGroup = student.group?.trim() || '';

    // Student sees messages:
    // 1. Sent to 'all'
    // 2. Sent to their class
    // 3. Sent to them directly
    // 4. Sent by them
    const studentMsgs = await db
      .select()
      .from(messages)
      .where(
        and(
          eq(messages.owner, student.owner),
          or(
            eq(messages.recipientType, 'all'),
            and(eq(messages.recipientType, 'class'), eq(messages.recipientId, studentGroup)),
            and(eq(messages.recipientType, 'student'), eq(messages.recipientId, studentId)),
            eq(messages.senderId, studentId)
          )
        )
      )
      .orderBy(messages.created);

    return json({ messages: studentMsgs.reverse() });
  }

  return json({ error: 'Ej behörig' }, 403);
}

export async function POST(req: Request) {
  const teacher = await getTeacherUser();
  const studentSession = await getStudentSession(req);

  if (!teacher && !studentSession) {
    return json({ error: 'Behörighet saknas. Logga in.' }, 401);
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Ogiltig data' }, 400);
  }

  const content = String(body.content || '').trim();
  if (!content) {
    return json({ error: 'Meddelandetext kan inte vara tom.' }, 400);
  }
  if (content.length > 2000) {
    return json({ error: 'Meddelandet är för långt (max 2000 tecken).' }, 400);
  }

  const db = getDb();
  const id = 'msg-' + crypto.randomUUID();
  const created = new Date().toISOString();

  if (teacher) {
    const owner = teacher.userId;
    const recipientType = body.recipientType; // 'student' | 'class' | 'all'
    const recipientId = String(body.recipientId || '').trim();
    const recipientName = String(body.recipientName || '').trim();

    if (!['student', 'class', 'all'].includes(recipientType)) {
      return json({ error: 'Ogiltig mottagartyp.' }, 400);
    }

    await db.insert(messages).values({
      id,
      owner,
      senderType: 'teacher',
      senderId: 'teacher',
      senderName: teacher.name || 'Lärare',
      recipientType,
      recipientId: recipientId || '*',
      recipientName: recipientName || (recipientType === 'all' ? 'Alla elever' : recipientId),
      content,
      created,
    });

    return json({ ok: true, id });
  }

  if (studentSession) {
    const studentId = studentSession.studentId;
    const [student] = await db
      .select()
      .from(students)
      .where(eq(students.id, studentId));
    if (!student) {
      return json({ error: 'Elev saknas' }, 404);
    }

    const recipientType = body.recipientType; // 'teacher' | 'student'
    if (!['teacher', 'student'].includes(recipientType)) {
      return json({ error: 'Mottagare måste vara lärare eller elev.' }, 400);
    }

    let recipientId = 'teacher';
    let recipientName = 'Lärare';

    if (recipientType === 'student') {
      recipientId = String(body.recipientId || '').trim();
      const [targetStudent] = await db
        .select()
        .from(students)
        .where(and(eq(students.id, recipientId), eq(students.owner, student.owner)));
      if (!targetStudent) {
        return json({ error: 'Klasskamraten hittades inte.' }, 404);
      }
      recipientName = targetStudent.name;
    }

    await db.insert(messages).values({
      id,
      owner: student.owner,
      senderType: 'student',
      senderId: student.id,
      senderName: student.name,
      recipientType,
      recipientId,
      recipientName,
      content,
      created,
    });

    return json({ ok: true, id });
  }

  return json({ error: 'Kunde inte skicka' }, 500);
}
