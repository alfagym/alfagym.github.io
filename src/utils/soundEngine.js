// Physical Modal Synthesis Boxing Ring Bell & Resilient iOS PWA Audio Engine
// Zero external network assets required — works 100% offline & through iOS Vibrate-Only / Silent Mode

const SAMPLE_RATE = 44100;
const SILENT_LEAD_IN_SEC = 0.25; // 250ms pure 0x0000 PCM16 silence for click-free muted=false iOS gesture blessing
const BELL_DURATION_SEC = 2.65;
const FUNDAMENTAL_HZ = 816; // Heavy cast-bronze boxing ring bell (~G#5)

const STRIKE_TIMES_SEC = [0.0, 0.26, 0.52];
const STRIKE_VELOCITIES = [0.92, 0.96, 1.0];

// 11 inharmonic modal partials + close modal-splitting pairs for natural bronze shimmer
const BOXING_BELL_MODES = [
  { ratio: 0.5, amp: 0.28, decay: 2.05 }, // Hum tone (heavy bronze mass)
  { ratio: 1.0, amp: 0.8, decay: 1.72 }, // Prime Fundamental A (816 Hz)
  { ratio: 1.0048, amp: 0.52, decay: 1.58 }, // Prime Detune B (+3.9 Hz warble)
  { ratio: 1.204, amp: 0.56, decay: 1.22 }, // Minor Tierce (signature bell interval)
  { ratio: 1.518, amp: 0.4, decay: 0.9 }, // Inharmonic Quint
  { ratio: 2.008, amp: 0.6, decay: 0.72 }, // Nominal Octave A
  { ratio: 2.0155, amp: 0.35, decay: 0.62 }, // Nominal Detune B (+6.1 Hz shimmer)
  { ratio: 2.574, amp: 0.35, decay: 0.44 }, // Superquint
  { ratio: 3.09, amp: 0.27, decay: 0.28 }, // Brass edge bite
  { ratio: 4.06, amp: 0.19, decay: 0.16 }, // High metallic clang
  { ratio: 5.38, amp: 0.12, decay: 0.085 }, // Rim ping
];

let sharedAudioCtx = null;
let uiCtxSuspendTimer = null;
let cachedBellSamples = null;
let cachedBellAudioBuffer = null;
let cachedBellWavDataUri = null;

let bellAudioEl = null;
let bellAudioUnlocked = false;
let bellUnlockInFlight = false;
let needsReprimeAfterBackground = false;
let isBellCurrentlyRinging = false;
let activeRingToken = 0;
let cleanupRingTimeoutId = null;

let wakeLockSentinel = null;
let wakeLockDesired = false;
let globalUnlockInstalled = false;

function setAudioSessionTypeSafe(type) {
  if (
    typeof navigator !== 'undefined' &&
    'audioSession' in navigator &&
    navigator.audioSession
  ) {
    try {
      if (navigator.audioSession.type !== type) {
        navigator.audioSession.type = type;
      }
      return true;
    } catch {
      return false;
    }
  }
  return false;
}

function releasePlaybackSessionToAuto() {
  // Explicitly step 'playback' -> 'ambient' -> 'auto' so WebKit GPUProcess drops
  // AVAudioSessionCategoryPlayback immediately without leaving an 'ambient' override locked
  setAudioSessionTypeSafe('ambient');
  setAudioSessionTypeSafe('auto');
}

function uint8ToBase64(bytes) {
  const CHUNK_SIZE = 0x2000; // 8192-byte chunks avoid JS call-stack limits
  const chunks = [];
  for (let i = 0; i < bytes.length; i += CHUNK_SIZE) {
    chunks.push(
      String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK_SIZE))
    );
  }
  return btoa(chunks.join(''));
}

