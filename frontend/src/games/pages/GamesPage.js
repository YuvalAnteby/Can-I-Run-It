import React from 'react';
import {useLocation} from "react-router-dom";
import {Box, Skeleton} from "@mui/material";
import GamesShelf from "../components/GamesShelf";
import {useGames} from "../hooks/useGames";


const GamesPage = () => {

    const location = useLocation();
    const {cpu, gpu, ramAmount} = location.state || {};
    const {shelves, games, loading} = useGames(cpu, gpu, ramAmount);

    if (loading) {
        // Show a skeleton loading animation
        return (
            <Box sx={{padding: '20px'}}>
                {[...Array(3)].map((_, index) => (
                    <Box key={index} sx={{marginBottom: 4}}>
                        <Skeleton variant="text" width={200} height={40} animation="wave"/>
                        <Skeleton variant="rectangular" height={250} animation="wave" sx={{borderRadius: 2}}/>
                    </Box>
                ))}
            </Box>
        );
    }

    return (
        // Render shelves with fetched game data
        <Box sx={{padding: '20px'}}>
            {shelves.map((shelf) => (
                <GamesShelf
                    key={shelf.row_id}
                    title={shelf.title}
                    fetchUrl={shelf.fetch_url}
                    params={shelf.params}
                    cpu={cpu}
                    gpu={gpu}
                    ramAmount={ramAmount}
                    loading={loading}
                />
            ))}
        </Box>
    );
};

export default GamesPage;