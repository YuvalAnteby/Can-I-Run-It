import {Box, Button, Typography} from "@mui/material";
import React from "react";

const CurrentSetup = () => {
    return (
        <Box
            border={1}                 // 1px solid (theme.palette.divider)
            borderColor="grey.500"     // or any color key from your theme
            borderRadius={1}
            p={2}
            sx={{
                backgroundColor: 'rgba(0, 0, 0, 0.3)',  // Add a subtle background color to the banner
                display: 'flex',
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-evenly',
            }}
        >
            <Box sx={{
                display: 'flex',
                flexDirection: 'column',

            }}>
                <Typography variant="h6" sx={{fontWeight: 'bold', textAlign: 'center'}}>Your current setup</Typography>
                {/* TODO fetch user setup to show up here, or a setup we just picked for a guest */}
                <Typography variant="body2" color="textSecondary" sx={{textAlign: 'center'}}
                >
                    No setup saved
                </Typography>
            </Box>
            <Button
                variant="contained"
                sx={{margin: '12px'}}
                onClick={() => {
                    console.log("clicked edit setup")
                }}
            >
                Update setup
            </Button>
        </Box>
    )
}

export default CurrentSetup;