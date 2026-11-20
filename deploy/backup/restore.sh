#!/bin/sh
# Khôi phục từ một bản sao lưu (DỪNG api trước khi chạy). Xem docs/van-hanh.md mục Khôi phục.
#   docker compose run --rm --entrypoint /bin/sh -v ./backup:/scripts backup /scripts/restore.sh olympia-YYYYMMDDTHHMMSSZ.dump
set -eu
name="${1:?Cần tên tệp sao lưu}"
aws --endpoint-url "${BACKUP_S3_ENDPOINT}" s3 cp "s3://${BACKUP_S3_BUCKET}/${BACKUP_S3_PREFIX}/${name}" /tmp/restore.dump --only-show-errors
pg_restore --clean --if-exists --no-owner --dbname="${PGDATABASE}" /tmp/restore.dump
rm -f /tmp/restore.dump
echo "Đã khôi phục ${name}"
