import hashlib
from datetime import UTC, datetime

from fastapi import Depends, HTTPException, Request, status
from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.api.deps import get_db
from app.api.permissions import Permission, get_global_role, require_permission
from app.core.config import settings
from app.models.global_role import GlobalRoleType
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

    expires_at = session_record.expires_at
    if expires_at.tzinfo is None or expires_at.utcoffset() is None:
        expires_at = expires_at.replace(tzinfo=UTC)

    if expires_at <= datetime.now(UTC):
        db.execute(delete(UserSession).where(UserSession.id == session_record.id))
        db.commit()
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Session expired")

    user = db.scalar(select(User).where(User.id == session_record.user_id))
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found")

    return user


def is_super_admin(db: Session, user_id: str) -> bool:
    return get_global_role(db, user_id, GlobalRoleType.SUPER_ADMIN.value) is not None


def require_super_admin(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> User:
    require_permission(db=db, user_id=user.id, permission=Permission.SUPER_ADMIN)
    return user
