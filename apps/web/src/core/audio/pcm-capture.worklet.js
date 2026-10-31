// AudioContext requests 16 kHz; use the actual rate to keep the wire format exact.
class PcmCaptureProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.samples = [];
    this.position = 0;
    this.pcm = new DataView(new ArrayBuffer(3200 * 2));
    this.count = 0;
    this.energy = 0;
  }

  process(inputs) {
    const input = inputs[0]?.[0];
    if (!input) return true;
    this.samples.push(...input);
    const ratio = sampleRate / 16000;
    while (this.position + 1 < this.samples.length) {
      const index = Math.floor(this.position);
      const fraction = this.position - index;
      const value = Math.max(-1, Math.min(1, this.samples[index] * (1 - fraction) + this.samples[index + 1] * fraction));
      this.pcm.setInt16(this.count * 2, value < 0 ? value * 32768 : value * 32767, true);
      this.energy += value * value;
      this.count++;
      this.position += ratio;
      if (this.count === 3200) {
        const pcm = this.pcm.buffer;
        this.port.postMessage({ pcm, rms: Math.min(1, Math.sqrt(this.energy / this.count) * 4) }, [pcm]);
        this.pcm = new DataView(new ArrayBuffer(3200 * 2));
        this.count = 0;
        this.energy = 0;
      }
    }
    const consumed = Math.floor(this.position);
    this.samples.splice(0, consumed);
    this.position -= consumed;
    return true;
  }
}
registerProcessor('cuex-pcm-capture', PcmCaptureProcessor);
