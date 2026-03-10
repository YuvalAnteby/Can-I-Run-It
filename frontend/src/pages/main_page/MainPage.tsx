import type { ReactElement } from 'react';
import { GamesGrid } from '../../components/games_grid/GamesGrid';
import { HeroSearch } from './HeroSearch';
import { PLACEHOLDER_GAMES } from '../../data/placeholderGames';

interface UserProfile {
  username: string;
  avatar: string;
  specs: {
    gpu: string;
    cpu: string;
    ram: string;
  } | null;
}

export default function MainPage(): ReactElement {
  /* --- MOCK DATA --- */
  const MOCK_USER: UserProfile = {
    username: 'ShadowCoder',
    avatar: 'https://i.pravatar.cc/150?img=11',
    specs: {
      gpu: 'NVIDIA RTX 4070 Ti',
      cpu: 'Intel Core i7-13700K',
      ram: '32GB DDR5',
    },
  };

  const NEW_GAMES = PLACEHOLDER_GAMES.slice(0, 4);

  return (
    <div>
      <HeroSearch userState="guest" user={MOCK_USER} />
      <GamesGrid title="New Games" games={NEW_GAMES} />
    </div>
  );
}
