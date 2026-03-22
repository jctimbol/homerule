"use client";

import { useState, useRef, useEffect } from "react";
import "maplibre-gl/dist/maplibre-gl.css";

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

const CITY_COLORS: Record<string, string> = {
  Berkeley:      "#5b9cf6",
  Oakland:       "#3ecf8e",
  Alameda:       "#a855f7",
  "San Leandro": "#f59e0b",
  Hayward:       "#e8573a",
  Fremont:       "#6b7280",
  Emeryville:    "#4b5563",
};

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

// MapLibre color expression — each city gets its own fill colour
const CITY_COLOR_EXPR = [
  "match", ["get", "BASENAME"],
  "Berkeley",    CITY_COLORS["Berkeley"],
  "Oakland",     CITY_COLORS["Oakland"],
  "Alameda",     CITY_COLORS["Alameda"],
  "San Leandro", CITY_COLORS["San Leandro"],
  "Hayward",     CITY_COLORS["Hayward"],
  "Fremont",     CITY_COLORS["Fremont"],
  "Emeryville",  CITY_COLORS["Emeryville"],
  "#4b5563",
];

function MapState({ city }: { city: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mapRef = useRef<any>(null);
  const normalCity = city.split(",")[0].trim();

  useEffect(() => {
    if (!containerRef.current) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let map: any;

    import("maplibre-gl").then(({ Map }) => {
      if (!containerRef.current) return;
      map = new Map({
        container: containerRef.current,
        style: "https://tiles.stadiamaps.com/styles/alidade_smooth_dark.json",
        bounds: [[-122.42, 37.42], [-121.82, 37.95]],
        fitBoundsOptions: { padding: 24 },
        interactive: false,
        attributionControl: false,
      });

      map.on("load", () => {
        map.addSource("cities", { type: "geojson", data: "/east-bay.json" });

        map.addLayer({
          id: "cities-fill",
          type: "fill",
          source: "cities",
          paint: { "fill-color": CITY_COLOR_EXPR, "fill-opacity": 0.22 },
        });

        map.addLayer({
          id: "city-highlight",
          type: "fill",
          source: "cities",
          filter: ["==", ["get", "BASENAME"], normalCity],
          paint: {
            "fill-color": CITY_COLORS[normalCity] ?? "#5b9cf6",
            "fill-opacity": 0.55,
          },
        });

        map.addLayer({
          id: "cities-outline",
          type: "line",
          source: "cities",
          paint: { "line-color": "#ffffff", "line-opacity": 0.12, "line-width": 1 },
        });

        map.addLayer({
          id: "city-highlight-outline",
          type: "line",
          source: "cities",
          filter: ["==", ["get", "BASENAME"], normalCity],
          paint: {
            "line-color": CITY_COLORS[normalCity] ?? "#5b9cf6",
            "line-opacity": 0.9,
            "line-width": 2,
          },
        });
      });

      mapRef.current = map;
    });

    return () => { map?.remove(); mapRef.current = null; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Update highlight layers when city changes without remounting
  useEffect(() => {
    const map = mapRef.current;
    if (!map?.isStyleLoaded()) return;
    const filter = ["==", ["get", "BASENAME"], normalCity];
    const color = CITY_COLORS[normalCity] ?? "#5b9cf6";
    map.setFilter("city-highlight", filter);
    map.setFilter("city-highlight-outline", filter);
    map.setPaintProperty("city-highlight", "fill-color", color);
    map.setPaintProperty("city-highlight-outline", "line-color", color);
  }, [normalCity]);

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10 }}>
      <p style={{
        fontFamily: "var(--font-mono)", fontSize: 10, textTransform: "uppercase",
        letterSpacing: "0.1em", color: "var(--muted)", margin: 0,
      }}>
        Your location · East Bay, CA
      </p>
      <div
        ref={containerRef}
        style={{ width: "100%", maxWidth: 420, height: 380, borderRadius: 12, overflow: "hidden" }}
      />
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

function Timeline({ data, onSendLetter }: { data: TimelineData; onSendLetter: () => void }) {
  const [animated, setAnimated] = useState(false);
  const [btnHovered, setBtnHovered] = useState(false);
  useEffect(() => { setTimeout(() => setAnimated(true), 120); }, []);

  const n = data.milestones.length;
  const urgentIdx = data.milestones.findIndex((m) => m.state === "urgent");

  // Edge dots sit at column left/right edges (0% / 100%);
  // middle dots sit at column centers ((i + 0.5) / n * 100%).
  // Fill must match these actual pixel positions.
  function dotPct(i: number) {
    if (i === 0)     return 0;
    if (i === n - 1) return 100;
    return ((i + 0.5) / n) * 100;
  }
  const fillPct = urgentIdx >= 0 ? dotPct(urgentIdx) : 0;

  // Fixed height reserved above the track for "above" labels.
  // All dots sit at y = ABOVE_H, so the track line can be positioned exactly there.
  const ABOVE_H = 52;
  const DOT_BASE = 10; // normal dot diameter; track line is centered on this

  return (
    <div style={{ position: "relative" }}>

      {/* Track line — runs full width at the dot center */}
      <div style={{
        position: "absolute", left: 0, right: 0,
        top: ABOVE_H + DOT_BASE / 2 - 1, height: 2,
        background: "var(--border2)", borderRadius: 1,
      }}>
        <div style={{
          position: "absolute", left: 0, top: 0, bottom: 0,
          width: animated ? `${fillPct}%` : "0%",
          background: "linear-gradient(90deg, var(--green), var(--accent))",
          borderRadius: 1,
          transition: "width 1.2s cubic-bezier(0.4,0,0.2,1)",
        }} />
      </div>

      {/* Milestone columns */}
      <div style={{ display: "flex" }}>
        {data.milestones.map((m, i) => {
          const above     = i % 2 === 0;
          const isUrgent  = m.state === "urgent";
          const isPassed  = m.state === "passed";
          const isFirst   = i === 0;
          const isLast    = i === n - 1;
          const dotSize   = isUrgent ? 14 : 10;
          const dotColor  = isPassed ? "var(--green)" : isUrgent ? "var(--accent)" : "var(--border2)";
          const textColor = isPassed ? "var(--green)" : isUrgent ? "var(--accent)" : "var(--muted)";
          const align     = isFirst ? "flex-start" : isLast ? "flex-end" : "center";
          const textAlign = isFirst ? "left"        : isLast ? "right"   : "center";

          const labelContent = isUrgent ? (
            <button
              onClick={onSendLetter}
              onMouseEnter={() => setBtnHovered(true)}
              onMouseLeave={() => setBtnHovered(false)}
              style={{
                cursor: "pointer",
                background: btnHovered ? "var(--accent)" : "var(--accent-dim)",
                border: "1px solid var(--accent)",
                borderRadius: 999, padding: "5px 14px",
                fontFamily: "var(--font-mono)", fontSize: 12, fontWeight: 600,
                color: btnHovered ? "white" : "var(--accent)",
                transition: "all 0.15s",
                boxShadow: btnHovered ? "0 0 16px rgba(232,87,58,0.4)" : "none",
                whiteSpace: "nowrap",
              }}
            >
              {m.label} →
            </button>
          ) : (
            <div style={{
              fontFamily: "var(--font-mono)", fontSize: 10, color: textColor,
              textAlign, lineHeight: 1.4, width: "100%", wordBreak: "break-word",
            }}>
              {m.label}
            </div>
          );

          return (
            <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: align }}>

              {/* Above zone — fixed height so all dots land at the same y */}
              <div style={{
                height: ABOVE_H, width: "100%",
                display: "flex", alignItems: "flex-end", paddingBottom: 8,
                justifyContent: isFirst ? "flex-start" : isLast ? "flex-end" : "center",
              }}>
                {above && labelContent}
              </div>

              {/* Dot — centered on track line */}
              <div style={{
                width: dotSize, height: dotSize, borderRadius: "50%",
                background: dotColor, position: "relative", zIndex: 1, flexShrink: 0,
                marginTop: (DOT_BASE - dotSize) / 2,
                boxShadow: isUrgent ? "0 0 10px var(--accent)" : "none",
              }} />

              {/* Below zone */}
              <div style={{
                paddingTop: 10, width: "100%",
                display: "flex", justifyContent: isFirst ? "flex-start" : isLast ? "flex-end" : "center",
              }}>
                {!above && labelContent}
              </div>

            </div>
          );
        })}
      </div>

    </div>
  );
}


function VerdictState({
  verdict, timeline, city, onGenerateLetter,
}: {
  verdict: VerdictData;
  timeline: TimelineData;
  city: string;
  onGenerateLetter: () => void;
}) {
  const findingColor =
    verdict.finding === "illegal" ? "var(--accent)" :
    verdict.finding === "legal"   ? "var(--green)"  : "var(--yellow)";
  const findingLabel =
    verdict.finding === "illegal" ? "Illegal." :
    verdict.finding === "legal"   ? "Legal."   : "Unclear.";

  return (
    <div
      style={{
        display: "flex", flexDirection: "column", alignItems: "center",
        justifyContent: "center", minHeight: "100vh",
        padding: "100px 64px 80px", maxWidth: 860, margin: "0 auto",
      }}
    >
      {/* Finding */}
      <div style={{ width: "100%", marginBottom: 8 }}>
        <p style={{ fontFamily: "var(--font-mono)", fontSize: 11, textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--muted)", margin: "0 0 12px" }}>
          Finding issued
        </p>
        <h1 style={{ fontFamily: "var(--font-playfair)", fontSize: 96, fontWeight: 700, color: findingColor, margin: 0, lineHeight: 1 }}>
          {findingLabel}
        </h1>
        <p style={{ fontFamily: "var(--font-sans)", fontSize: 18, color: "var(--text)", margin: "20px 0 0", lineHeight: 1.6, maxWidth: 640 }}>
          {verdict.explanation}
        </p>
      </div>

      {/* Timeline — primary element */}
      <div style={{ width: "100%", marginTop: 24 }}>
        <Timeline data={timeline} onSendLetter={onGenerateLetter} />
      </div>

      {/* Map — anchored to bottom */}
      <div style={{ width: "100%", marginTop: 40, borderTop: "1px solid var(--border)", paddingTop: 40 }}>
        <MapState city={city} />
      </div>

    </div>
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
        setAppState("researching");
        setTimeout(() => setAppState("verdict"), 4400);
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

      {appState === "researching" && (
        <ResearchingState city={facts.city || ""} sources={verdict?.sources ?? []} />
      )}

      {appState === "verdict" && verdict && timeline && (
        <VerdictState
          verdict={verdict}
          timeline={timeline}
          city={facts.city || ""}
          onGenerateLetter={() => setShowModal(true)}
        />
      )}

      {showModal && <LetterModal onClose={() => setShowModal(false)} sessionId={sessionId} />}
    </div>
  );
}
