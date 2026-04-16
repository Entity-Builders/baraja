import { Navigate } from 'react-router-dom';

/**
 * AdminTuckBox — Redirects to AdminTemplates with tuck box mode.
 * The tuck box functionality is now integrated into the template editor.
 */
export default function AdminTuckBox() {
  return <Navigate to="/admin/templates" replace />;
}
