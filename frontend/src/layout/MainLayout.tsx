import React from 'react';
import { Outlet } from 'react-router-dom';

import { MainFooter } from './footer/MainFooter';
import { MainHeader } from './header/MainHeader';

export const MainLayout = (): React.ReactElement => {
  return (
    <div className="flex flex-col min-h-screen">
      <MainHeader />
      <main className="flex-1 flex flex-col">
        <Outlet />
      </main>
      <MainFooter />
    </div>
  );
};
