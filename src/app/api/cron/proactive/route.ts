import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { createChatCompletion } from "@/lib/aria/zai-client";
import { ARIA_SYSTEM_PROMPT } from "@/lib/aria/persona";
import { TOOL_DESCRIPTIONS } from "@/lib/aria/tools";

export const runtime = "nodejs";

// POST /api/cron/proactive
// Called by an external scheduler (or the in-app checker) every ~15 minutes.
// Generates proactive messages based on:
// 1. Morning briefing (if it's morning and no briefing sent today)
// 2. Silence check (if no conversation in >24h)
// 3. Follow-up on important topics (if a high-importance memory was created >4h ago)
// 4. Due reminders (if any reminders are past their trigger time)

export async function POST(req: NextRequest) {
  try {
    const now = new Date();
    const messages: { type: string; content: string; mood: string }[] = [];

    // --- 1. Morning briefing (8am-11am, once per day) ---
    const hour = now.getHours();
    if (hour >= 8 && hour <= 11) {
      const todayStart = new Date(now);
      todayStart.setHours(0, 0, 0, 0);

      const alreadySent = await db.proactiveMessage.findFirst({
        where: {
          type: "morning_briefing",
          createdAt: { gte: todayStart },
        },
      });

      if (!alreadySent) {
        const briefing = await generateMorningBriefing();
        if (briefing) {
          messages.push({
            type: "morning_briefing",
            content: briefing.content,
            mood: briefing.mood,
          });
        }
      }
    }

    // --- 2. Silence check (no messages in >24h) ---
    const lastMessage = await db.message.findFirst({
      orderBy: { createdAt: "desc" },
    });

    if (lastMessage) {
      const hoursSinceLast = (now.getTime() - lastMessage.createdAt.getTime()) / (1000 * 60 * 60);
      if (hoursSinceLast > 24 && hoursSinceLast < 48) {
        // Check we haven't already sent a silence check recently
        const recentSilenceCheck = await db.proactiveMessage.findFirst({
          where: {
            type: "silence_check",
            createdAt: { gte: new Date(now.getTime() - 24 * 60 * 60 * 1000) },
          },
        });

        if (!recentSilenceCheck) {
          messages.push({
            type: "silence_check",
            content: "Hey. Haven't heard from you in a bit. Just checking in — you doing okay?",
            mood: "concerned",
          });
        }
      }
    }

    // --- 3. Due reminders ---
    const dueReminders = await db.reminder.findMany({
      where: {
        completed: false,
        triggerAt: { lte: now },
      },
      orderBy: { triggerAt: "asc" },
      take: 3,
    });

    for (const reminder of dueReminders) {
      messages.push({
        type: "follow_up",
        content: `Reminder: ${reminder.title}`,
        mood: "warm",
      });
      // Mark as completed so we don't repeat it
      await db.reminder.update({
        where: { id: reminder.id },
        data: { completed: true },
      });
    }

    // --- Save all generated messages ---
    for (const msg of messages) {
      await db.proactiveMessage.create({
        data: {
          type: msg.type,
          content: msg.content,
          mood: msg.mood,
        },
      });
    }

    return NextResponse.json({
      generated: messages.length,
      messages: messages.map((m) => ({ type: m.type, preview: m.content.slice(0, 80) })),
    });
  } catch (err) {
    console.error("[/api/cron/proactive]", err);
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// Generate a personalized morning briefing using ARIA's personality
async function generateMorningBriefing(): Promise<{
  content: string;
  mood: string;
} | null> {
  try {
    // Gather context: approved memories, recent conversations, reminders
    const memories = await db.memory.findMany({
      where: { status: "approved" },
      orderBy: [{ importance: "desc" }, { updatedAt: "desc" }],
      take: 5,
    });

    const upcomingReminders = await db.reminder.findMany({
      where: {
        completed: false,
        triggerAt: { gte: new Date() },
      },
      orderBy: { triggerAt: "asc" },
      take: 3,
    });

    const recentMessages = await db.message.findMany({
      orderBy: { createdAt: "desc" },
      take: 5,
    });

    const memoryText = memories.length
      ? memories.map((m) => `- [${m.kind}] ${m.content}`).join("\n")
      : "(none yet)";

    const reminderText = upcomingReminders.length
      ? upcomingReminders.map((r) => `- "${r.title}" at ${r.triggerAt.toLocaleString()}`).join("\n")
      : "(none)";

    const recentText = recentMessages.length
      ? recentMessages.reverse().map((m) => `${m.role}: ${m.content.slice(0, 100)}`).join("\n")
      : "(no recent conversations)";

    const systemContent = `${ARIA_SYSTEM_PROMPT}

${TOOL_DESCRIPTIONS}

---

You are generating a morning briefing for the user. This is a proactive message — they didn't ask for it, you're reaching out because you care. Keep it short (2-3 sentences), warm, and specific. Reference what you know about them. Don't list everything — pick the most relevant thing.

Start with §mood:warm§

# Context

## What you know about them:
${memoryText}

## Upcoming reminders:
${reminderText}

## Recent conversation:
${recentText}`;

    const { content } = await createChatCompletion({
      messages: [
        { role: "system", content: systemContent },
        {
          role: "user",
          content: "It's morning. Give me a brief, personal check-in. What should I be thinking about today?",
        },
      ],
      temperature: 0.8,
    });

    // Extract mood
    const moodMatch = content.match(/^§mood:(\w+)§/i);
    const mood = moodMatch ? moodMatch[1].toLowerCase() : "warm";
    const cleanContent = content.replace(/^§mood:\w+§\s*/i, "").trim();

    return { content: cleanContent, mood };
  } catch (err) {
    console.error("[proactive] morning briefing failed:", err);
    return null;
  }
}
