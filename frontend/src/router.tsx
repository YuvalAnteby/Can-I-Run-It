import React from 'react';
import {
  createBrowserRouter,
  Navigate,
  RouterProvider,
} from 'react-router-dom';

import { MainLayout } from './layout/MainLayout';
import AboutPage from './pages/about/AboutPage';
import MainPage from './pages/main_page/MainPage';
import GameDetailPage from './pages/game_detail/GameDetailPage';

const router = createBrowserRouter([
  {
    path: '/',
    element: <MainLayout />,
    children: [
      { index: true, element: <MainPage /> },
      { path: 'games/:slug', element: <GameDetailPage /> },
      { path: 'about', element: <AboutPage /> },
      // TODO: Add route for /games once the Games browse page is created
      // TODO: Add route for /hardware-rank once the Hardware Rank page is created
      { path: '*', element: <Navigate to="/" replace /> },
    ],
  },
]);

export function AppRouter(): React.ReactElement {
  return <RouterProvider router={router} />;
}
