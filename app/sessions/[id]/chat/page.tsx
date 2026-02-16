"use client";

import { useState, useEffect, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { Send, Bot, User, ArrowLeft, Terminal, CheckCircle, XCircle } from "lucide-react";
import ReactMarkdown from "react-markdown";
import { useChatStore } from "@/stores/chatStore";

interface Session {
  id: string;
  name: string;
  swaggerUrl: string;
}

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
  metadata?: {
    type?: "curl" | "api_info" | "error";
    curl?: string;
    executed?: boolean;
    result?: unknown;
  };
}

export default function ChatPage() {
  const params = useParams();
  const router = useRouter();
  const sessionId = params.id as string;
  
  const [session, setSession] = useState<Session | null>(null);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingSession, setIsLoadingSession] = useState(true);
  
  const allMessages = useChatStore((state) => state.messages);
  const messages = allMessages[sessionId] || [];
  const addMessage = useChatStore((state) => state.addMessage);
  
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Fetch session details
  useEffect(() => {
    fetchSession();
  }, [sessionId]);

  // Scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const fetchSession = async () => {
    try {
      const response = await fetch(`/api/session/${sessionId}`);
      if (response.ok) {
        const data = await response.json();
        setSession(data.session);
      } else {
        router.push("/");
      }
    } catch (error) {
      console.error("Failed to fetch session:", error);
      router.push("/");
    } finally {
      setIsLoadingSession(false);
    }
  };

  const sendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    const userMessage = input.trim();
    setInput("");

    // Add user message to chat
    addMessage(sessionId, {
      role: "user",
      content: userMessage,
    });

    setIsLoading(true);

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId,
          message: userMessage,
        }),
      });

      const data = await response.json();

      // Add assistant response to chat
      addMessage(sessionId, {
        role: "assistant",
        content: data.explanation || data.response || data.message || "I processed your request.",
        metadata: {
          type: data.type,
          curl: data.curl,
          executed: data.executed,
          result: data.result,
        },
      });
    } catch (error) {
      console.error("Failed to send message:", error);
      addMessage(sessionId, {
        role: "assistant",
        content: "Sorry, I encountered an error processing your request.",
        metadata: { type: "error" },
      });
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoadingSession) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-[var(--color-circuit-green)] border-t-transparent"></div>
      </div>
    );
  }

  if (!session) {
    return null;
  }

  return (
    <div className="flex h-screen flex-col bg-[var(--color-background)]">
      {/* Header */}
      <header className="border-b border-[var(--color-border)] bg-white px-4 py-3">
        <div className="mx-auto flex max-w-4xl items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={() => router.push("/")}
              className="rounded-lg p-2 text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-background-alt)]"
            >
              <ArrowLeft className="h-5 w-5" />
            </button>
            <div>
              <h1 className="font-semibold text-[var(--color-logic-navy)]">
                {session.name}
              </h1>
              <p className="text-xs text-[var(--color-text-secondary)]">
                {session.swaggerUrl}
              </p>
            </div>
          </div>
          <div className="flex items-center">
            <span className="font-bold text-[var(--color-circuit-green)]">Swag</span>
            <span className="font-bold text-[var(--color-logic-navy)]">Bot</span>
          </div>
        </div>
      </header>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-6">
        <div className="mx-auto max-w-4xl space-y-6">
          {messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Bot className="h-16 w-16 text-[var(--color-circuit-green)]" />
              <h2 className="mt-4 text-xl font-semibold text-[white]">
                Welcome to SwagBot
              </h2>
              <p className="mt-2 max-w-md text-[var(--color-text-secondary)]">
                I can help you explore and interact with this API. Try asking me things like:
              </p>
              <div className="mt-4 space-y-2">
                <p className="rounded-lg bg-[var(--color-background-alt)] px-4 py-2 text-sm text-[var(--color-text-secondary)]">
                  &ldquo;What endpoints are available?&rdquo;
                </p>
                <p className="rounded-lg bg-[var(--color-background-alt)] px-4 py-2 text-sm text-[var(--color-text-secondary)]">
                  &ldquo;Get all users&rdquo;
                </p>
                <p className="rounded-lg bg-[var(--color-background-alt)] px-4 py-2 text-sm text-[var(--color-text-secondary)]">
                  &ldquo;Create a new product&rdquo;
                </p>
              </div>
            </div>
          ) : (
            <>
              {messages.map((message) => (
              <div
                key={message.id}
                className={`flex gap-3 items-center ${
                  message.role === "user" ? "flex-row-reverse" : ""
                }`}
              >
                <div
                  className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${
                    message.role === "user"
                      ? "bg-[var(--color-logic-navy)]"
                      : "bg-[var(--color-circuit-green)]"
                  }`}
                >
                  {message.role === "user" ? (
                    <User className="h-4 w-4 text-white" />
                  ) : (
                    <Bot className="h-4 w-4 text-white" />
                  )}
                </div>
                <div
                  className={`max-w-[80%] rounded-lg px-4 py-3 ${
                    message.role === "user"
                      ? "bg-[var(--color-logic-navy)] text-white"
                      : "bg-white border border-[var(--color-border)]"
                  }`}
                >
                  <div
                    className={`text-sm markdown-content ${
                      message.role === "user"
                        ? "text-white"
                        : "text-[var(--color-logic-navy)]"
                    }`}
                  >
                    <ReactMarkdown>{message.content}</ReactMarkdown>
                  </div>

                  {/* Curl Command Display */}
                  {message.metadata?.curl && (
                    <div className="mt-3 rounded bg-gray-900 p-3">
                      <div className="mb-2 flex items-center gap-2 text-xs text-gray-400">
                        <Terminal className="h-3 w-3" />
                        <span>Generated Command</span>
                      </div>
                      <code className="block overflow-x-auto whitespace-pre-wrap break-all text-xs text-green-400">
                        {message.metadata.curl}
                      </code>
                    </div>
                  )}

                  {message.metadata?.executed === true ? (
                    <div className="mt-2 flex items-center gap-2">
                      <CheckCircle className="h-4 w-4 text-[var(--color-circuit-green)]" />
                      <span className="text-xs text-[var(--color-circuit-green)]">
                        Executed successfully
                      </span>
                    </div>
                  ) : message.metadata?.executed === false ? (
                    <div className="mt-2 flex items-center gap-2">
                      <XCircle className="h-4 w-4 text-red-500" />
                      <span className="text-xs text-red-500">
                        Execution failed
                      </span>
                    </div>
                  ) : null}

                  {message.metadata?.result != null ? (
                    <div className="mt-3 max-h-64 overflow-auto rounded bg-[var(--color-background-alt)] p-3">
                      <pre className="text-xs text-[var(--color-text-secondary)]">
                        {(() => {
                          try {
                            return JSON.stringify(message.metadata!.result, null, 2);
                          } catch {
                            return String(message.metadata!.result);
                          }
                        })()}
                      </pre>
                    </div>
                  ) : null}
                </div>
              </div>
            ))}
          </>
          )}
          
          {/* Typing indicator */}
          {isLoading && (
            <div className="flex gap-3 items-center">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--color-circuit-green)]">
                <Bot className="h-4 w-4 text-white" />
              </div>
              <div className="max-w-[80%] rounded-lg px-4 py-3 bg-white border border-[var(--color-border)]">
                <div className="flex items-center gap-1 h-5">
                  <span className="typing-dot w-2 h-2 bg-[var(--color-circuit-green)] rounded-full"></span>
                  <span className="typing-dot w-2 h-2 bg-[var(--color-circuit-green)] rounded-full"></span>
                  <span className="typing-dot w-2 h-2 bg-[var(--color-circuit-green)] rounded-full"></span>
                </div>
              </div>
            </div>
          )}
          
          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Input */}
      <div className="border-t border-[var(--color-border)] px-4 py-4">
        <form
          onSubmit={sendMessage}
          className="mx-auto flex max-w-4xl gap-3"
        >
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask me about your API..."
            disabled={isLoading}
            className="flex-1 rounded-lg border border-[var(--color-border)] px-4 py-3 focus:border-[var(--color-circuit-green)] focus:outline-none focus:ring-1 focus:ring-[var(--color-circuit-green)] disabled:bg-[var(--color-background-alt)]"
          />
          <button
            type="submit"
            disabled={isLoading || !input.trim()}
            className="flex items-center gap-2 rounded-lg bg-[var(--color-circuit-green)] px-6 py-3 text-white transition-colors hover:bg-[var(--color-circuit-green-dark)] disabled:opacity-50"
          >
            {isLoading ? (
              <div className="h-5 w-5 animate-spin rounded-full border-2 border-white border-t-transparent"></div>
            ) : (
              <>
                <span>Send</span>
                <Send className="h-4 w-4" />
              </>
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
