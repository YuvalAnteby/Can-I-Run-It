import {Box, Button, Typography} from "@mui/material";
import React from "react";
import {useSetup} from "../../shared/contexts/SetupContext";
import {useLocation, useNavigate} from "react-router-dom";

const CurrentSetup = () => {
    const {setup} = useSetup();
    const navigate = useNavigate();
    const location = useLocation();

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
            }}
            >
                <Typography variant="h6" sx={{fontWeight: 'bold', textAlign: 'center'}}>Your current setup</Typography>

                <Typography variant="body2" color="textSecondary" sx={{textAlign: 'center'}}
                >
                    {setup.cpu ? `${setup.cpu.model}, ${setup.gpu.model}, ${setup.ram} GB` : "No setup saved"}
                </Typography>
            </Box>
            <Button
                variant="contained"
                sx={{margin: '12px'}}
                onClick={() => {
                    navigate("/setup", {state: {from: location.pathname}});
                }}
            >
                {setup.cpu ? "Update setup" : "Create setup"}
            </Button>
        </Box>
    )
}

export default CurrentSetup;