import sqlite3,json,struct
c=sqlite3.connect('data/raw/cems-aoi01.zip')
for t in ['builtUpP_v1','observedEventA_v1','transportationP_v1']:
 print(t)
 cols=[a[1] for a in c.execute('pragma table_info('+t+')')]
 for row in c.execute('select * from '+t+' limit 2'):
  print({k:(f'{len(v)} bytes' if isinstance(v,bytes) else v) for k,v in zip(cols,row)})
for t, in c.execute("select name from sqlite_master where type='table' and name not like 'rtree%' and name not like 'gpkg%' and name not like 'sqlite%'"):
 if 'src' in t.lower() or 'source' in t.lower():
  print(t,c.execute('select * from '+t+' limit 8').fetchall())
print('damage',c.execute('select damage_gra,count(*) from builtUpP_v1 group by damage_gra').fetchall())
