import { Navigate, useParams } from 'react-router-dom';

/**
 * AdminTuckBox — legacy shortcut into the deck Studio's global design tools.
 */
export default function AdminTuckBox() {
  const { deckId } = useParams();
  const target = deckId ? `/admin/${encodeURIComponent(deckId)}?studio=design&tool=tuckbox` : '/admin';
  return <Navigate to={target} replace />;
}
