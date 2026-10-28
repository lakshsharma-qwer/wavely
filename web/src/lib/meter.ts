// Shares the audio analyser between the engine (which owns the <audio> element)
// and the level meters in the deck and the full-screen player.

let ctx: AudioContext | null = null;
let analyser: AnalyserNode | null = null;
let buffer: Uint8Array<ArrayBuffer> | null = null;

/** Routes the element through an analyser. Must run inside a user gesture so the
 *  context starts running; otherwise audio would be silenced. */
export function attachMeter(audio: HTMLAudioElement) {
  if (ctx) {
    if (ctx.state === "suspended") void ctx.resume();
    return;
  }
  try {
    ctx = new AudioContext();
    const source = ctx.createMediaElementSource(audio);
    analyser = ctx.createAnalyser();
    analyser.fftSize = 512;
    analyser.smoothingTimeConstant = 0.6;
    source.connect(analyser);
    analyser.connect(ctx.destination);
    buffer = new Uint8Array(analyser.fftSize);
  } catch {
    ctx = null;
    analyser = null;
  }
}

export function resumeMeter() {
  if (ctx?.state === "suspended") void ctx.resume();
}

/** Current loudness, 0..1 (RMS of the waveform, lightly expanded). */
export function readLevel(): number {
  if (!analyser || !buffer) return 0;
  analyser.getByteTimeDomainData(buffer);
  let sum = 0;
  for (const v of buffer) {
    const x = (v - 128) / 128;
    sum += x * x;
  }
  return Math.min(1, Math.sqrt(sum / buffer.length) * 2.6);
}

export const meterAvailable = () => analyser !== null;
