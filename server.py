#!/usr/bin/env python3
"""Local OpenBEXI Earth Orbit server.

The server intentionally uses only the Python standard library so the existing
static app can gain local API and OpenAPI documentation without adding a
mandatory Python dependency installation step.
"""

from __future__ import annotations

import argparse
import json
import mimetypes
from http import HTTPStatus
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import quote, unquote, urlparse


APP_VERSION = "1.5.15"
RELEASE_DATE = "2026-06-04"
REPO_URL = "https://github.com/arcazj/openbexi_earth_orbit"
ROOT = Path(__file__).resolve().parent


def _json_bytes(payload: object) -> bytes:
    return json.dumps(payload, ensure_ascii=False, separators=(",", ":")).encode("utf-8")


def _safe_json_file(path: Path) -> bytes:
    resolved = path.resolve()
    if not resolved.is_file() or ROOT not in resolved.parents:
        raise FileNotFoundError(path)
    return resolved.read_bytes()


def _metadata_files() -> list[dict[str, object]]:
    metadata_dir = ROOT / "json" / "satellites"
    files = []
    for path in sorted(metadata_dir.glob("*.json")):
        files.append(
            {
                "name": path.name,
                "path": f"json/satellites/{path.name}",
                "url": f"/api/satellite-metadata/{quote(path.name)}",
                "bytes": path.stat().st_size,
            }
        )
    return files


def _openapi_document(host: str) -> dict[str, object]:
    json_array_schema = {
        "type": "array",
        "items": {"type": "object", "additionalProperties": True},
    }
    json_object_schema = {"type": "object", "additionalProperties": True}
    return {
        "openapi": "3.0.3",
        "info": {
            "title": "OpenBEXI Earth Orbit API",
            "version": APP_VERSION,
            "description": (
                "Local API for OpenBEXI Earth Orbit satellite data, "
                "TLE data, metadata, and health/status checks."
            ),
        },
        "servers": [{"url": f"http://{host}"}],
        "paths": {
            "/api/health": {
                "get": {
                    "summary": "Check server health",
                    "responses": {
                        "200": {
                            "description": "Server is available",
                            "content": {"application/json": {"schema": json_object_schema}},
                        }
                    },
                }
            },
            "/api/version": {
                "get": {
                    "summary": "Get app and API version information",
                    "responses": {
                        "200": {
                            "description": "Version payload",
                            "content": {"application/json": {"schema": json_object_schema}},
                        }
                    },
                }
            },
            "/api/tle": {
                "get": {
                    "summary": "Load the TLE dataset used by the frontend",
                    "responses": {
                        "200": {
                            "description": "TLE satellite records",
                            "content": {"application/json": {"schema": json_array_schema}},
                        }
                    },
                }
            },
            "/api/satellites": {
                "get": {
                    "summary": "Alias for the current satellite/TLE dataset",
                    "responses": {
                        "200": {
                            "description": "Satellite records",
                            "content": {"application/json": {"schema": json_array_schema}},
                        }
                    },
                }
            },
            "/api/satellite-metadata": {
                "get": {
                    "summary": "List available satellite metadata files",
                    "responses": {
                        "200": {
                            "description": "Metadata file index",
                            "content": {"application/json": {"schema": json_object_schema}},
                        }
                    },
                }
            },
            "/api/satellite-metadata/{file_name}": {
                "get": {
                    "summary": "Load one known satellite metadata JSON file",
                    "parameters": [
                        {
                            "name": "file_name",
                            "in": "path",
                            "required": True,
                            "schema": {"type": "string"},
                        }
                    ],
                    "responses": {
                        "200": {
                            "description": "Satellite metadata JSON",
                            "content": {"application/json": {"schema": json_object_schema}},
                        },
                        "404": {"description": "Metadata file not found"},
                    },
                }
            },
            "/api/decayed": {
                "get": {
                    "summary": "Load confirmed decayed satellite data",
                    "responses": {
                        "200": {
                            "description": "Decayed satellite source data",
                            "content": {"application/json": {"schema": json_object_schema}},
                        }
                    },
                }
            },
            "/openapi.json": {
                "get": {
                    "summary": "OpenAPI schema",
                    "responses": {
                        "200": {
                            "description": "OpenAPI JSON document",
                            "content": {"application/json": {"schema": json_object_schema}},
                        }
                    },
                }
            },
            "/docs": {
                "get": {
                    "summary": "Swagger/OpenAPI documentation page",
                    "responses": {"200": {"description": "HTML documentation"}},
                }
            },
        },
    }


