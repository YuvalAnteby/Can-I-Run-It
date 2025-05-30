import React, {useState} from 'react';
import {Autocomplete, Box, TextField} from "@mui/material";
import {useNavigate} from "react-router-dom";
import MainMessage from "./components/MainMessage";
import CurrentSetup from "./components/CurrentSetup";
import GamesShelf from "../games/components/GamesShelf";
import {useSetup} from "../shared/contexts/SetupContext";
import {useGames} from "../games/hooks/useGames";


const HomePage = () => {
    const {setup} = useSetup();
    const textColor = '#e0e1dd';
    const navigate = useNavigate(); //Hook to navigate to another page
    const {shelves} = useGames();

    const [searchResults, setSearchResults] = useState([]);

    return (
        <Box
            sx={{
                display: 'flex',
                flexDirection: 'column',
                width: '100%',
                alignItems: 'center',
                color: textColor,
            }}>
            {/* main message */}
            <MainMessage/>
            {/* current setup */}
            <CurrentSetup />
            {/* example games & search */}
            <Box
                border={1}                 // 1px solid (theme.palette.divider)
                borderColor="grey.500"     // or any color key from your theme
                borderRadius={1}
                p={2}
                sx={{display: 'flex', flexDirection: 'column', padding: '20px', width: '100%', marginTop: '24px'}}>
                <Autocomplete
                    fullWidth
                    disablePortal
                    options={searchResults}
                    //onChange={(e, newValue) => setGame(newValue)}
                    renderInput={(params) => (
                        <TextField
                            {...params}
                            label={`Search a game`}
                            variant="filled"
                            fullWidth
                            slotProps={{
                                input: {
                                    ...params.InputProps,
                                    type: 'search',
                                },
                            }}
                        />
                    )}
                />
                <Box sx={{marginTop: '16px'}}>
                    {shelves.map((shelf) => (
                        <GamesShelf
                            key={shelf.id}
                            title={shelf.title}
                            fetchUrl={shelf.href}
                            cpu={setup.cpu}
                            gpu={setup.gpu}
                            ramAmount={setup.ram}
                        />
                    ))}
                </Box>
            </Box>
        </Box>
    );

}
export default HomePage;