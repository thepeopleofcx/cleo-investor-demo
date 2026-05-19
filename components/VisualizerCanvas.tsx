"use client";

import { useEffect, useRef, useCallback } from "react";
import type { AudioLevels } from "@/lib/audio/analyser";

export type VisualizerVoiceMode = "unknown" | "listening" | "speaking";
export type VisualizerRenderMode = "ambient" | "interactive";
export type VisualizerTuningProfile = "home" | "cleo";

/** All tunable shader parameters with their production defaults */
export interface VisualizerOverrides {
  // Colors & Appearance
  corePaletteA?: [number, number, number];
  corePaletteB?: [number, number, number];
  corePaletteC?: [number, number, number];
  corePaletteD?: [number, number, number];
  haloPaletteA?: [number, number, number];
  haloPaletteB?: [number, number, number];
  haloPaletteC?: [number, number, number];
  haloPaletteD?: [number, number, number];
  bgPaletteA?: [number, number, number];
  bgPaletteB?: [number, number, number];
  bgPaletteC?: [number, number, number];
  bgPaletteD?: [number, number, number];
  saturationBase?: number;
  saturationBassScale?: number;
  hueShiftSpeed?: number;
  toneMapFactor?: number;

  // Orb Shape
  blobRadius?: number;
  softness?: number;
  centerGlowIntensity?: number;
  haloStrength?: number;

  // Motion & Flow
  warpSpeed1?: number;
  warpSpeed2?: number;
  warpSpeed3?: number;
  warpAmp1?: number;
  warpAmp2?: number;
  warpAmp3?: number;
  breathingSpeed?: number;
  breathingAmp?: number;
  bgRotationSpeed?: number;

  // Audio Reactivity
  bassWarpInfluence?: number;
  midWarpInfluence?: number;
  trebleWarpInfluence?: number;
  audioRadiusScale?: number;
  trebleShimmerIntensity?: number;

  // Pointer
  pointerInfluence?: number;
}

export const VISUALIZER_DEFAULTS: Required<VisualizerOverrides> = {
  corePaletteA: [0.8, 0.8, 0.8],
  corePaletteB: [1.12, 0.25, 0.45],
  corePaletteC: [1.0, 0.4, 0.4],
  corePaletteD: [0.11, 0.11, 0.46],
  haloPaletteA: [1.0, 1.0, 1.02],
  haloPaletteB: [0.5, 0.4, 0.5],
  haloPaletteC: [0.8, 1.0, 0.6],
  haloPaletteD: [1.4, 2.0, 1.0],
  bgPaletteA: [0.0, 0.0, 0.4],
  bgPaletteB: [0.35, 0.30, 0.35],
  bgPaletteC: [0.8, 0.6, 1.0],
  bgPaletteD: [1.0, 0.21, 1.0],
  saturationBase: 1.25,
  saturationBassScale: 1.5,
  hueShiftSpeed: 0.125,
  toneMapFactor: 0.33,
  blobRadius: 1.5,
  softness: 1.2,
  centerGlowIntensity: 1.7,
  haloStrength: 4.0,
  warpSpeed1: 0.3,
  warpSpeed2: 0.5,
  warpSpeed3: 0.3,
  warpAmp1: 0.04,
  warpAmp2: 0.05,
  warpAmp3: 0.02,
  breathingSpeed: 0.23,
  breathingAmp: 0.075,
  bgRotationSpeed: 0.15,
  bassWarpInfluence: 0.2,
  midWarpInfluence: 0.75,
  trebleWarpInfluence: 0.3,
  audioRadiusScale: 1.2,
  trebleShimmerIntensity: 0.05,
  pointerInfluence: 0.51,
};

export type VisualizerCanvasProps = {
  audioLevels?: AudioLevels;
  mode?: VisualizerVoiceMode;
  renderMode?: VisualizerRenderMode;
  tuningProfile?: VisualizerTuningProfile;
  enableDevControls?: boolean;
  overrides?: VisualizerOverrides;
  onReady?: () => void;
};

const VERT = `
  attribute vec2 position;
  void main() { gl_Position = vec4(position, 0.0, 1.0); }
`;

