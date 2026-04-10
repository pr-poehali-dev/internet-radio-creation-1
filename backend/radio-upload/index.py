"""
Загрузка аудиофайлов чанками: init → chunk → complete. Каждый чанк до 512KB base64.
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
CHUNK_STORE = {}

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


def handler(event: dict, context) -> dict:
    if event.get("httpMethod") == "OPTIONS":
        return {"statusCode": 200, "headers": CORS_HEADERS, "body": ""}

    method = event.get("httpMethod", "GET")
    if method != "POST":
        return resp(405, {"error": "Method not allowed"})

    body = json.loads(event.get("body") or "{}")
    action = body.get("action")

    if not check_admin(event):
        return resp(403, {"error": "Forbidden"})

    # action=upload — загрузить весь файл одним запросом (base64, до ~3.5MB файла)
    if action == "upload":
        file_data = body.get("file_data", "")
        file_name = body.get("file_name", "track.mp3")
        title = body.get("title", "Без названия")
        artist = body.get("artist", "")

        if not file_data:
            return resp(400, {"error": "No file_data"})

        try:
            audio_bytes = base64.b64decode(file_data)
        except Exception as e:
            logger.error(f"base64 decode error: {e}")
            return resp(400, {"error": "Invalid base64"})

        ext = file_name.rsplit(".", 1)[-1].lower() if "." in file_name else "mp3"
        key = f"radio/{uuid.uuid4()}.{ext}"

        logger.info(f"upload: {len(audio_bytes)} bytes, key={key}")

        s3 = get_s3()
        s3.put_object(Bucket="files", Key=key, Body=audio_bytes, ContentType=f"audio/{ext}")

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

        logger.info(f"Track saved: id={new_id}")
        return resp(200, {"id": new_id, "url": cdn_url, "message": "Трек загружен"})

    # action=init — начать multipart upload
    if action == "init":
        file_name = body.get("file_name", "track.mp3")
        ext = file_name.rsplit(".", 1)[-1].lower() if "." in file_name else "mp3"
        key = f"radio/{uuid.uuid4()}.{ext}"

        s3 = get_s3()
        mpu = s3.create_multipart_upload(Bucket="files", Key=key, ContentType=f"audio/{ext}")
        upload_id = mpu["UploadId"]

        logger.info(f"init: key={key}, upload_id={upload_id}")
        return resp(200, {"key": key, "upload_id": upload_id})

    # action=chunk — загрузить часть файла
    if action == "chunk":
        key = body.get("key")
        upload_id = body.get("upload_id")
        part_number = body.get("part_number")
        chunk_data = body.get("data", "")

        if not all([key, upload_id, part_number, chunk_data]):
            return resp(400, {"error": "Missing fields"})

        chunk_bytes = base64.b64decode(chunk_data)
        s3 = get_s3()
        part = s3.upload_part(
            Bucket="files", Key=key, UploadId=upload_id,
            PartNumber=part_number, Body=chunk_bytes,
        )
        etag = part["ETag"]

        logger.info(f"chunk: key={key}, part={part_number}, size={len(chunk_bytes)}")
        return resp(200, {"etag": etag, "part_number": part_number})

    # action=complete — завершить multipart upload и сохранить трек
    if action == "complete":
        key = body.get("key")
        upload_id = body.get("upload_id")
        parts = body.get("parts", [])
        title = body.get("title", "Без названия")
        artist = body.get("artist", "")

        if not all([key, upload_id, parts]):
            return resp(400, {"error": "Missing fields"})

        s3 = get_s3()
        s3.complete_multipart_upload(
            Bucket="files", Key=key, UploadId=upload_id,
            MultipartUpload={"Parts": [{"PartNumber": p["part_number"], "ETag": p["etag"]} for p in parts]},
        )

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

        logger.info(f"complete: id={new_id}, key={key}")
        return resp(200, {"id": new_id, "url": cdn_url, "message": "Трек загружен"})

    return resp(400, {"error": f"Unknown action: {action}"})
