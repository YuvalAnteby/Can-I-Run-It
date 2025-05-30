import React from 'react';
import {Routes, Route} from 'react-router-dom';
import {ThemeProvider, CssBaseline, Alert} from '@mui/material';
import Welcome from './pages/Welcome';
import SetupFill from './setup/pages/SetupFill';
import GamesPage from './games/pages/GamesPage';
import GameDetailsPage from './games/pages/GameDetailsPage';
import darkTheme from './darkTheme';
import {useHealth} from "./useHealthCheck";


function App() {

    const healthy = useHealth();

    return (

        <ThemeProvider theme={darkTheme}>
            <CssBaseline/> {/* Ensures background and text colors are applied globally */}
            <>
                {!healthy && (
                    <Alert severity="error">
                        ⚠️ Our service is temporarily unavailable. Please try again later.
                    </Alert>
                )}
                <Routes>
                    <Route path="/" element={<Welcome/>}/>
                    <Route path="/setup" element={<SetupFill/>}/>
                    <Route path="/games" element={<GamesPage/>}/>
                    <Route path="/game/:gameId" element={<GameDetailsPage/>}/>
                </Routes>
            </>
        </ThemeProvider>
    );
}

export default App;