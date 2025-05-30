/**
 * Item component for the TopBar.js component.
 * Redirects according to the picked item.
 */
import Typography from "@mui/material/Typography";
import IconButton from "@mui/material/IconButton";
import * as React from "react";
import {Link as RouterLink} from "react-router-dom";
import {Icon} from "@mui/material";

export const BarIcon = ({label, href, Icon, i}) => {
    return (
        <IconButton
            key={i}
            component={RouterLink}
            to={href}
            size='large'
            color='inherit'
            sx={{mx: 1}}
        >
            <Icon sx={{mr: 0.5}}/>
            <Typography variant="button">{label}</Typography>
        </IconButton>
    )
}