function encodeBellWavWithLeadInDataUri(bellFloatSamples, sampleRate) {
  const leadInSamples = Math.floor(sampleRate * SILENT_LEAD_IN_SEC);
  const totalSamples = leadInSamples + bellFloatSamples.length;
  const dataSize = totalSamples * 2;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  const writeStr = (offset, str) => {
    for (let i = 0; i < str.length; i++) {
      view.setUint8(offset + i, str.charCodeAt(i));
    }
  };

  writeStr(0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeStr(8, 'WAVE');
  writeStr(12, 'fmt ');
  view.setUint32(16, 16, true); // PCM chunk size
  view.setUint16(20, 1, true); // Linear PCM = 1
  view.setUint16(22, 1, true); // Mono = 1 channel
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true); // Byte rate
  view.setUint16(32, 2, true); // Block align
  view.setUint16(34, 16, true); // 16 bits per sample
  writeStr(36, 'data');
  view.setUint32(40, dataSize, true);

  // Samples [0 .. leadInSamples - 1] remain zero-initialized (0x0000 pure digital silence)
  let offset = 44 + leadInSamples * 2;
  for (let i = 0; i < bellFloatSamples.length; i++) {
    // 1.5ms (66-sample) micro-ramp at strike boundary guarantees zero DC click when seeking to 0.25s
    const ramp = i < 66 ? i / 66 : 1;
    const clamped = Math.max(-1, Math.min(1, bellFloatSamples[i] * ramp));
    const int16 = clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff;
    view.setInt16(offset, int16 | 0, true);
    offset += 2;
  }

  return `data:audio/wav;base64,${uint8ToBase64(new Uint8Array(buffer))}`;
}

/**
 * Synthesizes a realistic 3-strike cast-bronze boxing ring bell ("DING-DING-DING!")
 * using coupled phasor resonators, steel clapper transient burst, 165 Hz high-pass,
 * and warm soft-clipping normalization.
 */
