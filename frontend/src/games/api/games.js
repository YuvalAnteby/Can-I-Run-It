/**
 * Handles calls to the backend related game info
 */
import axios from "axios";

const BASE_URL = process.env.REACT_APP_BASE_URL;

/**
 * Fetches the shelves for the games page
 * @returns {Promise<any>}
 */
export const fetchShelvesConfigs = async () => {
    const res = await axios.get(`${BASE_URL}/games/row-config`);
    return res.data;
};

/**
 * Fetches games for a specific game shelf
 * @param fetchUrl shelf related pathing in URL
 * @param params extra params (e.g. limit)
 * @returns {Promise<any>} list of game objects
 */
export const fetchGamesByShelf = async (fetchUrl, params) => {
    const res = await axios.get(`${BASE_URL}${fetchUrl}`, {params});
    return res.data;
}

/**
 * Get all available ga,es from the backend
 * @returns {Promise<any>} list of game objects
 */
export const fetchGames = async () => {
    const response = await axios.get(`${BASE_URL}/games`);
    return response.data;
};
