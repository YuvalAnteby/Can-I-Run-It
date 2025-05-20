import React from 'react';
import {Box, Typography} from "@mui/material";

const GameBanner = ({game}) => {
    //TODO make additional box for cases of small screens as a column instead
    return (
        <Box display="flex" flexDirection="column">
            <Typography variant="h2"
                        sx={{marginBottom: 2, fontWeight: "bold", fontSize: {xs: '2rem', md: '2.5rem'}}}>
                {game.name}
            </Typography>

            <Box
                sx={{
                    display: 'flex',
                    flexDirection: 'row',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    backgroundColor: 'rgba(0, 0, 0, 0.4)',  // Add a subtle background color to the banner
                    padding: 3,
                    borderRadius: 2,  // Slightly round the corners
                    boxShadow: 3,  // Add a shadow to create separation from the background
                    marginBottom: 3,  // Add space below the banner
                    width: '100%',
                }}>
                {/* Game Banner */}
                <Box sx={{display: 'flex', flexDirection: 'row', width: '100%'}}>
                    <Box sx={{flex: 1.4}}>
                        <Box sx={{position: "relative", paddingBottom: "56.25%"}}>
                            <iframe
                                src={`${game.trailer_url}?autoplay=0`}
                                title="Game Trailer"
                                frameBorder="0"
                                allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                                allowFullScreen
                                style={{
                                    position: "absolute",
                                    top: 0,
                                    left: 0,
                                    width: "100%",
                                    height: "100%",
                                    borderRadius: '12px'
                                }}
                            />
                        </Box>
                    </Box>
                    {/* Game text */}
                    <Box sx={{
                        display: 'flex',
                        flexDirection: 'column',
                        justifyContent: 'center',
                        alignItems: 'flex-start',
                        padding: '20px',
                        flex: 0.8,  // Allow text to take up the remaining space
                        color: 'white',  // Make the text stand out on dark background
                    }}>


                        <Typography variant="body1"
                                    sx={{marginTop: 0, marginBottom: 1, fontWeight: "bold", fontSize: {xs: '1.2rem', md: '1.3rem'}}}>
                            Developer: {game.developer}
                        </Typography>

                        <Typography variant="body1"
                                    sx={{marginBottom: 1, fontWeight: "bold", fontSize: {xs: '1.2rem', md: '1.3rem'}}}>
                            Publisher: {game.publisher}
                        </Typography>

                        <Typography variant="body2" sx={{marginTop: 2, fontSize: {xs: '0.8rem', md: '1rem'}}}>
                            {game.desc}
                        </Typography>

                        <Typography variant="h6" sx={{marginTop: 3, fontSize: {xs: '1rem', md: '1.2rem'}}}>
                            Genres:
                        </Typography>
                        <ul style={{marginTop: 0}}>
                            {game.genres.map((genre, index) => (
                                <li key={index}>
                                    <Typography variant="body1"
                                                sx={{fontSize: {xs: '0.9rem', md: '1rem'}}}>{genre}</Typography>
                                </li>
                            ))}
                        </ul>
                    </Box>
                </Box>
            </Box>
        </Box>
    )
}
export default GameBanner;