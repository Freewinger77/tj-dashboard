import { useEffect, useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { fetchAuthMe } from '../lib/api.js';
import LoginPage from '../pages/Login.jsx';

export default function AuthGate({ children }) {
  const location = useLocation();
  const [state, setState] = useState({ loading: true, user: null });

  const refresh = async () => {
    try {
      const me = await fetchAuthMe();
      setState({ loading: false, user: me.user || null });
    } catch {
      setState({ loading: false, user: null });
    }
  };

  useEffect(() => {
    refresh();
  }, []);

  if (state.loading) {
    return (
      <div
        style={{
          minHeight: '100dvh',
          display: 'grid',
          placeItems: 'center',
          background: '#fff',
          color: 'rgba(0,0,0,.4)',
          fontSize: 13,
        }}
      >
        Loading…
      </div>
    );
  }

  if (!state.user) {
    if (location.pathname !== '/login') {
      return <Navigate to="/login" replace state={{ from: location.pathname }} />;
    }
    return <LoginPage onAuthed={(user) => setState({ loading: false, user })} />;
  }

  if (location.pathname === '/login') {
    return <Navigate to="/" replace />;
  }

  return children;
}
