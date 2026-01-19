import './MainLayout.css';
import { MainFooter } from './footer/MainFooter';
import { MainHeader } from './header/MainHeader';

export const MainLayout = ({ children }: { children: React.ReactNode }) => {
  return (
    <div className="main-layout">
      <MainHeader />
      <main className="main-content">{children}</main>
      <MainFooter />
    </div>
  );
};
