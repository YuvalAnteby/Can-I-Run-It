/**
 * Hook for managing game performance logic based on user-selected hardware and settings.
 * Handles API call, state for fetched FPS, and logic to determine if user's target FPS is met.
 */

import {useEffect, useState} from "react";
import {fetchPerformanceResult} from "../api/performances";

export const useGamePerformance = ({game, cpu, gpu, ramAmount, resolution, setting, targetFps}) => {

    const [fetchedFps, setFetchedFps] = useState(null);
    const [isFpsMet, setIsFpsMet] = useState(null);

    useEffect(() => {
        const fetchPerformances = async () => {
            if (!game?.id || !cpu?.id || !gpu?.id || !resolution || !setting)
                return
            try {
                // Try to fetch performance from backend
                const fps = await fetchPerformanceResult({
                    game_id: game.id.trim(),
                    cpu_id: cpu.id.trim(),
                    gpu_id: gpu.id.trim(),
                    ram: ramAmount,
                    resolution,
                    setting_name: setting,
                    fps: targetFps,
                });
                setFetchedFps(fps);
                // Compare fetched FPS with chosen FPS
                if (targetFps) {
                    setIsFpsMet(fps >= parseInt(targetFps));
                }
            } catch (error) {
                if (error.response && error.response.status === 404) {
                    setIsFpsMet(null);
                    setFetchedFps(null);
                } else if (error.response && error.response.status === 422) {
                    setIsFpsMet(false);
                    setFetchedFps(null);
                } else {
                    console.log(`Error fetching game requirements: `, error);
                }
            }
        }
        fetchPerformances();
    }, [game?.id, cpu?.id, gpu?.id, ramAmount, resolution, setting, targetFps]);
    return {fetchedFps, isFpsMet};

};