"""
Fundación e historia de los clubes FEB desde Wikipedia/Wikidata.

La FEB no publica el año de fundación ni la historia de sus clubes. Para cada club
de la temporada en curso se busca el artículo en es.wikipedia y se acepta solo si
su elemento de Wikidata es un club/equipo de baloncesto de España. Del elemento se
toma la fecha de fundación (P571) y del artículo, el primer párrafo.

  python tools/media/club_wiki.py candidates   → tools/media/club-wiki.json (para revisar)
  (revisión manual: "ok": false descarta un emparejamiento)
  npm run scrape -- import-club-wiki tools/media/club-wiki.json

Uso (sin dependencias externas): python tools/media/club_wiki.py candidates [--leagues LEB_ORO,LEB_PLATA]
"""
import argparse
import json
import re
import sqlite3
import sys
import time
import unicodedata
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'tools' / 'media' / 'club-wiki.json'
UA = {'User-Agent': 'D3Basket/0.1 (scouting personal; +https://github.com/MCIFU/d3-basket)'}
# Clases de Wikidata aceptadas: equipo de baloncesto, club de baloncesto, club deportivo.
BASKET = {'Q13393265', 'Q12973014', 'Q847017'}
SPAIN = 'Q29'
GENERIC = {'club', 'baloncesto', 'basket', 'basquet', 'basketball', 'fundacion', 'deportivo', 'deportiva',
           'escola', 'escuela', 'asociacion', 'grupo', 'sociedad', 'union', 'ciudad'}


def get(url: str, tries: int = 8):
    """GET JSON respetando el límite de Wikimedia (429 + Retry-After)."""
    for i in range(tries):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=30) as r:
                return json.load(r)
        except urllib.error.HTTPError as e:
            if e.code != 429 or i == tries - 1:
                raise
            wait = int(e.headers.get('Retry-After') or 30) + 2
            print(f'  … límite de Wikipedia, espero {wait}s', flush=True)
            time.sleep(wait)
        finally:
            time.sleep(3)


def norm(s: str) -> str:
    s = unicodedata.normalize('NFD', s).encode('ascii', 'ignore').decode().lower()
    return re.sub(r'[^a-z0-9]+', ' ', s).strip()


def tokens(s: str) -> set[str]:
    return {w for w in norm(s).split() if len(w) >= 4 and w not in GENERIC}


def wikidata(title: str):
    r = get('https://es.wikipedia.org/w/api.php?' + urllib.parse.urlencode(
        {'action': 'query', 'prop': 'pageprops', 'titles': title, 'format': 'json', 'redirects': 1}))
    page = next(iter(r['query']['pages'].values()))
    qid = page.get('pageprops', {}).get('wikibase_item')
    if not qid:
        return None
    e = get(f'https://www.wikidata.org/wiki/Special:EntityData/{qid}.json')['entities'][qid]
    claims = e.get('claims', {})
    ids = lambda p: {c['mainsnak'].get('datavalue', {}).get('value', {}).get('id') for c in claims.get(p, [])}
    founded = None
    for c in claims.get('P571', []):
        t = c['mainsnak'].get('datavalue', {}).get('value', {}).get('time')
        if t:
            founded = int(t[1:5])
            break
    sport = ids('P641')
    return {'qid': qid, 'basket': bool(ids('P31') & BASKET) and ('Q5372' in sport or not sport),
            'spain': SPAIN in ids('P17') or not ids('P17'), 'founded': founded, 'title': page['title']}


def summary(title: str):
    j = get('https://es.wikipedia.org/api/rest_v1/page/summary/' + urllib.parse.quote(title.replace(' ', '_')))
    return j.get('extract'), j.get('content_urls', {}).get('desktop', {}).get('page')


def candidates(db: str, leagues: list[str]):
    con = sqlite3.connect(db)
    clubs = con.execute(
        f"""SELECT cr.ref, t.name, c.arena, co.code FROM teams t JOIN clubs c ON c.id = t.club_id
            JOIN v_club_ref cr ON cr.club_id = c.id
            JOIN competition_seasons cs ON cs.id = t.competition_season_id AND cs.is_current = 1
            JOIN competitions co ON co.id = cs.competition_id
            WHERE co.code IN ({','.join('?' * len(leagues))}) AND c.history IS NULL ORDER BY co.tier, t.name""",
        leagues).fetchall()
    con.close()
    out = json.loads(OUT.read_text()) if OUT.exists() else {}
    for ref, name, arena, code in clubs:
        if ref in out:
            continue
        found = None
        r = get('https://es.wikipedia.org/w/api.php?' + urllib.parse.urlencode(
            {'action': 'query', 'list': 'search', 'srsearch': f'{name} baloncesto', 'format': 'json', 'srlimit': 4}))
        for hit in r['query']['search']:
            shared = tokens(name) & tokens(hit['title'])
            if not shared:
                continue
            wd = wikidata(hit['title'])
            if wd and wd['basket'] and wd['spain']:
                extract, url = summary(wd['title'])
                found = {**wd, 'extract': extract, 'url': url, 'shared': sorted(shared)}
                break
        out[ref] = {'name': name, 'league': code, 'arena': arena, 'match': found, 'ok': bool(found)}
        print(f"{'✓' if found else '·'} {name} → {found['title'] if found else '-'} ({found and found['founded']})", flush=True)
        OUT.parent.mkdir(parents=True, exist_ok=True)
        OUT.write_text(json.dumps(out, indent=1, ensure_ascii=False) + '\n')


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('command', choices=['candidates'])
    ap.add_argument('--db', default=str(ROOT / 'data' / 'd3basket.db'))
    ap.add_argument('--leagues', default='LEB_ORO,LEB_PLATA')
    args = ap.parse_args()
    candidates(args.db, args.leagues.split(','))


if __name__ == '__main__':
    sys.exit(main())