const FRAG = `
precision highp float;

uniform vec2  uResolution;
uniform float uTime;
uniform float uBass;
uniform float uMid;
uniform float uTreble;
uniform float uOverall;
uniform float uSpeaking;

// tunable uniforms
uniform vec3  uCorePalA, uCorePalB, uCorePalC, uCorePalD;
uniform vec3  uHaloPalA, uHaloPalB, uHaloPalC, uHaloPalD;
uniform vec3  uBgPalA, uBgPalB, uBgPalC, uBgPalD;
uniform float uSatBase, uSatBassScale;
uniform float uHueShiftSpeed;
uniform float uToneMap;
uniform float uBlobRadius, uSoftness, uCenterGlow, uHaloStrength;
uniform float uWarpSpeed1, uWarpSpeed2, uWarpSpeed3;
uniform float uWarpAmp1, uWarpAmp2, uWarpAmp3;
uniform float uBreathSpeed, uBreathAmp;
uniform float uBgRotSpeed;
uniform float uBassWarp, uMidWarp, uTrebleWarp;
uniform float uAudioRadius, uTrebleShimmer;
uniform vec2  uPointer;
uniform float uPointerInfluence;

// ── simplex 3D noise ──
vec3 mod289(vec3 x){ return x - floor(x*(1.0/289.0))*289.0; }
vec4 mod289(vec4 x){ return x - floor(x*(1.0/289.0))*289.0; }
vec4 permute(vec4 x){ return mod289(((x*34.0)+1.0)*x); }
vec4 taylorInvSqrt(vec4 r){ return 1.79284291400159 - 0.85373472095314*r; }

float snoise(vec3 v){
  const vec2 C = vec2(1.0/6.0, 1.0/3.0);
  const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
  vec3 i = floor(v + dot(v, C.yyy));
  vec3 x0 = v - i + dot(i, C.xxx);
  vec3 g = step(x0.yzx, x0.xyz);
  vec3 l = 1.0 - g;
  vec3 i1 = min(g.xyz, l.zxy);
  vec3 i2 = max(g.xyz, l.zxy);
  vec3 x1 = x0 - i1 + C.xxx;
  vec3 x2 = x0 - i2 + C.yyy;
  vec3 x3 = x0 - D.yyy;
  i = mod289(i);
  vec4 p = permute(permute(permute(
    i.z + vec4(0.0,i1.z,i2.z,1.0))
    + i.y + vec4(0.0,i1.y,i2.y,1.0))
    + i.x + vec4(0.0,i1.x,i2.x,1.0));
  float n_ = 0.142857142857;
  vec3 ns = n_ * D.wyz - D.xzx;
  vec4 j = p - 49.0*floor(p*ns.z*ns.z);
  vec4 x_ = floor(j*ns.z);
  vec4 y_ = floor(j - 7.0*x_);
  vec4 px = x_*ns.x + ns.yyyy;
  vec4 py = y_*ns.x + ns.yyyy;
  vec4 h = 1.0 - abs(px) - abs(py);
  vec4 b0 = vec4(px.xy, py.xy);
  vec4 b1 = vec4(px.zw, py.zw);
  vec4 s0 = floor(b0)*2.0 + 1.0;
  vec4 s1 = floor(b1)*2.0 + 1.0;
  vec4 sh = -step(h, vec4(0.0));
  vec4 a0 = b0.xzyw + s0.xzyw*sh.xxyy;
  vec4 a1 = b1.xzyw + s1.xzyw*sh.zzww;
  vec3 p0 = vec3(a0.xy, h.x);
  vec3 p1 = vec3(a0.zw, h.y);
  vec3 p2 = vec3(a1.xy, h.z);
  vec3 p3 = vec3(a1.zw, h.w);
  vec4 norm = taylorInvSqrt(vec4(dot(p0,p0),dot(p1,p1),dot(p2,p2),dot(p3,p3)));
  p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
  vec4 m = max(0.6 - vec4(dot(x0,x0),dot(x1,x1),dot(x2,x2),dot(x3,x3)), 0.0);
  m = m*m;
  return 42.0 * dot(m*m, vec4(dot(p0,x0),dot(p1,x1),dot(p2,x2),dot(p3,x3)));
}

vec3 palette(float t, vec3 a, vec3 b, vec3 c, vec3 d){
  return a + b * cos(6.28318*(c*t + d));
}

void main(){
  vec2 uv = gl_FragCoord.xy / uResolution;
  vec2 p  = (gl_FragCoord.xy - 0.5*uResolution) / min(uResolution.x, uResolution.y);

  float t = uTime;

  float bassF   = uBass;
  float midF    = uMid;
  float trebleF = uTreble;
  float levelF  = uOverall;
  float speak   = uSpeaking;

  // pointer warp
  vec2 ptrDelta = uPointer - p;
  float ptrDist = length(ptrDelta);
  vec2 ptrWarp = ptrDelta * uPointerInfluence * exp(-ptrDist * 4.0);
  p += ptrWarp;

  float angle = atan(p.y, p.x);
  float dist  = length(p);

  float warp1 = snoise(vec3(p * 2.0, t * uWarpSpeed1)) * (uWarpAmp1 + bassF * uBassWarp);
  float warp2 = snoise(vec3(p * 4.0, t * uWarpSpeed2 + 10.0)) * (uWarpAmp2 + midF * uMidWarp);
  float warp3 = snoise(vec3(p * 8.0, t * uWarpSpeed3 + 20.0)) * (uWarpAmp3 + trebleF * uTrebleWarp);

  float blobRadius = uBlobRadius + levelF * uAudioRadius + speak * 0.04
                   + sin(t * uBreathSpeed) * uBreathAmp;
  float blobDist = dist - blobRadius - warp1 - warp2 - warp3;

  float softness = uSoftness + bassF * 0.08;
  float blob = 1.0 - smoothstep(-softness * 0.4, softness, blobDist);
  float halo = exp(-blobDist * blobDist / (softness * softness * 1.8)) * uHaloStrength;

  float hueShift = t * uHueShiftSpeed + bassF * 0.3;

  vec3 coreColor = palette(
    hueShift + dist * 0.5 + warp1 * 2.0,
    uCorePalA, uCorePalB, uCorePalC, uCorePalD
  );

  float sat = uSatBase + bassF * uSatBassScale;
  vec3 gray = vec3(dot(coreColor, vec3(0.299, 0.587, 0.114)));
  coreColor = mix(gray, coreColor, sat);

  vec3 haloColor = palette(
    hueShift + 0.5 + angle * 0.15,
    uHaloPalA, uHaloPalB, uHaloPalC, uHaloPalD
  );

  float bgAngle = atan(uv.y - 0.5, uv.x - 0.5);
  float bgPhase = t * uBgRotSpeed;
  vec3 bgColor = palette(
    bgAngle * 0.16 + bgPhase + midF * 0.2,
    uBgPalA, uBgPalB, uBgPalC, uBgPalD
  );
  bgColor *= 0.7 + 0.3 * (1.0 - dist * 0.4);

  vec3 color = bgColor;
  color = mix(color, haloColor, halo * (0.7 + speak * 0.3));
  color = mix(color, coreColor, blob);

  float centerGlow = exp(-dist * dist / 0.06) * uCenterGlow * (1.0 + speak * 0.3);
  color += vec3(centerGlow);

  float shimmer = snoise(vec3(p * 12.0, t * 0.8)) * trebleF * uTrebleShimmer;
  color += shimmer * blob;

  float speakPulse = speak * sin(t * 4.0) * 0.08;
  color *= 1.0 + speakPulse;

  color = color / (1.0 + color * uToneMap);

  gl_FragColor = vec4(color, 1.0);
}
`;

