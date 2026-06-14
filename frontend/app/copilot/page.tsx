"use client";

/*
 * Copilot page (route: "/copilot") — a multi-turn chat with the tool-using AI
 * agent that can look up the user's applications, jobs, and profile.
 * Backend: POST /ai/chat (chat). The FULL message history is sent on every turn
 * so the agent has context; the response includes the reply plus `tools_used`,
 * the list of backend tools the agent invoked — rendered as little "used: X" tags.
 * UI: a scrollable conversation pane (auto-scrolls to the newest message), an
 * animated typing indicator while awaiting a reply, an error banner, clickable
 * suggested prompts, and the input form.
 */
import { useState, useRef, useEffect } from "react";
import { chat, type ChatMessage } from "../lib/api";

interface DisplayMessage extends ChatMessage {
  tools_used?: string[];
}

const SUGGESTIONS = [
  "Which roles am I weakest for?",
  "What skills come up most across my jobs?",
  "Draft a follow-up for my Stripe application.",
];

export default function CopilotPage() {
  const [messages, setMessages] = useState<DisplayMessage[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const scrollRef = useRef<HTMLDivElement>(null);

  // Keep the conversation pane pinned to the latest message as it grows.
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages, sending]);

  // AI trigger: append the user's message, POST the whole history to /ai/chat,
  // then append the assistant's reply (carrying the tools it used).
  async function send(text: string) {
    const trimmed = text.trim();
    if (!trimmed || sending) return;

    setError(null);
    const userMsg: DisplayMessage = { role: "user", content: trimmed };
    const history = [...messages, userMsg];
    setMessages(history);
    setInput("");
    setSending(true);

    try {
      // Strip display-only fields before sending to the API.
      const payload: ChatMessage[] = history.map((m) => ({
        role: m.role,
        content: m.content,
      }));
      const result = await chat(payload);
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: result.reply,
          tools_used: result.tools_used,
        },
      ]);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to reach copilot.");
    } finally {
      setSending(false);
    }
  }

  // Form submit handler: send the current input as a chat turn.
  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    void send(input);
  }

  return (
    <div>
      <h1 className="text-3xl font-bold text-fg mb-2">Copilot</h1>
      <p className="text-muted mb-6">
        Ask about your applications, jobs, and profile. The copilot can look
        things up for you.
      </p>

      {/* Conversation */}
      <div
        ref={scrollRef}
        className="bg-surface border border-border rounded-md p-4 shadow-sm h-[28rem] overflow-y-auto mb-4 space-y-4"
      >
        {messages.length === 0 && !sending && (
          <div className="h-full flex flex-col items-center justify-center text-center text-meta">
            <p className="text-lg">Start a conversation</p>
            <p className="text-sm mt-1">
              Try one of the suggested prompts below.
            </p>
          </div>
        )}

        {messages.map((m, i) => (
          <div
            key={i}
            className={`flex ${
              m.role === "user" ? "justify-end" : "justify-start"
            }`}
          >
            <div
              className={`max-w-[80%] rounded-md px-4 py-2 text-sm ${
                m.role === "user"
                  ? "bg-accent text-white"
                  : "bg-surface-warm text-fg"
              }`}
            >
              <p className="whitespace-pre-wrap">{m.content}</p>
              {m.role === "assistant" &&
                m.tools_used &&
                m.tools_used.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {m.tools_used.map((tool) => (
                      <span
                        key={tool}
                        className="text-xs text-muted bg-surface border border-border rounded-sm px-1.5 py-0.5"
                      >
                        used: {tool}
                      </span>
                    ))}
                  </div>
                )}
            </div>
          </div>
        ))}

        {sending && (
          <div className="flex justify-start">
            <div className="bg-surface-warm text-muted rounded-md px-4 py-2 text-sm">
              <span className="inline-flex gap-1">
                <span className="animate-pulse">●</span>
                <span className="animate-pulse [animation-delay:150ms]">●</span>
                <span className="animate-pulse [animation-delay:300ms]">●</span>
              </span>
            </div>
          </div>
        )}
      </div>

      {error && (
        <p className="mb-3 text-danger bg-danger-tint border border-transparent rounded-sm px-3 py-2 text-sm">
          {error}
        </p>
      )}

      {/* Suggestions */}
      <div className="flex flex-wrap gap-2 mb-3">
        {SUGGESTIONS.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setInput(s)}
            disabled={sending}
            className="text-xs border border-accent text-accent-hover bg-accent-tint hover:bg-accent-tint disabled:opacity-50 rounded-full px-3 py-1 transition-colors"
          >
            {s}
          </button>
        ))}
      </div>

      {/* Input */}
      <form onSubmit={handleSubmit} className="flex gap-2">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask the copilot anything about your search..."
          className="flex-1 border border-border rounded-sm px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent"
        />
        <button
          type="submit"
          disabled={sending || !input.trim()}
          className="bg-accent hover:bg-accent-hover disabled:opacity-50 text-white font-medium px-5 py-2 rounded-sm transition-colors text-sm shrink-0"
        >
          Send
        </button>
      </form>
    </div>
  );
}
