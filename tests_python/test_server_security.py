import contextlib
import http.client
import json
import threading
import unittest

import server


HELP_ROOT_PATHS = (
    "/markdown_viewer.html",
    "/README.md",
    "/RELEASE_NOTES.md",
    "/LICENSE.md",
    "/swagger.html",
    "/SWAGGER.md",
)
SUPPORTED_STANDALONE_PATHS = (
    "/display_satellite.html",
    "/Earth_Stars_MilkyWay.html",
    "/SolarSystemOverview.html",
)
VENDORED_RUNTIME_PATHS = (
    "/vendor/satellite.js/6.0.2/satellite.es.js",
    "/vendor/satellite.js/6.0.2/satellite.min.js",
    "/vendor/three/0.184.0/build/three.module.js",
    "/vendor/three/0.184.0/build/three.core.js",
    "/vendor/three/0.184.0/examples/jsm/controls/OrbitControls.js",
    "/vendor/three/0.184.0/examples/jsm/renderers/CSS2DRenderer.js",
    "/vendor/three/0.184.0/examples/jsm/loaders/GLTFLoader.js",
    "/vendor/three/0.184.0/examples/jsm/loaders/MTLLoader.js",
    "/vendor/three/0.184.0/examples/jsm/loaders/OBJLoader.js",
    "/vendor/three/0.184.0/examples/jsm/utils/BufferGeometryUtils.js",
    "/vendor/three/0.184.0/examples/jsm/utils/SkeletonUtils.js",
)
DENIED_VENDOR_PATHS = (
    "/vendor/satellite.js/6.0.2/LICENSE.md",
    "/vendor/satellite.js/6.0.2/manifest.json",
    "/vendor/satellite.js/6.0.2/unlisted.js",
    "/vendor/satellite.js/6.0.1/satellite.es.js",
    "/vendor/other/6.0.2/satellite.es.js",
    "/vendor/three/0.184.0/LICENSE",
    "/vendor/three/0.184.0/manifest.json",
    "/vendor/three/0.184.0/build/three.min.js",
    "/vendor/three/0.184.0/examples/jsm/loaders/FBXLoader.js",
    "/vendor/three/0.183.0/build/three.module.js",
)


@contextlib.contextmanager
def running_server(*, cors_origins=()):
    httpd = server.ThreadingHTTPServer(
        ("127.0.0.1", 0),
        server.make_handler(serve_static=True, cors_origins=tuple(cors_origins)),
    )
    thread = threading.Thread(target=httpd.serve_forever, daemon=True)
    thread.start()
    try:
        yield httpd.server_address[1]
    finally:
        httpd.shutdown()
        httpd.server_close()
        thread.join(timeout=2)


def request(port, method, path, headers=None):
    connection = http.client.HTTPConnection("127.0.0.1", port, timeout=5)
    try:
        connection.request(method, path, headers=headers or {})
        response = connection.getresponse()
        body = response.read()
        return response.status, {key.lower(): value for key, value in response.getheaders()}, body
    finally:
        connection.close()


