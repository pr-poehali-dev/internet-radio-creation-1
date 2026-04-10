"""
Генерация presigned URL для прямой загрузки аудиофайла в S3, и сохранение трека в БД после загрузки
"""
import json
import os
import uuid
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


def handler(event: dict, context) -> dict:
    if event.get("httpMethod") == "OPTIONS":
        return {"statusCode": 200, "headers": CORS_HEADERS, "body": ""}

    method = event.get("httpMethod", "GET")

    # POST /presign — получить presigned URL для загрузки файла напрямую в S3
    if method == "POST":
        body = json.loads(event.get("body") or "{}")
        action = body.get("action", "presign")

        if action == "presign":
            if not check_admin(event):
                return {"statusCode": 403, "headers": CORS_HEADERS, "body": json.dumps({"error": "Forbidden"})}

            file_name = body.get("file_name", "track.mp3")
            ext = file_name.rsplit(".", 1)[-1].lower() if "." in file_name else "mp3"
            key = f"radio/{uuid.uuid4()}.{ext}"

            s3 = get_s3()
            presigned_url = s3.generate_presigned_url(
                "put_object",
                Params={
                    "Bucket": "files",
                    "Key": key,
                    "ContentType": f"audio/{ext}",
                },
                ExpiresIn=600,
            )

            logger.info(f"Generated presigned URL for key={key}")
            return {
                "statusCode": 200,
                "headers": CORS_HEADERS,
                "body": json.dumps({"upload_url": presigned_url, "key": key}),
            }

        # action == "confirm" — файл уже загружен, сохраняем трек в БД
        if action == "confirm":
            if not check_admin(event):
                return {"statusCode": 403, "headers": CORS_HEADERS, "body": json.dumps({"error": "Forbidden"})}

            key = body.get("key")
            title = body.get("title", "Без названия")
            artist = body.get("artist", "")

            if not key:
                return {"statusCode": 400, "headers": CORS_HEADERS, "body": json.dumps({"error": "No key"})}

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

            logger.info(f"Track saved: id={new_id}, key={key}")
            return {
                "statusCode": 200,
                "headers": CORS_HEADERS,
                "body": json.dumps({"id": new_id, "url": cdn_url, "message": "Трек загружен"}),
            }

    return {"statusCode": 405, "headers": CORS_HEADERS, "body": json.dumps({"error": "Method not allowed"})}