export function VisualizerCanvas({
  audioLevels,
  mode = "unknown",
  renderMode = "ambient",
  overrides,
  onReady,
}: VisualizerCanvasProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const audioRef = useRef(audioLevels);
  const modeRef = useRef(mode);
  const renderModeRef = useRef(renderMode);
  const overridesRef = useRef(overrides);
  const pointerRef = useRef<[number, number]>([0, 0]);
  audioRef.current = audioLevels;
  modeRef.current = mode;
  renderModeRef.current = renderMode;
  overridesRef.current = overrides;

  const stateRef = useRef<{
    gl: WebGLRenderingContext;
    prog: WebGLProgram;
    locs: Record<string, WebGLUniformLocation | null>;
    raf: number;
    t0: number;
    sBass: number;
    sMid: number;
    sTreble: number;
    sOverall: number;
    sSpeaking: number;
    canvas: HTMLCanvasElement;
  } | null>(null);

  const handlePointerMove = useCallback((e: PointerEvent) => {
    const s = stateRef.current;
    if (!s) return;
    const rect = s.canvas.getBoundingClientRect();
    const minDim = Math.min(rect.width, rect.height);
    pointerRef.current = [
      (e.clientX - rect.left - rect.width / 2) / minDim,
      -(e.clientY - rect.top - rect.height / 2) / minDim,
    ];
  }, []);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const canvas = document.createElement("canvas");
    canvas.style.cssText = "position:absolute;inset:0;width:100%;height:100%";
    host.appendChild(canvas);

    canvas.addEventListener("pointermove", handlePointerMove);

    const gl = canvas.getContext("webgl", {
      antialias: false,
      powerPreference: "high-performance",
    });
    if (!gl) return;

    const compile = (type: number, src: string) => {
      const s = gl.createShader(type)!;
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
        console.error(gl.getShaderInfoLog(s));
      }
      return s;
    };
    const vs = compile(gl.VERTEX_SHADER, VERT);
    const fs = compile(gl.FRAGMENT_SHADER, FRAG);
    const prog = gl.createProgram()!;
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    gl.useProgram(prog);

    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 1,-1, -1,1, 1,1]), gl.STATIC_DRAW);
    const posAttr = gl.getAttribLocation(prog, "position");
    gl.enableVertexAttribArray(posAttr);
    gl.vertexAttribPointer(posAttr, 2, gl.FLOAT, false, 0, 0);

    const loc = (n: string) => gl.getUniformLocation(prog, n);
    const locs: Record<string, WebGLUniformLocation | null> = {};
    const uniformNames = [
      "uResolution", "uTime", "uBass", "uMid", "uTreble", "uOverall", "uSpeaking",
      "uCorePalA", "uCorePalB", "uCorePalC", "uCorePalD",
      "uHaloPalA", "uHaloPalB", "uHaloPalC", "uHaloPalD",
      "uBgPalA", "uBgPalB", "uBgPalC", "uBgPalD",
      "uSatBase", "uSatBassScale", "uHueShiftSpeed", "uToneMap",
      "uBlobRadius", "uSoftness", "uCenterGlow", "uHaloStrength",
      "uWarpSpeed1", "uWarpSpeed2", "uWarpSpeed3",
      "uWarpAmp1", "uWarpAmp2", "uWarpAmp3",
      "uBreathSpeed", "uBreathAmp", "uBgRotSpeed",
      "uBassWarp", "uMidWarp", "uTrebleWarp",
      "uAudioRadius", "uTrebleShimmer",
      "uPointer", "uPointerInfluence",
    ];
    for (const n of uniformNames) locs[n] = loc(n);

    const state = {
      gl, prog, locs, canvas,
      raf: 0,
      t0: performance.now(),
      sBass: 0, sMid: 0, sTreble: 0, sOverall: 0, sSpeaking: 0,
    };
    stateRef.current = state;

    const dpr = Math.min(devicePixelRatio, 2);
    const resize = () => {
      const w = host.clientWidth;
      const h = host.clientHeight;
      if (w < 1 || h < 1) return;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      gl.viewport(0, 0, canvas.width, canvas.height);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(host);

    const DECAY = 0.92;
    const ATTACK = 0.35;
    const D = VISUALIZER_DEFAULTS;

    const frame = () => {
      if (!stateRef.current) return;
      state.raf = requestAnimationFrame(frame);

      const now = (performance.now() - state.t0) / 1000;
      const lvl = audioRef.current || { bass: 0, mid: 0, treble: 0, overall: 0 };
      const isAmbient = renderModeRef.current === "ambient";
      const isSpeaking = modeRef.current === "speaking";

      let scale = 1.0;
      if (isAmbient) scale = 0.12;
      else if (isSpeaking) scale = 1.2;
      else if (modeRef.current === "listening") scale = 0.6;

      const tgtBass = lvl.bass * scale;
      const tgtMid = lvl.mid * scale;
      const tgtTreble = lvl.treble * scale;
      const tgtOverall = lvl.overall * scale;
      const tgtSpeak = isSpeaking ? 1.0 : 0.0;

      state.sBass = tgtBass > state.sBass
        ? state.sBass + (tgtBass - state.sBass) * ATTACK
        : state.sBass * DECAY;
      state.sMid = tgtMid > state.sMid
        ? state.sMid + (tgtMid - state.sMid) * ATTACK
        : state.sMid * DECAY;
      state.sTreble = tgtTreble > state.sTreble
        ? state.sTreble + (tgtTreble - state.sTreble) * ATTACK
        : state.sTreble * DECAY;
      state.sOverall = tgtOverall > state.sOverall
        ? state.sOverall + (tgtOverall - state.sOverall) * ATTACK
        : state.sOverall * DECAY;
      state.sSpeaking += (tgtSpeak - state.sSpeaking) * 0.08;

      const o = overridesRef.current;

      gl.uniform2f(locs.uResolution, canvas.width, canvas.height);
      gl.uniform1f(locs.uTime, now);
      gl.uniform1f(locs.uBass, state.sBass);
      gl.uniform1f(locs.uMid, state.sMid);
      gl.uniform1f(locs.uTreble, state.sTreble);
      gl.uniform1f(locs.uOverall, state.sOverall);
      gl.uniform1f(locs.uSpeaking, state.sSpeaking);

      const v3 = (loc: WebGLUniformLocation | null, val: [number, number, number]) =>
        gl.uniform3f(loc, val[0], val[1], val[2]);

      v3(locs.uCorePalA, o?.corePaletteA ?? D.corePaletteA);
      v3(locs.uCorePalB, o?.corePaletteB ?? D.corePaletteB);
      v3(locs.uCorePalC, o?.corePaletteC ?? D.corePaletteC);
      v3(locs.uCorePalD, o?.corePaletteD ?? D.corePaletteD);
      v3(locs.uHaloPalA, o?.haloPaletteA ?? D.haloPaletteA);
      v3(locs.uHaloPalB, o?.haloPaletteB ?? D.haloPaletteB);
      v3(locs.uHaloPalC, o?.haloPaletteC ?? D.haloPaletteC);
      v3(locs.uHaloPalD, o?.haloPaletteD ?? D.haloPaletteD);
      v3(locs.uBgPalA, o?.bgPaletteA ?? D.bgPaletteA);
      v3(locs.uBgPalB, o?.bgPaletteB ?? D.bgPaletteB);
      v3(locs.uBgPalC, o?.bgPaletteC ?? D.bgPaletteC);
      v3(locs.uBgPalD, o?.bgPaletteD ?? D.bgPaletteD);

      gl.uniform1f(locs.uSatBase, o?.saturationBase ?? D.saturationBase);
      gl.uniform1f(locs.uSatBassScale, o?.saturationBassScale ?? D.saturationBassScale);
      gl.uniform1f(locs.uHueShiftSpeed, o?.hueShiftSpeed ?? D.hueShiftSpeed);
      gl.uniform1f(locs.uToneMap, o?.toneMapFactor ?? D.toneMapFactor);
      gl.uniform1f(locs.uBlobRadius, o?.blobRadius ?? D.blobRadius);
      gl.uniform1f(locs.uSoftness, o?.softness ?? D.softness);
      gl.uniform1f(locs.uCenterGlow, o?.centerGlowIntensity ?? D.centerGlowIntensity);
      gl.uniform1f(locs.uHaloStrength, o?.haloStrength ?? D.haloStrength);
      gl.uniform1f(locs.uWarpSpeed1, o?.warpSpeed1 ?? D.warpSpeed1);
      gl.uniform1f(locs.uWarpSpeed2, o?.warpSpeed2 ?? D.warpSpeed2);
      gl.uniform1f(locs.uWarpSpeed3, o?.warpSpeed3 ?? D.warpSpeed3);
      gl.uniform1f(locs.uWarpAmp1, o?.warpAmp1 ?? D.warpAmp1);
      gl.uniform1f(locs.uWarpAmp2, o?.warpAmp2 ?? D.warpAmp2);
      gl.uniform1f(locs.uWarpAmp3, o?.warpAmp3 ?? D.warpAmp3);
      gl.uniform1f(locs.uBreathSpeed, o?.breathingSpeed ?? D.breathingSpeed);
      gl.uniform1f(locs.uBreathAmp, o?.breathingAmp ?? D.breathingAmp);
      gl.uniform1f(locs.uBgRotSpeed, o?.bgRotationSpeed ?? D.bgRotationSpeed);
      gl.uniform1f(locs.uBassWarp, o?.bassWarpInfluence ?? D.bassWarpInfluence);
      gl.uniform1f(locs.uMidWarp, o?.midWarpInfluence ?? D.midWarpInfluence);
      gl.uniform1f(locs.uTrebleWarp, o?.trebleWarpInfluence ?? D.trebleWarpInfluence);
      gl.uniform1f(locs.uAudioRadius, o?.audioRadiusScale ?? D.audioRadiusScale);
      gl.uniform1f(locs.uTrebleShimmer, o?.trebleShimmerIntensity ?? D.trebleShimmerIntensity);

      const ptr = pointerRef.current;
      gl.uniform2f(locs.uPointer, ptr[0], ptr[1]);
      gl.uniform1f(locs.uPointerInfluence, o?.pointerInfluence ?? D.pointerInfluence);

      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    };
    state.raf = requestAnimationFrame(frame);
    if (onReady) requestAnimationFrame(() => onReady());

    return () => {
      ro.disconnect();
      cancelAnimationFrame(state.raf);
      stateRef.current = null;
      canvas.removeEventListener("pointermove", handlePointerMove);
      gl.deleteProgram(prog);
      gl.deleteShader(vs);
      gl.deleteShader(fs);
      gl.deleteBuffer(buf);
      if (host.contains(canvas)) host.removeChild(canvas);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <div ref={hostRef} className="absolute inset-0" aria-hidden="true" />;
}
