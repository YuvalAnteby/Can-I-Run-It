"""
All regexes used by the backend are stored here
"""
import re


def hardware_type_regex(type_: str):
    """
        :return: MongoDB style regex dictionary to match a hardware type to be case-insensitive.
        e.g. hardware_type_regex("GPU") → {"$regex": re.compile("gpu", re.IGNORECASE)}
        """
    pattern = re.compile(type_, re.IGNORECASE)
    return {"$regex": pattern}


def hardware_brand_regex(brand: str):
    """
        :return: MongoDB‐style regex dict that matches `brand` case‐insensitively.
        Example: hardware_brand_regex("Nvidia") → {"$regex": re.compile("Nvidia", re.IGNORECASE)}
        """
    pattern = re.compile(brand, re.IGNORECASE)
    return {"$regex": pattern}


def hardware_model_regex(model: str):
    """
       :return: MongoDB‐style regex dict that matches `model` case‐insensitively.
       Example: hardware_model_regex("RTX4090") → {"$regex": re.compile("RTX4090", re.IGNORECASE)}
       """
    pattern = re.compile(model, re.IGNORECASE)
    return {"$regex": pattern}