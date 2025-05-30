import React from 'react';
import {Button} from "@mui/material";
import {useNavigate} from "react-router-dom";


const Welcome = () => {

    const textColor = '#e0e1dd';
    const navigate = useNavigate(); //Hook to navigate to another page
    return (
        <div
            className="parent"
            style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                color: textColor,
                height: '100vh',
            }}>
            <h1>Welcome to Can I Run It</h1>
            <Button variant="contained" style={{ margin: '10px' }}
                    //TODO add users and log in functionality
            >Login</Button>

            <Button
                variant="text"
                style={{ margin: '10px' }}
                onClick={() => navigate('/setup')}>
                Continue as a guest</Button>
        </div>
    );

}
export default Welcome;