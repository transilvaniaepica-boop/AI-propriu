"""
Agent Studio — backend cu autentificare simpla (multi-utilizator).

Cheia API OpenRouter stă DOAR pe server. Fiecare utilizator are email + parolă;
parolele se hash-uiesc cu PBKDF2 (stdlib), sesiunile sunt token-uri în SQLite,
trimise browserului ca cookie httpOnly.

Variabile de mediu (.env):
  OPENROUTER_API_KEY  — cheia ta de pe openrouter.ai/keys (obligatoriu)
  ALLOWED_ORIGINS     — origini permise, SEPARAT PRIN VIRGULĂ, fara "*"
                        (cookie-urile nu merg cu wildcard). Ex:
                        https://nume.github.io,http://localhost:5173
  DB_PATH             — fișierul SQLite (implicit users.db)

Rulezi local:
  pip install -r requirements.txt
  uvicorn main:app --reload        # http://127.0.0.1:8000  →  /health

Primul cont înscris devine automat admin și poate crea alți utilizatori
din Setări → Utilizatori (sau POST /auth/users).
"""

import hashlib
import hmac
import os
import secrets
import sqlite3
from datetime import datetime, timezone

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, StreamingResponse
from pydantic import BaseModel
import httpx

load_dotenv()

OPENROUTER_API_KEY = os.environ.get("OPENROUTER_API_KEY", "")
ALLOWED_ORIGINS = [o.strip() for o in os.environ.get("ALLOWED_ORIGINS", "").split(",") if o.strip()]
DB_PATH = os.environ.get("DB_PATH", "users.db")

UPSTREAM = "https://openrouter.ai/api/v1"
COOKIE_NAME = "ors_session"
SESSION_DAYS = 7

if not OPENROUTER_API_KEY:
    raise RuntimeError("Lipsește OPENROUTER_API_KEY — setează variabila de mediu!")
if not ALLOWED_ORIGINS:
    raise RuntimeError("Setează ALLOWED_ORIGINS (fără wildcard '*') — cookie-urile needucă origini explicite!")

