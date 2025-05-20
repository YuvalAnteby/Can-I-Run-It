import asyncio
from motor.motor_asyncio import AsyncIOMotorClient

# Connect to MongoDB
client = AsyncIOMotorClient('mongodb://localhost:27017')
db = client["game_db"]
collection = db.hardware


async def add_cpu(brand, model, fullname):
    cpu_id = brand.lower() + "_" + model.lower().replace(' ', '_')

    existing_cpu = await collection.find_one({"hardware_id": cpu_id, "type": "cpu"})
    if existing_cpu:
        print(f"CPU '{fullname}' already exists in the database.")
        return

    await collection.insert_one({
        "hardware_id": cpu_id,
        "brand": brand,
        "model": model,
        "fullname": fullname,
        "type": f"{brand.lower()}"
    })
    print(f"CPU '{fullname}' added successfully.")


async def main():
    #await add_cpu("AMD", "RYZEN 5700X3D", "Ryzen 7 5700X3D")
    await add_cpu("Intel", "I9 10910", "Core I9 10910")


# Run the script
asyncio.run(main())