"use client";

import { useState, useRef, useEffect } from "react";

const API = "http://localhost:8000";

// ── Types ──────────────────────────────────────────────────────────────────

type AppState = "idle" | "listening" | "map" | "researching" | "verdict";
type Finding = "illegal" | "legal" | "unclear";
type MilestoneState = "passed" | "urgent" | "future";

interface ExtractedFacts {
  city?: string;
  building_type?: string;
  issue_type?: string;
  increase_amount?: string;
  tenancy_length?: string;
}

interface Source {
  name: string;
  url: string;
  snippet: string;
}

interface LawApplied {
  name: string;
  tag: string;
  role: "floor" | "controlling";
  description: string;
}

interface VerdictData {
  finding: Finding;
  explanation: string;
  controlling_law: string;
  legal_cap?: string;
  laws_applied?: LawApplied[];
  sources: Source[];
}

interface Milestone {
  day: number;
  label: string;
  state: MilestoneState;
}

interface TimelineData {
  milestones: Milestone[];
  action_window_days: number;
  action_window_text: string;
}


// ── Hooks ──────────────────────────────────────────────────────────────────

function useTypewriter(text: string, speed = 20) {
  const [displayed, setDisplayed] = useState("");
  useEffect(() => {
    setDisplayed("");
    if (!text) return;
    let i = 0;
    const timer = setInterval(() => {
      i++;
      setDisplayed(text.slice(0, i));
      if (i >= text.length) clearInterval(timer);
    }, speed);
    return () => clearInterval(timer);
  }, [text]);
  return displayed;
}

// ── Map data ────────────────────────────────────────────────────────────────

const MAP_REGIONS = [
  {
    id: "Unincorporated",
    points: "0,0 380,0 380,520 0,520",
    fill: "#161622",
    stroke: "none",
  },
  {
    id: "Berkeley",
    points: "28,26 174,24 180,138 26,133",
    fill: "#5b9cf6",
    labelX: 102, labelY: 84,
    pinX: 102,  pinY: 70,
  },
  {
    id: "Oakland",
    points: "22,133 184,138 200,294 16,284",
    fill: "#3ecf8e",
    labelX: 108, labelY: 210,
    pinX: 108,  pinY: 196,
  },
  {
    id: "Alameda",
    points: "112,252 230,248 234,294 110,298",
    fill: "#a855f7",
    labelX: 172, labelY: 270,
    pinX: 172,  pinY: 256,
  },
  {
    id: "San Leandro",
    points: "12,284 202,294 214,358 8,348",
    fill: "#f59e0b",
    labelX: 112, labelY: 324,
    pinX: 112,  pinY: 310,
  },
  {
    id: "Hayward",
    points: "6,348 216,358 228,438 4,428",
    fill: "#e8573a",
    labelX: 114, labelY: 396,
    pinX: 114,  pinY: 382,
  },
  {
    id: "Fremont",
    points: "2,428 230,438 240,520 0,520",
    fill: "#6b7280",
    labelX: 120, labelY: 476,
    pinX: 120,  pinY: 462,
  },
];

const CITY_CARDS = [
  { city: "Oakland",  law: "RSO — 3% cap + just cause eviction",        color: "#3ecf8e" },
  { city: "Hayward",  law: "RSO — ~3.5% CPI cap, Rent Review Board",    color: "#e8573a" },
  { city: "Fremont",  law: "AB 1482 only — up to 10% cap, no local RSO", color: "#6b7280" },
];

const SOURCE_ICONS = ["⚖️", "🏛️", "📋"];

// ── Persistent: Wordmark ───────────────────────────────────────────────────

function Wordmark() {
  return (
    <div
      style={{
        position: "fixed", top: 20, left: 24, zIndex: 50,
        display: "flex", alignItems: "center", gap: 10,
      }}
    >
      <div
        style={{
          width: 28, height: 28, borderRadius: "50%",
          background: "var(--accent)",
          display: "flex", alignItems: "center", justifyContent: "center",
        }}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round">
          <path d="M12 2a3 3 0 0 1 3 3v7a3 3 0 0 1-6 0V5a3 3 0 0 1 3-3z" />
          <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
          <line x1="12" y1="19" x2="12" y2="22" />
        </svg>
      </div>
      <span style={{ fontFamily: "var(--font-playfair)", fontSize: 18, fontWeight: 600, color: "var(--text)" }}>
        HomeRule
      </span>
      <div
        style={{
          display: "flex", alignItems: "center", gap: 5,
          background: "var(--green-dim)", border: "1px solid rgba(62,207,142,0.2)",
          borderRadius: 999, padding: "2px 9px",
        }}
      >
        <span
          className="blink-dot"
          style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--green)", display: "block" }}
        />
        <span
          style={{
            fontFamily: "var(--font-mono)", fontSize: 10,
            textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--green)",
          }}
        >
          Live Sources
        </span>
      </div>
    </div>
  );
}


// ── State 1: Idle ──────────────────────────────────────────────────────────

