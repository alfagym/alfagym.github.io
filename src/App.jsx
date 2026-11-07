import React, { useState, useEffect, useMemo } from 'react';
import {
  Dumbbell,
  PlayCircle,
  FolderKanban,
  BarChart3,
  Disc,
  Cloud,
  Globe,
  LogOut,
  Scale,
  Flame,
  Timer,
} from 'lucide-react';
import { translations } from './data/translations';
import {
  EXERCISES_LIBRARY,
  DEFAULT_ROUTINES,
  createInitialWorkouts,
  createInitialMeasurements,
} from './data/gymData';
import { formatClock, playGymSound } from './utils/workoutMath';
import { pushToGitHubGist } from './utils/githubSync';
import AuthScreen from './components/AuthScreen';
import LiveWorkoutLogger from './components/LiveWorkoutLogger';
import RoutinesView from './components/RoutinesView';
import ExercisesLibraryView from './components/ExercisesLibraryView';
import AnalyticsHistoryView from './components/AnalyticsHistoryView';
import ToolsAndBodyView from './components/ToolsAndBodyView';
import CloudSyncModal from './components/CloudSyncModal';
import './App.css';

/* global __BUILD_TIMESTAMP__ */
const FALLBACK_TIMESTAMP = '10:34 PM - 11/06/2026';
const BUILD_TIMESTAMP =
  typeof __BUILD_TIMESTAMP__ !== 'undefined'
    ? __BUILD_TIMESTAMP__
    : FALLBACK_TIMESTAMP;

const DEFAULT_ACCOUNTS = [
  {
    id: 'raydel-alfa',
    name: 'Raydel',
    identifier: 'raydel',
    passwordHash:
      'a665a45920422f9d417e4867efdc4fb8a04a1f3fff1fa07e998e86f7f7a27ae3',
    goal: 'hypertrophy',
    preferredUnit: 'lbs',
    streak: 5,
    createdAt: '2026-11-06T22:00:00.000Z',
  },
];

