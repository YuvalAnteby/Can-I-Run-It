import React, {useEffect, useState} from 'react';
import {Box, Typography} from "@mui/material";

const AdditionalInfo = ({game}) => {

    return (
        <Box sx={{flex: 1}}>
            <Typography variant="h6">
                Is SSD recommended? {game.is_ssd_recommended ? "✅" : "❌"}
            </Typography>

            <Typography variant="h6">
                Playable on:
            </Typography>

            {/* TODO add OS supported list here
            <ul style={{marginTop: 0}}>
                {game.upscale_support.map((genre, index) => (
                    <li key={index}>
                        <Typography variant="body1"
                                    sx={{fontSize: {xs: '0.9rem', md: '1rem'}}}>{genre}</Typography>
                    </li>
                ))}
            </ul>
            */}

            <Typography variant="h6" sx={{marginTop: 3, fontSize: {xs: '1rem', md: '1.2rem'}}}>
                Frame generation & Upscale:
            </Typography>
            {Array.isArray(game.upscale_support) && game.upscale_support.length > 0 ? (
                <ul style={{ marginTop: 0 }}>
                    {game.upscale_support.map((tech, index) => (
                        <li key={index}>
                            <Typography
                                variant="body1"
                                sx={{ fontSize: { xs: '0.9rem', md: '1rem' } }}
                            >
                                {tech}
                            </Typography>
                        </li>
                    ))}
                </ul>
            ) : (
                <Typography
                    variant="body1"
                    sx={{ fontSize: { xs: '0.9rem', md: '1rem' }, fontStyle: 'italic' }}
                >
                    None supported.
                </Typography>
            )}
        </Box>
    )
}
export default AdditionalInfo;