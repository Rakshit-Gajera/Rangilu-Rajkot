"""Stage 1: download raw data and record provenance in data/raw/manifest.json."""

from __future__ import annotations

import hashlib
import subprocess
import sys
import urllib.request
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

    for key in ("osm", "dem"):
        dest = C.RAW / src[key]["file"]
        if force or not dest.exists():
            _download(src[key]["url"], dest)
        manifest[key] = {"url": src[key]["url"], "file": src[key]["file"]}

    ov = C.RAW / src["overture_buildings"]["file"]
    if force or not ov.exists() or ov.stat().st_size < 1024:
        bbox = ",".join(str(v) for v in cfg.bbox)
        exe = Path(sys.executable).with_name("overturemaps")
        print("  downloading Overture buildings")
        subprocess.run([str(exe), "download", f"--bbox={bbox}", "-f", "geoparquet",
                        "--type=building", "-o", str(ov)], check=True)
    manifest["overture_buildings"] = {"file": src["overture_buildings"]["file"], "bbox": list(cfg.bbox)}

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
