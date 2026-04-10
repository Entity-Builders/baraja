import { Routes, Route } from 'react-router-dom';
import AdminDashboard from './AdminDashboard';
import AdminEditionEditor from './AdminEditionEditor';
import AdminPrintView from './AdminPrintView';
import AdminGenerateEdition from './AdminGenerateEdition';
import AdminTemplates from './AdminTemplates';
import AdminFrameGenerator from './AdminFrameGenerator';

export default function AdminApp() {
  return (
    <Routes>
      <Route path="/" element={<AdminDashboard />} />
      <Route path="/generate" element={<AdminGenerateEdition />} />
      <Route path="/templates" element={<AdminTemplates />} />
      <Route path="/frames" element={<AdminFrameGenerator />} />
      <Route path="/:deckId" element={<AdminEditionEditor />} />
      <Route path="/:deckId/print" element={<AdminPrintView />} />
    </Routes>
  );
}
