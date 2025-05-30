import React from 'react';
import GameCard from "./GameCard";
import {Box, Typography} from "@mui/material";
import SkeletonCard from "./SkeletonCard";
import {useHomeShelves} from "../hooks/useGamesShelves";

const GamesShelf = ({title, fetchUrl, cpu, gpu, ramAmount}) => {

    const games = useHomeShelves({fetchUrl, title});
    const loading = false;

    return (
        <Box>
            <Box sx={{
                display: 'flex',
                flexDirection: 'row',
                marginBottom: 0,
                justifyContent: 'space-between',
                alignItems: 'baseline',
            }}>
                <Typography variant="h5">{title}</Typography>
            </Box>

            <Box sx={{
                display: 'flex',
                overflowX: 'auto',
                gap: 1,
                py: 1,
                '&::-webkit-scrollbar': {display: 'none'}, // optional: hide scrollbar
            }}>
                { loading
                    ? [...Array(4)].map((_, index) => (
                        <SkeletonCard key={index}/>
                    ))
                    : games.map((game) => (
                        <Box key={game.id} sx={{minWidth: 200}}>
                            <GameCard game={game} cpu={cpu} gpu={gpu} ramAmount={ramAmount}/>
                        </Box>
                    ))
                }
            </Box>
        </Box>
    );
};

export default GamesShelf;