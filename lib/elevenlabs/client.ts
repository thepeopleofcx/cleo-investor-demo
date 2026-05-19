"use client";

import { Conversation } from "@elevenlabs/client";
import {
  AudioLevelSmoother,
  createAnalyserFromStream,
  scalarVolumeToLevels,
  type AudioLevels,
  type StreamAnalyser,
  ZERO_AUDIO_LEVELS
} from "@/lib/audio/analyser";

export type VoiceConnectionStatus = "disconnected" | "connecting" | "connected" | "error";
export type VoiceAgentMode = "unknown" | "listening" | "speaking";

type SessionConnectionType = "webrtc" | "websocket";

export type TranscriptMessage = {
  source: "ai" | "user";
  message: string;
};

type ElevenLabsClientOptions = {
  agentId?: string;
  privateAgent?: boolean;
  preferConnectionType?: SessionConnectionType;
  allowWebSocketFallback?: boolean;
  onStatusChange?: (status: VoiceConnectionStatus) => void;
  onModeChange?: (mode: VoiceAgentMode) => void;
  onAudioLevels?: (levels: AudioLevels) => void;
  onError?: (message: string) => void;
  onTranscript?: (msg: TranscriptMessage) => void;
  overrides?: {
    agent?: {
      prompt?: { prompt?: string };
      firstMessage?: string;
    };
  };
};

type ConversationCredentialResponse = {
  credential: string;
  connectionType: SessionConnectionType;
};

type ConversationLike = {
  endSession?: () => Promise<void>;
  setMicMuted?: (muted: boolean) => Promise<void>;
  getOutputVolume?: () => Promise<number>;
};

type ConversationSdk = {
  startSession: (options: Record<string, unknown>) => Promise<ConversationLike>;
};

const CONNECT_TIMEOUT_MS = 12000;

const isVoiceMode = (mode: unknown): mode is VoiceAgentMode =>
  mode === "listening" || mode === "speaking" || mode === "unknown";

const toVoiceStatus = (status: unknown): VoiceConnectionStatus => {
  if (status === "connected" || status === "connecting" || status === "disconnected") {
    return status;
  }

  return "error";
};

const toErrorMessage = (error: unknown, fallback: string) => {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  return fallback;
};

export class ElevenLabsVoiceClient {
  private readonly options: ElevenLabsClientOptions;

  private conversation: ConversationLike | null = null;
  private analyser: StreamAnalyser | null = null;
  private levelLoopHandle: number | null = null;
  private volumePollTimer: number | null = null;
  private smoother = new AudioLevelSmoother(0.5, 0.12, ZERO_AUDIO_LEVELS);
  private targetLevels: AudioLevels = { ...ZERO_AUDIO_LEVELS };

  constructor(options: ElevenLabsClientOptions) {
    this.options = options;
  }

  private emitStatus(status: VoiceConnectionStatus) {
    this.options.onStatusChange?.(status);
  }

  private emitMode(mode: VoiceAgentMode) {
    this.options.onModeChange?.(mode);
  }

  private emitError(message: string) {
    this.options.onError?.(message);
  }

  private emitLevels(levels: AudioLevels) {
    this.options.onAudioLevels?.(levels);
  }

  private get preferredConnectionType(): SessionConnectionType {
    return this.options.preferConnectionType ?? "webrtc";
  }

  private get shouldUseWebSocketFallback(): boolean {
    return this.options.allowWebSocketFallback ?? false;
  }

  private get isPrivateAgent(): boolean {
    return this.options.privateAgent ?? false;
  }

  private get resolvedPublicAgentId() {
    return this.options.agentId || process.env.NEXT_PUBLIC_ELEVENLABS_AGENT_ID || "";
  }

  private getConnectionAttemptOrder(): SessionConnectionType[] {
    if (this.preferredConnectionType === "webrtc" && this.shouldUseWebSocketFallback) {
      return ["webrtc", "websocket"];
    }

    return [this.preferredConnectionType];
  }

