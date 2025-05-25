import os

from fastapi import FastAPI
from starlette.middleware.cors import CORSMiddleware

from backend.routes.cpus import router as cpus_router
from backend.routes.gpus import router as gpus_router
from backend.routes.games import router as games_router
from backend.routes.requirements import router as requirements_router

app = FastAPI()

# Include routers
@app.get("/")
def read_root():
    """
    Welcome message to the root path.

    :return:
    """
    return {"message": "Welcome to the Can You Run It Backend!"}

app.include_router(cpus_router, prefix="/api/hardware", tags=["CPUs"])
app.include_router(gpus_router, prefix="/api/hardware", tags=["GPUs"])
app.include_router(games_router, prefix="/api", tags=["Games"])
app.include_router(requirements_router, prefix="/api/req", tags=["Requirements"])

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