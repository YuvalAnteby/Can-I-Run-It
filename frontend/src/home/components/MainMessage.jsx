import {Box, Typography} from "@mui/material";
import React from "react";
import CurrentSetup from "./CurrentSetup";

const MainMessage = () => {
    return (
        <Box sx={{
            display: 'flex',
            flexDirection: {xs: 'column', md: 'row'},
            justifyContent: 'center',
            gap: 8,
        }}>
            <Box sx={{
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'center',
                textAlign: {xs: 'center', md: 'left'},
            }}>
                <Typography variant="h3">Can my PC handle that?</Typography>
                <Typography variant="h6">Instantly check game performance for your hardware</Typography>
            </Box>
            <Box component="img" src="/home_img.png" sx={{width: 384, height: 384, marginLeft: 8}}/>

        </Box>
    );
}

export default MainMessage;