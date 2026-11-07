import React, { useState, useMemo } from 'react';
import {
  FolderKanban,
  Play,
  Plus,
  Edit3,
  Copy,
  Trash2,
  X,
  Check,
  Search,
  Dumbbell,
} from 'lucide-react';
import { formatWeightValue, toLbs } from '../utils/workoutMath';

export default function RoutinesView({
  lang,
  unit,
  t,
  routines,
  setRoutines,
  exercisesLibrary,
  onStartRoutineWorkout,
}) {
  const [selectedFolder, setSelectedFolder] = useState('all');
  const [editingRoutine, setEditingRoutine] = useState(null);
  const [exSearch, setExSearch] = useState('');

  const exerciseMap = useMemo(() => {
    const m = {};
    for (const ex of exercisesLibrary) m[ex.id] = ex;
    return m;
  }, [exercisesLibrary]);

  const getExName = (ex) => {
    if (!ex) return 'Ejercicio';
    return lang === 'es' ? ex.nameEs || ex.nameEn : ex.nameEn || ex.nameEs;
  };

  const folders = [
    { id: 'all', label: t.routines.folderAll },
    { id: 'ppl', label: t.routines.folderPPL },
    { id: 'upperlower', label: t.routines.folderUpperLower },
    { id: 'fullbody', label: t.routines.folderFullBody },
    { id: 'custom', label: t.routines.folderCustom },
  ];

  const filteredRoutines = useMemo(() => {
    if (selectedFolder === 'all') return routines;
    return routines.filter((r) => r.folder === selectedFolder);
  }, [routines, selectedFolder]);

  const handleOpenNewRoutine = () => {
    setEditingRoutine({
      id: null,
      name: '',
      folder: 'custom',
      notes: '',
      exercises: [
        {
          exerciseId: 'bench-press-barbell',
          restSeconds: 120,
          note: '',
          sets: [
            { type: 'normal', weight: 135, reps: 10, rpe: 8 },
            { type: 'normal', weight: 155, reps: 8, rpe: 8.5 },
            { type: 'normal', weight: 155, reps: 8, rpe: 9 },
          ],
        },
      ],
    });
  };

  const handleDuplicateRoutine = (rt) => {
    const copy = {
      ...rt,
      id: `rt-${Date.now()}`,
      name: `${rt.name} (Copia)`,
      folder: 'custom',
    };
    setRoutines((prev) => [copy, ...prev]);
  };

  const handleDeleteRoutine = (rtId) => {
    setRoutines((prev) => prev.filter((r) => r.id !== rtId));
  };

  const handleSaveRoutine = (e) => {
    e.preventDefault();
    if (!editingRoutine) return;
    const cleanName =
      editingRoutine.name.trim() ||
      (lang === 'es' ? 'Nueva Rutina Alfa' : 'New Alfa Routine');

    if (editingRoutine.id) {
      setRoutines((prev) =>
        prev.map((r) =>
          r.id === editingRoutine.id
            ? { ...editingRoutine, name: cleanName }
            : r
        )
      );
    } else {
      const created = {
        ...editingRoutine,
        id: `rt-${Date.now()}`,
        name: cleanName,
      };
      setRoutines((prev) => [created, ...prev]);
    }
    setEditingRoutine(null);
  };

  const handleAddExToRoutineDraft = (exId) => {
    setEditingRoutine((prev) => ({
      ...prev,
      exercises: [
        ...(prev.exercises || []),
        {
          exerciseId: exId,
          restSeconds: 90,
          note: '',
          sets: [
            { type: 'normal', weight: 95, reps: 10, rpe: 8 },
            { type: 'normal', weight: 95, reps: 10, rpe: 8.5 },
            { type: 'normal', weight: 95, reps: 10, rpe: 9 },
          ],
        },
      ],
    }));
  };

  return (
    <div className="section-container">
      {/* Section Header */}
      <div className="section-top-header">
        <div>
          <h2>
            <FolderKanban size={22} className="text-blue" /> {t.routines.title}
          </h2>
          <p className="section-subtitle">{t.routines.subtitle}</p>
        </div>

        <button
          type="button"
          className="primary-btn"
          onClick={handleOpenNewRoutine}
        >
          <Plus size={18} />
          <span>{t.routines.newRoutineBtn}</span>
        </button>
      </div>

      {/* Folder Tabs */}
      <div className="muscle-filter-chips-scroll mb-18">
        {folders.map((f) => (
          <button
            key={f.id}
            type="button"
            className={`filter-chip ${selectedFolder === f.id ? 'active' : ''}`}
            onClick={() => setSelectedFolder(f.id)}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Routines Grid */}
      <div className="routines-cards-grid">
        {filteredRoutines.map((rt) => {
          const totalSets = (rt.exercises || []).reduce(
            (acc, e) => acc + (e.sets?.length || 0),
            0
          );
          return (
            <div key={rt.id} className="routine-full-card">
              <div className="routine-card-header">
                <div>
                  <span className="folder-tag">
                    {folders.find((f) => f.id === rt.folder)?.label ||
                      t.routines.folderCustom}
                  </span>
                  <h3>{rt.name}</h3>
                </div>
                <div className="routine-icon-actions">
                  <button
                    type="button"
                    className="icon-btn-subtle"
                    onClick={() =>
                      setEditingRoutine(JSON.parse(JSON.stringify(rt)))
                    }
                    title={t.routines.editBtn}
                  >
                    <Edit3 size={15} />
                  </button>
                  <button
                    type="button"
                    className="icon-btn-subtle"
                    onClick={() => handleDuplicateRoutine(rt)}
                    title={t.routines.duplicateBtn}
                  >
                    <Copy size={15} />
                  </button>
                  <button
                    type="button"
                    className="icon-btn-subtle danger"
                    onClick={() => handleDeleteRoutine(rt.id)}
                    title={t.routines.deleteBtn}
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              </div>

              {rt.notes && <p className="routine-card-notes">{rt.notes}</p>}

              <div className="routine-ex-breakdown">
                {(rt.exercises || []).map((exItem, idx) => {
                  const exObj = exerciseMap[exItem.exerciseId];
                  const topSet = exItem.sets?.[exItem.sets.length - 1];
                  return (
                    <div key={idx} className="routine-ex-line">
                      <span className="routine-ex-name">
                        <strong>{exItem.sets?.length || 3}×</strong>{' '}
                        {getExName(exObj)}
                      </span>
                      {topSet && (
                        <span className="routine-ex-target">
                          {formatWeightValue(topSet.weight, unit)} {unit} ×{' '}
                          {topSet.reps}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>

              <div className="routine-card-footer">
                <span className="routine-stats-text">
                  <Dumbbell size={14} /> {rt.exercises?.length || 0}{' '}
                  {t.routines.exercisesCount} • {totalSets}{' '}
                  {t.routines.setsCount}
                </span>

                <button
                  type="button"
                  className="routine-launch-btn"
                  onClick={() => onStartRoutineWorkout(rt)}
                >
                  <Play size={15} fill="currentColor" />
                  <span>{t.routines.startRoutineBtn}</span>
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Routine Builder / Editor Modal */}
      {editingRoutine && (
        <div
          className="modal-backdrop"
          onClick={() => setEditingRoutine(null)}
        >
          <div
            className="modal-panel modal-large"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-header">
              <h3>
                {editingRoutine.id
                  ? t.routines.modalEditTitle
                  : t.routines.modalCreateTitle}
              </h3>
              <button
                type="button"
                className="modal-close-btn"
                onClick={() => setEditingRoutine(null)}
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSaveRoutine} className="routine-editor-form">
              <div className="form-row-2">
                <div className="form-group">
                  <label>{t.routines.routineNameLabel}</label>
                  <input
                    type="text"
                    value={editingRoutine.name}
                    onChange={(e) =>
                      setEditingRoutine({
                        ...editingRoutine,
                        name: e.target.value,
                      })
                    }
                    placeholder="Ej. Push B — Hipertrofia Pecho"
                    required
                  />
                </div>
                <div className="form-group">
                  <label>{t.routines.routineFolderLabel}</label>
                  <select
                    value={editingRoutine.folder || 'custom'}
                    onChange={(e) =>
                      setEditingRoutine({
                        ...editingRoutine,
                        folder: e.target.value,
                      })
                    }
                  >
                    <option value="ppl">{t.routines.folderPPL}</option>
                    <option value="upperlower">
                      {t.routines.folderUpperLower}
                    </option>
                    <option value="fullbody">{t.routines.folderFullBody}</option>
                    <option value="custom">{t.routines.folderCustom}</option>
                  </select>
                </div>
              </div>

              <div className="form-group">
                <label>{t.routines.routineNotesLabel}</label>
                <input
                  type="text"
                  value={editingRoutine.notes || ''}
                  onChange={(e) =>
                    setEditingRoutine({
                      ...editingRoutine,
                      notes: e.target.value,
                    })
                  }
                  placeholder="Notas del programa..."
                />
              </div>

              {/* Exercises inside Routine */}
              <div className="routine-editor-ex-list">
                {(editingRoutine.exercises || []).map((exItem, exIdx) => {
                  const exObj = exerciseMap[exItem.exerciseId];
                  return (
                    <div key={exIdx} className="routine-draft-ex-box">
                      <div className="draft-ex-header">
                        <strong>
                          {exIdx + 1}. {getExName(exObj)}
                        </strong>
                        <button
                          type="button"
                          className="icon-btn-subtle danger"
                          onClick={() => {
                            const next = editingRoutine.exercises.filter(
                              (_, i) => i !== exIdx
                            );
                            setEditingRoutine({
                              ...editingRoutine,
                              exercises: next,
                            });
                          }}
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>

                      <div className="draft-sets-mini-grid">
                        {(exItem.sets || []).map((s, sIdx) => (
                          <div key={sIdx} className="draft-set-pill-row">
                            <span className="draft-set-num">#{sIdx + 1}</span>
                            <input
                              type="number"
                              value={formatWeightValue(s.weight, unit)}
                              onChange={(e) => {
                                const nextExs = [...editingRoutine.exercises];
                                const nextSets = [...nextExs[exIdx].sets];
                                nextSets[sIdx] = {
                                  ...nextSets[sIdx],
                                  weight: toLbs(e.target.value, unit),
                                };
                                nextExs[exIdx] = {
                                  ...nextExs[exIdx],
                                  sets: nextSets,
                                };
                                setEditingRoutine({
                                  ...editingRoutine,
                                  exercises: nextExs,
                                });
                              }}
                            />
                            <span>{unit} ×</span>
                            <input
                              type="number"
                              value={s.reps}
                              onChange={(e) => {
                                const nextExs = [...editingRoutine.exercises];
                                const nextSets = [...nextExs[exIdx].sets];
                                nextSets[sIdx] = {
                                  ...nextSets[sIdx],
                                  reps: Number(e.target.value),
                                };
                                nextExs[exIdx] = {
                                  ...nextExs[exIdx],
                                  sets: nextSets,
                                };
                                setEditingRoutine({
                                  ...editingRoutine,
                                  exercises: nextExs,
                                });
                              }}
                            />
                            <span>reps</span>
                          </div>
                        ))}
                        <button
                          type="button"
                          className="mini-add-set-btn"
                          onClick={() => {
                            const nextExs = [...editingRoutine.exercises];
                            const last =
                              nextExs[exIdx].sets[
                                nextExs[exIdx].sets.length - 1
                              ] || { weight: 95, reps: 10 };
                            nextExs[exIdx] = {
                              ...nextExs[exIdx],
                              sets: [
                                ...nextExs[exIdx].sets,
                                { ...last, type: 'normal' },
                              ],
                            };
                            setEditingRoutine({
                              ...editingRoutine,
                              exercises: nextExs,
                            });
                          }}
                        >
                          + Serie
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Quick Picker to Add Exercise to Routine */}
              <div className="routine-add-ex-picker">
                <div className="modal-search-bar">
                  <Search size={15} />
                  <input
                    type="text"
                    value={exSearch}
                    onChange={(e) => setExSearch(e.target.value)}
                    placeholder={t.exercises.searchPlaceholder}
                  />
                </div>
                <div className="routine-picker-chips">
                  {exercisesLibrary
                    .filter((ex) => {
                      const q = exSearch.trim().toLowerCase();
                      return (
                        !q ||
                        ex.nameEs.toLowerCase().includes(q) ||
                        ex.nameEn.toLowerCase().includes(q)
                      );
                    })
                    .slice(0, 12)
                    .map((ex) => (
                      <button
                        key={ex.id}
                        type="button"
                        className="picker-ex-chip"
                        onClick={() => handleAddExToRoutineDraft(ex.id)}
                      >
                        <Plus size={13} />
                        <span>{getExName(ex)}</span>
                      </button>
                    ))}
                </div>
              </div>

              <button type="submit" className="primary-btn full-width mt-16">
                <Check size={18} />
                <span>{t.routines.saveRoutineBtn}</span>
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
