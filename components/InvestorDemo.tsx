"use client";

import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";

const INK = "#0B0B0C";
const PAPER = "#F2F2F2";
const MUTED = "#B8B8B8";
const FALLBACK_READING =
  "restless in the way that precedes discovery — curious enough to sit with questions others rush past. there is a magnetism here that doesn't perform, it simply arrives.";

const vibeWords = [
  "Ambitious",
  "Contrarian",
  "Creative",
  "Cultivated",
  "Curious",
  "Flamboyant",
  "Grounded",
  "Hedonistic",
  "Irreverent",
  "Magnetic",
  "Mischievous",
  "Mystic",
  "Nurturing",
  "Philosophical",
  "Relentless",
  "Restless",
  "Shy",
];

const attendees = [
  { initials: "ET", name: "Elena T.", color: "#F525A3" },
  { initials: "MJ", name: "Marcus J.", color: "#08F22F" },
  { initials: "AS", name: "Aiko S.", color: "#9750CD" },
  { initials: "NW", name: "Noa W.", color: "#1D90BF" },
  { initials: "LH", name: "Leila H.", color: "#FE4247" },
];

const introNotes = [
  { name: "elena", text: "you both chose 'restless.' she's a sculptor who works in sound." },
  { name: "marcus", text: "complementary energy. he grounds what you set in motion." },
  { name: "aiko", text: "shared curiosity. she's been asking the same questions you have." },
  { name: "noa", text: "magnetic meets philosophical. this one could go deep." },
  { name: "leila", text: "creative tension. the kind that makes interesting things happen." },
];

const shellStyle: CSSProperties = {
  minHeight: "100dvh",
  width: "100%",
  background: INK,
  color: PAPER,
  display: "flex",
  justifyContent: "center",
  fontFamily: "'Inter', sans-serif",
};

const phoneStyle: CSSProperties = {
  width: "100%",
  maxWidth: 430,
  minHeight: "100dvh",
  padding: "40px 24px 24px",
  overflowY: "auto",
  display: "flex",
  flexDirection: "column",
};

const labelStyle: CSSProperties = {
  fontFamily: "'Inter', sans-serif",
  fontSize: 11,
  lineHeight: 1,
  letterSpacing: "0.28em",
  textTransform: "uppercase",
  color: MUTED,
};

const buttonStyle = (enabled = true): CSSProperties => ({
  width: "100%",
  height: 48,
  border: 0,
  borderRadius: 0,
  background: enabled ? PAPER : "rgba(242,242,242,0.16)",
  color: enabled ? INK : "rgba(242,242,242,0.35)",
  fontFamily: "'Inter', sans-serif",
  fontSize: 11,
  fontWeight: 500,
  letterSpacing: "0.28em",
  textTransform: "uppercase",
  cursor: enabled ? "pointer" : "default",
  transition: "background 240ms ease, color 240ms ease, opacity 240ms ease",
});

const starStyle: CSSProperties = {
  fontFamily: "'Cormorant Garamond', serif",
  fontSize: 28,
  lineHeight: 1,
  color: "rgba(242,242,242,0.3)",
  textAlign: "center",
};

const revealStyle = (index: number, exiting: boolean): CSSProperties => ({
  opacity: exiting ? 0 : 1,
  transform: exiting ? "translateY(0)" : "translateY(0)",
  animation: exiting ? undefined : `investor-enter 400ms cubic-bezier(0.16, 1, 0.3, 1) ${index * 100}ms both`,
  transition: "opacity 300ms ease",
});

