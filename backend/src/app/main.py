import os
from sys import prefix

from fastapi import FastAPI, APIRouter
from starlette.middleware.cors import CORSMiddleware

from backend.src.routes.cpus import router as cpus_router
from backend.src.routes.gpus import router as gpus_router
from backend.src.routes.games import router as games_router
from backend.src.routes.health import router as health_router
from backend.src.routes.requirements import router as requirements_router

app = FastAPI()
api_router = APIRouter(prefix="/api")
# Include routers
api_router.include_router(cpus_router, prefix="/hardware", tags=["CPUs"])
api_router.include_router(gpus_router, prefix="/hardware", tags=["GPUs"])
api_router.include_router(games_router, prefix="", tags=["Games"])
api_router.include_router(health_router, prefix="", tags=["Health"])
api_router.include_router(requirements_router, prefix="/req", tags=["Requirements"])
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
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)