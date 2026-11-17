// All sound is synthesised with WebAudio: no audio files, nothing to load, nothing
// to fetch. Every effect is one short oscillator/noise burst; the music is a quiet
// bass-and-sparkle loop scheduled a bar ahead. The context is created on the first
// user gesture (browsers block audio before one) and every call is safe before that.
export function createAudio() {
  let ctx = null;
  let master = null;
  let musicGain = null;
  let muted = false;
  let musicTimer = null;
  let nextBarTime = 0;
  let bar = 0;
  // A minor-key bass walk with a sparkle on top; one bar is 8 eighth-notes at 132 bpm.
  const BASS = [55, 55, 65.41, 49, 55, 55, 82.41, 73.42];
  const SPARKLE = [440, 523.25, 659.25, 523.25, 587.33, 659.25, 880, 659.25];

  function ensure() {
    if (ctx) {
      if (ctx.state === 'suspended') ctx.resume();
      return true;
    }
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = muted ? 0 : 0.5;
      master.connect(ctx.destination);
      musicGain = ctx.createGain();
      musicGain.gain.value = 0.16;
      musicGain.connect(master);
    } catch {
      return false;
    }
    return true;
  }

  function tone(freq, dur, type, vol, when = 0, slideTo = 0) {
    if (!ctx) return;
    const t0 = ctx.currentTime + when;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (slideTo > 0) osc.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
    gain.gain.setValueAtTime(vol, t0);
    gain.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    osc.connect(gain);
    gain.connect(master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  function noise(dur, vol, filterFreq, when = 0) {
    if (!ctx) return;
    const t0 = ctx.currentTime + when;
    const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
    const buffer = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < len; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = filterFreq;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(vol, t0);
    gain.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    src.connect(filter);
    filter.connect(gain);
    gain.connect(master);
    src.start(t0);
  }

  function scheduleBar() {
    if (!ctx) return;
    const eighth = 60 / 132 / 2;
    const barStart = Math.max(ctx.currentTime + 0.05, nextBarTime);
    const root = BASS[bar % BASS.length];
    tone(root, eighth * 7.5, 'triangle', 0.5, barStart - ctx.currentTime);
    tone(root * 2, eighth * 2, 'sine', 0.18, barStart - ctx.currentTime);
    for (let i = 0; i < 4; i += 1) {
      const note = SPARKLE[(bar * 4 + i) % SPARKLE.length];
      tone(note, eighth * 1.8, 'sine', 0.07, barStart - ctx.currentTime + i * eighth * 2);
    }
    nextBarTime = barStart + eighth * 8;
    bar += 1;
  }

  return {
    /** Call from any user gesture; safe to call any time. */
    unlock() {
      if (ensure()) {
        if (musicTimer === null) {
          nextBarTime = ctx.currentTime + 0.1;
          musicTimer = window.setInterval(scheduleBar, 180);
          scheduleBar();
        }
      }
    },
    toggleMute() {
      muted = !muted;
      if (master) master.gain.value = muted ? 0 : 0.5;
      return muted;
    },
    get muted() {
      return muted;
    },
    shoot() {
      if (!ctx) return;
      tone(720 + Math.random() * 120, 0.07, 'square', 0.08, 0, 320);
    },
    pop() {
      if (!ctx) return;
      noise(0.12, 0.22, 900);
      tone(220, 0.14, 'sine', 0.2, 0, 55);
    },
    pickup() {
      if (!ctx) return;
      tone(880 + Math.random() * 80, 0.09, 'sine', 0.12, 0, 1320);
    },
    levelup() {
      if (!ctx) return;
      [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => tone(f, 0.22, 'triangle', 0.16, i * 0.07));
    },
    hurt() {
      if (!ctx) return;
      tone(140, 0.25, 'sawtooth', 0.25, 0, 60);
      noise(0.18, 0.2, 500);
    },
    dash() {
      if (!ctx) return;
      noise(0.16, 0.14, 2400);
    },
    wave() {
      if (!ctx) return;
      [330, 415.3, 493.88].forEach((f) => tone(f, 0.35, 'triangle', 0.1));
    },
    click() {
      if (!ctx) return;
      tone(660, 0.06, 'sine', 0.12);
    },
    gameover() {
      if (!ctx) return;
      [392, 311.13, 233.08, 155.56].forEach((f, i) => tone(f, 0.4, 'triangle', 0.16, i * 0.16));
    },
  };
}
