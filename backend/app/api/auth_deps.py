import hashlib
from datetime import UTC, datetime

from fastapi import Depends, HTTPException, Request, status
from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.api.deps import get_db
from app.core.config import settings
from app.models.session import Session as UserSession
from app.models.user import User


def get_current_user(request: Request, db: Session = Depends(get_db)) -> User:
    raw_token = request.cookies.get(settings.session_cookie_name)
    if not raw_token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")

    token_hash = hashlib.sha256(raw_token.encode("utf-8")).hexdigest()
    session_record = db.scalar(select(UserSession).where(UserSession.token_hash == token_hash))

    if not session_record:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid session")

    if session_record.expires_at <= datetime.now(UTC):
        db.execute(delete(UserSession).where(UserSession.id == session_record.id))
        db.commit()
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Session expired")

    user = db.scalar(select(User).where(User.id == session_record.user_id))
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found")

    return user
