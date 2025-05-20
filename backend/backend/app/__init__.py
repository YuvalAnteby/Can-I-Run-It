"""
app module: Contains managing the general backend

Modules:
- main: initializes the FastAPI, connection to the DB amd config files
- database: responsible for the connection to the mongoDB DB
"""

from .database import mongodb