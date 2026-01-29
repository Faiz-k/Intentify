from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import CORS_ORIGINS, cleanup_google_credentials
from app.database import init_db
from app.routers import health, prompts, sessions


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    yield
    cleanup_google_credentials()


app = FastAPI(
    title="Intentify API",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(sessions.router, prefix="/session", tags=["sessions"])
app.include_router(prompts.router, prefix="/prompts", tags=["prompts"])
app.include_router(health.router, prefix="/health", tags=["health"])

@app.get("/")
async def root():
    return {"message": "Intentify API"}

@app.get("/health")
async def health():
    return {"status": "healthy"}
