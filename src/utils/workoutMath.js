// Pure JS + WebCrypto SHA-256 hash so plain-text passwords never appear in GitHub code
export async function sha256Hex(message) {
  const clean = String(message || '').trim();
  if (typeof window !== 'undefined' && window.crypto?.subtle) {
    const msgBuffer = new TextEncoder().encode(clean);
    const hashBuffer = await window.crypto.subtle.digest('SHA-256', msgBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
  }
  return clean;
}

// Epley 1RM formula
export function calculate1RM(weight, reps) {
  const w = Number(weight) || 0;
  const r = Number(reps) || 0;
  if (w <= 0 || r <= 0) return 0;
  if (r === 1) return Math.round(w);
  return Math.round(w * (1 + r / 30));
}

export function formatWeightValue(weightInLbs, unit = 'lbs') {
  const w = Number(weightInLbs) || 0;
  if (unit === 'kg') {
    return Math.round((w * 0.45359237) * 2) / 2;
  }
  return Math.round(w * 2) / 2;
}

export function toLbs(value, unit = 'lbs') {
  const v = Number(value) || 0;
  if (unit === 'kg') {
    return Math.round((v / 0.45359237) * 2) / 2;
  }
  return v;
}

export function formatClock(totalSeconds) {
  const sec = Math.max(0, Math.floor(totalSeconds || 0));
  const hrs = Math.floor(sec / 3600);
  const mins = Math.floor((sec % 3600) / 60);
  const remSecs = sec % 60;
  if (hrs > 0) {
    return `${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(remSecs).padStart(2, '0')}`;
  }
  return `${String(mins).padStart(2, '0')}:${String(remSecs).padStart(2, '0')}`;
}

export function formatDurationHuman(totalSeconds) {
  const sec = Math.max(0, Math.floor(totalSeconds || 0));
  const hrs = Math.floor(sec / 3600);
  const mins = Math.max(1, Math.round((sec % 3600) / 60));
  if (hrs > 0) {
    return `${hrs}h ${mins}m`;
  }
  return `${mins} min`;
}

// Find the most recent completed sets for an exercise to show in the "ANTERIOR / PREVIOUS" column
export function getPreviousExerciseSets(workouts = [], exerciseId) {
  for (const wk of workouts) {
    const foundEx = (wk.exercises || []).find((e) => e.exerciseId === exerciseId);
    if (foundEx && Array.isArray(foundEx.sets) && foundEx.sets.length > 0) {
      return foundEx.sets;
    }
  }
  return [];
}

// Compute all-time records and progression history for an exercise
export function getExerciseStats(workouts = [], exerciseId) {
  let maxWeight = 0;
  let best1RM = 0;
  let bestVolumeSet = 0;
  let bestSetLabel = '—';
  const sessionHistory = [];

  // Iterate oldest to newest for chart progression
  const sortedAsc = [...workouts].sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
  );

  for (const wk of sortedAsc) {
    const exEntry = (wk.exercises || []).find((e) => e.exerciseId === exerciseId);
    if (!exEntry) continue;

    let sessionBest1RM = 0;
    let sessionMaxWeight = 0;
    let sessionVolume = 0;
    const validSets = (exEntry.sets || []).filter((s) => s.completed !== false && Number(s.reps) > 0);

    for (const s of validSets) {
      const w = Number(s.weight) || 0;
      const r = Number(s.reps) || 0;
      const vol = w * r;
      const est1RM = calculate1RM(w, r);

      if (w > maxWeight) maxWeight = w;
      if (est1RM > best1RM) best1RM = est1RM;
      if (vol > bestVolumeSet) {
        bestVolumeSet = vol;
        bestSetLabel = `${w} × ${r}`;
      }
      if (est1RM > sessionBest1RM) sessionBest1RM = est1RM;
      if (w > sessionMaxWeight) sessionMaxWeight = w;
      sessionVolume += vol;
    }

    if (validSets.length > 0) {
      sessionHistory.push({
        workoutId: wk.id,
        workoutName: wk.name,
        date: wk.date,
        note: exEntry.note || '',
        sets: validSets,
        sessionBest1RM,
        sessionMaxWeight,
        sessionVolume,
      });
    }
  }

  return {
    maxWeight,
    best1RM,
    bestVolumeSet,
    bestSetLabel,
    sessionHistory: sessionHistory.reverse(), // newest first for display, reverse when charting
  };
}

