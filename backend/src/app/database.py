import os
from motor.motor_asyncio import AsyncIOMotorClient

client = AsyncIOMotorClient(os.environ["MONGODB_URI"])
mongo_db = client["game_db"]
