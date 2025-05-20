from motor.motor_asyncio import AsyncIOMotorClient

class MongoDB:
    def __init__(self, uri: str, db_name: str):
        self.client = AsyncIOMotorClient(uri)
        self.db = self.client[db_name]

    def get_collection(self, name: str):
        return self.db[name]

mongodb = MongoDB(uri="mongodb://admin:admin123@localhost:27017", db_name="game_db")
