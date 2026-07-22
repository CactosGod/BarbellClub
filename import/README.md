# Historical import — WhatsApp export

Source: club WhatsApp export (Feb 2021 → Jun 2026): 6,352 messages, 447 photos
(303 on Sundays = whiteboard shots), chat log pairs photos to session dates.

Steps (see import_whatsapp.py):
1. `parse`  — chat txt + filenames → parsed.jsonl (450 candidate sessions) + roster.json. No network needed. ✅ validated
2. `vision` — each photo → Claude vision with roster → results.jsonl. Resumable; skips non-whiteboard photos via is_whiteboard flag. Needs ANTHROPIC_API_KEY.
3. Human skim of results.jsonl (spot-check low-confidence name matches)
4. `load`   — upsert sessions + results (source='import') into Supabase. Implement after schema is deployed.

Keep the raw export and all JSONL out of git — real member names and phone numbers.
