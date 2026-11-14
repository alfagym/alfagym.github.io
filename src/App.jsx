import React, {
  useState,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useCallback,
} from 'react';
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
  UserCog,
} from 'lucide-react';
import { translations } from './data/translations';
import {
  EXERCISES_LIBRARY,
  DEFAULT_ROUTINES,
  createInitialMeasurements,
  resolveExerciseWithMedia,
} from './data/gymData';
import {
  formatClock,
  playGymSound,
  unlockGymAudio,
  installGlobalAudioUnlock,
  setRestAudioKeepAlive,
  computeWorkoutElapsedSeconds,
  REST_AUDIO_MODES,
  getRestAudioMode,
  setRestAudioMode,
  startBakedRestTimerAudio,
  stopBakedRestTimerAudio,
  hasTimerBellAlreadyRung,
  isBakedRestAudioPlayingFor,
  armRestAudioOnNextTap,
  registerGymServiceWorker,
  getNotificationPermissionState,
  requestGymNotificationPermission,
  sendRestDoneNotification,
  rotateRoutinesOnComplete,
  seedInitialSmartRoutineOrder,
} from './utils/workoutMath';
import { pushToGitHubGist } from './utils/githubSync';
import { ensureExercisesUids } from './hooks/useLongPressReorder';
import AuthScreen from './components/AuthScreen';
import LiveWorkoutLogger from './components/LiveWorkoutLogger';
import RoutinesView from './components/RoutinesView';
import ExercisesLibraryView from './components/ExercisesLibraryView';
import AnalyticsHistoryView from './components/AnalyticsHistoryView';
import ToolsAndBodyView from './components/ToolsAndBodyView';
import CloudSyncModal from './components/CloudSyncModal';
import AccountModal from './components/AccountModal';
import './App.css';

/* global __BUILD_TIMESTAMP__ */
const FALLBACK_TIMESTAMP = '2:51 AM - 11/14/2026';
const BUILD_TIMESTAMP =
  typeof __BUILD_TIMESTAMP__ !== 'undefined'
    ? __BUILD_TIMESTAMP__
    : FALLBACK_TIMESTAMP;

const MASTER_PASSWORD_SHA256 =
  '3eb3fe66b31e3b4d10fa70b5cad49c7112294af6ae4e476a1c405155d45aa121';

const REMOVED_SAMPLE_ROUTINE_IDS = new Set([
  'routine-push-pro',
  'routine-pull-pro',
  'routine-legs-pro',
  'routine-upper-hypertrophy',
  'routine-fullbody-alfa',
]);

const REMOVED_SAMPLE_WORKOUT_IDS = new Set([
  'wk-sample-1',
  'wk-sample-2',
  'wk-sample-3',
  'wk-sample-4',
]);

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
  {
    id: 'lorena-alfa',
    name: 'Lorena Santana',
    identifier: 'lorena',
    passwordHash: MASTER_PASSWORD_SHA256,
    goal: 'hypertrophy',
    preferredUnit: 'lbs',
    streak: 1,
    createdAt: '2026-11-06T22:00:00.000Z',
  },
];

const BASE_EXERCISE_MAP = EXERCISES_LIBRARY.reduce((acc, ex) => {
  acc[ex.id] = ex;
  return acc;
}, {});

const EMPTY_REST_TIMER = {
  active: false,
  isPaused: false,
  pausedRemainingMs: null,
  timerId: null,
  endTime: null,
  remaining: 0,
  total: 90,
  exerciseName: '',
};

