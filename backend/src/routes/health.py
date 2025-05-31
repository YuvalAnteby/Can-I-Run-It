from backend.src.app.database import client
from fastapi import APIRouter, HTTPException

router = APIRouter()

@router.get("", status_code=200)
async def health_check():
    """
    Ping test to make sure we're connected. If pinged MongoDB correctly will return code 200, otherwise 503
    """
    try:
        # MongoDB “ping” command
        await client.admin.command("ping")
    except Exception as e:
        print("health ERROR: ", e)
        # If ping fails, return 503
        raise HTTPException(status_code=503, detail="MongoDB unreachable")
    # If ping succeeds, return simple healthy response
    return {"status": "ok"}

