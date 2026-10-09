"""Paths and configuration shared by every bake stage."""

from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import yaml

PIPELINE_DIR = Path(__file__).resolve().parent.parent
ROOT = PIPELINE_DIR.parent


@dataclass(frozen=True)
class Config:
    raw: dict[str, Any]
    local: dict[str, Any]

    @property
    def crs(self) -> str:
        return self.raw["crs"]

    @property
    def bbox(self) -> tuple[float, float, float, float]:
        return tuple(self.raw["fetch"]["bbox"])  # type: ignore[return-value]

    def __getitem__(self, key: str) -> Any:
        return self.raw[key]


DATA = ROOT / "data"
RAW = DATA / "raw"
INTERIM = DATA / "interim"
WORLD = ROOT / "world"


def load() -> Config:
    raw = yaml.safe_load((PIPELINE_DIR / "config.yaml").read_text(encoding="utf-8"))
    local_path = PIPELINE_DIR / "local.yaml"
    local = yaml.safe_load(local_path.read_text(encoding="utf-8")) if local_path.exists() else {}
    for d in (RAW, INTERIM):
        d.mkdir(parents=True, exist_ok=True)
    return Config(raw=raw, local=local or {})


def interim(name: str) -> Path:
    return INTERIM / name


def read_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def write_json(path: Path, obj: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(obj, indent=2, ensure_ascii=False), encoding="utf-8")
