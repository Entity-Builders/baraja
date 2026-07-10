import { lazy, Suspense, useEffect } from 'react';
import { BrowserRouter, Navigate, Routes, Route, useLocation } from 'react-router-dom';
import AdminAuthGate from './pages/admin/AdminAuthGate';
import './index.css';

const DynamicEditionLanding = lazy(() => import('./pages/DynamicEditionLanding'));
const CustomDeckService = lazy(() => import('./pages/digital/CustomDeckService'));
const DigitalAppAccess = lazy(() => import('./pages/digital/DigitalAppAccess'));
const DigitalAppCollections = lazy(() => import('./pages/digital/DigitalAppCollections'));
const DigitalAppDeckDetail = lazy(() => import('./pages/digital/DigitalAppDeckDetail'));
const DigitalAppLibrary = lazy(() => import('./pages/digital/DigitalAppLibrary'));
const DigitalAppPreviewLimit = lazy(() => import('./pages/digital/DigitalAppPreviewLimit'));
const DigitalDailyCard = lazy(() => import('./pages/digital/DigitalDailyCard'));
const DigitalDeckAccess = lazy(() => import('./pages/digital/DigitalDeckAccess'));
const DigitalDeckDetail = lazy(() => import('./pages/digital/DigitalDeckDetail'));
const DigitalInstallGuide = lazy(() => import('./pages/digital/DigitalInstallGuide'));
const DigitalDeckLibrary = lazy(() => import('./pages/digital/DigitalDeckLibrary'));
const DigitalDeckSession = lazy(() => import('./pages/digital/DigitalDeckSession'));
const DigitalPrintGuide = lazy(() => import('./pages/digital/DigitalPrintGuide'));
const DigitalSavedCards = lazy(() => import('./pages/digital/DigitalSavedCards'));
const MusicBingoDemo = lazy(() => import('./pages/digital/MusicBingoDemo'));
const MusicBingoCatalog = lazy(() => import('./pages/digital/MusicBingoCatalog'));
const MusicBingoCreator = lazy(() => import('./pages/digital/MusicBingoCreator'));
const MusicBingoSpotifySeed = lazy(() => import('./pages/digital/MusicBingoSpotifySeed'));
const MusicBingoPlayerDemo = lazy(() =>
  import('./pages/digital/MusicBingoDemo').then((module) => ({
    default: module.MusicBingoPlayerDemo,
  }))
);
const MusicBingoLanding = lazy(() => import('./pages/digital/MusicBingoLanding'));
const MusicBingoCheckoutReturn = lazy(() => import('./pages/digital/MusicBingoCheckoutReturn'));
const AdminApp = lazy(() => import('./pages/admin/AdminApp'));

function getEditionSlug(): string | null {
  const hostname = window.location.hostname;
  const parts = hostname.split('.');

  // Production: cable-a-tierra.baraja.cards
  if (
    hostname.endsWith('.baraja.cards') &&
    parts.length >= 3 &&
    !['www', 'app'].includes(parts[0])
  ) {
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

  return (
    <Suspense fallback={<LoadingScreen />}>
      {editionSlug ? <DynamicEditionLanding slug={editionSlug} /> : <DigitalDeckLibrary />}
    </Suspense>
  );
}

function ScrollToTopOnNavigation() {
  const { pathname, search } = useLocation();

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
  }, [pathname, search]);

  return null;
}

