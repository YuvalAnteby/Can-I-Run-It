import React, {useState} from 'react';
import {Box, Checkbox, FormControlLabel, Slider, Typography} from "@mui/material";

const FpsPicker = ({minFps, maxFps, fps, setFps}) => {

    const [resetFps, setResetFps] = useState(false);  // New state for checkbox

    const handleCheckboxChange = (e) => {
        setResetFps(e.target.checked);
        setFps(null);
    }

    const handleSliderChange = (newValue) => {
        if (newValue > 0) {
            setFps(newValue);
        } else {
            setFps(null);
        }
    }

    return (
        <Box sx={{display: 'flex', flexDirection: 'row', justifyContent: 'center', mt: 2}}>
            <Box sx={{padding: "10px", minWidth: 300}}>
                <Typography variant="body1" sx={{textAlign: 'center'}}>Select Target FPS:</Typography>
                <Slider
                    sx={{width: '100%'}}
                    value={fps}
                    min={minFps}
                    max={maxFps}
                    step={1}
                    onChange={(e, newValue) => handleSliderChange(newValue)}
                    valueLabelDisplay="auto"
                    valueLabelFormat={(value) => `${value} FPS`}/>
            </Box>
            <FormControlLabel
                sx={{padding: "10px"}}
                control={
                    <Checkbox
                        checked={resetFps}
                        onChange={handleCheckboxChange}
                    />
                }
                label="Show me the best performance"
            />
        </Box>
    )
}
export default FpsPicker;