from uuid import uuid4

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.auth_deps import get_current_user, is_super_admin
from app.api.deps import get_db
from app.core.club_logos import CLUB_LOGOS_DIR, build_club_logo_url
from app.models.club import Club
from app.models.user import User

router = APIRouter(prefix="/clubs", tags=["clubs"])

ALLOWED_CONTENT_TYPES = {
    "image/png": "png",
    "image/jpeg": "jpg",
    "image/webp": "webp",
}
MAX_LOGO_BYTES = 5 * 1024 * 1024


@router.post("/{club_id}/logo")
async def upload_club_logo(
    club_id: str,
    logo: UploadFile = File(...),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> dict[str, str | None]:
    club = db.scalar(select(Club).where(Club.id == club_id))
    if not club:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Club not found")

    if not is_super_admin(db, user.id):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Super admin access required",
        )

    extension = ALLOWED_CONTENT_TYPES.get(logo.content_type or "")
    if not extension:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Unsupported image format. Use PNG, JPG, or WebP.",
        )

    raw = await logo.read()
    if not raw:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Uploaded file is empty",
        )
    if len(raw) > MAX_LOGO_BYTES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Logo file is too large (max 5MB)",
        )

    old_logo_filename = club.logo_filename
    new_logo_filename = f"{club.id}_{uuid4().hex}.{extension}"
    logo_path = CLUB_LOGOS_DIR / new_logo_filename
    logo_path.write_bytes(raw)
    club.logo_filename = new_logo_filename
    db.commit()

    if old_logo_filename:
        old_logo_path = CLUB_LOGOS_DIR / old_logo_filename
        if old_logo_path.exists():
            old_logo_path.unlink()

    return {
        "id": club.id,
        "name": club.name,
        "logo_url": build_club_logo_url(club.logo_filename),
    }
