/**
 * Handles calls to the backend related game info
 */
import axios from "axios";


const ALL_GAMES_URL = `http://localhost:8000/api/games`

/**
 * Fetches the shelves for the games page
 * @returns {Promise<any>}
 */
export const fetchShelvesConfigs = async () => {
    const res = await axios.get("http://localhost:8000/api/games/row-config");
    console.log(res.data);
    return res.data;
};

/**
 * Get all available ga,es from the backend
 * @returns {Promise<any>} list of game objects
 */
export const fetchGames = async () => {
    const response = await axios.get(ALL_GAMES_URL);
    return response.data;
}
