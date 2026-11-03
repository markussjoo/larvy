import sqlite3,pathlib,re
c=sqlite3.connect(':memory:');c.execute('PRAGMA foreign_keys=ON')
for p in sorted(pathlib.Path('drizzle').glob('*.sql')):c.executescript(p.read_text())
route=pathlib.Path('app/api/lesson-drafts/route.ts').read_text()
sql=re.findall(r'prepare\("([^\"]+)"\)',route)
assert len(sql)==2
c.execute("INSERT INTO lesson_drafts (id,owner,title,body,sources,status,updated) VALUES ('draft','teacher-a','Vattnets kretslopp','Vatten avdunstar.','[]','draft','v1')")
c.commit()
assert c.execute('SELECT COUNT(*) FROM materials').fetchone()[0]==0
assert not c.execute("SELECT * FROM lesson_drafts WHERE owner='teacher-b'").fetchall()
def publish(owner,version,id):
    with c:
        rows=c.execute(sql[0],(id,'Vatten avdunstar.','draft',owner,version)).fetchall()
        c.execute(sql[1],(id,'v2','draft',owner,id))
    return rows
assert publish('teacher-b','v1','m-wrong')==[]
assert publish('teacher-a','stale','m-stale')==[]
assert publish('teacher-a','v1','m1')==[('m1',)]
assert c.execute('SELECT status,material_id FROM lesson_drafts').fetchone()==('published','m1')
assert c.execute('SELECT kind,title FROM materials').fetchone()==('Lektion','Vattnets kretslopp')
assert publish('teacher-a','v1','m2')==[]
assert c.execute('SELECT COUNT(*) FROM materials').fetchone()[0]==1
print('Draft checks passed: saved drafts stay private/unpublished; owner/version checks; atomic publish creates exactly one lesson.')
