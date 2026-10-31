import { useEffect } from 'react';
import { HashRouter, Link, NavLink, Route, Routes, useLocation } from 'react-router-dom';
import { profile } from './content/profile';
import { Home } from './pages/Home';
import { ScenarioPage } from './pages/ScenarioPage';

function ScrollTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);
  return null;
}

export function App() {
  return (
    <HashRouter>
      <ScrollTop />
      <header className="topbar">
        <div className="wrap topbar-in">
          <Link to="/" className="brand">
            <svg viewBox="0 0 32 32" width="22" height="22" aria-hidden>
              <path d="M4 5v22M28 5v22M4 16h6M22 16h6" className="brand-rail" />
              <path d="M10 10v12M14 10v12" className="brand-live" />
              <circle cx="20" cy="16" r="3.5" className="brand-live" />
            </svg>
            {profile.name}
          </Link>
          <nav className="topnav">
            <NavLink to="/sim/motor" className={({ isActive }) => (isActive ? 'active' : '')}>
              Simulator
            </NavLink>
            <Link to="/" onClick={() => setTimeout(() => document.getElementById('about')?.scrollIntoView(), 0)}>
              About
            </Link>
            {profile.resume && <a href={profile.resume}>Resume</a>}
            {profile.website && <a href={profile.website}>Website</a>}
          </nav>
        </div>
      </header>
      <main>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/sim/:id" element={<ScenarioPage />} />
          <Route path="*" element={<Home />} />
        </Routes>
      </main>
      <footer className="footer wrap">
        <p>
          Built with React and TypeScript. The PLC engine, ladder renderer and ST/SCL generator are written from scratch for this site.
        </p>
      </footer>
    </HashRouter>
  );
}
