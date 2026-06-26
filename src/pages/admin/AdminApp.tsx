import { Navigate, Routes, Route, useParams, useSearchParams } from 'react-router-dom';
import AdminDashboard from './AdminDashboard';
import AdminEditionEditor from './AdminEditionEditor';
import AdminPrintView from './AdminPrintView';
import AdminGenerateEdition from './AdminGenerateEdition';
import AdminFrameGenerator from './AdminFrameGenerator';
import AdminTuckBox from './AdminTuckBox';
import AdminHeroRotation from './AdminHeroRotation';

function AdminDeckDesignRedirect() {
  const { deckId } = useParams();
  return <Navigate to={`/admin/${encodeURIComponent(deckId || '')}?studio=design`} replace />;
}

function AdminTemplatesRedirect() {
  const [searchParams] = useSearchParams();
  const deckId = searchParams.get('deck');
  const tool = searchParams.get('tool');

  if (!deckId) return <Navigate to="/admin" replace />;

  const nextSearch = new URLSearchParams({ studio: 'design' });
  if (tool) nextSearch.set('tool', tool);

  return <Navigate to={`/admin/${encodeURIComponent(deckId)}?${nextSearch.toString()}`} replace />;
}

export default function AdminApp() {
  return (
    <Routes>
      <Route path="/" element={<AdminDashboard />} />
      <Route path="/generate" element={<AdminGenerateEdition />} />
      <Route path="/templates" element={<AdminTemplatesRedirect />} />
      <Route path="/giro" element={<AdminHeroRotation />} />
      <Route path="/frames" element={<AdminFrameGenerator />} />
      <Route path="/tuckbox" element={<AdminTuckBox />} />
      <Route path="/tuckbox/:deckId" element={<AdminTuckBox />} />
      <Route path="/:deckId/design" element={<AdminDeckDesignRedirect />} />
      <Route path="/:deckId" element={<AdminEditionEditor />} />
      <Route path="/:deckId/print" element={<AdminPrintView />} />
    </Routes>
  );
}
