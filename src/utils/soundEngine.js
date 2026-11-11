// Physical Modal Synthesis Boxing Ring Bell & Resilient iOS PWA Audio Engine
// Zero external network assets required — works 100% offline & through iOS Silent Switch

const SAMPLE_RATE = 44100;
const BELL_DURATION_SEC = 2.65;
const FUNDAMENTAL_HZ = 816; // Heavy cast-bronze boxing ring bell (~G#5)

const STRIKE_TIMES_SEC = [0.0, 0.26, 0.52];
const STRIKE_VELOCITIES = [0.9, 0.94, 1.0];

// 11 inharmonic modal partials + close modal-splitting pairs for natural bronze shimmer
const BOXING_BELL_MODES = [
  { ratio: 0.5, amp: 0.28, decay: 2.05 }, // Hum tone (heavy bronze mass)
  { ratio: 1.0, amp: 0.78, decay: 1.72 }, // Prime Fundamental A (816 Hz)
  { ratio: 1.0048, amp: 0.5, decay: 1.58 }, // Prime Detune B (+3.9 Hz warble)
  { ratio: 1.204, amp: 0.54, decay: 1.22 }, // Minor Tierce (signature bell interval)
  { ratio: 1.518, amp: 0.38, decay: 0.9 }, // Inharmonic Quint
  { ratio: 2.008, amp: 0.58, decay: 0.72 }, // Nominal Octave A
  { ratio: 2.0155, amp: 0.34, decay: 0.62 }, // Nominal Detune B (+6.1 Hz shimmer)
  { ratio: 2.574, amp: 0.34, decay: 0.44 }, // Superquint
  { ratio: 3.09, amp: 0.26, decay: 0.28 }, // Brass edge bite
  { ratio: 4.06, amp: 0.18, decay: 0.16 }, // High metallic clang
  { ratio: 5.38, amp: 0.11, decay: 0.085 }, // Rim ping
];

let sharedAudioCtx = null;
let cachedBellSamples = null;
let cachedBellAudioBuffer = null;
let cachedBellWavUrl = null;
let cachedSilentWavUri = null;
let bellAudioEl = null;
let bellAudioUnlocked = false;
let keepAliveNodes = null;
let sessionResetToken = 0;
let globalUnlockInstalled = false;

function isIOSDevice() {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  return (
    /iPad|iPhone|iPod/.test(ua) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  );
}

function setAudioSessionTypeSafe(type) {
  if (typeof navigator !== 'undefined' && 'audioSession' in navigator && navigator.audioSession) {
    try {
      navigator.audioSession.type = type;
      return true;
    } catch {
      return false;
    }
  }
  return false;
}

function encodePcm16WavBytes(floatSamples, sampleRate) {
  const numSamples = floatSamples.length;
  const dataSize = numSamples * 2;
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
  view.setUint16(20, 1, true); // PCM format = 1
  view.setUint16(22, 1, true); // Mono = 1 channel
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true); // Byte rate
  view.setUint16(32, 2, true); // Block align
  view.setUint16(34, 16, true); // Bits per sample
  writeStr(36, 'data');
  view.setUint32(40, dataSize, true);

  let offset = 44;
  for (let i = 0; i < numSamples; i++) {
    const clamped = Math.max(-1, Math.min(1, floatSamples[i]));
    const int16 = clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff;
    view.setInt16(offset, int16 | 0, true);
    offset += 2;
  }

  return buffer;
}