def _docs_html() -> bytes:
    return f"""<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>OpenBEXI Earth Orbit API Docs</title>
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@5/swagger-ui.css">
  <style>
    body {{ margin: 0; background: #0f1520; color: #d9ecff; font-family: Arial, sans-serif; }}
    .fallback {{ padding: 16px; border-bottom: 1px solid #274466; background: #111d2c; }}
    .fallback a {{ color: #8ecbff; }}
    #swagger-ui {{ background: #0f1520; min-height: calc(100vh - 48px); }}
    .swagger-ui, .swagger-ui .info .title, .swagger-ui .info p, .swagger-ui .opblock-tag,
    .swagger-ui .opblock .opblock-summary-path, .swagger-ui .opblock .opblock-summary-description,
    .swagger-ui table thead tr td, .swagger-ui table thead tr th, .swagger-ui .response-col_status,
    .swagger-ui .response-col_description, .swagger-ui .model-title, .swagger-ui .model,
    .swagger-ui .parameter__name, .swagger-ui .parameter__type, .swagger-ui .parameter__deprecated,
    .swagger-ui .tab li, .swagger-ui label, .swagger-ui p, .swagger-ui h4, .swagger-ui h5 {{
      color: #e8f5ff !important;
    }}
    .swagger-ui .info .title small, .swagger-ui .info .title small pre {{
      background: #d8f2ff !important;
      color: #06182c !important;
    }}
    .swagger-ui .scheme-container {{
      background: #edf6ff !important;
      color: #06182c !important;
      box-shadow: none !important;
    }}
    .swagger-ui .scheme-container label, .swagger-ui .scheme-container select {{
      color: #06182c !important;
    }}
    .swagger-ui .opblock.opblock-get {{
      background: #132640 !important;
      border-color: #6db6ff !important;
    }}
    .swagger-ui .opblock.opblock-get .opblock-summary {{
      border-color: #6db6ff !important;
    }}
    .swagger-ui .opblock .opblock-summary-method {{
      color: #ffffff !important;
      text-shadow: 0 1px 1px rgba(0,0,0,0.45);
    }}
    .swagger-ui .opblock .opblock-summary-path a span,
    .swagger-ui .opblock .opblock-summary-path__deprecated {{
      color: #ffffff !important;
      font-weight: 800 !important;
    }}
    .swagger-ui .opblock .opblock-summary-description {{
      color: #bdd7f0 !important;
    }}
    .swagger-ui .opblock-description-wrapper,
    .swagger-ui .opblock-external-docs-wrapper,
    .swagger-ui .opblock-title_normal,
    .swagger-ui .responses-wrapper,
    .swagger-ui .parameters-container {{
      background: #102033 !important;
      color: #e8f5ff !important;
    }}
    .swagger-ui .highlight-code,
    .swagger-ui .microlight,
    .swagger-ui pre {{
      background: #071321 !important;
      color: #e8f5ff !important;
    }}
    .swagger-ui .btn, .swagger-ui .try-out__btn {{
      color: #e8f5ff !important;
      border-color: #7fbaff !important;
      background: #183b63 !important;
    }}
    .swagger-ui svg, .swagger-ui .expand-operation svg {{
      fill: #e8f5ff !important;
    }}
  </style>
</head>
<body>
  <div class="fallback">
    <strong>OpenBEXI Earth Orbit API</strong>
    <span>Version {APP_VERSION}, released {RELEASE_DATE}.</span>
    <a href="/openapi.json">OpenAPI schema</a>
  </div>
  <div id="swagger-ui"></div>
  <script src="https://unpkg.com/swagger-ui-dist@5/swagger-ui-bundle.js"></script>
  <script>
    if (window.SwaggerUIBundle) {{
      window.SwaggerUIBundle({{ url: '/openapi.json', dom_id: '#swagger-ui' }});
    }}
  </script>
</body>
</html>
""".encode("utf-8")


