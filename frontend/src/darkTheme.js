import { createTheme } from '@mui/material/styles';

const darkTheme = createTheme({
    palette: {
        mode: 'dark', // Enables dark mode globally
        primary: {
            main: '#e0e1dd', // Text color
        },
        background: {
            default: '#1b263b', // Main background color
            paper: '#415a77', // Background for Paper components (used in Select, Autocomplete, etc.)
        },
        text: {
            primary: '#e0e1dd', // Text color everywhere
            secondary: '#aeb2c2',
        },
        divider: 'rgba(224,225,221,0.2)',
    },
    components: {
        MuiInputLabel: {
            styleOverrides: {
                root: {
                    color: '#e0e1dd', // Ensures labels are white
                },
            },
        },
        MuiFilledInput: {
            styleOverrides: {
                root: {
                    backgroundColor: '#415a77',
                    '&:hover': { backgroundColor: '#2d3e50' },
                    '&.Mui-focused': { backgroundColor: '#2d3e50' },
                },
            },
        },
        MuiSelect: {
            styleOverrides: {
                select: {
                    backgroundColor: '#415a77',
                },
            },
        },
        MuiMenuItem: {
            styleOverrides: {
                root: {
                    backgroundColor: '#415a77',
                    '&:hover': { backgroundColor: '#2d3e50' },
                },
            },
        },
        MuiAppBar: {
            defaultProps: { color: 'transparent', elevation: 0 },
            styleOverrides: {
                root: {
                    backgroundColor: '#1b263b',
                    borderColor: 'divider',
                    borderBottom: `1px solid rgba(224,225,221,0.15)`,

                },
            },
        },
        MuiButtonBase: {
            styleOverrides: {
                root: {
                    '&:hover': { opacity: 1 },
                },
            },
        },
    },
});

export default darkTheme;
