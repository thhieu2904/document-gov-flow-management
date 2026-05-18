from contextlib import asynccontextmanager
import logging

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.api import admin_stats, assignments, attachments, auth, dashboard, departments, documents, notifications, progress, users
from app.core.config import settings
from app.core.schema import ensure_runtime_schema

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    settings.validate_runtime()
    ensure_runtime_schema()
    yield


app = FastAPI(
    title=settings.app_name,
    version="0.1.0",
    description="Workflow MVP for internal document and task management.",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router, prefix="/api")
app.include_router(users.router, prefix="/api")
app.include_router(departments.router, prefix="/api")
app.include_router(documents.router, prefix="/api")
app.include_router(assignments.router, prefix="/api")
app.include_router(attachments.router, prefix="/api")
app.include_router(dashboard.router, prefix="/api")
app.include_router(progress.router, prefix="/api")
app.include_router(notifications.router, prefix="/api")
app.include_router(admin_stats.router, prefix="/api")


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception):
    logger.exception("Unhandled error while processing %s %s", request.method, request.url.path)
    return JSONResponse(status_code=500, content={"detail": "Internal server error"})


@app.get("/api/health")
def health():
    return {"status": "ok", "app": settings.app_name, "env": settings.app_env}
