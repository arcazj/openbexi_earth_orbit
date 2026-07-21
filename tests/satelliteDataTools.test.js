import assert from 'assert';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { spawnSync } from 'child_process';

function read(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

function findPython() {
  const candidates = [
    { command: 'py', prefix: ['-3'] },
    { command: 'python', prefix: [] },
    { command: 'python3', prefix: [] }
  ];
  for (const candidate of candidates) {
    const result = spawnSync(candidate.command, [...candidate.prefix, '--version'], { encoding: 'utf8' });
    if (!result.error && result.status === 0) return candidate;
  }
  return null;
}

function runPython(candidate, script, tempRoot) {
  const scriptPath = path.join(tempRoot, 'satellite_data_tools_fixture.py');
  fs.writeFileSync(scriptPath, script, 'utf8');
  const result = spawnSync(candidate.command, [...candidate.prefix, scriptPath], {
    cwd: process.cwd(),
    encoding: 'utf8'
  });
  assert.strictEqual(
    result.status,
    0,
    `Python fixture passed\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`
  );
}

function run() {
  const tool = read('tools/satellite_data_tools.py');
  const server = read('server.py');
  const promptHistory = read('PROMPT_History.md');
  const readme = read('README.md');
  const integration = read('Test_and_Integration.md');
  const swagger = read('SWAGGER.md');
  const swaggerHtml = read('swagger.html');

  assert(promptHistory.includes('Version 1.7.4'), 'prompt history contains the Version 1.7.4 release');
  assert(tool.includes('LEGACY_TLE_SOURCE_URLS'), 'Python tool preserves a legacy source URL list');
  assert(tool.includes('def default_repo_root()'), 'Python tool defaults to the repository root when launched from an IDE');
  assert(tool.includes('has not updated since your last successful'), 'CelesTrak no-new-data throttles are treated as not modified');
  assert(tool.includes('"https://celestrak.org/NORAD/elements/gp.php?GROUP=starlink&FORMAT=tle"'), 'legacy source list starts with Starlink');
  assert(!tool.includes('"http://celestrak.org/'), 'active CelesTrak source configuration contains no HTTP URLs');
  assert(tool.includes('HTTP_USER_AGENT = "OpenBEXI-Earth-Orbit/%s'), 'data fetches derive their client version from release metadata');
  assert(tool.includes('allow_n2yo: bool = False'), 'N2YO enrichment requires an explicit API opt-in');
  assert(tool.includes('INCREMENTAL_TLE_GROUPS = ("active", "last-30-days")'), 'default TLE update uses optimized incremental groups');
  assert(tool.includes('CELESTRAK_SATCAT_CSV_URL = "https://celestrak.org/pub/satcat.csv"'), 'tool knows the CelesTrak raw SATCAT CSV source');
  assert(tool.includes('CELESTRAK_MIN_REFRESH_HOURS = 2.0'), 'tool enforces a 2-hour CelesTrak refresh guard');
  assert(tool.includes('UPDATE_LOCK_RELATIVE_PATH'), 'tool defines a lock file for scheduled updates');
  assert(tool.includes('contextlib.nullcontext(True) if dry_run else update_lock(root)'), 'server-style dry-run does not create the lock file');
  assert(tool.includes('SPACETRACK_USERNAME'), 'Space-Track fallback is explicit and credential-gated');
  assert(tool.includes('return None'), 'Space-Track fallback remains disabled by default');
  assert(tool.includes('fetcher:'), 'tool exposes injectable fetchers for no-network tests');
  assert(tool.includes('atomic_write_json'), 'tool writes generated JSON atomically');
  assert(tool.includes('If-None-Match'), 'tool sends conditional ETag request headers');
  assert(tool.includes('If-Modified-Since'), 'tool sends conditional Last-Modified request headers');
  assert(tool.includes('merge_launch_date_sidecar_from_satcat'), 'incremental TLE updates can fill launch-date sidecars from SATCAT');
  assert(tool.includes('Decayed DB rebuild skipped; SATCAT source has not changed.'), 'unchanged SATCAT skips decayed rebuilds');

  assert(server.includes('--update-data-on-schedule'), 'server exposes scheduled update opt-in flag');
  assert(server.includes('--no-data-update'), 'server exposes scheduled update disable flag');
  assert(server.includes('--data-update-interval-hours'), 'server exposes update interval control');
  assert(server.includes('maybe_update_satellite_data'), 'server imports the Python data update function directly');
  assert(server.includes('/api/data-update-status'), 'server exposes data update status endpoint');
  assert(server.includes('"state": "disabled"'), 'server data update scheduler is disabled by default');

  assert(readme.includes('tools/satellite_data_tools.py'), 'README documents the Python data tool');
  assert(readme.includes('py tools/satellite_data_tools.py export-tle --all'), 'README documents standalone export-tle usage');
  assert(readme.includes('py tools/satellite_data_tools.py refresh-satcat --force'), 'README documents SATCAT refresh usage');
  assert(readme.includes('build-decayed-db --refresh-satcat --force'), 'README documents decayed rebuild with SATCAT refresh');
  assert(readme.includes('fills or updates `json/tle/satellite_launch_dates.json`'), 'README documents incremental launch sidecar updates');
  assert(readme.includes('If-None-Match'), 'README documents conditional SATCAT requests');
  assert(readme.includes('--update-data-on-schedule'), 'README documents scheduled server updates');
  assert(readme.includes('CelesTrak is unavailable'), 'README documents CelesTrak fallback behavior');
  assert(integration.includes('Data Maintenance Tools'), 'integration plan includes data maintenance tests');
  assert(swagger.includes('/api/data-update-status'), 'SWAGGER.md documents data update status');
  assert(swaggerHtml.includes('/api/data-update-status'), 'swagger.html documents data update status');

  const python = findPython();
  assert(python, 'Python runner is available for satellite data tool tests');
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'openbexi-data-tool-'));
  const script = `
import datetime as dt
import json
import pathlib
import shutil
import sys

sys.path.insert(0, ${JSON.stringify(process.cwd())})
from tools import satellite_data_tools as s

root = pathlib.Path(${JSON.stringify(tempRoot)})
(root / "json" / "tle").mkdir(parents=True, exist_ok=True)
(root / "json" / "decayed").mkdir(parents=True, exist_ok=True)

assert all(s.parse.urlparse(url).scheme == "https" for url in s.LEGACY_TLE_SOURCE_URLS)
assert all(s.parse.urlparse(url).scheme == "https" for url in s.source_urls_for_mode("all"))
assert s.make_celestrak_group_url("active").startswith("https://")

blocked_fetch_calls = []
def blocked_fetcher(url, headers=None):
    blocked_fetch_calls.append(url)
    raise AssertionError("non-HTTPS URL reached the fetcher")

blocked_responses, blocked_errors = s.fetch_tle_sources(
    ["http://celestrak.org/NORAD/elements/gp.php?GROUP=active&FORMAT=tle"],
    fetcher=blocked_fetcher,
)
assert blocked_responses == []
assert blocked_fetch_calls == []
assert len(blocked_errors) == 1 and "non-HTTPS" in blocked_errors[0]
try:
    s.fetch_url("http://example.test/catalog")
except s.SatelliteDataError as exc:
    assert "non-HTTPS" in str(exc)
else:
    raise AssertionError("fetch_url accepted HTTP ingestion")

captured_request = {}
class FakeHttpResponse:
    status = 200
    headers = {"ETag": "fixture"}
    def read(self):
        return b"fixture"
    def __enter__(self):
        return self
    def __exit__(self, exc_type, exc, traceback):
        return False

original_urlopen = s.request.urlopen
def fake_urlopen(req, timeout=None):
    captured_request["request"] = req
    captured_request["timeout"] = timeout
    return FakeHttpResponse()
s.request.urlopen = fake_urlopen
try:
    fetched = s.fetch_url("https://example.test/catalog")
finally:
    s.request.urlopen = original_urlopen
assert fetched.text == "fixture"
assert captured_request["request"].get_header("User-agent") == s.HTTP_USER_AGENT
assert "2.1.0" in s.HTTP_USER_AGENT

all_args = s.build_parser().parse_args(["export-tle", "--all"])
incremental_args = s.build_parser().parse_args(["export-tle"])
explicit_n2yo_args = s.build_parser().parse_args(["export-tle", "--all", "--refresh-launch-dates"])
assert all_args.refresh_launch_dates is False
assert incremental_args.refresh_launch_dates is False
assert explicit_n2yo_args.refresh_launch_dates is True

n2yo_calls = []
def n2yo_fetcher(url, headers=None):
    n2yo_calls.append(url)
    return s.FetchResponse(url=url, text="")

n2yo_skipped = s.extract_launch_dates_all(
    root=root,
    fetcher=n2yo_fetcher,
    now=dt.datetime(1990, 1, 1, tzinfo=dt.timezone.utc),
)
assert n2yo_skipped.skipped is True
assert n2yo_calls == []
n2yo_opt_in = s.extract_launch_dates_all(
    root=root,
    dry_run=True,
    fetcher=n2yo_fetcher,
    now=dt.datetime(1990, 1, 1, tzinfo=dt.timezone.utc),
    allow_n2yo=True,
)
assert n2yo_opt_in.skipped is False
assert n2yo_opt_in.counts == {"pages": 12, "records": 0, "errors": 0}
assert len(n2yo_calls) == 12
assert all(url.startswith("https://www.n2yo.com/") for url in n2yo_calls)

sample_tle = """ISS (ZARYA)
1 25544U 98067A   26154.24769802  .00009145  00000+0  16852-2 0  9990
2 25544  51.6400 135.3804 0003061  72.2548 287.8794 15.48314930362054
ISS DUPLICATE
1 25544U 98067A   26155.24769802  .00009145  00000+0  16852-2 0  9991
2 25544  51.6400 135.3804 0003061  72.2548 287.8794 15.48314930362054
"""

launch_path = root / "json" / "tle" / "satellite_launch_dates.json"
launch_path.write_text(json.dumps([{"norad_id":"25544","launch_date":"1998-11-20","name":"ISS (ZARYA)"}]), encoding="utf-8")

launch_dates = s.load_launch_dates(root)
blocks = s.parse_tle_text(sample_tle)
assert len(blocks) == 2, blocks
sat = s.transform_satellite_tle_object("stations", blocks[0][0], blocks[0][1], blocks[0][2], launch_dates)
assert sat["company"] == "stations"
assert sat["satellite_name"] == "ISS (ZARYA)"
assert sat["norad_id"] == "25544"
assert sat["launch_date"] == "1998-11-20"
assert sat["type"] == "LEO"
assert sat["orbit_class"] == "LEO"
assert sat["tle_line1"].startswith("1 25544")
assert sat["tle_line2"].startswith("2 25544")
assert sat["period_min"] > 90

responses = [("FIRST", s.FetchResponse(url="first", text=sample_tle))]
all_records, all_counts = s.build_satellites_from_tle_responses(responses, launch_dates, existing=[], mode="all")
assert len(all_records) == 1
assert all_records[0]["satellite_name"] == "ISS (ZARYA)"
assert all_counts["added"] == 1
assert all_counts["retained"] == 0
unchanged_tle = "\\n".join(sample_tle.splitlines()[:3]) + "\\n"
unchanged_responses = [("FIRST", s.FetchResponse(url="first", text=unchanged_tle))]
unchanged_records, unchanged_counts = s.build_satellites_from_tle_responses(
    unchanged_responses, launch_dates, existing=[sat], mode="incremental"
)
assert len(unchanged_records) == 1
assert unchanged_counts["updated"] == 0
assert unchanged_counts["retained"] == 1

tle_path = root / "json" / "tle" / "TLE.json"
meta_path = root / "json" / "tle" / "TLE.meta.json"
tle_path.write_text(json.dumps([sat]), encoding="utf-8")
meta_path.write_text(json.dumps({"fetched_at":"2026-06-14T12:00:00Z","last_success_at":"2026-06-14T12:00:00Z"}), encoding="utf-8")
calls = []
def fail_fetcher(url, headers=None):
    calls.append(url)
    raise RuntimeError("network should not be called")
recent = s.export_tle_data(
    root=root,
    mode="incremental",
    fetcher=fail_fetcher,
    now=dt.datetime(2026, 6, 14, 12, 30, tzinfo=dt.timezone.utc),
)
assert recent.skipped is True
assert calls == []

meta_path.write_text(json.dumps({"fetched_at":"2026-06-14T00:00:00Z","last_success_at":"2026-06-14T00:00:00Z"}), encoding="utf-8")
failure = s.export_tle_data(
    root=root,
    mode="incremental",
    fetcher=fail_fetcher,
    now=dt.datetime(2026, 6, 14, 12, 30, tzinfo=dt.timezone.utc),
)
assert failure.skipped is True
assert json.loads(tle_path.read_text(encoding="utf-8"))[0]["norad_id"] == "25544"
failed_meta = json.loads(meta_path.read_text(encoding="utf-8"))
assert failed_meta["last_status"] == "failed"
assert failed_meta["last_success_at"] == "2026-06-14T00:00:00Z"

satcat_path = root / "json" / "satcat.csv"
satcat_path.write_text(
    "OBJECT_NAME,OBJECT_ID,NORAD_CAT_ID,OBJECT_TYPE,LAUNCH_DATE,LAUNCH_SITE,DECAY_DATE\\n"
    "ROCKET,1957-001A,1,R/B,1957-10-04,TYMSC,1957-12-01\\n"
    "SPUTNIK 1,1957-001B,2,PAY,1957-10-04,TYMSC,1958-01-03\\n"
    "LIVE PAY,1958-001A,4,PAY,1958-02-01,AFETR,\\n",
    encoding="utf-8",
)
decayed = s.build_decayed_db(root=root, mode="all", force=True)
assert decayed.counts["records"] == 1
decayed_json = json.loads((root / "json" / "decayed" / "decayed.json").read_text(encoding="utf-8"))
assert list(decayed_json.keys()) == ["SPUTNIK 1"]
assert decayed_json["SPUTNIK 1"][0]["OBJECT_TYPE"] == "PAY"
assert (root / "json" / "decayed" / "decayed.meta.json").exists()

sidecar_root = root / "sidecar"
(sidecar_root / "json" / "tle").mkdir(parents=True, exist_ok=True)
sidecar_tle = """FRESH SAT
1 70001U 26001A   26166.50000000  .00009145  00000+0  16852-2 0  9990
2 70001  51.6400 135.3804 0003061  72.2548 287.8794 15.48314930362054
"""
(sidecar_root / "json" / "tle" / "TLE.json").write_text("[]", encoding="utf-8")
(sidecar_root / "json" / "tle" / "TLE.meta.json").write_text(json.dumps({"last_success_at":"2026-06-14T00:00:00Z"}), encoding="utf-8")
(sidecar_root / "json" / "tle" / "satellite_launch_dates.json").write_text("[]", encoding="utf-8")
(sidecar_root / "json" / "satcat.csv").write_text(
    "OBJECT_NAME,OBJECT_ID,NORAD_CAT_ID,OBJECT_TYPE,LAUNCH_DATE,LAUNCH_SITE,DECAY_DATE\\n"
    "FRESH SAT,2026-001A,70001,PAY,2026-06-01,AFETR,\\n",
    encoding="utf-8",
)
tle_fetch_calls = []
def sidecar_tle_fetcher(url, headers=None):
    tle_fetch_calls.append((url, headers or {}))
    return s.FetchResponse(url=url, text=sidecar_tle, status=200, headers={"etag":"tle-etag","last-modified":"Mon, 15 Jun 2026 00:00:00 GMT"})

sidecar_update = s.export_tle_data(
    root=sidecar_root,
    mode="incremental",
    force=True,
    fetcher=sidecar_tle_fetcher,
    now=dt.datetime(2026, 6, 15, 12, 30, tzinfo=dt.timezone.utc),
)
assert sidecar_update.counts["added"] == 1
assert sidecar_update.counts["sidecar_added"] == 1
assert sidecar_update.counts["satellite_launch_dates_updated"] == 1
sidecar_launch_dates = json.loads((sidecar_root / "json" / "tle" / "satellite_launch_dates.json").read_text(encoding="utf-8"))
assert sidecar_launch_dates == [{"norad_id":"70001","name":"FRESH SAT","launch_date":"2026-06-01"}]
sidecar_tle_json = json.loads((sidecar_root / "json" / "tle" / "TLE.json").read_text(encoding="utf-8"))
assert sidecar_tle_json[0]["launch_date"] == "2026-06-01"
assert all("GROUP=active" in call[0] or "GROUP=last-30-days" in call[0] for call in tle_fetch_calls)

fresh_root = root / "fresh"
(fresh_root / "json" / "decayed").mkdir(parents=True, exist_ok=True)
fresh_satcat = (
    "OBJECT_NAME,OBJECT_ID,NORAD_CAT_ID,OBJECT_TYPE,LAUNCH_DATE,LAUNCH_SITE,DECAY_DATE\\n"
    "FRESH PAY,2026-001A,70001,PAY,2026-01-01,AFETR,2026-02-01\\n"
)
refresh_calls = []
def satcat_fetcher(url, headers=None):
    refresh_calls.append(url)
    return s.FetchResponse(url=url, text=fresh_satcat, status=200, headers={"etag":"test-etag","last-modified":"Mon, 15 Jun 2026 00:00:00 GMT"})

satcat_refresh = s.refresh_satcat_csv(root=fresh_root, force=True, fetcher=satcat_fetcher)
assert satcat_refresh.changed is True
assert refresh_calls == [s.CELESTRAK_SATCAT_CSV_URL]
assert (fresh_root / "json" / "satcat.csv").read_text(encoding="utf-8") == fresh_satcat
assert json.loads((fresh_root / "json" / "satcat.meta.json").read_text(encoding="utf-8"))["last_status"] == "ok"

decayed_refresh = s.build_decayed_db(root=fresh_root, mode="incremental", force=True, refresh_satcat=True, fetcher=satcat_fetcher)
assert decayed_refresh.counts["records"] == 1
fresh_decayed = json.loads((fresh_root / "json" / "decayed" / "decayed.json").read_text(encoding="utf-8"))
assert list(fresh_decayed.keys()) == ["FRESH PAY"]

not_modified_calls = []
def not_modified_satcat_fetcher(url, headers=None):
    not_modified_calls.append((url, headers or {}))
    return s.FetchResponse(
        url=url,
        text="",
        status=304,
        headers={"etag":"test-etag","last-modified":"Mon, 15 Jun 2026 00:00:00 GMT"},
        not_modified=True,
    )

previous_decayed_text = (fresh_root / "json" / "decayed" / "decayed.json").read_text(encoding="utf-8")
decayed_not_modified = s.build_decayed_db(
    root=fresh_root,
    mode="incremental",
    force=True,
    refresh_satcat=True,
    fetcher=not_modified_satcat_fetcher,
    now=dt.datetime(2026, 6, 15, 13, 30, tzinfo=dt.timezone.utc),
)
assert decayed_not_modified.skipped is True
assert decayed_not_modified.changed is False
assert decayed_not_modified.message == "Decayed DB rebuild skipped; SATCAT source has not changed."
assert (fresh_root / "json" / "decayed" / "decayed.json").read_text(encoding="utf-8") == previous_decayed_text
assert not_modified_calls[0][1]["If-None-Match"] == "test-etag"
assert not_modified_calls[0][1]["If-Modified-Since"] == "Mon, 15 Jun 2026 00:00:00 GMT"
decayed_meta = json.loads((fresh_root / "json" / "decayed" / "decayed.meta.json").read_text(encoding="utf-8"))
assert decayed_meta["last_status"] == "not-modified"
satcat_meta = json.loads((fresh_root / "json" / "satcat.meta.json").read_text(encoding="utf-8"))
assert satcat_meta["last_status"] == "not-modified"

print("satellite data tool fixture passed")
assert s.default_repo_root().name == "openbexi_earth_orbit"
`;
  runPython(python, script, tempRoot);
  fs.rmSync(tempRoot, { recursive: true, force: true });

  console.log('satelliteDataTools tests passed');
}

run();
