import re
from typing import Optional, List
from fastapi import HTTPException


def validate_hardware_list(
        hardware: list,
        type_: str,
        brand: Optional[str] = None,
        model: Optional[str] = None,
):
    """
       Validates the list of CPUs/GPUs fetched from the database.

       - Raises 404 if the list is empty.
       - Raises 500 if any item is included in the list that wasn't supposed to according to filtering.
       (e.g. brand/ type)


       :param hardware: List of CPU/GPU dictionaries from the DB.
       :param type_: CPU or GPU type for check
       :param brand: Optional brand filter to validate against.
       :param model: Optional model regex to validate against.
       """
    # If hardware list is empty count it as no CPU/GPU found error
    if not hardware:
        raise HTTPException(status_code=404, detail=f"No {type_} found")
    # Ensure only relevant CPUs have been fetched from DB
    model_pattern = re.compile(re.escape(model), re.IGNORECASE) if model else None
    for item in hardware:
        # Check no GPUs were fetched
        if item.get("type", "").lower() != type_:
            raise HTTPException(status_code=500, detail=f"Non-{type_} hardware found in {type_} route")
        # Ensure only relevant brand's CPUs have been fetched
        if brand and item.get("brand", "").lower() != brand.lower():
            raise HTTPException(status_code=500, detail=f"Wrong brand found in {type_}s fetched")
        # Ensure only relevant CPU models have been fetched
        if model_pattern:
            if not (
                    model_pattern.search(item.get("model", "")) or
                    model_pattern.search(item.get("fullname", ""))
            ):
                raise HTTPException(status_code=500, detail=f"Wrong model regex found in {type_}s fetched")


def validate_games_list(games: list,
                        limit: Optional[int] = None,
                        name: Optional[str] = None,
                        publisher: Optional[str] = None,
                        developer: Optional[str] = None,
                        release_date: Optional[int] = None,
                        genre: Optional[str] = None
                        ):
    """
       Validates the list of games fetched from the DB.

       - Raises 404 if the list is empty.
       - Raises 500 if any item has invalid filtering (e.g. having wrong publisher or wrong release date)


       :param games: List of games dictionaries from the DB.
       :param limit: limited number of games that should be returned, if None - no limit.
       :param name: desired name of a game
       :param publisher: desired publisher of a game
       :param developer: desired developer of a game
       :param release_date: desired release year (int) of a game
       :param genre: desired genre of a game
       """
    # If games list is empty count it as no games found error
    if not games:
        raise HTTPException(status_code=404, detail="No games found")
    # Ensure the correct amount of games was returned
    if limit is not None and len(games) > limit:
        raise HTTPException(status_code=500, detail="Too many games found")

    # Ensure only relevant games have been fetched from DB
    for item in games:
        # Ensure the name's regex matches the game's name (if used)
        name_pattern = re.compile(name, re.IGNORECASE) if name else None
        if name is not None and not name_pattern.search(item.get("name", "")):#
            raise HTTPException(status_code=500, detail="Wrong name found in games route")

        # Ensure the publisher's regex matches the game's publisher (if used)
        publisher_pattern = re.compile(publisher, re.IGNORECASE) if publisher else None
        if publisher is not None and not publisher_pattern.search(item.get("publisher", "")):#
            raise HTTPException(status_code=500, detail="Wrong publisher found in games route")

        # Ensure the developer's regex matches the game's developer
        developer_pattern = re.compile(developer, re.IGNORECASE) if developer else None
        if developer is not None and not developer_pattern.search(item.get("developer", "")):
            raise HTTPException(status_code=500, detail="Wrong developer found in games route")

        # Ensure the release date matches (years should be equal)
        if release_date is not None and item.get("release_date", "") != release_date:
            raise HTTPException(status_code=500, detail="Wrong release date found in games route")

        # Ensure the genre's regex is in the game's genres list
        genre_pattern = re.compile(genre, re.IGNORECASE) if genre else None
        if genre is not None and not any(genre_pattern.search(g) for g in item.get("genres", [])):
            raise HTTPException(status_code=500, detail="genre not found in game's genres in games route")
