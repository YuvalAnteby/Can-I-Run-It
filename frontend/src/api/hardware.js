/**
 * API for hardware data: CPU/GPU brands and models
 */
import axios from "axios";

const BASE_URL = "http://localhost:8000/api"

/**
 * Gets names of CPU brands.
 * Saved hard coded here since it changes in almost never
 * @returns {string[]} array of CPU brands names
 */
export const getCpuBrands = () => {
    return ['Intel', 'AMD'];
}

/**
 * Gets names of GPU brands.
 * Saved hard coded here since it changes in almost never
 * @returns {string[]} array of GPU brands names
 */
export const getGpuBrands = () => {
    return ['Nvidia', 'AMD', 'Intel'];
}

/**
 * Gets models by brand (e.g. all Nvidia's GPUs)
 * @param {"CPU"|"GPU"} type type of hardware
 * @param {string} brand name of the brand
 * @returns {Promise<Array>} array of hardware model objects
 */
export const getModelsByBrand = async (type, brand) => {
    const url = `${BASE_URL}/hardware/${type.toLowerCase()}s/brand?brand=${brand}`;
    const res = await axios.get(url);
    return res.data;
};

/**
 * Get a model by name (search bar usage)
 * @param {"CPU"|"GPU"} type type of hardware
 * @param {string} model model name
 * @returns {Promise<Array>} array of matching hardware model objects
 */
export const getModelByName = async (type, model) => {
  const url = `${BASE_URL}/api/hardware/${type.toLowerCase()}s/model?model=${model}`;
  const res = await axios.get(url);
  return res.data;
};