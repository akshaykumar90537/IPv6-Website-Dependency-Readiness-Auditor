from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from sqlalchemy import update

from .api import batch, context, scans
from .config import settings
from .middleware import MaxBodySizeMiddleware
from .models.db import SessionLocal, init_db
from .models.tables import Batch, Scan, utcnow


@asynccontextmanager
async def lifespan(_: FastAPI):
    init_db()
    try:
        with SessionLocal() as db:
            now = utcnow()
            db.execute(
                update(Scan)
                .where(Scan.status.in_(["RUNNING", "QUEUED"]))
                .values(status="SCAN_FAILED", error="Interrupted by server restart", finished_at=now)
            )
            db.execute(
                update(Batch)
                .where(Batch.status.in_(["RUNNING", "QUEUED"]))
                .values(status="COMPLETED", error="Interrupted by server restart", finished_at=now)
            )
            db.commit()
    except Exception:
        pass
    yield


app = FastAPI(title="IPv6 Website & Dependency Readiness Auditor", version=settings.scanner_version, lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=list(settings.cors_origins),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.add_middleware(MaxBodySizeMiddleware, max_bytes=settings.max_request_body_bytes)
app.include_router(scans.router)
app.include_router(context.router)
app.include_router(batch.router)


@app.get("/api/health")
def health():
    return {"status": "ok", "scanner_version": settings.scanner_version}