export function getBoxingBellSamples() {
  if (cachedBellSamples) return cachedBellSamples;

  const totalSamples = Math.floor(SAMPLE_RATE * BELL_DURATION_SEC);
  const out = new Float32Array(totalSamples);
  const numModes = BOXING_BELL_MODES.length;

  // Coupled phasor states: u = cos-component, v = sin-component (output)
  const u = new Float64Array(numModes);
  const v = new Float64Array(numModes);
  const stepCos = new Float64Array(numModes);
  const stepSin = new Float64Array(numModes);

  for (let m = 0; m < numModes; m++) {
    const mode = BOXING_BELL_MODES[m];
    const freq = FUNDAMENTAL_HZ * mode.ratio;
    const omega = (2 * Math.PI * freq) / SAMPLE_RATE;
    const radius = Math.exp(-1 / (mode.decay * SAMPLE_RATE));
    stepCos[m] = radius * Math.cos(omega);
    stepSin[m] = radius * Math.sin(omega);
  }

  const strikeSampleIndices = STRIKE_TIMES_SEC.map((sec) =>
    Math.floor(sec * SAMPLE_RATE)
  );
  let nextStrikePtr = 0;
  let samplesSinceStrike = 999999;
  let activeStrikeVel = 0;
  let clapperPhase = 0;

  // Resonant bandpass biquad state for steel striker transient (3250 Hz, Q = 5.5)
  const bpW0 = (2 * Math.PI * 3250) / SAMPLE_RATE;
  const bpAlpha = Math.sin(bpW0) / (2 * 5.5);
  const bpB0 = bpAlpha / (1 + bpAlpha);
  const bpB2 = -bpAlpha / (1 + bpAlpha);
  const bpA1 = (-2 * Math.cos(bpW0)) / (1 + bpAlpha);
  const bpA2 = (1 - bpAlpha) / (1 + bpAlpha);
  let bpX1 = 0;
  let bpX2 = 0;
  let bpY1 = 0;
  let bpY2 = 0;

  // Deterministic PRNG for metallic hammer noise burst
  let rngState = 0x13579bdf;

  // 1st-order high-pass filter at 165 Hz to protect phone speaker headroom
  const hpRC = 1 / (2 * Math.PI * 165);
  const hpDt = 1 / SAMPLE_RATE;
  const hpAlpha = hpRC / (hpRC + hpDt);
  let hpPrevIn = 0;
  let hpPrevOut = 0;

  for (let n = 0; n < totalSamples; n++) {
    if (
      nextStrikePtr < strikeSampleIndices.length &&
      n === strikeSampleIndices[nextStrikePtr]
    ) {
      const vel = STRIKE_VELOCITIES[nextStrikePtr];
      // Physical contact of the steel hammer partially damps previous ring before re-exciting
      if (nextStrikePtr > 0) {
        for (let m = 0; m < numModes; m++) {
          const damp = m < 5 ? 0.34 : 0.18;
          u[m] *= damp;
          v[m] *= damp;
        }
      }
      for (let m = 0; m < numModes; m++) {
        const amp = BOXING_BELL_MODES[m].amp * vel;
        const initPhase = m * 0.37 + nextStrikePtr * 0.21;
        u[m] += amp * Math.cos(initPhase);
        v[m] += amp * Math.sin(initPhase);
      }
      samplesSinceStrike = 0;
      activeStrikeVel = vel;
      clapperPhase = 0;
      nextStrikePtr++;
    }

    // Advance all 11 bronze resonators
    let bellSum = 0;
    for (let m = 0; m < numModes; m++) {
      const nu = stepCos[m] * u[m] - stepSin[m] * v[m];
      const nv = stepSin[m] * u[m] + stepCos[m] * v[m];
      u[m] = nu;
      v[m] = nv;
      bellSum += nv;
    }

    // Add steel hammer strike transient during the first 18 ms of each hit
    let transient = 0;
    if (samplesSinceStrike < 800) {
      const tStrike = samplesSinceStrike / SAMPLE_RATE;

      // 1) Bandpass metallic clack burst (11 ms decay)
      rngState = (rngState * 1664525 + 1013904223) >>> 0;
      const white = (rngState / 2147483648 - 1) * Math.exp(-tStrike / 0.011);
      const bpOut =
        bpB0 * white + bpB2 * bpX2 - bpA1 * bpY1 - bpA2 * bpY2;
      bpX2 = bpX1;
      bpX1 = white;
      bpY2 = bpY1;
      bpY1 = bpOut;

      // 2) Percussive steel pitch-drop knock (3100 Hz -> 480 Hz in 9 ms)
      const sweepFreq = 480 + 2620 * Math.exp(-tStrike / 0.0032);
      clapperPhase += (2 * Math.PI * sweepFreq) / SAMPLE_RATE;
      const knock = Math.sin(clapperPhase) * Math.exp(-tStrike / 0.0065);

      transient = (bpOut * 0.98 + knock * 0.5) * activeStrikeVel;
      samplesSinceStrike++;
    }

    const rawMix = bellSum * 0.5 + transient;

    // 165 Hz High-Pass Filter
    const hpOut = hpAlpha * (hpPrevOut + rawMix - hpPrevIn);
    hpPrevIn = rawMix;
    hpPrevOut = hpOut;

    // Warm analog-style soft saturation for loud phone speaker projection
    out[n] = Math.tanh(hpOut * 1.75);
  }

  // Smooth 65 ms fade-out at the very end + peak normalization to 0.98 (-0.17 dBFS)
  const fadeSamples = Math.floor(SAMPLE_RATE * 0.065);
  let maxPeak = 0.001;
  for (let n = 0; n < totalSamples; n++) {
    if (n >= totalSamples - fadeSamples) {
      const rem = (totalSamples - n) / fadeSamples;
      out[n] *= rem * rem;
    }
    const abs = Math.abs(out[n]);
    if (abs > maxPeak) maxPeak = abs;
  }

  const normGain = 0.98 / maxPeak;
  for (let n = 0; n < totalSamples; n++) {
    out[n] *= normGain;
  }

  cachedBellSamples = out;
  return out;
}

function getBoxingBellWavDataUri() {
  if (cachedBellWavDataUri) return cachedBellWavDataUri;
  const samples = getBoxingBellSamples();
  cachedBellWavDataUri = encodeBellWavWithLeadInDataUri(samples, SAMPLE_RATE);
  return cachedBellWavDataUri;
}

function getOrCreateAudioContext() {
  if (typeof window === 'undefined') return null;
  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  if (!AudioCtx) return null;
  if (!sharedAudioCtx || sharedAudioCtx.state === 'closed') {
    sharedAudioCtx = new AudioCtx();
  }
  return sharedAudioCtx;
}

function getBoxingBellAudioBuffer(ctx) {
  if (cachedBellAudioBuffer && cachedBellAudioBuffer.sampleRate === ctx.sampleRate) {
    return cachedBellAudioBuffer;
  }
  const samples = getBoxingBellSamples();
  const buffer = ctx.createBuffer(1, samples.length, SAMPLE_RATE);
  buffer.copyToChannel(samples, 0);
  cachedBellAudioBuffer = buffer;
  return buffer;
}

