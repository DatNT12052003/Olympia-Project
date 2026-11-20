#!/bin/sh
# Lịch chạy theo BACKUP_CRON (giờ UTC; mặc định 19:00 UTC = 02:00 giờ Việt Nam).
set -eu
echo "${BACKUP_CRON} /usr/local/bin/backup.sh >> /proc/1/fd/1 2>&1" > /etc/crontabs/root
echo "Lịch sao lưu: ${BACKUP_CRON} (UTC)"
exec crond -f -l 8
