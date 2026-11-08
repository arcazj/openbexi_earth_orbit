"""Offline backup/restore rehearsal in disposable state roots; no cloud upload."""
import io
import json
import sys
import tarfile
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from tests_python.test_v232_satellite_data_plane import seed_repository, changed_launch_updater, NOW, inventory
from tools.satellite_data_plane import SatelliteDataPlane
from tools.background_updates import restore_snapshot


def main():
    with tempfile.TemporaryDirectory(prefix='openbexi-v25-recovery-') as temporary:
        root = Path(temporary)
        seed_repository(root)
        plane = SatelliteDataPlane(repository_root=root, state_root=root / 'source-state')
        result = plane.stage_update(promote=True, now=NOW, updater=changed_launch_updater('recovery-fixture'))
        assert result.get('promoted'), result
        pointer = plane.pointer_path.read_bytes()
        before = inventory(plane.current_root())
        body = io.BytesIO()
        with tarfile.open(fileobj=body, mode='w') as archive:
            for path in sorted(plane.current_root().rglob('*')):
                if path.is_file() and '.bak-' not in path.name:
                    archive.add(path, arcname=path.relative_to(plane.state_root).as_posix(), recursive=False)
            archive.add(plane.pointer_path, arcname='current.json')
        restored = SatelliteDataPlane(repository_root=root, state_root=root / 'restored-state')
        restore_snapshot(body.getvalue(), restored)
        assert inventory(restored.current_root()) == before
        assert plane.pointer_path.read_bytes() == pointer
        assert restored.pointer_path.read_bytes() == pointer
        # Repeat restore and recreate the plane to exercise idempotence/restart.
        restore_snapshot(body.getvalue(), restored)
        restarted = SatelliteDataPlane(repository_root=root, state_root=restored.state_root)
        assert inventory(restarted.current_root()) == before
        report = dict(schemaVersion=1, status='passed', scope='synthetic isolated runtime archive; no network/cloud',
                      artifacts=len(before), archiveBytes=len(body.getvalue()), restart='passed', idempotence='passed',
                      sourcePointerPreserved=True, userRuntimeTouched=False)
    print(json.dumps(report, indent=2))


if __name__ == '__main__':
    main()