class StaticPathPolicyTests(unittest.TestCase):
    def test_runtime_paths_are_exposed(self):
        for path in (
            "/",
            "/index.html",
            *SUPPORTED_STANDALONE_PATHS,
            *HELP_ROOT_PATHS,
            "/css/style.css",
            "/data/stars/bright-stars-demo.js",
            "/icons/server_connected.svg",
            "/js/serverConnection.js",
            "/json/tle/TLE.json",
            "/json/tle/TLE.meta.json",
            "/json/decayed/decayed.json",
            "/json/satellites/oneweb.json",
            "/obj/ISS.glb",
            "/textures/earthmap1k.jpg",
            *VENDORED_RUNTIME_PATHS,
        ):
            with self.subTest(path=path):
                self.assertTrue(server.static_request_is_exposed(path))

    def test_sensitive_and_escaping_paths_are_blocked(self):
        for path in (
            "/.git/config",
            "/.idea/misc.xml",
            "/server.py",
            "/tools/satellite_data_tools.py",
            "/tests/runAll.js",
            "/target/classes/Example.class",
            "/ROADMAP.md",
            "/PROMPT_IMPLEMENT_ROADMAP_V2.md",
            "/PROMPT_History.md",
            "/SatOps.html",
            "/openbexi_Earth_Orbit_logo.png",
            "/release/version.json",
            "/json/ops/example.json",
            "/json/display_satellite_models.json",
            "/json/stars/catalog.json",
            "/images/openbexi_earth_orbit_ex1.png",
            "/js/serverConnection.js.map",
            "/data/stars/catalog.json",
            "/json/tle/TLE.json.bak-20260701",
            "/../outside.txt",
            "/%2e%2e/outside.txt",
            "/%252e%252e/outside.txt",
            "/node_modules/three/package.json",
            "/node_modules/three/build/three.module.js",
            "/node_modules/satellite.js/dist/satellite.min.js",
            *DENIED_VENDOR_PATHS,
        ):
            with self.subTest(path=path):
                self.assertFalse(server.static_request_is_exposed(path))

    def test_help_links_match_the_explicit_root_surface(self):
        menu_source = (server.ROOT / "js" / "SatelliteMenuLoader.js").read_text(encoding="utf-8")
        viewer_source = (server.ROOT / "markdown_viewer.html").read_text(encoding="utf-8")

        for href in (
            "markdown_viewer.html?source=README.md&amp;title=README",
            "markdown_viewer.html?source=RELEASE_NOTES.md&amp;title=Releases%20History",
            'href="LICENSE.md"',
            'href="swagger.html"',
            "markdown_viewer.html?source=SWAGGER.md&amp;title=Swagger%20API",
        ):
            with self.subTest(href=href):
                self.assertIn(href, menu_source)

        for source in ("README.md", "RELEASE_NOTES.md", "LICENSE.md", "SWAGGER.md"):
            with self.subTest(source=source):
                self.assertIn(f"['{source}'", viewer_source)
        for denied_source in ("ROADMAP.md", "PROMPT_History.md", "PROMPT_IMPLEMENT_ROADMAP_V2.md"):
            with self.subTest(denied_source=denied_source):
                self.assertNotIn(f"['{denied_source}'", viewer_source)

    def test_readme_documents_the_supported_standalone_views(self):
        readme = (server.ROOT / "README.md").read_text(encoding="utf-8")
        for file_name in ("display_satellite.html", "Earth_Stars_MilkyWay.html", "SolarSystemOverview.html"):
            with self.subTest(file_name=file_name):
                self.assertIn(f"`{file_name}`", readme)
                self.assertIn(f"http://127.0.0.1:8000/{file_name}", readme)

    def test_only_supported_root_html_pages_are_exposed(self):
        supported = {
            "index.html",
            "markdown_viewer.html",
            "swagger.html",
            "display_satellite.html",
            "earth_stars_milkyway.html",
            "solarsystemoverview.html",
        }
        root_html_files = tuple(
            path for path in server.ROOT.iterdir()
            if path.is_file() and path.suffix.lower() == ".html"
        )
        self.assertTrue(root_html_files)
        for path in root_html_files:
            with self.subTest(path=path.name):
                self.assertEqual(
                    server.static_request_is_exposed(f"/{path.name}"),
                    path.name.lower() in supported,
                )

    def test_resolved_symlink_or_traversal_cannot_escape_root(self):
        self.assertIsNone(server.resolve_static_request_path("/../server.py"))
        self.assertIsNone(server.resolve_static_request_path("/%2e%2e/server.py"))


class CorsPolicyTests(unittest.TestCase):
    def test_loopback_origins_are_allowed_by_default(self):
        self.assertTrue(server.cors_origin_is_allowed("http://127.0.0.1:9000"))
        self.assertTrue(server.cors_origin_is_allowed("http://localhost:63342"))
        self.assertTrue(server.cors_origin_is_allowed("https://[::1]:8443"))
        self.assertFalse(server.cors_origin_is_allowed("https://127.example.test"))
        self.assertFalse(server.cors_origin_is_allowed("http://user@127.0.0.1"))
        self.assertFalse(server.cors_origin_is_allowed("http://["))

    def test_remote_origins_require_explicit_configuration(self):
        self.assertFalse(server.cors_origin_is_allowed("https://example.test"))
        self.assertTrue(
            server.cors_origin_is_allowed(
                "https://example.test",
                ("https://example.test",),
            )
        )
        self.assertTrue(server.cors_origin_is_allowed("https://example.test", ("*",)))

    def test_untrusted_host_header_uses_safe_fallback(self):
        self.assertEqual(server.safe_request_host("bad host/header", 8123), "127.0.0.1:8123")
        self.assertEqual(server.safe_request_host("localhost:8123", 8123), "localhost:8123")


