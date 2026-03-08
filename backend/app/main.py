import logging

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from sqlalchemy.exc import SQLAlchemyError

from app.api.router import api_router
from app.core.club_logos import CLUB_LOGO_URL_PREFIX, CLUB_LOGOS_DIR, ensure_club_logo_dir
from app.core.config import settings

logger = logging.getLogger(__name__)


def handle_database_error(_: Request, exc: SQLAlchemyError) -> JSONResponse:
    logger.exception("Database error during request processing", exc_info=exc)
    return JSONResponse(
        status_code=503,
        content={"detail": "Database is currently unavailable"},
    )


def create_app() -> FastAPI:
    ensure_club_logo_dir()
    app = FastAPI(
        title=settings.app_name,
        debug=settings.app_debug,
    )
    app.add_exception_handler(SQLAlchemyError, handle_database_error)
    app.mount(CLUB_LOGO_URL_PREFIX, StaticFiles(directory=str(CLUB_LOGOS_DIR)), name="club-logos")
    app.include_router(api_router)
    return app


app = create_app()