function finishBellSession(token) {
  if (token !== undefined && token !== activeRingToken) return;
  isBellCurrentlyRinging = false;
  if (cleanupRingTimeoutId) {
    clearTimeout(cleanupRingTimeoutId);
    cleanupRingTimeoutId = null;
  }
  if (bellAudioEl) {
    try {
      if (!bellAudioEl.paused) {
        bellAudioEl.pause();
      }
      if (bellAudioEl.readyState >= 1) {
        bellAudioEl.currentTime = SILENT_LEAD_IN_SEC;
      }
    } catch {
      // ignore seek errors
    }
  }
  releasePlaybackSessionToAuto();
}

function ensureBellAudioElement() {
  if (typeof window === 'undefined' || typeof Audio === 'undefined') return null;
  if (bellAudioEl && !bellAudioEl.error) return bellAudioEl;

  // Immutable Base64 WAV Data URI: immune to iOS Home Screen PWA BlobRegistry eviction
  const el = new Audio(getBoxingBellWavDataUri());
  el.preload = 'auto';
  el.playsInline = true;
  el.volume = 1.0;
  // MUST remain false so WebKit clears RequireUserGestureForAudioRateChange on unlock
  el.muted = false;

  el.addEventListener('timeupdate', () => {
    // Hard safety guard: during silent gesture unlock, never allow playhead past 120ms of the 250ms silent lead-in
    if (bellUnlockInFlight && !isBellCurrentlyRinging && el.currentTime >= 0.12) {
      el.pause();
    }
  });

  el.addEventListener('ended', () => {
    finishBellSession(activeRingToken);
  });

  bellAudioEl = el;
  bellAudioUnlocked = false;
  return bellAudioEl;
}

async function acquireWakeLockSafe() {
  if (!wakeLockDesired || wakeLockSentinel) return;
  if (typeof navigator === 'undefined' || !('wakeLock' in navigator) || !navigator.wakeLock) {
    return;
  }
  if (typeof document !== 'undefined' && document.visibilityState !== 'visible') {
    return;
  }
  try {
    const sentinel = await navigator.wakeLock.request('screen');
    if (!wakeLockDesired) {
      try {
        await sentinel.release();
      } catch {
        // ignore
      }
      return;
    }
    wakeLockSentinel = sentinel;
    sentinel.addEventListener('release', () => {
      if (wakeLockSentinel === sentinel) {
        wakeLockSentinel = null;
      }
    });
  } catch {
    // Low Power Mode or restricted context may decline Screen Wake Lock; non-fatal
  }
}

async function releaseWakeLockSafe() {
  const current = wakeLockSentinel;
  wakeLockSentinel = null;
  if (current) {
    try {
      await current.release();
    } catch {
      // ignore
    }
  }
}

/**
 * Called synchronously inside user gesture handlers (touchend / click / keydown).
 * Blesses the persistent HTMLAudioElement using its 250ms 0x0000 silent lead-in under 'ambient'
 * so Spotify/Apple Music is NEVER interrupted on set checkmarks, then parks at 0.25s in 'auto'.
 */
export function unlockGymAudio() {
  try {
    if (wakeLockDesired && !wakeLockSentinel) {
      acquireWakeLockSafe();
    }

    const el = ensureBellAudioElement();
    if (!el) return;

    // Never collide with an active bell ring or an already in-flight unlock
    if (isBellCurrentlyRinging || bellUnlockInFlight) return;

    const shouldPrime =
      !bellAudioUnlocked ||
      needsReprimeAfterBackground ||
      el.error !== null ||
      el.readyState < 1;

    if (!shouldPrime) return;

    const ringAtStart = activeRingToken;
    bellUnlockInFlight = true;

    // Use 'ambient' ONLY during the ~20ms silent 0x0000 blessing so Spotify never pauses on tap
    setAudioSessionTypeSafe('ambient');
    el.muted = false;
    el.volume = 1.0;

    try {
      el.currentTime = 0;
    } catch {
      // ignore if metadata is still parsing
    }

    const playPromise = el.play();
    if (playPromise && typeof playPromise.then === 'function') {
      playPromise
        .then(() => {
          bellUnlockInFlight = false;
          bellAudioUnlocked = true;
          needsReprimeAfterBackground = false;
          // Abort cleanup if playBoxingRingBell() took over while unlock promise was resolving
          if (ringAtStart !== activeRingToken || isBellCurrentlyRinging) {
            return;
          }
          el.pause();
          try {
            if (el.readyState >= 1) {
              el.currentTime = SILENT_LEAD_IN_SEC;
            }
          } catch {
            // ignore
          }
          setAudioSessionTypeSafe('auto');
        })
        .catch(() => {
          bellUnlockInFlight = false;
          if (ringAtStart !== activeRingToken || isBellCurrentlyRinging) {
            return;
          }
          setAudioSessionTypeSafe('auto');
        });
    } else {
      bellUnlockInFlight = false;
      bellAudioUnlocked = true;
      needsReprimeAfterBackground = false;
      if (ringAtStart === activeRingToken && !isBellCurrentlyRinging) {
        el.pause();
        setAudioSessionTypeSafe('auto');
      }
    }
  } catch {
    bellUnlockInFlight = false;
  }
}

