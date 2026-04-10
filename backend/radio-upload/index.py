"""
Загрузка аудиофайлов: маленькие одним запросом, большие — чанками с накоплением в /tmp
"""
import json
import os
import uuid
import base64
import psycopg2
import boto3
import logging

logger = logging.getLogger()
logger.setLevel(logging.INFO)

SCHEMA = os.environ.get("MAIN_DB_SCHEMA", "public")

CORS_HEADERS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, X-Admin-Token",
}


def get_db():
    return psycopg2.connect(os.environ["DATABASE_URL"])


def get_s3():
    return boto3.client(
        "s3",
        endpoint_url="https://bucket.poehali.dev",
        aws_access_key_id=os.environ["AWS_ACCESS_KEY_ID"],
        aws_secret_access_key=os.environ["AWS_SECRET_ACCESS_KEY"],
    )


def check_admin(event):
    token = event.get("headers", {}).get("X-Admin-Token", "")
    conn = get_db()
    cur = conn.cursor()
    cur.execute(f"SELECT value FROM {SCHEMA}.radio_settings WHERE key = 'admin_password'")
    row = cur.fetchone()
    conn.close()
    return row and token == row[0]


def resp(status, body):
    return {"statusCode": status, "headers": CORS_HEADERS, "body": json.dumps(body)}


def save_track(key, title, artist):
    cdn_url = f"https://cdn.poehali.dev/projects/{os.environ['AWS_ACCESS_KEY_ID']}/bucket/{key}"
    conn = get_db()
    cur = conn.cursor()
    cur.execute(f"SELECT COALESCE(MAX(position), -1) + 1 FROM {SCHEMA}.tracks WHERE is_active = TRUE")
    position = cur.fetchone()[0]
    cur.execute(
        f"INSERT INTO {SCHEMA}.tracks (title, artist, filename, url, position) "
        f"VALUES (%s, %s, %s, %s, %s) RETURNING id",
        (title, artist, key, cdn_url, position),
    )
    new_id = cur.fetchone()[0]
    conn.commit()
    conn.close()
    return new_id, cdn_url


def handler(event: dict, context) -> dict:
    """Загрузка аудиофайлов в хранилище и сохранение в базу"""
    if event.get("httpMethod") == "OPTIONS":
        return {"statusCode": 200, "headers": CORS_HEADERS, "body": ""}

    if event.get("httpMethod") != "POST":
        return resp(405, {"error": "Method not allowed"})

    body = json.loads(event.get("body") or "{}")
    action = body.get("action")

    if not check_admin(event):
        return resp(403, {"error": "Forbidden"})

    if action == "upload":
        file_data = body.get("file_data", "")
        file_name = body.get("file_name", "track.mp3")
        title = body.get("title", "Без названия")
        artist = body.get("artist", "")

        if not file_data:
            return resp(400, {"error": "No file_data"})

        audio_bytes = base64.b64decode(file_data)
        ext = file_name.rsplit(".", 1)[-1].lower() if "." in file_name else "mp3"
        key = f"radio/{uuid.uuid4()}.{ext}"

        logger.info(f"upload: {len(audio_bytes)} bytes -> {key}")

        s3 = get_s3()
        s3.put_object(Bucket="files", Key=key, Body=audio_bytes, ContentType=f"audio/{ext}")

        new_id, cdn_url = save_track(key, title, artist)
        logger.info(f"saved track id={new_id}")
        return resp(200, {"id": new_id, "url": cdn_url, "message": "Трек загружен"})

    if action == "init":
        file_name = body.get("file_name", "track.mp3")
        ext = file_name.rsplit(".", 1)[-1].lower() if "." in file_name else "mp3"
        upload_id = str(uuid.uuid4())
        key = f"radio/{upload_id}.{ext}"
        tmp_path = f"/tmp/{upload_id}"
        open(tmp_path, "wb").close()
        logger.info(f"init: key={key}, upload_id={upload_id}")
        return resp(200, {"key": key, "upload_id": upload_id})

    if action == "chunk":
        upload_id = body.get("upload_id")
        chunk_data = body.get("data", "")
        part_number = body.get("part_number", 0)

        if not upload_id or not chunk_data:
            return resp(400, {"error": "Missing upload_id or data"})

        chunk_bytes = base64.b64decode(chunk_data)
        tmp_path = f"/tmp/{upload_id}"
        with open(tmp_path, "ab") as f:
            f.write(chunk_bytes)

        logger.info(f"chunk: upload_id={upload_id}, part={part_number}, size={len(chunk_bytes)}")
        return resp(200, {"ok": True, "part_number": part_number})

    if action == "complete":
        upload_id = body.get("upload_id")
        key = body.get("key")
        title = body.get("title", "Без названия")
        artist = body.get("artist", "")

        if not upload_id or not key:
            return resp(400, {"error": "Missing fields"})

        tmp_path = f"/tmp/{upload_id}"
        if not os.path.exists(tmp_path):
            return resp(400, {"error": "Upload not found, retry"})

        with open(tmp_path, "rb") as f:
            audio_bytes = f.read()

        if len(audio_bytes) == 0:
            return resp(400, {"error": "Empty file"})

        ext = key.rsplit(".", 1)[-1].lower() if "." in key else "mp3"

        logger.info(f"complete: {len(audio_bytes)} bytes -> {key}")

        s3 = get_s3()
        s3.put_object(Bucket="files", Key=key, Body=audio_bytes, ContentType=f"audio/{ext}")

        os.remove(tmp_path)

        new_id, cdn_url = save_track(key, title, artist)
        logger.info(f"saved track id={new_id}")
        return resp(200, {"id": new_id, "url": cdn_url, "message": "Трек загружен"})

    return resp(400, {"error": f"Unknown action: {action}"})
