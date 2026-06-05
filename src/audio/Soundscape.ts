import { WorldState } from "../spectral/WorldState";

/** Pitch (Hz) each room's band "sings" at — a soft open voicing (the chord). */
const ROOM_PITCH = [146.83, 220.0, 329.63]; // D3, A3, E4

export interface SoundState {
  world: WorldState;
  ghostBlend: number;
  dissolve: number;
  room: number; // current room index, or -1
  bandCorrect: boolean; // selected band matches the current room's required band
  shimmer: number; // 0..1 nearness to phase lock for the current room
}

/**
 * Fully-procedural Web Audio soundscape (no audio files). The world "sings":
 * each room hums at its band's pitch, tuning to the right band lets that voice
 * ring, nearing the phase lock raises a shimmer, locking confirms, and the chord
 * resolves on reconstruction. Safari-safe: the AudioContext is created/resumed
 * inside a user gesture (see unlock()).
 */
export class Soundscape {
  muted = false;
  private ctx?: AudioContext;
  private master?: GainNode;
  private wet?: GainNode; // feedback-delay send (a little "memory" space)
  private bedGain?: GainNode;
  private bedFilter?: BiquadFilterNode;
  private voiceOsc?: OscillatorNode;
  private voiceFilter?: BiquadFilterNode;
  private voiceGain?: GainNode;
  private detuneLfo?: OscillatorNode;
  private detuneDepth?: GainNode;
  private shimmerOsc?: OscillatorNode;
  private shimmerGain?: GainNode;
  private started = false;

  private static readonly MASTER = 0.32;

  /** Call inside a user gesture (Safari requires this). Idempotent. */
  unlock(): void {
    if (this.started) {
      this.ctx?.resume?.();
      return;
    }
    try {
      const Ctor: typeof AudioContext | undefined =
        window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return;
      const ctx = new Ctor();
      this.ctx = ctx;
      const now = ctx.currentTime;

      this.master = ctx.createGain();
      this.master.gain.setValueAtTime(0, now);
      this.master.connect(ctx.destination);

      // a gentle feedback delay for space
      const delay = ctx.createDelay(1.0);
      delay.delayTime.value = 0.26;
      const fb = ctx.createGain();
      fb.gain.value = 0.34;
      this.wet = ctx.createGain();
      this.wet.gain.value = 0.5;
      delay.connect(fb);
      fb.connect(delay);
      delay.connect(this.master);
      this.wet.connect(delay);

      // ---- bed: an open-fifth drone through a soft lowpass ----
      this.bedFilter = ctx.createBiquadFilter();
      this.bedFilter.type = "lowpass";
      this.bedFilter.frequency.value = 380;
      this.bedFilter.Q.value = 0.6;
      this.bedGain = ctx.createGain();
      this.bedGain.gain.value = 0.0;
      this.bedFilter.connect(this.bedGain);
      this.bedGain.connect(this.master);
      this.bedGain.connect(this.wet);
      for (const [freq, type] of [
        [73.42, "sine"],
        [110.0, "sine"],
        [164.81, "triangle"]
      ] as [number, OscillatorType][]) {
        const o = ctx.createOscillator();
        o.type = type;
        o.frequency.value = freq;
        o.detune.value = (freq % 7) - 3;
        o.connect(this.bedFilter);
        o.start();
      }

      // ---- voice: the current room's tone through a bandpass ----
      this.voiceOsc = ctx.createOscillator();
      this.voiceOsc.type = "triangle";
      this.voiceOsc.frequency.value = ROOM_PITCH[0];
      this.voiceFilter = ctx.createBiquadFilter();
      this.voiceFilter.type = "bandpass";
      this.voiceFilter.frequency.value = ROOM_PITCH[0];
      this.voiceFilter.Q.value = 3;
      this.voiceGain = ctx.createGain();
      this.voiceGain.gain.value = 0;
      this.voiceOsc.connect(this.voiceFilter);
      this.voiceFilter.connect(this.voiceGain);
      this.voiceGain.connect(this.master);
      this.voiceGain.connect(this.wet);
      // a slow detune wobble (the "hum"); depth rises when off-band
      this.detuneLfo = ctx.createOscillator();
      this.detuneLfo.type = "sine";
      this.detuneLfo.frequency.value = 5.5;
      this.detuneDepth = ctx.createGain();
      this.detuneDepth.gain.value = 18;
      this.detuneLfo.connect(this.detuneDepth);
      this.detuneDepth.connect(this.voiceOsc.detune);
      this.voiceOsc.start();
      this.detuneLfo.start();

      // ---- shimmer: a high partial that rises near the phase lock ----
      this.shimmerOsc = ctx.createOscillator();
      this.shimmerOsc.type = "sine";
      this.shimmerOsc.frequency.value = ROOM_PITCH[0] * 3;
      this.shimmerGain = ctx.createGain();
      this.shimmerGain.gain.value = 0;
      this.shimmerOsc.connect(this.shimmerGain);
      this.shimmerGain.connect(this.wet);
      this.shimmerGain.connect(this.master);
      this.shimmerOsc.start();

      this.started = true;
      ctx.resume?.();
      // ease master in to avoid a click
      this.master.gain.setTargetAtTime(this.muted ? 0 : Soundscape.MASTER, now, 0.4);
    } catch {
      this.ctx = undefined; // audio unavailable (e.g. headless) — game stays silent, no errors
    }
  }

