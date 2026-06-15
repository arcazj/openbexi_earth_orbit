# OpenBEXI Earth Orbit Swagger API

`SWAGGER.md` is the local, static Markdown companion for the optional OpenBEXI Earth Orbit Python API.

The Help `Swagger` action opens `swagger.html`, a standard Swagger/OpenAPI-style static page that does not require `server.py`.

You do not need to run `server.py` to read this Markdown companion. Open it directly as Markdown or use:

```text
markdown_viewer.html?source=SWAGGER.md&title=Swagger%20API
```

Live endpoint requests and the generated OpenAPI JSON still require the optional Python server.

## Server Startup

```powershell
py server.py --host 127.0.0.1 --port 8000
```

Default base URL:

```text
http://127.0.0.1:8000
```

## Static Documentation

- Local standard Swagger UI page: `swagger.html`
- Local Markdown page: `SWAGGER.md`
- Rendered local Markdown page: `markdown_viewer.html?source=SWAGGER.md&title=Swagger%20API`
- Live Swagger UI, server required: `http://127.0.0.1:8000/docs`
- Live OpenAPI JSON, server required: `http://127.0.0.1:8000/openapi.json`

## Endpoints

| Method | Path | Server Required | Description |
| --- | --- | --- | --- |
| `GET` | `/api/health` | Yes | Returns local API health, app name, version, and release date. |
| `GET` | `/api/version` | Yes | Returns app/API version metadata, release date, repository URL, and server identifier. |
| `GET` | `/api/tle` | Yes | Returns the active TLE satellite dataset from `json/tle/TLE.json`. |
| `GET` | `/api/satellites` | Yes | Alias for `/api/tle`. |
| `GET` | `/api/satellite-metadata` | Yes | Lists available metadata JSON files under `json/satellites/`. |
| `GET` | `/api/satellite-metadata/{file_name}` | Yes | Returns one metadata JSON file by safe file name. |
| `GET` | `/api/display-satellite-models` | Yes | Returns a live manifest of `.glb` and `.obj`/`.mtl` models under `obj/`. |
| `GET` | `/api/decayed` | Yes | Returns confirmed decayed satellite data from `json/decayed/decayed.json`. |
| `GET` | `/api/data-update-status` | Yes | Returns optional background satellite data update scheduler status. |
| `GET` | `/openapi.json` | Yes | Returns the generated OpenAPI 3.0.3 schema. |
| `GET` | `/docs` | Yes | Serves the live Swagger UI page. |

## Examples

Health:

```http
GET /api/health HTTP/1.1
Host: 127.0.0.1:8000
```

Example response:

```json
{
  "status": "ok",
  "app": "openbexi_earth_orbit",
  "version": "1.7.6",
  "release_date": "2026-06-15"
}
```

Version:

```http
GET /api/version HTTP/1.1
Host: 127.0.0.1:8000
```

Example response:

```json
{
  "app_version": "1.7.6",
  "api_version": "1.7.6",
  "release_date": "2026-06-15",
  "repository": "https://github.com/arcazj/openbexi_earth_orbit",
  "server": "OpenBEXIHTTP/1.7.6 Python"
}
```

TLE dataset:

```http
GET /api/tle HTTP/1.1
Host: 127.0.0.1:8000
```

Response shape:

```json
[
  {
    "name": "ISS (ZARYA)",
    "tle_line1": "1 ...",
    "tle_line2": "2 ..."
  }
]
```

Satellite metadata index:

```http
GET /api/satellite-metadata HTTP/1.1
Host: 127.0.0.1:8000
```

Response shape:

```json
{
  "count": 1,
  "files": [
    {
      "name": "example.json",
      "path": "json/satellites/example.json",
      "url": "/api/satellite-metadata/example.json",
      "bytes": 1234
    }
  ]
}
```

Data update status:

```http
GET /api/data-update-status HTTP/1.1
Host: 127.0.0.1:8000
```

Example response:

```json
{
  "enabled": false,
  "state": "disabled",
  "interval_hours": 24
}
```

## Notes

- The frontend can run from local static files and falls back to repository JSON when the Python server is offline.
- The Python server is optional for API access, live Swagger UI, and live OpenAPI JSON.
- Scheduled TLE/decayed-data updates are disabled by default; start `server.py` with `--update-data-on-schedule` to enable background freshness checks.
- This Markdown page is intentionally static so Help documentation remains available without the Python server.
- API responses are local development data for visualization and testing, not operational satellite products.
