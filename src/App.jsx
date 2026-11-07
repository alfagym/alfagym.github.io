import React, { useState, useEffect, useMemo } from 'react';
import {
  Dumbbell,
  PlayCircle,
  FolderKanban,
  BarChart3,
  Disc,
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
const FALLBACK_TIMESTAMP = '11:38 PM - 11/06/2026';
const BUILD_TIMESTAMP =
  typeof __BUILD_TIMESTAMP__ !== 'undefined'
    ? __BUILD_TIMESTAMP__
    : FALLBACK_TIMESTAMP;

const MASTER_PASSWORD_SHA256 =
  '3eb3fe66b31e3b4d10fa70b5cad49c7112294af6ae4e476a1c405155d45aa121';

const DEFAULT_ACCOUNTS = [
  {
    id: 'raydel-alfa',
    name: 'Raydel',
    identifier: 'raydel',
    passwordHash: MASTER_PASSWORD_SHA256,
    goal: 'hypertrophy',
    preferredUnit: 'lbs',
    streak: 5,
    createdAt: '2026-11-06T22:00:00.000Z',
  },
];

function getUserStorageKey(user) {
  if (!user) return 'raydel';
  return (user.identifier || user.id || 'raydel')
    .toString()
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, '_');
}

function loadUserRoutines(userKey) {
  const deletedRaw = localStorage.getItem(
    `alfa_gym_deleted_routines_${userKey}`
  );
  const deletedIds = deletedRaw ? JSON.parse(deletedRaw) : [];

  const mergeMissingHevyRoutines = (savedList) => {
    const hevyDefaults = DEFAULT_ROUTINES.filter((dr) =>
      dr.id.startsWith('routine-hevy-')
    );
    const savedById = {};
    for (const r of savedList) {
      savedById[r.id] = r;
    }
    // Keep all 6 Hevy routines in 1-6 order at the top (using the user's edited version if already saved, unless deleted)
    const topHevy = [];
    for (const hd of hevyDefaults) {
      if (deletedIds.includes(hd.id)) continue;
      if (savedById[hd.id]) {
        topHevy.push(savedById[hd.id]);
      } else {
        topHevy.push(JSON.parse(JSON.stringify(hd)));
      }
    }
    const others = savedList.filter((r) => !r.id.startsWith('routine-hevy-'));
    return [...topHevy, ...others];
  };

  try {
    const userSaved = localStorage.getItem(`alfa_gym_routines_${userKey}`);
    if (userSaved) {
      const parsed = JSON.parse(userSaved);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return mergeMissingHevyRoutines(parsed);
      }
    }
    // Initial migration for Raydel if legacy key exists
    if (userKey === 'raydel') {
      const legacy = localStorage.getItem('alfa_gym_routines');
      if (legacy) {
        const parsedLegacy = JSON.parse(legacy);
        if (Array.isArray(parsedLegacy) && parsedLegacy.length > 0) {
          const merged = mergeMissingHevyRoutines(parsedLegacy);
          localStorage.setItem(
            `alfa_gym_routines_${userKey}`,
            JSON.stringify(merged)
          );
          return merged;
        }
      }
    }
  } catch {
    // ignore
  }
  const freshCopy = JSON.parse(JSON.stringify(DEFAULT_ROUTINES));
  try {
    localStorage.setItem(
      `alfa_gym_routines_${userKey}`,
      JSON.stringify(freshCopy)
    );
  } catch {
    // ignore
  }
  return freshCopy;
}

function loadUserWorkouts(userKey) {
  try {
    const userSaved = localStorage.getItem(`alfa_gym_workouts_${userKey}`);
    if (userSaved) {
      const parsed = JSON.parse(userSaved);
      if (Array.isArray(parsed)) return parsed;
    }
    if (userKey === 'raydel') {
      const legacy = localStorage.getItem('alfa_gym_workouts');
      if (legacy) {
        const parsedLegacy = JSON.parse(legacy);
        if (Array.isArray(parsedLegacy)) return parsedLegacy;
      }
      return createInitialWorkouts();
    }
  } catch {
    // ignore
  }
  return [];
}

