"use client";

import { useState, useRef, useEffect } from "react";

const API = "http://localhost:8000";

type Message = {
  role: "user" | "assistant";
  content: string;
};

export default function Home() {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [verdict, setVerdict] = useState<string | null>(null);
  const [recording, setRecording] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  async function startSession() {
    const res = await fetch(`${API}/session`, { method: "POST" });
    const data = await res.json();
    setSessionId(data.session_id);
    setMessages([
      {
        role: "assistant",
        content: "Tell me about your housing situation. What's going on?",
      },
    ]);
  }

  async function submitTranscript(transcript: string) {
    if (!transcript.trim() || !sessionId) return;

    setMessages((prev) => [...prev, { role: "user", content: transcript }]);
    setLoading(true);

    const res = await fetch(`${API}/session/${sessionId}/message`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ transcript }),
    });

    const data = await res.json();
    setLoading(false);

    if (data.status === "NEED_FACTS") {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: data.question },
      ]);
    } else if (data.status === "VERDICT") {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: "Got everything I need. Here's what I found:" },
      ]);
      setVerdict(data.verdict);
    }
  }

  async function sendMessage() {
    if (!input.trim() || loading) return;
    const text = input.trim();
    setInput("");
    await submitTranscript(text);
  }

  async function startRecording() {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const recorder = new MediaRecorder(stream);
    chunksRef.current = [];

    recorder.ondataavailable = (e) => chunksRef.current.push(e.data);
    recorder.onstop = async () => {
      stream.getTracks().forEach((t) => t.stop());
      const blob = new Blob(chunksRef.current, { type: "audio/webm" });
      await transcribeAndSend(blob);
    };

    mediaRecorderRef.current = recorder;
    recorder.start();
    setRecording(true);
  }

  function stopRecording() {
    mediaRecorderRef.current?.stop();
    setRecording(false);
  }

  async function transcribeAndSend(blob: Blob) {
    setLoading(true);
    const form = new FormData();
    form.append("audio", blob, "audio.webm");

    const res = await fetch(`${API}/transcribe`, { method: "POST", body: form });
    const data = await res.json();
    setLoading(false);

    if (data.transcript) {
      await submitTranscript(data.transcript);
    }
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-2xl flex flex-col gap-4">
        <div>
          <h1 className="text-2xl font-semibold">East Bay Tenant Rights</h1>
          <p className="text-zinc-400 text-sm mt-1">
            Describe your housing situation and we'll look up your rights.
          </p>
        </div>

        {!sessionId ? (
          <button
            onClick={startSession}
            className="mt-4 w-full rounded-xl bg-blue-600 hover:bg-blue-500 py-3 font-medium transition-colors"
          >
            Start
          </button>
        ) : (
          <>
            <div className="flex flex-col gap-3 min-h-[300px] max-h-[500px] overflow-y-auto rounded-xl bg-zinc-900 p-4">
              {messages.map((m, i) => (
                <div
                  key={i}
                  className={`max-w-[85%] rounded-xl px-4 py-2.5 text-sm leading-relaxed ${
                    m.role === "user"
                      ? "self-end bg-blue-600"
                      : "self-start bg-zinc-800 text-zinc-100"
                  }`}
                >
                  {m.content}
                </div>
              ))}
              {loading && (
                <div className="self-start bg-zinc-800 rounded-xl px-4 py-2.5 text-sm text-zinc-400">
                  Thinking...
                </div>
              )}
              <div ref={bottomRef} />
            </div>

            {verdict && (
              <div className="rounded-xl bg-zinc-800 border border-zinc-700 p-4 text-sm leading-relaxed whitespace-pre-wrap">
                <p className="text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-2">
                  Verdict
                </p>
                {verdict}
              </div>
            )}

            {!verdict && (
              <div className="flex gap-2">
                <input
                  className="flex-1 rounded-xl bg-zinc-800 px-4 py-2.5 text-sm outline-none placeholder:text-zinc-500 focus:ring-1 focus:ring-blue-500"
                  placeholder="Type your response..."
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && sendMessage()}
                  disabled={loading || recording}
                />
                <button
                  onClick={sendMessage}
                  disabled={loading || recording || !input.trim()}
                  className="rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-40 px-4 py-2.5 text-sm font-medium transition-colors"
                >
                  Send
                </button>
                <button
                  onClick={recording ? stopRecording : startRecording}
                  disabled={loading}
                  className={`rounded-xl px-4 py-2.5 text-sm font-medium transition-colors disabled:opacity-40 ${
                    recording
                      ? "bg-red-600 hover:bg-red-500 animate-pulse"
                      : "bg-zinc-700 hover:bg-zinc-600"
                  }`}
                >
                  {recording ? "Stop" : "🎙"}
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