function IdleState({ onStart }: { onStart: () => void }) {
  const [hovered, setHovered] = useState(false);
  return (
    <div
      style={{
        display: "flex", flexDirection: "column", alignItems: "center",
        justifyContent: "center", minHeight: "100vh", gap: 28,
      }}
    >
      <div
        style={{
          position: "relative", width: 210, height: 210,
          display: "flex", alignItems: "center", justifyContent: "center",
        }}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
      >
        {[192, 138, 96].map((size, i) => (
          <div
            key={size}
            style={{
              position: "absolute",
              width: size, height: size, borderRadius: "50%",
              border: "1px solid var(--border2)",
              transform: hovered ? `scale(${1 + (3 - i) * 0.04})` : "scale(1)",
              transition: `transform 0.3s ease ${i * 0.05}s`,
            }}
          />
        ))}
        <button
          onClick={onStart}
          style={{
            width: 68, height: 68, borderRadius: "50%",
            background: hovered ? "var(--accent)" : "var(--surface2)",
            border: "none", cursor: "pointer",
            display: "flex", alignItems: "center", justifyContent: "center",
            transition: "background 0.2s ease",
            position: "relative", zIndex: 2,
          }}
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none"
            stroke={hovered ? "white" : "var(--muted)"} strokeWidth="2" strokeLinecap="round">
            <path d="M12 2a3 3 0 0 1 3 3v7a3 3 0 0 1-6 0V5a3 3 0 0 1 3-3z" />
            <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
            <line x1="12" y1="19" x2="12" y2="22" />
          </svg>
        </button>
      </div>
      <div style={{ textAlign: "center" }}>
        <p style={{ fontFamily: "var(--font-playfair)", fontSize: 30, color: "var(--text)", margin: "0 0 10px" }}>
          Tell me what's happening.
        </p>
        <p
          style={{
            fontFamily: "var(--font-mono)", fontSize: 11,
            textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--muted)", margin: 0,
          }}
        >
          East Bay Tenant Rights · Voice First
        </p>
      </div>
    </div>
  );
}

// ── State 2: Listening ─────────────────────────────────────────────────────

