import {Box, Typography} from "@mui/material";
import React from "react";

const MainMessage = () => {
    return (
        <Box sx={{
            display: 'flex',
            flexDirection: {xs: 'column', md: 'row'},
            alignItems: 'center',
            gap: 8,

        }}>
            <Box sx={{
                textAlign: {xs: 'center', md: 'left'},
            }}>
                <Typography variant="h3">Can my PC handle that?</Typography>
                <Typography variant="h6">Instantly check game performance for your hardware</Typography>
            </Box>
            <Box component="img" src="/home_img.png" sx={{width: 384, height: 384, margin: 8}}/>
        </Box>
    );
}

export default MainMessage;