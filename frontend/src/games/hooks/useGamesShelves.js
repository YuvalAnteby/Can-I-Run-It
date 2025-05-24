import {useEffect, useState} from "react";
import {fetchGamesByShelf} from "../api/games";

export const useGamesShelves = ({fetchUrl, params, title, loading}) => {
    const [games, setGames] = useState([]);

    useEffect(() => {
        const fetchGames = async () => {
            try {
                const data = await fetchGamesByShelf(fetchUrl, params);
                setGames(data);
            } catch (error) {
                console.error(`Failed to fetch games for ${title}`);
            }
        };
        if (!loading) {
            fetchGames();
        }
    }, [fetchUrl, loading, params, title]);

    return games;

};