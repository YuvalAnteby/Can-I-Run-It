import {useEffect, useState} from "react";
import {fetchGamesByShelf} from "../api/games";

export const useGamesShelves = ({fetchUrl, title}) => {
    const [games, setGames] = useState([]);

    useEffect(() => {
        const fetchGames = async () => {
            try {
                const data = await fetchGamesByShelf(fetchUrl);
                setGames(data);
            } catch (error) {
                console.error(`Failed to fetch games for ${title}`);
            }
        };
        fetchGames();
    }, [fetchUrl, title]);
    return games;
};

export const useHomeShelves = ({fetchUrl, title}) => {
    const [games, setGames] = useState([]);

    useEffect(() => {
        const fetchGames = async () => {
            try {
                const data = await fetchGamesByShelf(fetchUrl);
                setGames(data);
            } catch (error) {
                console.error(`Failed to fetch games for ${title}`);
            }
        };
        //if (!loading) {
        fetchGames();
        //}
    }, [fetchUrl, /*loading,*/ title]);
    return games;
};