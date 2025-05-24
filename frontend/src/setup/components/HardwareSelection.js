/**
 * HardwareSelection
 *
 * Reusable component for selecting CPU/GPU brand and model.
 * Supports debounced search + automatic model lookup.
 */

import React from 'react';
import {
    Autocomplete,
    FormControl,
    InputLabel,
    MenuItem,
    Select,
    TextField
} from "@mui/material";
import {useHardwareSearch} from '../hooks/useHardwareSearch';

const HardwareSelection = ({type, brand, setBrand, hardware, setHardware}) => {
    const {companies, searchResults} = useHardwareSearch(type, brand, hardware, setHardware);

    return (
        <div style={{
            marginTop: '0px',
            display: "flex",
            flexDirection: 'column',
            width: '60%',
            alignItems: 'center',
            justifyContent: 'center',
        }}>
            {/* Brand selection */}
            <FormControl fullWidth variant="filled" margin="normal" style={{padding: '0px', marginTop: '10px'}}>
                <InputLabel>{type} Company</InputLabel>
                <Select
                    sx={{textAlign: "left"}}
                    value={brand}
                    onChange={(e) => {
                        setBrand(e.target.value);
                        setHardware(null); // reset model
                    }}
                    label={`${type} Company`}>
                    {companies.map((company) => (
                        <MenuItem key={company} value={company}>{company}</MenuItem>
                    ))}
                </Select>
            </FormControl>

            {/* Model selection */}
            <Autocomplete
                fullWidth
                disablePortal
                disabled={!brand}
                options={searchResults}
                getOptionLabel={(option) => option.fullname || option.model}
                value={hardware || null}
                onChange={(e, newValue) => setHardware(newValue)}
                renderInput={(params) => (
                    <TextField
                        {...params}
                        label={`Search ${type} Model`}
                        variant="filled"
                        fullWidth
                    />
                )}
            />
        </div>
    );
};

export default HardwareSelection;
