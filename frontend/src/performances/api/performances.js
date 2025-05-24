import axios from "axios";

/**
 * API call to fetch performance estimation for a game based on user hardware and settings.
 * @param {Object} params contains game_id, cpu_id, gpu_id, ram, resolution, setting_name, fps?
 * @returns {Promise<*>} FPS estimation from backend
 */
export const fetchPerformanceResult = async (params) => {
    const BASE_URL = process.env.REACT_BASE_URL;
    const url = new URL(`${BASE_URL}/req/game-requirements/`);

    Object.entries(params).forEach(([key, val]) => {
        if (val !== null && val !== "") {
            url.searchParams.append(key, val);
        }
    });
    console.log(url.toString());
    const response = await axios.get(url.toString());
    return response.data.fps;
}