function loadUserRestTimer(userKey) {
  if (!userKey) return { ...EMPTY_REST_TIMER };
  try {
    const raw = localStorage.getItem(`alfa_gym_rest_timer_${userKey}`);
    if (!raw) return { ...EMPTY_REST_TIMER };
    const saved = JSON.parse(raw);
    if (!saved || !saved.active) return { ...EMPTY_REST_TIMER };

    if (saved.isPaused) {
      const remMs = Math.max(
        1000,
        Number(saved.pausedRemainingMs) || (Number(saved.remaining) || 1) * 1000
      );
      return {
        ...EMPTY_REST_TIMER,
        ...saved,
        active: true,
        isPaused: true,
        pausedRemainingMs: remMs,
        endTime: null,
        remaining: Math.max(1, Math.ceil(remMs / 1000)),
        total: Math.max(1, Number(saved.total) || 90),
      };
    }

    if (!saved.endTime) return { ...EMPTY_REST_TIMER };
    const msLeft = Number(saved.endTime) - Date.now();
    if (msLeft <= -4000) {
      localStorage.removeItem(`alfa_gym_rest_timer_${userKey}`);
      return { ...EMPTY_REST_TIMER };
    }
    const remSec = msLeft <= 0 ? 1 : Math.max(1, Math.ceil(msLeft / 1000));
    return {
      ...EMPTY_REST_TIMER,
      ...saved,
      active: true,
      isPaused: false,
      pausedRemainingMs: null,
      remaining: remSec,
      total: Math.max(remSec, Number(saved.total) || 90),
    };
  } catch {
    return { ...EMPTY_REST_TIMER };
  }
}

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
    const cleanedList = (savedList || []).filter(
      (r) => r && !REMOVED_SAMPLE_ROUTINE_IDS.has(r.id)
    );
    const hevyDefaults = DEFAULT_ROUTINES.filter((dr) =>
      dr.id.startsWith('routine-hevy-')
    );
    const savedIds = new Set(cleanedList.map((r) => r.id));
    const missingHevy = [];
    for (const hd of hevyDefaults) {
      if (Array.isArray(deletedIds) && deletedIds.includes(hd.id)) continue;
      if (!savedIds.has(hd.id)) {
        missingHevy.push(JSON.parse(JSON.stringify(hd)));
      }
    }
    return [...cleanedList, ...missingHevy].map((rt) => ({
      ...rt,
      exercises: ensureExercisesUids(rt.exercises),
    }));
  };

  const applySmartSeedOnce = (list) => {
    try {
      const seedKey = `alfa_gym_cycle_seeded_v1_${userKey}`;
      if (!localStorage.getItem(seedKey)) {
        const userWorkouts = loadUserWorkouts(userKey);
        const seeded = seedInitialSmartRoutineOrder(
          list,
          userWorkouts,
          BASE_EXERCISE_MAP
        );
        localStorage.setItem(
          `alfa_gym_routines_${userKey}`,
          JSON.stringify(seeded)
        );
        localStorage.setItem(seedKey, '1');
        return seeded;
      }
    } catch {
      // ignore storage errors
    }
    return list;
  };

  try {
    const userSaved = localStorage.getItem(`alfa_gym_routines_${userKey}`);
    if (userSaved) {
      const parsed = JSON.parse(userSaved);
      if (Array.isArray(parsed) && parsed.length > 0) {
        const merged = mergeMissingHevyRoutines(parsed);
        const finalList = applySmartSeedOnce(merged);
        localStorage.setItem(
          `alfa_gym_routines_${userKey}`,
          JSON.stringify(finalList)
        );
        return finalList;
      }
    }
    // Initial migration for Raydel if legacy key exists
    if (userKey === 'raydel') {
      const legacy = localStorage.getItem('alfa_gym_routines');
      if (legacy) {
        const parsedLegacy = JSON.parse(legacy);
        if (Array.isArray(parsedLegacy) && parsedLegacy.length > 0) {
          const merged = mergeMissingHevyRoutines(parsedLegacy);
          const finalList = applySmartSeedOnce(merged);
          localStorage.setItem(
            `alfa_gym_routines_${userKey}`,
            JSON.stringify(finalList)
          );
          return finalList;
        }
      }
    }
  } catch {
    // ignore
  }
  const freshCopy = JSON.parse(JSON.stringify(DEFAULT_ROUTINES)).map((rt) => ({
    ...rt,
    exercises: ensureExercisesUids(rt.exercises),
  }));
  const finalFresh = applySmartSeedOnce(freshCopy);
  try {
    localStorage.setItem(
      `alfa_gym_routines_${userKey}`,
      JSON.stringify(finalFresh)
    );
  } catch {
    // ignore
  }
  return finalFresh;
}

