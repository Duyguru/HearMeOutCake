import sqlite3
import json
import uuid
import secrets
from datetime import datetime
from typing import Optional, List, Dict, Any
from api.config import settings
from api.supabase_client import get_supabase_client

import os
from pathlib import Path

_db_initialized = False

def get_db_path() -> str:
    if os.environ.get("VERCEL"):
        tmp_dir = Path("/tmp")
        tmp_dir.mkdir(parents=True, exist_ok=True)
        return str(tmp_dir / "hearmeoutcake.db")
    return settings.LOCAL_DB_PATH

def get_sqlite_conn():
    conn = sqlite3.connect(get_db_path())
    conn.row_factory = sqlite3.Row
    init_sqlite_tables(conn)
    return conn

def init_sqlite_tables(conn):
    cursor = conn.cursor()
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS cakes (
        id TEXT PRIMARY KEY,
        title TEXT DEFAULT 'İsimsiz Pasta',
        shape TEXT NOT NULL DEFAULT 'round',
        layers INTEGER NOT NULL DEFAULT 1,
        cake_color TEXT NOT NULL DEFAULT '#FFD6E0',
        frosting_color TEXT NOT NULL DEFAULT '#FFF1E6',
        slice_count INTEGER NOT NULL DEFAULT 8,
        mode TEXT NOT NULL DEFAULT 'solo',
        is_locked INTEGER NOT NULL DEFAULT 0,
        share_code TEXT UNIQUE NOT NULL,
        creator_token TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
    );
    """)

    cursor.execute("""
    CREATE TABLE IF NOT EXISTS rooms (
        id TEXT PRIMARY KEY,
        cake_id TEXT NOT NULL REFERENCES cakes(id) ON DELETE CASCADE,
        invite_code TEXT UNIQUE NOT NULL,
        max_participants INTEGER NOT NULL,
        items_per_participant INTEGER NOT NULL,
        created_at TEXT NOT NULL
    );
    """)

    cursor.execute("""
    CREATE TABLE IF NOT EXISTS participants (
        id TEXT PRIMARY KEY,
        room_id TEXT NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
        nickname TEXT NOT NULL,
        slice_index INTEGER NOT NULL,
        is_creator INTEGER NOT NULL DEFAULT 0,
        token TEXT NOT NULL,
        joined_at TEXT NOT NULL,
        UNIQUE (room_id, slice_index)
    );
    """)

    cursor.execute("""
    CREATE TABLE IF NOT EXISTS cake_items (
        id TEXT PRIMARY KEY,
        cake_id TEXT NOT NULL REFERENCES cakes(id) ON DELETE CASCADE,
        participant_id TEXT REFERENCES participants(id) ON DELETE SET NULL,
        type TEXT NOT NULL,
        content TEXT NOT NULL,
        x REAL NOT NULL DEFAULT 0.5,
        y REAL NOT NULL DEFAULT 0.5,
        scale REAL NOT NULL DEFAULT 1.0,
        rotation REAL NOT NULL DEFAULT 0.0,
        z_index INTEGER NOT NULL DEFAULT 0,
        style TEXT NOT NULL DEFAULT '{}',
        created_at TEXT NOT NULL
    );
    """)
    conn.commit()

def init_sqlite_db():
    conn = get_sqlite_conn()
    conn.close()

# SQLite başlat
init_sqlite_db()


# ============================================================
# CAKE OPERATIONS
# ============================================================

def create_cake(data: Dict[str, Any]) -> Dict[str, Any]:
    cake_id = str(uuid.uuid4())
    share_code = secrets.token_hex(5)
    creator_token = secrets.token_hex(16)
    now = datetime.utcnow().isoformat()

    cake_record = {
        "id": cake_id,
        "title": data.get("title", "İsimsiz Pasta"),
        "shape": data.get("shape", "round"),
        "layers": int(data.get("layers", 1)),
        "cake_color": data.get("cake_color", "#FFD6E0"),
        "frosting_color": data.get("frosting_color", "#FFF1E6"),
        "slice_count": int(data.get("slice_count", 8)),
        "mode": data.get("mode", "solo"),
        "is_locked": 1 if data.get("is_locked", False) else 0,
        "share_code": share_code,
        "creator_token": creator_token,
        "created_at": now,
        "updated_at": now,
    }

    supabase = get_supabase_client()
    if supabase:
        res = supabase.table("cakes").insert({
            **cake_record,
            "is_locked": bool(cake_record["is_locked"])
        }).execute()
        return res.data[0]
    else:
        conn = get_sqlite_conn()
        cursor = conn.cursor()
        cursor.execute("""
            INSERT INTO cakes (id, title, shape, layers, cake_color, frosting_color, slice_count, mode, is_locked, share_code, creator_token, created_at, updated_at)
            VALUES (:id, :title, :shape, :layers, :cake_color, :frosting_color, :slice_count, :mode, :is_locked, :share_code, :creator_token, :created_at, :updated_at)
        """, cake_record)
        conn.commit()
        conn.close()
        cake_record["is_locked"] = bool(cake_record["is_locked"])
        return cake_record


def get_cake_by_id(cake_id: str) -> Optional[Dict[str, Any]]:
    supabase = get_supabase_client()
    if supabase:
        res = supabase.table("cakes").select("*").eq("id", cake_id).execute()
        return res.data[0] if res.data else None
    else:
        conn = get_sqlite_conn()
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM cakes WHERE id = ?", (cake_id,))
        row = cursor.fetchone()
        conn.close()
        if not row:
            return None
        d = dict(row)
        d["is_locked"] = bool(d["is_locked"])
        return d


def get_cake_by_share_code(share_code: str) -> Optional[Dict[str, Any]]:
    supabase = get_supabase_client()
    if supabase:
        res = supabase.table("cakes").select("*").eq("share_code", share_code).execute()
        return res.data[0] if res.data else None
    else:
        conn = get_sqlite_conn()
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM cakes WHERE share_code = ?", (share_code,))
        row = cursor.fetchone()
        conn.close()
        if not row:
            return None
        d = dict(row)
        d["is_locked"] = bool(d["is_locked"])
        return d


def update_cake(cake_id: str, updates: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    updates["updated_at"] = datetime.utcnow().isoformat()
    supabase = get_supabase_client()
    if supabase:
        res = supabase.table("cakes").update(updates).eq("id", cake_id).execute()
        return res.data[0] if res.data else None
    else:
        conn = get_sqlite_conn()
        cursor = conn.cursor()
        set_clauses = []
        params = []
        for k, v in updates.items():
            if k == "is_locked":
                v = 1 if v else 0
            set_clauses.append(f"{k} = ?")
            params.append(v)
        params.append(cake_id)
        cursor.execute(f"UPDATE cakes SET {', '.join(set_clauses)} WHERE id = ?", params)
        conn.commit()
        conn.close()
        return get_cake_by_id(cake_id)


def get_cakes_by_tokens(tokens: List[str]) -> List[Dict[str, Any]]:
    if not tokens:
        return []
    supabase = get_supabase_client()
    if supabase:
        res = supabase.table("cakes").select("*").in_("creator_token", tokens).order("created_at", desc=True).execute()
        return res.data or []
    else:
        conn = get_sqlite_conn()
        cursor = conn.cursor()
        placeholders = ",".join("?" for _ in tokens)
        cursor.execute(f"SELECT * FROM cakes WHERE creator_token IN ({placeholders}) ORDER BY created_at DESC", tokens)
        rows = cursor.fetchall()
        conn.close()
        result = []
        for r in rows:
            d = dict(r)
            d["is_locked"] = bool(d["is_locked"])
            result.append(d)
        return result


# ============================================================
# ROOM & PARTICIPANT OPERATIONS
# ============================================================

def create_room(cake_id: str, max_participants: int, items_per_participant: int) -> Dict[str, Any]:
    room_id = str(uuid.uuid4())
    invite_code = secrets.token_hex(4)  # 8 karakterlik benzersiz kod
    now = datetime.utcnow().isoformat()

    room_record = {
        "id": room_id,
        "cake_id": cake_id,
        "invite_code": invite_code,
        "max_participants": max_participants,
        "items_per_participant": items_per_participant,
        "created_at": now
    }

    supabase = get_supabase_client()
    if supabase:
        res = supabase.table("rooms").insert(room_record).execute()
        return res.data[0]
    else:
        conn = get_sqlite_conn()
        cursor = conn.cursor()
        cursor.execute("""
            INSERT INTO rooms (id, cake_id, invite_code, max_participants, items_per_participant, created_at)
            VALUES (:id, :cake_id, :invite_code, :max_participants, :items_per_participant, :created_at)
        """, room_record)
        conn.commit()
        conn.close()
        return room_record


def get_room_by_invite(invite_code: str) -> Optional[Dict[str, Any]]:
    supabase = get_supabase_client()
    if supabase:
        res = supabase.table("rooms").select("*").eq("invite_code", invite_code).execute()
        return res.data[0] if res.data else None
    else:
        conn = get_sqlite_conn()
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM rooms WHERE invite_code = ?", (invite_code,))
        row = cursor.fetchone()
        conn.close()
        return dict(row) if row else None


def get_room_by_cake_id(cake_id: str) -> Optional[Dict[str, Any]]:
    supabase = get_supabase_client()
    if supabase:
        res = supabase.table("rooms").select("*").eq("cake_id", cake_id).execute()
        return res.data[0] if res.data else None
    else:
        conn = get_sqlite_conn()
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM rooms WHERE cake_id = ?", (cake_id,))
        row = cursor.fetchone()
        conn.close()
        return dict(row) if row else None


def get_participants(room_id: str) -> List[Dict[str, Any]]:
    supabase = get_supabase_client()
    if supabase:
        res = supabase.table("participants").select("*").eq("room_id", room_id).order("slice_index").execute()
        return res.data or []
    else:
        conn = get_sqlite_conn()
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM participants WHERE room_id = ? ORDER BY slice_index ASC", (room_id,))
        rows = cursor.fetchall()
        conn.close()
        result = []
        for r in rows:
            d = dict(r)
            d["is_creator"] = bool(d["is_creator"])
            result.append(d)
        return result


def create_participant(room_id: str, nickname: str, slice_index: int, is_creator: bool = False) -> Dict[str, Any]:
    participant_id = str(uuid.uuid4())
    token = secrets.token_hex(16)
    now = datetime.utcnow().isoformat()

    part_record = {
        "id": participant_id,
        "room_id": room_id,
        "nickname": nickname,
        "slice_index": slice_index,
        "is_creator": 1 if is_creator else 0,
        "token": token,
        "joined_at": now
    }

    supabase = get_supabase_client()
    if supabase:
        res = supabase.table("participants").insert({
            **part_record,
            "is_creator": bool(part_record["is_creator"])
        }).execute()
        return res.data[0]
    else:
        conn = get_sqlite_conn()
        cursor = conn.cursor()
        cursor.execute("""
            INSERT INTO participants (id, room_id, nickname, slice_index, is_creator, token, joined_at)
            VALUES (:id, :room_id, :nickname, :slice_index, :is_creator, :token, :joined_at)
        """, part_record)
        conn.commit()
        conn.close()
        part_record["is_creator"] = bool(part_record["is_creator"])
        return part_record


def get_participant_by_token(token: str) -> Optional[Dict[str, Any]]:
    if not token:
        return None
    supabase = get_supabase_client()
    if supabase:
        res = supabase.table("participants").select("*").eq("token", token).execute()
        return res.data[0] if res.data else None
    else:
        conn = get_sqlite_conn()
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM participants WHERE token = ?", (token,))
        row = cursor.fetchone()
        conn.close()
        if not row:
            return None
        d = dict(row)
        d["is_creator"] = bool(d["is_creator"])
        return d


# ============================================================
# CAKE ITEM OPERATIONS
# ============================================================

def create_item(item_data: Dict[str, Any]) -> Dict[str, Any]:
    item_id = str(uuid.uuid4())
    now = datetime.utcnow().isoformat()
    style_obj = item_data.get("style", {})

    record = {
        "id": item_id,
        "cake_id": item_data["cake_id"],
        "participant_id": item_data.get("participant_id"),
        "type": item_data["type"],
        "content": item_data["content"],
        "x": float(item_data.get("x", 0.5)),
        "y": float(item_data.get("y", 0.5)),
        "scale": float(item_data.get("scale", 1.0)),
        "rotation": float(item_data.get("rotation", 0.0)),
        "z_index": int(item_data.get("z_index", 0)),
        "style": style_obj,
        "created_at": now
    }

    supabase = get_supabase_client()
    if supabase:
        res = supabase.table("cake_items").insert(record).execute()
        return res.data[0]
    else:
        conn = get_sqlite_conn()
        cursor = conn.cursor()
        db_record = {**record, "style": json.dumps(style_obj)}
        cursor.execute("""
            INSERT INTO cake_items (id, cake_id, participant_id, type, content, x, y, scale, rotation, z_index, style, created_at)
            VALUES (:id, :cake_id, :participant_id, :type, :content, :x, :y, :scale, :rotation, :z_index, :style, :created_at)
        """, db_record)
        conn.commit()
        conn.close()
        return record


def get_items_by_cake_id(cake_id: str) -> List[Dict[str, Any]]:
    supabase = get_supabase_client()
    if supabase:
        res = supabase.table("cake_items").select("*").eq("cake_id", cake_id).order("z_index").order("created_at").execute()
        return res.data or []
    else:
        conn = get_sqlite_conn()
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM cake_items WHERE cake_id = ? ORDER BY z_index ASC, created_at ASC", (cake_id,))
        rows = cursor.fetchall()
        conn.close()
        result = []
        for r in rows:
            d = dict(r)
            if isinstance(d.get("style"), str):
                try:
                    d["style"] = json.loads(d["style"])
                except Exception:
                    d["style"] = {}
            result.append(d)
        return result


def get_item_by_id(item_id: str) -> Optional[Dict[str, Any]]:
    supabase = get_supabase_client()
    if supabase:
        res = supabase.table("cake_items").select("*").eq("id", item_id).execute()
        return res.data[0] if res.data else None
    else:
        conn = get_sqlite_conn()
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM cake_items WHERE id = ?", (item_id,))
        row = cursor.fetchone()
        conn.close()
        if not row:
            return None
        d = dict(row)
        if isinstance(d.get("style"), str):
            try:
                d["style"] = json.loads(d["style"])
            except Exception:
                d["style"] = {}
        return d


def count_items_by_participant(cake_id: str, participant_id: str) -> int:
    supabase = get_supabase_client()
    if supabase:
        res = supabase.table("cake_items").select("id", count="exact").eq("cake_id", cake_id).eq("participant_id", participant_id).execute()
        return res.count if res.count is not None else len(res.data)
    else:
        conn = get_sqlite_conn()
        cursor = conn.cursor()
        cursor.execute("SELECT COUNT(*) FROM cake_items WHERE cake_id = ? AND participant_id = ?", (cake_id, participant_id))
        count = cursor.fetchone()[0]
        conn.close()
        return count


def update_item(item_id: str, updates: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    supabase = get_supabase_client()
    if supabase:
        res = supabase.table("cake_items").update(updates).eq("id", item_id).execute()
        return res.data[0] if res.data else None
    else:
        conn = get_sqlite_conn()
        cursor = conn.cursor()
        set_clauses = []
        params = []
        for k, v in updates.items():
            if k == "style" and isinstance(v, (dict, list)):
                v = json.dumps(v)
            set_clauses.append(f"{k} = ?")
            params.append(v)
        params.append(item_id)
        cursor.execute(f"UPDATE cake_items SET {', '.join(set_clauses)} WHERE id = ?", params)
        conn.commit()
        conn.close()
        return get_item_by_id(item_id)


def delete_item(item_id: str) -> bool:
    supabase = get_supabase_client()
    if supabase:
        res = supabase.table("cake_items").delete().eq("id", item_id).execute()
        return True
    else:
        conn = get_sqlite_conn()
        cursor = conn.cursor()
        cursor.execute("DELETE FROM cake_items WHERE id = ?", (item_id,))
        rows_affected = cursor.rowcount
        conn.commit()
        conn.close()
        return rows_affected > 0


def delete_cake(cake_id: str) -> bool:
    supabase = get_supabase_client()
    if supabase:
        supabase.table("cake_items").delete().eq("cake_id", cake_id).execute()
        supabase.table("cakes").delete().eq("id", cake_id).execute()
        return True
    else:
        conn = get_sqlite_conn()
        cursor = conn.cursor()
        cursor.execute("PRAGMA foreign_keys = ON;")
        cursor.execute("DELETE FROM cake_items WHERE cake_id = ?", (cake_id,))
        cursor.execute("DELETE FROM cakes WHERE id = ?", (cake_id,))
        conn.commit()
        conn.close()
        return True

