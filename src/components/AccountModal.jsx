import React, { useState } from 'react';
import {
  User,
  Lock,
  Check,
  X,
  Users,
  Scale,
  Target,
  Sparkles,
} from 'lucide-react';
import { sha256Hex } from '../utils/workoutMath';

export default function AccountModal({
  lang,
  t,
  currentUser,
  accounts,
  onSaveAccountChanges,
  onSwitchUser,
  onClose,
}) {
  const [name, setName] = useState(currentUser?.name || '');
  const [identifier, setIdentifier] = useState(currentUser?.identifier || '');
  const [newPassword, setNewPassword] = useState('');
  const [goal, setGoal] = useState(currentUser?.goal || 'hypertrophy');
  const [preferredUnit, setPreferredUnit] = useState(
    currentUser?.preferredUnit || 'lbs'
  );
  const [savedBanner, setSavedBanner] = useState(false);
  const [error, setError] = useState('');

  if (!currentUser) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    const cleanName = name.trim();
    const cleanId = identifier.trim().toLowerCase();

    if (!cleanName || !cleanId) {
      setError(
        lang === 'es'
          ? 'Por favor completa tu nombre y usuario.'
          : 'Please enter both name and username.'
      );
      return;
    }

    const collision = (accounts || []).find(
      (acc) =>
        acc.id !== currentUser.id &&
        acc.identifier.trim().toLowerCase() === cleanId
    );
    if (collision) {
      setError(
        lang === 'es'
          ? 'Ya existe otro usuario con ese identificador.'
          : 'Another user already uses that username.'
      );
      return;
    }

    let nextPasswordHash = currentUser.passwordHash;
    if (newPassword.trim()) {
      nextPasswordHash = await sha256Hex(newPassword.trim());
    }

    await onSaveAccountChanges({
      ...currentUser,
      name: cleanName,
      identifier: cleanId,
      passwordHash: nextPasswordHash,
      goal,
      preferredUnit,
    });

    setNewPassword('');
    setSavedBanner(true);
    setTimeout(() => {
      setSavedBanner(false);
      onClose();
    }, 900);
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal-panel account-modal-panel"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <div>
            <h3>
              <User size={18} className="text-blue inline-icon" />{' '}
              {lang === 'es'
                ? 'Editar Datos de la Cuenta'
                : 'Edit Account Profile'}
            </h3>
            <p className="modal-sub-hint">
              {lang === 'es'
                ? 'Personaliza tu nombre, usuario, contraseña, unidades o cambia de atleta.'
                : 'Customize your name, username, password, units, or switch athlete.'}
            </p>
          </div>
          <button
            type="button"
            className="modal-close-btn"
            onClick={onClose}
          >
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="account-edit-form">
          <div className="form-group">
            <label>{t.auth.nameLabel}</label>
            <div className="input-with-icon">
              <User size={16} />
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ej. Raydel / Lorena Santana"
                required
              />
            </div>
          </div>

          <div className="form-group">
            <label>{t.auth.emailLabel}</label>
            <div className="input-with-icon">
              <User size={16} />
              <input
                type="text"
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                placeholder="Ej. raydel / lorena"
                required
              />
            </div>
          </div>

          <div className="form-group">
            <label>
              {lang === 'es'
                ? 'Nueva Contraseña (dejar vacío para mantener la actual)'
                : 'New Password (leave blank to keep current)'}
            </label>
            <div className="input-with-icon">
              <Lock size={16} />
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="••••••••"
              />
            </div>
          </div>

          <div className="form-row-2">
            <div className="form-group">
              <label>
                <Target size={13} className="inline-icon" /> {t.auth.goalLabel}
              </label>
              <select value={goal} onChange={(e) => setGoal(e.target.value)}>
                <option value="hypertrophy">{t.auth.goalHypertrophy}</option>
                <option value="strength">{t.auth.goalStrength}</option>
                <option value="recomp">{t.auth.goalRecomp}</option>
              </select>
            </div>

            <div className="form-group">
              <label>
                <Scale size={13} className="inline-icon" /> {t.auth.unitLabel}
              </label>
              <select
                value={preferredUnit}
                onChange={(e) => setPreferredUnit(e.target.value)}
              >
                <option value="lbs">LBS (Libras)</option>
                <option value="kg">KG (Kilogramos)</option>
              </select>
            </div>
          </div>

          {error && <div className="auth-error-banner">{error}</div>}

          {savedBanner && (
            <div className="sync-success-banner">
              <Check size={16} />
              <span>
                {lang === 'es'
                  ? '¡Datos de cuenta actualizados!'
                  : 'Account profile updated!'}
              </span>
            </div>
          )}

          <button type="submit" className="primary-btn full-width mt-12">
            <Check size={18} />
            <span>
              {lang === 'es'
                ? 'Guardar Cambios de Cuenta'
                : 'Save Account Changes'}
            </span>
          </button>
        </form>

        {/* Quick Switch Between Profiles (Raydel, Lorena Santana, etc.) */}
        {(accounts || []).length > 1 && (
          <div className="account-switcher-section">
            <h4>
              <Users size={15} className="text-blue" />{' '}
              {lang === 'es'
                ? 'Cambiar de Usuario / Atleta'
                : 'Switch Athlete Profile'}
            </h4>
            <div className="account-switcher-list">
              {accounts.map((acc) => {
                const isCurrent = acc.id === currentUser.id;
                return (
                  <button
                    key={acc.id}
                    type="button"
                    className={`account-switch-pill ${isCurrent ? 'active' : ''}`}
                    onClick={() => {
                      if (!isCurrent && onSwitchUser) {
                        onSwitchUser(acc);
                        onClose();
                      }
                    }}
                  >
                    <div className="acc-switch-left">
                      <span className="acc-avatar-circle">
                        {(acc.name || 'A').charAt(0).toUpperCase()}
                      </span>
                      <div>
                        <strong>{acc.name}</strong>
                        <span className="acc-id-sub">@{acc.identifier}</span>
                      </div>
                    </div>
                    {isCurrent ? (
                      <span className="acc-active-tag">
                        <Sparkles size={12} />{' '}
                        {lang === 'es' ? 'Activo' : 'Active'}
                      </span>
                    ) : (
                      <span className="acc-switch-cta">
                        {lang === 'es' ? 'Cambiar →' : 'Switch →'}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
