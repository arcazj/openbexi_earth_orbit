#!/bin/sh
set -eu
python -u /app/server.py --host 127.0.0.1 --port 8000 --no-v21-service --data-update-process &
backend=$!
attempt=0
until wget -q -T 2 -O /dev/null http://127.0.0.1:8000/api/health; do
    attempt=$((attempt + 1))
    if [ "$attempt" -ge 60 ] || ! kill -0 "$backend" 2>/dev/null; then
        kill -TERM "$backend" 2>/dev/null || true
        exit 1
    fi
    sleep 1
done
trap 'kill -TERM "$backend" 2>/dev/null || true; kill -TERM "$frontend" 2>/dev/null || true; wait || true; exit 0' TERM INT
# Render the standard nginx template with PORT, then start the frontend.
/docker-entrypoint.sh nginx -g 'daemon off;' &
frontend=$!
# Fail the container if either required process exits.
while kill -0 "$backend" 2>/dev/null && kill -0 "$frontend" 2>/dev/null; do sleep 1; done
kill -TERM "$backend" 2>/dev/null || true
kill -TERM "$frontend" 2>/dev/null || true
wait || true
exit 1