// Olympic Barbell Plate Calculator
export function calculatePlateBreakdown(targetWeight, barWeight = 45, unit = 'lbs') {
  const total = Math.max(0, Number(targetWeight) || 0);
  const bar = Math.max(0, Number(barWeight) || (unit === 'kg' ? 20 : 45));

  if (total <= bar) {
    return {
      barWeight: bar,
      perSideWeight: 0,
      achievedTotal: bar,
      remainder: 0,
      platesPerSide: [],
    };
  }

  const plateInventory =
    unit === 'kg'
      ? [
          { weight: 25, color: '#ef4444', height: 96, label: '25' },
          { weight: 20, color: '#2563eb', height: 92, label: '20' },
          { weight: 15, color: '#eab308', height: 82, label: '15' },
          { weight: 10, color: '#10b981', height: 72, label: '10' },
          { weight: 5, color: '#f8fafc', height: 58, label: '5' },
          { weight: 2.5, color: '#64748b', height: 48, label: '2.5' },
          { weight: 1.25, color: '#94a3b8', height: 40, label: '1.25' },
        ]
      : [
          { weight: 45, color: '#2563eb', height: 96, label: '45' },
          { weight: 35, color: '#eab308', height: 86, label: '35' },
          { weight: 25, color: '#10b981', height: 76, label: '25' },
          { weight: 10, color: '#f8fafc', height: 62, label: '10' },
          { weight: 5, color: '#ef4444', height: 50, label: '5' },
          { weight: 2.5, color: '#64748b', height: 42, label: '2.5' },
        ];

  let remainingPerSide = (total - bar) / 2;
  const platesPerSide = [];

  for (const p of plateInventory) {
    const count = Math.floor((remainingPerSide + 0.001) / p.weight);
    if (count > 0) {
      for (let i = 0; i < count; i++) {
        platesPerSide.push(p);
      }
      remainingPerSide -= count * p.weight;
    }
  }

  const loadedPerSide = platesPerSide.reduce((acc, p) => acc + p.weight, 0);

  return {
    barWeight: bar,
    perSideWeight: loadedPerSide,
    achievedTotal: bar + loadedPerSide * 2,
    remainder: Math.max(0, Math.round(remainingPerSide * 10) / 10),
    platesPerSide,
  };
}

// Warm-up sets generator based on working weight
export function calculateWarmupSets(workingWeight, barWeight = 45, unit = 'lbs') {
  const work = Number(workingWeight) || 0;
  const bar = Number(barWeight) || (unit === 'kg' ? 20 : 45);
  const stepRound = unit === 'kg' ? 2.5 : 5;

  const roundToPlate = (val) => Math.max(bar, Math.round(val / stepRound) * stepRound);

  return [
    {
      stage: '1',
      pct: 'Barra / 40%',
      weight: roundToPlate(work * 0.45),
      reps: 10,
      rest: '45s',
    },
    {
      stage: '2',
      pct: '60%',
      weight: roundToPlate(work * 0.6),
      reps: 6,
      rest: '60s',
    },
    {
      stage: '3',
      pct: '75%',
      weight: roundToPlate(work * 0.75),
      reps: 4,
      rest: '75s',
    },
    {
      stage: '4',
      pct: '88% (Activación)',
      weight: roundToPlate(work * 0.88),
      reps: 1,
      rest: '90-120s',
    },
  ];
}

// Net workout elapsed seconds discounting all paused intervals
export function computeWorkoutElapsedSeconds(workout, now = Date.now()) {
  if (!workout || !workout.startedAt) return 0;
  const totalPausedMs = Number(workout.totalPausedMs) || 0;
  const effectiveNow =
    workout.isPaused && workout.pausedAt ? workout.pausedAt : now;
  const netMs = Math.max(0, effectiveNow - workout.startedAt - totalPausedMs);
  return Math.floor(netMs / 1000);
}