function NetworkGraph() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const context = canvas.getContext("2d");
    if (!context) return;

    let frame = 0;
    const start = performance.now();
    const size = 300;
    const ratio = window.devicePixelRatio || 1;

    canvas.width = size * ratio;
    canvas.height = size * ratio;
    canvas.style.width = `${size}px`;
    canvas.style.height = `${size}px`;
    context.scale(ratio, ratio);

    const nodes = [
      { initials: "YOU", name: "You", color: PAPER, x: 151, y: 145, r: 25 },
      { ...attendees[0], x: 79, y: 78, r: 21 },
      { ...attendees[1], x: 220, y: 70, r: 21 },
      { ...attendees[2], x: 244, y: 190, r: 21 },
      { ...attendees[3], x: 70, y: 204, r: 21 },
      { ...attendees[4], x: 148, y: 247, r: 21 },
    ];

    const connections = [
      [0, 1],
      [0, 2],
      [0, 3],
      [0, 4],
      [0, 5],
      [1, 2],
      [3, 5],
    ] as const;

    const draw = (now: number) => {
      const elapsed = now - start;
      const t = elapsed / 1000;
      context.clearRect(0, 0, size, size);

      const drifted = nodes.map((node, index) => ({
        ...node,
        x: node.x + Math.sin(t * 0.9 + index * 1.7) * 0.5,
        y: node.y + Math.cos(t * 0.8 + index * 1.1) * 0.4,
      }));

      connections.forEach(([from, to], index) => {
        const progress = Math.max(0, Math.min(1, (elapsed - index * 300) / 600));
        if (progress <= 0) return;
        const a = drifted[from];
        const b = drifted[to];
        const pulse = 0.05 + (Math.sin(t * 1.8 + index) * 0.5 + 0.5) * 0.07;
        context.strokeStyle = `rgba(242,242,242,${Math.min(0.16, pulse) * progress})`;
        context.lineWidth = 1;
        context.beginPath();
        context.moveTo(a.x, a.y);
        context.lineTo(a.x + (b.x - a.x) * progress, a.y + (b.y - a.y) * progress);
        context.stroke();
      });

      drifted.forEach((node, index) => {
        const recentConnection = connections.some(
          ([from, to], connectionIndex) =>
            (from === index || to === index) &&
            elapsed > connectionIndex * 300 &&
            elapsed < connectionIndex * 300 + 450,
        );
        const glow = index === 0 ? 0.28 + Math.sin(t * 2) * 0.05 : recentConnection ? 0.22 : 0.1;

        context.shadowColor = node.color;
        context.shadowBlur = index === 0 ? 22 : recentConnection ? 14 : 5;
        context.fillStyle = node.color;
        context.globalAlpha = glow;
        context.beginPath();
        context.arc(node.x, node.y, node.r + 5, 0, Math.PI * 2);
        context.fill();

        context.shadowBlur = 0;
        context.globalAlpha = 1;
        context.fillStyle = INK;
        context.beginPath();
        context.arc(node.x, node.y, node.r, 0, Math.PI * 2);
        context.fill();

        context.strokeStyle = index === 0 ? "rgba(242,242,242,0.82)" : node.color;
        context.lineWidth = index === 0 ? 1.4 : 1;
        context.beginPath();
        context.arc(node.x, node.y, node.r, 0, Math.PI * 2);
        context.stroke();

        context.fillStyle = index === 0 ? PAPER : "rgba(242,242,242,0.82)";
        context.font = "500 10px Inter, sans-serif";
        context.textAlign = "center";
        context.textBaseline = "middle";
        context.fillText(node.initials, node.x, node.y);

        context.fillStyle = "rgba(242,242,242,0.52)";
        context.font = "400 10px Inter, sans-serif";
        context.fillText(node.name, node.x, node.y + node.r + 17);
      });

      frame = window.requestAnimationFrame(draw);
    };

    frame = window.requestAnimationFrame(draw);
    return () => window.cancelAnimationFrame(frame);
  }, []);

  return <canvas ref={canvasRef} aria-label="Network graph of your dinner table" />;
}

