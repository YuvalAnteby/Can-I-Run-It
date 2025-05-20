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
    },
});

export default darkTheme;
