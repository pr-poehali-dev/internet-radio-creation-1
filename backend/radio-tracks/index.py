"""
Управление треками радио: получение списка, загрузка mp3, удаление, сортировка
"""
import json
import os
import base64
import uuid
import psycopg2
import boto3
from botocore.exceptions import ClientError

SCHEMA = os.environ.get("MAIN_DB_SCHEMA", "public")

CORS_HEADERS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
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
    path_params = event.get("queryStringParameters") or {}

    # GET — список треков
    if method == "GET":
        conn = get_db()
        cur = conn.cursor()
        cur.execute(
            f"SELECT id, title, artist, url, duration, position, is_active, created_at "
            f"FROM {SCHEMA}.tracks WHERE is_active = TRUE ORDER BY position ASC, id ASC"
        )
        rows = cur.fetchall()
        conn.close()
        tracks = [
            {
                "id": r[0],
                "title": r[1],
                "artist": r[2] or "",
                "url": r[3],
                "duration": r[4],
                "position": r[5],
                "is_active": r[6],
                "created_at": str(r[7]),
            }
            for r in rows
        ]
        return {"statusCode": 200, "headers": CORS_HEADERS, "body": json.dumps({"tracks": tracks})}

    # POST — загрузка нового трека
    if method == "POST":
        if not check_admin(event):
            return {"statusCode": 403, "headers": CORS_HEADERS, "body": json.dumps({"error": "Forbidden"})}

        body = json.loads(event.get("body") or "{}")
        title = body.get("title", "Без названия")
        artist = body.get("artist", "")
        file_data = body.get("file_data", "")
        file_name = body.get("file_name", "track.mp3")

        if not file_data:
            return {"statusCode": 400, "headers": CORS_HEADERS, "body": json.dumps({"error": "No file data"})}

        # Декодируем base64
        audio_bytes = base64.b64decode(file_data)
        ext = file_name.rsplit(".", 1)[-1].lower() if "." in file_name else "mp3"
        key = f"radio/{uuid.uuid4()}.{ext}"

        s3 = get_s3()
        s3.put_object(
            Bucket="files",
            Key=key,
            Body=audio_bytes,
            ContentType=f"audio/{ext}",
        )

        cdn_url = f"https://cdn.poehali.dev/projects/{os.environ['AWS_ACCESS_KEY_ID']}/bucket/{key}"

        conn = get_db()
        cur = conn.cursor()
        cur.execute(
            f"SELECT COALESCE(MAX(position), -1) + 1 FROM {SCHEMA}.tracks WHERE is_active = TRUE"
        )
        position = cur.fetchone()[0]
        cur.execute(
            f"INSERT INTO {SCHEMA}.tracks (title, artist, filename, url, position) "
            f"VALUES (%s, %s, %s, %s, %s) RETURNING id",
            (title, artist, key, cdn_url, position),
        )
        new_id = cur.fetchone()[0]
        conn.commit()
        conn.close()

        return {
            "statusCode": 200,
            "headers": CORS_HEADERS,
            "body": json.dumps({"id": new_id, "url": cdn_url, "message": "Трек загружен"}),
        }

    # DELETE — удаление трека
    if method == "DELETE":
        if not check_admin(event):
            return {"statusCode": 403, "headers": CORS_HEADERS, "body": json.dumps({"error": "Forbidden"})}

        track_id = path_params.get("id")
        if not track_id:
            return {"statusCode": 400, "headers": CORS_HEADERS, "body": json.dumps({"error": "No id"})}

        conn = get_db()
        cur = conn.cursor()
        cur.execute(
            f"UPDATE {SCHEMA}.tracks SET is_active = FALSE WHERE id = %s",
            (track_id,),
        )
        conn.commit()
        conn.close()

        return {"statusCode": 200, "headers": CORS_HEADERS, "body": json.dumps({"message": "Удалено"})}

    # PUT — изменение порядка / данных трека
    if method == "PUT":
        if not check_admin(event):
            return {"statusCode": 403, "headers": CORS_HEADERS, "body": json.dumps({"error": "Forbidden"})}

        body = json.loads(event.get("body") or "{}")
        track_id = body.get("id")
        new_position = body.get("position")
        title = body.get("title")
        artist = body.get("artist")

        conn = get_db()
        cur = conn.cursor()
        if new_position is not None:
            cur.execute(f"UPDATE {SCHEMA}.tracks SET position = %s WHERE id = %s", (new_position, track_id))
        if title is not None:
            cur.execute(f"UPDATE {SCHEMA}.tracks SET title = %s WHERE id = %s", (title, track_id))
        if artist is not None:
            cur.execute(f"UPDATE {SCHEMA}.tracks SET artist = %s WHERE id = %s", (artist, track_id))
        conn.commit()
        conn.close()

        return {"statusCode": 200, "headers": CORS_HEADERS, "body": json.dumps({"message": "Обновлено"})}

    return {"statusCode": 405, "headers": CORS_HEADERS, "body": json.dumps({"error": "Method not allowed"})}