  toggleMuted(): boolean {
    this.muted = !this.muted;
    if (this.ctx && this.master) {
      this.master.gain.setTargetAtTime(this.muted ? 0 : Soundscape.MASTER, this.ctx.currentTime, 0.1);
    }
    return this.muted;
  }

  /** Per-frame reactive mix. Safe to call before unlock (no-ops). */
  update(s: SoundState): void {
    const ctx = this.ctx;
    if (!ctx || !this.started) return;
    const t = ctx.currentTime;
    const tc = 0.12;

    // bed: quiet in reality, present in ghosts, muffled+wider in deep resonance
    const bedLevel = 0.05 + 0.05 * s.ghostBlend + 0.04 * s.dissolve;
    this.bedGain!.gain.setTargetAtTime(bedLevel, t, 0.4);
    this.bedFilter!.frequency.setTargetAtTime(280 + 500 * s.ghostBlend - 160 * s.dissolve, t, 0.5);

    const active = s.world !== WorldState.Reality && s.room >= 0;
    if (active) {
      const pitch = ROOM_PITCH[s.room] ?? ROOM_PITCH[0];
      this.voiceOsc!.frequency.setTargetAtTime(pitch, t, 0.2);
      this.voiceFilter!.frequency.setTargetAtTime(s.bandCorrect ? pitch : pitch * 0.5, t, 0.2);
      this.voiceFilter!.Q.setTargetAtTime(s.bandCorrect ? 8 : 1.5, t, 0.2);
      this.voiceGain!.gain.setTargetAtTime((s.bandCorrect ? 0.16 : 0.05) * s.ghostBlend, t, tc);
      this.detuneDepth!.gain.setTargetAtTime(s.bandCorrect ? 3 : 22, t, tc);
      this.shimmerOsc!.frequency.setTargetAtTime(pitch * 3, t, 0.2);
      this.shimmerGain!.gain.setTargetAtTime(0.08 * s.shimmer * s.ghostBlend, t, tc);
    } else {
      this.voiceGain!.gain.setTargetAtTime(0, t, tc);
      this.shimmerGain!.gain.setTargetAtTime(0, t, tc);
    }
  }

  /** A node just phase-locked — a soft confirming swell at its pitch. */
  lockVoice(room: number): void {
    this.blip(ROOM_PITCH[room] ?? 220, 0.5, 0.12, "sine");
    this.blip((ROOM_PITCH[room] ?? 220) * 2, 0.4, 0.06, "sine", 0.04);
  }

  /** Consonant commit — the three room pitches resolve as one chord. */
  resolveChord(): void {
    if (!this.ctx) return;
    ROOM_PITCH.forEach((f, i) => this.blip(f, 2.2, 0.12, "triangle", i * 0.06));
    this.blip(ROOM_PITCH[0] * 2, 2.2, 0.06, "sine", 0.2);
  }

  /** Dissonant commit — a detuned cluster + a low shudder. */
  dissonance(): void {
    if (!this.ctx) return;
    this.blip(ROOM_PITCH[1], 0.7, 0.1, "sawtooth");
    this.blip(ROOM_PITCH[1] * 1.06, 0.7, 0.1, "sawtooth", 0.0); // beating cluster
    this.blip(60, 0.5, 0.16, "sine", 0.0); // low thud
  }

  /** One-shot enveloped tone. */
  private blip(freq: number, dur: number, peak: number, type: OscillatorType, delay = 0): void {
    const ctx = this.ctx;
    if (!ctx || this.muted) return;
    const t0 = ctx.currentTime + delay;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t0 + 0.04);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g);
    g.connect(this.master!);
    if (this.wet) g.connect(this.wet);
    o.start(t0);
    o.stop(t0 + dur + 0.05);
  }
}
