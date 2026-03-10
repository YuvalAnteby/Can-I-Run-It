import React from 'react';
import { Outlet } from 'react-router-dom';

import './MainLayout.css';
import { MainFooter } from './footer/MainFooter';
import { MainHeader } from './header/MainHeader';

export const MainLayout = (): React.ReactElement => {
  return (
    <div className="main-layout">
      <MainHeader />
      <main className="main-content">
        <Outlet />
      </main>
      <MainFooter />
    </div>
  );
};
