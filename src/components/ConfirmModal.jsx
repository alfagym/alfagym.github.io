import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, X } from 'lucide-react';

export default function ConfirmModal({
  open,
  title,
  message,
  confirmLabel = 'Confirmar',
  cancelLabel = 'Cancelar',
  danger = true,
  onConfirm,
  onCancel,
}) {
  useEffect(() => {
    if (!open) return undefined;
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        onCancel?.();
      }
    };
    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [open, onCancel]);

  if (!open || typeof document === 'undefined') return null;

  const handleSubmit = (e) => {
    e.preventDefault();
    e.stopPropagation();
    onConfirm?.();
  };

  const handleBackdropClick = (e) => {
    e.stopPropagation();
    if (e.target === e.currentTarget) {
      onCancel?.();
    }
  };

  return createPortal(
    <div
      className="alfa-confirm-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="alfa-confirm-title"
      onClick={handleBackdropClick}
    >
      <form
        className="alfa-confirm-dialog"
        onSubmit={handleSubmit}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="alfa-confirm-header">
          <div className={`alfa-confirm-icon ${danger ? 'is-danger' : 'is-primary'}`}>
            <AlertTriangle size={20} />
          </div>
          <h3 id="alfa-confirm-title" className="alfa-confirm-title">
            {title}
          </h3>
          <button
            type="button"
            className="alfa-confirm-close"
            onClick={(e) => {
              e.stopPropagation();
              onCancel?.();
            }}
            aria-label={cancelLabel}
          >
            <X size={16} />
          </button>
        </div>

        {message && <p className="alfa-confirm-message">{message}</p>}

        <div className="alfa-confirm-actions">
          <button
            type="button"
            className="alfa-confirm-btn alfa-confirm-btn--cancel"
            onClick={(e) => {
              e.stopPropagation();
              onCancel?.();
            }}
          >
            {cancelLabel}
          </button>
          <button
            type="submit"
            className={`alfa-confirm-btn ${
              danger ? 'alfa-confirm-btn--danger' : 'alfa-confirm-btn--primary'
            }`}
            autoFocus
          >
            {confirmLabel}
          </button>
        </div>
      </form>
    </div>,
    document.body
  );
}