  private async fetchCredential(connectionType: SessionConnectionType): Promise<ConversationCredentialResponse> {
    const response = await fetch("/api/elevenlabs/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        connectionType,
        agentId: this.options.agentId || ""
      })
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(text || "Unable to mint ElevenLabs conversation credential.");
    }

    return (await response.json()) as ConversationCredentialResponse;
  }

  private stopLevelLoop() {
    if (this.levelLoopHandle !== null) {
      cancelAnimationFrame(this.levelLoopHandle);
      this.levelLoopHandle = null;
    }

    if (this.volumePollTimer !== null) {
      window.clearInterval(this.volumePollTimer);
      this.volumePollTimer = null;
    }
  }

  private async resetConversationState() {
    try {
      this.conversation?.setMicMuted?.(true);
      await this.conversation?.endSession?.();
    } catch {
      // Ignore cleanup failures during retry/dispose paths.
    } finally {
      this.conversation = null;
    }

    this.stopLevelLoop();
    this.analyser?.dispose();
    this.analyser = null;
    this.targetLevels = ZERO_AUDIO_LEVELS;
  }

  private async startSessionAttempt(connectionType: SessionConnectionType, suppressPreConnectErrors: boolean) {
    const sdk = Conversation as unknown as ConversationSdk;

    let connected = false;
    let activatePipeline = () => {
      // Replaced after callbacks are created.
    };

    let resolveConnectedPromise: () => void;
    let rejectConnectedPromise: (error: Error) => void;

    const connectedPromise = new Promise<void>((resolve, reject) => {
      resolveConnectedPromise = resolve;
      rejectConnectedPromise = reject;
    });

    const timeoutId = window.setTimeout(() => {
      if (!connected) {
        rejectConnectedPromise(new Error(`Timed out while connecting via ${connectionType}.`));
      }
    }, CONNECT_TIMEOUT_MS);

    const markConnected = () => {
      if (connected) {
        return;
      }

      connected = true;
      window.clearTimeout(timeoutId);
      resolveConnectedPromise();
    };

    const markPreConnectFailure = (reason: string) => {
      if (connected) {
        return;
      }

      window.clearTimeout(timeoutId);
      rejectConnectedPromise(new Error(reason));
    };

    let pipelineActivated = false;

    activatePipeline = () => {
      if (pipelineActivated || !this.conversation) {
        return;
      }

      pipelineActivated = true;
      this.emitStatus("connected");
      this.emitMode("listening");
      void this.tryAttachOutboundAnalyser();
      this.startLevelLoop();
    };

    const startSessionArgs: Record<string, unknown> = {
      connectionType,
      onConnect: () => {
        markConnected();
        activatePipeline();
      },
      onDisconnect: (details: unknown) => {
        console.error('[EL] onDisconnect details:', JSON.stringify(details));
        this.emitStatus("disconnected");
        this.emitMode("unknown");
        markPreConnectFailure(`Disconnected before connection completed via ${connectionType}.`);
      },
      onStatusChange: (evt: unknown) => {
        const status = typeof evt === "object" && evt !== null && "status" in evt
          ? (evt as { status: unknown }).status
          : evt;
        this.emitStatus(toVoiceStatus(status));
      },
      onModeChange: (evt: unknown) => {
        const mode = typeof evt === "object" && evt !== null && "mode" in evt
          ? (evt as { mode: unknown }).mode
          : evt;
        this.emitMode(isVoiceMode(mode) ? mode : "unknown");
      },
      onError: (message: string, context?: unknown) => {
        const contextMessage = context ? ` (${JSON.stringify(context)})` : "";
        const combinedMessage = `${message}${contextMessage}`;

        if (connected || !suppressPreConnectErrors) {
          this.emitStatus("error");
          this.emitError(combinedMessage);
        }

        markPreConnectFailure(`Failed to connect via ${connectionType}: ${combinedMessage}`);
      },
      onMessage: (msg: { source?: string; message?: string }) => {
        if (msg?.message && (msg.source === "ai" || msg.source === "user")) {
          this.options.onTranscript?.({
            source: msg.source,
            message: msg.message,
          });
        }
      }
    };

    if (this.isPrivateAgent) {
      console.log("[EL] fetching credential for", connectionType);
      const credential = await this.fetchCredential(connectionType);
      console.log("[EL] got credential, type:", credential.connectionType, "len:", credential.credential?.length);
      if (credential.connectionType === "webrtc") {
        startSessionArgs.conversationToken = credential.credential;
      } else {
        startSessionArgs.signedUrl = credential.credential;
      }
    } else {
      const publicAgentId = this.resolvedPublicAgentId;
      console.log("[EL] public agent id:", publicAgentId);
      if (!publicAgentId) {
        throw new Error("Missing public agent id. Set NEXT_PUBLIC_ELEVENLABS_AGENT_ID.");
      }
      startSessionArgs.agentId = publicAgentId;
    }

    // Pass overrides to ElevenLabs SDK if provided
    if (this.options.overrides) {
      startSessionArgs.overrides = this.options.overrides;
    }

    try {
      console.log("[EL] calling sdk.startSession...");
      this.conversation = await sdk.startSession(startSessionArgs);
      console.log("[EL] startSession returned, conversation:", !!this.conversation);
      this.conversation.setMicMuted?.(true);

      if (connected) {
        activatePipeline();
      }

      await connectedPromise;
    } catch (error) {
      await this.resetConversationState();
      throw new Error(toErrorMessage(error, `Failed to connect using ${connectionType}.`));
    } finally {
      window.clearTimeout(timeoutId);
    }
  }

  async ensureSession() {
    if (this.conversation) {
      console.log("[EL] session already exists");
      return;
    }

    this.emitStatus("connecting");
    console.log("[EL] ensureSession — requesting mic");

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((track) => track.stop());
      console.log("[EL] mic granted");
    } catch (error) {
      console.error("[EL] mic denied", error);
      this.emitStatus("error");
      this.emitError(error instanceof Error ? error.message : "Microphone permission denied.");
      throw error;
    }

    const attempts = this.getConnectionAttemptOrder();
    console.log("[EL] connection attempts:", attempts, "private:", this.isPrivateAgent);
    let lastError: Error | null = null;

    for (let index = 0; index < attempts.length; index += 1) {
      const connectionType = attempts[index];
      const hasFallbackRemaining = index < attempts.length - 1;

      try {
        await this.startSessionAttempt(connectionType, hasFallbackRemaining);
        return;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error("Failed to connect to ElevenLabs.");

        if (hasFallbackRemaining) {
          this.emitStatus("connecting");
          this.emitMode("unknown");
          this.emitError("WebRTC connection failed. Retrying with WebSocket...");
          continue;
        }
      }
    }

    const message = lastError?.message ?? "Failed to connect to ElevenLabs.";
    this.emitStatus("error");
    this.emitError(message);
    throw new Error(message);
  }

  async beginPushToTalk() {
    await this.ensureSession();
    this.conversation?.setMicMuted?.(false);
    this.emitMode("listening");
  }

  async endPushToTalk() {
    this.conversation?.setMicMuted?.(true);
  }

  private startLevelLoop() {
    this.stopLevelLoop();

    const loop = () => {
      const sourceLevels = this.analyser ? this.analyser.getLevels() : this.targetLevels;
      const smoothed = this.smoother.update(sourceLevels);
      this.emitLevels(smoothed);
      this.levelLoopHandle = requestAnimationFrame(loop);
    };

    loop();

    this.startOutputVolumeFallbackPolling();
  }

  private startOutputVolumeFallbackPolling() {
    if (this.volumePollTimer !== null) {
      window.clearInterval(this.volumePollTimer);
    }

    this.volumePollTimer = window.setInterval(async () => {
      if (this.analyser) {
        return;
      }

      try {
        // If remote audio stream introspection is unavailable in the SDK runtime,
        // fall back to ElevenLabs output volume so visuals still react to speech.
        const volume = await this.conversation?.getOutputVolume?.();
        if (typeof volume === "number" && Number.isFinite(volume)) {
          this.targetLevels = scalarVolumeToLevels(volume);
        }
      } catch {
        this.targetLevels = ZERO_AUDIO_LEVELS;
      }
    }, 90);
  }

  private async tryAttachOutboundAnalyser() {
    if (!this.conversation) {
      return;
    }

    // Preferred path: route Cleo outbound audio stream into Web Audio AnalyserNode.
    const stream = this.findOutboundMediaStream(this.conversation);
    if (!stream) {
      return;
    }

    try {
      this.analyser?.dispose();
      this.analyser = createAnalyserFromStream(stream, {
        fftSize: 2048,
        smoothingTimeConstant: 0.65
      });
    } catch {
      this.analyser = null;
    }
  }

  private findOutboundMediaStream(root: unknown): MediaStream | null {
    const visited = new Set<unknown>();
    const queue: Array<{ node: unknown; depth: number }> = [{ node: root, depth: 0 }];

    while (queue.length > 0) {
      const current = queue.shift();
      if (!current) {
        continue;
      }

      const { node, depth } = current;
      if (!node || visited.has(node) || depth > 5) {
        continue;
      }

      visited.add(node);

      if (node instanceof MediaStream) {
        if (node.getAudioTracks().length > 0) {
          return node;
        }
      }

      if (typeof HTMLAudioElement !== "undefined" && node instanceof HTMLAudioElement) {
        const srcObject = node.srcObject;
        if (srcObject instanceof MediaStream && srcObject.getAudioTracks().length > 0) {
          return srcObject;
        }
      }

      if (typeof RTCPeerConnection !== "undefined" && node instanceof RTCPeerConnection) {
        // WebRTC sessions usually expose a live audio receiver track here.
        const track = node
          .getReceivers()
          .map((receiver) => receiver.track)
          .find((candidate) => Boolean(candidate && candidate.kind === "audio" && candidate.readyState === "live"));

        if (track) {
          return new MediaStream([track]);
        }
      }

      if (typeof node === "object") {
        const entries = [] as unknown[];

        if (Array.isArray(node)) {
          entries.push(...node);
        } else {
          try {
            entries.push(...Object.values(node as Record<string, unknown>));
          } catch {
            // Some SDK objects expose getters that can throw. Ignore and continue.
          }
        }

        for (const value of entries) {
          if (value && !visited.has(value)) {
            queue.push({ node: value, depth: depth + 1 });
          }
        }
      }
    }

    return null;
  }

  async dispose() {
    this.stopLevelLoop();

    this.analyser?.dispose();
    this.analyser = null;

    try {
      this.conversation?.setMicMuted?.(true);
      await this.conversation?.endSession?.();
    } finally {
      this.conversation = null;
      this.emitStatus("disconnected");
      this.emitMode("unknown");
      this.emitLevels(ZERO_AUDIO_LEVELS);
    }
  }
}
