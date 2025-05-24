import { Skeleton, Box } from '@mui/material';

const SkeletonCard = () => {
    return (
        <Box sx={{
            width: {xs: '120px', sm: '150px', md: '190px'},  // Adjust the card size based on screen width
            height: {xs: '230px', sm: '280px', md: '360px'},
            display: 'flex',
            margin: '4px',
            flexDirection: 'column',
            justifyContent: 'space-between',
            boxShadow: 3,
            borderRadius: 2,
            overflow: 'hidden',  // Prevents content from overflowing the card's edges
        }}>
            <Skeleton variant="rectangular" sx={{
                padding: '0px',
                height: {xs: '150px', sm: '200px', md: '280px'},
                margin: '0px',
                //height: { xs: '60%', sm: '65%', md: '70%' },
                objectFit: 'cover',  // This will ensure the image scales to fit the container
                width: '100%',  // Ensure the image stretches to the full width
            }} />
            <Skeleton variant="text" width="60%" />
        </Box>
    );
};

export default SkeletonCard;
