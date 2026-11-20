# Sao lưu PostgreSQL định kỳ ra object storage S3-compatible (DL-023).
FROM postgres:17-alpine
RUN apk add --no-cache aws-cli
COPY backup.sh /usr/local/bin/backup.sh
COPY entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/backup.sh /usr/local/bin/entrypoint.sh
ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