function ListeningState({
  question, facts, recording, loadingState, onToggleRecord, onTextSubmit,
}: {
  question: string;
  facts: ExtractedFacts;
  recording: boolean;
  loadingState: "idle" | "transcribing" | "thinking";
  onToggleRecord: () => void;
  onTextSubmit: (t: string) => void;
}) {
  const typed = useTypewriter(question, 20);
  const [text, setText] = useState("");
  const busy = loadingState !== "idle";
  const factChips = Object.entries(facts).filter(([, v]) => v);

  return (
    <div
      style={{
        display: "flex", flexDirection: "column", alignItems: "center",
        justifyContent: "center", minHeight: "100vh", gap: 32, padding: "0 24px",
      }}
    >
      {/* Orb with pulse rings */}
      <div
        style={{
          position: "relative", width: 160, height: 160,
          display: "flex", alignItems: "center", justifyContent: "center",
        }}
      >
        <div
          className="pulse-ring"
          style={{
            position: "absolute", width: 148, height: 148, borderRadius: "50%",
            border: "1px solid var(--accent)", animationDelay: "0s",
          }}
        />
        <div
          className="pulse-ring"
          style={{
            position: "absolute", width: 148, height: 148, borderRadius: "50%",
            border: "1px solid var(--accent)", animationDelay: "1s",
          }}
        />
        <button
          onClick={onToggleRecord}
          disabled={busy}
          style={{
            width: 68, height: 68, borderRadius: "50%",
            background: recording ? "var(--accent)" : busy ? "var(--surface2)" : "var(--surface2)",
            border: `2px solid ${recording ? "var(--accent)" : "var(--border2)"}`,
            cursor: busy ? "not-allowed" : "pointer",
            display: "flex", alignItems: "center", justifyContent: "center",
            opacity: busy && !recording ? 0.5 : 1,
            transition: "all 0.2s",
            position: "relative", zIndex: 2,
          }}
        >
          {recording ? (
            <div style={{ display: "flex", alignItems: "center", gap: 3 }}>
              {[0, 1, 2, 3, 4].map((i) => (
                <div key={i} className="waveform-bar" style={{ width: 3, height: 18, borderRadius: 2, background: "white", transformOrigin: "center", animationDelay: `${i * 0.12}s` }} />
              ))}
            </div>
          ) : (
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--muted)" strokeWidth="2" strokeLinecap="round">
              <path d="M12 2a3 3 0 0 1 3 3v7a3 3 0 0 1-6 0V5a3 3 0 0 1 3-3z" />
              <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
              <line x1="12" y1="19" x2="12" y2="22" />
            </svg>
          )}
        </button>
      </div>

      {/* Orb label */}
      <p style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: recording ? "var(--accent)" : "var(--muted)", margin: 0, letterSpacing: "0.04em" }}>
        {recording ? "Tap to stop" : busy ? "" : "Tap to speak"}
      </p>

      {/* Question / loading state */}
      <div style={{ textAlign: "center", maxWidth: 520, minHeight: 80 }}>
        {loadingState === "transcribing" && (
          <p style={{ fontFamily: "var(--font-mono)", fontSize: 14, color: "var(--muted)", margin: 0 }}>
            Transcribing…
          </p>
        )}
        {loadingState === "thinking" && (
          <p style={{ fontFamily: "var(--font-mono)", fontSize: 14, color: "var(--muted)", margin: 0 }}>
            Thinking…
          </p>
        )}
        {loadingState === "idle" && (
          <>
            <p style={{ fontFamily: "var(--font-mono)", fontSize: 11, textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--muted)", marginBottom: 12 }}>
              HomeRule is asking
            </p>
            <p style={{ fontFamily: "var(--font-playfair)", fontSize: 26, color: "var(--text)", lineHeight: 1.4, margin: 0 }}>
              {typed || "\u00A0"}
              <span className="cursor-blink" style={{ color: "var(--accent)", marginLeft: 1 }}>|</span>
            </p>
          </>
        )}
      </div>

      {/* Text input */}
      <div style={{ display: "flex", gap: 8, width: "100%", maxWidth: 480 }}>
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && text.trim()) { onTextSubmit(text.trim()); setText(""); }
          }}
          disabled={busy || recording}
          placeholder="Or type here…"
          style={{
            flex: 1, background: "var(--surface2)", border: "1px solid var(--border)",
            borderRadius: 12, padding: "10px 16px",
            color: "var(--text)", fontFamily: "var(--font-sans)", fontSize: 14,
            outline: "none",
          }}
        />
        <button
          onClick={() => { if (text.trim()) { onTextSubmit(text.trim()); setText(""); } }}
          disabled={busy || !text.trim()}
          style={{
            background: "var(--surface2)", border: "1px solid var(--border)",
            borderRadius: 12, padding: "10px 16px",
            color: "var(--text)", fontFamily: "var(--font-mono)", fontSize: 12,
            cursor: "pointer", opacity: busy || !text.trim() ? 0.4 : 1,
          }}
        >
          Send
        </button>
      </div>

      {/* Fact chips */}
      {factChips.length > 0 && (
        <div
          style={{
            position: "fixed", bottom: 64, left: 0, right: 0,
            display: "flex", flexWrap: "wrap", gap: 8,
            justifyContent: "center", padding: "0 24px",
          }}
        >
          {factChips.map(([key, value], i) => (
            <div
              key={key}
              className="chip-appear"
              style={{
                display: "flex", alignItems: "center", gap: 6,
                background: "var(--surface)", border: "1px solid var(--border)",
                borderRadius: 999, padding: "4px 12px",
                animationDelay: `${i * 0.1}s`,
              }}
            >
              <span style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--accent)", display: "block" }} />
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text)" }}>
                {String(value)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── State 3: Map ───────────────────────────────────────────────────────────

function MapState({ city }: { city: string }) {
  const [visible, setVisible] = useState(false);
  useEffect(() => { setTimeout(() => setVisible(true), 80); }, []);

  const userRegion = MAP_REGIONS.find((r) => r.id === city);

  return (
    <div
      style={{
        display: "flex", alignItems: "center", justifyContent: "center",
        minHeight: "100vh", padding: "80px 40px",
        gap: 56,
      }}
    >
      {/* SVG Map */}
      <div style={{ flexShrink: 0 }}>
        <svg viewBox="0 0 380 520" width={320} height={440}>
          {MAP_REGIONS.map((region, i) => (
            <g key={region.id}>
              <polygon
                points={region.points}
                fill={region.fill}
                fillOpacity={
                  visible
                    ? region.id === "Unincorporated"
                      ? 1
                      : region.id === city
                      ? 0.92
                      : 0.52
                    : 0
                }
                stroke={region.id === "Unincorporated" ? "none" : "#0c0c10"}
                strokeWidth={1.5}
                style={{
                  transition: `fill-opacity 0.45s ease ${i * 0.08}s`,
                  filter: region.id === city ? `drop-shadow(0 0 10px ${region.fill}99)` : "none",
                }}
              />
              {region.id !== "Unincorporated" && region.labelX && (
                <text
                  x={region.labelX} y={region.labelY}
                  textAnchor="middle"
                  fill={region.id === city ? "white" : "rgba(255,255,255,0.55)"}
                  fontSize={9}
                  fontFamily="IBM Plex Mono, monospace"
                  fontWeight={region.id === city ? "600" : "400"}
                  style={{ userSelect: "none", pointerEvents: "none" }}
                >
                  {region.id}
                </text>
              )}
            </g>
          ))}

          {/* YOU pin */}
          {userRegion && userRegion.pinX && visible && (
            <g>
              <circle
                className="pin-pulse"
                cx={userRegion.pinX} cy={userRegion.pinY}
                r={14} fill="none" stroke="white" strokeWidth={1.2}
              />
              <circle cx={userRegion.pinX} cy={userRegion.pinY} r={5} fill="white" />
              <text
                x={userRegion.pinX} y={userRegion.pinY - 14}
                textAnchor="middle" fill="white" fontSize={8}
                fontFamily="IBM Plex Mono, monospace" fontWeight="600"
                letterSpacing="0.06em"
                style={{ userSelect: "none" }}
              >
                YOU
              </text>
            </g>
          )}
        </svg>
      </div>

      {/* Callout panel */}
      <div style={{ flex: 1, maxWidth: 380, display: "flex", flexDirection: "column", gap: 20 }}>
        <div>
          <p style={{ fontFamily: "var(--font-playfair)", fontSize: 28, color: "var(--text)", margin: "0 0 10px", lineHeight: 1.3 }}>
            Where you live<br />
            <span style={{ color: "var(--accent)" }}>{city || "your city"}</span> changes everything.
          </p>
          <p style={{ fontFamily: "var(--font-sans)", fontSize: 14, color: "var(--muted)", margin: 0, lineHeight: 1.6 }}>
            State law sets a floor. Local ordinances stack on top — and they vary dramatically by city.
          </p>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {CITY_CARDS.map((card) => {
            const isUser = card.city === city;
            return (
              <div
                key={card.city}
                style={{
                  background: isUser ? "var(--accent-dim)" : "var(--surface)",
                  border: `1px solid ${isUser ? "rgba(232,87,58,0.4)" : "var(--border)"}`,
                  borderRadius: 10, padding: "10px 14px",
                  display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12,
                }}
              >
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 4 }}>
                    <span style={{ width: 8, height: 8, borderRadius: "50%", background: card.color, display: "block", flexShrink: 0 }} />
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--text)", fontWeight: 500 }}>
                      {card.city}
                    </span>
                  </div>
                  <p style={{ fontFamily: "var(--font-sans)", fontSize: 12, color: "var(--muted)", margin: "0 0 0 15px" }}>
                    {card.law}
                  </p>
                </div>
                {isUser && (
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--accent)", whiteSpace: "nowrap", flexShrink: 0 }}>
                    ← You are here
                  </span>
                )}
              </div>
            );
          })}
        </div>

        <div
          style={{
            background: "var(--yellow-dim)", border: "1px solid rgba(245,197,24,0.2)",
            borderRadius: 10, padding: "10px 14px",
          }}
        >
          <p style={{ fontFamily: "var(--font-sans)", fontSize: 12, color: "var(--yellow)", margin: 0, lineHeight: 1.6 }}>
            A general AI gives you California state law. HomeRule knows your city's rules — retrieved live.
          </p>
        </div>
      </div>
    </div>
  );
}

