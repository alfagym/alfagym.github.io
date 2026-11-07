import React, { useState, useMemo } from 'react';
import {
  Dumbbell,
  Search,
  Plus,
  Trophy,
  TrendingUp,
  History,
  Info,
  X,
  Check,
} from 'lucide-react';
import MuscleHeatmapSVG from './MuscleHeatmapSVG';
import {
  getExerciseStats,
  formatWeightValue,
  calculate1RM,
} from '../utils/workoutMath';

export default function ExercisesLibraryView({
  lang,
  unit,
  t,
  exercisesLibrary,
  onAddCustomExercise,
  workouts,
}) {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedMuscle, setSelectedMuscle] = useState('all');
  const [selectedEquipment, setSelectedEquipment] = useState('all');
  const [selectedExercise, setSelectedExercise] = useState(
    exercisesLibrary[0] || null
  );
  const [showCreateModal, setShowCreateModal] = useState(false);

  // Custom exercise form state
  const [newNameEs, setNewNameEs] = useState('');
  const [newPrimary, setNewPrimary] = useState('chest');
  const [newEquipment, setNewEquipment] = useState('dumbbell');
  const [newTips, setNewTips] = useState('');

  const getExName = (ex) => {
    if (!ex) return '';
    return lang === 'es' ? ex.nameEs || ex.nameEn : ex.nameEn || ex.nameEs;
  };

  const getExTips = (ex) => {
    if (!ex) return '';
    return lang === 'es' ? ex.tipsEs || ex.tipsEn : ex.tipsEn || ex.tipsEs;
  };

  const filteredExercises = useMemo(() => {
    return exercisesLibrary.filter((ex) => {
      const matchesMuscle =
        selectedMuscle === 'all' ||
        ex.primaryMuscle === selectedMuscle ||
        (ex.secondaryMuscles || []).includes(selectedMuscle);
      const matchesEquip =
        selectedEquipment === 'all' || ex.equipment === selectedEquipment;
      const q = searchQuery.trim().toLowerCase();
      const matchesSearch =
        !q ||
        (ex.nameEs || '').toLowerCase().includes(q) ||
        (ex.nameEn || '').toLowerCase().includes(q);
      return matchesMuscle && matchesEquip && matchesSearch;
    });
  }, [exercisesLibrary, selectedMuscle, selectedEquipment, searchQuery]);

  const activeExStats = useMemo(() => {
    if (!selectedExercise) return null;
    return getExerciseStats(workouts, selectedExercise.id);
  }, [workouts, selectedExercise]);

  const handleCreateCustom = (e) => {
    e.preventDefault();
    if (!newNameEs.trim()) return;
    const created = onAddCustomExercise({
      nameEs: newNameEs.trim(),
      nameEn: newNameEs.trim(),
      primaryMuscle: newPrimary,
      secondaryMuscles: [],
      equipment: newEquipment,
      defaultRestSeconds: 90,
      tipsEs: newTips.trim() || 'Ejercicio personalizado agregado por el atleta.',
      tipsEn: newTips.trim() || 'Custom exercise created by athlete.',
    });
    setSelectedExercise(created);
    setNewNameEs('');
    setNewTips('');
    setShowCreateModal(false);
  };

  return (
    <div className="section-container">
      {/* Top Header */}
      <div className="section-top-header">
        <div>
          <h2>
            <Dumbbell size={22} className="text-blue" /> {t.exercises.title}
          </h2>
          <p className="section-subtitle">{t.exercises.subtitle}</p>
        </div>

        <button
          type="button"
          className="primary-btn"
          onClick={() => setShowCreateModal(true)}
        >
          <Plus size={18} />
          <span>{t.exercises.createCustomBtn}</span>
        </button>
      </div>

      <div className="exercises-layout-grid">
        {/* Left Column: Anatomical Muscle Map & Search/List */}
        <div className="exercises-left-col">
          {/* Interactive Anatomical Muscle Map Card */}
          <div className="anatomy-filter-card">
            <div className="anatomy-card-top">
              <strong>{t.exercises.muscleMapTitle}</strong>
              {selectedMuscle !== 'all' && (
                <button
                  type="button"
                  className="clear-muscle-btn"
                  onClick={() => setSelectedMuscle('all')}
                >
                  {t.exercises.clearFilter}
                </button>
              )}
            </div>

            <MuscleHeatmapSVG
              selectedMuscle={selectedMuscle}
              primaryMuscles={
                selectedExercise ? [selectedExercise.primaryMuscle] : []
              }
              secondaryMuscles={selectedExercise?.secondaryMuscles || []}
              onSelectMuscle={(m) => setSelectedMuscle(m)}
              t={t}
            />
          </div>

          {/* Search & Filters */}
          <div className="ex-search-filter-box">
            <div className="modal-search-bar">
              <Search size={16} />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={t.exercises.searchPlaceholder}
              />
              {searchQuery && (
                <button
                  type="button"
                  className="icon-close-sm"
                  onClick={() => setSearchQuery('')}
                >
                  <X size={14} />
                </button>
              )}
            </div>

            <div className="muscle-filter-chips-scroll">
              {Object.keys(t.muscles).map((mKey) => (
                <button
                  key={mKey}
                  type="button"
                  className={`filter-chip ${
                    selectedMuscle === mKey ? 'active' : ''
                  }`}
                  onClick={() => setSelectedMuscle(mKey)}
                >
                  {t.muscles[mKey]}
                </button>
              ))}
            </div>

            <div className="muscle-filter-chips-scroll">
              {Object.keys(t.equipment).map((eqKey) => (
                <button
                  key={eqKey}
                  type="button"
                  className={`filter-chip subtle ${
                    selectedEquipment === eqKey ? 'active' : ''
                  }`}
                  onClick={() => setSelectedEquipment(eqKey)}
                >
                  {t.equipment[eqKey]}
                </button>
              ))}
            </div>
          </div>

          {/* Scrollable Exercise Directory */}
          <div className="ex-directory-list">
            {filteredExercises.map((ex) => {
              const stats = getExerciseStats(workouts, ex.id);
              const isSelected = selectedExercise?.id === ex.id;
              return (
                <button
                  key={ex.id}
                  type="button"
                  className={`ex-directory-item ${isSelected ? 'active' : ''}`}
                  onClick={() => setSelectedExercise(ex)}
                >
                  <div className="ex-dir-info">
                    <strong>{getExName(ex)}</strong>
                    <div className="ex-dir-badges">
                      <span className="muscle-tag">
                        {t.muscles[ex.primaryMuscle]}
                      </span>
                      <span className="equip-tag">
                        {t.equipment[ex.equipment]}
                      </span>
                    </div>
                  </div>
                  {stats.best1RM > 0 && (
                    <div className="ex-dir-pr">
                      <span className="pr-mini-label">1RM</span>
                      <strong>
                        {formatWeightValue(stats.best1RM, unit)} {unit}
                      </strong>
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Right Column: Selected Exercise Detail, PRs, Progression Chart & History */}
        {selectedExercise && activeExStats && (
          <div className="exercise-detail-panel">
            <div className="ex-detail-header">
              <div>
                <div className="live-ex-tags mb-6">
                  <span className="muscle-tag">
                    {t.exercises.primaryMuscle}:{' '}
                    {t.muscles[selectedExercise.primaryMuscle]}
                  </span>
                  {(selectedExercise.secondaryMuscles || []).length > 0 && (
                    <span className="equip-tag">
                      {t.exercises.secondaryMuscles}:{' '}
                      {selectedExercise.secondaryMuscles
                        .map((m) => t.muscles[m])
                        .join(', ')}
                    </span>
                  )}
                  <span className="equip-tag">
                    {t.equipment[selectedExercise.equipment]}
                  </span>
                </div>
                <h2>{getExName(selectedExercise)}</h2>
              </div>
            </div>

            {getExTips(selectedExercise) && (
              <div className="ex-cue-banner">
                <Info size={16} className="text-blue shrink-0" />
                <p>{getExTips(selectedExercise)}</p>
              </div>
            )}

            {/* Personal Records Strip */}
            <div className="ex-pr-strip">
              <div className="ex-pr-card">
                <span className="pr-card-label">
                  <Trophy size={13} className="text-amber" /> {t.exercises.best1RM}
                </span>
                <strong className="pr-card-val text-amber">
                  {activeExStats.best1RM > 0
                    ? `${formatWeightValue(activeExStats.best1RM, unit)} ${unit}`
                    : '—'}
                </strong>
              </div>

              <div className="ex-pr-card">
                <span className="pr-card-label">{t.exercises.maxWeight}</span>
                <strong className="pr-card-val text-blue">
                  {activeExStats.maxWeight > 0
                    ? `${formatWeightValue(activeExStats.maxWeight, unit)} ${unit}`
                    : '—'}
                </strong>
              </div>

              <div className="ex-pr-card">
                <span className="pr-card-label">
                  {t.exercises.bestVolumeSet}
                </span>
                <strong className="pr-card-val text-emerald">
                  {activeExStats.bestSetLabel}
                </strong>
              </div>
            </div>

            {/* 1RM Progression Chart */}
            <div className="ex-chart-box">
              <h4>
                <TrendingUp size={16} className="text-blue" />{' '}
                {t.exercises.chartTab} (1RM {unit.toUpperCase()})
              </h4>
              {activeExStats.sessionHistory.length === 0 ? (
                <p className="empty-chart-msg">
                  {lang === 'es'
                    ? 'Registra este ejercicio en un entrenamiento para ver tu gráfica de progreso.'
                    : 'Log this exercise in a workout to see your progression chart.'}
                </p>
              ) : (
                <div className="ex-bars-chart">
                  {[...activeExStats.sessionHistory]
                    .reverse()
                    .map((sess, idx, arr) => {
                      const maxVal = Math.max(
                        1,
                        ...arr.map((x) => x.sessionBest1RM)
                      );
                      const heightPct = Math.max(
                        18,
                        Math.round((sess.sessionBest1RM / maxVal) * 100)
                      );
                      return (
                        <div key={idx} className="ex-bar-col">
                          <span className="ex-bar-top-val">
                            {formatWeightValue(sess.sessionBest1RM, unit)}
                          </span>
                          <div className="ex-bar-track">
                            <div
                              className="ex-bar-fill"
                              style={{ height: `${heightPct}%` }}
                            />
                          </div>
                          <span className="ex-bar-date">
                            {new Date(sess.date).toLocaleDateString(
                              lang === 'es' ? 'es-ES' : 'en-US',
                              { month: 'short', day: 'numeric' }
                            )}
                          </span>
                        </div>
                      );
                    })}
                </div>
              )}
            </div>

            {/* Session History for this Exercise */}
            <div className="ex-history-section">
              <h4>
                <History size={16} className="text-emerald" />{' '}
                {t.exercises.historyTab}
              </h4>

              {activeExStats.sessionHistory.length === 0 ? (
                <p className="empty-chart-msg">
                  {lang === 'es'
                    ? 'Sin series registradas aún.'
                    : 'No sets logged yet.'}
                </p>
              ) : (
                <div className="ex-history-cards">
                  {activeExStats.sessionHistory.map((sess, idx) => (
                    <div key={idx} className="ex-history-card">
                      <div className="ex-hist-top">
                        <strong>{sess.workoutName}</strong>
                        <span>
                          {new Date(sess.date).toLocaleDateString(
                            lang === 'es' ? 'es-ES' : 'en-US',
                            {
                              year: 'numeric',
                              month: 'short',
                              day: 'numeric',
                            }
                          )}
                        </span>
                      </div>
                      {sess.note && (
                        <p className="ex-hist-note">“{sess.note}”</p>
                      )}
                      <div className="ex-hist-sets-pills">
                        {sess.sets.map((s, sIdx) => (
                          <span
                            key={sIdx}
                            className={`hist-set-pill ${s.isPR ? 'pr' : ''}`}
                          >
                            {s.type === 'warmup'
                              ? 'W'
                              : s.type === 'dropset'
                              ? 'D'
                              : s.type === 'failure'
                              ? 'F'
                              : `#${sIdx + 1}`}
                            : {formatWeightValue(s.weight, unit)} {unit} ×{' '}
                            {s.reps}{' '}
                            <small>
                              (1RM:{' '}
                              {formatWeightValue(
                                calculate1RM(s.weight, s.reps),
                                unit
                              )}
                              )
                            </small>
                            {s.isPR && ' 🏆'}
                          </span>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Create Custom Exercise Modal */}
      {showCreateModal && (
        <div
          className="modal-backdrop"
          onClick={() => setShowCreateModal(false)}
        >
          <div className="modal-panel" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>{t.exercises.createCustomBtn}</h3>
              <button
                type="button"
                className="modal-close-btn"
                onClick={() => setShowCreateModal(false)}
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleCreateCustom} className="auth-form">
              <div className="form-group">
                <label>
                  {lang === 'es'
                    ? 'Nombre del Ejercicio'
                    : 'Exercise Name'}
                </label>
                <input
                  type="text"
                  value={newNameEs}
                  onChange={(e) => setNewNameEs(e.target.value)}
                  placeholder="Ej. Sentadilla Pendular / Pendulum Squat"
                  required
                  autoFocus
                />
              </div>

              <div className="form-row-2">
                <div className="form-group">
                  <label>{t.exercises.primaryMuscle}</label>
                  <select
                    value={newPrimary}
                    onChange={(e) => setNewPrimary(e.target.value)}
                  >
                    {Object.keys(t.muscles)
                      .filter((k) => k !== 'all')
                      .map((mKey) => (
                        <option key={mKey} value={mKey}>
                          {t.muscles[mKey]}
                        </option>
                      ))}
                  </select>
                </div>

                <div className="form-group">
                  <label>
                    {lang === 'es' ? 'Equipo' : 'Equipment'}
                  </label>
                  <select
                    value={newEquipment}
                    onChange={(e) => setNewEquipment(e.target.value)}
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
              </div>

              <div className="form-group">
                <label>
                  {lang === 'es'
                    ? 'Notas Técnicas o Consejos'
                    : 'Form Tips or Cues'}
                </label>
                <input
                  type="text"
                  value={newTips}
                  onChange={(e) => setNewTips(e.target.value)}
                  placeholder="Ej. Mantener espalda apoyada y bajar en 3s..."
                />
              </div>

              <button type="submit" className="primary-btn full-width mt-16">
                <Check size={18} />
                <span>
                  {lang === 'es'
                    ? 'Guardar Ejercicio'
                    : 'Save Custom Exercise'}
                </span>
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
