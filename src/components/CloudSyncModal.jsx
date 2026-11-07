import React, { useState, useRef } from 'react';
import {
  Cloud,
  UploadCloud,
  DownloadCloud,
  FileDown,
  FileUp,
  CheckCircle2,
  AlertCircle,
  X,
} from 'lucide-react';
import {
  pushToGitHubGist,
  pullFromGitHubGist,
  exportBackupJSON,
} from '../utils/githubSync';

export default function CloudSyncModal({
  lang,
  t,
  cloudConfig,
  setCloudConfig,
  fullPayload,
  onRestorePayload,
  onClose,
}) {
  const [token, setToken] = useState(cloudConfig.token || '');
  const [gistId, setGistId] = useState(cloudConfig.gistId || '');
  const [autoSync, setAutoSync] = useState(Boolean(cloudConfig.autoSync));
  const [statusMsg, setStatusMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [loading, setLoading] = useState(false);
  const fileInputRef = useRef(null);

  const saveConfig = (nextPartial = {}) => {
    const updated = {
      ...cloudConfig,
      token: token.trim(),
      gistId: gistId.trim(),
      autoSync,
      ...nextPartial,
    };
    setCloudConfig(updated);
    return updated;
  };

  const handlePushGitHub = async () => {
    setErrorMsg('');
    setStatusMsg('');
    setLoading(true);
    try {
      const result = await pushToGitHubGist({
        token,
        gistId,
        payload: fullPayload,
      });
      setGistId(result.gistId);
      saveConfig({
        gistId: result.gistId,
        lastSynced: result.updatedAt,
      });
      setStatusMsg(
        lang === 'es'
          ? `¡Datos sincronizados con éxito en GitHub Gist (${result.gistId.slice(0, 8)}...)!`
          : `Successfully pushed data to GitHub Gist (${result.gistId.slice(0, 8)}...)!`
      );
    } catch (err) {
      setErrorMsg(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handlePullGitHub = async () => {
    setErrorMsg('');
    setStatusMsg('');
    setLoading(true);
    try {
      const data = await pullFromGitHubGist({ token, gistId });
      onRestorePayload(data);
      saveConfig({ lastSynced: new Date().toISOString() });
      setStatusMsg(
        lang === 'es'
          ? '¡Datos descargados y restaurados desde GitHub correctamente!'
          : 'Successfully pulled and restored data from GitHub!'
      );
    } catch (err) {
      setErrorMsg(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleImportFile = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const parsed = JSON.parse(evt.target.result);
        onRestorePayload(parsed);
        setStatusMsg(
          lang === 'es'
            ? '¡Respaldo JSON importado con éxito!'
            : 'JSON Backup imported successfully!'
        );
      } catch {
        setErrorMsg(
          lang === 'es'
            ? 'El archivo seleccionado no es un JSON válido.'
            : 'Invalid JSON backup file.'
        );
      }
    };
    reader.readAsText(file);
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-panel" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>
            <Cloud size={20} className="text-blue" /> {t.cloud.title}
          </h3>
          <button type="button" className="modal-close-btn" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        <p className="card-helper-text mb-12">{t.cloud.subtitle}</p>

        <div className="auth-form">
          <div className="form-group">
            <label>{t.cloud.tokenLabel}</label>
            <input
              type="password"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              onBlur={() => saveConfig()}
              placeholder="ghp_xxxxxxxxxxxxxxxxxxxxxx"
            />
          </div>

          <div className="form-group">
            <label>{t.cloud.gistIdLabel}</label>
            <input
              type="text"
              value={gistId}
              onChange={(e) => setGistId(e.target.value)}
              onBlur={() => saveConfig()}
              placeholder={
                lang === 'es'
                  ? 'Se generará automáticamente al subir por primera vez'
                  : 'Auto-generated on first push'
              }
            />
          </div>

          <label className="checkbox-row">
            <input
              type="checkbox"
              checked={autoSync}
              onChange={(e) => {
                setAutoSync(e.target.checked);
                saveConfig({ autoSync: e.target.checked });
              }}
            />
            <span>{t.cloud.autoSyncLabel}</span>
          </label>

          {cloudConfig.lastSynced && (
            <div className="sync-timestamp-badge">
              {t.cloud.lastSynced}{' '}
              <strong>
                {new Date(cloudConfig.lastSynced).toLocaleString()}
              </strong>
            </div>
          )}

          {statusMsg && (
            <div className="sync-success-banner">
              <CheckCircle2 size={16} />
              <span>{statusMsg}</span>
            </div>
          )}

          {errorMsg && (
            <div className="auth-error-banner">
              <AlertCircle size={16} />
              <span>{errorMsg}</span>
            </div>
          )}

          <div className="form-row-2 mt-12">
            <button
              type="button"
              className="primary-btn"
              disabled={loading}
              onClick={handlePushGitHub}
            >
              <UploadCloud size={17} />
              <span>{t.cloud.pushBtn}</span>
            </button>

            <button
              type="button"
              className="secondary-btn"
              disabled={loading}
              onClick={handlePullGitHub}
            >
              <DownloadCloud size={17} />
              <span>{t.cloud.pullBtn}</span>
            </button>
          </div>

          <div className="auth-divider">
            <span>JSON BACKUP</span>
          </div>

          <div className="form-row-2">
            <button
              type="button"
              className="secondary-btn"
              onClick={() => exportBackupJSON(fullPayload)}
            >
              <FileDown size={16} />
              <span>{t.cloud.exportJsonBtn}</span>
            </button>

            <button
              type="button"
              className="secondary-btn"
              onClick={() => fileInputRef.current?.click()}
            >
              <FileUp size={16} />
              <span>{t.cloud.importJsonBtn}</span>
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".json"
              style={{ display: 'none' }}
              onChange={handleImportFile}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
