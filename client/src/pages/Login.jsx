import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { login } from '../lib/api.js';

const COPY = {
  en: {
    deskName: 'WhatsApp Lead Desk',
    pitch: 'View your <em>inspections</em> campaign performance in one place.',
    campaign: 'TJ Katsastus · due soon & passed',
    internal: 'Internal tool. Authorised users only.',
    title: 'Sign in',
    lede: 'Use the shared desk account.',
    username: 'Username',
    password: 'Password',
    show: 'Show',
    hide: 'Hide',
    signIn: 'Sign in',
    signingIn: 'Signing in…',
    missing: 'Enter your username and password.',
    wrong: 'Incorrect username or password.',
    caps: 'Caps Lock is on',
  },
  fi: {
    deskName: 'WhatsApp-työpöytä',
    pitch: 'Katso <em>katsastus</em>-kampanjan tulokset yhdessä paikassa.',
    campaign: 'TJ Katsastus · erääntyy pian & ohitettu',
    internal: 'Sisäinen työkalu. Vain valtuutetut käyttäjät.',
    title: 'Kirjaudu',
    lede: 'Käytä jaettua työpöytätiliä.',
    username: 'Käyttäjätunnus',
    password: 'Salasana',
    show: 'Näytä',
    hide: 'Piilota',
    signIn: 'Kirjaudu',
    signingIn: 'Kirjaudutaan…',
    missing: 'Anna käyttäjätunnus ja salasana.',
    wrong: 'Väärä käyttäjätunnus tai salasana.',
    caps: 'Caps Lock on päällä',
  },
};

export default function LoginPage({ onAuthed }) {
  const navigate = useNavigate();
  const [lang, setLang] = useState(() => localStorage.getItem('tj-login-lang') || 'en');
  const t = useMemo(() => COPY[lang] || COPY.en, [lang]);
  const [username, setUsername] = useState(() => localStorage.getItem('tj-login-user') || '');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [caps, setCaps] = useState(false);

  useEffect(() => {
    localStorage.setItem('tj-login-lang', lang);
  }, [lang]);

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    if (!username.trim() || !password) {
      setError(t.missing);
      return;
    }
    setBusy(true);
    try {
      await login(username.trim(), password);
      localStorage.setItem('tj-login-user', username.trim());
      onAuthed?.(username.trim());
      navigate('/', { replace: true });
    } catch {
      setError(t.wrong);
      setPassword('');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="tj-login-app">
      <aside className="tj-login-aside">
        <div className="tj-login-wordmark">
          <b>TJ KATSASTUS</b>
          <span>{t.deskName}</span>
        </div>
        <div className="tj-login-grow" />
        <div className="tj-login-pitch" dangerouslySetInnerHTML={{ __html: t.pitch }} />
        <div className="tj-login-campaign">
          <span className="tj-login-dot" />
          <span>{t.campaign}</span>
        </div>
        <div className="tj-login-grow" />
        <div className="tj-login-foot">{t.internal}</div>
      </aside>

      <main className="tj-login-main">
        <div className="tj-login-main-top">
          <div className="tj-login-langs">
            <button type="button" aria-pressed={lang === 'en'} onClick={() => setLang('en')}>
              EN
            </button>
            <button type="button" aria-pressed={lang === 'fi'} onClick={() => setLang('fi')}>
              FI
            </button>
          </div>
        </div>

        <div className="tj-login-panel">
          <h1>{t.title}</h1>
          <div className="tj-login-lede">{t.lede}</div>

          <form onSubmit={submit} noValidate>
            <div className="tj-login-field">
              <label htmlFor="user">{t.username}</label>
              <div className="tj-login-control">
                <input
                  id="user"
                  name="username"
                  type="text"
                  autoComplete="username"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  value={username}
                  onChange={(e) => {
                    setUsername(e.target.value);
                    setError('');
                  }}
                  aria-invalid={Boolean(error) && !username.trim()}
                  required
                />
              </div>
            </div>

            <div className="tj-login-field">
              <label htmlFor="password">{t.password}</label>
              <div className="tj-login-control tj-login-has-toggle">
                <input
                  id="password"
                  name="password"
                  type={showPw ? 'text' : 'password'}
                  autoComplete="current-password"
                  enterKeyHint="go"
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    setError('');
                  }}
                  onKeyUp={(e) => setCaps(e.getModifierState?.('CapsLock') || false)}
                  onBlur={() => setCaps(false)}
                  aria-invalid={Boolean(error)}
                  required
                />
                <button
                  className="tj-login-peek"
                  type="button"
                  aria-pressed={showPw}
                  aria-controls="password"
                  onClick={() => setShowPw((v) => !v)}
                >
                  {showPw ? t.hide : t.show}
                </button>
              </div>
              {caps && <div className="tj-login-hint">{t.caps}</div>}
            </div>

            <button className="tj-login-submit" type="submit" disabled={busy} data-busy={busy}>
              <span className="tj-login-spinner" aria-hidden="true" />
              <span>{busy ? t.signingIn : t.signIn}</span>
            </button>
          </form>

          <div className="tj-login-note" data-shown={Boolean(error)}>
            {error ? (
              <div className="tj-login-error" role="alert">
                {error}
              </div>
            ) : null}
          </div>
        </div>
      </main>
    </div>
  );
}
