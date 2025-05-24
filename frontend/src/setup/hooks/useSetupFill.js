/**
 * Handles selection flow and state for CPU, GPU and RAM during the filling hardware phase.
 * Controls when to show each step and navigates to games page when setup is complete.
 */
import {useState} from "react";
import {useNavigate} from "react-router-dom";

export const useSetupFill = () => {
    const [cpuBrand, setCpuBrand] = useState(''); // Track selected CPU brand
    const [cpu, setCpu] = useState(''); // Track selected CPU model

    const [gpuBrand, setGpuBrand] = useState(''); // Track selected GPU brand
    const [gpu, setGpu] = useState(''); // Track selected GPU model

    const [ramAmount, setRamAmount] = useState('');

    const [showGpu, setShowGpu] = useState(false); // Track if GPU selection should be shown
    const [showRam, setShowRam] = useState(false); // Track if RAM selection should be shown

    const navigate = useNavigate();

    const handleContinueToGpu = () => {
        setShowGpu(!!cpu);
    };

    const handleContinueToRam = () => {
        setShowRam(!!cpu && !!gpu);
    };

    const handleContinueToGames = () => {
        if (cpu && gpu && ramAmount) {
            navigate("/games", {state: {cpu, gpu, ramAmount}})
        }
    };

    return {
        cpuBrand, setCpuBrand,
        cpu, setCpu,
        gpuBrand, setGpuBrand,
        gpu, setGpu,
        ramAmount, setRamAmount,
        showGpu, handleContinueToGpu,
        showRam, handleContinueToRam,
        handleContinueToGames
    };
};