function loadUserWorkouts(userKey) {
  try {
    const userSaved = localStorage.getItem(`alfa_gym_workouts_${userKey}`);
    if (userSaved) {
      const parsed = JSON.parse(userSaved);
      if (Array.isArray(parsed)) {
        return parsed.filter((w) => !REMOVED_SAMPLE_WORKOUT_IDS.has(w.id));
      }
    }
    if (userKey === 'raydel') {
      const legacy = localStorage.getItem('alfa_gym_workouts');
      if (legacy) {
        const parsedLegacy = JSON.parse(legacy);
        if (Array.isArray(parsedLegacy)) {
          return parsedLegacy.filter(
            (w) => !REMOVED_SAMPLE_WORKOUT_IDS.has(w.id)
          );
        }
      }
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
    if (userSaved) {
      const parsed = JSON.parse(userSaved);
      return parsed
        ? { ...parsed, exercises: ensureExercisesUids(parsed.exercises) }
        : null;
    }
    if (userKey === 'raydel') {
      const legacy = localStorage.getItem('alfa_gym_active_workout');
      if (legacy) {
        const parsedLegacy = JSON.parse(legacy);
        return parsedLegacy
          ? {
              ...parsedLegacy,
              exercises: ensureExercisesUids(parsedLegacy.exercises),
            }
          : null;
      }
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
          const updated = parsed.map((acc) =>
            acc.id === 'raydel-alfa'
              ? { ...acc, passwordHash: MASTER_PASSWORD_SHA256, password: '' }
              : acc
          );
          // Ensure Lorena Santana exists in accounts
          const hasLorena = updated.some(
            (a) =>
              a.id === 'lorena-alfa' ||
              (a.identifier && a.identifier.toLowerCase() === 'lorena') ||
              (a.name && a.name.toLowerCase() === 'lorena santana')
          );
          if (!hasLorena) {
            updated.push(DEFAULT_ACCOUNTS[1]);
          }
          return updated;
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

  // Main Navigation Tab & Modals
  const [activeTab, setActiveTab] = useState('workout');
  const [editingRoutineIdTarget, setEditingRoutineIdTarget] = useState(null);
  const [showCloudModal, setShowCloudModal] = useState(false);
  const [showAccountModal, setShowAccountModal] = useState(false);

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

  // Rest Timer State (wall-clock endTime + localStorage persistence for background/lock-screen resilience)
  const [restTimer, setRestTimer] = useState(() =>
    loadUserRestTimer(getUserStorageKey(currentUser))
  );

  // Rest audio mode & Boxing Ring Bell sound toggle
  const [restAudioMode, setRestAudioModeState] = useState(() =>
    getRestAudioMode()
  );
  const [bellEnabled, setBellEnabled] = useState(() => {
    const mode = getRestAudioMode();
    return mode !== 'off' && localStorage.getItem('alfa_gym_bell_enabled') !== 'false';
  });
  const [notifPermission, setNotifPermission] = useState(() =>
    getNotificationPermissionState()
  );

  const bellEnabledRef = useRef(bellEnabled);
  const firedTimerIdRef = useRef(null);
  const armedTimerIdRef = useRef(null);
  const completedWorkoutIdsRef = useRef(new Set());
  const pendingUpdateUrlRef = useRef(null);
  const restTimerActiveRef = useRef(false);
  const skipRestTimerRef = useRef(null);
  const cloudAutoSyncTimerRef = useRef(null);
  const latestCloudSnapshotRef = useRef(null);

  latestCloudSnapshotRef.current = {
    currentUser,
    activeUserKey,
    cloudConfig,
    workouts,
    routines,
    customExercises,
    measurements,
    accounts,
  };

  const cancelPendingCloudAutoSync = useCallback(() => {
    if (cloudAutoSyncTimerRef.current) {
      clearTimeout(cloudAutoSyncTimerRef.current);
      cloudAutoSyncTimerRef.current = null;
    }
  }, []);

  const markCycleSeededForUser = useCallback(
    (targetKey = activeUserKey) => {
      if (!targetKey) return;
      try {
        localStorage.setItem(`alfa_gym_cycle_seeded_v1_${targetKey}`, '1');
      } catch {
        // Ignore storage errors
      }
    },
    [activeUserKey]
  );

  const scheduleCloudAutoSync = useCallback(() => {
    cancelPendingCloudAutoSync();
    cloudAutoSyncTimerRef.current = setTimeout(async () => {
      cloudAutoSyncTimerRef.current = null;
      const snap = latestCloudSnapshotRef.current;
      if (!snap || !snap.currentUser) return;
      const allowedOwner = snap.cloudConfig?.ownerUserKey || 'raydel';
      if (snap.activeUserKey !== allowedOwner) return;
      if (!snap.cloudConfig?.autoSync || !snap.cloudConfig?.token) return;
      try {
        const res = await pushToGitHubGist({
          token: snap.cloudConfig.token,
          gistId: snap.cloudConfig.gistId,
          payload: {
            workouts: snap.workouts,
            routines: snap.routines,
            customExercises: snap.customExercises,
            measurements: snap.measurements,
            accounts: snap.accounts,
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
    }, 1500);
  }, [cancelPendingCloudAutoSync]);

  useEffect(() => {
    bellEnabledRef.current = bellEnabled;
    localStorage.setItem('alfa_gym_bell_enabled', String(bellEnabled));
  }, [bellEnabled]);

  useEffect(() => {
    installGlobalAudioUnlock();
    registerGymServiceWorker();
    return () => {
      cancelPendingCloudAutoSync();
      stopBakedRestTimerAudio();
      setRestAudioKeepAlive(false);
    };
  }, [cancelPendingCloudAutoSync]);

  // Switch / Load user data cleanly on login or register
  const handleSelectActiveUser = (userObj) => {
    cancelPendingCloudAutoSync();
    stopBakedRestTimerAudio();
    armedTimerIdRef.current = null;
    setCurrentUser(userObj);
    if (userObj) {
      const uKey = getUserStorageKey(userObj);
      setRoutines(loadUserRoutines(uKey));
      setWorkouts(loadUserWorkouts(uKey));
      setMeasurements(loadUserMeasurements(uKey));
      setCustomExercises(loadUserCustomExercises(uKey));
      setActiveWorkout(loadUserActiveWorkout(uKey));
      setRestTimer(loadUserRestTimer(uKey));
      if (userObj.preferredUnit) {
        setUnit(userObj.preferredUnit);
      }
    } else {
      setRestTimer({ ...EMPTY_REST_TIMER });
    }
  };

  // Save account profile edits (and migrate localStorage keys if identifier changed)
  const handleSaveAccountChanges = (updatedUser) => {
    const oldKey = getUserStorageKey(currentUser);
    const newKey = getUserStorageKey(updatedUser);

    if (oldKey !== newKey) {
      const prefixes = [
        'alfa_gym_routines_',
        'alfa_gym_workouts_',
        'alfa_gym_measurements_',
        'alfa_gym_custom_exercises_',
        'alfa_gym_active_workout_',
        'alfa_gym_deleted_routines_',
        'alfa_gym_rest_timer_',
        'alfa_gym_cycle_seeded_v1_',
      ];
      for (const prefix of prefixes) {
        const val = localStorage.getItem(`${prefix}${oldKey}`);
        if (val !== null) {
          localStorage.setItem(`${prefix}${newKey}`, val);
        }
      }
    }

    setAccounts((prev) =>
      prev.map((acc) => (acc.id === updatedUser.id ? updatedUser : acc))
    );
    setCurrentUser(updatedUser);
    if (updatedUser.preferredUnit) {
      setUnit(updatedUser.preferredUnit);
    }
  };

  // Ensure both Raydel and Lorena Santana have their 6 Hevy routines pre-synced & seeded into Upper->Abs->Legs cycle
  useEffect(() => {
    loadUserRoutines('raydel');
    loadUserRoutines('lorena');
  }, []);

  // Automatic Live Update Checker for Mobile / iOS Home Screen PWA (deferred if resting!)
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
          if (restTimerActiveRef.current) {
            pendingUpdateUrlRef.current = nextUrl;
          } else {
            window.location.replace(nextUrl);
          }
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
        setNotifPermission(getNotificationPermissionState());
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

  // Live Workout Stopwatch Ticker (respects paused state & persisted totalPausedMs)
  useEffect(() => {
    if (!activeWorkout) {
      setElapsedSeconds(0);
      return;
    }
    const updateClock = () => {
      setElapsedSeconds(computeWorkoutElapsedSeconds(activeWorkout));
    };
    updateClock();
    if (activeWorkout.isPaused) {
      return undefined;
    }
    const interval = setInterval(updateClock, 1000);
    return () => clearInterval(interval);
  }, [activeWorkout]);

  // Persist restTimer across reloads / background kills & flush deferred remote update when idle
  useEffect(() => {
    restTimerActiveRef.current = Boolean(restTimer.active && !restTimer.isPaused);
    if (currentUser) {
      try {
        if (restTimer.active) {
          localStorage.setItem(
            `alfa_gym_rest_timer_${activeUserKey}`,
            JSON.stringify(restTimer)
          );
        } else {
          localStorage.removeItem(`alfa_gym_rest_timer_${activeUserKey}`);
        }
      } catch {
        // Ignore storage errors
      }
    }
    if (!restTimer.active && pendingUpdateUrlRef.current) {
      const targetUrl = pendingUpdateUrlRef.current;
      pendingUpdateUrlRef.current = null;
      window.location.replace(targetUrl);
    }
  }, [restTimer, activeUserKey, currentUser]);

  // Keep screen awake via Screen Wake Lock while rest timer is actively counting down (and not paused)
  useEffect(() => {
    setRestAudioKeepAlive(restTimer.active && !restTimer.isPaused);
  }, [restTimer.active, restTimer.isPaused]);

  // Re-arm baked WAV on next touch if restored after cold reload while counting down
  useEffect(() => {
    if (
      !restTimer.active ||
      restTimer.isPaused ||
      !restTimer.endTime ||
      restTimer.endTime <= Date.now() ||
      armedTimerIdRef.current === restTimer.timerId ||
      hasTimerBellAlreadyRung(restTimer.timerId) ||
      !bellEnabledRef.current ||
      getRestAudioMode() === 'off'
    ) {
      return undefined;
    }

    const expectedTimerId = restTimer.timerId;
    armRestAudioOnNextTap(() => {
      const msLeft = restTimer.endTime - Date.now();
      if (msLeft <= 150) return null;
      armedTimerIdRef.current = expectedTimerId;
      return {
        timerId: expectedTimerId,
        remainingMs: msLeft,
        totalSec: restTimer.total,
        exerciseName: restTimer.exerciseName,
        lang,
        onBellRung: (tid) => {
          firedTimerIdRef.current = tid;
          setRestTimer((prev) =>
            prev.timerId === tid && prev.active
              ? { ...EMPTY_REST_TIMER }
              : prev
          );
        },
        onSkipFromLockScreen: () => skipRestTimerRef.current?.(),
      };
    });
    return undefined;
  }, [
    restTimer.active,
    restTimer.isPaused,
    restTimer.endTime,
    restTimer.timerId,
    restTimer.total,
    restTimer.exerciseName,
    lang,
  ]);

  // Rest Timer Ticker (wall-clock endTime + 25s background grace window, zero double-bell vs baked WAV)
  useEffect(() => {
    if (!restTimer.active || restTimer.isPaused || !restTimer.endTime) return;

    const GRACE_MS = 25000;
    const currentTimerId = restTimer.timerId;
    const targetEndTime = restTimer.endTime;
    const exLabel = restTimer.exerciseName;

    const checkRestClock = () => {
      const now = Date.now();
      const msLeft = targetEndTime - now;

      if (msLeft <= 0) {
        const overdueMs = now - targetEndTime;
        const alreadyRungByStream = hasTimerBellAlreadyRung(currentTimerId);
        const streamCurrentlyPlaying =
          isBakedRestAudioPlayingFor(currentTimerId);

        if (firedTimerIdRef.current !== currentTimerId) {
          firedTimerIdRef.current = currentTimerId;
          const soundAllowed =
            bellEnabledRef.current && getRestAudioMode() !== 'off';

          // If the baked stream is NOT actively playing the bell right now (e.g., interrupted/cold reload/off), play fallback bell
          if (!alreadyRungByStream && !streamCurrentlyPlaying) {
            if (soundAllowed && overdueMs <= GRACE_MS) {
              playGymSound('timerDone');
            }
          }
          if (!alreadyRungByStream && overdueMs <= GRACE_MS) {
            sendRestDoneNotification({
              exerciseName: exLabel,
              lang,
              silent: soundAllowed,
            });
          }
        }

        // Only stop baked audio if it is NOT actively inside/starting its bell tail
        if (!streamCurrentlyPlaying) {
          stopBakedRestTimerAudio();
        }

        setRestTimer((prev) =>
          prev.active
            ? {
                ...prev,
                active: false,
                endTime: null,
                remaining: 0,
              }
            : prev
        );
        return;
      }

      const nextSec = Math.max(1, Math.ceil(msLeft / 1000));
      setRestTimer((prev) =>
        !prev.active || prev.remaining === nextSec
          ? prev
          : { ...prev, remaining: nextSec }
      );
    };

    checkRestClock();
    const interval = setInterval(checkRestClock, 250);

    const handleWakeUp = () => {
      if (document.visibilityState === 'visible') {
        setRestAudioKeepAlive(true);
        checkRestClock();
      }
    };

    document.addEventListener('visibilitychange', handleWakeUp);
    window.addEventListener('focus', checkRestClock);
    window.addEventListener('pageshow', checkRestClock);

    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', handleWakeUp);
      window.removeEventListener('focus', checkRestClock);
      window.removeEventListener('pageshow', checkRestClock);
    };
  }, [
    restTimer.active,
    restTimer.isPaused,
    restTimer.endTime,
    restTimer.timerId,
    restTimer.exerciseName,
    lang,
  ]);

  const t = translations[lang] || translations.es;

  const fullExerciseMap = useMemo(() => {
    const map = {};
    for (const ex of EXERCISES_LIBRARY) {
      if (ex?.id) {
        map[ex.id] = resolveExerciseWithMedia(ex, BASE_EXERCISE_MAP) || ex;
      }
    }
    for (const ex of customExercises) {
      if (ex?.id) {
        map[ex.id] = resolveExerciseWithMedia(ex, BASE_EXERCISE_MAP) || ex;
      }
    }
    return map;
  }, [customExercises]);

  const fullExercisesLibrary = useMemo(() => {
    const seen = new Set();
    const list = [];
    for (const ex of customExercises) {
      if (ex?.id && !seen.has(ex.id)) {
        seen.add(ex.id);
        const resolved =
          fullExerciseMap[ex.id] ||
          resolveExerciseWithMedia(ex, BASE_EXERCISE_MAP) ||
          ex;
        list.push(resolved);
      }
    }
    for (const ex of EXERCISES_LIBRARY) {
      if (ex?.id && !seen.has(ex.id)) {
        seen.add(ex.id);
        const resolved =
          fullExerciseMap[ex.id] ||
          resolveExerciseWithMedia(ex, BASE_EXERCISE_MAP) ||
          ex;
        list.push(resolved);
      }
    }
    return list;
  }, [customExercises, fullExerciseMap]);

  const handleAddCustomExercise = (exData) => {
    const rawCreated = {
      id: `custom-${Date.now()}`,
      ...exData,
    };
    const created =
      resolveExerciseWithMedia(rawCreated, BASE_EXERCISE_MAP) || rawCreated;
    setCustomExercises((prev) => [created, ...prev]);
    scheduleCloudAutoSync();
    return created;
  };

  const skipRestTimer = () => {
    stopBakedRestTimerAudio();
    armedTimerIdRef.current = null;
    setRestTimer({ ...EMPTY_REST_TIMER });
  };
  skipRestTimerRef.current = skipRestTimer;

  const armBakedRestStream = (timerId, remainingMs, totalSec, exerciseName) => {
    if (!bellEnabledRef.current || getRestAudioMode() === 'off') {
      stopBakedRestTimerAudio();
      armedTimerIdRef.current = null;
      return;
    }
    armedTimerIdRef.current = timerId;
    startBakedRestTimerAudio({
      timerId,
      remainingMs,
      totalSec,
      exerciseName,
      lang,
      onBellRung: (tid) => {
        firedTimerIdRef.current = tid;
        setRestTimer((prev) =>
          prev.timerId === tid && prev.active ? { ...EMPTY_REST_TIMER } : prev
        );
      },
      onSkipFromLockScreen: () => skipRestTimerRef.current?.(),
    });
  };

  const startRestTimer = (seconds, exerciseName = '') => {
    unlockGymAudio();
    const cleanSec = Math.max(1, Number(seconds) || 60);
    const timerId = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const remainingMs = cleanSec * 1000;
    const endTime = Date.now() + remainingMs;
    armBakedRestStream(timerId, remainingMs, cleanSec, exerciseName);
    setRestTimer({
      active: true,
      isPaused: false,
      pausedRemainingMs: null,
      timerId,
      endTime,
      remaining: cleanSec,
      total: cleanSec,
      exerciseName,
    });
  };

  const adjustRestTimer = (deltaSeconds) => {
    unlockGymAudio();
    if (!restTimer.active) return;

    if (restTimer.isPaused) {
      const basePausedMs =
        restTimer.pausedRemainingMs != null
          ? restTimer.pausedRemainingMs
          : restTimer.remaining * 1000;
      const nextPausedMs = basePausedMs + deltaSeconds * 1000;
      const nextRemPaused = Math.max(0, Math.ceil(nextPausedMs / 1000));
      if (nextRemPaused <= 0) {
        skipRestTimer();
        return;
      }
      setRestTimer((prev) =>
        prev.active
          ? {
              ...prev,
              pausedRemainingMs: nextPausedMs,
              remaining: nextRemPaused,
              total: Math.max(prev.total, nextRemPaused),
            }
          : prev
      );
      return;
    }

    const baseEnd = restTimer.endTime || Date.now() + restTimer.remaining * 1000;
    const nextEndTime = baseEnd + deltaSeconds * 1000;
    const nextMsLeft = nextEndTime - Date.now();
    const nextRem = Math.max(0, Math.ceil(nextMsLeft / 1000));
    if (nextRem <= 0) {
      skipRestTimer();
      return;
    }
    const nextTotal = Math.max(restTimer.total, nextRem);
    armBakedRestStream(
      restTimer.timerId,
      nextMsLeft,
      nextTotal,
      restTimer.exerciseName
    );
    setRestTimer((prev) =>
      prev.active
        ? {
            ...prev,
            endTime: nextEndTime,
            remaining: nextRem,
            total: Math.max(prev.total, nextRem),
          }
        : prev
    );
  };

  const handleTogglePauseWorkout = () => {
    if (!activeWorkout) return;
    const now = Date.now();
    const willPause = !activeWorkout.isPaused;

    if (!willPause) {
      unlockGymAudio();
    }

    setActiveWorkout((prev) => {
      if (!prev) return prev;
      if (willPause) {
        return {
          ...prev,
          isPaused: true,
          pausedAt: now,
        };
      }
      const pauseDelta = prev.pausedAt ? Math.max(0, now - prev.pausedAt) : 0;
      return {
        ...prev,
        isPaused: false,
        pausedAt: null,
        totalPausedMs: (Number(prev.totalPausedMs) || 0) + pauseDelta,
      };
    });

    if (willPause) {
      stopBakedRestTimerAudio();
      armedTimerIdRef.current = null;
    } else if (restTimer.active && restTimer.isPaused) {
      const resumeMs =
        restTimer.pausedRemainingMs != null
          ? restTimer.pausedRemainingMs
          : Math.max(1000, restTimer.remaining * 1000);
      armBakedRestStream(
        restTimer.timerId,
        resumeMs,
        restTimer.total,
        restTimer.exerciseName
      );
    }

    setRestTimer((prev) => {
      if (!prev.active) return prev;
      if (willPause) {
        if (prev.isPaused) return prev;
        const remMs = prev.endTime
          ? Math.max(1000, prev.endTime - now)
          : Math.max(1000, prev.remaining * 1000);
        return {
          ...prev,
          isPaused: true,
          pausedRemainingMs: remMs,
          endTime: null,
          remaining: Math.max(1, Math.ceil(remMs / 1000)),
        };
      }
      if (!prev.isPaused) return prev;
      const resumeMs =
        prev.pausedRemainingMs != null
          ? prev.pausedRemainingMs
          : Math.max(1000, prev.remaining * 1000);
      return {
        ...prev,
        isPaused: false,
        pausedRemainingMs: null,
        endTime: now + resumeMs,
        remaining: Math.max(1, Math.ceil(resumeMs / 1000)),
      };
    });
  };

  const handleCycleRestAudioMode = () => {
    const idx = REST_AUDIO_MODES.indexOf(restAudioMode);
    const nextMode = REST_AUDIO_MODES[(idx + 1) % REST_AUDIO_MODES.length];
    setRestAudioMode(nextMode);
    setRestAudioModeState(nextMode);
    const nextEnabled = nextMode !== 'off';
    bellEnabledRef.current = nextEnabled;
    setBellEnabled(nextEnabled);

    if (nextMode === 'off') {
      stopBakedRestTimerAudio();
      armedTimerIdRef.current = null;
      return;
    }
    if (restTimer.active && !restTimer.isPaused && restTimer.endTime) {
      const remMs = restTimer.endTime - Date.now();
      if (remMs > 150) {
        armBakedRestStream(
          restTimer.timerId,
          remMs,
          restTimer.total,
          restTimer.exerciseName
        );
      }
    } else {
      unlockGymAudio();
    }
  };

  const handleEnableNotifications = async () => {
    const perm = await requestGymNotificationPermission();
    setNotifPermission(perm);
    if (perm === 'granted') {
      sendRestDoneNotification({
        exerciseName:
          lang === 'es'
            ? 'Notificaciones de descanso activadas ✓'
            : 'Rest notifications enabled ✓',
        lang,
        silent: true,
      });
    }
  };

  const handleToggleBellSound = () => {
    const next = !bellEnabled;
    bellEnabledRef.current = next;
    setBellEnabled(next);
    if (next) {
      if (restAudioMode === 'off') {
        setRestAudioMode('background');
        setRestAudioModeState('background');
      }
      if (restTimer.active && !restTimer.isPaused && restTimer.endTime) {
        const remMs = restTimer.endTime - Date.now();
        if (remMs > 150) {
          armBakedRestStream(
            restTimer.timerId,
            remMs,
            restTimer.total,
            restTimer.exerciseName
          );
        }
      } else {
        playGymSound('timerDone');
      }
    } else {
      setRestAudioMode('off');
      setRestAudioModeState('off');
      stopBakedRestTimerAudio();
      armedTimerIdRef.current = null;
    }
  };

  const handlePreviewBellSound = () => {
    if (!bellEnabled) {
      setBellEnabled(true);
    }
    playGymSound('timerDone');
  };

  const handleStartEmptyWorkout = () => {
    setActiveWorkout({
      id: `live-${Date.now()}`,
      name:
        lang === 'es' ? 'Entrenamiento Alfa Gym' : 'Alfa Gym Session',
      startedAt: Date.now(),
      isPaused: false,
      pausedAt: null,
      totalPausedMs: 0,
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
      isPaused: false,
      pausedAt: null,
      totalPausedMs: 0,
      notes: routine.notes || '',
      exercises: ensureExercisesUids(
        (routine.exercises || []).map((ex) => ({
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
        }))
      ),
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
    const mappedExercises = ensureExercisesUids(
      (workoutSnapshot.exercises || []).map((ex) => ({
        _uid: ex._uid,
        exerciseId: ex.exerciseId,
        restSeconds: Number(ex.restSeconds) || 45,
        note: ex.note || '',
        sets: (ex.sets || []).map((s) => ({
          type: s.type || 'normal',
          weight: Number(s.weight) || 0,
          reps: Number(s.reps) || 0,
          rpe: Number(s.rpe) || 8,
        })),
      }))
    );

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
    markCycleSeededForUser();
    scheduleCloudAutoSync();
  };

  const handleUpdateRoutinesFromView = useCallback(
    (updaterOrNext) => {
      markCycleSeededForUser();
      setRoutines(updaterOrNext);
      scheduleCloudAutoSync();
    },
    [markCycleSeededForUser, scheduleCloudAutoSync]
  );

  const handleReorderRoutines = (fromIdx, toIdx) => {
    if (fromIdx === toIdx) return;
    markCycleSeededForUser();
    setRoutines((prev) => {
      if (
        fromIdx < 0 ||
        fromIdx >= prev.length ||
        toIdx < 0 ||
        toIdx >= prev.length ||
        fromIdx === toIdx
      ) {
        return prev;
      }
      const next = [...prev];
      const [moved] = next.splice(fromIdx, 1);
      next.splice(toIdx, 0, moved);
      return next;
    });
    scheduleCloudAutoSync();
  };

  const handleDeleteRoutineById = (routineId) => {
    if (String(routineId || '').startsWith('routine-hevy-') && activeUserKey) {
      try {
        const key = `alfa_gym_deleted_routines_${activeUserKey}`;
        const raw = localStorage.getItem(key);
        const parsed = raw ? JSON.parse(raw) : [];
        const deletedList = Array.isArray(parsed) ? parsed : [];
        if (!deletedList.includes(routineId)) {
          localStorage.setItem(key, JSON.stringify([...deletedList, routineId]));
        }
      } catch {
        // Ignore storage errors
      }
    }
    markCycleSeededForUser();
    setRoutines((prev) => prev.filter((r) => r.id !== routineId));
    scheduleCloudAutoSync();
  };

  const handleResetDefaultRoutines = () => {
    const confirmMsg =
      lang === 'es'
        ? '¿Deseas restaurar las plantillas base en tu cuenta? (Tus rutinas actuales volverán a los valores predeterminados).'
        : 'Restore default routine templates for your account?';
    if (window.confirm(confirmMsg)) {
      if (activeUserKey) {
        try {
          localStorage.removeItem(`alfa_gym_deleted_routines_${activeUserKey}`);
          localStorage.setItem(`alfa_gym_cycle_seeded_v1_${activeUserKey}`, '1');
        } catch {
          // Ignore storage errors
        }
      }
      const restored = JSON.parse(JSON.stringify(DEFAULT_ROUTINES)).map((rt) => ({
        ...rt,
        exercises: ensureExercisesUids(rt.exercises),
      }));
      setRoutines(seedInitialSmartRoutineOrder(restored, [], fullExerciseMap));
      scheduleCloudAutoSync();
    }
  };

  const handleFinishWorkout = async (completedRecord) => {
    if (!completedRecord?.id) return;
    if (completedWorkoutIdsRef.current.has(completedRecord.id)) return;
    completedWorkoutIdsRef.current.add(completedRecord.id);
    cancelPendingCloudAutoSync();

    const updatedWorkouts = [completedRecord, ...workouts];
    setWorkouts(updatedWorkouts);

    // Automatically update the completed routine's weights/reps/sets (preserving UIDs) AND rotate Upper -> Abs -> Legs
    let updatedRoutines = routines;
    if (
      completedRecord.routineId &&
      Array.isArray(completedRecord.exercises) &&
      completedRecord.exercises.length > 0
    ) {
      const updatedWithWeights = routines.map((rt) => {
        if (rt.id !== completedRecord.routineId) return rt;
        return {
          ...rt,
          name: completedRecord.name || rt.name,
          exercises: ensureExercisesUids(
            completedRecord.exercises.map((ex) => ({
              _uid: ex._uid,
              exerciseId: ex.exerciseId,
              restSeconds: Number(ex.restSeconds) || 45,
              note: ex.note || '',
              sets: (ex.sets || []).map((s) => ({
                type: s.type || 'normal',
                weight: Number(s.weight) || 0,
                reps: Number(s.reps) || 0,
                rpe: Number(s.rpe) || 8,
              })),
            }))
          ),
        };
      });
      updatedRoutines = rotateRoutinesOnComplete(
        updatedWithWeights,
        completedRecord.routineId,
        fullExerciseMap
      );
      markCycleSeededForUser();
      setRoutines(updatedRoutines);
    }

    setActiveWorkout(null);
    skipRestTimer();

    // Auto Sync to GitHub if enabled (guarded to owner profile)
    const allowedOwner = cloudConfig?.ownerUserKey || 'raydel';
    if (
      cloudConfig.autoSync &&
      cloudConfig.token &&
      activeUserKey === allowedOwner
    ) {
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
    cancelPendingCloudAutoSync();
    if (Array.isArray(data.workouts)) setWorkouts(data.workouts);
    if (Array.isArray(data.routines)) {
      markCycleSeededForUser();
      setRoutines(
        data.routines.map((rt) => ({
          ...rt,
          exercises: ensureExercisesUids(rt.exercises),
        }))
      );
    }
    if (Array.isArray(data.customExercises))
      setCustomExercises(data.customExercises);
    if (Array.isArray(data.measurements)) setMeasurements(data.measurements);
    if (Array.isArray(data.accounts) && data.accounts.length > 0)
      setAccounts(data.accounts);
  };

  const mainScrollRef = useRef(null);
  const hasActiveWorkout = Boolean(activeWorkout);

  useLayoutEffect(() => {
    if (mainScrollRef.current) {
      mainScrollRef.current.scrollTop = 0;
    }
  }, [activeTab, hasActiveWorkout, currentUser?.id]);

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

  const isLiveWorkoutScreen = activeTab === 'workout' && Boolean(activeWorkout);

  // ================= MAIN ALFA GYM APP =================
  return (
    <div
      className={`alfa-app-shell ${
        isLiveWorkoutScreen ? 'live-locked-shell' : ''
      }`}
    >
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

        {/* Right Controls: Account Profile Editor, Unit Toggle, Language Toggle & Logout */}
        <div className="alfa-header-actions">
          <button
            type="button"
            className="header-pill-btn account-pill-btn"
            onClick={() => setShowAccountModal(true)}
            title={
              lang === 'es'
                ? 'Editar datos de mi cuenta / Cambiar usuario'
                : 'Edit account profile / Switch user'
            }
          >
            <UserCog size={14} />
            <span>{currentUser.name.split(' ')[0]}</span>
          </button>

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
            onClick={() => handleSelectActiveUser(null)}
            title={t.nav.logout}
          >
            <LogOut size={15} />
          </button>
        </div>
      </header>

      {/* Active Workout Mini-Banner when browsing other tabs */}
      {activeWorkout && activeTab !== 'workout' && (
        <div
          className={`active-workout-mini-banner ${
            activeWorkout.isPaused ? 'is-paused' : ''
          }`}
          onClick={() => setActiveTab('workout')}
        >
          <div className="mini-banner-left">
            <span
              className={`live-dot-indicator ${
                activeWorkout.isPaused ? 'paused' : ''
              }`}
            />
            <strong>
              {activeWorkout.isPaused
                ? `⏸ ${t.workout.pausedBadge}`
                : t.workout.activeWorkoutBanner}
              : {activeWorkout.name}
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
      <div
        ref={mainScrollRef}
        className={`alfa-main-scroll ${
          isLiveWorkoutScreen ? 'is-live-locked' : ''
        }`}
      >
        <main className="alfa-main-content">
          {activeTab === 'workout' && (
          <LiveWorkoutLogger
            lang={lang}
            unit={unit}
            t={t}
            activeWorkout={activeWorkout}
            setActiveWorkout={setActiveWorkout}
            elapsedSeconds={elapsedSeconds}
            onTogglePauseWorkout={handleTogglePauseWorkout}
            restTimer={restTimer}
            startRestTimer={startRestTimer}
            adjustRestTimer={adjustRestTimer}
            skipRestTimer={skipRestTimer}
            bellEnabled={bellEnabled}
            onToggleBellSound={handleToggleBellSound}
            onPreviewBellSound={handlePreviewBellSound}
            restAudioMode={restAudioMode}
            onCycleRestAudioMode={handleCycleRestAudioMode}
            notifPermission={notifPermission}
            onEnableNotifications={handleEnableNotifications}
            exercisesLibrary={fullExercisesLibrary}
            onAddCustomExercise={handleAddCustomExercise}
            routines={routines}
            onReorderRoutines={handleReorderRoutines}
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
            setRoutines={handleUpdateRoutinesFromView}
            workouts={workouts}
            exercisesLibrary={fullExercisesLibrary}
            onAddCustomExercise={handleAddCustomExercise}
            onStartRoutineWorkout={handleStartRoutineWorkout}
            initialEditingRoutineId={editingRoutineIdTarget}
            onClearInitialEditingRoutine={() => setEditingRoutineIdTarget(null)}
            onDeleteRoutine={handleDeleteRoutineById}
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
      </div>

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

      {/* Account Editor & User Switcher Modal */}
      {showAccountModal && (
        <AccountModal
          lang={lang}
          t={t}
          currentUser={currentUser}
          accounts={accounts}
          onSaveAccountChanges={handleSaveAccountChanges}
          onSwitchUser={(acc) => handleSelectActiveUser(acc)}
          onClose={() => setShowAccountModal(false)}
        />
      )}

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
