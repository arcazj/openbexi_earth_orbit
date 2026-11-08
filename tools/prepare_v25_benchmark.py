"""Create a doubled, synthetic catalog under ignored runtime/ for local load tests."""
import copy
import csv
import io
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from tools import satellite_data_tools as tools


def main():
    target = ROOT / 'runtime/v25-doubled-catalog'
    if (target / 'profile.json').exists():
        print('Reusing explicit benchmark fixture: runtime/v25-doubled-catalog')
        return
    rows = json.loads((ROOT / tools.GP_RELATIVE_PATH).read_text(encoding='utf-8'))
    duplicate = copy.deepcopy(rows)
    for row in duplicate:
        identity = str(int(row['norad_id']) + 100_000_000)
        row.update(norad_id=identity, object_id='obx:norad:' + identity,
                   name='LOAD TEST ' + row['name'], satellite_name='LOAD TEST ' + row['satellite_name'])
        row['element_set']['omm']['NORAD_CAT_ID'] = identity
        row['element_set']['omm']['OBJECT_NAME'] = row['name']
    tools.atomic_write_json(target / tools.GP_RELATIVE_PATH, rows + duplicate, backup=False)
    gp_meta = json.loads((ROOT / tools.GP_META_RELATIVE_PATH).read_text(encoding='utf-8'))
    digest = tools.catalog_revision_for_text((target / tools.GP_RELATIVE_PATH).read_text(encoding='utf-8'))
    gp_meta.update(catalog_revision=digest, dataset_hash=digest)
    tools.atomic_write_json(target / tools.GP_META_RELATIVE_PATH, gp_meta, backup=False, indent=2)
    with (ROOT / tools.SATCAT_RELATIVE_PATH).open(encoding='utf-8', newline='') as handle:
        reader = csv.DictReader(handle)
        fields, originals = reader.fieldnames, list(reader)
    more = copy.deepcopy(originals)
    for row in more:
        row['NORAD_CAT_ID'] = str(int(row['NORAD_CAT_ID']) + 100_000_000)
        row['OBJECT_NAME'] = 'LOAD TEST ' + row['OBJECT_NAME']
    stream = io.StringIO(newline='')
    writer = csv.DictWriter(stream, fieldnames=fields, lineterminator='\n')
    writer.writeheader(); writer.writerows(originals + more)
    text = stream.getvalue()
    (target / tools.SATCAT_RELATIVE_PATH).write_bytes(text.encode())
    sat_meta = json.loads((ROOT / tools.SATCAT_META_RELATIVE_PATH).read_text(encoding='utf-8'))
    digest = tools.catalog_revision_for_text(text)
    sat_meta.update(catalog_revision=digest, dataset_hash=digest, last_reconciled_catalog_revision=digest,
                    counts={'records': len(originals) * 2})
    tools.atomic_write_json(target / tools.SATCAT_META_RELATIVE_PATH, sat_meta, backup=False, indent=2)
    result = tools.build_tracked_catalog(root=target, mode=tools.RECONCILIATION_MODE)
    if result.errors:
        raise RuntimeError(result.errors)
    manifest = json.loads((target / tools.TRACKED_MANIFEST_RELATIVE_PATH).read_text(encoding='utf-8'))
    profile = dict(synthetic=True, purpose='performance only; never real observations or deployment data',
                   gpRecords=len(rows) * 2, satcatRecords=len(originals) * 2, trackedCounts=manifest['counts'])
    (target / 'profile.json').write_text(json.dumps(profile, indent=2), encoding='utf-8')
    print(json.dumps(profile, indent=2))


if __name__ == '__main__':
    main()
