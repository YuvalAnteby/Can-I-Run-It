import axios from "axios";
import {useEffect, useState} from "react";

export function useHealth(pollInterval = 30000) {
    const [healthy, setHealthy] = useState(true);

    useEffect(() => {
        let timer;
        const check = async () => {
            try {
                console.log(await axios.get(`${process.env.REACT_APP_BASE_URL}/health`));
                setHealthy(true);
            } catch {
                setHealthy(false);
            }
        };
        check();
        timer = setInterval(check, pollInterval);
        return () => clearInterval(timer);
    }, [pollInterval]);

    return healthy;
}