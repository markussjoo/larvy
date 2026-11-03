import sqlite3, pathlib
c=sqlite3.connect(':memory:');c.execute('PRAGMA foreign_keys=ON')
for p in sorted(pathlib.Path('drizzle').glob('*.sql')):c.executescript(p.read_text())
c.execute("INSERT INTO students VALUES ('s1','owner','Testelev','A')")
c.execute("INSERT INTO invitations(id,owner,student_id,code,created) VALUES ('i1','owner','s1','TESTCODE','2026-11-02')")
c.commit()
insert='INSERT INTO student_sessions (id,student_id,token_hash,expires,created) SELECT ?,student_id,?,?,? FROM invitations WHERE code=? AND used_by IS NULL RETURNING student_id'
update='UPDATE invitations SET used_by=?,used_at=? WHERE code=? AND used_by IS NULL AND EXISTS (SELECT 1 FROM student_sessions WHERE id=?)'
def redeem(session,token,code):
    with c:
        rows=c.execute(insert,(session,token,'2026-12-02','2026-11-02',code)).fetchall()
        c.execute(update,('session:'+session,'2026-11-02',code,session))
    return rows
assert redeem('session1','tokenhash1','WRONG')==[]
assert redeem('session1','tokenhash1','TESTCODE')==[('s1',)]
assert redeem('session2','tokenhash2','TESTCODE')==[]
assert c.execute('SELECT count(*) FROM student_sessions').fetchone()[0]==1
assert c.execute('SELECT used_by FROM invitations').fetchone()[0]=='session:session1'
with c:
    c.execute("DELETE FROM student_sessions WHERE student_id='s1'")
    c.execute("DELETE FROM invitations WHERE student_id='s1'")
    c.execute("DELETE FROM students WHERE id='s1'")
assert c.execute('SELECT count(*) FROM student_sessions').fetchone()[0]==0
print('SQLite checks passed: schema, atomic one-time redemption, reuse rejected, session deletion.')
