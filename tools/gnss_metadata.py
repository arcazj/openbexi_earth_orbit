"""Read GNSS flight identities and epoch-tagged measurements from IGS SINEX."""
import json
from collections import defaultdict
from datetime import datetime, timedelta
from pathlib import Path
from tempfile import NamedTemporaryFile


def timestamp(epoch):
    year, day, second = map(int, epoch.split(":"))
    if not year:
        return None
    value = datetime(year, 1, 1) + timedelta(days=day-1, seconds=second)
    return value.isoformat(timespec="seconds")+"Z"


def sections(lines, prefix):
    result = defaultdict(list)
    block = None
    for line in lines:
        if line.startswith("+"):
            block = line[1:].strip()
        elif line.startswith("-"):
            block = None
        elif block and line.startswith(" "+prefix):
            result[block].append(line.split())
    return result


def read_metadata(path, prefix):
    lines = path.read_text("ascii").splitlines()
    # Four-digit epochs in data records, two-digit creation year in the SINEX header.
    created = datetime.strptime(lines[0].split()[3][:6], "%y:%j").date().isoformat()
    raw = sections(lines, prefix)
    prns = defaultdict(list)
    for svn, start, end, prn, *comments in raw["SATELLITE/PRN"]:
        assignment = {"id": prn, "start": timestamp(start), "end": timestamp(end)}
        comment = " ".join(comments)
        if "unknown" in comment or "no signals" in comment:
            assignment["note"] = comment
        prns[svn].append(assignment)
    masses = {}
    for svn, start, end, mass, *comments in raw["SATELLITE/MASS"]:
        value = float(mass)
        if value <= 0:
            continue
        note = " ".join(comments).lower()
        # SINEX can contain a mass history. Keep the last published model epoch.
        if svn not in masses or start > masses[svn][0]:
            masses[svn] = (start, {"in_orbit_mass_kg":value, "mass_epoch":timestamp(start)[:10],
                                   "mass_estimated":"guess" in note or "based on" in note})
    return created, raw["SATELLITE/IDENTIFIER"], prns, masses


def write_registry(registry, updated):
    text = "{\n"+",\n".join("  "+json.dumps(k)+": "+json.dumps(v, ensure_ascii=False)
                              for k,v in updated.items())+"\n}\n"
    content = text.encode()
    if registry.read_bytes() != content:
        with NamedTemporaryFile(dir=registry.parent, delete=False) as output:
            temporary = Path(output.name)
        try:
            temporary.write_bytes(content)
            temporary.replace(registry)
        finally:
            temporary.unlink(missing_ok=True)
