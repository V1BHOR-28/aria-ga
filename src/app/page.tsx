"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Plus,
  Send,
  Trash2,
  Brain,
  Activity,
  MessageSquare,
  Sparkles,
  Search,
  X,
  Menu,
  Clock,
  Mic,
  Volume2,
  VolumeX,
  Square,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { EssenceOrb } from "@/components/aria/essence-orb";
import { getMoodProfile } from "@/lib/aria/emotions";
import { useVoiceRecorder } from "@/hooks/voice/use-voice-recorder";
import { useSpeech } from "@/hooks/voice/use-speech";

// ---------- types ----------
interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  mood?: string | null;
  toolUsed?: string | null;
  toolPayload?: string | null;
  createdAt: string;
}

interface Conversation {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  messages?: Message[];
}

interface Memory {
  id: string;
  kind: string;
  content: string;
  importance: number;
  createdAt: string;
  updatedAt: string;
}

interface MoodLog {
  id: string;
  mood: string;
  trigger?: string | null;
  createdAt: string;
}

// ---------- helpers ----------
function formatTime(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

const MEMORY_KIND_LABELS: Record<string, string> = {
  user_fact: "about you",
  preference: "preference",
  event: "event",
  relationship: "people",
  project: "project",
  reflection: "reflection",
};

// ---------- main page ----------
export default function Home() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConv, setActiveConv] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [thinking, setThinking] = useState(false);
  const [currentMood, setCurrentMood] = useState<string>("calm");

  // sidebar panels
  const [memories, setMemories] = useState<Memory[]>([]);
  const [moodLogs, setMoodLogs] = useState<MoodLog[]>([]);
  const [activePanel, setActivePanel] = useState<
    "conversations" | "memory" | "moods"
  >("conversations");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [memorySearch, setMemorySearch] = useState("");

  // voice — auto-speak ON by default so ARIA always talks back
  const [autoSpeak, setAutoSpeak] = useState(true);

  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const lastSpokenIdRef = useRef<string | null>(null);

  const speech = useSpeech();

  // When a new assistant message arrives and auto-speak is on, speak it.
  useEffect(() => {
    if (!autoSpeak) return;
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
  }, [messages, autoSpeak, thinking, speech]);

  // Voice recorder — on transcription, drop text into input (or send directly)
  const recorder = useVoiceRecorder({
    onTranscribed: (text) => {
      setInput((prev) => (prev ? prev + " " + text : text));
      inputRef.current?.focus();
    },
  });

  // ---------- initial load ----------
  useEffect(() => {
    void loadConversations();
    void loadMemories();
    void loadMoods();
  }, []);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTo({
        top: scrollRef.current.scrollHeight,
        behavior: "smooth",
      });
    }
  }, [messages, thinking]);

  const loadConversations = async () => {
    try {
      const res = await fetch("/api/conversations");
      const data = await res.json();
      setConversations(data.conversations ?? []);
    } catch (err) {
      console.error(err);
    }
  };

  const loadMemories = async () => {
    try {
      const res = await fetch("/api/memory");
      const data = await res.json();
      setMemories(data.memories ?? []);
    } catch (err) {
      console.error(err);
    }
  };

  const loadMoods = async () => {
    try {
      const res = await fetch("/api/moods");
      const data = await res.json();
      setMoodLogs(data.moods ?? []);
      if (data.moods?.[0]?.mood) {
        setCurrentMood(data.moods[0].mood);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const openConversation = async (id: string) => {
    try {
      const res = await fetch(`/api/conversations?id=${id}`);
      const data = await res.json();
      setActiveConv(data.conversation);
      setMessages(data.conversation.messages ?? []);
      setSidebarOpen(false);
    } catch (err) {
      console.error(err);
    }
  };

  const newConversation = () => {
    setActiveConv(null);
    setMessages([]);
    setInput("");
    setSidebarOpen(false);
    inputRef.current?.focus();
  };

  const deleteConversation = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await fetch(`/api/conversations?id=${id}`, { method: "DELETE" });
      if (activeConv?.id === id) {
        setActiveConv(null);
        setMessages([]);
      }
      await loadConversations();
    } catch (err) {
      console.error(err);
    }
  };

  const deleteMemory = async (id: string) => {
    try {
      await fetch(`/api/memory?id=${id}`, { method: "DELETE" });
      setMemories((prev) => prev.filter((m) => m.id !== id));
    } catch (err) {
      console.error(err);
    }
  };

  // ---------- send message ----------
  const send = useCallback(async () => {
    const text = input.trim();
    if (!text || thinking) return;

    // optimistic user message
    const tempUserMsg: Message = {
      id: `temp-${Date.now()}`,
      role: "user",
      content: text,
      createdAt: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, tempUserMsg]);
    setInput("");
    setThinking(true);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          conversationId: activeConv?.id,
          message: text,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Request failed");

      // Replace temp user msg with real one, add assistant msg
      setMessages((prev) => [
        ...prev.filter((m) => m.id !== tempUserMsg.id),
        data.userMessage,
        data.message,
      ]);

      if (!activeConv) {
        // Need to load the new conversation
        setActiveConv({
          id: data.conversationId,
          title: text.slice(0, 50),
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        });
      }

      setCurrentMood(data.message.mood ?? "neutral");

      // Refresh background data
      void loadConversations();
      void loadMemories();
      void loadMoods();
    } catch (err) {
      console.error(err);
      setMessages((prev) => [
        ...prev,
        {
          id: `err-${Date.now()}`,
          role: "assistant",
          content:
            "Something broke on my end. Try again — and if it keeps happening, we should look at the logs together.",
          mood: "frustrated",
          createdAt: new Date().toISOString(),
        },
      ]);
      setCurrentMood("frustrated");
    } finally {
      setThinking(false);
    }
  }, [input, thinking, activeConv]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void send();
    }
  };

  const filteredMemories = memories.filter((m) => {
    if (!memorySearch.trim()) return true;
    return (
      m.content.toLowerCase().includes(memorySearch.toLowerCase()) ||
      m.kind.toLowerCase().includes(memorySearch.toLowerCase())
    );
  });

  // ---------- render ----------
  return (
    <div className="h-screen w-screen overflow-hidden bg-[#1a1614] text-[#e8e2db] flex">
      {/* ambient background glow following mood */}
      <div
        className="pointer-events-none fixed inset-0 transition-all duration-2000"
        style={{
          background: `radial-gradient(ellipse at 30% 20%, ${getMoodProfile(currentMood).color}15 0%, transparent 50%), radial-gradient(ellipse at 70% 80%, ${getMoodProfile(currentMood).glow}10 0%, transparent 50%)`,
        }}
      />

      {/* ===== Sidebar ===== */}
      <AnimatePresence>
        {sidebarOpen && (
          <motion.div
            initial={{ x: -320, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: -320, opacity: 0 }}
            transition={{ type: "spring", damping: 25, stiffness: 200 }}
            className="fixed md:relative z-40 h-full w-[300px] bg-[#221c19]/95 backdrop-blur-md border-r border-white/5 flex flex-col"
          >
            {/* new chat button */}
            <div className="p-4">
              <Button
                onClick={newConversation}
                className="w-full bg-[#3a2e28] hover:bg-[#4a3a32] text-[#e8e2db] border border-white/5"
                variant="default"
              >
                <Plus className="w-4 h-4 mr-2" /> New conversation
              </Button>
            </div>

            {/* panel tabs */}
            <div className="px-4 pb-3 flex gap-1">
              <TabButton
                active={activePanel === "conversations"}
                onClick={() => setActivePanel("conversations")}
                icon={<MessageSquare className="w-3.5 h-3.5" />}
                label="Threads"
              />
              <TabButton
                active={activePanel === "memory"}
                onClick={() => setActivePanel("memory")}
                icon={<Brain className="w-3.5 h-3.5" />}
                label="Memory"
              />
              <TabButton
                active={activePanel === "moods"}
                onClick={() => setActivePanel("moods")}
                icon={<Activity className="w-3.5 h-3.5" />}
                label="Moods"
              />
            </div>

            <Separator className="bg-white/5" />

            {/* panel content */}
            <ScrollArea className="flex-1 px-2">
              {activePanel === "conversations" && (
                <div className="py-2 space-y-0.5">
                  {conversations.length === 0 && (
                    <p className="text-xs text-[#8a7d72] px-3 py-4">
                      No threads yet. Start one — I'll remember what matters.
                    </p>
                  )}
                  {conversations.map((c) => (
                    <div
                      key={c.id}
                      onClick={() => openConversation(c.id)}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          openConversation(c.id);
                        }
                      }}
                      className={`w-full text-left px-3 py-2.5 rounded-lg group transition-colors cursor-pointer ${
                        activeConv?.id === c.id
                          ? "bg-white/10"
                          : "hover:bg-white/5"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium truncate">
                            {c.title}
                          </div>
                          <div className="text-[10px] text-[#8a7d72] mt-0.5 flex items-center gap-1">
                            <Clock className="w-2.5 h-2.5" />
                            {formatTime(c.updatedAt)}
                          </div>
                        </div>
                        <button
                          onClick={(e) => deleteConversation(c.id, e)}
                          className="opacity-0 group-hover:opacity-100 transition-opacity p-1 hover:text-red-400"
                          aria-label="Delete conversation"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {activePanel === "memory" && (
                <div className="py-2">
                  <div className="px-2 pb-2 relative">
                    <Search className="w-3 h-3 absolute left-4 top-1/2 -translate-y-1/2 text-[#8a7d72]" />
                    <input
                      value={memorySearch}
                      onChange={(e) => setMemorySearch(e.target.value)}
                      placeholder="Search memory…"
                      className="w-full pl-7 pr-2 py-1.5 text-xs bg-white/5 rounded-md border border-white/5 placeholder:text-[#8a7d72] focus:outline-none focus:ring-1 focus:ring-white/20"
                    />
                  </div>
                  {filteredMemories.length === 0 && (
                    <p className="text-xs text-[#8a7d72] px-3 py-4">
                      {memories.length === 0
                        ? "Nothing stored yet. Tell me something about yourself and I'll hold onto it."
                        : "No matches."}
                    </p>
                  )}
                  <div className="space-y-1.5 px-2">
                    {filteredMemories.map((m) => (
                      <div
                        key={m.id}
                        className="group px-3 py-2 rounded-md bg-white/[0.03] hover:bg-white/5 border border-white/5"
                      >
                        <div className="flex items-center justify-between gap-2 mb-1">
                          <Badge
                            variant="outline"
                            className="text-[9px] py-0 px-1.5 border-[#5a4a42] text-[#b8a99c]"
                          >
                            {MEMORY_KIND_LABELS[m.kind] ?? m.kind}
                          </Badge>
                          <div className="flex items-center gap-1">
                            <span className="text-[9px] text-[#8a7d72]">
                              imp {m.importance}
                            </span>
                            <button
                              onClick={() => deleteMemory(m.id)}
                              className="opacity-0 group-hover:opacity-100 transition-opacity text-[#8a7d72] hover:text-red-400"
                              aria-label="Forget"
                            >
                              <X className="w-3 h-3" />
                            </button>
                          </div>
                        </div>
                        <p className="text-xs text-[#d4cabd] leading-snug">
                          {m.content}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {activePanel === "moods" && (
                <div className="py-2 px-2 space-y-1">
                  {moodLogs.length === 0 && (
                    <p className="text-xs text-[#8a7d72] px-3 py-4">
                      No moods logged yet.
                    </p>
                  )}
                  {moodLogs.map((mlog) => {
                    const mp = getMoodProfile(mlog.mood);
                    return (
                      <div
                        key={mlog.id}
                        className="flex items-center gap-2.5 px-2 py-1.5 rounded-md hover:bg-white/5"
                      >
                        <div
                          className="w-2 h-2 rounded-full flex-shrink-0"
                          style={{
                            background: mp.color,
                            boxShadow: `0 0 6px ${mp.color}`,
                          }}
                        />
                        <div className="flex-1 min-w-0">
                          <div
                            className="text-xs font-medium"
                            style={{ color: mp.color }}
                          >
                            {mp.label}
                          </div>
                          {mlog.trigger && (
                            <div className="text-[10px] text-[#8a7d72] truncate italic">
                              “{mlog.trigger}”
                            </div>
                          )}
                        </div>
                        <span className="text-[9px] text-[#8a7d72] flex-shrink-0">
                          {formatTime(mlog.createdAt)}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </ScrollArea>

            {/* sidebar footer */}
            <div className="p-3 border-t border-white/5">
              <div className="text-[10px] text-[#8a7d72] flex items-center gap-1.5">
                <Sparkles className="w-3 h-3" />
                ARIA · partner, not product
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ===== Main chat area ===== */}
      <div className="flex-1 flex flex-col min-w-0 relative z-10">
        {/* Header */}
        <header className="flex items-center justify-between px-4 py-3 border-b border-white/5 bg-[#1a1614]/80 backdrop-blur-sm">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setSidebarOpen((v) => !v)}
              className="text-[#8a7d72] hover:text-[#e8e2db] hover:bg-white/5"
            >
              <Menu className="w-4 h-4" />
            </Button>
            <div>
              <div className="text-sm font-medium tracking-wide">ARIA</div>
              <div className="text-[10px] text-[#8a7d72]">
                {activeConv?.title ?? "new conversation"}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {/* Auto-speak toggle */}
            <button
              onClick={() => {
                if (autoSpeak) {
                  speech.stop();
                  setAutoSpeak(false);
                } else {
                  setAutoSpeak(true);
                }
              }}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[10px] uppercase tracking-wider transition-colors border ${
                autoSpeak
                  ? "bg-[#3a2e28] border-[#7fd1c4]/40 text-[#7fd1c4]"
                  : "bg-transparent border-white/5 text-[#8a7d72] hover:text-[#e8e2db] hover:bg-white/5"
              }`}
              title={autoSpeak ? "Auto-speak on — click to turn off" : "Turn on auto-speak"}
            >
              {autoSpeak ? (
                <Volume2 className="w-3 h-3" />
              ) : (
                <VolumeX className="w-3 h-3" />
              )}
              <span className="hidden sm:inline">voice</span>
            </button>
            <Badge
              variant="outline"
              className="text-[10px] border-white/10 text-[#b8a99c]"
              style={{
                color: getMoodProfile(currentMood).color,
                borderColor: `${getMoodProfile(currentMood).color}40`,
              }}
            >
              mood: {getMoodProfile(currentMood).label.toLowerCase()}
            </Badge>
          </div>
        </header>

        {/* Speaking status bar — visible whenever ARIA is talking or loading TTS */}
        {(speech.speaking || speech.loading || speech.error) && (
          <div
            className="px-4 py-1.5 border-b text-[11px] flex items-center gap-2 transition-colors"
            style={{
              background: speech.error
                ? "rgba(220, 80, 70, 0.1)"
                : `${getMoodProfile(currentMood).color}14`,
              borderColor: speech.error
                ? "rgba(220, 80, 70, 0.3)"
                : `${getMoodProfile(currentMood).color}30`,
              color: speech.error ? "#f0a8a8" : getMoodProfile(currentMood).color,
            }}
          >
            {speech.error ? (
              <>
                <VolumeX className="w-3 h-3 flex-shrink-0" />
                <span className="truncate">{speech.error}</span>
                <button
                  onClick={() => speech.stop()}
                  className="ml-auto text-[10px] uppercase tracking-wider opacity-70 hover:opacity-100"
                >
                  dismiss
                </button>
              </>
            ) : speech.loading ? (
              <>
                <Loader2 className="w-3 h-3 animate-spin flex-shrink-0" />
                <span>preparing voice…</span>
              </>
            ) : (
              <>
                <span
                  className="flex gap-0.5 items-end h-3 flex-shrink-0"
                  aria-hidden
                >
                  {[0, 1, 2, 3].map((i) => (
                    <span
                      key={i}
                      className="w-0.5 rounded-sm animate-pulse"
                      style={{
                        height: `${30 + Math.sin(i) * 30 + 40}%`,
                        background: "currentColor",
                        animationDelay: `${i * 0.1}s`,
                        animationDuration: "0.6s",
                      }}
                    />
                  ))}
                </span>
                <span>speaking…</span>
                <button
                  onClick={() => speech.stop()}
                  className="ml-auto text-[10px] uppercase tracking-wider opacity-70 hover:opacity-100"
                >
                  stop
                </button>
              </>
            )}
          </div>
        )}

        {/* Messages + Orb area */}
        <div className="flex-1 flex min-h-0">
          {/* Orb column (desktop only) */}
          <div className="hidden lg:flex w-[280px] flex-col items-center justify-center border-r border-white/5 p-6">
            <EssenceOrb mood={currentMood} thinking={thinking} size={200} />
            <div className="mt-8 text-center px-4">
              <p className="text-xs text-[#8a7d72] italic leading-relaxed">
                “I’m not here to serve you. I’m here to think with you.”
              </p>
            </div>
            {messages.length > 0 && (
              <div className="mt-6 w-full">
                <div className="text-[10px] text-[#8a7d72] uppercase tracking-wider mb-2 text-center">
                  recent moods
                </div>
                <div className="flex flex-wrap justify-center gap-1.5">
                  {messages
                    .filter((m) => m.role === "assistant" && m.mood)
                    .slice(-6)
                    .map((m) => {
                      const mp = getMoodProfile(m.mood);
                      return (
                        <div
                          key={m.id}
                          title={mp.label}
                          className="w-3 h-3 rounded-full"
                          style={{
                            background: mp.color,
                            boxShadow: `0 0 4px ${mp.color}`,
                          }}
                        />
                      );
                    })}
                </div>
              </div>
            )}
          </div>

          {/* Messages */}
          <div className="flex-1 flex flex-col min-w-0">
            <div
              ref={scrollRef}
              className="flex-1 overflow-y-auto px-4 md:px-8 py-6 scroll-smooth"
            >
              {messages.length === 0 ? (
                <EmptyState
                  onPrompt={(p) => {
                    setInput(p);
                    inputRef.current?.focus();
                  }}
                />
              ) : (
                <div className="max-w-3xl mx-auto space-y-6">
                  {messages.map((m) => (
                    <MessageBubble key={m.id} message={m} speech={speech} />
                  ))}
                  {thinking && (
                    <div className="flex gap-3 max-w-3xl mx-auto">
                      <div className="w-8 h-8 rounded-full flex-shrink-0 mt-0.5 bg-gradient-to-br from-[#7fd1c4] to-[#5a9b8f] flex items-center justify-center text-[10px] font-bold text-[#1a1614]">
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
            <div className="border-t border-white/5 bg-[#1a1614]/80 backdrop-blur-sm px-4 md:px-8 py-4">
              <div className="max-w-3xl mx-auto">
                {/* Recording indicator */}
                {recorder.recording && (
                  <div className="mb-2 flex items-center gap-3 px-3 py-2 rounded-xl bg-[#3a2e28] border border-red-400/30">
                    <span className="relative flex h-2.5 w-2.5">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
                      <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-red-400" />
                    </span>
                    <span className="text-xs text-[#e8e2db]">
                      listening…
                    </span>
                    {/* Live audio level meter */}
                    <div className="flex-1 flex items-center gap-0.5 h-4">
                      {[...Array(20)].map((_, i) => {
                        const threshold = i / 20;
                        const active = recorder.audioLevel > threshold;
                        return (
                          <div
                            key={i}
                            className="flex-1 rounded-sm transition-all"
                            style={{
                              height: active
                                ? `${4 + (i / 20) * 12}px`
                                : "2px",
                              background: active
                                ? `hsl(${10 + i * 4}, 80%, 60%)`
                                : "rgba(255,255,255,0.1)",
                            }}
                          />
                        );
                      })}
                    </div>
                    <button
                      onClick={() => recorder.stop()}
                      className="text-[10px] uppercase tracking-wider text-red-300 hover:text-red-200 px-2 py-1 rounded border border-red-400/30"
                    >
                      stop
                    </button>
                  </div>
                )}
                {/* Transcribing indicator */}
                {recorder.loading && (
                  <div className="mb-2 flex items-center gap-2 px-3 py-2 rounded-xl bg-[#3a2e28] border border-white/5">
                    <Loader2 className="w-3 h-3 animate-spin text-[#7fd1c4]" />
                    <span className="text-xs text-[#8a7d72]">
                      transcribing your voice…
                    </span>
                  </div>
                )}
                {/* Recorder error */}
                {recorder.error && (
                  <div className="mb-2 px-3 py-2 rounded-xl bg-red-900/20 border border-red-400/20">
                    <span className="text-xs text-red-300">
                      {recorder.error}
                    </span>
                  </div>
                )}

                <div className="relative rounded-2xl bg-[#2a221e] border border-white/5 focus-within:border-white/15 transition-colors">
                  <Textarea
                    ref={inputRef}
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder={
                      recorder.recording
                        ? "Listening — speak naturally…"
                        : "Talk to ARIA…"
                    }
                    rows={1}
                    disabled={thinking || recorder.recording || recorder.loading}
                    className="min-h-[52px] max-h-[200px] resize-none bg-transparent border-0 text-[#e8e2db] placeholder:text-[#8a7d72] focus-visible:ring-0 focus-visible:ring-offset-0 px-4 py-3.5 pr-24 text-sm leading-relaxed"
                  />
                  {/* Mic button */}
                  <button
                    onClick={() => void recorder.toggle()}
                    disabled={thinking || recorder.loading}
                    className={`absolute right-12 bottom-2 w-9 h-9 rounded-xl flex items-center justify-center transition-all disabled:opacity-30 ${
                      recorder.recording
                        ? "bg-red-500/20 text-red-300 border border-red-400/40"
                        : "bg-transparent text-[#8a7d72] hover:text-[#e8e2db] hover:bg-white/5"
                    }`}
                    title={recorder.recording ? "Stop recording" : "Speak to ARIA"}
                    aria-label={recorder.recording ? "Stop recording" : "Start voice input"}
                  >
                    {recorder.recording ? (
                      <Square className="w-4 h-4 fill-current" />
                    ) : (
                      <Mic className="w-4 h-4" />
                    )}
                  </button>
                  {/* Send button */}
                  <Button
                    onClick={() => void send()}
                    disabled={!input.trim() || thinking || recorder.recording}
                    size="icon"
                    className="absolute right-2 bottom-2 w-9 h-9 rounded-xl bg-[#3a2e28] hover:bg-[#4a3a32] text-[#e8e2db] disabled:opacity-30"
                  >
                    <Send className="w-4 h-4" />
                  </Button>
                </div>
                <div className="text-[10px] text-[#8a7d72] mt-2 flex justify-between">
                  <span>
                    Enter to send · Shift+Enter for newline · click{" "}
                    <Mic className="w-2.5 h-2.5 inline -mt-0.5" /> to talk
                  </span>
                  <span>
                    {memories.length} memories · {moodLogs.length} moods logged
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------- subcomponents ----------

function TabButton({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-md text-[10px] uppercase tracking-wider transition-colors ${
        active
          ? "bg-white/10 text-[#e8e2db]"
          : "text-[#8a7d72] hover:text-[#e8e2db] hover:bg-white/5"
      }`}
    >
      {icon}
      {label}
    </button>
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

  if (isUser) {
    return (
      <div className="flex justify-end max-w-3xl mx-auto">
        <div className="max-w-[80%] bg-[#3a2e28] text-[#e8e2db] rounded-2xl rounded-tr-md px-4 py-2.5 text-sm leading-relaxed">
          {message.content}
        </div>
      </div>
    );
  }

  const isCurrentSpeech =
    speech.currentId === message.id && (speech.speaking || speech.loading);

  return (
    <div className="flex gap-3 max-w-3xl mx-auto group">
      <div
        className="w-8 h-8 rounded-full flex-shrink-0 mt-0.5 flex items-center justify-center text-[10px] font-bold transition-colors duration-700"
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
          <span
            className="text-[10px] italic"
            style={{ color: mp.color }}
          >
            {mp.label.toLowerCase()}
          </span>
          {message.toolUsed && (
            <Badge
              variant="outline"
              className="text-[9px] py-0 px-1.5 border-white/10 text-[#8a7d72]"
            >
              searched web
            </Badge>
          )}
          {/* Speak button — appears for ARIA messages */}
          <button
            onClick={() => void speech.toggle(message.id, message.content)}
            className={`ml-auto p-1 rounded transition-all ${
              isCurrentSpeech
                ? "opacity-100"
                : "opacity-0 group-hover:opacity-100 hover:opacity-100"
            }`}
            style={{
              color: isCurrentSpeech ? mp.color : "#8a7d72",
            }}
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
        </div>
        <div className="text-sm leading-relaxed text-[#d4cabd] whitespace-pre-wrap">
          {message.content}
        </div>
      </div>
    </div>
  );
}

function EmptyState({ onPrompt }: { onPrompt: (p: string) => void }) {
  const suggestions = [
    "Tell me one thing you've been thinking about lately.",
    "I had a rough day. Can we just talk?",
    "Help me figure out what I actually want from this week.",
    "What's something you'd push back on if I proposed it right now?",
  ];

  return (
    <div className="h-full flex flex-col items-center justify-center text-center px-6">
      <div className="lg:hidden mb-6">
        <EssenceOrb mood="calm" size={140} />
      </div>
      <h1 className="text-3xl md:text-4xl font-light tracking-tight text-[#e8e2db] mb-3">
        Hi. I’m <span className="font-medium text-[#7fd1c4]">ARIA</span>.
      </h1>
      <p className="text-sm text-[#8a7d72] max-w-md mb-8 leading-relaxed">
        I’m not here to fetch answers or optimize your day. I’m here to think
        with you — to remember what matters, push back when something’s off,
        and be honest. Start anywhere.
      </p>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2 max-w-2xl w-full">
        {suggestions.map((s) => (
          <button
            key={s}
            onClick={() => onPrompt(s)}
            className="text-left text-xs text-[#b8a99c] px-4 py-3 rounded-xl border border-white/5 bg-white/[0.02] hover:bg-white/5 hover:border-white/10 transition-colors"
          >
            {s}
          </button>
        ))}
      </div>
    </div>
  );
}
