from motor.motor_asyncio import AsyncIOMotorClient
from fastapi import APIRouter, HTTPException
import os

# Connect to MongoDB (this assumes MongoDB is running on localhost)
client = AsyncIOMotorClient(os.environ["MONGODB_URI"])
router = APIRouter()


@router.get("/health", status_code=200)
async def health_check():
    """
    Ping test to make sure we're connected. If pinged MongoDB correctly will return code 200, otherwise 503
    """
    try:
        # MongoDB “ping” command
        await client.admin.command("ping")
    except Exception as e:
        # If ping fails, return 503
        raise HTTPException(status_code=503, detail="MongoDB unreachable")
    # If ping succeeds, return simple healthy response
    return {"status": "ok"}

