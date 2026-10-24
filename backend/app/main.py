from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api import (
    appointments,
    auth,
    billing,
    clinical,
    clinics,
    dashboard,
    notifications,
    patient_portal,
    patients,
    scheduling,
    settings as settings_api,
    staff,
    waitlist,
)
from app.core.config import get_settings
from app.core.database import Base, engine
from app.core.errors import register_error_handlers

settings = get_settings()
settings.validate_for_production()


@asynccontextmanager
async def lifespan(_: FastAPI):
    if settings.auto_create_tables:
        import app.models  # noqa: F401  (register models)

        Base.metadata.create_all(bind=engine)
    yield


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
               settings_api, billing, clinical, scheduling):
    app.include_router(module.router, prefix=settings.api_prefix)


@app.get("/health", tags=["health"])
def health():
    return {"status": "ok"}
