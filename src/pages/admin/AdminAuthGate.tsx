import { useEffect, useState, type FormEvent, type ReactNode } from 'react';

type AdminAuthStatus = 'checking' | 'anonymous' | 'authenticated';

interface AdminSessionResponse {
  authenticated?: boolean;
  error?: string;
}

export default function AdminAuthGate({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AdminAuthStatus>('checking');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function checkSession() {
      try {
        const response = await fetch('/api/admin/session', {
          credentials: 'include',
          headers: { Accept: 'application/json' },
        });
        const data = await response.json() as AdminSessionResponse;
        if (cancelled) return;
        setStatus(data.authenticated ? 'authenticated' : 'anonymous');
      } catch {
        if (cancelled) return;
        setStatus('anonymous');
        setMessage('No se pudo verificar la sesión de admin.');
      }
    }

    void checkSession();

    return () => {
      cancelled = true;
    };
  }, []);

  async function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage('');

    try {
      const response = await fetch('/api/admin/login', {
        method: 'POST',
        credentials: 'include',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email, password }),
      });

      const data = await response.json().catch(() => ({})) as AdminSessionResponse;

      if (!response.ok || !data.authenticated) {
        setMessage(data.error || 'Credenciales inválidas.');
        setStatus('anonymous');
        return;
      }

      setPassword('');
      setStatus('authenticated');
    } catch {
      setMessage('No se pudo iniciar sesión. Probá de nuevo.');
      setStatus('anonymous');
    } finally {
      setBusy(false);
    }
  }

  async function handleLogout() {
    setBusy(true);
    try {
      await fetch('/api/admin/logout', {
        method: 'POST',
        credentials: 'include',
        headers: { Accept: 'application/json' },
      });
    } finally {
      setPassword('');
      setStatus('anonymous');
      setBusy(false);
    }
  }

  if (status === 'authenticated') {
    return (
      <>
        <button
          className="admin-logout-button"
          type="button"
          onClick={handleLogout}
          disabled={busy}
        >
          Salir
        </button>
        {children}
      </>
    );
  }

  return (
    <main className="admin-login-shell">
      <form className="admin-login-card" onSubmit={handleLogin}>
        <p className="admin-login-kicker">Baraja Admin</p>
        <h1>{status === 'checking' ? 'Verificando sesión' : 'Acceso privado'}</h1>
        <label>
          <span>Email</span>
          <input
            autoComplete="username"
            disabled={status === 'checking' || busy}
            onChange={(event) => setEmail(event.currentTarget.value)}
            placeholder="tu@email.com"
            required
            type="email"
            value={email}
          />
        </label>
        <label>
          <span>Clave</span>
          <input
            autoComplete="current-password"
            disabled={status === 'checking' || busy}
            onChange={(event) => setPassword(event.currentTarget.value)}
            required
            type="password"
            value={password}
          />
        </label>
        {message && <p className="admin-login-error">{message}</p>}
        <button
          className="btn-primary"
          disabled={status === 'checking' || busy}
          type="submit"
        >
          {busy ? 'Entrando' : 'Entrar'}
        </button>
      </form>
    </main>
  );
}
