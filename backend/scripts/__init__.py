"""
Scripts module: Contains MongoDB query functions for the DB.

Modules:
- games: each file for handling game-related database operations.
- hardware: each file for handling hardware-related database operations.
"""

from motor.motor_asyncio import AsyncIOMotorClient

# Import specific functions or classes to expose them at the package level

# TODO remove after finishing editing DB

# Connect to MongoDB (this assumes MongoDB is running on localhost)
client = AsyncIOMotorClient('mongodb://localhost:27017')
db = client["game_db"]  # Use your desired database name