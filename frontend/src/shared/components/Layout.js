import React from 'react';
import {Outlet} from 'react-router-dom';
import TopBar from './TopBar/TopBar';
import {Box} from "@mui/material";

export default function Layout() {
    return (
        <Box sx={{display: 'flex', flexDirection: 'column', height: '100vh'}}>
            <TopBar/>
            <Box
                component="main"
                sx={{
                    flexGrow: 1,
                    overflow: 'auto',     // only this area scrolls
                    px: 3,
                    py: 4,
                }}
            >
                <Box sx={{px: 3, py: 4}}>
                    <Outlet/>
                </Box>
            </Box>
        </Box>
    );
}