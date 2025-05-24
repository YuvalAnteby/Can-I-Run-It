import React, {useState} from "react";
import {useLocation} from "react-router-dom";
import {Typography, Box} from "@mui/material";
import GameBanner from "../components/games/GameBanner";
import RequirementsSelection from "../components/requirements/RequirementsSelection";
import AdditionalInfo from "../components/requirements/AdditionalInfo";
import {useGamePerformance} from "../hooks/useGamePerformance";

const GameDetailsPage = () => {
    const location = useLocation();
    const {game, cpu, gpu, ramAmount} = location.state || {};

    const [chosenResolution, setResolution] = useState('');
    const [chosenSetting, setSetting] = useState('');
    const [chosenFps, setFps] = useState(null);

    const {fetchedFps, isFpsMet} = useGamePerformance({
        game, cpu, gpu, ramAmount,
        resolution: chosenResolution,
        setting: chosenSetting,
        targetFps: chosenFps
    });

    if (!game) {
        return <Typography variant="h4">Error game not found</Typography>;
    }

    return (
        <Box sx={{padding: 3, width: "100%", height: "100%", paddingTop: '60px',}}>
            {/* Trailer with basic info of the game */}
            <GameBanner game={game}/>

            <Box sx={{
                display: 'flex',
                flexDirection: 'row',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: 3
            }}>
                {/* Requirements picker and results */}
                <Box sx={{flex: 1}}>
                    <RequirementsSelection
                        game={game}
                        resolution={chosenResolution}
                        setResolution={setResolution}
                        setting={chosenSetting}
                        setSetting={setSetting}
                        fps={chosenFps}
                        setFps={setFps}/>

                    {/* Show we have no info if no FPS info was fetched */}
                    {chosenFps && fetchedFps === null && isFpsMet === null && (
                        <Typography variant="h6">
                            Unknown performance for this setup & settings ❓
                        </Typography>
                    )}

                    {/* Show if the user can run or not depending on the FPS fetched */}
                    {chosenFps && isFpsMet !== null && (
                        <Typography variant="h6">
                            Your chosen FPS ({chosenFps}) is {isFpsMet ? "achievable ✅" : "not achievable ❌"}.
                        </Typography>
                    )}

                    {/* Show the best the user can expect if they didn't pick target FPS */}
                    {((chosenFps === null && fetchedFps) || (chosenFps === 0 && fetchedFps)) && (
                        <Typography variant="h6">
                            The best FPS you can expect on average: {fetchedFps}
                        </Typography>
                    )}
                </Box>
                {/* Show additional info about the game */}
                <Box sx={{flex: 1}}>
                    <AdditionalInfo game={game}></AdditionalInfo>
                </Box>
            </Box>

        </Box>
    );
};

export default GameDetailsPage;
