/**
 * Guided hardware filling page, a user will pick in the order CPU -> GPU -> RAM and then continue to games.
 * Flow logic is in useSetupFill hook.
 */
import React from 'react';
import {Box, Button, Typography} from "@mui/material";
import RamSelection from "../components/RamSelection";
import HardwareSelection from "../components/HardwareSelection";
import {useSetupFill} from "../hooks/useSetupFill";
import {useSetup} from "../../shared/contexts/SetupContext";
import {useLocation, useNavigate} from "react-router-dom";

const SetupFill = () => {
    const {setSetup} = useSetup();
    const navigate = useNavigate();
    const location = useLocation();

    const {
        cpuBrand, setCpuBrand,
        cpu, setCpu,
        gpuBrand, setGpuBrand,
        gpu, setGpu,
        ramAmount, setRamAmount,
        showGpu, handleContinueToGpu,
        showRam, handleContinueToRam,
    } = useSetupFill();

    const returnTo = location.state?.from || "/";
    const header = location.state?.msg || "";
    const handleFinish = () => {
        if (!cpu || !gpu || !ramAmount) return;
        setSetup({cpu, gpu, ram: ramAmount});
        navigate(returnTo);
    };


    return (
        /* Main div */
        <Box
            sx={{
                display: 'flex',
                flexDirection: 'column',
                textAlign: 'center',
                alignItems: 'center',
                justifyContent: 'space-evenly',
                width: '100%',
            }}>
            <Typography variant="h3" align="center" sx={{marginBottom: '12px'}}>{header}</Typography>
            {/* CPU div */}
            <Box
                sx={{
                    width: '60%', // Ensure the CpuSelection takes up 60% of the container's width
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                }}>
                <h2 style={{marginBottom: '5px'}}>Let's find your CPU</h2>
                <HardwareSelection type="CPU"
                                   brand={cpuBrand}
                                   setBrand={setCpuBrand}
                                   hardware={cpu}
                                   setHardware={setCpu}
                                   onChange={handleContinueToGpu}/>
                <Button
                    variant="contained"
                    sx={{margin: '10px'}}
                    onClick={handleContinueToGpu}
                    disabled={!cpu}>
                    Continue to pick your GPU
                </Button>
            </Box>

            {/* GPU div */}
            {showGpu && cpu && (
                <Box
                    sx={{
                        width: '100%',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                    }}>
                    <h2 style={{marginBottom: '0px'}}>Now let's find your GPU</h2>
                    <Box
                        sx={{
                            width: '60%', // Ensure the CpuSelection takes up 60% of the container's width
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            justifyContent: 'center',
                        }}>
                        <HardwareSelection type="GPU"
                                           brand={gpuBrand}
                                           setBrand={setGpuBrand}
                                           hardware={gpu}
                                           setHardware={setGpu}
                                           onChange={handleContinueToRam}/>
                        <Button
                            variant="contained"
                            sx={{margin: '10px'}}
                            onClick={handleContinueToRam}
                            disabled={!gpu || !cpu}>
                            Continue to pick your RAM amount
                        </Button>
                    </Box>
                </Box>
            )}

            {/* RAM div */}
            {showRam && showGpu && cpu && gpu && (
                <Box
                    sx={{
                        width: '100%',
                        display: 'flex',
                        marginTop: '0px',
                        flexDirection: 'column',
                        alignItems: 'center',
                    }}>
                    <RamSelection sx={{marginTop: '0px'}} ramAmount={ramAmount} setRamAmount={setRamAmount}/>

                    <Button
                        variant="contained"
                        sx={{margin: '10px'}}
                        disabled={!ramAmount || !cpu || !gpu}
                        onClick={handleFinish}
                    >
                        Continue
                    </Button>
                </Box>
            )}

        </Box>
    );
}
export default SetupFill;