export default function App() {
  return (
    <BrowserRouter>
      <ScrollToTopOnNavigation />
      <Routes>
        {/* Quick Admin Routes */}
        <Route path="/admin/*" element={
          <Suspense fallback={<LoadingScreen />}>
            <AdminAuthGate>
              <AdminApp />
            </AdminAuthGate>
          </Suspense>
        } />

        {/* Baraja PWA App Flow — Figma Make A Editorial */}
        <Route path="/app" element={
          <Suspense fallback={<LoadingScreen />}>
            <DigitalAppLibrary />
          </Suspense>
        } />
        <Route path="/app/access" element={
          <Suspense fallback={<LoadingScreen />}>
            <DigitalAppAccess />
          </Suspense>
        } />
        <Route path="/app/collections" element={
          <Suspense fallback={<LoadingScreen />}>
            <DigitalAppCollections />
          </Suspense>
        } />
        <Route path="/app/decks/:slug" element={
          <Suspense fallback={<LoadingScreen />}>
            <DigitalAppDeckDetail />
          </Suspense>
        } />
        <Route path="/app/decks/:slug/session" element={
          <Suspense fallback={<LoadingScreen />}>
            <DigitalDeckSession />
          </Suspense>
        } />
        <Route path="/app/decks/:slug/preview-limit" element={
          <Suspense fallback={<LoadingScreen />}>
            <DigitalAppPreviewLimit />
          </Suspense>
        } />
        <Route path="/app/decks/:slug/access" element={
          <Suspense fallback={<LoadingScreen />}>
            <DigitalAppAccess />
          </Suspense>
        } />
        <Route path="/app/decks/:slug/print-guide" element={
          <Suspense fallback={<LoadingScreen />}>
            <DigitalPrintGuide />
          </Suspense>
        } />
        <Route path="/app/decks/:slug/today" element={
          <Suspense fallback={<LoadingScreen />}>
            <DigitalDailyCard />
          </Suspense>
        } />
        <Route path="/app/decks/:slug/saved" element={
          <Suspense fallback={<LoadingScreen />}>
            <DigitalSavedCards />
          </Suspense>
        } />

        <Route path="/decks/:slug" element={
          <Suspense fallback={<LoadingScreen />}>
            <DigitalDeckDetail />
          </Suspense>
        } />
        <Route path="/decks/:slug/session" element={
          <Suspense fallback={<LoadingScreen />}>
            <DigitalDeckSession />
          </Suspense>
        } />
        <Route path="/decks/:slug/access" element={
          <Suspense fallback={<LoadingScreen />}>
            <DigitalDeckAccess />
          </Suspense>
        } />
        <Route path="/decks/:slug/print-guide" element={
          <Suspense fallback={<LoadingScreen />}>
            <DigitalPrintGuide />
          </Suspense>
        } />
        <Route path="/install" element={
          <Suspense fallback={<LoadingScreen />}>
            <DigitalInstallGuide />
          </Suspense>
        } />
        <Route path="/mazos-personalizados" element={
          <Suspense fallback={<LoadingScreen />}>
            <CustomDeckService />
          </Suspense>
        } />
        <Route path="/bingo-musical" element={
          <Suspense fallback={<LoadingScreen />}>
            <MusicBingoLanding />
          </Suspense>
        } />
        <Route path="/bingo-musical/crear" element={
          <Suspense fallback={<LoadingScreen />}>
            <MusicBingoCreator />
          </Suspense>
        } />
        <Route path="/bingo-musical/catalogo" element={
          <Suspense fallback={<LoadingScreen />}>
            <MusicBingoCatalog />
          </Suspense>
        } />
        <Route path="/bingo-musical/spotify-seed" element={
          <Suspense fallback={<LoadingScreen />}>
            <MusicBingoSpotifySeed />
          </Suspense>
        } />
        <Route path="/bingo-musical/pack" element={<Navigate to="/bingo-musical/crear" replace />} />
        <Route path="/bingo-musical/checkout/return" element={
          <Suspense fallback={<LoadingScreen />}>
            <MusicBingoCheckoutReturn />
          </Suspense>
        } />
        <Route path="/bingo-musical/demo-bar" element={
          <Suspense fallback={<LoadingScreen />}>
            <MusicBingoDemo />
          </Suspense>
        } />
        <Route path="/bingo-musical/demo-bar/jugar" element={
          <Suspense fallback={<LoadingScreen />}>
            <MusicBingoPlayerDemo />
          </Suspense>
        } />
        <Route path="/bingo-musical/:seoSlug" element={<Navigate to="/bingo-musical" replace />} />
        
        {/* Public Marketing/Edition Sites */}
        <Route path="*" element={<PublicApp />} />
      </Routes>
    </BrowserRouter>
  );
}
