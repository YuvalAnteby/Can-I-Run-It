import React from 'react';
import {InputAdornment, TextField} from "@mui/material";

/**
 * A component that allows users to input a RAM amount in GB.
 * @returns React.JSX.Element
 */
const RamSelection = ({ramAmount, setRamAmount}) => {


    /**
     * Handles the input change event, ensuring only numeric values are allowed.
     *
     * @param {React.ChangeEvent<HTMLInputElement>} event - The input change event.
     */
    const handleChange = (event) => {
        const newValue = event.target.value;
        if (/^\d*$/.test(newValue)) {
            setRamAmount(newValue);
        }
    };

    return (
        <div
            style={{
                display: "flex",
                flexDirection: 'column',
                width: '60%',
                marginTop: '0px',
                alignItems: 'center',
                justifyContent: 'center',
            }}>
            <TextField
                style={{
                    paddingTop: '0px',
                    marginTop: '0px',
                }}
                onChange={handleChange}
                value={ramAmount}
                label="Ram Amount"
                slotProps={{
                    input: {
                        endAdornment: <InputAdornment position="end">GB</InputAdornment>
                    }
                }
                }
            ></TextField>
        </div>
    )
}
export default RamSelection;