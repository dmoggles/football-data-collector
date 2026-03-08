import json
from functools import lru_cache
from pathlib import Path
from typing import Any


def _catalog_path() -> Path:
    return Path(__file__).resolve().parents[3] / "shared" / "goal_dimensions.json"


@lru_cache(maxsize=1)
def _catalog() -> dict[str, Any]:
    with _catalog_path().open("r", encoding="utf-8") as handle:
        payload = json.load(handle)
    if not isinstance(payload, dict):
        raise ValueError("goal_dimensions.json must contain a root object")
    formats = payload.get("formats")
    if not isinstance(formats, dict):
        raise ValueError("goal_dimensions.json must include formats object")
    return payload


def get_goal_dimensions(match_format: str) -> tuple[float, float] | None:
    format_entry = _catalog().get("formats", {}).get(match_format)
    if not isinstance(format_entry, dict):
        return None
    width = float(format_entry.get("width_ft", 0))
    height = float(format_entry.get("height_ft", 0))
    if width <= 0 or height <= 0:
        return None
    return width, height
