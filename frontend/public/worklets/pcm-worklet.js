// AudioWorklet processor for the live call: resamples the mic input to
// 16 kHz mono, converts to PCM16 (s16le), and posts ~100 ms frames
// (1600 samples = 3200 bytes) as transferable ArrayBuffers to the main
// thread, which streams them to the backend WebSocket.

class Pcm16Worklet extends AudioWorkletProcessor {
  constructor() {
    super();
    this._in = []; // pending input samples (context sample rate)
    this._pos = 0; // fractional input position of the next output sample
    this._out = []; // resampled 16 kHz samples waiting for a full frame
  }

  process(inputs) {
    const channel = inputs[0] && inputs[0][0];
    if (channel && channel.length > 0) {
      for (let i = 0; i < channel.length; i++) this._in.push(channel[i]);
      const ratio = sampleRate / 16000;
      while (this._pos + 1 < this._in.length) {
        const i0 = Math.floor(this._pos);
        const frac = this._pos - i0;
        const s = this._in[i0] * (1 - frac) + this._in[i0 + 1] * frac;
        this._out.push(s);
        this._pos += ratio;
      }
      const consumed = Math.floor(this._pos);
      this._in = this._in.slice(consumed);
      this._pos -= consumed;

      while (this._out.length >= 1600) {
        const frame = new Int16Array(1600);
        for (let i = 0; i < 1600; i++) {
          const v = Math.max(-1, Math.min(1, this._out[i]));
          frame[i] = v < 0 ? v * 0x8000 : v * 0x7fff;
        }
        this._out = this._out.slice(1600);
        const buffer = frame.buffer;
        this.port.postMessage(buffer, [buffer]);
      }
    }
    return true;
  }
}

registerProcessor("pcm16-16k", Pcm16Worklet);
