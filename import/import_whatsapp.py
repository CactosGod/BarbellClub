#!/usr/bin/env python3
"""
Import 5 years of KMPP Barbell Club WhatsApp history into the portal DB.

Pipeline:
  1. Parse chat log -> messages with (datetime, sender, text, is_media)
  2. Group by date -> candidate sessions (a date with a whiteboard photo and/or
     WOD-announcement text becomes a session)
  3. For each date, collect IMG-YYYYMMDD-*.jpg files
  4. Send each photo to Claude vision with the member roster -> structured results JSON
  5. Write review file (JSONL) -> human skims it -> loader upserts sessions + results
     with source='import', verified=false

Usage:
  python import_whatsapp.py parse   --export ./whatsapp --out parsed.jsonl
  python import_whatsapp.py vision  --export ./whatsapp --parsed parsed.jsonl \
                                    --out results.jsonl   # needs ANTHROPIC_API_KEY
  python import_whatsapp.py load    --results results.jsonl  # needs SUPABASE_* env

Cost note: ~450 photos ≈ a few euros of API usage with claude-sonnet-4-6.
"""
import argparse, base64, json, os, re, sys
from collections import defaultdict
from datetime import datetime

MSG_RE = re.compile(r'^(\d{2}/\d{2}/\d{4}), (\d{1,2})\.(\d{2}) - ([^:]+): (.*)$')
IMG_RE = re.compile(r'IMG-(\d{8})-WA\d+\.jpg$')

WOD_HINTS = ('amrap', 'emom', 'for time', 'wod', 'rounds', 'reps', 'snatch',
             'clean', 'jerk', 'squat', 'deadlift', 'press', 'metcon', 'cap')


def parse_chat(export_dir):
    """Yield message dicts from the WhatsApp txt export (multiline-aware)."""
    txt = next(f for f in os.listdir(export_dir) if f.endswith('.txt'))
    msgs, cur = [], None
    with open(os.path.join(export_dir, txt), encoding='utf-8') as f:
        for line in f:
            line = line.rstrip('\n')
            m = MSG_RE.match(line)
            if m:
                if cur:
                    msgs.append(cur)
                d, hh, mm, sender, text = m.groups()
                cur = {'date': datetime.strptime(d, '%d/%m/%Y').date().isoformat(),
                       'time': f'{int(hh):02d}:{mm}', 'sender': sender.strip(),
                       'text': text, 'media': '<Media omitted>' in text}
            elif cur:
                cur['text'] += '\n' + line  # continuation (e.g. caption lines)
    if cur:
        msgs.append(cur)
    return msgs


def build_sessions(msgs, export_dir):
    """Group messages + photos into candidate sessions per date."""
    photos = defaultdict(list)
    for f in sorted(os.listdir(export_dir)):
        m = IMG_RE.match(f)
        if m:
            d = datetime.strptime(m.group(1), '%Y%m%d').date().isoformat()
            photos[d].append(f)

    by_date = defaultdict(list)
    for msg in msgs:
        by_date[msg['date']].append(msg)

    sessions = []
    for d in sorted(set(list(photos) + list(by_date))):
        texts = [m['text'] for m in by_date.get(d, []) if not m['media']]
        wod_texts = [t for t in texts if any(h in t.lower() for h in WOD_HINTS)]
        if photos.get(d) or wod_texts:
            sessions.append({'date': d, 'photos': photos.get(d, []),
                             'wod_candidates': wod_texts[:5],
                             'senders': sorted({m['sender'] for m in by_date.get(d, [])})})
    return sessions


VISION_PROMPT = """You are parsing a CrossFit gym whiteboard photo from {date}.
Known member names (match against these; people write first names or nicknames):
{roster}

Return ONLY JSON, no markdown fences:
{{
  "is_whiteboard": true/false,
  "workout_description": "the WOD as written, or null",
  "results": [
    {{"name_on_board": "...", "matched_member": "best roster match or null",
      "confidence": "high|low", "score": "as written", "rx": true/false/null}}
  ]
}}
If the photo is not a results whiteboard (e.g. people, gym, meme), set
is_whiteboard=false and results=[]."""


def run_vision(export_dir, sessions, roster, out_path):
    import urllib.request
    key = os.environ['ANTHROPIC_API_KEY']
    done = set()
    if os.path.exists(out_path):
        with open(out_path) as f:
            done = {json.loads(l)['photo'] for l in f if l.strip()}
    with open(out_path, 'a') as out:
        for s in sessions:
            for photo in s['photos']:
                if photo in done:
                    continue
                with open(os.path.join(export_dir, photo), 'rb') as f:
                    b64 = base64.standard_b64encode(f.read()).decode()
                body = json.dumps({
                    'model': 'claude-sonnet-4-6', 'max_tokens': 2000,
                    'messages': [{'role': 'user', 'content': [
                        {'type': 'image', 'source': {'type': 'base64',
                         'media_type': 'image/jpeg', 'data': b64}},
                        {'type': 'text', 'text': VISION_PROMPT.format(
                            date=s['date'], roster=', '.join(roster))}]}]
                }).encode()
                req = urllib.request.Request(
                    'https://api.anthropic.com/v1/messages', data=body,
                    headers={'content-type': 'application/json',
                             'x-api-key': key, 'anthropic-version': '2023-06-01'})
                try:
                    resp = json.load(urllib.request.urlopen(req))
                    text = ''.join(b.get('text', '') for b in resp['content'])
                    parsed = json.loads(text.strip().removeprefix('```json')
                                        .removesuffix('```').strip())
                except Exception as e:  # log and continue; rerun resumes
                    parsed = {'error': str(e)}
                out.write(json.dumps({'date': s['date'], 'photo': photo,
                                      'parse': parsed}) + '\n')
                out.flush()
                print(s['date'], photo,
                      'ok' if 'error' not in parsed else f"ERR {parsed['error']}")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('cmd', choices=['parse', 'vision', 'load'])
    ap.add_argument('--export', default='./whatsapp')
    ap.add_argument('--parsed', default='parsed.jsonl')
    ap.add_argument('--out', default='out.jsonl')
    ap.add_argument('--results', default='results.jsonl')
    a = ap.parse_args()

    if a.cmd == 'parse':
        msgs = parse_chat(a.export)
        sessions = build_sessions(msgs, a.export)
        with open(a.out, 'w') as f:
            for s in sessions:
                f.write(json.dumps(s, ensure_ascii=False) + '\n')
        roster = sorted({m['sender'] for m in msgs if not m['sender'].startswith('+')})
        json.dump(roster, open('roster.json', 'w'), ensure_ascii=False, indent=1)
        print(f'{len(sessions)} candidate sessions, roster of {len(roster)} written')

    elif a.cmd == 'vision':
        sessions = [json.loads(l) for l in open(a.parsed)]
        roster = json.load(open('roster.json'))
        run_vision(a.export, sessions, roster, a.out)

    elif a.cmd == 'load':
        sys.exit('Implement against Supabase once the schema is deployed '
                 '(upsert sessions by date, results with source=import).')


if __name__ == '__main__':
    main()
