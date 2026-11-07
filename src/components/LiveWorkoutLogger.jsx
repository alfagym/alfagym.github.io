import React, { useState, useMemo } from 'react';
import confetti from 'canvas-confetti';
import {
  Play,
  Plus,
  Check,
  Trash2,
  Clock,
  Trophy,
  Flame,
  Dumbbell,
  Timer,
  Link2,
  Disc,
  Search,
  X,
  RotateCcw,
  Sparkles,
  ChevronRight,
  FolderKanban,
  Edit3,
  Save,
} from 'lucide-react';
import {
  calculate1RM,
  formatClock,
  formatDurationHuman,
  formatWeightValue,
  toLbs,
  getPreviousExerciseSets,
  getExerciseStats,
  calculatePlateBreakdown,
  playGymSound,
} from '../utils/workoutMath';
import ExerciseMediaModal from './ExerciseMediaModal';

const SET_TYPE_ORDER = ['normal', 'warmup', 'dropset', 'failure'];
const SUPERSET_GROUPS = [null, 'A', 'B', 'C'];

export default function LiveWorkoutLogger({
  lang,
  unit,
  t,
  activeWorkout,
  setActiveWorkout,
  elapsedSeconds,
  restTimer,
  startRestTimer,
  adjustRestTimer,
  skipRestTimer,
  exercisesLibrary,
  onAddCustomExercise,
  routines,
  workouts,
  onStartEmptyWorkout,
  onStartRoutineWorkout,
  onEditRoutineFromHub,
  onSaveActiveToRoutine,
  onFinishWorkout,
  onCancelWorkout,
  onNavigateTab,
}) {
  const [routineSavedToast, setRoutineSavedToast] = useState(false);
  const [previewExercise, setPreviewExercise] = useState(null);
  const [showAddExerciseModal, setShowAddExerciseModal] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [muscleFilter, setMuscleFilter] = useState('all');
  const [platePopover, setPlatePopover] = useState(null); // { exIdx, weight }
  const [completedSummary, setCompletedSummary] = useState(null);

  // Quick custom exercise inside modal
  const [creatingCustom, setCreatingCustom] = useState(false);
  const [customName, setCustomName] = useState('');
  const [customMuscle, setCustomMuscle] = useState('chest');
  const [customEquipment, setCustomEquipment] = useState('dumbbell');

  const getExName = (ex) => {
    if (!ex) return 'Ejercicio';
    return lang === 'es' ? ex.nameEs || ex.nameEn : ex.nameEn || ex.nameEs;
  };

  const exerciseMap = useMemo(() => {
    const map = {};
    for (const ex of exercisesLibrary) {
      map[ex.id] = ex;
    }
    return map;
  }, [exercisesLibrary]);

  // Compute live workout stats
  const liveStats = useMemo(() => {
    if (!activeWorkout) {
      return { totalVolumeLbs: 0, completedSets: 0, totalSets: 0, prCount: 0 };
    }
    let totalVolumeLbs = 0;
    let completedSets = 0;
    let totalSets = 0;
    let prCount = 0;

    for (const exItem of activeWorkout.exercises || []) {
      for (const s of exItem.sets || []) {
        totalSets++;
        if (s.completed) {
          completedSets++;
          const wLbs = Number(s.weight) || 0;
          const reps = Number(s.reps) || 0;
          totalVolumeLbs += wLbs * reps;
          if (s.isPR) prCount++;
        }
      }
    }
    return { totalVolumeLbs, completedSets, totalSets, prCount };
  }, [activeWorkout]);

  // Cycle set type: normal -> warmup -> dropset -> failure
  const handleCycleSetType = (exIdx, setIdx) => {
    setActiveWorkout((prev) => {
      if (!prev) return prev;
      const nextExs = [...prev.exercises];
      const ex = { ...nextExs[exIdx], sets: [...nextExs[exIdx].sets] };
      const currentType = ex.sets[setIdx].type || 'normal';
      const nextType =
        SET_TYPE_ORDER[(SET_TYPE_ORDER.indexOf(currentType) + 1) % SET_TYPE_ORDER.length];
      ex.sets[setIdx] = { ...ex.sets[setIdx], type: nextType };
      nextExs[exIdx] = ex;
      return { ...prev, exercises: nextExs };
    });
  };

  // Cycle Superset badge: null -> A -> B -> C
  const handleToggleSuperset = (exIdx) => {
    setActiveWorkout((prev) => {
      if (!prev) return prev;
      const nextExs = [...prev.exercises];
      const currentGroup = nextExs[exIdx].supersetGroup || null;
      const nextGroup =
        SUPERSET_GROUPS[
          (SUPERSET_GROUPS.indexOf(currentGroup) + 1) % SUPERSET_GROUPS.length
        ];
      nextExs[exIdx] = { ...nextExs[exIdx], supersetGroup: nextGroup };
      return { ...prev, exercises: nextExs };
    });
  };

  // Update set field (weight in display unit, reps, rpe)
  const handleUpdateSetField = (exIdx, setIdx, field, rawValue) => {
    setActiveWorkout((prev) => {
      if (!prev) return prev;
      const nextExs = [...prev.exercises];
      const ex = { ...nextExs[exIdx], sets: [...nextExs[exIdx].sets] };
      const targetSet = { ...ex.sets[setIdx] };

      if (field === 'weight') {
        const numeric = rawValue === '' ? '' : toLbs(rawValue, unit);
        targetSet.weight = numeric;
      } else if (field === 'reps') {
        targetSet.reps = rawValue === '' ? '' : Number(rawValue);
      } else if (field === 'rpe') {
        targetSet.rpe = rawValue;
      }

      ex.sets[setIdx] = targetSet;
      nextExs[exIdx] = ex;
      return { ...prev, exercises: nextExs };
    });
  };

  // Auto-fill set from "Previous / Anterior" column
  const handleApplyPreviousSet = (exIdx, setIdx, prevSet) => {
    if (!prevSet) return;
    setActiveWorkout((prev) => {
      if (!prev) return prev;
      const nextExs = [...prev.exercises];
      const ex = { ...nextExs[exIdx], sets: [...nextExs[exIdx].sets] };
      ex.sets[setIdx] = {
        ...ex.sets[setIdx],
        weight: prevSet.weight,
        reps: prevSet.reps,
      };
      nextExs[exIdx] = ex;
      return { ...prev, exercises: nextExs };
    });
  };

  // Toggle set completion + check PR + trigger Rest Timer
  const handleToggleSetComplete = (exIdx, setIdx) => {
    setActiveWorkout((prev) => {
      if (!prev) return prev;
      const nextExs = [...prev.exercises];
      const ex = { ...nextExs[exIdx], sets: [...nextExs[exIdx].sets] };
      const targetSet = { ...ex.sets[setIdx] };

      const willComplete = !targetSet.completed;
      targetSet.completed = willComplete;

      if (willComplete) {
        const wLbs = Number(targetSet.weight) || 0;
        const reps = Number(targetSet.reps) || 0;
        const est1RM = calculate1RM(wLbs, reps);
        const histStats = getExerciseStats(workouts, ex.exerciseId);

        const isNewPR =
          targetSet.type !== 'warmup' &&
          wLbs > 0 &&
          reps > 0 &&
          (wLbs > histStats.maxWeight || est1RM > histStats.best1RM);

        targetSet.isPR = isNewPR;

        if (isNewPR) {
          playGymSound('pr');
        } else {
          playGymSound('check');
        }

        if (ex.restSeconds && ex.restSeconds > 0) {
          startRestTimer(ex.restSeconds, getExName(exerciseMap[ex.exerciseId]));
        }
      } else {
        targetSet.isPR = false;
      }

      ex.sets[setIdx] = targetSet;
      nextExs[exIdx] = ex;
      return { ...prev, exercises: nextExs };
    });
  };

  const handleAddSet = (exIdx) => {
    setActiveWorkout((prev) => {
      if (!prev) return prev;
      const nextExs = [...prev.exercises];
      const ex = { ...nextExs[exIdx], sets: [...nextExs[exIdx].sets] };
      const lastSet = ex.sets[ex.sets.length - 1] || {
        weight: 95,
        reps: 10,
        rpe: 8,
      };
      ex.sets.push({
        id: `set-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        type: 'normal',
        weight: lastSet.weight,
        reps: lastSet.reps,
        rpe: lastSet.rpe || 8,
        completed: false,
        isPR: false,
      });
      nextExs[exIdx] = ex;
      return { ...prev, exercises: nextExs };
    });
  };

  const handleRemoveSet = (exIdx, setIdx) => {
    setActiveWorkout((prev) => {
      if (!prev) return prev;
      const nextExs = [...prev.exercises];
      const ex = { ...nextExs[exIdx], sets: [...nextExs[exIdx].sets] };
      ex.sets.splice(setIdx, 1);
      if (ex.sets.length === 0) {
        nextExs.splice(exIdx, 1);
      } else {
        nextExs[exIdx] = ex;
      }
      return { ...prev, exercises: nextExs };
    });
  };

  const handleRemoveExercise = (exIdx) => {
    setActiveWorkout((prev) => {
      if (!prev) return prev;
      const nextExs = prev.exercises.filter((_, idx) => idx !== exIdx);
      return { ...prev, exercises: nextExs };
    });
  };

  const handleAddExerciseToActive = (exerciseObj) => {
    const prevSets = getPreviousExerciseSets(workouts, exerciseObj.id);
    const defaultWeight = prevSets[0]?.weight ?? (exerciseObj.equipment === 'bodyweight' ? 0 : 95);
    const defaultReps = prevSets[0]?.reps ?? 10;

    setActiveWorkout((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        exercises: [
          ...(prev.exercises || []),
          {
            exerciseId: exerciseObj.id,
            restSeconds: exerciseObj.defaultRestSeconds || 90,
            supersetGroup: null,
            note: '',
            sets: [
              {
                id: `s-${Date.now()}-1`,
                type: 'normal',
                weight: defaultWeight,
                reps: defaultReps,
                rpe: 8,
                completed: false,
                isPR: false,
              },
              {
                id: `s-${Date.now()}-2`,
                type: 'normal',
                weight: defaultWeight,
                reps: defaultReps,
                rpe: 8.5,
                completed: false,
                isPR: false,
              },
              {
                id: `s-${Date.now()}-3`,
                type: 'normal',
                weight: defaultWeight,
                reps: defaultReps,
                rpe: 9,
                completed: false,
                isPR: false,
              },
            ],
          },
        ],
      };
    });
    setShowAddExerciseModal(false);
  };

  const handleCreateAndAddCustom = (e) => {
    e.preventDefault();
    if (!customName.trim()) return;
    const newEx = onAddCustomExercise({
      nameEs: customName.trim(),
      nameEn: customName.trim(),
      primaryMuscle: customMuscle,
      secondaryMuscles: [],
      equipment: customEquipment,
      defaultRestSeconds: 90,
    });
    setCustomName('');
    setCreatingCustom(false);
    handleAddExerciseToActive(newEx);
  };

  const handleCompleteWorkoutClick = () => {
    if (!activeWorkout) return;
    const prList = [];
    const cleanedExercises = (activeWorkout.exercises || [])
      .map((exItem) => {
        const exDef = exerciseMap[exItem.exerciseId];
        const doneSets = (exItem.sets || []).filter(
          (s) => s.completed || Number(s.reps) > 0
        );
        doneSets.forEach((s) => {
          if (s.isPR) {
            prList.push({
              exerciseName: getExName(exDef),
              weight: formatWeightValue(s.weight, unit),
              reps: s.reps,
              est1RM: formatWeightValue(calculate1RM(s.weight, s.reps), unit),
            });
          }
        });
        return {
          ...exItem,
          sets: doneSets.map((s) => ({ ...s, completed: true })),
        };
      })
      .filter((ex) => ex.sets.length > 0);

    let finalVolumeLbs = 0;
    let finalSets = 0;
    cleanedExercises.forEach((ex) =>
      ex.sets.forEach((s) => {
        finalSets++;
        finalVolumeLbs += (Number(s.weight) || 0) * (Number(s.reps) || 0);
      })
    );

    const finishedRecord = {
      id: `wk-${Date.now()}`,
      name:
        activeWorkout.name?.trim() ||
        (lang === 'es' ? 'Entrenamiento Alfa Gym' : 'Alfa Gym Workout'),
      routineId: activeWorkout.routineId || null,
      date: new Date().toISOString(),
      durationSeconds: Math.max(60, elapsedSeconds),
      totalVolumeLbs: finalVolumeLbs,
      totalSets: finalSets,
      prCount: prList.length,
      notes: activeWorkout.notes || '',
      exercises: cleanedExercises,
    };

    try {
      confetti({
        particleCount: 95,
        spread: 75,
        origin: { y: 0.6 },
      });
    } catch {
      // ignore confetti errors
    }

    playGymSound('pr');
    setCompletedSummary({ record: finishedRecord, prList });
    onFinishWorkout(finishedRecord);
  };

  const filteredExercises = useMemo(() => {
    return exercisesLibrary.filter((ex) => {
      const matchesMuscle =
        muscleFilter === 'all' ||
        ex.primaryMuscle === muscleFilter ||
        (ex.secondaryMuscles || []).includes(muscleFilter);
      const q = searchQuery.trim().toLowerCase();
      const matchesSearch =
        !q ||
        (ex.nameEs || '').toLowerCase().includes(q) ||
        (ex.nameEn || '').toLowerCase().includes(q);
      return matchesMuscle && matchesSearch;
    });
  }, [exercisesLibrary, muscleFilter, searchQuery]);

  // If just finished a workout, show the Hevy Celebration Summary Modal
  if (completedSummary) {
    const { record, prList } = completedSummary;
    return (
      <div className="workout-summary-celebration">
        <div className="summary-card-hero">
          <div className="summary-trophy-circle">
            <Trophy size={40} className="text-amber" />
          </div>
          <h2>{t.workout.workoutCompleteTitle}</h2>
          <p className="summary-subtitle">{t.workout.workoutCompleteSub}</p>

          <div className="summary-workout-title-badge">{record.name}</div>

          <div className="summary-kpi-grid">
            <div className="summary-kpi-box">
              <span className="kpi-label">{t.workout.duration}</span>
              <strong className="kpi-val">{formatDurationHuman(record.durationSeconds)}</strong>
            </div>
            <div className="summary-kpi-box">
              <span className="kpi-label">{t.workout.volume}</span>
              <strong className="kpi-val text-blue">
                {formatWeightValue(record.totalVolumeLbs, unit).toLocaleString()} {unit}
              </strong>
            </div>
            <div className="summary-kpi-box">
              <span className="kpi-label">{t.workout.sets}</span>
              <strong className="kpi-val">{record.totalSets}</strong>
            </div>
            <div className="summary-kpi-box">
              <span className="kpi-label">{t.workout.prs}</span>
              <strong className="kpi-val text-amber">🏆 {record.prCount}</strong>
            </div>
          </div>

          {prList.length > 0 && (
            <div className="summary-pr-box">
              <h4>
                <Sparkles size={16} className="text-amber" /> {t.workout.newPRsTitle}
              </h4>
              <div className="summary-pr-list">
                {prList.map((pr, idx) => (
                  <div key={idx} className="summary-pr-item">
                    <span>🏆 {pr.exerciseName}</span>
                    <strong>
                      {pr.weight} {unit} × {pr.reps} (1RM: {pr.est1RM} {unit})
                    </strong>
                  </div>
                ))}
              </div>
            </div>
          )}

          <button
            type="button"
            className="primary-btn full-width mt-16"
            onClick={() => {
              setCompletedSummary(null);
              onNavigateTab('analytics');
            }}
          >
            <Check size={18} />
            <span>{t.workout.saveAndClose}</span>
          </button>
        </div>
      </div>
    );
  }

  // ================= VIEW 1: NO ACTIVE WORKOUT (QUICK START HUB) =================
  if (!activeWorkout) {
    return (
      <div className="logger-hub-container">
        {/* Hero Quick Start Card */}
        <div className="quick-start-hero">
          <div className="quick-start-info">
            <div className="badge-pill-blue">
              <Flame size={14} />
              <span>ALFA GYM LIVE LOGGER</span>
            </div>
            <h2>{t.workout.startEmptyTitle}</h2>
            <p>{t.workout.startEmptyDesc}</p>
          </div>
          <button
            type="button"
            className="start-empty-workout-btn"
            onClick={onStartEmptyWorkout}
          >
            <Play size={20} fill="currentColor" />
            <span>{t.workout.startEmptyBtn}</span>
          </button>
        </div>

        {/* Start from Routines Grid */}
        <div className="hub-section">
          <div className="hub-section-header">
            <h3>
              <FolderKanban size={18} className="text-blue" />{' '}
              {t.workout.quickRoutinesTitle}
            </h3>
            <button
              type="button"
              className="link-btn"
              onClick={() => onNavigateTab('routines')}
            >
              <span>{lang === 'es' ? 'Gestionar Rutinas' : 'Manage Routines'}</span>
              <ChevronRight size={15} />
            </button>
          </div>

          <div className="hub-routines-grid">
            {routines.map((rt) => {
              const totalSets = (rt.exercises || []).reduce(
                (acc, e) => acc + (e.sets?.length || 0),
                0
              );
              return (
                <div key={rt.id} className="hub-routine-card">
                  <div className="hub-routine-top">
                    <h4>{rt.name}</h4>
                    <span className="routine-meta-badge">
                      {rt.exercises?.length || 0} {t.routines.exercisesCount} •{' '}
                      {totalSets} {t.routines.setsCount}
                    </span>
                  </div>
                  <div className="hub-routine-ex-preview">
                    {(rt.exercises || []).slice(0, 4).map((exItem, idx) => {
                      const exObj = exerciseMap[exItem.exerciseId];
                      return (
                        <span
                          key={idx}
                          className="ex-preview-chip clickable-chip"
                          onClick={() => exObj && setPreviewExercise(exObj)}
                          title={
                            lang === 'es'
                              ? 'Toca para ver el ejercicio en grande'
                              : 'Tap to view exercise in large view'
                          }
                        >
                          {exObj?.thumbnailUrl && (
                            <img
                              src={exObj.thumbnailUrl}
                              alt=""
                              className="chip-mini-thumb"
                            />
                          )}
                          <span>
                            {exItem.sets?.length || 3}× {getExName(exObj)}
                          </span>
                        </span>
                      );
                    })}
                  </div>
                  <div className="hub-routine-actions-row">
                    {onEditRoutineFromHub && (
                      <button
                        type="button"
                        className="routine-edit-pill-btn"
                        onClick={() => onEditRoutineFromHub(rt.id)}
                      >
                        <Edit3 size={14} />
                        <span>{t.routines.editBtn}</span>
                      </button>
                    )}
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
        </div>

        {/* Recent Workouts Quick Repeat */}
        {workouts.length > 0 && (
          <div className="hub-section">
            <div className="hub-section-header">
              <h3>
                <Clock size={18} className="text-emerald" />{' '}
                {t.workout.recentWorkoutsTitle}
              </h3>
              <button
                type="button"
                className="link-btn"
                onClick={() => onNavigateTab('analytics')}
              >
                <span>{lang === 'es' ? 'Ver Todo el Historial' : 'View Full History'}</span>
                <ChevronRight size={15} />
              </button>
            </div>

            <div className="recent-workouts-row">
              {workouts.slice(0, 3).map((wk) => (
                <div key={wk.id} className="recent-wk-mini-card">
                  <div className="recent-wk-top">
                    <strong>{wk.name}</strong>
                    <span className="recent-wk-date">
                      {new Date(wk.date).toLocaleDateString(
                        lang === 'es' ? 'es-ES' : 'en-US',
                        { month: 'short', day: 'numeric' }
                      )}
                    </span>
                  </div>
                  <div className="recent-wk-stats">
                    <span>⏱ {formatDurationHuman(wk.durationSeconds)}</span>
                    <span>
                      🏋️ {formatWeightValue(wk.totalVolumeLbs, unit).toLocaleString()}{' '}
                      {unit}
                    </span>
                    {wk.prCount > 0 && <span className="text-amber">🏆 {wk.prCount} PR</span>}
                  </div>
                  <button
                    type="button"
                    className="repeat-mini-btn"
                    onClick={() =>
                      onStartRoutineWorkout({
                        name: wk.name,
                        notes: wk.notes,
                        exercises: wk.exercises.map((e) => ({
                          exerciseId: e.exerciseId,
                          restSeconds: 90,
                          note: e.note || '',
                          sets: e.sets.map((s) => ({
                            type: s.type || 'normal',
                            weight: s.weight,
                            reps: s.reps,
                            rpe: s.rpe || 8,
                          })),
                        })),
                      })
                    }
                  >
                    <RotateCcw size={13} />
                    <span>{t.analytics.repeatWorkoutBtn}</span>
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        <ExerciseMediaModal
          exercise={previewExercise}
          lang={lang}
          t={t}
          onClose={() => setPreviewExercise(null)}
        />
      </div>
    );
  }

  // ================= VIEW 2: ACTIVE LIVE WORKOUT LOGGER =================
  let normalSetCounter = 0;

  return (
    <div className="live-workout-container">
      {/* Sticky Hevy Top Bar */}
      <div className="live-workout-header-bar">
        <div className="live-title-col">
          <input
            type="text"
            className="live-workout-title-input"
            value={activeWorkout.name}
            onChange={(e) =>
              setActiveWorkout((prev) => ({ ...prev, name: e.target.value }))
            }
            placeholder={t.workout.workoutNamePlaceholder}
          />
          <input
            type="text"
            className="live-workout-notes-input"
            value={activeWorkout.notes || ''}
            onChange={(e) =>
              setActiveWorkout((prev) => ({ ...prev, notes: e.target.value }))
            }
            placeholder={t.workout.workoutNotesPlaceholder}
          />
        </div>

        <div className="live-metrics-strip">
          <div className="live-metric-pill">
            <Clock size={14} className="text-blue" />
            <div>
              <span className="m-label">{t.workout.duration}</span>
              <strong className="m-val font-mono">{formatClock(elapsedSeconds)}</strong>
            </div>
          </div>

          <div className="live-metric-pill">
            <Dumbbell size={14} className="text-emerald" />
            <div>
              <span className="m-label">{t.workout.volume}</span>
              <strong className="m-val">
                {formatWeightValue(liveStats.totalVolumeLbs, unit).toLocaleString()}{' '}
                {unit}
              </strong>
            </div>
          </div>

          <div className="live-metric-pill">
            <Check size={14} className="text-blue" />
            <div>
              <span className="m-label">{t.workout.sets}</span>
              <strong className="m-val">
                {liveStats.completedSets}/{liveStats.totalSets}
              </strong>
            </div>
          </div>

          {liveStats.prCount > 0 && (
            <div className="live-metric-pill pr-highlight">
              <Trophy size={14} className="text-amber" />
              <div>
                <span className="m-label">PRs</span>
                <strong className="m-val text-amber">{liveStats.prCount}</strong>
              </div>
            </div>
          )}
        </div>

        <div className="live-header-actions">
          {onSaveActiveToRoutine && (
            <button
              type="button"
              className="save-routine-live-btn"
              onClick={() => {
                onSaveActiveToRoutine(activeWorkout);
                setRoutineSavedToast(true);
                setTimeout(() => setRoutineSavedToast(false), 2400);
              }}
              title={
                lang === 'es'
                  ? 'Guardar estos pesos, series y ejercicios en tu rutina personal'
                  : 'Save these weights, sets, and exercises into your personal routine'
              }
            >
              <Save size={15} />
              <span>
                {routineSavedToast
                  ? lang === 'es'
                    ? '¡Rutina Guardada!'
                    : 'Routine Saved!'
                  : lang === 'es'
                  ? 'Guardar Rutina'
                  : 'Save Routine'}
              </span>
            </button>
          )}

          <button
            type="button"
            className="discard-workout-btn"
            onClick={() => {
              if (window.confirm(t.workout.confirmCancel)) {
                onCancelWorkout();
              }
            }}
          >
            <X size={16} />
            <span>{t.workout.cancelWorkout}</span>
          </button>

          <button
            type="button"
            className="finish-workout-btn"
            onClick={handleCompleteWorkoutClick}
          >
            <Check size={17} />
            <span>{t.workout.finishWorkout}</span>
          </button>
        </div>
      </div>

      {/* Exercise Logger Cards */}
      <div className="live-exercises-stack">
        {(activeWorkout.exercises || []).length === 0 ? (
          <div className="empty-workout-placeholder">
            <Dumbbell size={40} className="text-muted" />
            <p>{t.workout.noExercisesYet}</p>
            <button
              type="button"
              className="primary-btn"
              onClick={() => setShowAddExerciseModal(true)}
            >
              <Plus size={18} />
              <span>{t.workout.addExercise}</span>
            </button>
          </div>
        ) : (
          activeWorkout.exercises.map((exItem, exIdx) => {
            const exObj = exerciseMap[exItem.exerciseId] || {
              id: exItem.exerciseId,
              nameEs: exItem.exerciseId,
              nameEn: exItem.exerciseId,
              primaryMuscle: 'chest',
              equipment: 'barbell',
            };
            const prevSets = getPreviousExerciseSets(workouts, exItem.exerciseId);
            normalSetCounter = 0;

            return (
              <div
                key={`${exItem.exerciseId}-${exIdx}`}
                className={`live-exercise-card ${
                  exItem.supersetGroup ? `superset-${exItem.supersetGroup}` : ''
                }`}
              >
                {/* Exercise Card Header */}
                <div className="live-ex-card-header">
                  <div className="live-ex-title-with-thumb">
                    {exObj.thumbnailUrl && (
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
                          className="hevy-ex-thumb"
                        />
                      </button>
                    )}
                    <div className="live-ex-title-group">
                      {exItem.supersetGroup && (
                        <span
                          className={`superset-badge group-${exItem.supersetGroup}`}
                        >
                          {t.workout.supersetToggle} {exItem.supersetGroup}
                        </span>
                      )}
                      <h3>{getExName(exObj)}</h3>
                      <div className="live-ex-tags">
                        <span className="muscle-tag">
                          {t.muscles[exObj.primaryMuscle] || exObj.primaryMuscle}
                        </span>
                        <span className="equip-tag">
                          {t.equipment[exObj.equipment] || exObj.equipment}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="live-ex-controls">
                    <button
                      type="button"
                      className={`ex-tool-btn ${
                        exItem.supersetGroup ? 'active' : ''
                      }`}
                      onClick={() => handleToggleSuperset(exIdx)}
                      title="Toggle Superset Group (A / B / C)"
                    >
                      <Link2 size={14} />
                      <span>
                        {exItem.supersetGroup
                          ? `${t.workout.supersetToggle} ${exItem.supersetGroup}`
                          : t.workout.supersetToggle}
                      </span>
                    </button>

                    <div className="ex-rest-selector">
                      <Timer size={14} className="text-blue" />
                      <select
                        value={exItem.restSeconds ?? 90}
                        onChange={(e) => {
                          const val = Number(e.target.value);
                          setActiveWorkout((prev) => {
                            const nextExs = [...prev.exercises];
                            nextExs[exIdx] = { ...nextExs[exIdx], restSeconds: val };
                            return { ...prev, exercises: nextExs };
                          });
                        }}
                      >
                        <option value={0}>Off</option>
                        <option value={45}>45s</option>
                        <option value={60}>1m 00s</option>
                        <option value={75}>1m 15s</option>
                        <option value={90}>1m 30s</option>
                        <option value={120}>2m 00s</option>
                        <option value={150}>2m 30s</option>
                        <option value={180}>3m 00s</option>
                      </select>
                    </div>

                    <button
                      type="button"
                      className="ex-tool-btn"
                      onClick={() => {
                        const firstWeight = formatWeightValue(
                          exItem.sets?.[0]?.weight || 135,
                          unit
                        );
                        setPlatePopover(
                          platePopover?.exIdx === exIdx
                            ? null
                            : { exIdx, weight: firstWeight }
                        );
                      }}
                    >
                      <Disc size={14} />
                      <span>{t.workout.plateCalcBtn}</span>
                    </button>

                    <button
                      type="button"
                      className="ex-delete-btn"
                      onClick={() => handleRemoveExercise(exIdx)}
                      title="Remove Exercise"
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                </div>

                {/* Inline Plate Calculator Popover */}
                {platePopover?.exIdx === exIdx && (
                  <div className="inline-plate-popover">
                    <div className="plate-popover-top">
                      <strong>
                        <Disc size={15} className="text-blue" />{' '}
                        {t.tools.plateCalcTitle} ({unit.toUpperCase()})
                      </strong>
                      <div className="plate-popover-input">
                        <input
                          type="number"
                          value={platePopover.weight}
                          onChange={(e) =>
                            setPlatePopover({
                              exIdx,
                              weight: Number(e.target.value),
                            })
                          }
                        />
                        <span>{unit}</span>
                      </div>
                      <button
                        type="button"
                        className="icon-close-sm"
                        onClick={() => setPlatePopover(null)}
                      >
                        <X size={14} />
                      </button>
                    </div>
                    {(() => {
                      const breakdown = calculatePlateBreakdown(
                        platePopover.weight,
                        unit === 'kg' ? 20 : 45,
                        unit
                      );
                      return (
                        <div className="plate-popover-result">
                          <span>{t.tools.perSideLabel}</span>
                          {breakdown.platesPerSide.length === 0 ? (
                            <span className="text-muted">
                              {lang === 'es' ? 'Solo la barra olímpica' : 'Empty barbell only'}
                            </span>
                          ) : (
                            <div className="plate-pills-row">
                              {breakdown.platesPerSide.map((p, i) => (
                                <span
                                  key={i}
                                  className="mini-plate-badge"
                                  style={{
                                    backgroundColor: p.color,
                                    color: p.weight === 10 || p.weight === 5 ? '#0f172a' : '#fff',
                                  }}
                                >
                                  {p.label}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })()}
                  </div>
                )}

                {/* Pinned Note Input */}
                <input
                  type="text"
                  className="ex-pinned-note-input"
                  value={exItem.note || ''}
                  onChange={(e) => {
                    const val = e.target.value;
                    setActiveWorkout((prev) => {
                      const nextExs = [...prev.exercises];
                      nextExs[exIdx] = { ...nextExs[exIdx], note: val };
                      return { ...prev, exercises: nextExs };
                    });
                  }}
                  placeholder={t.workout.notesPlaceholder}
                />

                {/* Hevy Set Table */}
                <div className="hevy-sets-table">
                  <div className="hevy-sets-thead">
                    <span>{t.workout.setCol}</span>
                    <span>{t.workout.prevCol}</span>
                    <span>{unit.toUpperCase()}</span>
                    <span>{t.workout.repsCol}</span>
                    <span>{t.workout.rpeCol}</span>
                    <span>{t.workout.doneCol}</span>
                  </div>

                  {(exItem.sets || []).map((setObj, setIdx) => {
                    if (setObj.type === 'normal' || !setObj.type) {
                      normalSetCounter++;
                    }
                    const badgeLabel =
                      setObj.type === 'warmup'
                        ? 'W'
                        : setObj.type === 'dropset'
                        ? 'D'
                        : setObj.type === 'failure'
                        ? 'F'
                        : normalSetCounter;

                    const prevSet = prevSets[setIdx] || null;
                    const displayedWeight =
                      setObj.weight === ''
                        ? ''
                        : formatWeightValue(setObj.weight, unit);

                    return (
                      <div
                        key={setObj.id || setIdx}
                        className={`hevy-set-row ${
                          setObj.completed ? 'completed-row' : ''
                        }`}
                      >
                        {/* Set Type / Number Badge */}
                        <button
                          type="button"
                          className={`set-type-badge type-${
                            setObj.type || 'normal'
                          }`}
                          onClick={() => handleCycleSetType(exIdx, setIdx)}
                          title={
                            t.workout.setTypes[setObj.type || 'normal']
                          }
                        >
                          {badgeLabel}
                        </button>

                        {/* Previous Set Column (Click to Auto-fill) */}
                        <button
                          type="button"
                          className="prev-set-cell"
                          onClick={() =>
                            handleApplyPreviousSet(exIdx, setIdx, prevSet)
                          }
                          title={t.workout.clickPrevHint}
                        >
                          {prevSet ? (
                            <span>
                              {formatWeightValue(prevSet.weight, unit)} {unit} ×{' '}
                              {prevSet.reps}
                            </span>
                          ) : (
                            <span className="text-muted">—</span>
                          )}
                        </button>

                        {/* Weight Input */}
                        <div className="set-input-cell">
                          <input
                            type="number"
                            step="any"
                            min="0"
                            value={displayedWeight}
                            onChange={(e) =>
                              handleUpdateSetField(
                                exIdx,
                                setIdx,
                                'weight',
                                e.target.value
                              )
                            }
                            placeholder="0"
                          />
                        </div>

                        {/* Reps Input */}
                        <div className="set-input-cell">
                          <input
                            type="number"
                            min="0"
                            value={setObj.reps}
                            onChange={(e) =>
                              handleUpdateSetField(
                                exIdx,
                                setIdx,
                                'reps',
                                e.target.value
                              )
                            }
                            placeholder="0"
                          />
                        </div>

                        {/* RPE Selector */}
                        <div className="set-rpe-cell">
                          <select
                            value={setObj.rpe || ''}
                            onChange={(e) =>
                              handleUpdateSetField(
                                exIdx,
                                setIdx,
                                'rpe',
                                e.target.value
                              )
                            }
                          >
                            <option value="">—</option>
                            <option value="6">6</option>
                            <option value="7">7</option>
                            <option value="7.5">7.5</option>
                            <option value="8">8</option>
                            <option value="8.5">8.5</option>
                            <option value="9">9</option>
                            <option value="9.5">9.5</option>
                            <option value="10">10</option>
                          </select>
                        </div>

                        {/* Complete Checkmark + Delete Row */}
                        <div className="set-action-cell">
                          <button
                            type="button"
                            className={`set-check-btn ${
                              setObj.completed ? 'checked' : ''
                            }`}
                            onClick={() => handleToggleSetComplete(exIdx, setIdx)}
                          >
                            <Check size={16} strokeWidth={3} />
                          </button>

                          {setObj.isPR && (
                            <span className="row-pr-pill" title="Personal Record!">
                              🏆 PR
                            </span>
                          )}

                          <button
                            type="button"
                            className="remove-set-x"
                            onClick={() => handleRemoveSet(exIdx, setIdx)}
                            title="Delete Set"
                          >
                            <X size={13} />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Add Set Footer Button */}
                <button
                  type="button"
                  className="add-set-row-btn"
                  onClick={() => handleAddSet(exIdx)}
                >
                  {t.workout.addSet}
                </button>
              </div>
            );
          })
        )}

        {/* Big Add Exercise Button */}
        <button
          type="button"
          className="add-exercise-main-btn"
          onClick={() => setShowAddExerciseModal(true)}
        >
          <Plus size={19} />
          <span>{t.workout.addExercise}</span>
        </button>
      </div>

      {/* Floating Rest Timer Bar */}
      {restTimer.active && (
        <div className="floating-rest-timer-bar">
          <div className="rest-timer-progress-track">
            <div
              className="rest-timer-progress-fill"
              style={{
                width: `${Math.min(
                  100,
                  (restTimer.remaining / Math.max(1, restTimer.total)) * 100
                )}%`,
              }}
            />
          </div>
          <div className="rest-timer-content">
            <div className="rest-timer-info">
              <Timer size={18} className="text-blue pulse-icon" />
              <div>
                <span className="rest-label">
                  {t.workout.restActive} • {restTimer.exerciseName}
                </span>
                <strong className="rest-countdown">
                  {formatClock(restTimer.remaining)}
                </strong>
              </div>
            </div>

            <div className="rest-timer-btns">
              <button
                type="button"
                className="rest-adj-btn"
                onClick={() => adjustRestTimer(-15)}
              >
                -15s
              </button>
              <button
                type="button"
                className="rest-adj-btn"
                onClick={() => adjustRestTimer(15)}
              >
                +15s
              </button>
              <button
                type="button"
                className="rest-skip-btn"
                onClick={skipRestTimer}
              >
                {t.workout.skipRest}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Exercise Modal */}
      {showAddExerciseModal && (
        <div className="modal-backdrop" onClick={() => setShowAddExerciseModal(false)}>
          <div className="modal-panel" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>{t.workout.addExercise}</h3>
              <button
                type="button"
                className="modal-close-btn"
                onClick={() => setShowAddExerciseModal(false)}
              >
                <X size={18} />
              </button>
            </div>

            <div className="modal-search-bar">
              <Search size={16} />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={t.exercises.searchPlaceholder}
                autoFocus
              />
              <button
                type="button"
                className="mini-create-ex-btn"
                onClick={() => setCreatingCustom(!creatingCustom)}
              >
                {t.exercises.createCustomBtn}
              </button>
            </div>

            {creatingCustom && (
              <form onSubmit={handleCreateAndAddCustom} className="inline-custom-ex-form">
                <input
                  type="text"
                  value={customName}
                  onChange={(e) => setCustomName(e.target.value)}
                  placeholder={
                    lang === 'es'
                      ? 'Nombre del nuevo ejercicio...'
                      : 'Custom exercise name...'
                  }
                  required
                />
                <div className="form-row-2">
                  <select
                    value={customMuscle}
                    onChange={(e) => setCustomMuscle(e.target.value)}
                  >
                    {Object.keys(t.muscles)
                      .filter((k) => k !== 'all')
                      .map((mKey) => (
                        <option key={mKey} value={mKey}>
                          {t.muscles[mKey]}
                        </option>
                      ))}
                  </select>
                  <select
                    value={customEquipment}
                    onChange={(e) => setCustomEquipment(e.target.value)}
                  >
                    {Object.keys(t.equipment)
                      .filter((k) => k !== 'all')
                      .map((eqKey) => (
                        <option key={eqKey} value={eqKey}>
                          {t.equipment[eqKey]}
                        </option>
                      ))}
                  </select>
                </div>
                <button type="submit" className="primary-btn full-width">
                  <Plus size={16} />
                  <span>
                    {lang === 'es'
                      ? 'Guardar y Agregar al Entrenamiento'
                      : 'Save & Add to Workout'}
                  </span>
                </button>
              </form>
            )}

            <div className="muscle-filter-chips-scroll">
              {Object.keys(t.muscles).map((mKey) => (
                <button
                  key={mKey}
                  type="button"
                  className={`filter-chip ${muscleFilter === mKey ? 'active' : ''}`}
                  onClick={() => setMuscleFilter(mKey)}
                >
                  {t.muscles[mKey]}
                </button>
              ))}
            </div>

            <div className="modal-exercise-list">
              {filteredExercises.map((ex) => (
                <div key={ex.id} className="modal-ex-row">
                  <div className="modal-ex-left">
                    {ex.thumbnailUrl && (
                      <button
                        type="button"
                        className="thumb-zoom-btn"
                        onClick={(e) => {
                          e.stopPropagation();
                          setPreviewExercise(ex);
                        }}
                        title={
                          lang === 'es'
                            ? 'Ver imagen en grande'
                            : 'View large image'
                        }
                      >
                        <img
                          src={ex.thumbnailUrl}
                          alt={getExName(ex)}
                          className="routine-line-thumb"
                        />
                      </button>
                    )}
                    <div
                      className="modal-ex-text-click"
                      onClick={() => handleAddExerciseToActive(ex)}
                    >
                      <strong>{getExName(ex)}</strong>
                      <span className="modal-ex-sub">
                        {t.muscles[ex.primaryMuscle]} •{' '}
                        {t.equipment[ex.equipment]}
                      </span>
                    </div>
                  </div>
                  <button
                    type="button"
                    className="icon-btn-subtle"
                    onClick={() => handleAddExerciseToActive(ex)}
                  >
                    <Plus size={18} className="text-blue" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      <ExerciseMediaModal
        exercise={previewExercise}
        lang={lang}
        t={t}
        onClose={() => setPreviewExercise(null)}
      />
    </div>
  );
}
