import os

from fastapi import FastAPI, APIRouter
from starlette.middleware.cors import CORSMiddleware

from ..routes.cpus import router as cpus_router
from ..routes.gpus import router as gpus_router
from ..routes.games import router as games_router
from ..routes.health import router as health_router
from ..routes.admin_hardware import router as admin_hardware_router
from ..routes.admin_games import router as admin_games_router

# Environment variable to distinguish between development and production
ENV = os.environ.get("ENV", "dev")

# Define route tags for documentation
route_tags = [
        {"name": "CPUs", "description": "Endpoints for CPU data and info."},
        {"name": "GPUs", "description": "Endpoints for GPU data and info."},
        {"name": "Games", "description": "Endpoints for retrieving game information."},
        {"name": "Health", "description": "Health check endpoints for the API."},
        {"name": "Admin - Games", "description": "Admin routes to manage gamed in MongoDB."},
        {"name": "Admin - Hardware", "description": "Admin routes to manage hardware in MongoDB."},
    ]

app = FastAPI(
    title="Can I Run It API",
    description="API for checking if your PC can run games",
    version="0.1.0",
    openapi_tags=route_tags,
    docs_url=None if ENV != 'dev' else "/docs",
    redoc_url=None if ENV != 'dev' else "/redoc",
    openapi_url=None if ENV != 'dev' else "/openapi.json"
)
api_router = APIRouter(prefix="/api")

# Include routers
api_router.include_router(cpus_router, prefix="/hardware", tags=["CPUs"])
api_router.include_router(gpus_router, prefix="/hardware", tags=["GPUs"])
api_router.include_router(admin_hardware_router, prefix="/admin/hardware", tags=["Admin - Hardware"])
api_router.include_router(admin_games_router, prefix="/admin/games", tags=["Admin - Games"])
api_router.include_router(games_router, prefix="", tags=["Games"])
api_router.include_router(health_router, prefix="/health", tags=["Health"])

# disabled for now, will need to be switched to SQL DB for ML model
#api_router.include_router(requirements_router, prefix="/req", tags=["Requirements"])
app.include_router(api_router)

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=[os.environ["ALLOWED_ORIGINS"]],  # React frontend origin
    #allow_origins=["*"],  # all origins
    allow_credentials=True,
    allow_methods=["*"],  # Allow all HTTP methods
    allow_headers=["*"],  # Allow all HTTP headers
)

if __name__ == "__main__":
    import uvicorn
    port = int(os.environ["BACKEND_PORT"])
    uvicorn.run("main:app", host="0.0.0.0", port=port, reload=True)