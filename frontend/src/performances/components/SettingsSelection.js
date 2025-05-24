import React from 'react';
import {Box, FormControl, InputLabel, MenuItem, Select} from "@mui/material";
import FpsPicker from "./FpsPicker";

const SettingsSelection = ({game, resolution, setResolution, setting, setSetting, fps, setFps}) => {

    return (
        <Box sx={{padding: '20px'}}>
            {/* Resolution picker */}
            <FormControl fullWidth variant="filled" margin="normal" style={{padding: '0px', marginTop: '10px'}}>
                <InputLabel>Resolution</InputLabel>
                <Select
                    sx={{textAlign: "left"}}
                    value={resolution}
                    // Update the selected company
                    onChange={(e) => {
                        setResolution(e.target.value);
                    }}
                    label={`Resolution`}>
                    {game.available_resolutions.map((resolution) => (
                        <MenuItem key={resolution} value={resolution}>{resolution}</MenuItem>
                    ))}
                </Select>
            </FormControl>
            {/* Graphic setting picker */}
            <FormControl fullWidth variant="filled" margin="normal" style={{padding: '0px', marginTop: '10px'}}>
                <InputLabel>Graphic level</InputLabel>
                <Select
                    sx={{textAlign: "left"}}
                    value={setting}
                    // Update the selected company
                    onChange={(e) => {
                        setSetting(e.target.value);
                    }}
                    label={`Graphic level`}>
                    {game.supported_settings.map((setting_name) => (
                        <MenuItem key={setting_name} value={setting_name}>{setting_name}</MenuItem>
                    ))}
                </Select>
            </FormControl>
            {/* FPS picker */}
            <FpsPicker minFps={30} maxFps={240} fps={fps} setFps={setFps}/>

        </Box>
    )

}
export default SettingsSelection;