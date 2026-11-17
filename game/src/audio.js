// All sound is synthesized with WebAudio: no audio files, no network. A tiny music
// sequencer (bass + pluck over a chord loop) and one-shot effects. Everything is guarded:
// audio only starts after a user gesture, and a missing AudioContext is never an error.

export function createAudio() {
  let ctx = null;
  let master = null;
  let musicTimer = null;
  let sirenNodes = null;
  let engineNodes = null;
  let step = 0;
  let muted = false;

  function ensure() {
    if (ctx) return ctx;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.35;
      master.connect(ctx.destination);
    } catch {
      ctx = null;
    }
    return ctx;
  }

  function tone(freq, dur, type, vol, when = 0, slideTo = 0) {
    if (!ensure() || muted) return;
    const t0 = ctx.currentTime + when;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
    gain.gain.setValueAtTime(vol, t0);
    gain.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    osc.connect(gain);
    gain.connect(master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  function noise(dur, vol, filterFreq) {
    if (!ensure() || muted) return;
    const t0 = ctx.currentTime;
    const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
    const buffer = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < len; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = filterFreq;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(vol, t0);
    gain.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    source.connect(filter);
    filter.connect(gain);
    gain.connect(master);
    source.start(t0);
  }

  // A sun-soaked four-chord loop (Am – F – C – G) as bass roots and plucked thirds.
  const CHORDS = [
    [110, 130.81, 164.81],
    [87.31, 110, 130.81],
    [130.81, 164.81, 196],
    [98, 123.47, 146.83],
  ];

  function musicTick() {
    if (!ctx || muted) return;
    const chord = CHORDS[Math.floor(step / 8) % CHORDS.length];
    const beat = step % 8;
    if (beat === 0 || beat === 4) tone(chord[0], 0.5, 'triangle', 0.16);
    if (beat === 2 || beat === 6) tone(chord[1], 0.3, 'sine', 0.1);
    if (beat === 1 || beat === 3 || beat === 5 || beat === 7) tone(chord[2] * 2, 0.12, 'square', 0.03);
    if (beat === 7) noise(0.05, 0.05, 4000);
    step += 1;
  }

  return {
    /** Call from a user gesture: unlocks the context and starts the music. */
    unlock() {
      if (!ensure()) return;
      if (ctx.state === 'suspended') ctx.resume().catch(() => {});
      if (!musicTimer) musicTimer = window.setInterval(musicTick, 220);
    },
    setMuted(value) {
      muted = value;
      if (master) master.gain.value = value ? 0 : 0.35;
      if (value) this.stopSiren();
    },
    gunshot() {
      noise(0.12, 0.5, 1800);
      tone(180, 0.08, 'square', 0.2, 0, 60);
    },
    punch() {
      noise(0.08, 0.3, 900);
    },
    pickup() {
      tone(660, 0.1, 'sine', 0.25);
      tone(990, 0.14, 'sine', 0.25, 0.08);
    },
    crash() {
      noise(0.25, 0.5, 500);
      tone(90, 0.2, 'sawtooth', 0.25, 0, 40);
    },
    missionDone() {
      [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => tone(f, 0.22, 'triangle', 0.25, i * 0.11));
    },
    missionStart() {
      tone(392, 0.15, 'triangle', 0.22);
      tone(523.25, 0.2, 'triangle', 0.22, 0.12);
    },
    busted() {
      tone(220, 0.4, 'sawtooth', 0.25, 0, 110);
      tone(220, 0.4, 'sawtooth', 0.25, 0.4, 110);
    },
    wasted() {
      [330, 262, 196, 131].forEach((f, i) => tone(f, 0.3, 'sawtooth', 0.2, i * 0.22));
    },
    carDoor() {
      noise(0.07, 0.2, 1200);
      tone(140, 0.06, 'square', 0.12, 0.02, 90);
    },
    /** Two-tone police siren loop; call stopSiren when the wanted level clears. */
    startSiren() {
      if (!ensure() || muted || sirenNodes) return;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = 700;
      gain.gain.value = 0.045;
      const lfo = ctx.createOscillator();
      lfo.frequency.value = 1.4;
      const lfoGain = ctx.createGain();
      lfoGain.gain.value = 220;
      lfo.connect(lfoGain);
      lfoGain.connect(osc.frequency);
      osc.connect(gain);
      gain.connect(master);
      osc.start();
      lfo.start();
      sirenNodes = { osc, lfo, gain };
    },
    stopSiren() {
      if (!sirenNodes) return;
      try {
        sirenNodes.osc.stop();
        sirenNodes.lfo.stop();
      } catch {
        // Already stopped.
      }
      sirenNodes = null;
    },
    /** Engine hum that follows the car's speed; call with 0 to silence it. */
    engine(speed01) {
      if (!ensure() || muted) {
        if (engineNodes) {
          try { engineNodes.osc.stop(); } catch { /* already stopped */ }
          engineNodes = null;
        }
        return;
      }
      if (!engineNodes) {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.value = 60;
        gain.gain.value = 0;
        const filter = ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = 500;
        osc.connect(filter);
        filter.connect(gain);
        gain.connect(master);
        osc.start();
        engineNodes = { osc, gain };
      }
      engineNodes.osc.frequency.setTargetAtTime(55 + speed01 * 130, ctx.currentTime, 0.05);
      engineNodes.gain.gain.setTargetAtTime(speed01 > 0.02 ? 0.05 : 0, ctx.currentTime, 0.1);
    },
  };
}
