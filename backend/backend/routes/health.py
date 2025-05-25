from fastapi import APIRouter
from fastapi.responses import JSONResponse

# Connect to MongoDB (this assumes MongoDB is running on localhost)
client = AsyncIOMotorClient(os.environ["MONGODB_URI"])
db = client["game_db"]  # Use your desired database name
router = APIRouter()
# Use the games collection
collection = db.games

@app.get("/health", status_code=200)
async def health_check():
    """
    Ping test to make sure we're connected. If pinged MongoDB correctly will return code 200, otherwise 503
    """
    try:
        # MongoDB “ping” command
        await mongo_client.admin.command("ping")
    except Exception as e:
        # If ping fails, return 503
        raise HTTPException(status_code=503, detail="MongoDB unreachable")
    # If ping succeeds, return simple healthy response
    return {"status": "ok"}

