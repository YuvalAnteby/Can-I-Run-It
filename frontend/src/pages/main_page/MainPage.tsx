import { GamesGrid } from '../../components/games_grid/GamesGrid';
import { HeroSearch } from './HeroSearch';

export const MainPage = () => {
  /* --- MOCK DATA --- */
  interface UserProfile {
    username: string;
    avatar: string;
    specs: {
      gpu: string;
      cpu: string;
      ram: string;
    } | null;
  }
  const MOCK_USER: UserProfile = {
    username: 'ShadowCoder',
    avatar: 'https://i.pravatar.cc/150?img=11',
    specs: {
      gpu: 'NVIDIA RTX 4070 Ti',
      cpu: 'Intel Core i7-13700K',
      ram: '32GB DDR5',
    },
  };

  const NEW_GAMES = [
    {
      id: 1,
      title: 'Grand Theft Auto VI',
      req: 'Extreme',
      image: '/api/placeholder/400/225',
    },
    {
      id: 2,
      title: 'Starfield: Shattered Space',
      req: 'High',
      image: '/api/placeholder/400/225',
    },
    { id: 3, title: 'Hades II', req: 'Low', image: '/api/placeholder/400/225' },
    {
      id: 4,
      title: 'Monster Hunter Wilds',
      req: 'High',
      image: '/api/placeholder/400/225',
    },
  ];

  return (
    <div>
      <HeroSearch userState="guest" user={MOCK_USER} />
      <GamesGrid title="New Games" games={NEW_GAMES} />
    </div>
  );
};
