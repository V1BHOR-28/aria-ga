"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Send, Volume2, Square, Loader2, MessageSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { EssenceOrb } from "@/components/aria/essence-orb";
import { getMoodProfile } from "@/lib/aria/emotions";
import { useSpeech } from "@/hooks/voice/use-speech";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  mood?: string | null;
  toolUsed?: string | null;
  createdAt: string;
}

interface Conversation {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  messages?: Message[];
}

interface TextChatProps {
  speech: ReturnType<typeof useSpeech>;
  currentMood: string;
  onMoodChange: (mood: string) => void;
  activeConv: Conversation | null;
  onConvChange: (conv: Conversation | null) => void;
  onMessagesChange?: (count: number) => void;
}

export function TextChat({
  speech,
  currentMood,
  onMoodChange,
  activeConv,
  onConvChange,
}: TextChatProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [thinking, setThinking] = useState(false);

  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const lastSpokenIdRef = useRef<string | null>(null);
  const autoSpeakRef = useRef<boolean>(true);

  // Auto-speak new assistant messages
  useEffect(() => {
    if (!autoSpeakRef.current) return;
    const last = messages[messages.length - 1];
    if (
      last &&
      last.role === "assistant" &&
      last.id !== lastSpokenIdRef.current &&
      !thinking
    ) {
      lastSpokenIdRef.current = last.id;
      void speech.speak(last.id, last.content);
    }
  }, [messages, thinking, speech]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTo({
        top: scrollRef.current.scrollHeight,
        behavior: "smooth",
      });
    }
  }, [messages, thinking]);

  // Load messages when conversation changes (only when switching to an
  // existing conversation, not when we just created a new one)
  const lastLoadedConvId = useRef<string | null>(null);
  useEffect(() => {
    // Skip if same conv (e.g. just an update from sending a message)
    if (activeConv?.id === lastLoadedConvId.current) return;
    lastLoadedConvId.current = activeConv?.id ?? null;

    if (activeConv?.messages) {
      setMessages(activeConv.messages);
    } else if (!activeConv) {
      // Only clear if we're going to "no conversation" — don't clear
      // if a new conv was just created (activeConv will be set but
      // without .messages, and we want to keep the optimistic messages)
      setMessages([]);
    }
    lastSpokenIdRef.current = null;
  }, [activeConv?.id]);

  const send = useCallback(async () => {
    const text = input.trim();
    if (!text || thinking) return;

    const tempUserMsg: Message = {
      id: `temp-${Date.now()}`,
      role: "user",
      content: text,
      createdAt: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, tempUserMsg]);
    setInput("");
    setThinking(true);

    // Create a placeholder assistant message that we'll update as
    // deltas stream in. This gives the real-time typing effect.
    const streamMsgId = `stream-${Date.now()}`;
    const streamMsg: Message = {
      id: streamMsgId,
      role: "assistant",
      content: "",
      mood: "neutral",
      createdAt: new Date().toISOString(),
    };
    setMessages((prev) => [
      ...prev.filter((m) => m.id !== tempUserMsg.id),
      tempUserMsg,
      streamMsg,
    ]);

    try {
      const res = await fetch("/api/chat/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          conversationId: activeConv?.id,
          message: text,
        }),
      });

      if (!res.ok || !res.body) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `Request failed (${res.status})`);
      }

      // Parse the SSE stream manually
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let sseBuffer = "";
      let conversationId: string | null = null;
      let finalMessageId: string | null = null;
      let finalMood: string | null = null;
      let finalContent: string = "";
      let newConvCreated = false;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        sseBuffer += decoder.decode(value, { stream: true });

        const lines = sseBuffer.split("\n");
        sseBuffer = lines.pop() ?? "";

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith("data:")) continue;
          const jsonStr = trimmed.slice(5).trim();
          if (!jsonStr) continue;

          let evt: any;
          try {
            evt = JSON.parse(jsonStr);
          } catch {
            continue;
          }

          if (evt.type === "conversation") {
            conversationId = evt.conversationId;
            if (!activeConv) {
              newConvCreated = true;
              onConvChange({
                id: evt.conversationId,
                title: text.slice(0, 50),
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
              });
            }
          } else if (evt.type === "mood") {
            finalMood = evt.mood;
            if (evt.mood) onMoodChange(evt.mood);
            // Update the streaming message's mood
            setMessages((prev) =>
              prev.map((m) =>
                m.id === streamMsgId ? { ...m, mood: evt.mood } : m
              )
            );
          } else if (evt.type === "delta") {
            finalContent += evt.text;
            // Append text to the streaming message
            setMessages((prev) =>
              prev.map((m) =>
                m.id === streamMsgId
                  ? { ...m, content: m.content + evt.text }
                  : m
              )
            );
          } else if (evt.type === "done") {
            finalMessageId = evt.messageId;
            finalMood = evt.mood;
            finalContent = evt.content;
            // Replace the streaming placeholder with the final message
            setMessages((prev) =>
              prev.map((m) =>
                m.id === streamMsgId
                  ? {
                      ...m,
                      id: evt.messageId,
                      content: evt.content,
                      mood: evt.mood,
                    }
                  : m
              )
            );
            // Also replace the temp user message with the real one
            setMessages((prev) =>
              prev.map((m) =>
                m.id === tempUserMsg.id
                  ? {
                      ...m,
                      id: evt.messageId.replace(/[^a-zA-Z0-9]/g, "") + "-user",
                    }
                  : m
              )
            );
          } else if (evt.type === "error") {
            throw new Error(evt.error || "Stream error");
          }
        }
      }

      // If we never got a "done" event (stream ended early), clean up
      setMessages((prev) =>
        prev.map((m) =>
          m.id === streamMsgId && m.content === ""
            ? {
                ...m,
                content:
                  "Hmm, I lost my train of thought. Can you try asking that again?",
                mood: "frustrated",
              }
            : m
        )
      );

      void conversationId;
      void finalMessageId;
      void finalMood;
      void finalContent;
      void newConvCreated;
    } catch (err) {
      console.error(err);
      // Remove the empty streaming placeholder and show an error
      setMessages((prev) =>
        prev
          .filter((m) => m.id !== streamMsgId)
          .concat({
            id: `err-${Date.now()}`,
            role: "assistant",
            content:
              "Something broke on my end. Try again — and if it keeps happening, we should look at the logs together.",
            mood: "frustrated",
            createdAt: new Date().toISOString(),
          })
      );
    } finally {
      setThinking(false);
    }
  }, [input, thinking, activeConv, onConvChange, onMoodChange]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void send();
    }
  };

  return (
    <div className="flex flex-col h-full bg-[#1a1614]">
      {/* Header */}
      <div className="px-4 py-3 border-b border-white/5 flex items-center justify-between">
        <div>
          <div className="text-sm font-medium tracking-wide">Text chat</div>
          <div className="text-[10px] text-[#8a7d72]">
            {activeConv?.title ?? "new conversation"}
          </div>
        </div>
        <button
          onClick={() => {
            autoSpeakRef.current = !autoSpeakRef.current;
            if (!autoSpeakRef.current) speech.stop();
          }}
          className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[10px] uppercase tracking-wider transition-colors border ${
            autoSpeakRef.current
              ? "bg-[#3a2e28] border-[#7fd1c4]/40 text-[#7fd1c4]"
              : "bg-transparent border-white/5 text-[#8a7d72] hover:text-[#e8e2db]"
          }`}
          title="Toggle auto-speak"
        >
          {autoSpeakRef.current ? (
            <Volume2 className="w-3 h-3" />
          ) : (
            <Volume2 className="w-3 h-3 opacity-40" />
          )}
          <span className="hidden sm:inline">auto-speak</span>
        </button>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-6">
        {messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center px-6">
            <MessageSquare className="w-8 h-8 text-[#5a4a42] mb-3" />
            <p className="text-sm text-[#8a7d72] leading-relaxed mb-2">
              Type to ARIA. She&apos;ll think, reply, and (if auto-speak is on)
              read her response aloud.
            </p>
            <p className="text-[11px] text-[#5a4a42] max-w-xs">
              Tip: use the right column for hands-free voice conversation.
            </p>
          </div>
        ) : (
          <div className="max-w-2xl mx-auto space-y-5">
            {messages.map((m) => (
              <MessageBubble key={m.id} message={m} speech={speech} />
            ))}
            {/* Only show the thinking dots if there's no streaming
                assistant message yet (i.e. waiting for first token) */}
            {thinking &&
              !messages.some(
                (m) => m.role === "assistant" && m.id.startsWith("stream-")
              ) && (
                <div className="flex gap-3 max-w-2xl mx-auto">
                  <div className="w-7 h-7 rounded-full flex-shrink-0 mt-0.5 bg-gradient-to-br from-[#7fd1c4] to-[#5a9b8f] flex items-center justify-center text-[10px] font-bold text-[#1a1614]">
                    A
                  </div>
                  <div className="flex items-center gap-1.5 py-3">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#8a7d72] animate-bounce [animation-delay:-0.3s]" />
                    <span className="w-1.5 h-1.5 rounded-full bg-[#8a7d72] animate-bounce [animation-delay:-0.15s]" />
                    <span className="w-1.5 h-1.5 rounded-full bg-[#8a7d72] animate-bounce" />
                  </div>
                </div>
              )}
          </div>
        )}
      </div>

      {/* Composer */}
      <div className="border-t border-white/5 px-4 py-3">
        <div className="max-w-2xl mx-auto">
          <div className="relative rounded-2xl bg-[#2a221e] border border-white/5 focus-within:border-white/15 transition-colors">
            <Textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Type to ARIA…"
              rows={1}
              disabled={thinking}
              className="min-h-[48px] max-h-[200px] resize-none bg-transparent border-0 text-[#e8e2db] placeholder:text-[#8a7d72] focus-visible:ring-0 focus-visible:ring-offset-0 px-4 py-3 pr-14 text-sm leading-relaxed"
            />
            <Button
              onClick={() => void send()}
              disabled={!input.trim() || thinking}
              size="icon"
              className="absolute right-2 bottom-2 w-9 h-9 rounded-xl bg-[#3a2e28] hover:bg-[#4a3a32] text-[#e8e2db] disabled:opacity-30"
            >
              <Send className="w-4 h-4" />
            </Button>
          </div>
          <div className="text-[10px] text-[#8a7d72] mt-1.5 flex justify-between">
            <span>Enter to send · Shift+Enter for newline</span>
            {speech.speaking && (
              <span style={{ color: getMoodProfile(currentMood).color }}>
                speaking…
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function MessageBubble({
  message,
  speech,
}: {
  message: Message;
  speech: ReturnType<typeof useSpeech>;
}) {
  const isUser = message.role === "user";
  const mp = getMoodProfile(message.mood);
  const isStreaming = message.id.startsWith("stream-");

  if (isUser) {
    return (
      <div className="flex justify-end max-w-2xl mx-auto">
        <div className="max-w-[80%] bg-[#3a2e28] text-[#e8e2db] rounded-2xl rounded-tr-md px-4 py-2.5 text-sm leading-relaxed">
          {message.content}
        </div>
      </div>
    );
  }

  const isCurrentSpeech =
    speech.currentId === message.id && (speech.speaking || speech.loading);

  return (
    <div className="flex gap-3 max-w-2xl mx-auto group">
      <div
        className="w-7 h-7 rounded-full flex-shrink-0 mt-0.5 flex items-center justify-center text-[10px] font-bold transition-colors duration-700"
        style={{
          background: `linear-gradient(135deg, ${mp.color}, ${mp.glow})`,
          color: "#1a1614",
          boxShadow: `0 0 8px ${mp.color}55`,
        }}
      >
        A
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-2 mb-1">
          <span className="text-xs font-medium text-[#e8e2db]">ARIA</span>
          {isStreaming ? (
            <span className="text-[10px] italic text-[#7fd1c4] flex items-center gap-1">
              <span className="w-1 h-1 rounded-full bg-[#7fd1c4] animate-pulse" />
              typing
            </span>
          ) : (
            <span className="text-[10px] italic" style={{ color: mp.color }}>
              {mp.label.toLowerCase()}
            </span>
          )}
          {message.toolUsed && !isStreaming && (
            <Badge
              variant="outline"
              className="text-[9px] py-0 px-1.5 border-white/10 text-[#8a7d72]"
            >
              searched web
            </Badge>
          )}
          {/* Hide speaker button while streaming */}
          {!isStreaming && (
            <button
              onClick={() => void speech.toggle(message.id, message.content)}
              className={`ml-auto p-1 rounded transition-all ${
                isCurrentSpeech
                  ? "opacity-100"
                  : "opacity-0 group-hover:opacity-100 hover:opacity-100"
              }`}
              style={{ color: isCurrentSpeech ? mp.color : "#8a7d72" }}
              title={isCurrentSpeech ? "Stop" : "Listen to this"}
              aria-label={isCurrentSpeech ? "Stop speaking" : "Speak this message"}
            >
              {speech.loading && speech.currentId === message.id ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : speech.speaking && speech.currentId === message.id ? (
                <Square className="w-3.5 h-3.5 fill-current" />
              ) : (
                <Volume2 className="w-3.5 h-3.5" />
              )}
            </button>
          )}
        </div>
        <div className="text-sm leading-relaxed text-[#d4cabd] whitespace-pre-wrap">
          {message.content}
          {isStreaming && (
            <span className="inline-block w-1.5 h-4 ml-0.5 bg-[#7fd1c4] animate-pulse align-text-bottom" />
          )}
        </div>
      </div>
    </div>
  );
}