app = FastAPI(title="Agent Studio Backend", version="0.2.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ---------- baza de date ----------

def db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    return conn


def init_db():
    with db() as c:
        c.execute("CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY AUTOINCREMENT, email TEXT UNIQUE NOT NULL, password_hash TEXT NOT NULL)")
        c.execute("CREATE TABLE IF NOT EXISTS sessions (token TEXT PRIMARY KEY, user_id INTEGER NOT NULL, created_at TEXT NOT NULL)")


init_db()


# ---------- parole (PBKDF2, doar stdlib) ----------

def hash_password(password: str) -> str:
    salt = secrets.token_hex(16)
    dk = hashlib.pbkdf2_hmac("sha256", password.encode(), bytes.fromhex(salt), 200_000)
    return f"{salt}:{dk.hex()}"


def verify_password(password: str, stored: str) -> bool:
    try:
        salt_hex, hash_hex = stored.split(":")
    except ValueError:
        return False
    dk = hashlib.pbkdf2_hmac("sha256", password.encode(), bytes.fromhex(salt_hex), 200_000)
    return hmac.compare_digest(dk.hex(), hash_hex)


# ---------- sesiune ----------

def current_user(request: Request) -> str:
    token = request.cookies.get(COOKIE_NAME)
    if not token:
        raise HTTPException(status_code=401, detail="Neautentificat — conectează-te mai întâi")
    with db() as c:
        row = c.execute(
            "SELECT u.email FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token = ?",
            (token,),
        ).fetchone()
    if not row:
        raise HTTPException(status_code=401, detail="Sesiune invalidă")
    return row["email"]


def set_session_cookie(resp: Response, token: str):
    # SameSite=None + Secure: obligatoriu cand frontend-ul (github.io) si
    # backend-ul (render.com) sunt pe domenii diferite.
    resp.set_cookie(
        COOKIE_NAME, token,
        max_age=SESSION_DAYS * 86400,
        httponly=True,
        samesite="none",
        secure=True,
        path="/",
    )


# ---------- auth ----------

class Creds(BaseModel):
    email: str
    password: str


@app.post("/auth/register")
async def register(body: Creds, resp: Response):
    email = body.email.strip().lower()
    if "@" not in email or len(body.password) < 6:
        raise HTTPException(status_code=400, detail="Email valid + parolă de minim 6 caractere")
    with db() as c:
        if c.execute("SELECT COUNT(*) n FROM users").fetchone()["n"] > 0:
            raise HTTPException(status_code=403, detail="Doar adminul poate crea conturi (vezi Setări → Utilizatori)")
        try:
            c.execute("INSERT INTO users (email, password_hash) VALUES (?, ?)", (email, hash_password(body.password)))
        except sqlite3.IntegrityError:
            raise HTTPException(status_code=409, detail="Email deja înregistrat")
    return {"ok": True, "email": email, "note": "Cont admin creat. Autentifică-te acum."}


@app.post("/auth/login")
async def login(body: Creds, resp: Response):
    email = body.email.strip().lower()
    with db() as c:
        row = c.execute("SELECT * FROM users WHERE email = ?", (email,)).fetchone()
    if not row or not verify_password(body.password, row["password_hash"]):
        raise HTTPException(status_code=401, detail="Email sau parolă greșită")
    token = secrets.token_hex(32)
    with db() as c:
        c.execute("INSERT INTO sessions (token, user_id, created_at) VALUES (?, ?, ?)",
                  (token, row["id"], datetime.now(timezone.utc).isoformat()))
    out = JSONResponse({"ok": True, "email": email})
    set_session_cookie(out, token)
    return out


@app.post("/auth/logout")
async def logout(request: Request, resp: Response):
    token = request.cookies.get(COOKIE_NAME)
    if token:
        with db() as c:
            c.execute("DELETE FROM sessions WHERE token = ?", (token,))
    resp.delete_cookie(COOKIE_NAME, path="/")
    return {"ok": True}


@app.get("/auth/me")
async def me(request: Request):
    return {"email": current_user(request)}


@app.get("/auth/users")
async def list_users(request: Request):
    current_user(request)  # doar utilizatori autentificați
    with db() as c:
        rows = c.execute("SELECT email FROM users ORDER BY id").fetchall()
    return {"users": [r["email"] for r in rows]}


@app.post("/auth/users")
async def create_user(body: Creds, request: Request):
    current_user(request)  # orice utilizator autentificat poate adăuga conturi
    email = body.email.strip().lower()
    if "@" not in email or len(body.password) < 6:
        raise HTTPException(status_code=400, detail="Email valid + parolă de minim 6 caractere")
    with db() as c:
        try:
            c.execute("INSERT INTO users (email, password_hash) VALUES (?, ?)", (email, hash_password(body.password)))
        except sqlite3.IntegrityError:
            raise HTTPException(status_code=409, detail="Email deja înregistrat")
    return {"ok": True, "email": email}


# ---------- proxy OpenRouter ----------

@app.get("/health")
async def health():
    return {"ok": True, "upstream": UPSTREAM}


@app.get("/models")
async def models(request: Request):
    current_user(request)
    async with httpx.AsyncClient(timeout=30) as client:
        r = await client.get(f"{UPSTREAM}/models", headers={"Authorization": f"Bearer {OPENROUTER_API_KEY}"})
    return JSONResponse(status_code=r.status_code, content=r.json())


@app.post("/chat/completions")
async def chat_completions(request: Request):
    current_user(request)
    body = await request.json()
    headers = {
        "Authorization": f"Bearer {OPENROUTER_API_KEY}",
        "Content-Type": "application/json",
        "HTTP-Referer": str(request.headers.get("origin", "")),
        "X-Title": "Agent Studio",
    }
    async with httpx.AsyncClient(timeout=None) as client:
        if body.get("stream"):
            req = client.build_request("POST", f"{UPSTREAM}/chat/completions", json=body, headers=headers)
            upstream = await client.send(req, stream=True)
            return StreamingResponse(
                upstream.aiter_raw(),
                status_code=upstream.status_code,
                media_type="text/event-stream",
                headers={"Cache-Control": "no-cache", "Connection": "keep-alive"},
            )
        r = await client.post(f"{UPSTREAM}/chat/completions", json=body, headers=headers)
        return JSONResponse(status_code=r.status_code, content=r.json())
