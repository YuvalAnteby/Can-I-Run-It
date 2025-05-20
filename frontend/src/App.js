import React from 'react';
import {Routes, Route} from 'react-router-dom';
import {ThemeProvider, CssBaseline} from '@mui/material';
import Welcome from './pages/Welcome';
import SetupFill from './pages/SetupFill';
import Games from './pages/Games';
import GamePage from './pages/GamePage';
import darkTheme from './darkTheme';


function App() {
    return (
        <ThemeProvider theme={darkTheme}>
            <CssBaseline/> {/* Ensures background and text colors are applied globally */}

            <Routes>
                <Route path="/" element={<Welcome/>}/>
                <Route path="/setup" element={<SetupFill/>}/>
                <Route path="/games" element={<Games/>}/>
                <Route path="/game/:gameId" element={<GamePage/>}/>
            </Routes>

        </ThemeProvider>
    );
}

export default App;