class OpenBexiHandler(SimpleHTTPRequestHandler):
    server_version = "OpenBEXIHTTP/1.5.15"

    def __init__(self, *args, serve_static: bool = True, **kwargs):
        self.serve_static = serve_static
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def end_headers(self) -> None:
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET,HEAD,OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.send_header("Access-Control-Max-Age", "600")
        super().end_headers()

    def do_OPTIONS(self) -> None:
        self.send_response(HTTPStatus.NO_CONTENT)
        self.end_headers()

    def do_GET(self) -> None:
        if self._handle_api(head_only=False):
            return
        if not self.serve_static:
            self.send_error(HTTPStatus.NOT_FOUND, "Static hosting disabled")
            return
        super().do_GET()

    def do_HEAD(self) -> None:
        if self._handle_api(head_only=True):
            return
        if not self.serve_static:
            self.send_error(HTTPStatus.NOT_FOUND, "Static hosting disabled")
            return
        super().do_HEAD()

    def _send_bytes(
        self,
        body: bytes,
        *,
        content_type: str = "application/json; charset=utf-8",
        status: HTTPStatus = HTTPStatus.OK,
        head_only: bool = False,
    ) -> None:
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        if not head_only:
            self.wfile.write(body)

    def _send_json(self, payload: object, *, head_only: bool = False) -> None:
        self._send_bytes(_json_bytes(payload), head_only=head_only)

    def _send_json_file(self, path: Path, *, head_only: bool = False) -> None:
        self._send_bytes(_safe_json_file(path), head_only=head_only)

    def _handle_api(self, *, head_only: bool) -> bool:
        parsed = urlparse(self.path)
        path = parsed.path.rstrip("/") or "/"
        host = self.headers.get("Host", f"127.0.0.1:{self.server.server_port}")

        try:
            if path == "/api/health":
                self._send_json(
                    {
                        "status": "ok",
                        "app": "openbexi_earth_orbit",
                        "version": APP_VERSION,
                        "release_date": RELEASE_DATE,
                    },
                    head_only=head_only,
                )
                return True
            if path == "/api/version":
                self._send_json(
                    {
                        "app_version": APP_VERSION,
                        "api_version": APP_VERSION,
                        "release_date": RELEASE_DATE,
                        "repository": REPO_URL,
                        "server": self.server_version,
                    },
                    head_only=head_only,
                )
                return True
            if path in {"/api/tle", "/api/satellites"}:
                self._send_json_file(ROOT / "json" / "tle" / "TLE.json", head_only=head_only)
                return True
            if path == "/api/satellite-metadata":
                self._send_json(
                    {
                        "count": len(_metadata_files()),
                        "files": _metadata_files(),
                    },
                    head_only=head_only,
                )
                return True
            if path.startswith("/api/satellite-metadata/"):
                file_name = Path(unquote(path.split("/", 3)[-1])).name
                if not file_name.endswith(".json"):
                    self.send_error(HTTPStatus.NOT_FOUND, "Only JSON metadata files are exposed")
                    return True
                self._send_json_file(ROOT / "json" / "satellites" / file_name, head_only=head_only)
                return True
            if path == "/api/decayed":
                self._send_json_file(ROOT / "json" / "decayed" / "decayed.json", head_only=head_only)
                return True
            if path == "/openapi.json":
                self._send_json(_openapi_document(host), head_only=head_only)
                return True
            if path == "/docs":
                self._send_bytes(_docs_html(), content_type="text/html; charset=utf-8", head_only=head_only)
                return True
        except FileNotFoundError:
            self.send_error(HTTPStatus.NOT_FOUND, "Requested API resource was not found")
            return True
        except OSError as exc:
            self.send_error(HTTPStatus.INTERNAL_SERVER_ERROR, str(exc))
            return True

        if path.startswith("/api/"):
            self.send_error(HTTPStatus.NOT_FOUND, "Unknown API route")
            return True
        return False

    def guess_type(self, path: str) -> str:
        if path.endswith(".glb"):
            return "model/gltf-binary"
        if path.endswith(".obj"):
            return "text/plain"
        if path.endswith(".mtl"):
            return "text/plain"
        return super().guess_type(path) or mimetypes.guess_type(path)[0] or "application/octet-stream"


def make_handler(serve_static: bool):
    def handler(*args, **kwargs):
        return OpenBexiHandler(*args, serve_static=serve_static, **kwargs)

    return handler


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Serve OpenBEXI Earth Orbit locally with API endpoints.")
    parser.add_argument("--host", default="127.0.0.1", help="Bind host. Default: 127.0.0.1")
    parser.add_argument("--port", default=8000, type=int, help="Bind port. Default: 8000")
    parser.add_argument(
        "--no-static",
        action="store_true",
        help="Disable serving index.html and static repository files.",
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    server = ThreadingHTTPServer((args.host, args.port), make_handler(serve_static=not args.no_static))
    url = f"http://{args.host}:{args.port}"
    print(f"OpenBEXI Earth Orbit server {APP_VERSION} listening on {url}")
    print(f"App:  {url}/index.html")
    print(f"Docs: {url}/docs")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nStopping OpenBEXI server.")
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
