"""
Авторизация в админку радио по паролю
"""
import json
import os
import psycopg2

SCHEMA = os.environ.get("MAIN_DB_SCHEMA", "public")

CORS_HEADERS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
}


def get_db():
    return psycopg2.connect(os.environ["DATABASE_URL"])


def handler(event: dict, context) -> dict:
    if event.get("httpMethod") == "OPTIONS":
        return {"statusCode": 200, "headers": CORS_HEADERS, "body": ""}

    if event.get("httpMethod") != "POST":
        return {"statusCode": 405, "headers": CORS_HEADERS, "body": json.dumps({"error": "Method not allowed"})}

    body = json.loads(event.get("body") or "{}")
    password = body.get("password", "")

    conn = get_db()
    cur = conn.cursor()
    cur.execute(f"SELECT value FROM {SCHEMA}.radio_settings WHERE key = 'admin_password'")
    row = cur.fetchone()
    conn.close()

    if row and password == row[0]:
        return {"statusCode": 200, "headers": CORS_HEADERS, "body": json.dumps({"ok": True, "token": password})}

    return {"statusCode": 401, "headers": CORS_HEADERS, "body": json.dumps({"ok": False, "error": "Неверный пароль"})}