export function installGlobalAudioUnlock() {
  if (globalUnlockInstalled || typeof window === 'undefined') return;
  globalUnlockInstalled = true;

  const handleUserGesture = () => {
    unlockGymAudio();
  };

  // Keep lightweight passive gesture listeners active so returning from background/Spotify
  // automatically re-primes <audio> on the user's next tap if WebKit reclaimed the media pipeline
  window.addEventListener('touchend', handleUserGesture, {
    capture: true,
    passive: true,
  });
  window.addEventListener('click', handleUserGesture, {
    capture: true,
    passive: true,
  });
  window.addEventListener('keydown', handleUserGesture, {
    capture: true,
    passive: true,
  });

  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') {
        needsReprimeAfterBackground = true;
      } else if (document.visibilityState === 'visible') {
        if (wakeLockDesired && !wakeLockSentinel) {
          acquireWakeLockSafe();
        }
        if (bellAudioEl && bellAudioEl.error) {
          bellAudioEl = null;
          bellAudioUnlocked = false;
        }
      }
    });
  }
}

/**
 * Keeps the iPhone screen awake via Screen Wake Lock API while the between-set rest timer
 * is actively counting down (replacing the counterproductive 1 Hz WebAudio oscillator).
 */
export function setRestAudioKeepAlive(active) {
  wakeLockDesired = Boolean(active);
  if (!wakeLockDesired) {
    releaseWakeLockSafe();
    return;
  }
  acquireWakeLockSafe();
}

function triggerWebAudioBellFallback(token) {
  try {
    const ctx = getOrCreateAudioContext();
    if (!ctx) {
      finishBellSession(token);
      return;
    }
    if (uiCtxSuspendTimer) {
      clearTimeout(uiCtxSuspendTimer);
      uiCtxSuspendTimer = null;
    }
    setAudioSessionTypeSafe('playback');

    const startBuffer = () => {
      if (token !== activeRingToken) return;
      const buffer = getBoxingBellAudioBuffer(ctx);
      const source = ctx.createBufferSource();
      const masterGain = ctx.createGain();
      source.buffer = buffer;
      masterGain.gain.setValueAtTime(1.0, ctx.currentTime);
      source.connect(masterGain);
      masterGain.connect(ctx.destination);
      source.onended = () => {
        finishBellSession(token);
        try {
          if (ctx.state === 'running' && !isBellCurrentlyRinging) {
            ctx.suspend().catch(() => {});
          }
        } catch {
          // ignore
        }
      };
      source.start(0);
    };

    if (ctx.state === 'running') {
      startBuffer();
    } else {
      ctx
        .resume()
        .then(startBuffer)
        .catch(() => finishBellSession(token));
    }
  } catch {
    finishBellSession(token);
  }
}

/**
 * Rings the 3-strike boxing bell audibly EVEN WHEN iPHONE IS IN VIBRATE-ONLY / SILENT MODE.
 * Uses 'playback' (AVAudioSessionCategoryPlayback) + persistent blessed HTMLAudioElement.
 */
