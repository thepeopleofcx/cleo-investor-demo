'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import Image from 'next/image';
import { NoiseOverlay } from '@/components/NoiseOverlay';
import { ZERO_AUDIO_LEVELS, type AudioLevels } from '@/lib/audio/analyser';
import {
  ElevenLabsVoiceClient,
  type VoiceAgentMode,
  type VoiceConnectionStatus,
  type TranscriptMessage,
} from '@/lib/elevenlabs/client';

const CloudyVisualizer = dynamic(
  () => import('@/components/VisualizerCanvas').then((m) => m.VisualizerCanvas),
  { ssr: false }
);

const isPrivateAgent = process.env.NEXT_PUBLIC_ELEVENLABS_AGENT_PUBLIC === 'false';
const connectionType =
  process.env.NEXT_PUBLIC_ELEVENLABS_CONNECTION_TYPE === 'websocket' ? 'websocket' : 'webrtc';
const enableWebSocketFallback = process.env.NEXT_PUBLIC_ELEVENLABS_WEBSOCKET_FALLBACK === 'true';

/** Gentle idle animation when no live audio */
const demoWave = (t: number): AudioLevels => {
  const base = 0.07 + (Math.sin(t * 0.8) * 0.5 + 0.5) * 0.06;
  return {
    overall: base,
    bass: 0.08 + (Math.sin(t * 1.12) * 0.5 + 0.5) * 0.12,
    mid: 0.06 + (Math.sin(t * 1.66 + 0.8) * 0.5 + 0.5) * 0.08,
    treble: 0.05 + (Math.sin(t * 2.32 + 1.6) * 0.5 + 0.5) * 0.07,
  };
};

/** Word-by-word fade-in animation */
function AnimatedWords({ text, delayMs = 125 }: { text: string; delayMs?: number }) {
  const words = text.split(/\s+/);
  const [visibleCount, setVisibleCount] = useState(0);

  useEffect(() => {
    setVisibleCount(0);
    if (words.length === 0) return;
    let i = 0;
    const interval = setInterval(() => {
      i++;
      setVisibleCount(i);
      if (i >= words.length) clearInterval(interval);
    }, delayMs);
    return () => clearInterval(interval);
  }, [text, delayMs, words.length]);

  return (
    <span>
      {words.map((word, idx) => (
        <span
          key={idx}
          style={{
            display: 'inline-block',
            opacity: idx < visibleCount ? 1 : 0,
            transform: idx < visibleCount ? 'translateY(0)' : 'translateY(6px)',
            transition: 'opacity 0.3s ease, transform 0.3s ease',
            marginRight: '0.3em',
          }}
        >
          {word}
        </span>
      ))}
    </span>
  );
}

