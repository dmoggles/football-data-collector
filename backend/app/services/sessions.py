import hashlib
import secrets
from datetime import UTC, datetime, timedelta

from sqlalchemy.orm import Session

from app.core.config import settings
from app.models.session import Session as UserSession


def create_session(db: Session, user_id: str) -> str:
    raw_token = secrets.token_urlsafe(48)
    token_hash = hashlib.sha256(raw_token.encode("utf-8")).hexdigest()
    expires_at = datetime.now(UTC) + timedelta(hours=settings.session_expiry_hours)

    db_session = UserSession(user_id=user_id, token_hash=token_hash, expires_at=expires_at)
    db.add(db_session)
    db.commit()

    return raw_token


def hash_session_token(raw_token: str) -> str:
    return hashlib.sha256(raw_token.encode("utf-8")).hexdigest()
