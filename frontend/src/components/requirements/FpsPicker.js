import React, {useState} from 'react';
import {Box, Checkbox, Slider, Typography} from "@mui/material";

const FpsPicker = ({minFps, maxFps, fps, setFps}) => {

    const [resetFps, setResetFps] = useState(false);  // New state for checkbox

    const handleCheckboxChange = (e) => {
        setResetFps(e.target.checked);
        setFps(null);
    }
    return (
        <Box sx={{display: 'flex', flexDirection: 'row'}}>
            <Box sx={{padding: "10px"}}>
                <Typography variant="body1">Select Target FPS:</Typography>
                <Slider
                    value={fps}
                    min={minFps}
                    max={maxFps}
                    step={1}
                    onChange={(e, newValue) => setFps(newValue)}
                    valueLabelDisplay="auto"
                    valueLabelFormat={(value) => `${value} FPS`}/>
            </Box>
            <Checkbox
                checked={resetFps}
                onChange={handleCheckboxChange}/>
        </Box>
    )
}
export default FpsPicker;