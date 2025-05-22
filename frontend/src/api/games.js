/**
 * Handles calls to the backend related game info
 */
import axios from "axios";


const ALL_GAMES_URL = `http://localhost:8000/api/games`

/**
 * Get all available ga,es from the backend
 * @returns {Promise<any>} list of game objects
 */
export const fetchGames = async () => {
    const response = await axios.get(ALL_GAMES_URL);
    return response.data;
}