class HttpSecurityIntegrationTests(unittest.TestCase):
    def test_health_response_has_security_headers_and_etag(self):
        with running_server() as port:
            status, headers, body = request(port, "GET", "/api/health")
            self.assertEqual(status, 200)
            self.assertIn(b'"status":"ok"', body)
            self.assertEqual(headers["content-type"], "application/json; charset=utf-8")
            self.assertEqual(headers["cache-control"], "no-store")
            self.assertEqual(headers["x-content-type-options"], "nosniff")
            self.assertEqual(headers["x-frame-options"], "SAMEORIGIN")
            self.assertEqual(headers["referrer-policy"], "no-referrer")
            self.assertIn("etag", headers)
            self.assertNotIn("access-control-allow-origin", headers)

            second_status, second_headers, second_body = request(
                port,
                "GET",
                "/api/health",
                {"If-None-Match": headers["etag"]},
            )
            self.assertEqual(second_status, 304)
            self.assertEqual(second_headers["etag"], headers["etag"])
            self.assertEqual(second_body, b"")

    def test_static_files_work_but_repository_internals_do_not(self):
        with running_server() as port:
            status, headers, _ = request(port, "HEAD", "/index.html")
            self.assertEqual(status, 200)
            self.assertTrue(headers["content-type"].startswith("text/html"))
            self.assertEqual(headers["cache-control"], "no-cache")

            for path in (
                "/.git/config",
                "/server.py",
                "/tools/",
                "/js/",
                "/ROADMAP.md",
                "/PROMPT_IMPLEMENT_ROADMAP_V2.md",
                "/PROMPT_History.md",
                "/SatOps.html",
                "/ISS.html",
                "/starlink_v2_glb_exporter.html",
                "/release/version.json",
                "/json/ops/",
                "/json/ops/example.json",
                "/json/tle/TLE.json.bak-20260701",
                *DENIED_VENDOR_PATHS,
            ):
                with self.subTest(path=path):
                    blocked_status, _, _ = request(port, "GET", path)
                    self.assertEqual(blocked_status, 404)

            for path in (
                "/css/style.css",
                "/js/serverConnection.js",
                "/json/tle/TLE.json",
                *SUPPORTED_STANDALONE_PATHS,
                *HELP_ROOT_PATHS,
                *VENDORED_RUNTIME_PATHS,
            ):
                with self.subTest(path=path):
                    exposed_status, _, _ = request(port, "HEAD", path)
                    self.assertEqual(exposed_status, 200)

    def test_markdown_viewer_does_not_expose_unapproved_sources(self):
        with running_server() as port:
            viewer_status, _, viewer_body = request(
                port,
                "GET",
                "/markdown_viewer.html?source=ROADMAP.md&title=Denied",
            )
            self.assertEqual(viewer_status, 200)
            self.assertIn(b"ALLOWED_MARKDOWN_SOURCES", viewer_body)
            self.assertNotIn(b"['ROADMAP.md'", viewer_body)

            for path in ("/ROADMAP.md", "/PROMPT_History.md", "/PROMPT_IMPLEMENT_ROADMAP_V2.md"):
                with self.subTest(path=path):
                    denied_status, _, _ = request(port, "GET", path)
                    self.assertEqual(denied_status, 404)

    def test_loopback_preflight_is_reflected_and_remote_preflight_is_denied(self):
        with running_server() as port:
            local_origin = "http://localhost:63342"
            status, headers, _ = request(
                port,
                "OPTIONS",
                "/api/health",
                {"Origin": local_origin},
            )
            self.assertEqual(status, 204)
            self.assertEqual(headers["access-control-allow-origin"], local_origin)
            self.assertIn("Origin", headers["vary"])

            status, headers, _ = request(
                port,
                "OPTIONS",
                "/api/health",
                {"Origin": "https://example.test"},
            )
            self.assertEqual(status, 403)
            self.assertNotIn("access-control-allow-origin", headers)

    def test_explicit_remote_origin_is_supported(self):
        origin = "https://example.test"
        with running_server(cors_origins=(origin,)) as port:
            status, headers, body = request(
                port,
                "GET",
                "/api/version",
                {"Origin": origin},
            )
            self.assertEqual(status, 200)
            self.assertEqual(headers["access-control-allow-origin"], origin)
            payload = json.loads(body)
            self.assertEqual(payload["app_version"], server.RELEASE_METADATA["version"])
            self.assertEqual(payload["api_version"], server.API_V1_VERSION)
            self.assertEqual(payload["release_date"], server.RELEASE_METADATA["releasedAt"])
            self.assertEqual(payload["candidate_date"], server.RELEASE_METADATA["candidateAt"])
            self.assertEqual(payload["publication_state"], server.RELEASE_METADATA["publicationState"])
            self.assertEqual(payload["release_channel"], server.RELEASE_METADATA["channel"])
            self.assertEqual(payload["maturity"], "experimental")
            self.assertEqual(payload["safety_class"], "non-operational")


if __name__ == "__main__":
    unittest.main()
