import asyncio

from bson import ObjectId
from dns.e164 import query
from motor.motor_asyncio import AsyncIOMotorClient

from backend.routes.cpus import get_all_cpus

# Connect to MongoDB
client = AsyncIOMotorClient('mongodb://localhost:27017')
db = client["game_db"]
collection = db.game_requirements


async def add_new_req(game_id, resolution, setting_name, cpu_id, gpu_id, ram, fps, taken_by, notes, verified):
    # The info needed to find our document for inserting now.
    find_query = {
        "game_id": ObjectId(game_id),
        "resolution": resolution,
        "setting_name": setting_name,
    }
    # Check if there is a document in the DB for the combination of game-resolution-setting.
    existing_document = await collection.find_one(find_query)
    # The new setup as an object
    new_setup = {
        "cpu_id": cpu_id,
        "gpu_id": gpu_id,
        "ram": ram,
        "fps": fps,
        "taken_by": taken_by,
        "notes": notes,
        "verified": verified,
    }

    if existing_document:
        # Found a document with the same combination - check if we already have a matching setup recorded.
        for setup in existing_document["setups"]:
            if (setup["cpu_id"] == new_setup["cpu_id"]
                    and setup["gpu_id"] == new_setup["gpu_id"]
                    and setup["ram"] == new_setup["ram"]):
                print("Setup exists. No Changes made.")
                return

            # Add the new setup to the document
            await collection.update_one(find_query, {"$addToSet": {"setups": new_setup}})
            print("Setup added to existing document")

    # There is no matching doc. Congratulations! we will create one and insert the setup
    else:
        new_doc = {
            "game_id": ObjectId(game_id),
            "resolution": resolution,
            "setting_name": setting_name,
            "setups": [new_setup],
        }
        await collection.insert_one(new_doc)
        print("New document created and setup inserted")


async def main():
    # FHD
    await add_new_req(
        game_id=ObjectId("67dc8f83ad86710d1835b4b7"),  # KCD2
        resolution="1920x1080",
        setting_name="Ultra",
        cpu_id=ObjectId("67d71a8a78bb4d95617f0eaa"),  # 9800x3d
        gpu_id=ObjectId(""),  #
        ram=32,
        fps=,
        taken_by="TechPowerUp",
        notes="",
        verified=True,
    )
    # 2K
    await add_new_req(
        game_id=ObjectId("67dc8f83ad86710d1835b4b7"),  # KCD2
        resolution="2560x1440",
        setting_name="Ultra",
        cpu_id=ObjectId("67d71a8a78bb4d95617f0eaa"),  # 9800x3d
        gpu_id=ObjectId(""),  #
        ram=32,
        fps=,
        taken_by="TechPowerUp",
        notes="",
        verified=True,
    )
    # 4K
    await add_new_req(
        game_id=ObjectId("67dc8f83ad86710d1835b4b7"),  # KCD2
        resolution="3840x2160",
        setting_name="Ultra",
        cpu_id=ObjectId("67d71a8a78bb4d95617f0eaa"),  # 9800x3d
        gpu_id=ObjectId(""),  #
        ram=32,
        fps=,
        taken_by="TechPowerUp",
        notes="",
        verified=True,
    )


# Run the script
asyncio.run(main())
