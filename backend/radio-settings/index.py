"""
Настройки радио: режим вещания (плейлист / прямой эфир), URL потока, пароль админа
"""
import json
import os
import psycopg2

SCHEMA = os.environ.get("MAIN_DB_SCHEMA", "public")

CORS_HEADERS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, X-Admin-Token",
}


def get_db():
    return psycopg2.connect(os.environ["DATABASE_URL"])


def check_admin(event):
    token = event.get("headers", {}).get("X-Admin-Token", "")
    conn = get_db()
    cur = conn.cursor()
    cur.execute(f"SELECT value FROM {SCHEMA}.radio_settings WHERE key = 'admin_password'")
    row = cur.fetchone()
    conn.close()
    return row and token == row[0]


def handler(event: dict, context) -> dict:
    if event.get("httpMethod") == "OPTIONS":
        return {"statusCode": 200, "headers": CORS_HEADERS, "body": ""}

    method = event.get("httpMethod", "GET")

    # GET — получить все настройки (публичные)
    if method == "GET":
        conn = get_db()
        cur = conn.cursor()
        cur.execute(f"SELECT key, value FROM {SCHEMA}.radio_settings")
        rows = cur.fetchall()
        conn.close()
        settings = {r[0]: r[1] for r in rows if r[0] != "admin_password"}
        return {"statusCode": 200, "headers": CORS_HEADERS, "body": json.dumps(settings)}

    # POST — обновить настройки (только для админа)
    if method == "POST":
        if not check_admin(event):
            return {"statusCode": 403, "headers": CORS_HEADERS, "body": json.dumps({"error": "Forbidden"})}

        body = json.loads(event.get("body") or "{}")
        conn = get_db()
        cur = conn.cursor()

        allowed_keys = ["stream_url", "stream_mode", "station_name", "current_track_index"]
        for key in allowed_keys:
            if key in body:
                cur.execute(
                    f"UPDATE {SCHEMA}.radio_settings SET value = %s, updated_at = NOW() WHERE key = %s",
                    (str(body[key]), key),
                )

        # Смена пароля
        if "new_password" in body and body.get("new_password"):
            cur.execute(
                f"UPDATE {SCHEMA}.radio_settings SET value = %s, updated_at = NOW() WHERE key = 'admin_password'",
                (body["new_password"],),
            )

        conn.commit()
        conn.close()
        return {"statusCode": 200, "headers": CORS_HEADERS, "body": json.dumps({"message": "Настройки сохранены"})}

    # POST /verify — проверка пароля
    if method == "POST":
        body = json.loads(event.get("body") or "{}")
        if body.get("action") == "verify":
            token = body.get("password", "")
            conn = get_db()
            cur = conn.cursor()
            cur.execute(f"SELECT value FROM {SCHEMA}.radio_settings WHERE key = 'admin_password'")
            row = cur.fetchone()
            conn.close()
            if row and token == row[0]:
                return {"statusCode": 200, "headers": CORS_HEADERS, "body": json.dumps({"ok": True})}
            return {"statusCode": 401, "headers": CORS_HEADERS, "body": json.dumps({"ok": False})}

    return {"statusCode": 405, "headers": CORS_HEADERS, "body": json.dumps({"error": "Method not allowed"})}
