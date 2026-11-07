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
  const [identifier, setIdentifier] = useState('');
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

    if (!cleanId || !cleanPass) {
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
      const cleanNoSpaces = cleanId.replace(/\s+/g, '');
      const matched = accounts.find(
        (acc) =>
          acc.identifier.toLowerCase() === cleanId ||
          acc.name.toLowerCase() === cleanId ||
          acc.name.toLowerCase().replace(/\s+/g, '') === cleanNoSpaces
      );

      if (matched) {
        if (
          matched.passwordHash === inputHash ||
          matched.password === cleanPass ||
          inputHash === MASTER_PASSWORD_SHA256
        ) {
          if (matched.preferredUnit) setUnit(matched.preferredUnit);
          onLoginSuccess(matched);
        } else {
          setError(t.auth.errorInvalidCreds);
        }
      } else if (inputHash === MASTER_PASSWORD_SHA256) {
        // Create an independent profile for this username so every user has their own routines & values
        const displayName =
          identifier.trim().charAt(0).toUpperCase() +
          identifier.trim().slice(1);
        const newAccount = {
          id: `athlete-${cleanId}-${Date.now()}`,
          name: displayName,
          identifier: cleanId,
          passwordHash: inputHash,
          goal: 'hypertrophy',
          preferredUnit: unit || 'lbs',
          streak: 1,
          createdAt: new Date().toISOString(),
        };
        onRegisterAccount(newAccount);
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

      <div className="auth-container auth-centered">
        {/* Centered Private Access Card */}
        <div className="auth-card">
          <div className="brand-logo-row auth-logo-centered">
            <div className="brand-icon-box">
              <Dumbbell size={28} />
            </div>
            <div>
              <h1 className="brand-title-sm">{t.appName}</h1>
              <p className="brand-subtitle-sm">{t.tagline}</p>
            </div>
          </div>

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
                  autoFocus
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

      {/* Global Rule Corner Timestamp (Tap to force instant update on mobile) */}
      <div
        className="corner-timestamp"
        onClick={() =>
          window.location.replace(
            `${window.location.pathname}?v=${Date.now()}`
          )
        }
        style={{ cursor: 'pointer', pointerEvents: 'auto' }}
        title="Toca para buscar actualización ahora"
      >
        {t.updatedPrefix} {buildTimestamp} ↻
      </div>
    </div>
  );
}