// ── State 4: Researching ───────────────────────────────────────────────────

function SourceCard({ source, icon, appearDelay, retrieveDelay, startTime }: {
  source: Source;
  icon: string;
  appearDelay: number;
  retrieveDelay: number;
  startTime: number;
}) {
  const [visible, setVisible] = useState(false);
  const [retrieved, setRetrieved] = useState(false);

  useEffect(() => {
    const elapsed = Date.now() - startTime;
    const t1 = setTimeout(() => setVisible(true),   Math.max(0, appearDelay   - elapsed));
    const t2 = setTimeout(() => setRetrieved(true), Math.max(0, retrieveDelay - elapsed));
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, []);

  return (
    <div
      style={{
        background: "var(--surface)", border: "1px solid var(--border)",
        borderRadius: 12, padding: 16,
        opacity: visible ? 1 : 0,
        transform: visible ? "translateY(0)" : "translateY(8px)",
        transition: "opacity 0.4s, transform 0.4s",
        position: "relative", overflow: "hidden",
      }}
    >
      {retrieved && (
        <div
          className="scan-line"
          style={{
            position: "absolute", left: 0, right: 0, height: 2,
            background: "linear-gradient(90deg, transparent, var(--green), transparent)",
          }}
        />
      )}
      <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
        <div
          style={{
            width: 36, height: 36, borderRadius: 8, background: "var(--surface2)",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 18, flexShrink: 0,
          }}
        >
          {icon}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--text)", fontWeight: 500 }}>
              {source.name}
            </span>
            <div style={{ display: "flex", alignItems: "center", gap: 5, flexShrink: 0 }}>
              <span
                style={{
                  width: 6, height: 6, borderRadius: "50%", display: "block",
                  background: retrieved ? "var(--green)" : "var(--yellow)",
                  transition: "background 0.3s",
                }}
              />
              <span
                style={{
                  fontFamily: "var(--font-mono)", fontSize: 10,
                  color: retrieved ? "var(--green)" : "var(--yellow)",
                  transition: "color 0.3s",
                }}
              >
                {retrieved ? "Retrieved" : "Searching..."}
              </span>
            </div>
          </div>
          <p style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--muted)", margin: "3px 0 8px" }}>
            {source.url}
          </p>
          <div style={{ maxHeight: retrieved ? 80 : 0, overflow: "hidden", transition: "max-height 0.4s ease" }}>
            <p style={{ fontFamily: "var(--font-sans)", fontSize: 12, color: "var(--muted)", margin: "0 0 8px", lineHeight: 1.5 }}>
              {source.snippet}
            </p>
          </div>
          {retrieved && (
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span className="blink-dot" style={{ width: 5, height: 5, borderRadius: "50%", background: "var(--green)", display: "block" }} />
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--green)" }}>
                Retrieved just now · Not from training data
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ResearchingState({ city, sources }: { city: string; sources: Source[] }) {
  const startTime = useRef(Date.now());
  const delays = [
    { appear: 200,  retrieve: 200  },
    { appear: 800,  retrieve: 1800 },
    { appear: 1400, retrieve: 2600 },
  ];
  return (
    <div
      style={{
        display: "flex", flexDirection: "column", alignItems: "center",
        justifyContent: "center", minHeight: "100vh", padding: "80px 24px",
      }}
    >
      <div style={{ width: "100%", maxWidth: 580 }}>
        <p
          style={{
            fontFamily: "var(--font-mono)", fontSize: 11, textTransform: "uppercase",
            letterSpacing: "0.1em", color: "var(--muted)", marginBottom: 8,
          }}
        >
          Live lookup
        </p>
        <h2 style={{ fontFamily: "var(--font-playfair)", fontSize: 28, color: "var(--text)", margin: "0 0 32px" }}>
          Pulling {city || "your city"}'s current rules.
        </h2>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {sources.map((source, i) => (
            <SourceCard
              key={source.url}
              source={source}
              icon={SOURCE_ICONS[i] ?? "📄"}
              appearDelay={delays[i]?.appear ?? 200 + i * 600}
              retrieveDelay={delays[i]?.retrieve ?? 400 + i * 800}
              startTime={startTime.current}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

// ── State 5: Verdict ───────────────────────────────────────────────────────

function Timeline({ data }: { data: TimelineData }) {
  const [animated, setAnimated] = useState(false);
  useEffect(() => { setTimeout(() => setAnimated(true), 120); }, []);

  const maxDay = data.milestones[data.milestones.length - 1].day;
  const urgentMilestone = data.milestones.find((m) => m.state === "urgent");
  const fillPct = urgentMilestone ? (urgentMilestone.day / maxDay) * 100 : 30;

  return (
    <div style={{ position: "relative", padding: "52px 0 44px" }}>
      <div style={{ position: "relative", height: 3, background: "var(--border2)", borderRadius: 2 }}>
        {/* Fill */}
        <div
          style={{
            position: "absolute", left: 0, top: 0, bottom: 0,
            width: animated ? `${fillPct}%` : "0%",
            background: "linear-gradient(90deg, var(--green), var(--accent))",
            borderRadius: 2,
            transition: "width 1.2s cubic-bezier(0.4,0,0.2,1)",
          }}
        />

        {/* Milestone dots */}
        {data.milestones.map((m) => {
          const pct = (m.day / maxDay) * 100;
          const color =
            m.state === "passed" ? "var(--green)" :
            m.state === "urgent" ? "var(--accent)" :
            "var(--border2)";
          return (
            <div key={m.day} style={{ position: "absolute", left: `${pct}%`, transform: "translateX(-50%)" }}>
              <div style={{ width: 10, height: 10, borderRadius: "50%", background: color, marginTop: -3.5 }} />
              <div
                style={{
                  position: "absolute", top: -26, left: "50%", transform: "translateX(-50%)",
                  whiteSpace: "nowrap", fontFamily: "var(--font-mono)", fontSize: 9,
                  color: m.state === "passed" ? "var(--green)" : m.state === "urgent" ? "var(--accent)" : "var(--muted)",
                }}
              >
                {m.day === 0 ? "Today" : `Day ${m.day}`}
              </div>
              <div
                style={{
                  position: "absolute", top: 16, left: "50%", transform: "translateX(-50%)",
                  whiteSpace: "nowrap", fontFamily: "var(--font-mono)", fontSize: 9,
                  color: m.state === "passed" ? "var(--green)" : m.state === "urgent" ? "var(--accent)" : "var(--muted)",
                }}
              >
                {m.label}
              </div>
            </div>
          );
        })}

        {/* YOU ARE HERE marker */}
        <div
          style={{
            position: "absolute",
            left: animated ? `${fillPct}%` : "0%",
            transform: "translateX(-50%)",
            transition: "left 1.2s cubic-bezier(0.4,0,0.2,1)",
            top: -5,
          }}
        >
          <div style={{ position: "relative", width: 14, height: 14 }}>
            <div
              className="pin-pulse"
              style={{
                position: "absolute", inset: 0, borderRadius: "50%",
                border: "1px solid var(--accent)",
              }}
            />
            <div style={{ width: 14, height: 14, borderRadius: "50%", background: "var(--accent)" }} />
          </div>
          <div
            style={{
              position: "absolute", bottom: "100%", left: "50%",
              transform: "translateX(-50%)", marginBottom: 6,
              whiteSpace: "nowrap", fontFamily: "var(--font-mono)", fontSize: 8,
              color: "var(--accent)", letterSpacing: "0.08em",
            }}
          >
            YOU ARE HERE
          </div>
        </div>
      </div>
    </div>
  );
}

function CaseFile({ facts, verdict }: { facts: ExtractedFacts; verdict: VerdictData }) {
  return (
    <div
      style={{
        background: "var(--surface)", borderLeft: "1px solid var(--border)",
        height: "100%", display: "flex", flexDirection: "column",
      }}
    >
      <div style={{ padding: "20px 20px 16px", borderBottom: "1px solid var(--border)" }}>
        <p
          style={{
            fontFamily: "var(--font-mono)", fontSize: 10, textTransform: "uppercase",
            letterSpacing: "0.1em", color: "var(--muted)", margin: "0 0 4px",
          }}
        >
          Case File
        </p>
        <p style={{ fontFamily: "var(--font-playfair)", fontSize: 16, color: "var(--text)", margin: 0 }}>
          Rent Increase Dispute
        </p>
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: 20, display: "flex", flexDirection: "column", gap: 20 }}>
        {/* Situation */}
        <div>
          <p
            style={{
              fontFamily: "var(--font-mono)", fontSize: 10, textTransform: "uppercase",
              letterSpacing: "0.1em", color: "var(--muted)", margin: "0 0 10px",
            }}
          >
            Situation
          </p>
          {[
            ["City",       facts.city                || "—"],
            ["Building",   facts.building_type       || "—"],
            ["Tenancy",    facts.tenancy_length       || "—"],
            ["Increase",   facts.increase_amount      || "—"],
            ["Legal cap",  verdict.legal_cap          || "—"],
          ].map(([k, v]) => (
            <div
              key={k}
              style={{
                display: "flex", justifyContent: "space-between",
                padding: "7px 0", borderBottom: "1px dashed var(--border)",
              }}
            >
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--muted)" }}>{k}</span>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text)" }}>{v}</span>
            </div>
          ))}
        </div>

        {/* Law Applied */}
        <div>
          <p
            style={{
              fontFamily: "var(--font-mono)", fontSize: 10, textTransform: "uppercase",
              letterSpacing: "0.1em", color: "var(--muted)", margin: "0 0 10px",
            }}
          >
            Law Applied
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {(verdict.laws_applied || []).map((law: { tag: string; role: string; description: string }) => {
              const isControlling = law.role === "controlling";
              return (
                <div key={law.tag} style={{ background: "var(--surface2)", borderRadius: 8, padding: "10px 12px" }}>
                  <div style={{ marginBottom: 4 }}>
                    <span
                      style={{
                        fontFamily: "var(--font-mono)", fontSize: 9,
                        color: isControlling ? "var(--accent)" : "var(--blue)",
                        background: isControlling ? "var(--accent-dim)" : "rgba(91,156,246,0.1)",
                        border: `1px solid ${isControlling ? "rgba(232,87,58,0.2)" : "rgba(91,156,246,0.2)"}`,
                        borderRadius: 4, padding: "1px 6px",
                      }}
                    >
                      {law.tag}
                    </span>
                  </div>
                  <p style={{ fontFamily: "var(--font-sans)", fontSize: 11, color: "var(--muted)", margin: 0 }}>
                    {law.description}
                  </p>
                </div>
              );
            })}
          </div>
        </div>

        {/* Sources */}
        <div>
          <p
            style={{
              fontFamily: "var(--font-mono)", fontSize: 10, textTransform: "uppercase",
              letterSpacing: "0.1em", color: "var(--muted)", margin: "0 0 10px",
            }}
          >
            Sources
          </p>
          <div
            style={{
              background: "var(--green-dim)", border: "1px solid rgba(62,207,142,0.15)",
              borderRadius: 8, padding: "10px 12px",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 10 }}>
              <span className="blink-dot" style={{ width: 5, height: 5, borderRadius: "50%", background: "var(--green)", display: "block" }} />
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--green)" }}>
                Live Lookup · Perplexity
              </span>
            </div>
            {verdict.sources.map((s) => (
              <div key={s.url} style={{ padding: "6px 0", borderBottom: "1px solid rgba(62,207,142,0.1)" }}>
                <p style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text)", margin: "0 0 2px" }}>
                  {s.name}
                </p>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--muted)" }}>{s.url}</span>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--green)" }}>just now</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function VerdictState({
  verdict, timeline, facts, onGenerateLetter,
}: {
  verdict: VerdictData;
  timeline: TimelineData;
  facts: ExtractedFacts;
  onGenerateLetter: () => void;
}) {
  const findingColor =
    verdict.finding === "illegal" ? "var(--accent)" :
    verdict.finding === "legal"   ? "var(--green)"  : "var(--yellow)";
  const findingLabel =
    verdict.finding === "illegal" ? "Illegal." :
    verdict.finding === "legal"   ? "Legal."   : "Unclear.";

  return (
    <div style={{ display: "flex", minHeight: "100vh", paddingTop: 68 }}>
      {/* Left panel */}
      <div
        style={{
          flex: 1, padding: "40px 40px 40px 48px",
          display: "flex", flexDirection: "column", gap: 24, overflowY: "auto",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span
            style={{
              fontFamily: "var(--font-mono)", fontSize: 11, textTransform: "uppercase",
              letterSpacing: "0.1em", color: "var(--muted)",
            }}
          >
            Finding issued
          </span>
          <div style={{ flex: 1, height: 1, background: "var(--accent)" }} />
        </div>

        <div>
          <h1
            style={{
              fontFamily: "var(--font-playfair)", fontSize: 72, fontWeight: 700,
              color: findingColor, margin: 0, lineHeight: 1,
            }}
          >
            {findingLabel}
          </h1>
          <p style={{ fontFamily: "var(--font-sans)", fontSize: 16, color: "var(--text)", margin: "16px 0 0", lineHeight: 1.6 }}>
            {verdict.explanation}
          </p>
          <p style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--muted)", margin: "8px 0 0" }}>
            {verdict.controlling_law}
          </p>
        </div>

        <Timeline data={timeline} />

        <div
          style={{
            background: "var(--yellow-dim)", border: "1px solid rgba(245,197,24,0.2)",
            borderRadius: 12, padding: "14px 16px",
            display: "flex", alignItems: "flex-start", gap: 12,
          }}
        >
          <span style={{ fontSize: 18, flexShrink: 0 }}>⏱</span>
          <div>
            <p style={{ fontFamily: "var(--font-sans)", fontSize: 14, color: "var(--yellow)", margin: 0, fontWeight: 600 }}>
              Your action window: {timeline.action_window_days} days.
            </p>
            <p style={{ fontFamily: "var(--font-sans)", fontSize: 13, color: "var(--muted)", margin: "4px 0 0" }}>
              {timeline.action_window_text}
            </p>
          </div>
        </div>

        <CTAButton onClick={onGenerateLetter}>Generate my letter →</CTAButton>
      </div>

      {/* Right: Case File */}
      <div style={{ width: 300, flexShrink: 0 }}>
        <CaseFile facts={facts} verdict={verdict} />
      </div>
    </div>
  );
}

function CTAButton({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  const [hovered, setHovered] = useState(false);
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        alignSelf: "flex-start",
        background: hovered ? "var(--accent)" : "var(--surface2)",
        border: `1px solid ${hovered ? "var(--accent)" : "var(--border)"}`,
        borderRadius: 12, padding: "12px 24px",
        fontFamily: "var(--font-mono)", fontSize: 13, color: "white",
        cursor: "pointer",
        transform: hovered ? "translateY(-1px)" : "translateY(0)",
        transition: "all 0.18s",
      }}
    >
      {children}
    </button>
  );
}

// ── Letter Modal ───────────────────────────────────────────────────────────

function LetterModal({ onClose, sessionId }: { onClose: () => void; sessionId: string | null }) {
  const [letter, setLetter] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!sessionId) return;
    fetch(`${API}/session/${sessionId}/artifact`, { method: "POST" })
      .then((r) => r.json())
      .then((d) => setLetter(d.artifact_text))
      .catch(() => setLetter("Failed to generate letter. Please try again."));
  }, [sessionId]);

  function copy() {
    if (!letter) return;
    navigator.clipboard.writeText(letter);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, zIndex: 100,
        background: "rgba(0,0,0,0.75)", backdropFilter: "blur(4px)",
        display: "flex", alignItems: "center", justifyContent: "center", padding: 24,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="modal-in"
        style={{
          width: "100%", maxWidth: 580, maxHeight: "80vh",
          background: "var(--surface)", border: "1px solid var(--border)",
          borderRadius: 16, display: "flex", flexDirection: "column", overflow: "hidden",
        }}
      >
        <div
          style={{
            padding: "16px 20px", borderBottom: "1px solid var(--border)",
            display: "flex", alignItems: "flex-start", justifyContent: "space-between",
          }}
        >
          <div>
            <p
              style={{
                fontFamily: "var(--font-mono)", fontSize: 10, textTransform: "uppercase",
                letterSpacing: "0.1em", color: "var(--accent)", margin: "0 0 4px",
              }}
            >
              Draft Letter · Hayward RSO §4-17.050
            </p>
            <p style={{ fontFamily: "var(--font-playfair)", fontSize: 18, color: "var(--text)", margin: 0 }}>
              Dispute Letter — Unlawful Rent Increase
            </p>
          </div>
          <button
            onClick={onClose}
            style={{
              background: "none", border: "none", cursor: "pointer",
              color: "var(--muted)", fontSize: 22, lineHeight: 1, padding: 4, flexShrink: 0,
            }}
          >
            ×
          </button>
        </div>

        <div style={{ flex: 1, overflowY: "auto", padding: 24 }}>
          {!letter ? (
            <p style={{ fontFamily: "var(--font-mono)", fontSize: 13, color: "var(--muted)", textAlign: "center", marginTop: 40 }}>
              Generating your letter…
            </p>
          ) : (
            <pre style={{ fontFamily: "var(--font-sans)", fontSize: 14, lineHeight: 1.9, color: "var(--text)", whiteSpace: "pre-wrap", margin: 0 }}>
              {letter}
            </pre>
          )}
        </div>

        <div
          style={{
            padding: "14px 20px", borderTop: "1px solid var(--border)",
            display: "flex", gap: 10, justifyContent: "flex-end",
          }}
        >
          <button
            onClick={onClose}
            style={{
              background: "none", border: "1px solid var(--border)", borderRadius: 8,
              padding: "8px 16px", fontFamily: "var(--font-mono)", fontSize: 12,
              color: "var(--muted)", cursor: "pointer",
            }}
          >
            Close
          </button>
          <button
            onClick={copy}
            disabled={!letter}
            style={{
              background: copied ? "var(--green)" : "var(--accent)",
              border: "none", borderRadius: 8, padding: "8px 16px",
              fontFamily: "var(--font-mono)", fontSize: 12,
              color: "white", cursor: !letter ? "not-allowed" : "pointer",
              transition: "background 0.2s", opacity: !letter ? 0.4 : 1,
            }}
          >
            {copied ? "Copied!" : "Copy Letter"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main ───────────────────────────────────────────────────────────────────

export default function Home() {
  const [appState, setAppState] = useState<AppState>("idle");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [question, setQuestion] = useState("");
  const [facts, setFacts] = useState<ExtractedFacts>({});
  const [verdict, setVerdict] = useState<VerdictData | null>(null);
  const [timeline, setTimeline] = useState<TimelineData | null>(null);
  const [recording, setRecording] = useState(false);
  const [loadingState, setLoadingState] = useState<"idle" | "transcribing" | "thinking">("idle");
  const [showModal, setShowModal] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);


  async function speak(text: string) {
    try {
      const res = await fetch(`${API}/tts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      const blob = await res.blob();
      new Audio(URL.createObjectURL(blob)).play();
    } catch { /* silent */ }
  }

  async function handleStart() {
    try {
      const res = await fetch(`${API}/session`, { method: "POST" });
      const data = await res.json();
      setSessionId(data.session_id);
    } catch { /* demo mode */ }
    const q = "Tell me what's going on with your housing situation.";
    setQuestion(q);
    setAppState("listening");
    await speak(q);
  }

  async function submitTranscript(transcript: string) {
    if (!sessionId) return;
    setLoadingState("thinking");
    try {
      const res = await fetch(`${API}/session/${sessionId}/message`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transcript }),
      });
      const data = await res.json();
      setLoadingState("idle");

      if (data.facts) setFacts((prev) => ({ ...prev, ...data.facts }));

      if (data.status === "NEED_FACTS") {
        setQuestion(data.question || "");
        await speak(data.question || "");
      } else if (data.status === "VERDICT") {
        if (data.facts)   setFacts(data.facts);
        if (data.verdict) setVerdict(data.verdict);
        if (data.timeline) setTimeline(data.timeline);
        setAppState("map");
        setTimeout(() => setAppState("researching"), 2000);
        setTimeout(() => setAppState("verdict"), 6400);
      }
    } catch {
      setLoadingState("idle");
    }
  }

  async function startRecording() {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const recorder = new MediaRecorder(stream);
    chunksRef.current = [];
    recorder.ondataavailable = (e) => chunksRef.current.push(e.data);
    recorder.onstop = async () => {
      stream.getTracks().forEach((t) => t.stop());
      const blob = new Blob(chunksRef.current, { type: "audio/webm" });
      setLoadingState("transcribing");
      const form = new FormData();
      form.append("audio", blob, "audio.webm");
      try {
        const res = await fetch(`${API}/transcribe`, { method: "POST", body: form });
        const data = await res.json();
        setLoadingState("idle");
        if (data.transcript) await submitTranscript(data.transcript);
      } catch { setLoadingState("idle"); }
    };
    mediaRecorderRef.current = recorder;
    recorder.start();
    setRecording(true);
  }

  function stopRecording() {
    mediaRecorderRef.current?.stop();
    setRecording(false);
  }

  function toggleRecording() {
    if (recording) stopRecording();
    else startRecording();
  }

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg)", color: "var(--text)" }}>
      <Wordmark />

      {appState === "idle" && <IdleState onStart={handleStart} />}

      {appState === "listening" && (
        <ListeningState
          question={question}
          facts={facts}
          recording={recording}
          loadingState={loadingState}
          onToggleRecord={toggleRecording}
          onTextSubmit={submitTranscript}
        />
      )}

      {appState === "map" && <MapState city={facts.city || "Hayward"} />}

      {appState === "researching" && (
        <ResearchingState city={facts.city || ""} sources={verdict?.sources ?? []} />
      )}

      {appState === "verdict" && verdict && timeline && (
        <VerdictState
          verdict={verdict}
          timeline={timeline}
          facts={facts}
          onGenerateLetter={() => setShowModal(true)}
        />
      )}

      {showModal && <LetterModal onClose={() => setShowModal(false)} sessionId={sessionId} />}
    </div>
  );
}
