import React, { useState, useMemo, useEffect } from 'react';
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
  ArrowUp,
  ArrowDown,
  Timer,
  FileText,
  RotateCcw,
  Sparkles,
  GripVertical,
  ChevronDown,
} from 'lucide-react';
import { formatWeightValue, toLbs } from '../utils/workoutMath';
import {
  useLongPressReorder,
  DragFollowerPortal,
  createExerciseUid,
  ensureExercisesUids,
  stripExerciseUid,
  getExerciseItemKey,
} from '../hooks/useLongPressReorder';
import ExerciseMediaModal from './ExerciseMediaModal';

const SET_TYPE_ORDER = ['normal', 'warmup', 'dropset', 'failure'];

const MUSCLE_KEYS = [
  'all',
  'chest',
  'back',
  'shoulders',
  'quads',
  'hamstrings',
  'glutes',
  'biceps',
  'triceps',
  'forearms',
  'abs',
  'traps',
  'calves',
  'cardio',
];

const EQUIP_KEYS = [
  'barbell',
  'dumbbell',
  'machine',
  'cable',
  'smith',
  'bodyweight',
  'kettlebell',
  'ezbar',
];

export default function RoutinesView({
  lang,
  unit,
  t,
  routines,
  setRoutines,
  exercisesLibrary,
  onAddCustomExercise,
  onStartRoutineWorkout,
  initialEditingRoutineId,
  onClearInitialEditingRoutine,
  onResetDefaultRoutines,
}) {
  const [selectedFolder, setSelectedFolder] = useState('all');
  const [editingRoutine, setEditingRoutine] = useState(null);
  const [previewExercise, setPreviewExercise] = useState(null);
  const [exSearch, setExSearch] = useState('');
  const [pickerMuscle, setPickerMuscle] = useState('all');

  // Custom exercise creator inside routine modal
  const [showCustomCreator, setShowCustomCreator] = useState(false);
  const [customExName, setCustomExName] = useState('');
  const [customExMuscle, setCustomExMuscle] = useState('chest');
  const [customExEquip, setCustomExEquip] = useState('machine');

  const exerciseMap = useMemo(() => {
    const m = {};
    for (const ex of exercisesLibrary) m[ex.id] = ex;
    return m;
  }, [exercisesLibrary]);

  const getExName = (ex) => {
    if (!ex) return lang === 'es' ? 'Ejercicio' : 'Exercise';
    return lang === 'es' ? ex.nameEs || ex.nameEn : ex.nameEn || ex.nameEs;
  };

  const cloneRoutineForEdit = (rt) => {
    const cloned = JSON.parse(JSON.stringify(rt));
    return {
      ...cloned,
      exercises: ensureExercisesUids(cloned.exercises),
    };
  };

  const handleReorderDraftExercises = (fromIdx, toIdx) => {
    setEditingRoutine((prev) => {
      if (!prev || !Array.isArray(prev.exercises)) return prev;
      if (
        fromIdx < 0 ||
        toIdx < 0 ||
        fromIdx >= prev.exercises.length ||
        toIdx >= prev.exercises.length ||
        fromIdx === toIdx
      ) {
        return prev;
      }
      const list = ensureExercisesUids(prev.exercises);
      const [moved] = list.splice(fromIdx, 1);
      list.splice(toIdx, 0, moved);
      return { ...prev, exercises: list };
    });
  };

  const draftReorder = useLongPressReorder({
    items: editingRoutine?.exercises || [],
    onReorder: handleReorderDraftExercises,
    getItemLabel: (exItem) => getExName(exerciseMap[exItem?.exerciseId]),
    getItemThumb: (exItem) =>
      exerciseMap[exItem?.exerciseId]?.thumbnailUrl || null,
  });

  const handleReorderCardExercises = (routineId, fromIdx, toIdx) => {
    setRoutines((prev) =>
      prev.map((rt) => {
        if (rt.id !== routineId) return rt;
        const list = ensureExercisesUids(rt.exercises);
        if (
          fromIdx < 0 ||
          toIdx < 0 ||
          fromIdx >= list.length ||
          toIdx >= list.length ||
          fromIdx === toIdx
        ) {
          return rt;
        }
        const [moved] = list.splice(fromIdx, 1);
        list.splice(toIdx, 0, moved);
        return { ...rt, exercises: list };
      })
    );
  };

  // Open routine editor automatically if triggered from Home Hub
  useEffect(() => {
    if (initialEditingRoutineId) {
      const target = routines.find((r) => r.id === initialEditingRoutineId);
      if (target) {
        setEditingRoutine(cloneRoutineForEdit(target));
      }
      if (onClearInitialEditingRoutine) {
        onClearInitialEditingRoutine();
      }
    }
  }, [initialEditingRoutineId, routines, onClearInitialEditingRoutine]);

  const folders = [
    { id: 'all', label: t.routines.folderAll },
    { id: 'custom', label: t.routines.folderCustom },
    { id: 'ppl', label: t.routines.folderPPL },
    { id: 'upperlower', label: t.routines.folderUpperLower },
    { id: 'fullbody', label: t.routines.folderFullBody },
  ];

  const filteredRoutines = useMemo(() => {
    if (selectedFolder === 'all') return routines;
    return routines.filter((r) => r.folder === selectedFolder);
  }, [routines, selectedFolder]);

  const handleOpenNewRoutine = () => {
    const firstExId = exercisesLibrary[0]?.id || 'bench-press-barbell';
    setEditingRoutine({
      id: null,
      name: '',
      folder: 'custom',
      notes: '',
      exercises: [
        {
          _uid: createExerciseUid(),
          exerciseId: firstExId,
          restSeconds: 60,
          note: '',
          sets: [
            { type: 'normal', weight: 100, reps: 8, rpe: 8 },
            { type: 'normal', weight: 100, reps: 8, rpe: 8.5 },
            { type: 'normal', weight: 100, reps: 8, rpe: 9 },
          ],
        },
      ],
    });
  };

  const handleDuplicateRoutine = (rt) => {
    const copy = {
      ...JSON.parse(JSON.stringify(rt)),
      id: `rt-${Date.now()}`,
      name: `${rt.name} (${lang === 'es' ? 'Copia' : 'Copy'})`,
      folder: 'custom',
    };
    setRoutines((prev) => [copy, ...prev]);
  };

  const handleDeleteRoutine = (rt) => {
    const msg =
      lang === 'es'
        ? `¿Eliminar la rutina "${rt.name}" de tu perfil?`
        : `Delete routine "${rt.name}" from your profile?`;
    if (window.confirm(msg)) {
      setRoutines((prev) => prev.filter((r) => r.id !== rt.id));
    }
  };

  const handleMoveRoutineCard = (rtId, direction) => {
    setRoutines((prev) => {
      const idx = prev.findIndex((r) => r.id === rtId);
      if (idx === -1) return prev;
      const targetIdx = idx + direction;
      if (targetIdx < 0 || targetIdx >= prev.length) return prev;
      const next = [...prev];
      const [item] = next.splice(idx, 1);
      next.splice(targetIdx, 0, item);
      return next;
    });
  };

  const handleSaveRoutine = (e) => {
    if (e) e.preventDefault();
    if (!editingRoutine) return;
    const cleanName =
      editingRoutine.name.trim() ||
      (lang === 'es' ? 'Mi Rutina Personalizada' : 'My Custom Routine');

    const normalizedExercises = (editingRoutine.exercises || []).map((ex) => ({
      ...stripExerciseUid(ex),
      restSeconds: Math.max(0, Number(ex.restSeconds) || 45),
      note: ex.note || '',
      sets: (ex.sets || []).map((s) => ({
        type: s.type || 'normal',
        weight: s.weight === '' ? 0 : Number(s.weight) || 0,
        reps: s.reps === '' ? 0 : Number(s.reps) || 0,
        rpe: Number(s.rpe) || 8,
      })),
    }));

    const finalRoutine = {
      ...editingRoutine,
      name: cleanName,
      exercises: normalizedExercises,
    };

    if (editingRoutine.id) {
      setRoutines((prev) =>
        prev.map((r) => (r.id === editingRoutine.id ? finalRoutine : r))
      );
    } else {
      const created = {
        ...finalRoutine,
        id: `rt-${Date.now()}`,
      };
      setRoutines((prev) => [created, ...prev]);
    }
    setEditingRoutine(null);
  };

  // Exercise-level helpers inside the Routine Editor
  const handleAddExToRoutineDraft = (exId) => {
    const exObj = exerciseMap[exId];
    setEditingRoutine((prev) => ({
      ...prev,
      exercises: [
        ...(prev.exercises || []),
        {
          _uid: createExerciseUid(),
          exerciseId: exId,
          restSeconds: exObj?.defaultRestSeconds || 45,
          note: '',
          sets: [
            {
              type: 'normal',
              weight: exObj?.equipment === 'bodyweight' ? 0 : 95,
              reps: 8,
              rpe: 8,
            },
            {
              type: 'normal',
              weight: exObj?.equipment === 'bodyweight' ? 0 : 95,
              reps: 8,
              rpe: 8.5,
            },
            {
              type: 'normal',
              weight: exObj?.equipment === 'bodyweight' ? 0 : 95,
              reps: 8,
              rpe: 9,
            },
          ],
        },
      ],
    }));
  };

  const handleMoveDraftExercise = (exIdx, direction) => {
    setEditingRoutine((prev) => {
      const list = [...(prev.exercises || [])];
      const targetIdx = exIdx + direction;
      if (targetIdx < 0 || targetIdx >= list.length) return prev;
      const [moved] = list.splice(exIdx, 1);
      list.splice(targetIdx, 0, moved);
      return { ...prev, exercises: list };
    });
  };

  const handleChangeDraftExerciseId = (exIdx, newExerciseId) => {
    setEditingRoutine((prev) => {
      const nextExs = [...(prev.exercises || [])];
      nextExs[exIdx] = {
        ...nextExs[exIdx],
        exerciseId: newExerciseId,
      };
      return { ...prev, exercises: nextExs };
    });
  };

  const handleUpdateDraftExField = (exIdx, field, value) => {
    setEditingRoutine((prev) => {
      const nextExs = [...(prev.exercises || [])];
      nextExs[exIdx] = {
        ...nextExs[exIdx],
        [field]: value,
      };
      return { ...prev, exercises: nextExs };
    });
  };

  const handleCycleDraftSetType = (exIdx, sIdx) => {
    setEditingRoutine((prev) => {
      const nextExs = [...(prev.exercises || [])];
      const nextSets = [...(nextExs[exIdx].sets || [])];
      const cur = nextSets[sIdx].type || 'normal';
      const nextType =
        SET_TYPE_ORDER[(SET_TYPE_ORDER.indexOf(cur) + 1) % SET_TYPE_ORDER.length];
      nextSets[sIdx] = { ...nextSets[sIdx], type: nextType };
      nextExs[exIdx] = { ...nextExs[exIdx], sets: nextSets };
      return { ...prev, exercises: nextExs };
    });
  };

  const handleRemoveDraftSet = (exIdx, sIdx) => {
    setEditingRoutine((prev) => {
      const nextExs = [...(prev.exercises || [])];
      const nextSets = (nextExs[exIdx].sets || []).filter((_, i) => i !== sIdx);
      if (nextSets.length === 0) {
        nextExs.splice(exIdx, 1);
      } else {
        nextExs[exIdx] = { ...nextExs[exIdx], sets: nextSets };
      }
      return { ...prev, exercises: nextExs };
    });
  };

  const handleEqualizeSets = (exIdx) => {
    setEditingRoutine((prev) => {
      const nextExs = [...(prev.exercises || [])];
      const sets = nextExs[exIdx].sets || [];
      if (sets.length < 2) return prev;
      const first = sets[0];
      nextExs[exIdx] = {
        ...nextExs[exIdx],
        sets: sets.map((s) => ({
          ...s,
          weight: first.weight,
          reps: first.reps,
        })),
      };
      return { ...prev, exercises: nextExs };
    });
  };

  const handleCreateCustomExInModal = () => {
    if (!customExName.trim() || !onAddCustomExercise) return;
    const created = onAddCustomExercise({
      nameEs: customExName.trim(),
      nameEn: customExName.trim(),
      primaryMuscle: customExMuscle,
      secondaryMuscles: [],
      equipment: customExEquip,
      defaultRestSeconds: 45,
    });
    setCustomExName('');
    setShowCustomCreator(false);
    if (created?.id) {
      handleAddExToRoutineDraft(created.id);
    }
  };

  const renderSetBadgeLabel = (setObj, idx) => {
    if (setObj.type === 'warmup') return 'W';
    if (setObj.type === 'dropset') return 'D';
    if (setObj.type === 'failure') return 'F';
    return idx + 1;
  };

  return (
    <div className="section-container">
      {/* Section Header */}
      <div className="section-top-header">
        <div>
          <h2>
            <FolderKanban size={22} className="text-blue" /> {t.routines.title}
          </h2>
          <p className="section-subtitle">
            {lang === 'es'
              ? 'Personaliza al 100% tus rutinas, pesos, repeticiones, notas de máquinas y descansos para tu usuario.'
              : 'Fully customize your personal routines, target weights, reps, machine notes, and rest timers.'}
          </p>
        </div>

        <div className="header-btn-group">
          {onResetDefaultRoutines && (
            <button
              type="button"
              className="secondary-btn"
              onClick={onResetDefaultRoutines}
              title={
                lang === 'es'
                  ? 'Restaurar plantillas originales si borraste alguna'
                  : 'Restore default routine templates'
              }
            >
              <RotateCcw size={15} />
              <span>
                {lang === 'es' ? 'Restaurar Base' : 'Restore Defaults'}
              </span>
            </button>
          )}
          <button
            type="button"
            className="primary-btn"
            onClick={handleOpenNewRoutine}
          >
            <Plus size={18} />
            <span>{t.routines.newRoutineBtn}</span>
          </button>
        </div>
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
        {filteredRoutines.map((rt, rtIdx) => {
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
                    onClick={() => handleMoveRoutineCard(rt.id, -1)}
                    disabled={rtIdx === 0}
                    title={lang === 'es' ? 'Mover arriba' : 'Move up'}
                  >
                    <ArrowUp size={14} />
                  </button>
                  <button
                    type="button"
                    className="icon-btn-subtle"
                    onClick={() => handleMoveRoutineCard(rt.id, 1)}
                    disabled={rtIdx === filteredRoutines.length - 1}
                    title={lang === 'es' ? 'Mover abajo' : 'Move down'}
                  >
                    <ArrowDown size={14} />
                  </button>
                  <button
                    type="button"
                    className="icon-btn-subtle"
                    onClick={() => setEditingRoutine(cloneRoutineForEdit(rt))}
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
                    onClick={() => handleDeleteRoutine(rt)}
                    title={t.routines.deleteBtn}
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              </div>

              {rt.notes && <p className="routine-card-notes">{rt.notes}</p>}

              <RoutineCardBreakdown
                routine={rt}
                exerciseMap={exerciseMap}
                getExName={getExName}
                lang={lang}
                unit={unit}
                onPreviewExercise={setPreviewExercise}
                onReorder={(fromIdx, toIdx) =>
                  handleReorderCardExercises(rt.id, fromIdx, toIdx)
                }
              />

              <div className="routine-card-footer">
                <span className="routine-stats-text">
                  <Dumbbell size={14} /> {rt.exercises?.length || 0}{' '}
                  {t.routines.exercisesCount} • {totalSets}{' '}
                  {t.routines.setsCount}
                </span>

                <div className="routine-card-cta-row">
                  <button
                    type="button"
                    className="routine-edit-pill-btn"
                    onClick={() => setEditingRoutine(cloneRoutineForEdit(rt))}
                  >
                    <Edit3 size={14} />
                    <span>{t.routines.editBtn}</span>
                  </button>

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
            </div>
          );
        })}
      </div>

      {/* Routine Builder / Full Customizer Modal */}
      {editingRoutine && (
        <div
          className="modal-backdrop"
          onClick={() => setEditingRoutine(null)}
        >
          <div
            className="modal-panel modal-large routine-customizer-modal"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-header">
              <div>
                <h3>
                  {editingRoutine.id
                    ? `${t.routines.modalEditTitle}: ${editingRoutine.name}`
                    : t.routines.modalCreateTitle}
                </h3>
                <p className="modal-sub-hint">
                  {lang === 'es'
                    ? 'Edita ejercicios, orden, series, pesos en ' +
                      unit.toUpperCase() +
                      ', repeticiones, descansos y notas.'
                    : 'Edit exercises, order, sets, target weights, reps, rest timers, and notes.'}
                </p>
              </div>
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
                    placeholder="Ej. 2 Chest + Shoulders + Triceps"
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
                    <option value="custom">{t.routines.folderCustom}</option>
                    <option value="ppl">{t.routines.folderPPL}</option>
                    <option value="upperlower">
                      {t.routines.folderUpperLower}
                    </option>
                    <option value="fullbody">{t.routines.folderFullBody}</option>
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
                  placeholder={
                    lang === 'es'
                      ? 'Descripción o notas generales de tu rutina...'
                      : 'General routine description or notes...'
                  }
                />
              </div>

              {/* Exercises inside Routine */}
              <div
                ref={draftReorder.containerRef}
                className="routine-editor-ex-list"
              >
                {(editingRoutine.exercises || []).map((exItem, exIdx) => {
                  const exObj = exerciseMap[exItem.exerciseId];
                  return (
                    <div
                      key={getExerciseItemKey(exItem, exIdx)}
                      data-reorder-item="true"
                      className={`routine-draft-ex-box ${
                        draftReorder.dragState?.activeIdx === exIdx
                          ? 'is-dragging-card'
                          : ''
                      }`}
                    >
                      {/* Exercise Top Row: Thumbnail, Draggable Exercise Name, Swap Selector, Order Up/Down, Delete */}
                      <div className="draft-ex-header">
                        <div className="draft-ex-title-wrap">
                          {exObj?.thumbnailUrl && (
                            <button
                              type="button"
                              className="thumb-zoom-btn"
                              onClick={() => setPreviewExercise(exObj)}
                              title={
                                lang === 'es'
                                  ? 'Toca para ver la imagen/video en grande'
                                  : 'Tap to enlarge exercise image/video'
                              }
                            >
                              <img
                                src={exObj.thumbnailUrl}
                                alt={getExName(exObj)}
                                className="routine-line-thumb"
                              />
                            </button>
                          )}
                          <div
                            className="draft-ex-name-handle ex-drag-handle"
                            title={
                              lang === 'es'
                                ? 'Mantén presionado el nombre y arrastra para cambiar el orden'
                                : 'Hold exercise name and drag to reorder'
                            }
                            {...draftReorder.getHandleProps(exIdx)}
                          >
                            <span
                              className="ex-grip-cue"
                              data-instant-grip="true"
                            >
                              <GripVertical size={15} />
                            </span>
                            <span className="draft-ex-index-badge">
                              #{exIdx + 1}
                            </span>
                            <strong className="draft-ex-name-label">
                              {getExName(exObj)}
                            </strong>
                          </div>

                          <div
                            className="draft-ex-swap-pill"
                            title={
                              lang === 'es'
                                ? 'Cambiar ejercicio'
                                : 'Change exercise'
                            }
                          >
                            <span>{lang === 'es' ? 'Cambiar' : 'Swap'}</span>
                            <ChevronDown size={13} />
                            <select
                              className="draft-ex-select-native"
                              value={exItem.exerciseId}
                              aria-label={
                                lang === 'es'
                                  ? 'Cambiar ejercicio'
                                  : 'Change exercise'
                              }
                              onChange={(e) =>
                                handleChangeDraftExerciseId(
                                  exIdx,
                                  e.target.value
                                )
                              }
                            >
                              {exercisesLibrary.map((libEx) => (
                                <option key={libEx.id} value={libEx.id}>
                                  {getExName(libEx)}
                                </option>
                              ))}
                            </select>
                          </div>
                        </div>

                        <div className="draft-ex-Order-actions">
                          <button
                            type="button"
                            className="icon-btn-subtle"
                            onClick={() => handleMoveDraftExercise(exIdx, -1)}
                            disabled={exIdx === 0}
                            title={lang === 'es' ? 'Subir ejercicio' : 'Move up'}
                          >
                            <ArrowUp size={14} />
                          </button>
                          <button
                            type="button"
                            className="icon-btn-subtle"
                            onClick={() => handleMoveDraftExercise(exIdx, 1)}
                            disabled={
                              exIdx ===
                              (editingRoutine.exercises || []).length - 1
                            }
                            title={
                              lang === 'es' ? 'Bajar ejercicio' : 'Move down'
                            }
                          >
                            <ArrowDown size={14} />
                          </button>
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
                            title={
                              lang === 'es'
                                ? 'Quitar ejercicio de la rutina'
                                : 'Remove exercise'
                            }
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>

                      {/* Exercise Note & Rest Seconds Row */}
                      <div className="draft-ex-meta-row">
                        <div className="draft-ex-note-input">
                          <FileText size={13} className="text-muted shrink-0" />
                          <input
                            type="text"
                            value={exItem.note || ''}
                            onChange={(e) =>
                              handleUpdateDraftExField(
                                exIdx,
                                'note',
                                e.target.value
                              )
                            }
                            placeholder={
                              lang === 'es'
                                ? 'Nota personal (ej. Condo 21, Weight bar 40, Nivel 6)...'
                                : 'Exercise note (e.g. Condo 21, Weight bar 40, Seat 4)...'
                            }
                          />
                        </div>

                        <div className="draft-ex-rest-control">
                          <Timer size={13} className="text-blue shrink-0" />
                          <span>{lang === 'es' ? 'Descanso:' : 'Rest:'}</span>
                          <input
                            type="number"
                            min="0"
                            step="5"
                            value={exItem.restSeconds ?? 45}
                            onChange={(e) =>
                              handleUpdateDraftExField(
                                exIdx,
                                'restSeconds',
                                e.target.value === ''
                                  ? ''
                                  : Number(e.target.value)
                              )
                            }
                          />
                          <span>s</span>
                        </div>
                      </div>

                      {/* Sets Table inside Routine Editor */}
                      <div className="draft-sets-table">
                        <div className="draft-sets-thead">
                          <span>{lang === 'es' ? 'SERIE' : 'SET'}</span>
                          <span>
                            {lang === 'es' ? 'PESO' : 'WEIGHT'} (
                            {unit.toUpperCase()})
                          </span>
                          <span>REPS</span>
                          <span>RPE</span>
                          <span />
                        </div>

                        {(exItem.sets || []).map((s, sIdx) => (
                          <div key={sIdx} className="draft-set-row">
                            <button
                              type="button"
                              className={`set-type-badge type-${s.type || 'normal'}`}
                              onClick={() => handleCycleDraftSetType(exIdx, sIdx)}
                              title={
                                lang === 'es'
                                  ? 'Toca para cambiar tipo: Normal / W / D / F'
                                  : 'Click to cycle set type: Normal / W / D / F'
                              }
                            >
                              {renderSetBadgeLabel(s, sIdx)}
                            </button>

                            <input
                              type="number"
                              step="any"
                              className="draft-set-input"
                              value={
                                s.weight === ''
                                  ? ''
                                  : formatWeightValue(s.weight, unit)
                              }
                              onChange={(e) => {
                                const raw = e.target.value;
                                const nextExs = [...editingRoutine.exercises];
                                const nextSets = [...nextExs[exIdx].sets];
                                nextSets[sIdx] = {
                                  ...nextSets[sIdx],
                                  weight: raw === '' ? '' : toLbs(raw, unit),
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

                            <input
                              type="number"
                              step="1"
                              className="draft-set-input"
                              value={s.reps === '' ? '' : s.reps}
                              onChange={(e) => {
                                const raw = e.target.value;
                                const nextExs = [...editingRoutine.exercises];
                                const nextSets = [...nextExs[exIdx].sets];
                                nextSets[sIdx] = {
                                  ...nextSets[sIdx],
                                  reps: raw === '' ? '' : Number(raw),
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

                            <input
                              type="number"
                              step="0.5"
                              min="5"
                              max="10"
                              className="draft-set-input rpe-input"
                              value={s.rpe ?? 8}
                              onChange={(e) => {
                                const raw = e.target.value;
                                const nextExs = [...editingRoutine.exercises];
                                const nextSets = [...nextExs[exIdx].sets];
                                nextSets[sIdx] = {
                                  ...nextSets[sIdx],
                                  rpe: raw === '' ? '' : Number(raw),
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

                            <button
                              type="button"
                              className="set-delete-btn"
                              onClick={() => handleRemoveDraftSet(exIdx, sIdx)}
                              title={
                                lang === 'es' ? 'Borrar serie' : 'Delete set'
                              }
                            >
                              <X size={14} />
                            </button>
                          </div>
                        ))}

                        <div className="draft-set-actions-bar">
                          <button
                            type="button"
                            className="mini-add-set-btn"
                            onClick={() => {
                              const nextExs = [...editingRoutine.exercises];
                              const last =
                                nextExs[exIdx].sets[
                                  nextExs[exIdx].sets.length - 1
                                ] || { weight: 95, reps: 8, rpe: 8 };
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
                            <Plus size={13} />
                            <span>
                              {lang === 'es' ? 'Agregar Serie' : 'Add Set'}
                            </span>
                          </button>

                          {(exItem.sets || []).length > 1 && (
                            <button
                              type="button"
                              className="mini-equalize-btn"
                              onClick={() => handleEqualizeSets(exIdx)}
                              title={
                                lang === 'es'
                                  ? 'Copiar peso y reps de la Serie #1 a todas las series de este ejercicio'
                                  : 'Copy Set #1 weight & reps to all sets in this exercise'
                              }
                            >
                              <span>
                                {lang === 'es'
                                  ? '= Igualar a Serie #1'
                                  : '= Match Set #1'}
                              </span>
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Quick Picker to Add Exercise to Routine */}
              <div className="routine-add-ex-picker">
                <div className="picker-top-row">
                  <h4>
                    <Plus size={15} className="text-blue" />{' '}
                    {lang === 'es'
                      ? 'Agregar Ejercicio a la Rutina'
                      : 'Add Exercise to Routine'}
                  </h4>
                  <button
                    type="button"
                    className="link-btn"
                    onClick={() => setShowCustomCreator((v) => !v)}
                  >
                    <Sparkles size={13} />
                    <span>
                      {showCustomCreator
                        ? lang === 'es'
                          ? 'Cerrar creador'
                          : 'Close creator'
                        : lang === 'es'
                        ? '+ Crear Ejercicio Propio'
                        : '+ Create Custom Exercise'}
                    </span>
                  </button>
                </div>

                {showCustomCreator && (
                  <div className="inline-custom-ex-creator">
                    <input
                      type="text"
                      value={customExName}
                      onChange={(e) => setCustomExName(e.target.value)}
                      placeholder={
                        lang === 'es'
                          ? 'Nombre del nuevo ejercicio...'
                          : 'New exercise name...'
                      }
                    />
                    <select
                      value={customExMuscle}
                      onChange={(e) => setCustomExMuscle(e.target.value)}
                    >
                      {MUSCLE_KEYS.filter((m) => m !== 'all').map((m) => (
                        <option key={m} value={m}>
                          {t.muscles[m]}
                        </option>
                      ))}
                    </select>
                    <select
                      value={customExEquip}
                      onChange={(e) => setCustomExEquip(e.target.value)}
                    >
                      {EQUIP_KEYS.map((eq) => (
                        <option key={eq} value={eq}>
                          {t.equipment[eq]}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      className="primary-btn"
                      onClick={handleCreateCustomExInModal}
                    >
                      <Plus size={15} />
                      <span>{lang === 'es' ? 'Crear y Añadir' : 'Add'}</span>
                    </button>
                  </div>
                )}

                <div className="modal-search-bar">
                  <Search size={15} />
                  <input
                    type="text"
                    value={exSearch}
                    onChange={(e) => setExSearch(e.target.value)}
                    placeholder={t.exercises.searchPlaceholder}
                  />
                </div>

                <div className="muscle-filter-chips-scroll mb-10">
                  {MUSCLE_KEYS.map((m) => (
                    <button
                      key={m}
                      type="button"
                      className={`filter-chip ${pickerMuscle === m ? 'active' : ''}`}
                      onClick={() => setPickerMuscle(m)}
                    >
                      {t.muscles[m]}
                    </button>
                  ))}
                </div>

                <div className="routine-picker-chips">
                  {exercisesLibrary
                    .filter((ex) => {
                      const matchesMuscle =
                        pickerMuscle === 'all' ||
                        ex.primaryMuscle === pickerMuscle ||
                        (ex.secondaryMuscles || []).includes(pickerMuscle);
                      const q = exSearch.trim().toLowerCase();
                      const matchesSearch =
                        !q ||
                        (ex.nameEs || '').toLowerCase().includes(q) ||
                        (ex.nameEn || '').toLowerCase().includes(q);
                      return matchesMuscle && matchesSearch;
                    })
                    .slice(0, 24)
                    .map((ex) => (
                      <button
                        key={ex.id}
                        type="button"
                        className="picker-ex-chip"
                        onClick={() => handleAddExToRoutineDraft(ex.id)}
                      >
                        {ex.thumbnailUrl ? (
                          <img
                            src={ex.thumbnailUrl}
                            alt=""
                            className="picker-chip-thumb"
                          />
                        ) : (
                          <Plus size={13} />
                        )}
                        <span>{getExName(ex)}</span>
                      </button>
                    ))}
                </div>
              </div>

              <div className="modal-sticky-footer">
                <button
                  type="button"
                  className="secondary-btn"
                  onClick={() => setEditingRoutine(null)}
                >
                  <span>{lang === 'es' ? 'Cancelar' : 'Cancel'}</span>
                </button>
                <button type="submit" className="primary-btn">
                  <Check size={18} />
                  <span>{t.routines.saveRoutineBtn}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <ExerciseMediaModal
        exercise={previewExercise}
        lang={lang}
        t={t}
        onClose={() => setPreviewExercise(null)}
      />

      <DragFollowerPortal
        dragState={draftReorder.dragState}
        followerRef={draftReorder.followerRef}
        lang={lang}
      />
    </div>
  );
}

function RoutineCardBreakdown({
  routine,
  exerciseMap,
  getExName,
  lang,
  unit,
  onPreviewExercise,
  onReorder,
}) {
  const cardReorder = useLongPressReorder({
    items: routine.exercises || [],
    onReorder,
    getItemLabel: (exItem) => getExName(exerciseMap[exItem?.exerciseId]),
    getItemThumb: (exItem) =>
      exerciseMap[exItem?.exerciseId]?.thumbnailUrl || null,
  });

  return (
    <>
      <div ref={cardReorder.containerRef} className="routine-ex-breakdown">
        {(routine.exercises || []).map((exItem, idx) => {
          const exObj = exerciseMap[exItem.exerciseId];
          const topSet = exItem.sets?.[exItem.sets.length - 1];
          return (
            <div
              key={getExerciseItemKey(exItem, idx)}
              data-reorder-item="true"
              className={`routine-ex-line ${
                cardReorder.dragState?.activeIdx === idx ? 'is-dragging-line' : ''
              }`}
            >
              <div className="routine-ex-line-left">
                <span className="routine-ex-name">
                  {exObj?.thumbnailUrl && (
                    <button
                      type="button"
                      className="thumb-zoom-btn"
                      onClick={() => onPreviewExercise(exObj)}
                      title={
                        lang === 'es'
                          ? 'Toca para ver la imagen/video en grande'
                          : 'Tap to enlarge exercise image/video'
                      }
                    >
                      <img
                        src={exObj.thumbnailUrl}
                        alt={getExName(exObj)}
                        className="routine-line-thumb"
                      />
                    </button>
                  )}
                  <span
                    className="routine-ex-drag-label ex-drag-handle"
                    title={
                      lang === 'es'
                        ? 'Mantén presionado el nombre y arrastra para cambiar el orden'
                        : 'Hold exercise name and drag to reorder'
                    }
                    {...cardReorder.getHandleProps(idx)}
                  >
                    <GripVertical
                      size={13}
                      className="ex-grip-cue-sm"
                      data-instant-grip="true"
                    />
                    <span>
                      <strong>{exItem.sets?.length || 3}×</strong>{' '}
                      {getExName(exObj)}
                    </span>
                  </span>
                </span>
                {exItem.note && (
                  <span className="routine-ex-inline-note">
                    📌 {exItem.note}
                  </span>
                )}
              </div>
              {topSet && (
                <span className="routine-ex-target">
                  {formatWeightValue(topSet.weight, unit)} {unit} × {topSet.reps}
                </span>
              )}
            </div>
          );
        })}
      </div>

      <DragFollowerPortal
        dragState={cardReorder.dragState}
        followerRef={cardReorder.followerRef}
        lang={lang}
      />
    </>
  );
}
