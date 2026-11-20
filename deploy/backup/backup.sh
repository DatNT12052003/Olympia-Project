#!/bin/sh
# Một lần sao lưu: pg_dump dạng custom (nén) → object storage, rồi xóa bản cũ hơn
# BACKUP_RETENTION_DAYS ngày. Chạy tay: docker compose exec backup backup.sh
set -eu
stamp=$(date -u +%Y%m%dT%H%M%SZ)
file="/tmp/olympia-${stamp}.dump"
target="s3://${BACKUP_S3_BUCKET}/${BACKUP_S3_PREFIX}/olympia-${stamp}.dump"
s3() { aws --endpoint-url "${BACKUP_S3_ENDPOINT}" s3 "$@"; }

echo "[$(date -u +%FT%TZ)] Bắt đầu sao lưu ${PGDATABASE}"
pg_dump --format=custom --no-owner --file="${file}"
s3 cp "${file}" "${target}" --only-show-errors
rm -f "${file}"
echo "[$(date -u +%FT%TZ)] Đã tải lên ${target}"

cutoff=$(date -u -d "@$(( $(date -u +%s) - BACKUP_RETENTION_DAYS * 86400 ))" +%Y%m%d)
s3 ls "s3://${BACKUP_S3_BUCKET}/${BACKUP_S3_PREFIX}/" | awk '{print $4}' | while read -r name; do
  day=$(echo "${name}" | sed -n 's/^olympia-\([0-9]\{8\}\)T.*/\1/p')
  if [ -n "${day}" ] && [ "${day}" -lt "${cutoff}" ]; then
    s3 rm "s3://${BACKUP_S3_BUCKET}/${BACKUP_S3_PREFIX}/${name}" --only-show-errors
    echo "Đã xóa bản cũ ${name}"
  fi
done