export function playBoxingRingBell() {
  try {
    // Tactile 3-strike vibration on supported mobile browsers
    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
      try {
        navigator.vibrate([100, 155, 100, 155, 280]);
      } catch {
        // ignore
      }
    }

    const token = ++activeRingToken;
    isBellCurrentlyRinging = true;
    bellUnlockInFlight = false;

    if (cleanupRingTimeoutId) {
      clearTimeout(cleanupRingTimeoutId);
      cleanupRingTimeoutId = null;
    }

    // Suspend any lingering UI WebAudio context so AVPlayer owns the audio route cleanly
    if (sharedAudioCtx && sharedAudioCtx.state === 'running') {
      try {
        sharedAudioCtx.suspend().catch(() => {});
      } catch {
        // ignore
      }
    }

    // CRITICAL FOR iOS VIBRATE-ONLY / SILENT SWITCH:
    // 'playback' maps to AVAudioSessionCategoryPlayback (bypasses hardware Ring/Silent switch & Action Button)
    setAudioSessionTypeSafe('playback');

    const el = ensureBellAudioElement();
    if (!el) {
      triggerWebAudioBellFallback(token);
      return;
    }

    el.muted = false;
    el.volume = 1.0;

    try {
      if (!el.paused) {
        el.pause();
      }
      if (
        el.readyState >= 1 &&
        (!el.seekable ||
          el.seekable.length === 0 ||
          el.seekable.end(0) >= SILENT_LEAD_IN_SEC)
      ) {
        el.currentTime = SILENT_LEAD_IN_SEC;
      } else {
        el.currentTime = 0;
      }
    } catch {
      // If seek fails on cold buffer, plays seamlessly through the 250ms silent prefix
    }

    const safetyMs = Math.ceil(
      (BELL_DURATION_SEC + SILENT_LEAD_IN_SEC + 0.45) * 1000
    );
    cleanupRingTimeoutId = setTimeout(() => {
      finishBellSession(token);
    }, safetyMs);

    const playPromise = el.play();
    if (playPromise && typeof playPromise.then === 'function') {
      playPromise
        .then(() => {
          bellAudioUnlocked = true;
          needsReprimeAfterBackground = false;
        })
        .catch(() => {
          // Exclusive emergency fallback ONLY if HTMLAudioElement.play() rejected (zero double-play echo)
          triggerWebAudioBellFallback(token);
        });
    } else {
      bellAudioUnlocked = true;
    }
  } catch {
    isBellCurrentlyRinging = false;
    releasePlaybackSessionToAuto();
  }
}

export function playGymSound(type = 'check') {
  try {
    if (type === 'timerDone' || type === 'boxingBell') {
      playBoxingRingBell();
      return;
    }

    // Never let short UI bips downgrade an active boxing bell's 'playback' session
    if (!isBellCurrentlyRinging) {
      setAudioSessionTypeSafe('ambient');
    }

    const ctx = getOrCreateAudioContext();
    if (!ctx) return;
    if (ctx.state === 'suspended' || ctx.state === 'interrupted') {
      ctx.resume().catch(() => {});
    }
    const now = ctx.currentTime;

    if (type === 'check') {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(587.33, now); // D5
      osc.frequency.exponentialRampToValueAtTime(880, now + 0.11); // A5
      gain.gain.setValueAtTime(0.12, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.16);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.17);
    } else if (type === 'pr') {
      const notes = [523.25, 659.25, 783.99, 1046.5]; // C5 E5 G5 C6
      notes.forEach((freq, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(freq, now + idx * 0.08);
        gain.gain.setValueAtTime(0.16, now + idx * 0.08);
        gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.08 + 0.25);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now + idx * 0.08);
        osc.stop(now + idx * 0.08 + 0.26);
      });
    }

    // Suspend UI AudioContext after short sound finishes so zero WebAudio streams stay open during rest
    if (uiCtxSuspendTimer) {
      clearTimeout(uiCtxSuspendTimer);
    }
    uiCtxSuspendTimer = setTimeout(() => {
      uiCtxSuspendTimer = null;
      if (!isBellCurrentlyRinging) {
        setAudioSessionTypeSafe('auto');
        if (sharedAudioCtx && sharedAudioCtx.state === 'running') {
          try {
            sharedAudioCtx.suspend().catch(() => {});
          } catch {
            // ignore
          }
        }
      }
    }, 650);
  } catch {
    // Ignore audio context autoplay errors
  }
}
