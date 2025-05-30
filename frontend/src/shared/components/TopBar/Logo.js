/**
 * The icon and name component used in the TopBar.js component.
 * Redirects to the home page.
 */

import Box from "@mui/material/Box";
import IconButton from "@mui/material/IconButton";
import {Link as RouterLink} from "react-router-dom";
import Typography from "@mui/material/Typography";
import * as React from "react";

export const LogoAndName = () => {
    return (
        <IconButton
            component={RouterLink}
            to="/"
            edge="start"
            color="inherit"
            aria-label="Go to homepage"
            sx={{p: 0, mr: 1}}>
            <Box
                component="img"
                src="/favicon-light.ico"
                alt="Can I Run It logo"
                sx={{width: 32, height: 32, margin: 1}}
            />

            <Typography variant="h6" noWrap component="div" sx={{display: {xs: 'none', sm: 'block'}}}>
                Can I Run It
            </Typography>
        </IconButton>
    )
}