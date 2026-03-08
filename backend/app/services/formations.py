import json
from functools import lru_cache
from pathlib import Path
from typing import Any


DEPTH_BANDS = ("CB", "DM", "CM", "AM", "ST")


def _catalog_path() -> Path:
    return Path(__file__).resolve().parents[3] / "shared" / "formations.json"


def _read_catalog_file() -> dict[str, Any]:
    with _catalog_path().open("r", encoding="utf-8") as handle:
        payload = json.load(handle)
    if not isinstance(payload, dict):
        raise ValueError("formations.json must contain a root object")
    return payload


def _normalize_band_entries(raw_entries: Any, *, context: str) -> list[dict[str, str]]:
    if not isinstance(raw_entries, list):
        raise ValueError(f"{context} must be a list")
    normalized: list[dict[str, str]] = []
    for index, entry in enumerate(raw_entries):
        if isinstance(entry, str):
            role = entry.strip()
            lane = "center"
        elif isinstance(entry, dict):
            role = str(entry.get("role", "")).strip()
            lane = str(entry.get("lane", "center")).strip().lower()
        else:
            raise ValueError(f"{context}[{index}] must be an object or string")
        if not role:
            raise ValueError(f"{context}[{index}] role is required")
        if lane not in {"left", "center", "right"}:
            raise ValueError(f"{context}[{index}] lane must be left/center/right")
        normalized.append({"role": role, "lane": lane})
    return normalized


@lru_cache(maxsize=1)
def _catalog() -> dict[str, Any]:
    payload = _read_catalog_file()
    formats = payload.get("formats")
    if not isinstance(formats, dict):
        raise ValueError("formations.json must include formats object")

    catalog: dict[str, Any] = {}
    for match_format, format_data in formats.items():
        if not isinstance(format_data, dict):
            raise ValueError(f"formats.{match_format} must be an object")

        required_count = format_data.get("required_starting_count")
        if not isinstance(required_count, int) or required_count < 1:
            raise ValueError(f"formats.{match_format}.required_starting_count must be a positive integer")

        formations = format_data.get("formations")
        if not isinstance(formations, list) or len(formations) == 0:
            raise ValueError(f"formats.{match_format}.formations must be a non-empty list")

        normalized_formations: list[dict[str, Any]] = []
        for formation_index, formation_data in enumerate(formations):
            if not isinstance(formation_data, dict):
                raise ValueError(f"formats.{match_format}.formations[{formation_index}] must be an object")
            formation_id = str(formation_data.get("id", "")).strip()
            if not formation_id:
                raise ValueError(f"formats.{match_format}.formations[{formation_index}].id is required")

            bands = formation_data.get("bands")
            if not isinstance(bands, dict):
                raise ValueError(f"formats.{match_format}.formations[{formation_index}].bands must be an object")

            normalized_bands: dict[str, list[dict[str, str]]] = {}
            for band in DEPTH_BANDS:
                normalized_bands[band] = _normalize_band_entries(
                    bands.get(band, []),
                    context=f"formats.{match_format}.formations[{formation_index}].bands.{band}",
                )

            outfield_count = sum(len(normalized_bands[band]) for band in DEPTH_BANDS)
            if outfield_count != required_count - 1:
                raise ValueError(
                    f"formats.{match_format}.formations[{formation_index}] has {outfield_count} outfield players; "
                    f"expected {required_count - 1}"
                )

            normalized_formations.append({"id": formation_id, "bands": normalized_bands})

        catalog[match_format] = {
            "required_starting_count": required_count,
            "formations": normalized_formations,
        }
    return catalog


def _format_config(match_format: str) -> dict[str, Any] | None:
    return _catalog().get(match_format)


def _formation_config(match_format: str, formation: str) -> dict[str, Any] | None:
    format_config = _format_config(match_format)
    if not format_config:
        return None
    return next((item for item in format_config["formations"] if item["id"] == formation), None)


def get_formation_options(match_format: str) -> list[str]:
    format_config = _format_config(match_format)
    if not format_config:
        return []
    return [item["id"] for item in format_config["formations"]]


def get_required_starting_count(match_format: str) -> int:
    format_config = _format_config(match_format)
    if not format_config:
        return 11
    return int(format_config["required_starting_count"])


def is_allowed_formation(match_format: str, formation: str) -> bool:
    return _formation_config(match_format, formation) is not None


def get_slot_ids(match_format: str, formation: str) -> list[str]:
    formation_config = _formation_config(match_format, formation)
    if not formation_config:
        return []

    slots = ["GK"]
    compact_line_index = 0
    for band in DEPTH_BANDS:
        entries = formation_config["bands"][band]
        if len(entries) == 0:
            continue
        compact_line_index += 1
        for player_index, _ in enumerate(entries, start=1):
            slots.append(f"L{compact_line_index}_{player_index}")
    return slots


def get_slot_role_map(match_format: str, formation: str) -> dict[str, str]:
    formation_config = _formation_config(match_format, formation)
    if not formation_config:
        return {}

    role_map: dict[str, str] = {"GK": "GK"}
    compact_line_index = 0
    for band in DEPTH_BANDS:
        entries = formation_config["bands"][band]
        if len(entries) == 0:
            continue
        compact_line_index += 1
        for player_index, entry in enumerate(entries, start=1):
            role_map[f"L{compact_line_index}_{player_index}"] = entry["role"].strip().upper()
    return role_map
