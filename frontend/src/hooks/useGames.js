import {useEffect, useState} from "react";
import {fetchShelvesConfigs} from "../api/ShelvesConfig";
import {fetchGames} from "../api/games";

/**
 * Fetches games from the backend, handles debouncing search input, filtering games and fetching shelves
 * @param {string} cpu model id
 * @param {string} gpu model id
 * @param {number} ram selected amount in GB
 * @returns {{
 * shelves: any[],
 * games: any[],
 * searchQuery: string,
 * setSearchQuery: Function,
 * loading: boolean,
 * cpu: string,
 * gpu: string,
 * ram: number
 * }}
 */
export const useGames = (cpu, gpu, ram) => {

    const [shelves, setShelves] = useState([]);
    const [games, setGames] = useState([]); // All games from API
    const [filteredGames, setFilteredGames] = useState([]); // Games matching search
    const [searchQuery, setSearchQuery] = useState(""); // Search input
    const [debouncedQuery, setDebouncedQuery] = useState(""); // Delayed search
    const [loading, setLoading] = useState(true);

    // Fetch all games from the backend
    useEffect(() => {
        const loadGames = async () => {
            const data = await fetchGames();
            setGames(data);
            setFilteredGames(data);
        };
        loadGames();
    }, []);

    // Debounce input to reduce API calls
    useEffect(() => {
        const delay = setTimeout(() => {
            setDebouncedQuery(searchQuery);
        }, 500);
        return () => clearTimeout(delay);
    }, [searchQuery]);

    // Filter games by name when search input changes
    useEffect(() => {
        if (!debouncedQuery) {
            setFilteredGames(games);
        } else {
            const filtered = games.filter((game) =>
                game.name.toLowerCase().includes(debouncedQuery.toLowerCase())
            );
            setFilteredGames(filtered);
        }
    }, [debouncedQuery, games]);

    // Get the config json file
    useEffect(() => {
        const loadShelves = async () => {
            try {
                const data = await fetchShelvesConfigs();
                setShelves(data);
            } catch (error) {
                console.error("Failed to load shelf config:", error);
            } finally {
                setLoading(false);
            }
        };
        loadShelves();
    }, []);

    return {
        shelves,
        games: filteredGames,
        searchQuery,
        setSearchQuery,
        loading,
        cpu: cpu,
        gpu: gpu,
        ram: ram
    }
}