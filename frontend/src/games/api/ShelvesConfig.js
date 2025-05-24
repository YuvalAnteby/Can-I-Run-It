import axios from "axios";

export const fetchShelvesConfigs = async () => {
    const res = await axios.get("http://localhost:8000/api/games/row-config");
    console.log(res.data);
    return res.data;
};
