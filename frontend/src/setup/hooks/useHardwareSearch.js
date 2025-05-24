/**
 * Handles debounced input, brand based fetching, and model lookups
 */
import {useEffect, useState} from "react";
import {getCpuBrands, getGpuBrands, getModelByName, getModelsByBrand} from "../api/hardware";

export const useHardwareSearch = (type, brand, selectedModel, setSelectedModel) => {
    // State for search results (to display suggestions if needed later)
    const [searchResults, setSearchResults] = useState([]);
    const [debouncedQuery, setDebouncedQuery] = useState("");

    // Debounce the input from model search
    useEffect(() => {
        const debounceTimeout = setTimeout(() => {
            const trimmed = selectedModel?.model?.replace(/\(.*?\)/g, "").trim()
            setDebouncedQuery(trimmed || "");
        }, 500); // Delay in milliseconds
        return () => clearTimeout(debounceTimeout);
    }, [selectedModel?.model]);


    // Fetch models from API when brand changes
    useEffect(() => {
        if (!brand) return;
        getModelsByBrand(type, brand)
            .then(setSearchResults)
            .catch(err => console.error(`Failed to fetch ${type} models:`, err));
        setSelectedModel(null); // Reset model when brand changes
    }, [brand, type, setSelectedModel]);


    // Search model by name (debounced)
    useEffect(() => {
        if (!debouncedQuery) return;
        getModelByName(type, debouncedQuery)
            .then((results) => {
                if (results.length > 0) {
                    setSelectedModel(results[0]);
                }
            })
            .catch(err => console.error(`Failed to search ${type} model:`, err));
    }, [debouncedQuery, type, setSelectedModel]);

    return {
        companies: type === 'CPU' ? getCpuBrands() : getGpuBrands(),
        searchResults
    };
}