function getSilentWavDataUri() {
  if (cachedSilentWavUri) return cachedSilentWavUri;
  // 40 ms of digital silence (0 amplitude) to bless HTMLAudioElement without any audible click
  const silentSamples = new Float32Array(Math.floor(SAMPLE_RATE * 0.04));
  const wavBuffer = encodePcm16WavBytes(silentSamples, SAMPLE_RATE);
  const bytes = new Uint8Array(wavBuffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  cachedSilentWavUri = `data:audio/wav;base64,${btoa(binary)}`;
  return cachedSilentWavUri;
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
      // If the bell is already vibrating, physical contact of the steel hammer
      // partially damps previous ring (especially upper modes) before re-exciting
      if (nextStrikePtr > 0) {
        for (let m = 0; m < numModes; m++) {
          const damp = m < 5 ? 0.34 : 0.18;
          u[m] *= damp;
          v[m] *= damp;
        }
      }
      for (let m = 0; m < numModes; m++) {
        const amp = BOXING_BELL_MODES[m].amp * vel;
        // Slight modal phase spread prevents artificial digital click alignment
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

      // 1) Bandpass metallic clack burst (12 ms decay)
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

      transient = (bpOut * 0.95 + knock * 0.48) * activeStrikeVel;
      samplesSinceStrike++;
    }

    const rawMix = bellSum * 0.48 + transient;

    // 165 Hz High-Pass Filter
    const hpOut = hpAlpha * (hpPrevOut + rawMix - hpPrevIn);
    hpPrevIn = rawMix;
    hpPrevOut = hpOut;

    // Warm analog-style soft saturation
    out[n] = Math.tanh(hpOut * 1.62);
  }

  // Smooth 65 ms fade-out at the very end + peak normalization to -0.4 dBFS (0.955)
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

  const normGain = 0.955 / maxPeak;
  for (let n = 0; n < totalSamples; n++) {
    out[n] *= normGain;
  }

  cachedBellSamples = out;
  return out;
}

