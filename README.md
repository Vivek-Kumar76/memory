# Memorial Website

A quiet place for friends and family to share memories and photos. FastAPI + SQLite + vanilla HTML/CSS/JS. No login, no external services except Google Fonts.

## Structure
```
memorial/
  requirements.txt
  backend/   main.py database.py models.py schemas.py crud.py  uploads/  database.db (auto-created)
  frontend/  index.html style.css script.js  assets/portrait.jpg
```

## Run locally
```bash
cd memorial
python -m venv venv && source venv/bin/activate      # Windows: venv\Scripts\activate
pip install -r requirements.txt
cd backend
MEMORIAL_NAME="Rahul Sharma" MEMORIAL_BIRTH="12 March 1998" MEMORIAL_DEATH="01 September 2026" \
  python main.py
```
Open http://127.0.0.1:8000. On Windows PowerShell, set variables with `$env:MEMORIAL_NAME="..."`.

## Personalize
- Put the portrait at `frontend/assets/portrait.jpg` (a letter placeholder shows until you do).
- Edit the `CONFIG` block in `backend/main.py`, or use the environment variables `MEMORIAL_NAME`, `MEMORIAL_BIRTH`, `MEMORIAL_DEATH`, `MEMORIAL_PORTRAIT`, `MEMORIAL_LIVES_ON`, `MEMORIAL_THANKS`. The default text uses "he/his"; change `LIVES_ON` and `THANKS` for other pronouns.

## Feature or hide memories (no admin login in the MVP)
```bash
sqlite3 backend/database.db "SELECT id,name,substr(memory,1,40) FROM memories;"
sqlite3 backend/database.db "UPDATE memories SET featured=1 WHERE id IN (3,7);"   # top 5 newest featured are shown
sqlite3 backend/database.db "DELETE FROM memories WHERE id=12;"                   # remove abusive entries
```

## API
| Method | Path | Notes |
|---|---|---|
| POST | `/api/memories` | multipart: name, relationship, memory, photo, photo_caption |
| GET | `/api/memories` | `q`, `sort` (newest/oldest/name), `page`, `limit`; total in `X-Total-Count` header |
| GET | `/api/memories/featured` | up to 5 featured |
| GET | `/api/photos` | paginated memories that have photos |
| GET | `/api/stats` | `{memory_count, photo_count}` |

## Security and performance notes
- Input is validated server-side (name 2-100, memory 20-2000, relationship list, photo type and 10MB cap).
- HTML is never interpreted: the page renders all user text with `textContent`, so nothing is stored double-escaped.
- Uploads are decoded with Pillow, resized to 1600px, stripped of metadata and re-saved as WEBP; files get random names.
- Images lazy-load, lists are paginated, search is debounced and runs in SQLite.
- Because there is no login, add rate limiting at your reverse proxy (for example nginx `limit_req`) before sharing widely.

## Deploy (Ubuntu VPS)
```bash
pip install -r requirements.txt gunicorn
cd backend && gunicorn -k uvicorn.workers.UvicornWorker -w 2 -b 127.0.0.1:8000 main:app
```
Put nginx in front with HTTPS (Let's Encrypt), set `client_max_body_size 11m;`, and run gunicorn under systemd. Back up `backend/database.db` and `backend/uploads/` together. On Render, Railway or Fly.io, attach a persistent disk for those two paths, or memories will be lost on redeploy.
