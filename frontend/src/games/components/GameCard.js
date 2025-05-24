import React from 'react';
import {useNavigate} from "react-router-dom";
import {Box, Card, CardMedia, Typography} from "@mui/material";

const GameCard = ({game, cpu, gpu, ramAmount}) => {

    const navigate = useNavigate();
    const handleClick = () => {
        navigate(`/game/${game.id}`, {state: {game, cpu, gpu, ramAmount}});
    };

    return (
        <Card sx={{
            width: {xs: '120px', sm: '150px', md: '190px'},  // Adjust the card size based on screen width
            height: {xs: '230px', sm: '280px', md: '360px'},
            display: 'flex',
            margin: '4px',
            flexDirection: 'column',
            justifyContent: 'space-between',
            boxShadow: 3,
            borderRadius: 2,
            overflow: 'hidden',  // Prevents content from overflowing the card's edges
            transition: 'transform 0.3s ease',  // For hover animation (optional)
            '&:hover': {
                transform: 'scale(1.05)',  // Scale on hover (optional)
            },
        }}
              onClick={() => handleClick()}>
            <CardMedia
                component="img"
                alt={game.name}
                image={`${game.portrait_url}.jpg`}//TODO add a placeholder image
                title={game.name}
                sx={{
                    padding: '0px',
                    margin: '0px',
                    //height: { xs: '60%', sm: '65%', md: '70%' },
                    objectFit: 'cover',  // This will ensure the image scales to fit the container
                    width: '100%',  // Ensure the image stretches to the full width
                }}/>

            <Box sx={{
                padding: '4px',  // Adjusts the padding to make the content more compact
                paddingTop: '0px',
                margin: 0,
                display: 'flex',
                flexDirection: 'column',
                flexGrow: 1,
                justifyContent: 'center',
                alignItems: 'center',
            }}>
                <Typography variant="h6" align="center" sx={{
                    margin: 0,
                    paddingTop: '4px',
                    fontWeight: 'bold',
                    fontSize: {xs: '14px', sm: '16px', md: '18px'}, // Adjust text size for responsiveness
                    overflow: 'hidden',
                }}>
                    {game.name}
                </Typography>
            </Box>
        </Card>
    );

};

export default GameCard;