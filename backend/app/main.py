import asyncio
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api import (
    ai,
    analytics,
    appointments,
    auth,
    billing,
    checkin,
    clinical,
    clinics,
    consents,
    dashboard,
    families,
    documents,
    inventory,
    messaging,
    recalls,
    notifications,
    patient_portal,
    patients,
    payouts,
    prescriptions,
    scheduling,
    settings as settings_api,
    staff,
    waitlist,
)
from app.core.config import get_settings
from app.core.database import Base, SessionLocal, engine
from app.core.errors import register_error_handlers

settings = get_settings()
settings.validate_for_production()


log = logging.getLogger("dentassist.reminders")


def _reminders_once() -> None:
    from app.services.messaging import run_due_reminders
    from app.services.recalls import run_jobs as run_recall_jobs

    with SessionLocal() as db:
        counts = run_due_reminders(db)
        if any(counts.values()):
            log.info("Reminders: %s", counts)
        recall_counts = run_recall_jobs(db)
        if any(recall_counts.values()):
            log.info("Recalls and reviews: %s", recall_counts)


async def _reminder_loop() -> None:
    """Send due WhatsApp reminders every few minutes. Safe with several API workers: each
    reminder has a unique dedupe key, so only one of them can send it."""
    while True:
        try:
            await asyncio.to_thread(_reminders_once)
        except Exception:  # noqa: BLE001
            log.exception("Reminder run failed")
        await asyncio.sleep(max(settings.reminders_interval_seconds, 60))


@asynccontextmanager
async def lifespan(_: FastAPI):
    if settings.auto_create_tables:
        import app.models  # noqa: F401  (register models)

        Base.metadata.create_all(bind=engine)
    task = asyncio.create_task(_reminder_loop()) if settings.reminders_enabled else None
    yield
    if task:
        task.cancel()


app = FastAPI(
    title=settings.app_name,
    version="0.1.0",
    lifespan=lifespan,
    docs_url="/docs",
    openapi_url="/openapi.json",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["X-Total-Count"],
)

register_error_handlers(app)

for module in (auth, dashboard, clinics, staff, patients, appointments, waitlist, patient_portal, notifications,
               settings_api, billing, clinical, scheduling, messaging, recalls, prescriptions, consents, inventory, analytics, documents, ai, payouts, families, checkin):
    app.include_router(module.router, prefix=settings.api_prefix)


@app.get("/health", tags=["health"])
def health():
    return {"status": "ok"}
