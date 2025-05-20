import asyncio
from motor.motor_asyncio import AsyncIOMotorClient

from backend.routes.cpus import get_all_cpus

# Connect to MongoDB
client = AsyncIOMotorClient('mongodb://localhost:27017')
db = client["game_db"]
collection = db.hardware

async def add_gpu(brand, model, fullname):
    """
    Adding a new GPU to the collection.
    :param brand: brand of the GPU. E.G: Nvidia
    :param model: GPU model. E.G GTX 1080TI
    :param fullname: full name of the GPU model without spaces. E.G gtx_1080ti
    """
    # Make sure the input isn't empty
    if brand.strip() == "" or model.strip() == "" or fullname.strip() == "":
        return
    # Standardize ids for the CPUs
    gpu_id = brand.lower() + "_" + model.lower().replace(' ', '_')
    # Check if the CPU already exists to avoid duplicates
    existing_gpu = await db.hardware.find_one({"hardware_id": gpu_id, "type": "gpu"})
    if existing_gpu:
        print(f"GPU '{fullname}' already exists in the database.")
        return
    # Insert the new CPU to the DB
    await db.hardware.insert_one(
        {"hardware_id": gpu_id, "brand": brand, "model": model, "fullname": fullname, "type": "gpu_" + brand.lower()})
    print(f"GPU '{fullname}' added successfully.")


async def main():
    await add_gpu("Nvidia", "RTX 4060TI (16GB)", "GeForce RTX 4060TI (16GB)")


# Run the script
asyncio.run(main())