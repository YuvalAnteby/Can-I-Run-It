import {Box, Button, Typography} from "@mui/material";
import React from "react";

const MainMessage = ({onCheckClick}) => {

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
                <Button
                    variant="contained"
                    sx={{marginTop: '24px', backgroundColor: '#AEEA00',}}
                    onClick={onCheckClick}
                >Check a game now
                </Button>
            </Box>
            <Box component="img" src="/home_img.png"
                 sx={{
                     width: 384,
                     height: 384,
                     marginLeft: 8,
                     // floating animation
                     '@keyframes float': {
                         '0%, 100%': {transform: 'translateY(0)'},
                         '50%': {transform: 'translateY(-8px)'},
                     },
                     animation: 'float 6s ease-in-out infinite',
                     willChange: 'transform',
                 }}/>

        </Box>
    );
}

export default MainMessage;