"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Plus,
  Trash2,
  Brain,
  Activity,
  MessageSquare,
  Sparkles,
  Search,
  X,
  Menu,
  Clock,
  Loader2,
  VolumeX,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { EssenceOrb } from "@/components/aria/essence-orb";
import { getMoodProfile } from "@/lib/aria/emotions";
import { useSpeech } from "@/hooks/voice/use-speech";
import { VoiceSettings } from "@/components/aria/voice-settings";
import { TextChat } from "@/components/aria/text-chat";
import { VoiceConversation } from "@/components/aria/voice-conversation";

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

const MEMORY_KIND_LABELS: Record<string, string> = {
  user_fact: "about you",
  preference: "preference",
  event: "event",
  relationship: "people",
  project: "project",
  reflection: "reflection",
};

function formatTime(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diffMin = Math.floor((now.getTime() - d.getTime()) / 60000);
  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export default function Home() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConv, setActiveConv] = useState<Conversation | null>(null);
  const [currentMood, setCurrentMood] = useState<string>("calm");

  const [memories, setMemories] = useState<Memory[]>([]);
  const [moodLogs, setMoodLogs] = useState<MoodLog[]>([]);
  const [activePanel, setActivePanel] = useState<
    "conversations" | "memory" | "moods"
  >("conversations");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [memorySearch, setMemorySearch] = useState("");

  // Mobile mode toggle: "text" | "voice" — on desktop both are visible side-by-side
  const [mobileMode, setMobileMode] = useState<"text" | "voice">("text");

  const speech = useSpeech();

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
      if (data.moods?.[0]?.mood) setCurrentMood(data.moods[0].mood);
    } catch (err) {
      console.error(err);
    }
  };

  // Initial data load — runs once on mount
  useEffect(() => {
    const initialLoad = async () => {
      try {
        const [convRes, memRes, moodRes] = await Promise.all([
          fetch("/api/conversations").then((r) => r.json()),
          fetch("/api/memory").then((r) => r.json()),
          fetch("/api/moods").then((r) => r.json()),
        ]);
        setConversations(convRes.conversations ?? []);
        setMemories(memRes.memories ?? []);
        setMoodLogs(moodRes.moods ?? []);
        if (moodRes.moods?.[0]?.mood) setCurrentMood(moodRes.moods[0].mood);
      } catch (err) {
        console.error(err);
      }
    };
    void initialLoad();
  }, []);

  const openConversation = async (id: string) => {
    try {
      const res = await fetch(`/api/conversations?id=${id}`);
      const data = await res.json();
      setActiveConv(data.conversation);
      setSidebarOpen(false);
    } catch (err) {
      console.error(err);
    }
  };

  const newConversation = () => {
    setActiveConv(null);
    setSidebarOpen(false);
  };

  const deleteConversation = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await fetch(`/api/conversations?id=${id}`, { method: "DELETE" });
      if (activeConv?.id === id) setActiveConv(null);
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

  const filteredMemories = memories.filter((m) => {
    if (!memorySearch.trim()) return true;
    return (
      m.content.toLowerCase().includes(memorySearch.toLowerCase()) ||
      m.kind.toLowerCase().includes(memorySearch.toLowerCase())
    );
  });

  const mp = getMoodProfile(currentMood);

  return (
    <div className="h-screen w-screen overflow-hidden bg-[#1a1614] text-[#e8e2db] flex flex-col">
      {/* ambient background glow */}
      <div
        className="pointer-events-none fixed inset-0 transition-all duration-2000"
        style={{
          background: `radial-gradient(ellipse at 30% 20%, ${mp.color}15 0%, transparent 50%), radial-gradient(ellipse at 70% 80%, ${mp.glow}10 0%, transparent 50%)`,
        }}
      />

      {/* ===== Top bar ===== */}
      <header className="flex items-center justify-between px-4 py-2.5 border-b border-white/5 bg-[#1a1614]/80 backdrop-blur-sm relative z-20">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setSidebarOpen((v) => !v)}
            className="text-[#8a7d72] hover:text-[#e8e2db] hover:bg-white/5 h-8 w-8"
          >
            <Menu className="w-4 h-4" />
          </Button>
          <div className="flex items-center gap-2">
            <div
              className="w-2 h-2 rounded-full"
              style={{ background: mp.color, boxShadow: `0 0 6px ${mp.color}` }}
            />
            <div>
              <div className="text-sm font-medium tracking-wide">ARIA</div>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Mobile mode toggle */}
          <div className="flex md:hidden bg-[#2a221e] rounded-md p-0.5 border border-white/5">
            <button
              onClick={() => setMobileMode("text")}
              className={`px-2.5 py-1 rounded text-[10px] uppercase tracking-wider transition-colors ${
                mobileMode === "text"
                  ? "bg-[#3a2e28] text-[#7fd1c4]"
                  : "text-[#8a7d72]"
              }`}
            >
              Text
            </button>
            <button
              onClick={() => setMobileMode("voice")}
              className={`px-2.5 py-1 rounded text-[10px] uppercase tracking-wider transition-colors ${
                mobileMode === "voice"
                  ? "bg-[#3a2e28] text-[#7fd1c4]"
                  : "text-[#8a7d72]"
              }`}
            >
              Voice
            </button>
          </div>

          <VoiceSettings speech={speech} />

          <Badge
            variant="outline"
            className="text-[10px] border-white/10 hidden lg:inline-flex"
            style={{ color: mp.color, borderColor: `${mp.color}40` }}
          >
            {mp.label.toLowerCase()}
          </Badge>
        </div>
      </header>

      {/* Speech error bar */}
      {speech.error && (
        <div className="px-4 py-1.5 border-b text-[11px] flex items-center gap-2 bg-red-900/20 border-red-400/30 text-red-300 relative z-10">
          <VolumeX className="w-3 h-3 flex-shrink-0" />
          <span className="truncate">{speech.error}</span>
          <button
            onClick={() => speech.stop()}
            className="ml-auto text-[10px] uppercase tracking-wider opacity-70 hover:opacity-100"
          >
            dismiss
          </button>
        </div>
      )}

      {/* ===== Main two-column layout ===== */}
      <div className="flex-1 flex min-h-0 relative z-10">
        {/* Sidebar */}
        <AnimatePresence>
          {sidebarOpen && (
            <motion.div
              initial={{ x: -320, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: -320, opacity: 0 }}
              transition={{ type: "spring", damping: 25, stiffness: 200 }}
              className="fixed md:relative z-40 h-full w-[300px] bg-[#221c19]/95 backdrop-blur-md border-r border-white/5 flex flex-col"
            >
              <div className="p-4">
                <Button
                  onClick={newConversation}
                  className="w-full bg-[#3a2e28] hover:bg-[#4a3a32] text-[#e8e2db] border border-white/5"
                >
                  <Plus className="w-4 h-4 mr-2" /> New conversation
                </Button>
              </div>

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

              <ScrollArea className="flex-1 px-2">
                {activePanel === "conversations" && (
                  <div className="py-2 space-y-0.5">
                    {conversations.length === 0 && (
                      <p className="text-xs text-[#8a7d72] px-3 py-4">
                        No threads yet. Start one — I&apos;ll remember what matters.
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
                          ? "Nothing stored yet. Tell me something about yourself."
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
                      const mlogMp = getMoodProfile(mlog.mood);
                      return (
                        <div
                          key={mlog.id}
                          className="flex items-center gap-2.5 px-2 py-1.5 rounded-md hover:bg-white/5"
                        >
                          <div
                            className="w-2 h-2 rounded-full flex-shrink-0"
                            style={{
                              background: mlogMp.color,
                              boxShadow: `0 0 6px ${mlogMp.color}`,
                            }}
                          />
                          <div className="flex-1 min-w-0">
                            <div
                              className="text-xs font-medium"
                              style={{ color: mlogMp.color }}
                            >
                              {mlogMp.label}
                            </div>
                            {mlog.trigger && (
                              <div className="text-[10px] text-[#8a7d72] truncate italic">
                                &ldquo;{mlog.trigger}&rdquo;
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

              <div className="p-3 border-t border-white/5">
                <div className="text-[10px] text-[#8a7d72] flex items-center gap-1.5">
                  <Sparkles className="w-3 h-3" />
                  ARIA · partner, not product
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Text chat column (left) */}
        <div
          className={`flex-1 min-w-0 border-r border-white/5 ${
            mobileMode === "text" ? "flex" : "hidden md:flex"
          } flex-col`}
        >
          <TextChat
            speech={speech}
            currentMood={currentMood}
            onMoodChange={setCurrentMood}
            activeConv={activeConv}
            onConvChange={(c) => {
              setActiveConv(c);
              void loadConversations();
              void loadMemories();
              void loadMoods();
            }}
          />
        </div>

        {/* Voice conversation column (right) */}
        <div
          className={`flex-1 min-w-0 ${
            mobileMode === "voice" ? "flex" : "hidden md:flex"
          } flex-col`}
        >
          <VoiceConversation
            speech={speech}
            currentMood={currentMood}
            onMoodChange={setCurrentMood}
            settings={speech.settings}
            onSettingsChange={speech.updateSettings}
          />
        </div>
      </div>
    </div>
  );
}

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
