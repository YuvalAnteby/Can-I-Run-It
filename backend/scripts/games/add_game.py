import asyncio
from datetime import datetime, timezone

from motor.motor_asyncio import AsyncIOMotorClient

# Connect to MongoDB
client = AsyncIOMotorClient('mongodb://localhost:27017')
db = client["game_db"]
collection = db.games


# TODO add OS_support

# Add new game
async def add_one_game(name,
                       publisher,
                       developer,
                       release_date,
                       genres,
                       desc,
                       is_ssd_required,
                       upscale_support,
                       api_support,
                       trailer_url,
                       port_url,
                       land_s,
                       land_m,
                       land_l,
                       land_xl,
                       buy_links,
                       creation_date,
                       supported_settings,
                       available_resolutions):
    """
    Adds a new game to the database.

    :param name: Name of the game
    :param publisher: Publisher of the game
    :param developer: Developer of the game
    :param release_date: Release date of the game
    :param genres: array of strings of genres
    :param desc: description of the game
    :param is_ssd_required: True if the player should install the game on an SSD. otherwise, false.
    :param upscale_support: array of upscalers supported by the game. (E.G DLSS)
    :param api_support: array of APIs supported by the game. (E.G DX12 and Vulkan)
    :param trailer_url: URL of the trailer in YouTube
    :param port_url: URL for the portrait image
    :param land_s: URL for the landscape image (small size for mobile)
    :param land_m: URL for the landscape image (medium size for tablets)
    :param land_l: URL for the landscape image (large size for most pcs)
    :param land_xl: URL for the landscape image (X large size for high-res pcs)
    :param buy_links: array of links of places you can buy the game on
    :param creation_date: time when added to DB
    :param supported_settings: list of names of graphical settings in game
    :param available_resolutions: array of available resolutions in game
    """
    game_id = name.lower().replace(' ', '_') + "_" + str(release_date)
    await db.games.insert_one({
        "game_id": game_id,
        "name": name,
        "publisher": publisher,
        "developer": developer,
        "release_date": release_date,
        "genres": genres,
        "desc": desc,
        "is_ssd_recommended": is_ssd_required,
        "upscale_support": upscale_support,
        "api_support": api_support,
        "trailer_url": trailer_url,
        "portrait_url": port_url,
        "landscape_s": land_s,
        "landscape_m": land_m,
        "landscape_l": land_l,
        "landscape_xl": land_xl,
        "buy_links": buy_links,
        "created_at": creation_date,
        "supported_settings": supported_settings,
        "available_resolutions": available_resolutions,
    })
    print(f"Game '{name}' added to the database.")


async def main():
    name = "Cyberpunk 2077"

    publisher = "CD PROJEKT RED"

    developer = "CD PROJEKT RED"

    release_date = 2020

    genres = ["RPG", "Sci-fi"]

    desc = "Step into the shoes of V, a cyberpunk mercenary for hire and do what it takes to make a name for yourself in Night City, a megalopolis obsessed with power, glamour, and body modification. Legends are made here. What will yours be?"

    is_ssd_required = True

    upscale_support = ["Nvidia DLSS", "AMD FSR", "Intel XeSS"]

    api_support = ["DX12"]

    trailer = "https://www.youtube.com/embed/Ugb80d5lxEM?si=b7FQfVM_wqvmY8-E"

    portrait = "https://imgur.com/VDUcpgp"

    landscape_s = ""
    landscape_m = ""
    landscape_l = ""
    landscape_xl = ""

    buy_links = []

    creation_date = datetime.now(timezone.utc)

    supported_settings = ["Low", "Medium", "High", "Ultra High"]

    available_resolutions = ["1920x1080", "2560x1440", "3840x2160"]

    await add_one_game(name,
                       publisher,
                       developer,
                       release_date,
                       genres,
                       desc,
                       is_ssd_required,
                       upscale_support,
                       api_support,
                       trailer,
                       portrait,
                       landscape_s,
                       landscape_m,
                       landscape_l,
                       landscape_xl,
                       buy_links,
                       creation_date,
                       supported_settings,
                       available_resolutions)


# Run the script
asyncio.run(main())
