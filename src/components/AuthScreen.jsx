import React, { useState } from 'react';
import {
  Dumbbell,
  Lock,
  User,
  Globe,
  ShieldCheck,
  Sparkles,
  CheckCircle2,
  Scale,
} from 'lucide-react';
import { sha256Hex } from '../utils/workoutMath';

// SHA-256 hash of default master password (never stored in plain text in repository)
const MASTER_PASSWORD_SHA256 =
  '3eb3fe66b31e3b4d10fa70b5cad49c7112294af6ae4e476a1c405155d45aa121';

export default function AuthScreen({
  lang,
  setLang,
  unit,
  setUnit,
  t,
  accounts,
  onLoginSuccess,
  onRegisterAccount,
  buildTimestamp,
}) {
  const [mode, setMode] = useState('login'); // 'login' | 'register'
  const [name, setName] = useState('');
  const [identifier, setIdentifier] = useState('raydel');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [goal, setGoal] = useState('hypertrophy');
  const [preferredUnit, setPreferredUnit] = useState(unit || 'lbs');
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    if (e) e.preventDefault();
    setError('');

    const cleanId = identifier.trim().toLowerCase();
    const cleanPass = password.trim();

    if (!cleanPass) {
      setError(t.auth.errorEmpty);
      return;
    }

    const inputHash = await sha256Hex(cleanPass);

    if (mode === 'register') {
      if (!cleanId) {
        setError(t.auth.errorEmpty);
        return;
      }
      if (cleanPass !== confirmPassword.trim()) {
        setError(t.auth.errorPasswordMatch);
        return;
      }
      const existing = accounts.find(
        (acc) =>
          acc.identifier.toLowerCase() === cleanId ||
          acc.name.toLowerCase() === cleanId
      );
      if (existing) {
        setError(t.auth.errorAccountExists);
        return;
      }

      const newAccount = {
        id: `athlete-${Date.now()}`,
        name: name.trim() || identifier.trim().split('@')[0],
        identifier: identifier.trim(),
        passwordHash: inputHash,
        goal,
        preferredUnit,
        streak: 1,
        createdAt: new Date().toISOString(),
      };
      setUnit(preferredUnit);
      onRegisterAccount(newAccount);
    } else {
      const matched = accounts.find(
        (acc) =>
          (!cleanId ||
            acc.identifier.toLowerCase() === cleanId ||
            acc.name.toLowerCase() === cleanId) &&
          (acc.passwordHash === inputHash || acc.password === cleanPass)
      );

      if (matched) {
        if (matched.preferredUnit) setUnit(matched.preferredUnit);
        onLoginSuccess(matched);
      } else if (inputHash === MASTER_PASSWORD_SHA256) {
        const fallback = accounts[0];
        onLoginSuccess(fallback);
      } else {
        setError(t.auth.errorInvalidCreds);
      }
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      handleSubmit(e);
    }
  };

  return (
    <div className="auth-wrapper">
      <div className="auth-glow auth-glow-blue" />
      <div className="auth-glow auth-glow-emerald" />

      {/* Top Bar */}
      <div className="auth-topbar">
        <div className="private-access-pill">
          <ShieldCheck size={15} className="text-blue" />
          <span>{t.auth.privateAccessBadge}</span>
        </div>

        <div className="topbar-actions">
          <button
            type="button"
            className="pill-toggle-btn"
            onClick={() => setUnit(unit === 'lbs' ? 'kg' : 'lbs')}
            title="Toggle LBS / KG"
          >
            <Scale size={14} />
            <span>{unit.toUpperCase()}</span>
          </button>

          <button
            type="button"
            className="pill-toggle-btn"
            onClick={() => setLang(lang === 'es' ? 'en' : 'es')}
            title="Cambiar Idioma / Switch Language"
          >
            <Globe size={14} />
            <span>{lang === 'es' ? 'ES • English' : 'EN • Español'}</span>
          </button>
        </div>
      </div>

      <div className="auth-container">
        {/* Left Brand Column */}
        <div className="auth-brand-panel">
          <div className="brand-logo-row">
            <div className="brand-icon-box">
              <Dumbbell size={32} />
            </div>
            <div>
              <h1 className="brand-title">{t.appName}</h1>
              <p className="brand-subtitle">{t.tagline}</p>
            </div>
          </div>

          <div className="brand-feature-list">
            <div className="brand-feature-item">
              <span className="feature-dot blue" />
              <div>
                <strong>
                  {lang === 'es'
                    ? 'Registro en Vivo Estilo Hevy Pro'
                    : 'Hevy Pro-Style Live Workout Logger'}
                </strong>
                <p>
                  {lang === 'es'
                    ? 'Series normales, calentamiento (W), drop sets (D) y fallo (F), columna Anterior, RPE y cronómetro automático de descanso.'
                    : 'Track Normal, Warm-up (W), Drop (D) & Failure (F) sets, Previous performance, RPE, and auto rest timer.'}
                </p>
              </div>
            </div>

            <div className="brand-feature-item">
              <span className="feature-dot emerald" />
              <div>
                <strong>
                  {lang === 'es'
                    ? 'Mapa Muscular Anatómico y Detección de PRs 🏆'
                    : 'Anatomical Muscle Map & Live PR Detection 🏆'}
                </strong>
                <p>
                  {lang === 'es'
                    ? 'Más de 50 ejercicios con diagrama corporal frontal/posterior, cálculo de 1RM, volumen semanal y récords en tiempo real.'
                    : '50+ exercises with interactive front/back body heatmap, 1RM tracking, weekly volume charts, and real-time PR trophies.'}
                </p>
              </div>
            </div>

            <div className="brand-feature-item">
              <span className="feature-dot amber" />
              <div>
                <strong>
                  {lang === 'es'
                    ? 'Datos 100% Privados en tu Dispositivo + Gist Cifrado'
                    : '100% Private On-Device Data + Encrypted GitHub Sync'}
                </strong>
                <p>
                  {lang === 'es'
                    ? 'Tus entrenamientos nunca son públicos: viven en la memoria privada de tu iPhone y se sincronizan solo con tu Token personal.'
                    : 'Your workouts are never public: they stay in your device storage and sync privately via your personal token.'}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Right Strict Private Access Card */}
        <div className="auth-card">
          <div className="auth-tabs">
            <button
              type="button"
              className={`auth-tab ${mode === 'login' ? 'active' : ''}`}
              onClick={() => {
                setMode('login');
                setError('');
              }}
            >
              <Lock size={15} />
              <span>{t.auth.loginTab}</span>
            </button>
            <button
              type="button"
              className={`auth-tab ${mode === 'register' ? 'active' : ''}`}
              onClick={() => {
                setMode('register');
                setError('');
              }}
            >
              <User size={15} />
              <span>{t.auth.registerTab}</span>
            </button>
          </div>

          <div className="auth-card-header">
            <h2>
              {mode === 'login'
                ? t.auth.welcomeBack
                : t.auth.createYourAccount}
            </h2>
            <p>
              {mode === 'login'
                ? t.auth.subtitleLogin
                : t.auth.subtitleRegister}
            </p>
          </div>

          <form onSubmit={handleSubmit} className="auth-form">
            {mode === 'register' && (
              <div className="form-group">
                <label>{t.auth.nameLabel}</label>
                <div className="input-with-icon">
                  <User size={16} />
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder={t.auth.namePlaceholder}
                  />
                </div>
              </div>
            )}

            <div className="form-group">
              <label>{t.auth.emailLabel}</label>
              <div className="input-with-icon">
                <User size={16} />
                <input
                  type="text"
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder={t.auth.emailPlaceholder}
                />
              </div>
            </div>

            <div className="form-group">
              <label>{t.auth.passwordLabel}</label>
              <div className="input-with-icon">
                <Lock size={16} />
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder={t.auth.passwordPlaceholder}
                  autoFocus
                />
              </div>
            </div>

            {mode === 'register' && (
              <>
                <div className="form-group">
                  <label>{t.auth.confirmPasswordLabel}</label>
                  <div className="input-with-icon">
                    <CheckCircle2 size={16} />
                    <input
                      type="password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      onKeyDown={handleKeyDown}
                      placeholder={t.auth.confirmPasswordPlaceholder}
                    />
                  </div>
                </div>

                <div className="form-row-2">
                  <div className="form-group">
                    <label>{t.auth.goalLabel}</label>
                    <select
                      value={goal}
                      onChange={(e) => setGoal(e.target.value)}
                      onKeyDown={handleKeyDown}
                    >
                      <option value="hypertrophy">{t.auth.goalHypertrophy}</option>
                      <option value="strength">{t.auth.goalStrength}</option>
                      <option value="recomp">{t.auth.goalRecomp}</option>
                    </select>
                  </div>

                  <div className="form-group">
                    <label>{t.auth.unitLabel}</label>
                    <select
                      value={preferredUnit}
                      onChange={(e) => setPreferredUnit(e.target.value)}
                      onKeyDown={handleKeyDown}
                    >
                      <option value="lbs">LBS (Libras)</option>
                      <option value="kg">KG (Kilogramos)</option>
                    </select>
                  </div>
                </div>
              </>
            )}

            {error && <div className="auth-error-banner">{error}</div>}

            <button type="submit" className="auth-submit-btn">
              <Sparkles size={17} />
              <span>
                {mode === 'login'
                  ? t.auth.loginButton
                  : t.auth.registerButton}
              </span>
            </button>

            <div className="enter-key-hint">{t.auth.enterHint}</div>
          </form>
        </div>
      </div>

      {/* Global Rule Corner Timestamp */}
      <div className="corner-timestamp">
        {t.updatedPrefix} {buildTimestamp}
      </div>
    </div>
  );
}