// ============================================================================
// Smart Cyclic Routine Queue (Upper -> Abs -> Legs -> Upper -> Abs -> Legs...)
// ============================================================================
export const CYCLE_CATEGORIES = ['upper', 'abs', 'legs'];

export const HEVY_CATEGORY_BY_ID = {
  'routine-hevy-XODnikC6ffn': 'upper', // 2 Chest + Shoulders + Triceps
  'routine-hevy-AYLtHwMaKBX': 'upper', // 4 Back + Traps + Biceps + Forearms
  'routine-hevy-c9Hs8il7QDL': 'abs',   // 6 Abs
  'routine-hevy-s51IPm40DcI': 'legs',  // 1 Quads + Hamstrings + Calves + Abs + Glutes
  'routine-hevy-3AQ79F9MTjO': 'legs',  // 3 Quads + Adductors + Calves + Abs + Glutes
  'routine-hevy-dFkFaPdj9eE': 'legs',  // 5 Hamstrings + Abductors + Calves + Abs + Glutes
};

export const CANONICAL_INITIAL_HEVY_ORDER = [
  'routine-hevy-XODnikC6ffn', // Upper 1
  'routine-hevy-c9Hs8il7QDL', // Abs 1
  'routine-hevy-s51IPm40DcI', // Legs 1
  'routine-hevy-AYLtHwMaKBX', // Upper 2
  'routine-hevy-3AQ79F9MTjO', // Legs 2
  'routine-hevy-dFkFaPdj9eE', // Legs 3
];

const LEG_MUSCLES = new Set(['quads', 'hamstrings', 'glutes', 'calves']);
const UPPER_MUSCLES = new Set([
  'chest',
  'back',
  'shoulders',
  'biceps',
  'triceps',
  'forearms',
  'traps',
]);

export function getRoutineCycleCategory(routine, exerciseMap = {}) {
  if (!routine) return 'custom';
  if (
    routine.cycleCategory === 'upper' ||
    routine.cycleCategory === 'abs' ||
    routine.cycleCategory === 'legs' ||
    routine.cycleCategory === 'custom'
  ) {
    return routine.cycleCategory;
  }
  if (routine.id && HEVY_CATEGORY_BY_ID[routine.id]) {
    return HEVY_CATEGORY_BY_ID[routine.id];
  }

  let legsCount = 0;
  let absCount = 0;
  let upperCount = 0;
  let total = 0;

  for (const exItem of routine.exercises || []) {
    const def = exerciseMap[exItem?.exerciseId];
    const muscle = def?.primaryMuscle;
    if (!muscle) continue;
    total++;
    if (LEG_MUSCLES.has(muscle)) legsCount++;
    else if (muscle === 'abs') absCount++;
    else if (UPPER_MUSCLES.has(muscle)) upperCount++;
  }

  if (total > 0) {
    if (legsCount / total >= 0.5) return 'legs';
    if (absCount / total >= 0.5) return 'abs';
    if (upperCount / total >= 0.5) return 'upper';
  }

  const name = String(routine.name || '');
  if (/pierna|leg|quad|hamstring|glute/i.test(name)) return 'legs';
  if (/\babs\b|abdom|core/i.test(name)) return 'abs';
  if (
    /chest|pecho|back|espalda|upper|push|pull|shoulder|hombro|arm|brazo/i.test(
      name
    )
  ) {
    return 'upper';
  }
  return 'custom';
}