export default function App() {
  // Language & Weight Unit (Defaults: Spanish + lbs)
  const [lang, setLang] = useState(() => {
    return localStorage.getItem('alfa_gym_lang') || 'es';
  });

  const [unit, setUnit] = useState(() => {
    return localStorage.getItem('alfa_gym_unit') || 'lbs';
  });

  // Accounts & Active Session
  const [accounts, setAccounts] = useState(() => {
    try {
      const saved = localStorage.getItem('alfa_gym_accounts');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch {
      // ignore
    }
    return DEFAULT_ACCOUNTS;
  });

  const [currentUser, setCurrentUser] = useState(() => {
    try {
      const saved = localStorage.getItem('alfa_gym_current_user');
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });

  // Main Navigation Tab
  const [activeTab, setActiveTab] = useState('workout');
  const [showCloudModal, setShowCloudModal] = useState(false);

  // Workouts History
  const [workouts, setWorkouts] = useState(() => {
    try {
      const saved = localStorage.getItem('alfa_gym_workouts');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch {
      // ignore
    }
    return createInitialWorkouts();
  });

  // Routines
  const [routines, setRoutines] = useState(() => {
    try {
      const saved = localStorage.getItem('alfa_gym_routines');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch {
      // ignore
    }
    return DEFAULT_ROUTINES;
  });

  // Custom Exercises
  const [customExercises, setCustomExercises] = useState(() => {
    try {
      const saved = localStorage.getItem('alfa_gym_custom_exercises');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  // Body Measurements
  const [measurements, setMeasurements] = useState(() => {
    try {
      const saved = localStorage.getItem('alfa_gym_measurements');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch {
      // ignore
    }
    return createInitialMeasurements();
  });

  // Cloud Sync Config
  const [cloudConfig, setCloudConfig] = useState(() => {
    try {
      const saved = localStorage.getItem('alfa_gym_cloud_config');
      return saved
        ? JSON.parse(saved)
        : { token: '', gistId: '', autoSync: false, lastSynced: null };
    } catch {
      return { token: '', gistId: '', autoSync: false, lastSynced: null };
    }
  });

  // Active Live Workout State
  const [activeWorkout, setActiveWorkout] = useState(() => {
    try {
      const saved = localStorage.getItem('alfa_gym_active_workout');
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });

  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  // Rest Timer State
  const [restTimer, setRestTimer] = useState({
    active: false,
    remaining: 0,
    total: 90,
    exerciseName: '',
  });

  // Persist to LocalStorage
  useEffect(() => {
    localStorage.setItem('alfa_gym_lang', lang);
  }, [lang]);

  useEffect(() => {
    localStorage.setItem('alfa_gym_unit', unit);
  }, [unit]);

  useEffect(() => {
    localStorage.setItem('alfa_gym_accounts', JSON.stringify(accounts));
  }, [accounts]);

  useEffect(() => {
    if (currentUser) {
      localStorage.setItem('alfa_gym_current_user', JSON.stringify(currentUser));
    } else {
      localStorage.removeItem('alfa_gym_current_user');
    }
  }, [currentUser]);

  useEffect(() => {
    localStorage.setItem('alfa_gym_workouts', JSON.stringify(workouts));
  }, [workouts]);

  useEffect(() => {
    localStorage.setItem('alfa_gym_routines', JSON.stringify(routines));
  }, [routines]);

  useEffect(() => {
    localStorage.setItem(
      'alfa_gym_custom_exercises',
      JSON.stringify(customExercises)
    );
  }, [customExercises]);

  useEffect(() => {
    localStorage.setItem('alfa_gym_measurements', JSON.stringify(measurements));
  }, [measurements]);

  useEffect(() => {
    localStorage.setItem('alfa_gym_cloud_config', JSON.stringify(cloudConfig));
  }, [cloudConfig]);

  useEffect(() => {
    if (activeWorkout) {
      localStorage.setItem(
        'alfa_gym_active_workout',
        JSON.stringify(activeWorkout)
      );
    } else {
      localStorage.removeItem('alfa_gym_active_workout');
    }
  }, [activeWorkout]);

  // Live Workout Stopwatch Ticker
  useEffect(() => {
    if (!activeWorkout) {
      setElapsedSeconds(0);
      return;
    }
    const startedAt = activeWorkout.startedAt || Date.now();
    const updateClock = () => {
      setElapsedSeconds(Math.max(0, Math.floor((Date.now() - startedAt) / 1000)));
    };
    updateClock();
    const interval = setInterval(updateClock, 1000);
    return () => clearInterval(interval);
  }, [activeWorkout]);

  // Rest Timer Ticker
  useEffect(() => {
    if (!restTimer.active) return;
    const interval = setInterval(() => {
      setRestTimer((prev) => {
        if (!prev.active) return prev;
        if (prev.remaining <= 1) {
          playGymSound('timerDone');
          return { ...prev, active: false, remaining: 0 };
        }
        return { ...prev, remaining: prev.remaining - 1 };
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [restTimer.active]);

  const t = translations[lang] || translations.es;

  const fullExercisesLibrary = useMemo(() => {
    return [...customExercises, ...EXERCISES_LIBRARY];
  }, [customExercises]);

  const handleAddCustomExercise = (exData) => {
    const created = {
      id: `custom-${Date.now()}`,
      ...exData,
    };
    setCustomExercises((prev) => [created, ...prev]);
    return created;
  };

  const startRestTimer = (seconds, exerciseName = '') => {
    setRestTimer({
      active: true,
      remaining: seconds,
      total: seconds,
      exerciseName,
    });
  };

  const adjustRestTimer = (deltaSeconds) => {
    setRestTimer((prev) => {
      const nextRem = Math.max(0, prev.remaining + deltaSeconds);
      if (nextRem === 0) {
        return { ...prev, active: false, remaining: 0 };
      }
      return {
        ...prev,
        remaining: nextRem,
        total: Math.max(prev.total, nextRem),
      };
    });
  };

  const skipRestTimer = () => {
    setRestTimer((prev) => ({ ...prev, active: false, remaining: 0 }));
  };

  const handleStartEmptyWorkout = () => {
    setActiveWorkout({
      id: `live-${Date.now()}`,
      name:
        lang === 'es'
          ? 'Entrenamiento Alfa Gym'
          : 'Alfa Gym Session',
      startedAt: Date.now(),
      notes: '',
      exercises: [],
    });
    setActiveTab('workout');
  };

  const handleStartRoutineWorkout = (routine) => {
    setActiveWorkout({
      id: `live-${Date.now()}`,
      name: routine.name,
      routineId: routine.id || null,
      startedAt: Date.now(),
      notes: routine.notes || '',
      exercises: (routine.exercises || []).map((ex) => ({
        exerciseId: ex.exerciseId,
        restSeconds: ex.restSeconds || 90,
        supersetGroup: null,
        note: ex.note || '',
        sets: (ex.sets || []).map((s, idx) => ({
          id: `s-${Date.now()}-${idx}-${Math.random().toString(36).slice(2, 5)}`,
          type: s.type || 'normal',
          weight: s.weight,
          reps: s.reps,
          rpe: s.rpe || 8,
          completed: false,
          isPR: false,
        })),
      })),
    });
    setActiveTab('workout');
  };

  const handleFinishWorkout = async (completedRecord) => {
    const updatedWorkouts = [completedRecord, ...workouts];
    setWorkouts(updatedWorkouts);
    setActiveWorkout(null);
    skipRestTimer();

    // Auto Sync to GitHub if enabled
    if (cloudConfig.autoSync && cloudConfig.token) {
      try {
        const res = await pushToGitHubGist({
          token: cloudConfig.token,
          gistId: cloudConfig.gistId,
          payload: {
            workouts: updatedWorkouts,
            routines,
            customExercises,
            measurements,
            accounts,
          },
        });
        setCloudConfig((prev) => ({
          ...prev,
          gistId: res.gistId,
          lastSynced: res.updatedAt,
        }));
      } catch {
        // Silent background error
      }
    }
  };

  const handleCancelWorkout = () => {
    setActiveWorkout(null);
    skipRestTimer();
  };

  const handleRestoreCloudPayload = (data) => {
    if (Array.isArray(data.workouts)) setWorkouts(data.workouts);
    if (Array.isArray(data.routines)) setRoutines(data.routines);
    if (Array.isArray(data.customExercises))
      setCustomExercises(data.customExercises);
    if (Array.isArray(data.measurements)) setMeasurements(data.measurements);
    if (Array.isArray(data.accounts) && data.accounts.length > 0)
      setAccounts(data.accounts);
  };

  // ================= AUTH SCREEN ("ACCESO PRIVADO") =================
  if (!currentUser) {
    return (
      <AuthScreen
        lang={lang}
        setLang={setLang}
        unit={unit}
        setUnit={setUnit}
        t={t}
        accounts={accounts}
        onLoginSuccess={(acc) => setCurrentUser(acc)}
        onRegisterAccount={(newAcc) => {
          setAccounts((prev) => [...prev, newAcc]);
          setCurrentUser(newAcc);
        }}
        buildTimestamp={BUILD_TIMESTAMP}
      />
    );
  }

  // ================= MAIN ALFA GYM APP =================
  return (
    <div className="alfa-app-shell">
      {/* Top Navigation Header */}
      <header className="alfa-header">
        <div
          className="alfa-brand-left"
          onClick={() => setActiveTab('workout')}
        >
          <div className="alfa-logo-badge">
            <Dumbbell size={20} />
          </div>
          <div>
            <h1 className="alfa-header-title">{t.appName}</h1>
            <span className="alfa-header-sub">
              {currentUser.name} • <Flame size={11} className="inline-icon text-amber" />{' '}
              {workouts.length} {t.analytics.totalWorkouts}
            </span>
          </div>
        </div>

        {/* Desktop Center Navigation Tabs */}
        <nav className="alfa-desktop-nav">
          <button
            type="button"
            className={`nav-tab-btn ${activeTab === 'workout' ? 'active' : ''}`}
            onClick={() => setActiveTab('workout')}
          >
            <PlayCircle size={17} />
            <span>{t.nav.workout}</span>
            {activeWorkout && <span className="live-dot-indicator" />}
          </button>

          <button
            type="button"
            className={`nav-tab-btn ${activeTab === 'routines' ? 'active' : ''}`}
            onClick={() => setActiveTab('routines')}
          >
            <FolderKanban size={17} />
            <span>{t.nav.routines}</span>
          </button>

          <button
            type="button"
            className={`nav-tab-btn ${activeTab === 'exercises' ? 'active' : ''}`}
            onClick={() => setActiveTab('exercises')}
          >
            <Dumbbell size={17} />
            <span>{t.nav.exercises}</span>
          </button>

          <button
            type="button"
            className={`nav-tab-btn ${activeTab === 'analytics' ? 'active' : ''}`}
            onClick={() => setActiveTab('analytics')}
          >
            <BarChart3 size={17} />
            <span>{t.nav.analytics}</span>
          </button>

          <button
            type="button"
            className={`nav-tab-btn ${activeTab === 'tools' ? 'active' : ''}`}
            onClick={() => setActiveTab('tools')}
          >
            <Disc size={17} />
            <span>{t.nav.tools}</span>
          </button>
        </nav>

        {/* Right Controls: Unit Toggle, Language Toggle, Cloud Sync & Logout */}
        <div className="alfa-header-actions">
          <button
            type="button"
            className="header-pill-btn unit-pill"
            onClick={() => setUnit(unit === 'lbs' ? 'kg' : 'lbs')}
            title="Cambiar LBS / KG"
          >
            <Scale size={14} />
            <span>{unit.toUpperCase()}</span>
          </button>

          <button
            type="button"
            className="header-pill-btn"
            onClick={() => setLang(lang === 'es' ? 'en' : 'es')}
            title="Cambiar Idioma / Switch Language"
          >
            <Globe size={14} />
            <span>{lang.toUpperCase()}</span>
          </button>

          <button
            type="button"
            className={`header-pill-btn ${
              cloudConfig.lastSynced ? 'synced' : ''
            }`}
            onClick={() => setShowCloudModal(true)}
            title={t.nav.cloudSync}
          >
            <Cloud size={15} />
            <span className="hide-sm">{t.nav.cloudSync}</span>
          </button>

          <button
            type="button"
            className="header-logout-btn"
            onClick={() => setCurrentUser(null)}
            title={t.nav.logout}
          >
            <LogOut size={15} />
          </button>
        </div>
      </header>

      {/* Active Workout Mini-Banner when browsing other tabs */}
      {activeWorkout && activeTab !== 'workout' && (
        <div
          className="active-workout-mini-banner"
          onClick={() => setActiveTab('workout')}
        >
          <div className="mini-banner-left">
            <span className="live-dot-indicator" />
            <strong>
              {t.workout.activeWorkoutBanner}: {activeWorkout.name}
            </strong>
            <span className="font-mono">({formatClock(elapsedSeconds)})</span>
            {restTimer.active && (
              <span className="mini-rest-pill">
                <Timer size={13} /> {formatClock(restTimer.remaining)}
              </span>
            )}
          </div>
          <button type="button" className="mini-resume-btn">
            {t.workout.resumeBtn} →
          </button>
        </div>
      )}

      {/* Main Content Area */}
      <main className="alfa-main-content">
        {activeTab === 'workout' && (
          <LiveWorkoutLogger
            lang={lang}
            unit={unit}
            t={t}
            activeWorkout={activeWorkout}
            setActiveWorkout={setActiveWorkout}
            elapsedSeconds={elapsedSeconds}
            restTimer={restTimer}
            startRestTimer={startRestTimer}
            adjustRestTimer={adjustRestTimer}
            skipRestTimer={skipRestTimer}
            exercisesLibrary={fullExercisesLibrary}
            onAddCustomExercise={handleAddCustomExercise}
            routines={routines}
            workouts={workouts}
            onStartEmptyWorkout={handleStartEmptyWorkout}
            onStartRoutineWorkout={handleStartRoutineWorkout}
            onFinishWorkout={handleFinishWorkout}
            onCancelWorkout={handleCancelWorkout}
            onNavigateTab={setActiveTab}
          />
        )}

        {activeTab === 'routines' && (
          <RoutinesView
            lang={lang}
            unit={unit}
            t={t}
            routines={routines}
            setRoutines={setRoutines}
            exercisesLibrary={fullExercisesLibrary}
            onStartRoutineWorkout={handleStartRoutineWorkout}
          />
        )}

        {activeTab === 'exercises' && (
          <ExercisesLibraryView
            lang={lang}
            unit={unit}
            t={t}
            exercisesLibrary={fullExercisesLibrary}
            onAddCustomExercise={handleAddCustomExercise}
            workouts={workouts}
          />
        )}

        {activeTab === 'analytics' && (
          <AnalyticsHistoryView
            lang={lang}
            unit={unit}
            t={t}
            workouts={workouts}
            setWorkouts={setWorkouts}
            exercisesLibrary={fullExercisesLibrary}
            onStartRoutineWorkout={handleStartRoutineWorkout}
          />
        )}

        {activeTab === 'tools' && (
          <ToolsAndBodyView
            lang={lang}
            unit={unit}
            t={t}
            measurements={measurements}
            setMeasurements={setMeasurements}
          />
        )}
      </main>

      {/* Mobile Bottom Tab Bar (iOS Hevy Style) */}
      <nav className="alfa-mobile-bottom-nav">
        <button
          type="button"
          className={`mob-nav-item ${activeTab === 'workout' ? 'active' : ''}`}
          onClick={() => setActiveTab('workout')}
        >
          <PlayCircle size={20} />
          <span>{t.nav.workout}</span>
          {activeWorkout && <span className="mob-live-dot" />}
        </button>

        <button
          type="button"
          className={`mob-nav-item ${activeTab === 'routines' ? 'active' : ''}`}
          onClick={() => setActiveTab('routines')}
        >
          <FolderKanban size={20} />
          <span>{t.nav.routines}</span>
        </button>

        <button
          type="button"
          className={`mob-nav-item ${activeTab === 'exercises' ? 'active' : ''}`}
          onClick={() => setActiveTab('exercises')}
        >
          <Dumbbell size={20} />
          <span>{t.nav.exercises}</span>
        </button>

        <button
          type="button"
          className={`mob-nav-item ${activeTab === 'analytics' ? 'active' : ''}`}
          onClick={() => setActiveTab('analytics')}
        >
          <BarChart3 size={20} />
          <span>{t.nav.analytics}</span>
        </button>

        <button
          type="button"
          className={`mob-nav-item ${activeTab === 'tools' ? 'active' : ''}`}
          onClick={() => setActiveTab('tools')}
        >
          <Disc size={20} />
          <span>{t.nav.tools}</span>
        </button>
      </nav>

      {/* Cloud Sync Modal */}
      {showCloudModal && (
        <CloudSyncModal
          lang={lang}
          t={t}
          cloudConfig={cloudConfig}
          setCloudConfig={setCloudConfig}
          fullPayload={{
            workouts,
            routines,
            customExercises,
            measurements,
            accounts,
          }}
          onRestorePayload={handleRestoreCloudPayload}
          onClose={() => setShowCloudModal(false)}
        />
      )}

      {/* Global Rule Corner Timestamp */}
      <div className="corner-timestamp">
        {t.updatedPrefix} {BUILD_TIMESTAMP}
      </div>
    </div>
  );
}
