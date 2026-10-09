"""Stage 1: download raw data and record provenance in data/raw/manifest.json."""

from __future__ import annotations

import hashlib
import subprocess
import sys
import urllib.request
import zipfile
from datetime import datetime, timezone
from pathlib import Path

from . import config as C


def _sha256(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def _download(url: str, dest: Path) -> None:
    dest.parent.mkdir(parents=True, exist_ok=True)
    tmp = dest.with_suffix(dest.suffix + ".part")
    print(f"  downloading {url}")
    with urllib.request.urlopen(url) as r, tmp.open("wb") as f:
        while chunk := r.read(1 << 20):
            f.write(chunk)
    tmp.replace(dest)


def run(cfg: C.Config, force: bool = False) -> None:
    src = cfg["fetch"]["sources"]
    manifest_path = C.RAW / "manifest.json"
    manifest = C.read_json(manifest_path) if manifest_path.exists() else {}

    for key in ("osm", "dem", "ghsl_height"):
        dest = C.RAW / src[key]["file"]
        if force or not dest.exists():
            _download(src[key]["url"], dest)
        manifest[key] = {"url": src[key]["url"], "file": src[key]["file"]}
    with zipfile.ZipFile(C.RAW / src["ghsl_height"]["file"]) as z:
        tifs = [n for n in z.namelist() if n.endswith(".tif")]
        if not all((C.RAW / "ghsl" / n).exists() for n in tifs):
            z.extractall(C.RAW / "ghsl", members=tifs)

    bbox = ",".join(str(v) for v in cfg.bbox)
    exe = Path(sys.executable).with_name("overturemaps")
    for key in ("overture_buildings", "overture_places"):
        dest = C.RAW / src[key]["file"]
        if force or not dest.exists() or dest.stat().st_size < 1024:
            print(f"  downloading Overture {src[key]['type']}")
            subprocess.run([str(exe), "download", f"--bbox={bbox}", "-f", "geoparquet",
                            f"--type={src[key]['type']}", "-o", str(dest)], check=True)
        state = dest.with_name(dest.name + ".state")
        release = C.read_json(state).get("last_release") if state.exists() else None
        manifest[key] = {"file": src[key]["file"], "bbox": list(cfg.bbox), "release": release}

    for entry in manifest.values():
        p = C.RAW / entry["file"]
        if p.exists():
            st = p.stat()
            if entry.get("size") != st.st_size:
                entry["size"] = st.st_size
                entry["sha256"] = _sha256(p)
                entry["fetched"] = datetime.fromtimestamp(st.st_mtime, timezone.utc).isoformat()
    C.write_json(manifest_path, manifest)
    print(f"  manifest -> {manifest_path}")