export function rotateRoutinesOnComplete(
  routines,
  completedRoutineId,
  exerciseMap = {}
) {
  if (
    !Array.isArray(routines) ||
    routines.length <= 1 ||
    !completedRoutineId
  ) {
    return Array.isArray(routines) ? routines : [];
  }

  const idx = routines.findIndex((r) => r && r.id === completedRoutineId);
  if (idx === -1) return routines;

  const completedRt = routines[idx];
  const remaining = routines.filter((r) => r && r.id !== completedRoutineId);
  const completedCat = getRoutineCycleCategory(completedRt, exerciseMap);

  if (!CYCLE_CATEGORIES.includes(completedCat)) {
    return [...remaining, completedRt];
  }

  const buckets = { upper: [], abs: [], legs: [] };
  const isCustomSlot = new Array(remaining.length).fill(false);

  for (let i = 0; i < remaining.length; i++) {
    const r = remaining[i];
    const cat = getRoutineCycleCategory(r, exerciseMap);
    if (CYCLE_CATEGORIES.includes(cat)) {
      buckets[cat].push(r);
    } else {
      isCustomSlot[i] = true;
    }
  }

  let cursor = (CYCLE_CATEGORIES.indexOf(completedCat) + 1) % CYCLE_CATEGORIES.length;
  const scheduled = [];
  const totalCyclic =
    buckets.upper.length + buckets.abs.length + buckets.legs.length;

  while (scheduled.length < totalCyclic) {
    for (let offset = 0; offset < CYCLE_CATEGORIES.length; offset++) {
      const cat = CYCLE_CATEGORIES[(cursor + offset) % CYCLE_CATEGORIES.length];
      if (buckets[cat].length > 0) {
        scheduled.push(buckets[cat].shift());
        cursor = (CYCLE_CATEGORIES.indexOf(cat) + 1) % CYCLE_CATEGORIES.length;
        break;
      }
    }
  }

  let schedIdx = 0;
  const rebuiltRemaining = remaining.map((r, i) =>
    isCustomSlot[i] ? r : scheduled[schedIdx++]
  );

  return [...rebuiltRemaining, completedRt];
}

// ============================================================================
// Routine Recency Helpers (DST-safe local calendar day math)
// ============================================================================
const DAY_MS = 86400000;

/**
 * Convert a Date or date string into a local-calendar UTC day serial,
 * guarding YYYY-MM-DD against UTC midnight shift and calendar rollover.
 */
export function toLocalCalendarDaySerial(input) {
  if (input === null || input === undefined || input === '') return null;
  if (typeof input === 'string') {
    const raw = input.trim();
    const dateOnlyMatch = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (dateOnlyMatch) {
      const y = Number(dateOnlyMatch[1]);
      const m = Number(dateOnlyMatch[2]);
      const d = Number(dateOnlyMatch[3]);
      if (m < 1 || m > 12 || d < 1 || d > 31) return null;
      const utcEpochMs = Date.UTC(y, m - 1, d);
      const probe = new Date(utcEpochMs);
      if (
        probe.getUTCFullYear() !== y ||
        probe.getUTCMonth() !== m - 1 ||
        probe.getUTCDate() !== d
      ) {
        return null;
      }
      return Math.floor(utcEpochMs / DAY_MS);
    }
  }

  const dt = input instanceof Date ? input : new Date(input);
  if (Number.isNaN(dt.getTime())) return null;
  return Math.floor(Date.UTC(dt.getFullYear(), dt.getMonth(), dt.getDate()) / DAY_MS);
}

/**
 * Normalize a routine name (accent-folded lowercase, collapsed whitespace) for matching.
 */
