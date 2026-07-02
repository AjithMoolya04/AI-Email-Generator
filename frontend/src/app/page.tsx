"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type Tone = "professional" | "friendly" | "formal" | "casual";

type GeneratedEmail = {
  subject: string;
  email: string;
  tone: Tone;
  model: string;
  history_id: string | null;
};

type HistoryItem = {
  id: string;
  prompt: string;
  tone: Tone;
  subject: string;
  email: string;
  created_at: string;
};

type GenerationState = "idle" | "loading" | "success" | "error";

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  prompt?: string;
  subject?: string;
  body?: string;
  tone?: Tone;
  model?: string;
  timestamp: string;
};

const tones: Array<{ label: string; value: Tone }> = [
  { label: "Professional", value: "professional" },
  { label: "Friendly", value: "friendly" },
  { label: "Formal", value: "formal" },
  { label: "Casual", value: "casual" },
];

const apiBaseUrl =
  process.env.NEXT_PUBLIC_API_BASE_URL?.replace(/\/$/, "") ?? "http://127.0.0.1:8000";

function formatCreatedAt(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "Just now"
    : new Intl.DateTimeFormat("en", {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      }).format(date);
}

export default function Home() {
  const [prompt, setPrompt] = useState("Write a follow-up email after an interview");
  const [tone, setTone] = useState<Tone>("professional");
  const [model, setModel] = useState<string>("gemini");
  const [result, setResult] = useState<GeneratedEmail | null>(null);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [state, setState] = useState<GenerationState>("idle");
  const [error, setError] = useState("");
  const [copiedField, setCopiedField] = useState<"subject" | "email" | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [theme, setTheme] = useState<"dark" | "light">(() => {
    if (typeof window === "undefined") {
      return "dark";
    }

    const savedTheme = window.localStorage.getItem("ai-email-theme");
    return savedTheme === "light" ? "light" : "dark";
  });
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const canSubmit = useMemo(() => prompt.trim().length >= 5, [prompt]);
  const activeHistory = history[0] ?? null;
  const isDark = theme === "dark";

  useEffect(() => {
    const loadSidebarData = async () => {
      try {
        const historyResponse = await fetch(`${apiBaseUrl}/api/history?limit=5`);

        if (historyResponse.ok) {
          const historyData = (await historyResponse.json()) as { items: HistoryItem[] };
          setHistory(historyData.items ?? []);
        }
      } catch {
        // Handle fetch failure silently or gracefully
      }
    };

    void loadSidebarData();
  }, []);

  useEffect(() => {
    if (!copiedField) {
      return;
    }

    const timer = window.setTimeout(() => setCopiedField(null), 1800);
    return () => window.clearTimeout(timer);
  }, [copiedField]);

  useEffect(() => {
    window.localStorage.setItem("ai-email-theme", theme);
  }, [theme]);

  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, result, state]);

  const copyToClipboard = async (value: string, field: "subject" | "email") => {
    await navigator.clipboard.writeText(value);
    setCopiedField(field);
  };

  const handleGenerate = async () => {
    if (!canSubmit || state === "loading") {
      return;
    }

    abortControllerRef.current?.abort();
    const controller = new AbortController();
    abortControllerRef.current = controller;

    setState("loading");
    setError("");

    const userMessage: ChatMessage = {
      id: `user-${Date.now()}`,
      role: "user",
      prompt: prompt.trim(),
      tone,
      timestamp: new Date().toISOString(),
    };

    setMessages((current) => [...current, userMessage]);

    try {
      const response = await fetch(`${apiBaseUrl}/api/generate-email`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        signal: controller.signal,
        body: JSON.stringify({ prompt: prompt.trim(), tone, model }),
      });

      const payload = (await response.json()) as GeneratedEmail & { detail?: string };

      if (!response.ok) {
        throw new Error(payload.detail ?? "Failed to generate email");
      }

      const nextResult = {
        subject: payload.subject,
        email: payload.email,
        tone: payload.tone,
        model: payload.model,
        history_id: payload.history_id ?? null,
      } satisfies GeneratedEmail;

      setResult(nextResult);
      setMessages((current) => [
        ...current,
        {
          id: nextResult.history_id ?? `assistant-${Date.now()}`,
          role: "assistant",
          subject: nextResult.subject,
          body: nextResult.email,
          tone: nextResult.tone,
          model: nextResult.model,
          timestamp: new Date().toISOString(),
        },
      ]);
      setHistory((current) => [
        {
          id: nextResult.history_id ?? `local-${Date.now()}`,
          prompt: prompt.trim(),
          tone,
          subject: nextResult.subject,
          email: nextResult.email,
          created_at: new Date().toISOString(),
        },
        ...current.filter((item) => item.prompt !== prompt.trim() || item.subject !== nextResult.subject),
      ].slice(0, 5));
      setState("success");
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        setState("idle");
        setError("");
        return;
      }

      setError(err instanceof Error ? err.message : "Something went wrong");
      setState("error");
    } finally {
      if (abortControllerRef.current === controller) {
        abortControllerRef.current = null;
      }
    }
  };

  const handleInterrupt = () => {
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;
    setState("idle");
    setError("");
  };

  const loadHistoryItem = (item: HistoryItem) => {
    setPrompt(item.prompt);
    setTone(item.tone);
    setResult({
      subject: item.subject,
      email: item.email,
      tone: item.tone,
      model: "history",
      history_id: item.id,
    });
    setState("success");
    setError("");
    setMessages([
      {
        id: `history-user-${item.id}`,
        role: "user",
        prompt: item.prompt,
        tone: item.tone,
        timestamp: item.created_at,
      },
      {
        id: `history-assistant-${item.id}`,
        role: "assistant",
        subject: item.subject,
        body: item.email,
        tone: item.tone,
        model: "history",
        timestamp: item.created_at,
      },
    ]);
  };

  const startNewEmail = () => {
    setPrompt("");
    setTone("professional");
    setResult(null);
    setState("idle");
    setError("");
    setMessages([]);
  };

  return (
    <main className={isDark ? "h-screen overflow-hidden bg-[#0b0f19] text-slate-100" : "h-screen overflow-hidden bg-[#f6f7fb] text-slate-900"}>
      <div className={isDark ? "mx-auto flex h-full w-full max-w-[1600px] flex-col lg:flex-row" : "mx-auto flex h-full w-full max-w-[1600px] flex-col lg:flex-row bg-[#f6f7fb]"}>
        <aside className={isDark ? "flex w-full flex-col border-b border-white/10 bg-[#0f1524] lg:h-full lg:w-[320px] lg:border-b-0 lg:border-r" : "flex w-full flex-col border-b border-slate-200 bg-white lg:h-full lg:w-[320px] lg:border-b-0 lg:border-r lg:border-slate-200"}>
          <div className={isDark ? "border-b border-white/10 p-5" : "border-b border-slate-200 p-5"}>
            <div className="flex items-center gap-3">
              <div className={isDark ? "flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-400/15 text-emerald-300 ring-1 ring-emerald-400/30" : "flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-700 ring-1 ring-emerald-200"}>
                ✦
              </div>
              <div>
                <p className={isDark ? "text-xs font-semibold uppercase tracking-[0.3em] text-slate-400" : "text-xs font-semibold uppercase tracking-[0.3em] text-slate-500"}>AI Email Generator</p>
              </div>
            </div>


          </div>

          <div className="flex-1 space-y-5 overflow-y-auto p-4">
            <button
              type="button"
              onClick={startNewEmail}
              className={isDark ? "flex w-full items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-semibold text-white transition hover:bg-white/10" : "flex w-full items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-900 transition hover:bg-slate-50"}
            >
              <span className="text-lg leading-none">+</span>
              New Email
            </button>

            <div>
              <div className={isDark ? "mb-3 flex items-center justify-between px-1 text-xs uppercase tracking-[0.25em] text-slate-500" : "mb-3 flex items-center justify-between px-1 text-xs uppercase tracking-[0.25em] text-slate-400"}>
                <span>History</span>
                <span>{history.length}</span>
              </div>

              <div className="space-y-2">
                {history.length > 0 ? (
                  history.map((item) => {
                    const isActive = activeHistory?.id === item.id;

                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => loadHistoryItem(item)}
                        className={`w-full rounded-2xl border px-4 py-4 text-left transition ${
                          isActive
                              ? isDark
                                ? "border-emerald-400/40 bg-emerald-400/10"
                                : "border-emerald-300 bg-emerald-50"
                              : isDark
                                ? "border-white/10 bg-white/5 hover:bg-white/10"
                                : "border-slate-200 bg-white hover:bg-slate-50"
                        }`}
                      >
                          <p className={isDark ? "line-clamp-1 text-sm font-medium text-white" : "line-clamp-1 text-sm font-medium text-slate-950"}>{item.subject}</p>
                          <p className={isDark ? "mt-1 line-clamp-2 text-xs leading-5 text-slate-400" : "mt-1 line-clamp-2 text-xs leading-5 text-slate-500"}>{item.prompt}</p>
                          <div className={isDark ? "mt-3 flex items-center justify-between text-[11px] text-slate-500" : "mt-3 flex items-center justify-between text-[11px] text-slate-400"}>
                            <span className={isDark ? "rounded-full bg-white/5 px-2 py-1" : "rounded-full bg-slate-100 px-2 py-1"}>{item.tone}</span>
                          <span>{formatCreatedAt(item.created_at)}</span>
                        </div>
                      </button>
                    );
                  })
                ) : (
                  <div className={isDark ? "rounded-2xl border border-dashed border-white/10 bg-white/5 px-4 py-6 text-sm text-slate-400" : "rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-sm text-slate-500"}>
                    No history yet. Generate your first email to populate this panel.
                  </div>
                )}
              </div>
            </div>
          </div>
        </aside>

        <section className={isDark ? "flex min-h-[calc(100vh-1px)] flex-1 flex-col bg-[#0b0f19]" : "flex min-h-[calc(100vh-1px)] flex-1 flex-col bg-[#f6f7fb]"}>
          <header className={isDark ? "border-b border-white/10 px-5 py-4 sm:px-6 lg:px-8" : "border-b border-slate-200 px-5 py-4 sm:px-6 lg:px-8 bg-white/70 backdrop-blur"}>
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <p className={isDark ? "text-xs font-semibold uppercase tracking-[0.3em] text-emerald-300/80" : "text-xs font-semibold uppercase tracking-[0.3em] text-emerald-700"}>Generate email</p>
                <h2 className={isDark ? "mt-1 text-xl font-semibold text-white sm:text-2xl" : "mt-1 text-xl font-semibold text-slate-950 sm:text-2xl"}>Write a prompt and get a polished draft</h2>
              </div>
              <div className={isDark ? "flex flex-wrap gap-2 text-xs text-slate-300" : "flex flex-wrap gap-2 text-xs text-slate-500"}>
                
                <button
                  type="button"
                  onClick={() => setTheme(isDark ? "light" : "dark")}
                  className={isDark ? "flex h-8 w-8 items-center justify-center rounded-full border border-white/10 bg-white/5 text-white transition hover:bg-white/10" : "flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-900 transition hover:bg-slate-50"}
                  aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
                >
                  {isDark ? (
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="5"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg>
                  ) : (
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>
                  )}
                </button>
              </div>
            </div>
          </header>

          <div className="flex min-h-0 flex-1 flex-col overflow-hidden px-4 py-5 sm:px-6 lg:px-8">
            <div className="mx-auto flex min-h-0 w-full max-w-4xl flex-1 flex-col gap-4 overflow-y-auto pb-8 pr-1">
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                {tones.map((item) => {
                  const active = tone === item.value;

                  return (
                    <button
                      key={item.value}
                      type="button"
                      onClick={() => setTone(item.value)}
                      className={`rounded-2xl border px-4 py-3 text-left transition ${
                        active
                          ? isDark
                            ? "border-emerald-400/50 bg-emerald-400/10"
                            : "border-emerald-300 bg-emerald-50"
                          : isDark
                            ? "border-white/10 bg-white/5 hover:bg-white/10"
                            : "border-slate-200 bg-white hover:bg-slate-50"
                      }`}
                    >
                      <p className={isDark ? "text-sm font-semibold text-white" : "text-sm font-semibold text-slate-950"}>{item.label}</p>
                    </button>
                  );
                })}
              </div>

              {error ? (
                <div className={isDark ? "rounded-2xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200" : "rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700"}>
                  {error}
                </div>
              ) : null}

              <div className="space-y-4">
                {messages.length > 0 ? (
                  messages.map((message) => (
                    <div key={message.id} className="flex flex-col gap-4">
                      {message.role === "user" ? (
                        <div className={isDark ? "ml-auto max-w-3xl rounded-[1.75rem] border border-white/10 bg-white/6 px-5 py-4 text-sm leading-6 text-slate-100 shadow-[0_16px_40px_-28px_rgba(0,0,0,0.8)]" : "ml-auto max-w-3xl rounded-[1.75rem] border border-slate-200 bg-white px-5 py-4 text-sm leading-6 text-slate-900 shadow-[0_16px_40px_-28px_rgba(15,23,42,0.15)]"}>
                          <div className={isDark ? "mb-2 flex items-center justify-between gap-3 text-[11px] uppercase tracking-[0.25em] text-slate-500" : "mb-2 flex items-center justify-between gap-3 text-[11px] uppercase tracking-[0.25em] text-slate-400"}>
                            <span>You</span>
                            <span>{message.tone}</span>
                          </div>
                          <p className={isDark ? "whitespace-pre-wrap text-base text-slate-100" : "whitespace-pre-wrap text-base text-slate-900"}>{message.prompt}</p>
                        </div>
                      ) : (
                        <div className={isDark ? "max-w-4xl rounded-[1.75rem] border border-emerald-400/20 bg-[#11182a] px-5 py-5 shadow-[0_24px_70px_-35px_rgba(16,185,129,0.35)]" : "max-w-4xl rounded-[1.75rem] border border-emerald-200 bg-white px-5 py-5 shadow-[0_24px_70px_-35px_rgba(15,23,42,0.14)]"}>
                          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                            <div>
                              <p className={isDark ? "text-sm font-semibold text-white" : "text-sm font-semibold text-slate-950"}>AI Response</p>
                              <p className={isDark ? "text-xs text-slate-400" : "text-xs text-slate-500"}>Tone: {message.tone} {message.model ? `• Model: ${message.model}` : ""}</p>
                            </div>
                          </div>

                          <div className="space-y-4">
                            <div className={isDark ? "rounded-2xl border border-white/10 bg-white/5 p-4" : "rounded-2xl border border-slate-200 bg-slate-50 p-4"}>
                              <div className={`flex items-center justify-between gap-3 border-b pb-2 mb-2 ${isDark ? "border-white/10" : "border-slate-200"}`}>
                                <p className={isDark ? "text-xs font-semibold uppercase tracking-[0.25em] text-emerald-300/80" : "text-xs font-semibold uppercase tracking-[0.25em] text-emerald-700"}>Subject</p>
                                <button
                                  type="button"
                                  onClick={() => copyToClipboard(message.subject ?? "", "subject")}
                                  className={isDark ? "text-xs font-semibold text-emerald-300 transition hover:text-emerald-200" : "text-xs font-semibold text-emerald-700 transition hover:text-emerald-800"}
                                >
                                  {copiedField === "subject" ? "Copied" : "Copy"}
                                </button>
                              </div>
                              <p className={isDark ? "text-base font-medium text-white" : "text-base font-medium text-slate-950"}>{message.subject}</p>
                            </div>

                            <div className={isDark ? "rounded-2xl border border-white/10 bg-white/5 p-4" : "rounded-2xl border border-slate-200 bg-slate-50 p-4"}>
                              <div className={`flex items-center justify-between gap-3 border-b pb-2 mb-2 ${isDark ? "border-white/10" : "border-slate-200"}`}>
                                <p className={isDark ? "text-xs font-semibold uppercase tracking-[0.25em] text-emerald-300/80" : "text-xs font-semibold uppercase tracking-[0.25em] text-emerald-700"}>Email Body</p>
                                <button
                                  type="button"
                                  onClick={() => copyToClipboard(message.body ?? "", "email")}
                                  className={isDark ? "text-xs font-semibold text-emerald-300 transition hover:text-emerald-200" : "text-xs font-semibold text-emerald-700 transition hover:text-emerald-800"}
                                >
                                  {copiedField === "email" ? "Copied" : "Copy"}
                                </button>
                              </div>
                              <div className="whitespace-pre-wrap text-sm leading-7">
                                {message.body}
                              </div>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  ))
                ) : (
                  <div className={isDark ? "rounded-[1.75rem] border border-dashed border-white/10 bg-white/5 px-5 py-10 text-center text-slate-300" : "rounded-[1.75rem] border border-dashed border-slate-200 bg-white px-5 py-10 text-center text-slate-600"}>
                    <p className={isDark ? "text-lg font-medium text-white" : "text-lg font-medium text-slate-950"}>Start a new email conversation</p>
                    <p className={isDark ? "mt-2 text-sm text-slate-400" : "mt-2 text-sm text-slate-500"}>
                      Use the prompt box below to generate a subject and email draft.
                    </p>
                  </div>
                )}

                {state === "loading" ? (
                  <div className={isDark ? "max-w-3xl rounded-[1.75rem] border border-white/10 bg-white/5 px-5 py-4 text-sm text-slate-300" : "max-w-3xl rounded-[1.75rem] border border-slate-200 bg-white px-5 py-4 text-sm text-slate-600"}>
                    Generating email draft...
                  </div>
                ) : null}

                <div ref={scrollRef} />
              </div>
            </div>
          </div>

          <footer className={isDark ? "shrink-0 border-t border-white/10 bg-[#0f1524] px-4 py-3 sm:px-6 lg:px-8" : "shrink-0 border-t border-slate-200 bg-white px-4 py-3 sm:px-6 lg:px-8"}>
            <div className="mx-auto w-full max-w-4xl space-y-2">
              <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
                <textarea
                  value={prompt}
                  onChange={(event) => setPrompt(event.target.value)}
                  placeholder="Write a follow-up email after an interview"
                  className={isDark ? "min-h-[46px] w-full resize-none rounded-2xl border border-white/10 bg-[#0b1020] px-4 py-[11px] text-sm leading-6 text-white outline-none transition placeholder:text-slate-500 focus:border-emerald-400/50" : "min-h-[46px] w-full resize-none rounded-2xl border border-slate-200 bg-white px-4 py-[11px] text-sm leading-6 text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-emerald-400/50"}
                />
                <button
                  type="button"
                  onClick={state === "loading" ? handleInterrupt : handleGenerate}
                  disabled={!canSubmit && state !== "loading"}
                  aria-label={state === "loading" ? "Stop generating email" : "Send email request"}
                  className={isDark ? "group inline-flex h-[46px] min-w-[7.5rem] items-center justify-center gap-2.5 rounded-2xl bg-emerald-400 px-5 text-sm font-semibold text-slate-950 transition-all duration-200 ease-out hover:bg-emerald-300 disabled:cursor-not-allowed disabled:opacity-60" : "group inline-flex h-[46px] min-w-[7.5rem] items-center justify-center gap-2.5 rounded-2xl bg-slate-950 px-5 text-sm font-semibold text-white transition-all duration-200 ease-out hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"}
                >
                  <span
                    className={`flex h-6 w-6 items-center justify-center rounded-full transition-all duration-200 ease-out ${
                      state === "loading"
                        ? isDark
                          ? "bg-rose-500/15 text-rose-700"
                          : "bg-rose-100 text-rose-700"
                        : isDark
                          ? "bg-black/10 text-slate-950"
                          : "bg-white/15 text-white"
                    }`}
                  >
                    {state === "loading" ? (
                      <span className="h-2.5 w-2.5 rounded-sm bg-current transition-transform duration-200 ease-out" />
                    ) : (
                      <svg
                        viewBox="0 0 20 20"
                        fill="currentColor"
                        className="h-3 w-3 translate-x-[0.5px] transition-transform duration-200 ease-out group-hover:translate-x-[1.5px]"
                        aria-hidden="true"
                      >
                        <path d="M3.5 3.25a1 1 0 0 0-1.5.86v11.78a1 1 0 0 0 1.5.86l11.78-5.89a1 1 0 0 0 0-1.78L3.5 3.25Z" />
                      </svg>
                    )}
                  </span>
                  <span className="transition-all duration-200 ease-out text-sm">
                    {state === "loading" ? "Stop" : "Send"}
                  </span>
                </button>
              </div>

              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex flex-wrap gap-1.5">
                  {tones.map((item) => {
                    const active = tone === item.value;

                    return (
                      <button
                        key={`composer-${item.value}`}
                        type="button"
                        onClick={() => setTone(item.value)}
                        className={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${
                          active
                            ? isDark
                              ? "border-emerald-400/50 bg-emerald-400/10 text-emerald-200"
                              : "border-emerald-300 bg-emerald-50 text-emerald-700"
                            : isDark
                              ? "border-white/10 bg-white/5 text-slate-300 hover:bg-white/10"
                              : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                        }`}
                      >
                        {item.label}
                      </button>
                    );
                  })}
                </div>

                <div className="flex flex-wrap gap-1.5">
                  <select
                    value={model}
                    onChange={(e) => setModel(e.target.value)}
                    className={isDark ? "rounded-full border border-white/10 bg-[#0b1020] px-3 py-1.5 text-xs font-medium text-slate-300 outline-none transition focus:border-emerald-400/50" : "rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 outline-none transition focus:border-emerald-400/50"}
                  >
                    <option value="gemini">Gemini 2.5 Flash</option>
                    <option value="openai">OpenAI (OpenRouter)</option>
                    <option value="groq">Groq (Llama 3)</option>
                  </select>
                </div>

                <div className={isDark ? "flex flex-wrap gap-1.5 text-xs text-slate-400" : "flex flex-wrap gap-1.5 text-xs text-slate-500"}>
                  <span className={isDark ? "rounded-full border border-white/10 bg-white/5 px-2.5 py-0.5" : "rounded-full border border-slate-200 bg-white px-2.5 py-0.5"}>
                    {prompt.trim().length}/2000
                  </span>
                </div>
              </div>

              {!canSubmit && prompt.length > 0 ? (
                <p className={isDark ? "text-sm text-rose-300" : "text-sm text-rose-600"}>Enter at least 5 characters before sending.</p>
              ) : null}
            </div>
          </footer>
        </section>
      </div>
    </main>
  );
}
