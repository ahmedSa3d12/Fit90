import csv, re

SQL = r'C:\Users\qqqqq\Downloads\club_subscription_types (1).sql'
CSV = r'E:\final_projects\asmaa\23-8-2026\FIT90_19-8\outputs\data-migration\final-upload-package-20260908\subscriptions_final.csv'

def norm(value):
    return ' '.join(value.strip().casefold().split())

text = open(SQL, encoding='utf-8').read()
server = {norm(name.replace("\\'", "'")): (int(id), name) for id, name in re.findall(r"\((\d+), '((?:\\'|[^'])*)',", text)}
used = {}
for row in csv.DictReader(open(CSV, encoding='utf-8-sig')):
    used[norm(row['subscription_type_name'])] = (row['subscription_type_id'], row['subscription_type_name'])

print('server types', len(server), 'used source types', len(used))
print('unmatched source names:')
for key, (_, name) in sorted(used.items()):
    if key not in server:
        print(repr(name))
print('id mismatches:')
for key, (local_id, name) in sorted(used.items()):
    if key in server and str(server[key][0]) != str(local_id):
        print(local_id, '->', server[key], repr(name))
