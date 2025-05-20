import React, {useEffect, useState} from 'react';
import {useLocation} from "react-router-dom";
import {fetchRowConfigs} from "../api/gamesApi";
import axios from "axios";
import {Box, Skeleton} from "@mui/material";
import GamesShelf from "../components/games/GamesShelf";


const Games = () => {
    const [shelves, setShelves] = useState([]);
    const [loading, setLoading] = useState(true);
    const location = useLocation();
    const {cpu, gpu, ramAmount} = location.state || {};
    const [games, setGames] = useState([]); // All games from API
    const [searchQuery, setSearchQuery] = useState(""); // Search input
    const [filteredGames, setFilteredGames] = useState([]); // Games matching search
    const [debouncedQuery, setDebouncedQuery] = useState(""); // Delayed search

    // Debounce input to reduce API calls
    useEffect(() => {
        const delay = setTimeout(() => {
            setDebouncedQuery(searchQuery);
        }, 500);
        return () => clearTimeout(delay);
    }, [searchQuery]);

    useEffect(() => {
        const fetchGames = async () => {
            try {
                //const ALL_GAMES = `http://172.16.26.200:8000/api/games`
                const ALL_GAMES = `http://localhost:8000/api/games`
                const response = await axios.get(ALL_GAMES)
                setGames(response.data);
                setFilteredGames(response.data);
                console.log(cpu, gpu, ramAmount);
                //console.log(`Fetched games:`, response.data); // Log fetched GPU models
            } catch (e) {
                console.log(`Error fetching games: `, e);
            }
        }
        fetchGames();
    }, []);

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
        const getConfigs = async () => {
            try {
                const data = await fetchRowConfigs();
                setShelves(data);
            } catch (error) {
                console.error("Failed to load shelf config:", error);
            } finally {
                setLoading(false);
            }
        };
        getConfigs();
    }, []);

    /* Show a skeleton loading animation */
    if (loading) {
        return (
            <Box sx={{padding: '20px'}}>
                {[...Array(3)].map((_, index) => (
                    <Box key={index} sx={{marginBottom: 4}}>
                        <Skeleton variant="text" width={200} height={40} animation="wave"/>
                        <Skeleton variant="rectangular" height={250} animation="wave" sx={{borderRadius: 2}}/>
                    </Box>
                ))}
            </Box>
        );
    }

    return (
        /* Shelves from config.json file */
        <Box sx={{padding: '20px'}}>
            {shelves.map((shelf) => (
                <GamesShelf
                    key={shelf.row_id}
                    title={shelf.title}
                    fetchUrl={shelf.fetch_url}
                    params={shelf.params}
                    cpu={cpu}
                    gpu={gpu}
                    ramAmount={ramAmount}
                    loading={loading}
                />
            ))}
        </Box>
    );
};

export default Games;