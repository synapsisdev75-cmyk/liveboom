/// <reference lib="webworker" />

type QualityRequest = {
  id: string;
  width: number;
  height: number;
  buffer: ArrayBuffer;
};

function analyze(width: number, height: number, data: Uint8ClampedArray) {
  const sample = Math.max(1, Math.floor(Math.min(width, height) / 96));
  let brightness = 0;
  let samples = 0;
  let edge = 0;
  let edges = 0;
  for (let y = 1; y < height - 1; y += sample) {
    for (let x = 1; x < width - 1; x += sample) {
      const i = (y * width + x) * 4;
      const luma = (data[i] ?? 0) * 0.299 + (data[i + 1] ?? 0) * 0.587 + (data[i + 2] ?? 0) * 0.114;
      brightness += luma;
      samples += 1;
      const right = (y * width + x + sample) * 4;
      const down = ((y + sample) * width + x) * 4;
      if (right + 2 < data.length && down + 2 < data.length) {
        const lumaR = (data[right] ?? 0) * 0.299 + (data[right + 1] ?? 0) * 0.587 + (data[right + 2] ?? 0) * 0.114;
        const lumaD = (data[down] ?? 0) * 0.299 + (data[down + 1] ?? 0) * 0.587 + (data[down + 2] ?? 0) * 0.114;
        edge += Math.abs(luma - lumaR) + Math.abs(luma - lumaD);
        edges += 1;
      }
    }
  }
  const avg = samples ? brightness / samples : 0;
  const sharpness = edges ? edge / edges : 0;
  return { brightness: avg, sharpness };
}

self.onmessage = (event: MessageEvent<QualityRequest>) => {
  const { id, width, height, buffer } = event.data;
  const data = new Uint8ClampedArray(buffer);
  const metrics = analyze(width, height, data);
  self.postMessage({ id, ...metrics });
};
