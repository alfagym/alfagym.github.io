const GIST_FILENAME = 'alfa-gym-cloud-sync.json';

export async function pushToGitHubGist({ token, gistId, payload }) {
  const cleanToken = (token || '').trim();
  if (!cleanToken) {
    throw new Error('Token de GitHub requerido / GitHub Token required');
  }

  const bodyObj = {
    description: 'Alfa Gym — Cloud Workout & Routine Sync Database',
    public: false,
    files: {
      [GIST_FILENAME]: {
        content: JSON.stringify(payload, null, 2),
      },
    },
  };

  const url = gistId
    ? `https://api.github.com/gists/${gistId.trim()}`
    : 'https://api.github.com/gists';

  const res = await fetch(url, {
    method: gistId ? 'PATCH' : 'POST',
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${cleanToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(bodyObj),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`GitHub Sync Error (${res.status}): ${errText.slice(0, 120)}`);
  }

  const data = await res.json();
  return {
    gistId: data.id,
    updatedAt: data.updated_at || new Date().toISOString(),
    htmlUrl: data.html_url,
  };
}

export async function pullFromGitHubGist({ token, gistId }) {
  const cleanToken = (token || '').trim();
  const cleanGistId = (gistId || '').trim();
  if (!cleanToken || !cleanGistId) {
    throw new Error('Se requiere Token y Gist ID para descargar / Token & Gist ID required');
  }

  const res = await fetch(`https://api.github.com/gists/${cleanGistId}`, {
    method: 'GET',
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${cleanToken}`,
    },
  });

  if (!res.ok) {
    throw new Error(`No se pudo leer el Gist (${res.status})`);
  }

  const data = await res.json();
  const fileObj =
    data.files?.[GIST_FILENAME] || Object.values(data.files || {})[0];

  if (!fileObj || !fileObj.content) {
    throw new Error('El Gist no contiene un archivo de respaldo válido de Alfa Gym.');
  }

  return JSON.parse(fileObj.content);
}

export function exportBackupJSON(payload) {
  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: 'application/json',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const datePart = new Date().toISOString().split('T')[0];
  a.href = url;
  a.download = `alfa-gym-backup-${datePart}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
