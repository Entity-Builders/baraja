import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import './index.css';

const BarajaLanding = lazy(() => import('./pages/BarajaLanding'));
const CableATierraLanding = lazy(() => import('./editions/cable-a-tierra/index'));
const BarometroLanding = lazy(() => import('./editions/barometro/index'));
const AdminApp = lazy(() => import('./pages/admin/AdminApp'));

// Edition slug → component map
const EDITION_COMPONENTS: Record<string, React.ComponentType> = {
  'cable-a-tierra': CableATierraLanding,
  'barometro': BarometroLanding,
};

function getEditionSlug(): string | null {
  const hostname = window.location.hostname;
  const parts = hostname.split('.');

  // Production: cable-a-tierra.baraja.cards
  if (parts.length >= 3 && !['www', 'app'].includes(parts[0])) {
    return parts[0];
  }

  // Dev override: ?edition=cable-a-tierra
  const params = new URLSearchParams(window.location.search);
  const editionParam = params.get('edition');
  if (editionParam) return editionParam;

  return null;
}

function LoadingScreen() {
  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'var(--color-bg)',
      color: 'var(--color-gold)',
      fontFamily: 'var(--font-serif)',
      fontSize: '1.5rem',
      letterSpacing: '0.1em',
    }}>
      Baraja
    </div>
  );
}

function PublicApp() {
  const editionSlug = getEditionSlug();
  const EditionComponent = editionSlug ? EDITION_COMPONENTS[editionSlug] : null;

  return (
    <Suspense fallback={<LoadingScreen />}>
      {EditionComponent ? <EditionComponent /> : <BarajaLanding />}
    </Suspense>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Quick Admin Routes */}
        <Route path="/admin/*" element={
          <Suspense fallback={<LoadingScreen />}>
            <AdminApp />
          </Suspense>
        } />
        
        {/* Public Marketing/Edition Sites */}
        <Route path="*" element={<PublicApp />} />
      </Routes>
    </BrowserRouter>
  );
}