export function InvestorCleoScreen() {
  const clientRef = useRef<ElevenLabsVoiceClient | null>(null);

  const [connectionStatus, setConnectionStatus] = useState<VoiceConnectionStatus>('disconnected');
  const [mode, setMode] = useState<VoiceAgentMode>('unknown');
  const [audioLevels, setAudioLevels] = useState<AudioLevels>(ZERO_AUDIO_LEVELS);
  const [micActive, setMicActive] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [hasLiveAudio, setHasLiveAudio] = useState(false);
  const [caption, setCaption] = useState<string | null>(null);
  const [captionSource, setCaptionSource] = useState<'ai' | 'user' | null>(null);
  const [captionsOn, setCaptionsOn] = useState(false);
  const [closed, setClosed] = useState(false);
  const [fadingOut, setFadingOut] = useState(false);
  const wasConnectedRef = useRef(false);

  // Fade-out → closed transition when Cléo ends the call
  useEffect(() => {
    if (!fadingOut) return;
    const timer = setTimeout(() => setClosed(true), 3500);
    return () => clearTimeout(timer);
  }, [fadingOut]);

  /* ── Google Fonts ─────────────────────────────────────── */
  useEffect(() => {
    const id = 'cleo-google-fonts';
    if (document.getElementById(id)) return;
    const link = document.createElement('link');
    link.id = id;
    link.rel = 'stylesheet';
    link.href =
      'https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;700&family=JetBrains+Mono:wght@400;500&family=Newsreader:ital,wght@1,400&display=swap';
    document.head.appendChild(link);
  }, []);

  // Initialize ElevenLabs voice client — no context fetch, no overrides
  useEffect(() => {
    let cancelled = false;
    let client: ElevenLabsVoiceClient | null = null;

    function init() {
      if (cancelled) return;

      client = new ElevenLabsVoiceClient({
        privateAgent: isPrivateAgent,
        preferConnectionType: connectionType,
        allowWebSocketFallback: enableWebSocketFallback,
        onStatusChange: (nextStatus) => {
          setConnectionStatus(nextStatus);
          if (nextStatus === 'connected') {
            wasConnectedRef.current = true;
            setErrorMessage(null);
            setMicActive(true);
          }
          if (nextStatus === 'disconnected') {
            setHasLiveAudio(false);
            setMicActive(false);
            if (wasConnectedRef.current) {
              setFadingOut(true);
            }
          }
        },
        onModeChange: (nextMode) => setMode(nextMode),
        onAudioLevels: (levels) => {
          setAudioLevels(levels);
          setHasLiveAudio(true);
        },
        onError: (message) => setErrorMessage(message),
        onTranscript: (msg: TranscriptMessage) => {
          setCaption(msg.message);
          setCaptionSource(msg.source);
        },
      });

      clientRef.current = client;
    }

    init();
    return () => {
      cancelled = true;
      if (client) {
        void client.dispose();
      }
      clientRef.current = null;
    };
  }, []);

  // Idle animation when no live audio
  useEffect(() => {
    if (hasLiveAudio) return;
    let frame = 0;
    const start = performance.now();
    const run = (now: number) => {
      const elapsed = (now - start) / 1000;
      setAudioLevels(demoWave(elapsed));
      frame = window.requestAnimationFrame(run);
    };
    frame = window.requestAnimationFrame(run);
    return () => window.cancelAnimationFrame(frame);
  }, [hasLiveAudio]);

  const isConnecting = connectionStatus === 'connecting';
  const isDisconnected = connectionStatus === 'disconnected';
  const isSpeaking = mode === 'speaking';
  const isMutedWhileConnected = !isDisconnected && !isConnecting && !micActive;

  useEffect(() => {
    if (isDisconnected || isConnecting) return;
    if (micActive) {
      void clientRef.current?.beginPushToTalk();
      return;
    }
    void clientRef.current?.endPushToTalk();
  }, [isConnecting, isDisconnected, micActive]);

  const handleMicButtonTap = useCallback(async () => {
    if (isConnecting) return;
    setErrorMessage(null);
    if (isDisconnected) {
      try {
        await clientRef.current?.beginPushToTalk();
        setMicActive(true);
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : 'Unable to start voice session.');
      }
      return;
    }
    setMicActive((current) => !current);
  }, [isConnecting, isDisconnected]);

  const isThinking = !isDisconnected && !isConnecting && !micActive && !isSpeaking;

  const micStatusLabel = isDisconnected
    ? 'TAP TO START'
    : isConnecting
      ? 'CONNECTING...'
      : micActive
        ? 'LISTENING'
        : isSpeaking
          ? 'TALKING'
          : 'THINKING';

  const handleClose = useCallback(async () => {
    await clientRef.current?.dispose();
    clientRef.current = null;
    setFadingOut(true);
  }, []);

  if (fadingOut && !closed) {
    return (
      <div
        style={{
          background: '#000',
          minHeight: '100vh',
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontFamily: "'Inter', sans-serif",
          animation: 'cleo-fade-in 1s ease forwards',
        }}
      >
        <span
          style={{
            fontSize: 14,
            letterSpacing: '0.12em',
            color: 'rgba(255,255,255,0.5)',
            fontStyle: 'italic',
          }}
        >
          Until next time.
        </span>
        <style>{`
          @keyframes cleo-fade-in {
            0% { opacity: 0; }
            100% { opacity: 1; }
          }
        `}</style>
      </div>
    );
  }

  if (closed) {
    return (
      <div
        style={{
          background: '#000',
          minHeight: '100vh',
          width: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          position: 'relative',
          fontFamily: "'Inter', sans-serif",
        }}
      >
        <Image
          src="/cleo-header-logo.png"
          alt="CX"
          width={100}
          height={32}
          style={{ objectFit: 'contain', filter: 'invert(1) brightness(2)' }}
        />
      </div>
    );
  }

  return (
    <div
      style={{
        background: '#090909',
        minHeight: '100vh',
        width: '100%',
        display: 'flex',
        flexDirection: 'column',
        position: 'relative',
        fontFamily: "'Inter', sans-serif",
      }}
    >
      {/* ── Persistent header bar ── */}
      <header
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          width: '100%',
          height: 60,
          background: '#000',
          zIndex: 1000,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          boxSizing: 'border-box',
          padding: '0 16px',
        }}
      >
        {/* CC toggle — left */}
        <button
          onClick={() => setCaptionsOn((v) => !v)}
          aria-label="Toggle captions"
          style={{
            width: 36,
            height: 36,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            padding: 0,
            opacity: captionsOn ? 1 : 0.6,
            transition: 'opacity 0.2s ease',
          }}
        >
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
            <rect x="1" y="4" width="22" height="16" rx="3" stroke="white" strokeWidth="1.5" />
            <text x="12" y="15.5" textAnchor="middle" fontSize="8" fontWeight="700" fontFamily="Inter, sans-serif" fill="white">CC</text>
          </svg>
        </button>

        {/* CX logo — center */}
        <Image
          src="/cleo-header-logo.png"
          alt="CX"
          width={80}
          height={25}
          style={{
            objectFit: 'contain',
            filter: 'invert(1) brightness(2)',
          }}
        />

        {/* Close — right */}
        <button
          onClick={handleClose}
          aria-label="Close"
          style={{
            width: 36,
            height: 36,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            padding: 0,
          }}
        >
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
            <path d="M1 1L17 17M17 1L1 17" stroke="rgba(255,255,255,0.8)" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </button>
      </header>

      {/* ── Content area ── */}
      <div
        style={{
          position: 'absolute',
          top: 60,
          left: 0,
          right: 0,
          bottom: 0,
        }}
      >
        {/* Visualizer layer */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            opacity: captionsOn ? 0 : 1,
            transition: 'opacity 0.3s ease',
          }}
        >
          <CloudyVisualizer
            renderMode="interactive"
            tuningProfile="cleo"
            audioLevels={audioLevels}
            mode={mode}
            overrides={{
              corePaletteA: [0.8, 0.8, 0.8],
              corePaletteB: [1.12, 0.25, 0.45],
              corePaletteC: [1, 0.4, 0.4],
              corePaletteD: [0.11, 0.11, 0.46],
              haloPaletteA: [1, 1, 1.02],
              haloPaletteB: [0.5, 0.4, 0.5],
              haloPaletteC: [0.8, 1, 0.6],
              haloPaletteD: [1.4, 2, 1],
              bgPaletteA: [0, 0, 0.4],
              bgPaletteB: [0.35, 0.3, 0.35],
              bgPaletteC: [0.8, 0.6, 1],
              bgPaletteD: [1, 0.21, 1],
              saturationBase: 1.25,
              saturationBassScale: 1.5,
              hueShiftSpeed: 0.125,
              toneMapFactor: 0.33,
              blobRadius: 1.5,
              softness: 1,
              centerGlowIntensity: 2,
              haloStrength: 3.5,
              warpSpeed1: 0.3,
              warpSpeed2: 0.5,
              warpSpeed3: 0.3,
              warpAmp1: 0.04,
              warpAmp2: 0.05,
              warpAmp3: 0.02,
              breathingSpeed: 0.23,
              breathingAmp: 0.075,
              bgRotationSpeed: 0.15,
              bassWarpInfluence: 0,
              midWarpInfluence: 0.5,
              trebleWarpInfluence: 0,
              audioRadiusScale: 1.5,
              trebleShimmerIntensity: 0,
              pointerInfluence: 0.51,
            }}
          />
          <NoiseOverlay />
        </div>

        {/* Black background layer */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background: '#000',
            opacity: captionsOn ? 1 : 0,
            transition: 'opacity 0.3s ease',
            pointerEvents: 'none',
          }}
        />

        {/* Error banner */}
        {errorMessage && (
          <div
            style={{
              position: 'absolute',
              top: 16,
              left: '50%',
              transform: 'translateX(-50%)',
              zIndex: 40,
              maxWidth: '90%',
              borderRadius: 12,
              border: '1px solid rgba(255,100,100,0.3)',
              background: 'rgba(255,50,50,0.15)',
              padding: '8px 16px',
              backdropFilter: 'blur(12px)',
            }}
          >
            <p style={{ color: '#fca5a5', fontSize: 11, letterSpacing: '0.05em', margin: 0 }}>
              {errorMessage}
            </p>
          </div>
        )}

        {/* Captions — centered in content area */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            pointerEvents: 'none',
            padding: '0 2rem',
            zIndex: 20,
          }}
        >
          <div style={{ textAlign: 'center', maxWidth: 600 }}>
            {captionsOn && caption ? (
              <>
                {captionSource === 'user' && (
                  <span
                    style={{
                      fontSize: 10,
                      letterSpacing: '0.3em',
                      textTransform: 'uppercase',
                      display: 'block',
                      marginBottom: 12,
                      color: 'rgba(255,255,255,0.4)',
                    }}
                  >
                    YOU
                  </span>
                )}
                <div
                  style={{
                    fontSize: '1.1rem',
                    lineHeight: 1.6,
                    letterSpacing: '0.08em',
                    fontWeight: 400,
                    color: captionSource === 'user' ? 'rgba(255,255,255,0.4)' : '#ffffff',
                  }}
                >
                  <AnimatedWords key={caption} text={caption} />
                </div>
              </>
            ) : null}
          </div>
        </div>

      </div>

      {/* ── Floating mic button ─────────────────────────── */}
      <div
        style={{
          position: 'fixed',
          bottom: 40,
          left: '50%',
          transform: 'translateX(-50%)',
          zIndex: 1000,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 10,
          WebkitUserSelect: 'none',
          userSelect: 'none',
          WebkitTouchCallout: 'none',
        }}
      >
        <button
          style={{
            width: 64,
            height: 64,
            borderRadius: '50%',
            background: isMutedWhileConnected ? '#E53935' : 'rgba(0,0,0,0.8)',
            border: isMutedWhileConnected
              ? '1px solid rgba(255,255,255,0.35)'
              : '1px solid rgba(255,255,255,0.5)',
            backdropFilter: 'blur(12px)',
            WebkitBackdropFilter: 'blur(12px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            touchAction: 'none',
            userSelect: 'none',
            WebkitUserSelect: 'none',
            WebkitTouchCallout: 'none',
            color: '#fff',
            transform: 'scale(1)',
            transition: 'background 0.15s ease, border-color 0.15s ease',
          }}
          onContextMenu={(e) => e.preventDefault()}
          onClick={() => {
            void handleMicButtonTap();
          }}
        >
          {isDisconnected ? (
            <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
              <polygon points="8,5 20,12 8,19" />
            </svg>
          ) : (
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
              <g
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <rect x="9" y="1" width="6" height="13" rx="3" />
                <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                <line x1="12" y1="19" x2="12" y2="23" />
                <line x1="8" y1="23" x2="16" y2="23" />
              </g>
              {isMutedWhileConnected && (
                <line x1="4" y1="4" x2="20" y2="20" stroke="white" strokeWidth="2" />
              )}
            </svg>
          )}
        </button>
        {/* Tiny status label */}
        <span
          style={{
            fontSize: 10,
            letterSpacing: '0.15em',
            textTransform: 'uppercase',
            color: '#000000',
            fontFamily: "'JetBrains Mono', monospace",
            opacity: micStatusLabel ? 1 : 0,
            transition: 'opacity 0.3s ease',
            pointerEvents: 'none',
            whiteSpace: 'nowrap',
            display: 'flex',
            alignItems: 'center',
            gap: 6,
          }}
        >
          {isThinking && (
            <span style={{ display: 'inline-flex', gap: 3 }}>
              <span className="cleo-think-dot" style={{ animationDelay: '0s' }} />
              <span className="cleo-think-dot" style={{ animationDelay: '0.2s' }} />
              <span className="cleo-think-dot" style={{ animationDelay: '0.4s' }} />
            </span>
          )}
          {micStatusLabel ?? '\u00a0'}
        </span>
      </div>

      {/* ── Keyframe animations ─────────────────────────── */}
      <style>{`
        @keyframes cleoThinkPulse {
          0%, 80%, 100% { opacity: 0.2; transform: scale(0.8); }
          40% { opacity: 1; transform: scale(1); }
        }
        .cleo-think-dot {
          width: 4px;
          height: 4px;
          border-radius: 50%;
          background: #000;
          display: inline-block;
          animation: cleoThinkPulse 1.4s ease-in-out infinite;
        }
      `}</style>
    </div>
  );
}
