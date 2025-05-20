import React, {useState} from 'react';
import {Button} from "@mui/material";
import RamSelection from "../components/hardware/RamSelection";
import HardwareSelection from "../components/hardware/HardwareSelection";
import {useNavigate} from "react-router-dom";

const SetupFill = () => {
    const [cpuBrand, setCpuBrand] = useState(''); // Track selected CPU brand
    const [cpu, setCpu] = useState(''); // Track selected CPU model

    const [gpuBrand, setGpuBrand] = useState(''); // Track selected GPU brand
    const [gpu, setGpu] = useState(''); // Track selected GPU model

    const [ramAmount, setRamAmount] = useState('');

    const [showGpu, setShowGpu] = useState(false); // Track if GPU selection should be shown
    const [showRam, setShowRam] = useState(false); // Track if RAM selection should be shown

    const navigate = useNavigate();

    const handleContinueToGames = () => {
        if (cpu && gpu && ramAmount) {
            navigate("/games", {state: {cpu, gpu, ramAmount}})
        }
    }

    const handleContinueToGpu = () => {
        if (cpu) {
            setShowGpu(true);
        } else {
            setShowGpu(false);
        }
    };

    const handleContinueToRam = () => {
        if (cpu && gpu) {
            setShowRam(true);
        } else {
            setShowRam(false);
        }
    };

    return (
        /* Main div */
        <div
            style={{
                height: '100vh',
                display: 'flex',
                flexDirection: 'column',
                textAlign: 'center',
                alignItems: 'center',
                justifyContent: 'center',
                width: '100%',
            }}>
            <h2 style={{marginBottom: '5px'}}>Let's find your CPU</h2>
            {/* CPU div */}
            <div
                style={{
                    width: '60%', // Ensure the CpuSelection takes up 60% of the container's width
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                }}>
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
            </div>

            {/* GPU div */}
            {showGpu && cpu && (
                <div
                    style={{
                        height: '100vh',
                        width: '100%',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                    }}>
                    <h2 style={{marginBottom: '0px'}}>Now let's find your GPU</h2>
                    <div
                        style={{
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
                    </div>
                </div>
            )}

            {/* RAM div */}
            {showRam && showGpu && cpu && gpu && (
                <div
                    style={{
                        height: '100vh',
                        width: '100%',
                        display: 'flex',
                        marginTop: '0px',
                        flexDirection: 'column',
                        alignItems: 'center',
                    }}>
                    <RamSelection style={{
                        marginTop: '0px',
                    }} ramAmount={ramAmount} setRamAmount={setRamAmount}/>

                    <Button
                        variant="contained"
                        sx={{margin: '10px'}}
                        onClick={handleContinueToGames}
                        disabled={!ramAmount || !cpu || !gpu}>
                        Continue to games
                    </Button>
                </div>
            )}

        </div>
    );
}
export default SetupFill;