function getBoxingBellWavUrl() {
  if (cachedBellWavUrl) return cachedBellWavUrl;
  const samples = getBoxingBellSamples();
  const wavBuffer = encodePcm16WavBytes(samples, SAMPLE_RATE);
  const blob = new Blob([wavBuffer], { type: 'audio/wav' });
  cachedBellWavUrl = URL.createObjectURL(blob);
  return cachedBellWavUrl;
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

function getOrCreateBellAudioElement() {
  if (typeof window === 'undefined' || typeof Audio === 'undefined') return null;
  if (!bellAudioEl) {
    bellAudioEl = new Audio();
    bellAudioEl.preload = 'auto';
    bellAudioEl.playsInline = true;
    bellAudioEl.src = getSilentWavDataUri();
  }
  return bellAudioEl;
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

/**
 * Must be called synchronously inside user gesture handlers (onClick / pointerdown / touchend).
 * Warms up both the singleton AudioContext and the fallback HTMLAudioElement completely silently.
 */
export function unlockGymAudio() {
  try {
    setAudioSessionTypeSafe('ambient');

    const ctx = getOrCreateAudioContext();
    if (ctx) {
      if (ctx.state === 'suspended' || ctx.state === 'interrupted') {
        ctx.resume().catch(() => {});
      }
      // Play a 1-sample silent buffer to unlock iOS WebKit WebAudio output
      const silentBuf = ctx.createBuffer(1, 1, 22050);
      const src = ctx.createBufferSource();
      src.buffer = silentBuf;
      src.connect(ctx.destination);
      src.start(0);
      // Pre-warm the synthesized boxing bell buffer in RAM
      getBoxingBellSamples();
    }

    const el = getOrCreateBellAudioElement();
    if (el && !bellAudioUnlocked) {
      el.muted = false;
      const playPromise = el.play();
      if (playPromise && typeof playPromise.then === 'function') {
        playPromise
          .then(() => {
            el.pause();
            el.currentTime = 0;
            el.src = getBoxingBellWavUrl();
            el.load();
            bellAudioUnlocked = true;
          })
          .catch(() => {});
      }
    }
  } catch {
    // Ignore restricted environment errors
  }
}

export function installGlobalAudioUnlock() {
  if (globalUnlockInstalled || typeof window === 'undefined') return;
  globalUnlockInstalled = true;

  const handleFirstGesture = () => {
    unlockGymAudio();
    if (
      sharedAudioCtx &&
      sharedAudioCtx.state === 'running' &&
      bellAudioUnlocked
    ) {
      window.removeEventListener('pointerdown', handleFirstGesture, true);
      window.removeEventListener('touchend', handleFirstGesture, true);
      window.removeEventListener('keydown', handleFirstGesture, true);
    }
  };

  window.addEventListener('pointerdown', handleFirstGesture, true);
  window.addEventListener('touchend', handleFirstGesture, true);
  window.addEventListener('keydown', handleFirstGesture, true);

  document.addEventListener('visibilitychange', () => {
    if (
      document.visibilityState === 'visible' &&
      keepAliveNodes &&
      sharedAudioCtx &&
      (sharedAudioCtx.state === 'suspended' ||
        sharedAudioCtx.state === 'interrupted')
    ) {
      sharedAudioCtx.resume().catch(() => {});
    }
  });
}

/**
 * Keeps the WebAudio graph alive at -100 dBFS (inaudible, 'ambient' mode so Spotify stays 100%)
 * ONLY while the between-set rest timer is actively counting down.
 */
export function setRestAudioKeepAlive(active) {
  try {
    if (!active) {
      if (keepAliveNodes) {
        try {
          keepAliveNodes.osc.stop();
          keepAliveNodes.osc.disconnect();
          keepAliveNodes.gain.disconnect();
        } catch {
          // ignore
        }
        keepAliveNodes = null;
      }
      return;
    }

    const ctx = getOrCreateAudioContext();
    if (!ctx) return;
    if (ctx.state === 'suspended' || ctx.state === 'interrupted') {
      ctx.resume().catch(() => {});
    }
    if (keepAliveNodes) return;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = 1; // Sub-audible 1 Hz
    gain.gain.value = 0.00001; // -100 dBFS (prevents iOS graph sleep, completely silent)
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    keepAliveNodes = { osc, gain };
  } catch {
    // ignore
  }
}

function playFallbackWavElement(onDone) {
  const el = getOrCreateBellAudioElement();
  if (!el) {
    if (onDone) onDone();
    return;
  }
  const wavUrl = getBoxingBellWavUrl();
  if (el.src !== wavUrl) {
    el.src = wavUrl;
  }
  el.muted = false;
  el.currentTime = 0;
  const p = el.play();
  if (p && typeof p.then === 'function') {
    p.catch(() => {});
  }
  if (onDone) {
    setTimeout(onDone, Math.ceil(BELL_DURATION_SEC * 1000) + 100);
  }
}

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

    const token = ++sessionResetToken;
    // Switch iOS 16.4+/17+/18+ to 'transient' so the bell bypasses the physical Silent Switch
    // AND gently ducks Spotify/Apple Music for 2.7s without pausing the user's music!
    const hasAudioSession = setAudioSessionTypeSafe('transient');
    const restoreAmbientSession = () => {
      if (token === sessionResetToken && hasAudioSession) {
        setAudioSessionTypeSafe('ambient');
      }
    };

    const isLegacyIOS = isIOSDevice() && !hasAudioSession;

    // On very old iOS without navigator.audioSession, HTMLAudioElement bypasses the Silent Switch
    if (isLegacyIOS && bellAudioUnlocked) {
      playFallbackWavElement(restoreAmbientSession);
      return;
    }

    const ctx = getOrCreateAudioContext();
    if (!ctx) {
      playFallbackWavElement(restoreAmbientSession);
      return;
    }

    const triggerWebAudioBell = () => {
      const buffer = getBoxingBellAudioBuffer(ctx);
      const source = ctx.createBufferSource();
      const masterGain = ctx.createGain();
      source.buffer = buffer;
      masterGain.gain.setValueAtTime(1.0, ctx.currentTime);
      source.connect(masterGain);
      masterGain.connect(ctx.destination);
      source.onended = restoreAmbientSession;
      source.start(0);
    };

    if (ctx.state === 'running') {
      triggerWebAudioBell();
      return;
    }

    // Attempt rapid resume (up to 140ms) before falling back exclusively to WAV <audio>
    let settled = false;
    const fallbackTimer = setTimeout(() => {
      if (settled) return;
      settled = true;
      if (ctx.state === 'running') {
        triggerWebAudioBell();
      } else {
        playFallbackWavElement(restoreAmbientSession);
      }
    }, 140);

    ctx
      .resume()
      .then(() => {
        if (settled) return;
        clearTimeout(fallbackTimer);
        settled = true;
        if (ctx.state === 'running') {
          triggerWebAudioBell();
        } else {
          playFallbackWavElement(restoreAmbientSession);
        }
      })
      .catch(() => {
        if (settled) return;
        clearTimeout(fallbackTimer);
        settled = true;
        playFallbackWavElement(restoreAmbientSession);
      });
  } catch {
    // Ignore audio restriction errors
  }
}

export function playGymSound(type = 'check') {
  try {
    if (type === 'timerDone' || type === 'boxingBell') {
      playBoxingRingBell();
      return;
    }

    setAudioSessionTypeSafe('ambient');
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
  } catch {
    // Ignore audio context autoplay errors
  }
}