function loadUserMeasurements(userKey) {
  try {
    const userSaved = localStorage.getItem(`alfa_gym_measurements_${userKey}`);
    if (userSaved) {
      const parsed = JSON.parse(userSaved);
      if (Array.isArray(parsed)) return parsed;
    }
    if (userKey === 'raydel') {
      const legacy = localStorage.getItem('alfa_gym_measurements');
      if (legacy) {
        const parsedLegacy = JSON.parse(legacy);
        if (Array.isArray(parsedLegacy)) return parsedLegacy;
      }
      return createInitialMeasurements();
    }
  } catch {
    // ignore
  }
  return [];
}

function loadUserCustomExercises(userKey) {
  try {
    const userSaved = localStorage.getItem(
      `alfa_gym_custom_exercises_${userKey}`
    );
    if (userSaved) {
      const parsed = JSON.parse(userSaved);
      if (Array.isArray(parsed)) return parsed;
    }
    if (userKey === 'raydel') {
      const legacy = localStorage.getItem('alfa_gym_custom_exercises');
      if (legacy) {
        const parsedLegacy = JSON.parse(legacy);
        if (Array.isArray(parsedLegacy)) return parsedLegacy;
      }
    }
  } catch {
    // ignore
  }
  return [];
}

function loadUserActiveWorkout(userKey) {
  try {
    const userSaved = localStorage.getItem(
      `alfa_gym_active_workout_${userKey}`
    );
    if (userSaved) return JSON.parse(userSaved);
    if (userKey === 'raydel') {
      const legacy = localStorage.getItem('alfa_gym_active_workout');
      if (legacy) return JSON.parse(legacy);
    }
  } catch {
    // ignore
  }
  return null;
}

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
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed.map((acc) =>
            acc.id === 'raydel-alfa'
              ? { ...acc, passwordHash: MASTER_PASSWORD_SHA256, password: '' }
              : acc
          );
        }
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

  const activeUserKey = useMemo(
    () => getUserStorageKey(currentUser),
    [currentUser]
  );

  // Main Navigation Tab & Quick Routine Edit Target
  const [activeTab, setActiveTab] = useState('workout');
  const [editingRoutineIdTarget, setEditingRoutineIdTarget] = useState(null);
  const [showCloudModal, setShowCloudModal] = useState(false);

  // Per-User Workouts History
  const [workouts, setWorkouts] = useState(() =>
    loadUserWorkouts(getUserStorageKey(currentUser))
  );

  // Per-User Routines (100% editable per user)
  const [routines, setRoutines] = useState(() =>
    loadUserRoutines(getUserStorageKey(currentUser))
  );

  // Per-User Custom Exercises
  const [customExercises, setCustomExercises] = useState(() =>
    loadUserCustomExercises(getUserStorageKey(currentUser))
  );

  // Per-User Body Measurements
  const [measurements, setMeasurements] = useState(() =>
    loadUserMeasurements(getUserStorageKey(currentUser))
  );

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

  // Per-User Active Live Workout State
  const [activeWorkout, setActiveWorkout] = useState(() =>
    loadUserActiveWorkout(getUserStorageKey(currentUser))
  );

  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  // Rest Timer State
  const [restTimer, setRestTimer] = useState({
    active: false,
    remaining: 0,
    total: 90,
    exerciseName: '',
  });

  // Switch / Load user data cleanly on login or register
  const handleSelectActiveUser = (userObj) => {
    setCurrentUser(userObj);
    if (userObj) {
      const uKey = getUserStorageKey(userObj);
      setRoutines(loadUserRoutines(uKey));
      setWorkouts(loadUserWorkouts(uKey));
      setMeasurements(loadUserMeasurements(uKey));
      setCustomExercises(loadUserCustomExercises(uKey));
      setActiveWorkout(loadUserActiveWorkout(uKey));
      if (userObj.preferredUnit) {
        setUnit(userObj.preferredUnit);
      }
    }
  };

  // Automatic Live Update Checker for Mobile / iOS Home Screen PWA
  useEffect(() => {
    const checkRemoteUpdate = async () => {
      try {
        const res = await fetch(`./version.json?t=${Date.now()}`, {
          cache: 'no-store',
          headers: { 'Cache-Control': 'no-cache' },
        });
        if (!res.ok) return;
        const data = await res.json();
        if (
          data &&
          data.buildTimestamp &&
          data.buildTimestamp !== BUILD_TIMESTAMP
        ) {
          const nextUrl = `${window.location.pathname}?v=${data.buildId || Date.now()}`;
          window.location.replace(nextUrl);
        }
      } catch {
        // ignore network errors while offline
      }
    };

    checkRemoteUpdate();
    const interval = setInterval(checkRemoteUpdate, 15000);
    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        checkRemoteUpdate();
      }
    };
    window.addEventListener('focus', checkRemoteUpdate);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(interval);
      window.removeEventListener('focus', checkRemoteUpdate);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);

  // Persist Global Settings & Per-User Data to LocalStorage
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
      localStorage.setItem(
        'alfa_gym_current_user',
        JSON.stringify(currentUser)
      );
    } else {
      localStorage.removeItem('alfa_gym_current_user');
    }
  }, [currentUser]);

  useEffect(() => {
    if (!currentUser) return;
    localStorage.setItem(
      `alfa_gym_workouts_${activeUserKey}`,
      JSON.stringify(workouts)
    );
  }, [workouts, activeUserKey, currentUser]);

  useEffect(() => {
    if (!currentUser) return;
    localStorage.setItem(
      `alfa_gym_routines_${activeUserKey}`,
      JSON.stringify(routines)
    );
  }, [routines, activeUserKey, currentUser]);

  useEffect(() => {
    if (!currentUser) return;
    localStorage.setItem(
      `alfa_gym_custom_exercises_${activeUserKey}`,
      JSON.stringify(customExercises)
    );
  }, [customExercises, activeUserKey, currentUser]);

  useEffect(() => {
    if (!currentUser) return;
    localStorage.setItem(
      `alfa_gym_measurements_${activeUserKey}`,
      JSON.stringify(measurements)
    );
  }, [measurements, activeUserKey, currentUser]);

  useEffect(() => {
    localStorage.setItem('alfa_gym_cloud_config', JSON.stringify(cloudConfig));
  }, [cloudConfig]);

  useEffect(() => {
    if (!currentUser) return;
    if (activeWorkout) {
      localStorage.setItem(
        `alfa_gym_active_workout_${activeUserKey}`,
        JSON.stringify(activeWorkout)
      );
    } else {
      localStorage.removeItem(`alfa_gym_active_workout_${activeUserKey}`);
    }
  }, [activeWorkout, activeUserKey, currentUser]);

  // Live Workout Stopwatch Ticker
  useEffect(() => {
    if (!activeWorkout) {
      setElapsedSeconds(0);
      return;
    }
    const startedAt = activeWorkout.startedAt || Date.now();
    const updateClock = () => {
      setElapsedSeconds(
        Math.max(0, Math.floor((Date.now() - startedAt) / 1000))
      );
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
        lang === 'es' ? 'Entrenamiento Alfa Gym' : 'Alfa Gym Session',
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
        restSeconds: ex.restSeconds || 45,
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

  const handleEditRoutineFromHub = (routineId) => {
    setEditingRoutineIdTarget(routineId);
    setActiveTab('routines');
  };

  // Save current live workout exercises/weights/sets back into the user's routine
  const handleSaveActiveToRoutine = (workoutSnapshot) => {
    if (!workoutSnapshot) return;
    const mappedExercises = (workoutSnapshot.exercises || []).map((ex) => ({
      exerciseId: ex.exerciseId,
      restSeconds: Number(ex.restSeconds) || 45,
      note: ex.note || '',
      sets: (ex.sets || []).map((s) => ({
        type: s.type || 'normal',
        weight: Number(s.weight) || 0,
        reps: Number(s.reps) || 0,
        rpe: Number(s.rpe) || 8,
      })),
    }));

    if (workoutSnapshot.routineId) {
      setRoutines((prev) =>
        prev.map((rt) =>
          rt.id === workoutSnapshot.routineId
            ? {
                ...rt,
                name: workoutSnapshot.name || rt.name,
                exercises: mappedExercises,
              }
            : rt
        )
      );
    } else {
      const newRtId = `rt-${Date.now()}`;
      const newRoutine = {
        id: newRtId,
        name:
          workoutSnapshot.name ||
          (lang === 'es' ? 'Mi Rutina Personalizada' : 'My Custom Routine'),
        folder: 'custom',
        notes: workoutSnapshot.notes || '',
        exercises: mappedExercises,
      };
      setRoutines((prev) => [newRoutine, ...prev]);
      setActiveWorkout((prev) =>
        prev ? { ...prev, routineId: newRtId } : prev
      );
    }
  };

  const handleResetDefaultRoutines = () => {
    const confirmMsg =
      lang === 'es'
        ? '¿Deseas restaurar las plantillas base en tu cuenta? (Tus rutinas actuales volverán a los valores predeterminados).'
        : 'Restore default routine templates for your account?';
    if (window.confirm(confirmMsg)) {
      setRoutines(JSON.parse(JSON.stringify(DEFAULT_ROUTINES)));
    }
  };

  const handleFinishWorkout = async (completedRecord) => {
    const updatedWorkouts = [completedRecord, ...workouts];
    setWorkouts(updatedWorkouts);

    // Automatically update the user's routine with any new weights/reps/sets from today's session
    let updatedRoutines = routines;
    if (
      completedRecord.routineId &&
      Array.isArray(completedRecord.exercises) &&
      completedRecord.exercises.length > 0
    ) {
      updatedRoutines = routines.map((rt) => {
        if (rt.id !== completedRecord.routineId) return rt;
        return {
          ...rt,
          name: completedRecord.name || rt.name,
          exercises: completedRecord.exercises.map((ex) => ({
            exerciseId: ex.exerciseId,
            restSeconds: Number(ex.restSeconds) || 45,
            note: ex.note || '',
            sets: (ex.sets || []).map((s) => ({
              type: s.type || 'normal',
              weight: Number(s.weight) || 0,
              reps: Number(s.reps) || 0,
              rpe: Number(s.rpe) || 8,
            })),
          })),
        };
      });
      setRoutines(updatedRoutines);
    }

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
            routines: updatedRoutines,
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
        onLoginSuccess={(acc) => handleSelectActiveUser(acc)}
        onRegisterAccount={(newAcc) => {
          setAccounts((prev) => [...prev, newAcc]);
          handleSelectActiveUser(newAcc);
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
              {currentUser.name} •{' '}
              <Flame size={11} className="inline-icon text-amber" />{' '}
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

        {/* Right Controls: Unit Toggle, Language Toggle & Logout */}
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
            onEditRoutineFromHub={handleEditRoutineFromHub}
            onSaveActiveToRoutine={handleSaveActiveToRoutine}
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
            onAddCustomExercise={handleAddCustomExercise}
            onStartRoutineWorkout={handleStartRoutineWorkout}
            initialEditingRoutineId={editingRoutineIdTarget}
            onClearInitialEditingRoutine={() => setEditingRoutineIdTarget(null)}
            onResetDefaultRoutines={handleResetDefaultRoutines}
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

      {/* Global Rule Corner Timestamp (Tap to force instant update on mobile) */}
      <div
        className="corner-timestamp"
        onClick={() =>
          window.location.replace(
            `${window.location.pathname}?v=${Date.now()}`
          )
        }
        style={{ cursor: 'pointer', pointerEvents: 'auto' }}
        title="Toca para buscar actualización ahora"
      >
        {t.updatedPrefix} {BUILD_TIMESTAMP} ↻
      </div>
    </div>
  );
}
