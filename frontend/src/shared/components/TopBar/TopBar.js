import * as React from 'react';
import AppBar from '@mui/material/AppBar';
import Box from '@mui/material/Box';
import Toolbar from '@mui/material/Toolbar';
import IconButton from '@mui/material/IconButton';
import MenuItem from '@mui/material/MenuItem';
import Menu from '@mui/material/Menu';

import MoreIcon from '@mui/icons-material/MoreVert';

import {BarIcon} from "./MenuItems";
import {LogoAndName} from "./Logo";
import HomeIcon from '@mui/icons-material/Home';
import InfoIcon from '@mui/icons-material/InfoOutlined';
import {AccountCircle} from "@mui/icons-material";


export default function PrimarySearchAppBar() {
    // Items in the menu
    const navItems = [
        {
            label: 'Home',
            href: '/',
            Icon: HomeIcon,
        },
        {
            label: 'About',
            href: '/about',
            Icon: InfoIcon,
        },
        {
            label: `Login/Signup`,
            href: '/users/:id',
            Icon: AccountCircle,
        }
    ]

    const [anchorEl, setAnchorEl] = React.useState(null);
    const [mobileMoreAnchorEl, setMobileMoreAnchorEl] = React.useState(null);

    const isMenuOpen = Boolean(anchorEl);
    const isMobileMenuOpen = Boolean(mobileMoreAnchorEl);

    const handleMobileMenuClose = () => {
        setMobileMoreAnchorEl(null);
    };

    const handleMenuClose = () => {
        setAnchorEl(null);
        handleMobileMenuClose();
    };

    const handleMobileMenuOpen = (event) => {
        setMobileMoreAnchorEl(event.currentTarget);
    };

    const menuId = 'primary-search-account-menu';
    const renderMenu = (
        <Menu
            anchorEl={anchorEl}
            anchorOrigin={{
                vertical: 'top',
                horizontal: 'right',
            }}
            id={menuId}
            keepMounted
            transformOrigin={{
                vertical: 'top',
                horizontal: 'right',
            }}
            open={isMenuOpen}
            onClose={handleMenuClose}
        >
            <MenuItem onClick={handleMenuClose}>Profile</MenuItem>
            <MenuItem onClick={handleMenuClose}>My account</MenuItem>
        </Menu>
    );

    // Mobile device menu
    const mobileMenuId = 'primary-search-account-menu-mobile';
    const renderMobileMenu = (
        <Menu
            anchorEl={mobileMoreAnchorEl}
            anchorOrigin={{
                vertical: 'top',
                horizontal: 'right',
            }}
            id={mobileMenuId}
            keepMounted
            transformOrigin={{
                vertical: 'top',
                horizontal: 'right',
            }}
            open={isMobileMenuOpen}
            onClose={handleMobileMenuClose}
        >
            {navItems.map(({label, href, Icon}, i) => (
                <MenuItem>
                    <BarIcon label={label} href={href} Icon={Icon} key={i}/>
                </MenuItem>
            ))}
        </Menu>
    );

    return (
        <Box sx={{flexGrow: 1}}>
            <AppBar
                position="static"
                color="transparent"
                sx={{
                    bgcolor: 'background.default',
                    borderBottom: 1,
                    borderColor: 'divider'
                }}>
                <Toolbar>
                    <Box sx={{display: 'flex', alignItems: 'center'}}>
                        <LogoAndName/>
                    </Box>
                    <Box sx={{flexGrow: 1}}/>
                    {/* Desktop devices */}
                    <Box sx={{display: {xs: 'none', md: 'flex'}}}>
                        {navItems.map(({label, href, Icon}, i) => (
                            <BarIcon label={label} href={href} Icon={Icon} key={i}/>
                        ))}
                    </Box>
                    {/* Mobile devices */}
                    <Box sx={{display: {xs: 'flex', md: 'none'}}}>
                        <IconButton
                            size="large"
                            aria-label="show more"
                            aria-controls={mobileMenuId}
                            aria-haspopup="true"
                            onClick={handleMobileMenuOpen}
                            color="inherit"
                        >
                            <MoreIcon/>
                        </IconButton>
                    </Box>

                </Toolbar>
            </AppBar>
            {renderMobileMenu}
            {renderMenu}
        </Box>
    );
}
