export type AudioLevels = {
  overall: number;
  bass: number;
  mid: number;
  treble: number;
};

export type FrequencyBandRanges = {
  bass: [number, number];
  mid: [number, number];
  treble: [number, number];
};

export type StreamAnalyser = {
  analyser: AnalyserNode;
  audioContext: AudioContext;
  getLevels: () => AudioLevels;
  dispose: () => void;
};

const DEFAULT_BANDS: FrequencyBandRanges = {
  bass: [20, 140],
  mid: [140, 2000],
  treble: [2000, 8000]
};

export const ZERO_AUDIO_LEVELS: AudioLevels = {
  overall: 0,
  bass: 0,
  mid: 0,
  treble: 0
};

const clamp01 = (value: number) => Math.max(0, Math.min(1, value));

const smoothStep = (current: number, target: number, attack: number, release: number) => {
  const coefficient = target > current ? attack : release;
  return current + (target - current) * clamp01(coefficient);
};

const getBinRange = (analyser: AnalyserNode, fromHz: number, toHz: number) => {
  const nyquist = analyser.context.sampleRate / 2;
  const maxIndex = analyser.frequencyBinCount - 1;
  const start = Math.max(0, Math.min(maxIndex, Math.floor((fromHz / nyquist) * analyser.frequencyBinCount)));
  const end = Math.max(start + 1, Math.min(maxIndex, Math.ceil((toHz / nyquist) * analyser.frequencyBinCount)));
  return { start, end };
};

const averageBinMagnitude = (data: Uint8Array, start: number, end: number) => {
  if (end <= start) {
    return 0;
  }

  let sum = 0;
  for (let i = start; i <= end; i += 1) {
    sum += data[i];
  }

  const average = sum / (end - start + 1);
  return clamp01(average / 255);
};

const computeRms = (timeData: Float32Array) => {
  if (timeData.length === 0) {
    return 0;
  }

  let squareSum = 0;
  for (let i = 0; i < timeData.length; i += 1) {
    const sample = timeData[i];
    squareSum += sample * sample;
  }

  return clamp01(Math.sqrt(squareSum / timeData.length));
};

export const createAnalyserFromStream = (
  stream: MediaStream,
  options?: {
    fftSize?: number;
    smoothingTimeConstant?: number;
    bands?: Partial<FrequencyBandRanges>;
  }
): StreamAnalyser => {
  const audioContext = new AudioContext();
  const source = audioContext.createMediaStreamSource(stream);
  const analyser = audioContext.createAnalyser();

  analyser.fftSize = options?.fftSize ?? 2048;
  analyser.smoothingTimeConstant = options?.smoothingTimeConstant ?? 0.6;

  source.connect(analyser);

  const frequencyData = new Uint8Array(analyser.frequencyBinCount);
  const timeData = new Float32Array(analyser.fftSize);

  const ranges = {
    ...DEFAULT_BANDS,
    ...(options?.bands ?? {})
  };

  return {
    analyser,
    audioContext,
    getLevels: () => {
      analyser.getByteFrequencyData(frequencyData);
      analyser.getFloatTimeDomainData(timeData);

      const bassRange = getBinRange(analyser, ranges.bass[0], ranges.bass[1]);
      const midRange = getBinRange(analyser, ranges.mid[0], ranges.mid[1]);
      const trebleRange = getBinRange(analyser, ranges.treble[0], ranges.treble[1]);

      return {
        overall: computeRms(timeData),
        bass: averageBinMagnitude(frequencyData, bassRange.start, bassRange.end),
        mid: averageBinMagnitude(frequencyData, midRange.start, midRange.end),
        treble: averageBinMagnitude(frequencyData, trebleRange.start, trebleRange.end)
      };
    },
    dispose: () => {
      source.disconnect();
      analyser.disconnect();
      void audioContext.close();
    }
  };
};

export class AudioLevelSmoother {
  private current: AudioLevels;

  constructor(
    private attack = 0.45,
    private release = 0.1,
    seed: AudioLevels = ZERO_AUDIO_LEVELS
  ) {
    this.current = { ...seed };
  }

  updateConfig({ attack, release }: { attack: number; release: number }) {
    this.attack = clamp01(attack);
    this.release = clamp01(release);
  }

  update(next: AudioLevels) {
    this.current = {
      overall: smoothStep(this.current.overall, next.overall, this.attack, this.release),
      bass: smoothStep(this.current.bass, next.bass, this.attack, this.release),
      mid: smoothStep(this.current.mid, next.mid, this.attack, this.release),
      treble: smoothStep(this.current.treble, next.treble, this.attack, this.release)
    };

    return this.current;
  }

  value() {
    return this.current;
  }
}

export const scalarVolumeToLevels = (volume: number): AudioLevels => {
  const normalized = clamp01(volume);
  return {
    overall: normalized,
    bass: clamp01(normalized * 0.9),
    mid: clamp01(normalized * 1.05),
    treble: clamp01(normalized * 0.85)
  };
};
