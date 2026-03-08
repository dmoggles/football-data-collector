from pathlib import Path

BASE_DIR = Path(__file__).resolve().parents[2]
CLUB_LOGOS_DIR = BASE_DIR / "uploaded_media" / "club_logos"
CLUB_LOGO_URL_PREFIX = "/club-logos"


def ensure_club_logo_dir() -> None:
    CLUB_LOGOS_DIR.mkdir(parents=True, exist_ok=True)


def build_club_logo_url(logo_filename: str | None) -> str | None:
    if not logo_filename:
        return None
    return f"{CLUB_LOGO_URL_PREFIX}/{logo_filename}"
