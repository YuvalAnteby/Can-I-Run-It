import os

from fastapi import FastAPI, APIRouter
from starlette.middleware.cors import CORSMiddleware

from backend.src.routes.admin_games import router as admin_router
from backend.src.routes.cpus import router as cpus_router
from backend.src.routes.gpus import router as gpus_router
from backend.src.routes.games import router as games_router
from backend.src.routes.health import router as health_router
from backend.src.routes.requirements import router as requirements_router

app = FastAPI(
    title="Can I Run It API",
    description="API for checking if your PC can run games",
    version="0.1.0",
    openapi_tags=[
        {"name": "CPUs", "description": "Endpoints for CPU data and info."},
        {"name": "GPUs", "description": "Endpoints for GPU data and info."},
        {"name": "Games", "description": "Endpoints for retrieving game information."},
        {"name": "Health", "description": "Health check endpoints for the API."},
        {"name": "Admin", "description": "Admin routes to edit the Database."},
    ]
)

api_router = APIRouter(prefix="/api")

# Include routers
api_router.include_router(cpus_router, prefix="/hardware", tags=["CPUs"])
api_router.include_router(gpus_router, prefix="/hardware", tags=["GPUs"])
api_router.include_router(games_router, prefix="", tags=["Games"])
api_router.include_router(health_router, prefix="/health", tags=["Health"])

# disabled for now, will need to be switched to SQL DB for ML model
#api_router.include_router(requirements_router, prefix="/req", tags=["Requirements"])
app.include_router(api_router)

@app.get("/")
def read_root():
    """
    Welcome message to the root path.

    :return:
    """
    return {"message": "Welcome to the Can You Run It Backend!"}

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