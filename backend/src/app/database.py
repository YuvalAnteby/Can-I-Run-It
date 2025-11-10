import os

from pymongo import AsyncMongoClient

client = AsyncMongoClient(os.environ["MONGODB_URI"])
mongo_db = client["game_db"]
