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

// Synthesized Boxing Ring Bell & Resilient PWA Audio Engine
export {
  playGymSound,
  playBoxingRingBell,
  unlockGymAudio,
  installGlobalAudioUnlock,
  setRestAudioKeepAlive,
} from './soundEngine';

