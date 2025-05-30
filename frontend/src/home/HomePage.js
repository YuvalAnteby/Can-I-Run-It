import React from 'react';
import {Box} from "@mui/material";
import {useNavigate} from "react-router-dom";
import MainMessage from "./components/MainMessage";
import CurrentSetup from "./components/CurrentSetup";


const HomePage = () => {

    const textColor = '#e0e1dd';
    const navigate = useNavigate(); //Hook to navigate to another page
    return (
        <Box
            sx={{
                display: 'flex',
                flexDirection: 'column',
                width: '100%',
                alignItems: 'center',
                color: textColor,
            }}>
            {/* main message */}
            <MainMessage />
            {/* current setup */}
            <CurrentSetup />

        </Box>
    );

}
export default HomePage;