import React, { useMemo } from 'react';
import {
  BarChart3,
  Trophy,
  Flame,
  Calendar,
  Clock,
  Dumbbell,
  RotateCcw,
  Trash2,
  Activity,
} from 'lucide-react';
import MuscleHeatmapSVG from './MuscleHeatmapSVG';
import {
  formatDurationHuman,
  formatWeightValue,
  calculate1RM,
} from '../utils/workoutMath';

export default function AnalyticsHistoryView({
  lang,
  unit,
  t,
  workouts,
  setWorkouts,
  exercisesLibrary,
  onStartRoutineWorkout,
}) {
  const exerciseMap = useMemo(() => {
    const m = {};
    for (const ex of exercisesLibrary) m[ex.id] = ex;
    return m;
  }, [exercisesLibrary]);

  const getExName = (ex) => {
    if (!ex) return 'Ejercicio';
    return lang === 'es' ? ex.nameEs || ex.nameEn : ex.nameEn || ex.nameEs;
  };

  // Global KPI stats & muscle set counts
  const analyticsData = useMemo(() => {
    let totalVolumeLbs = 0;
    let totalSets = 0;
    let totalPRs = 0;
    const muscleSetCounts = {};

    for (const wk of workouts) {
      totalVolumeLbs += Number(wk.totalVolumeLbs) || 0;
      totalSets += Number(wk.totalSets) || 0;
      totalPRs += Number(wk.prCount) || 0;

      for (const exItem of wk.exercises || []) {
        const exDef = exerciseMap[exItem.exerciseId];
        const mKey = exDef?.primaryMuscle || 'chest';
        const sCount = (exItem.sets || []).length;
        muscleSetCounts[mKey] = (muscleSetCounts[mKey] || 0) + sCount;

        for (const sec of exDef?.secondaryMuscles || []) {
          muscleSetCounts[sec] = (muscleSetCounts[sec] || 0) + Math.ceil(sCount * 0.5);
        }
      }
    }

    return {
      totalWorkouts: workouts.length,
      totalVolumeLbs,
      totalSets,
      totalPRs,
      muscleSetCounts,
    };
  }, [workouts, exerciseMap]);

  // Last 28 days calendar grid (local YYYY-MM-DD, immune to UTC-midnight & DST drift)
  const calendarDays = useMemo(() => {
    const formatLocalYmd = (dateInput) => {
      if (!dateInput) return '';
      if (typeof dateInput === 'string') {
        const trimmed = dateInput.trim();
        if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
          return trimmed;
        }
      }
      const d = dateInput instanceof Date ? dateInput : new Date(dateInput);
      if (Number.isNaN(d.getTime())) return '';
      const yyyy = d.getFullYear();
      const mm = String(d.getMonth() + 1).padStart(2, '0');
      const dd = String(d.getDate()).padStart(2, '0');
      return `${yyyy}-${mm}-${dd}`;
    };

    const workoutDateSet = new Set(
      workouts.map((w) => formatLocalYmd(w?.date)).filter(Boolean)
    );
    const days = [];
    const now = new Date();
    for (let i = 27; i >= 0; i--) {
      const d = new Date(
        now.getFullYear(),
        now.getMonth(),
        now.getDate() - i,
        12,
        0,
        0
      );
      const iso = formatLocalYmd(d);
      days.push({
        iso,
        dayNum: d.getDate(),
        weekday: d.toLocaleDateString(lang === 'es' ? 'es-ES' : 'en-US', {
          weekday: 'narrow',
        }),
        trained: workoutDateSet.has(iso),
      });
    }
    return days;
  }, [workouts, lang]);

  const handleDeleteWorkout = (wkId) => {
    setWorkouts((prev) => prev.filter((w) => w.id !== wkId));
  };

  const handleRepeatWorkout = (wk) => {
    onStartRoutineWorkout({
      id: wk.routineId || null,
      name: wk.name,
      notes: wk.notes || '',
      exercises: (wk.exercises || []).map((e) => ({
        exerciseId: e.exerciseId,
        restSeconds: Number(e.restSeconds) || 45,
        note: e.note || '',
        sets: (e.sets || []).map((s) => ({
          type: s.type || 'normal',
          weight: s.weight,
          reps: s.reps,
          rpe: s.rpe || 8,
        })),
      })),
    });
  };

  const sortedChronological = useMemo(() => {
    return [...workouts]
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
      .slice(-10);
  }, [workouts]);

  const muscleEntries = useMemo(() => {
    const entries = Object.entries(analyticsData.muscleSetCounts).sort(
      (a, b) => b[1] - a[1]
    );
    const maxCount = Math.max(1, ...(entries.map((e) => e[1]) || [1]));
    return entries.map(([mKey, count]) => ({
      mKey,
      label: t.muscles[mKey] || mKey,
      count,
      pct: Math.round((count / maxCount) * 100),
    }));
  }, [analyticsData.muscleSetCounts, t.muscles]);

  return (
    <div className="section-container">
      {/* Header */}
      <div className="section-top-header">
        <div>
          <h2>
            <BarChart3 size={22} className="text-blue" /> {t.analytics.title}
          </h2>
          <p className="section-subtitle">{t.analytics.subtitle}</p>
        </div>
      </div>

      {/* Top KPI Cards */}
      <div className="analytics-kpi-grid">
        <div className="analytics-kpi-card">
          <div className="kpi-icon-circle blue">
            <Dumbbell size={20} />
          </div>
          <div>
            <span className="kpi-label">{t.analytics.totalWorkouts}</span>
            <strong className="kpi-big-val">{analyticsData.totalWorkouts}</strong>
          </div>
        </div>

        <div className="analytics-kpi-card">
          <div className="kpi-icon-circle emerald">
            <Activity size={20} />
          </div>
          <div>
            <span className="kpi-label">{t.analytics.totalVolume}</span>
            <strong className="kpi-big-val">
              {formatWeightValue(
                analyticsData.totalVolumeLbs,
                unit
              ).toLocaleString()}{' '}
              <small>{unit}</small>
            </strong>
          </div>
        </div>

        <div className="analytics-kpi-card">
          <div className="kpi-icon-circle purple">
            <BarChart3 size={20} />
          </div>
          <div>
            <span className="kpi-label">{t.analytics.totalSets}</span>
            <strong className="kpi-big-val">{analyticsData.totalSets}</strong>
          </div>
        </div>

        <div className="analytics-kpi-card">
          <div className="kpi-icon-circle amber">
            <Flame size={20} />
          </div>
          <div>
            <span className="kpi-label">{t.analytics.activeStreak}</span>
            <strong className="kpi-big-val">
              {Math.max(1, workouts.length)} 🔥{' '}
              <small>({analyticsData.totalPRs} PRs 🏆)</small>
            </strong>
          </div>
        </div>
      </div>

      {/* Charts & Muscle Split Row */}
      <div className="analytics-two-col">
        {/* Session Volume Progression + Training Calendar */}
        <div className="analytics-card">
          <h4>
            <BarChart3 size={16} className="text-blue" />{' '}
            {t.analytics.weeklyVolumeChart} ({unit.toUpperCase()})
          </h4>

          <div className="ex-bars-chart">
            {sortedChronological.map((wk, idx, arr) => {
              const maxVol = Math.max(
                1,
                ...arr.map((w) => Number(w.totalVolumeLbs) || 1)
              );
              const pct = Math.max(
                15,
                Math.round(((Number(wk.totalVolumeLbs) || 0) / maxVol) * 100)
              );
              return (
                <div key={wk.id || idx} className="ex-bar-col">
                  <span className="ex-bar-top-val">
                    {(
                      formatWeightValue(wk.totalVolumeLbs, unit) / 1000
                    ).toFixed(1)}
                    k
                  </span>
                  <div className="ex-bar-track">
                    <div
                      className="ex-bar-fill"
                      style={{ height: `${pct}%` }}
                      title={`${wk.name}: ${formatWeightValue(
                        wk.totalVolumeLbs,
                        unit
                      ).toLocaleString()} ${unit}`}
                    />
                  </div>
                  <span className="ex-bar-date">
                    {new Date(wk.date).toLocaleDateString(
                      lang === 'es' ? 'es-ES' : 'en-US',
                      { month: 'short', day: 'numeric' }
                    )}
                  </span>
                </div>
              );
            })}
          </div>

          <h4 className="mt-20">
            <Calendar size={16} className="text-emerald" />{' '}
            {t.analytics.calendarTitle} (28 {lang === 'es' ? 'Días' : 'Days'})
          </h4>
          <div className="calendar-28-grid">
            {calendarDays.map((day) => (
              <div
                key={day.iso}
                className={`calendar-day-cell ${day.trained ? 'trained' : ''}`}
                title={day.iso}
              >
                <span className="cal-weekday">{day.weekday}</span>
                <strong className="cal-daynum">{day.dayNum}</strong>
              </div>
            ))}
          </div>
        </div>

        {/* Muscle Group Split + Anatomical Volume Heatmap */}
        <div className="analytics-card">
          <h4>
            <Trophy size={16} className="text-amber" />{' '}
            {t.analytics.muscleSplitTitle}
          </h4>

          <div className="muscle-split-grid">
            <div className="muscle-bars-list">
              {muscleEntries.slice(0, 8).map((item) => (
                <div key={item.mKey} className="muscle-split-row">
                  <div className="muscle-split-label-row">
                    <span>{item.label}</span>
                    <strong>
                      {item.count} {t.routines.setsCount}
                    </strong>
                  </div>
                  <div className="muscle-split-track">
                    <div
                      className="muscle-split-fill"
                      style={{ width: `${item.pct}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>

            <div className="muscle-split-anatomy">
              <MuscleHeatmapSVG
                muscleScores={analyticsData.muscleSetCounts}
                t={t}
                compact
              />
            </div>
          </div>
        </div>
      </div>

      {/* Hevy-Style Workout History Feed */}
      <div className="workout-feed-section">
        <h3>
          <Clock size={19} className="text-blue" />{' '}
          {t.analytics.workoutFeedTitle}
        </h3>

        <div className="workout-feed-list">
          {workouts.map((wk) => (
            <div key={wk.id} className="hevy-feed-card">
              <div className="feed-card-header">
                <div>
                  <h4>{wk.name}</h4>
                  <span className="feed-date-text">
                    {new Date(wk.date).toLocaleDateString(
                      lang === 'es' ? 'es-ES' : 'en-US',
                      {
                        weekday: 'short',
                        year: 'numeric',
                        month: 'short',
                        day: 'numeric',
                      }
                    )}
                  </span>
                </div>

                <div className="feed-card-actions">
                  <button
                    type="button"
                    className="ex-tool-btn"
                    onClick={() => handleRepeatWorkout(wk)}
                  >
                    <RotateCcw size={14} />
                    <span>{t.analytics.repeatWorkoutBtn}</span>
                  </button>
                  <button
                    type="button"
                    className="ex-delete-btn"
                    onClick={() => handleDeleteWorkout(wk.id)}
                    title={t.analytics.deleteWorkoutBtn}
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              </div>

              {/* Feed Metrics Row */}
              <div className="feed-metrics-row">
                <div className="feed-metric">
                  <span>{t.workout.duration}</span>
                  <strong>{formatDurationHuman(wk.durationSeconds)}</strong>
                </div>
                <div className="feed-metric">
                  <span>{t.workout.volume}</span>
                  <strong className="text-blue">
                    {formatWeightValue(
                      wk.totalVolumeLbs,
                      unit
                    ).toLocaleString()}{' '}
                    {unit}
                  </strong>
                </div>
                <div className="feed-metric">
                  <span>{t.workout.sets}</span>
                  <strong>{wk.totalSets}</strong>
                </div>
                {wk.prCount > 0 && (
                  <div className="feed-metric">
                    <span>{t.workout.prs}</span>
                    <strong className="text-amber">🏆 {wk.prCount} PRs</strong>
                  </div>
                )}
              </div>

              {wk.notes && <p className="feed-workout-note">“{wk.notes}”</p>}

              {/* Exercise Summary Lines (Hevy Feed Style) */}
              <div className="feed-exercises-table">
                {(wk.exercises || []).map((exItem, idx) => {
                  const exObj = exerciseMap[exItem.exerciseId];
                  const sets = exItem.sets || [];
                  const bestSet = sets.reduce((best, cur) => {
                    const cur1RM = calculate1RM(cur.weight, cur.reps);
                    const best1RM = best
                      ? calculate1RM(best.weight, best.reps)
                      : 0;
                    return cur1RM >= best1RM ? cur : best;
                  }, sets[0]);

                  return (
                    <div key={idx} className="feed-ex-row">
                      <div className="feed-ex-left">
                        <span className="feed-ex-set-count">{sets.length}×</span>
                        <strong>{getExName(exObj)}</strong>
                      </div>
                      {bestSet && (
                        <div className="feed-ex-best">
                          <span>
                            {lang === 'es' ? 'Mejor serie:' : 'Best set:'}{' '}
                            <strong>
                              {formatWeightValue(bestSet.weight, unit)} {unit} ×{' '}
                              {bestSet.reps}
                            </strong>
                          </span>
                          {sets.some((s) => s.isPR) && (
                            <span className="row-pr-pill">🏆 PR</span>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