export function InvestorDemo() {
  const transitionTimerRef = useRef<number | null>(null);
  const [screen, setScreen] = useState(1);
  const [exiting, setExiting] = useState(false);
  const [selectedWords, setSelectedWords] = useState<string[]>(["Curious", "Magnetic", "Restless"]);
  const [reading, setReading] = useState(FALLBACK_READING);
  const [readingVisible, setReadingVisible] = useState(false);
  const [readingButtonVisible, setReadingButtonVisible] = useState(false);
  const [visibleNotes, setVisibleNotes] = useState(0);
  const [imageFailed, setImageFailed] = useState(false);

  const goToScreen = useCallback((nextScreen: number) => {
    if (transitionTimerRef.current !== null) {
      window.clearTimeout(transitionTimerRef.current);
    }
    setExiting(true);
    transitionTimerRef.current = window.setTimeout(() => {
      setScreen(nextScreen);
      setExiting(false);
      transitionTimerRef.current = null;
    }, 300);
  }, []);

  useEffect(() => {
    return () => {
      if (transitionTimerRef.current !== null) {
        window.clearTimeout(transitionTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (screen !== 3) return;

    const controller = new AbortController();
    let cancelled = false;
    let readingButtonTimer: number | null = null;
    setReadingVisible(false);
    setReadingButtonVisible(false);
    setReading(FALLBACK_READING);

    let minimumLoadingTimer: number | null = null;
    const minimumLoading = new Promise<void>((resolve) => {
      minimumLoadingTimer = window.setTimeout(resolve, 2000);
    });

    const fetchTimeout = window.setTimeout(() => controller.abort(), 1800);

    const requestReading = fetch("/api/reading", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ vibeWords: selectedWords }),
      signal: controller.signal,
    })
      .then((response) => (response.ok ? response.json() : null))
      .then((data: { reading?: unknown } | null) =>
        typeof data?.reading === "string" && data.reading.trim().length > 0
          ? data.reading.toLowerCase()
          : FALLBACK_READING,
      )
      .catch(() => FALLBACK_READING);

    void Promise.all([minimumLoading, requestReading]).then(([, nextReading]) => {
      if (cancelled) return;
      window.clearTimeout(fetchTimeout);
      setReading(nextReading);
      setReadingVisible(true);
      readingButtonTimer = window.setTimeout(() => {
        if (!cancelled) setReadingButtonVisible(true);
      }, 1500);
    });

    return () => {
      cancelled = true;
      if (minimumLoadingTimer !== null) {
        window.clearTimeout(minimumLoadingTimer);
      }
      window.clearTimeout(fetchTimeout);
      if (readingButtonTimer !== null) {
        window.clearTimeout(readingButtonTimer);
      }
      controller.abort();
    };
  }, [screen, selectedWords]);

  useEffect(() => {
    if (screen !== 4) return;
    setVisibleNotes(0);
    const timers = introNotes.map((_, index) =>
      window.setTimeout(() => setVisibleNotes(index + 1), 650 + index * 800),
    );
    return () => timers.forEach((timer) => window.clearTimeout(timer));
  }, [screen]);

  const toggleWord = (word: string) => {
    setSelectedWords((current) => {
      if (current.includes(word)) return current.filter((item) => item !== word);
      if (current.length >= 3) return current;
      return [...current, word];
    });
  };

  const top = (
    <div style={{ ...revealStyle(0, exiting), minHeight: 12 }}>
      <div style={labelStyle}>
        {screen === 1 && "UPCOMING EVENT"}
        {screen === 2 && "BEFORE THE EVENT"}
        {screen === 3 && "CLÉO'S READING"}
        {screen === 4 && "YOUR TABLE"}
      </div>
    </div>
  );

  return (
    <main style={shellStyle}>
      <div style={phoneStyle}>
        {screen === 1 && (
          <>
            {top}
            <section
              style={{
                ...revealStyle(1, exiting),
                flex: 1,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                gap: 18,
                textAlign: "center",
                padding: "26px 0",
              }}
            >
              <div
                style={{
                  width: "100%",
                  aspectRatio: "1.18 / 1",
                  background:
                    "radial-gradient(circle at 50% 35%, rgba(242,242,242,0.18), rgba(11,11,12,0.88) 56%), linear-gradient(135deg, rgba(245,37,163,0.2), rgba(8,242,47,0.08), rgba(151,80,205,0.22))",
                  overflow: "hidden",
                }}
              >
                {!imageFailed && (
                  <img
                    src="/events/1.jpg"
                    alt="The Long Table supper club"
                    onError={() => setImageFailed(true)}
                    style={{
                      width: "100%",
                      height: "100%",
                      objectFit: "cover",
                      opacity: 0.72,
                      filter: "grayscale(1) contrast(1.08)",
                    }}
                  />
                )}
              </div>
              <h1
                style={{
                  fontFamily: "'Cormorant Garamond', serif",
                  fontSize: 34,
                  lineHeight: 1,
                  fontWeight: 300,
                  color: PAPER,
                }}
              >
                The Long Table
              </h1>
              <p
                style={{
                  fontFamily: "'Cormorant Garamond', serif",
                  fontSize: 21,
                  lineHeight: 1.15,
                  fontStyle: "italic",
                  color: "rgba(242,242,242,0.7)",
                }}
              >
                An intimate supper club
              </p>
              <div style={labelStyle}>Jun 7 · 8 PM · Tribeca</div>
              <p
                style={{
                  maxWidth: 360,
                  fontFamily: "'Inter', sans-serif",
                  fontSize: 14,
                  lineHeight: 1.65,
                  color: "rgba(242,242,242,0.6)",
                }}
              >
                A 12-seat chef&apos;s table experience in a candlelit Tribeca loft. Five courses,
                natural wine pairings, and conversation with strangers who won&apos;t stay that way.
              </p>
              <div style={starStyle}>∗</div>
              <div style={labelStyle}>3 spots remaining</div>
            </section>
            <div style={revealStyle(7, exiting)}>
              <button style={buttonStyle()} onClick={() => goToScreen(2)}>
                CONFIRM
              </button>
            </div>
          </>
        )}

        {screen === 2 && (
          <>
            {top}
            <section
              style={{
                flex: 1,
                display: "flex",
                flexDirection: "column",
                justifyContent: "center",
                gap: 24,
                padding: "28px 0",
              }}
            >
              <div style={revealStyle(1, exiting)}>
                <div style={starStyle}>∗</div>
              </div>
              <h1
                style={{
                  ...revealStyle(2, exiting),
                  fontFamily: "'Cormorant Garamond', serif",
                  fontSize: 28,
                  lineHeight: 1.15,
                  fontWeight: 300,
                  fontStyle: "italic",
                  textAlign: "center",
                  color: "rgba(242,242,242,0.8)",
                }}
              >
                How would you describe your energy?
              </h1>
              <div
                style={{
                  ...revealStyle(3, exiting),
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: 10,
                }}
              >
                {vibeWords.map((word) => {
                  const selected = selectedWords.includes(word);
                  return (
                    <button
                      key={word}
                      onClick={() => toggleWord(word)}
                      style={{
                        minHeight: 40,
                        padding: "10px 12px",
                        border: "1px solid rgba(242,242,242,0.2)",
                        borderRadius: 999,
                        background: selected ? PAPER : "transparent",
                        color: selected ? INK : "rgba(242,242,242,0.6)",
                        fontFamily: "'Inter', sans-serif",
                        fontSize: 11,
                        letterSpacing: "0.18em",
                        textTransform: "uppercase",
                        cursor: "pointer",
                        transition: "background 180ms ease, color 180ms ease",
                      }}
                    >
                      {word}
                    </button>
                  );
                })}
              </div>
              <div style={{ ...revealStyle(4, exiting), ...labelStyle, textAlign: "center" }}>
                {selectedWords.length} / 3
              </div>
            </section>
            <div style={revealStyle(5, exiting)}>
              <button
                disabled={selectedWords.length === 0}
                style={buttonStyle(selectedWords.length > 0)}
                onClick={() => selectedWords.length > 0 && goToScreen(3)}
              >
                CONTINUE
              </button>
            </div>
          </>
        )}

        {screen === 3 && (
          <>
            {top}
            <section
              style={{
                flex: 1,
                display: "flex",
                flexDirection: "column",
                justifyContent: "center",
                alignItems: "center",
                gap: 24,
                textAlign: "center",
                padding: "34px 0",
              }}
            >
              {!readingVisible && (
                <div style={{ ...revealStyle(1, exiting), display: "flex", gap: 8 }}>
                  {[0, 1, 2].map((dot) => (
                    <span
                      key={dot}
                      style={{
                        width: 6,
                        height: 6,
                        borderRadius: 999,
                        background: "rgba(242,242,242,0.42)",
                        animation: `investor-dot 900ms ease-in-out ${dot * 140}ms infinite`,
                      }}
                    />
                  ))}
                </div>
              )}
              {readingVisible && (
                <>
                  <div style={revealStyle(1, exiting)}>
                    <div style={starStyle}>∗</div>
                  </div>
                  <p
                    style={{
                      ...revealStyle(2, exiting),
                      maxWidth: 360,
                      fontFamily: "'Cormorant Garamond', serif",
                      fontSize: 24,
                      lineHeight: 1.35,
                      fontWeight: 300,
                      fontStyle: "italic",
                      color: "rgba(242,242,242,0.7)",
                    }}
                  >
                    {reading}
                  </p>
                  <div style={{ ...revealStyle(3, exiting), ...labelStyle }}>— cléo xóchil</div>
                </>
              )}
            </section>
            <div
              style={{
                opacity: readingButtonVisible && !exiting ? 1 : 0,
                transition: "opacity 400ms ease",
                pointerEvents: readingButtonVisible ? "auto" : "none",
              }}
            >
              <button style={buttonStyle(readingButtonVisible)} onClick={() => goToScreen(4)}>
                CONTINUE
              </button>
            </div>
          </>
        )}

        {screen === 4 && (
          <>
            {top}
            <section
              style={{
                flex: 1,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 18,
                padding: "26px 0",
              }}
            >
              <p
                style={{
                  ...revealStyle(1, exiting),
                  fontFamily: "'Cormorant Garamond', serif",
                  fontSize: 21,
                  lineHeight: 1.2,
                  fontWeight: 300,
                  fontStyle: "italic",
                  color: "rgba(242,242,242,0.5)",
                  textAlign: "center",
                }}
              >
                cléo thinks you should meet —
              </p>
              <div style={{ ...revealStyle(2, exiting), width: 300, height: 300 }}>
                <NetworkGraph />
              </div>
              <div style={{ width: "100%", display: "flex", flexDirection: "column", gap: 10 }}>
                {introNotes.map((note, index) => (
                  <p
                    key={note.name}
                    style={{
                      opacity: visibleNotes > index && !exiting ? 1 : 0,
                      transform:
                        visibleNotes > index && !exiting ? "translateY(0)" : "translateY(12px)",
                      transition: "opacity 500ms ease, transform 500ms ease",
                      fontFamily: "'Cormorant Garamond', serif",
                      fontSize: 16,
                      lineHeight: 1.35,
                      fontWeight: 300,
                      fontStyle: "italic",
                      color: "rgba(242,242,242,0.5)",
                    }}
                  >
                    <span style={{ color: "rgba(242,242,242,0.8)" }}>{note.name}</span> —{" "}
                    {note.text}
                  </p>
                ))}
              </div>
            </section>
            <div style={revealStyle(8, exiting)}>
              <button style={buttonStyle()} onClick={() => goToScreen(1)}>
                ENTER CX
              </button>
            </div>
          </>
        )}
        <style>{`
          @keyframes investor-enter {
            0% { opacity: 0; transform: translateY(20px); }
            100% { opacity: 1; transform: translateY(0); }
          }

          @keyframes investor-dot {
            0%, 100% { opacity: 0.25; transform: translateY(0); }
            50% { opacity: 0.9; transform: translateY(-4px); }
          }
        `}</style>
      </div>
    </main>
  );
}