export function normalizeRoutineKeyName(name) {
  return String(name || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

/**
 * Compute days elapsed since each routine's most recent completed workout in O(W + R).
 */
export function buildRoutineLastDoneMap(
  routines = [],
  workouts = [],
  nowInput = new Date()
) {
  const result = {};
  if (!Array.isArray(routines) || routines.length === 0) return result;

  const todaySerial =
    toLocalCalendarDaySerial(nowInput) ?? toLocalCalendarDaySerial(new Date());
  if (todaySerial === null) return result;

  const activeRoutineIds = new Set();
  const normCounts = new Map();
  for (const rt of routines) {
    if (!rt?.id) continue;
    activeRoutineIds.add(rt.id);
    const norm = normalizeRoutineKeyName(rt.name);
    if (norm) {
      normCounts.set(norm, (normCounts.get(norm) || 0) + 1);
    }
  }

  const uniqueNormNames = new Set();
  for (const [norm, count] of normCounts.entries()) {
    if (count === 1) uniqueNormNames.add(norm);
  }

  const byRoutineId = new Map();
  const byNormName = new Map();

  for (const wk of workouts || []) {
    const serial = toLocalCalendarDaySerial(wk?.date);
    if (serial === null) continue;

    if (wk.routineId) {
      const prev = byRoutineId.get(wk.routineId);
      if (prev === undefined || serial > prev) {
        byRoutineId.set(wk.routineId, serial);
      }
    }

    // Apply name fallback only when workout isn't bound to another existing routine
    if (!wk.routineId || !activeRoutineIds.has(wk.routineId)) {
      const norm = normalizeRoutineKeyName(wk.name);
      if (norm && uniqueNormNames.has(norm)) {
        const prev = byNormName.get(norm);
        if (prev === undefined || serial > prev) {
          byNormName.set(norm, serial);
        }
      }
    }
  }

  for (const rt of routines) {
    if (!rt?.id) continue;
    const idBest = byRoutineId.has(rt.id) ? byRoutineId.get(rt.id) : null;
    const norm = normalizeRoutineKeyName(rt.name);
    const nameBest =
      norm && uniqueNormNames.has(norm) && byNormName.has(norm)
        ? byNormName.get(norm)
        : null;

    let bestSerial = null;
    if (idBest !== null && nameBest !== null) {
      bestSerial = Math.max(idBest, nameBest);
    } else {
      bestSerial = idBest ?? nameBest;
    }

    result[rt.id] =
      bestSerial === null ? null : Math.max(0, todaySerial - bestSerial);
  }

  return result;
}

/**
 * Format localized label and tone class for a routine's days-since-last-done value.
 */
export function formatRoutineLastDoneBadge(daysAgo, lang = 'es') {
  if (daysAgo === null || daysAgo === undefined || Number.isNaN(Number(daysAgo))) {
    return {
      label: lang === 'es' ? 'Sin realizar' : 'Not done yet',
      tone: 'is-never',
    };
  }
  const d = Math.max(0, Math.floor(Number(daysAgo)));
  if (d === 0) {
    return {
      label: lang === 'es' ? 'Hoy (0 días)' : 'Today (0d)',
      tone: 'is-today',
    };
  }
  if (d === 1) {
    return {
      label: lang === 'es' ? 'Hace 1 día' : '1 day ago',
      tone: 'is-recent',
    };
  }
  return {
    label: lang === 'es' ? `Hace ${d} días` : `${d} days ago`,
    tone: d >= 7 ? 'is-due' : 'is-normal',
  };
}

export function seedInitialSmartRoutineOrder(
  routines,
  workouts = [],
  exerciseMap = {}
) {
  if (!Array.isArray(routines) || routines.length === 0) return [];

  const byId = new Map();
  for (const r of routines) {
    if (r?.id) byId.set(r.id, r);
  }

  const seeded = [];
  const canonicalSet = new Set(CANONICAL_INITIAL_HEVY_ORDER);
  for (const id of CANONICAL_INITIAL_HEVY_ORDER) {
    if (byId.has(id)) {
      seeded.push(byId.get(id));
    }
  }
  for (const r of routines) {
    if (!r?.id || !canonicalSet.has(r.id)) {
      seeded.push(r);
    }
  }

  if (!Array.isArray(workouts) || workouts.length === 0) {
    return seeded;
  }

  const sortedChrono = [...workouts]
    .filter((w) => w && w.routineId)
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  let ordered = seeded;
  for (const wk of sortedChrono) {
    ordered = rotateRoutinesOnComplete(ordered, wk.routineId, exerciseMap);
  }
  return ordered;
}

// Synthesized Boxing Ring Bell & Resilient PWA Audio Engine
export {
  playGymSound,
  playBoxingRingBell,
  unlockGymAudio,
  installGlobalAudioUnlock,
  setRestAudioKeepAlive,
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
} from './soundEngine';

