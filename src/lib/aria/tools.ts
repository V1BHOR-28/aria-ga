// ARIA — Tool functions
//
// These are the "hands" ARIA uses to actually DO things in the world.
// The LLM emits §tool:NAME|JSON_ARGS§ tags in its response, which the
// agent parses and executes. Results are fed back into the conversation
// context so ARIA can incorporate them into her reply.

import { db } from "@/lib/db";

export type ToolName =
  | "set_reminder"
  | "list_reminders"
  | "complete_reminder"
  | "save_note"
  | "list_notes"
  | "get_weather";

export interface ToolResult {
  tool: ToolName;
  success: boolean;
  result: string; // human-readable summary for the LLM
  data?: unknown; // structured data for the UI
}

// Parse and execute a tool call tag.
// Tag format: §tool:set_reminder|{"title":"Call mom","when":"2025-07-02T18:00:00"}§
export async function executeTool(
  name: ToolName,
  argsStr: string
): Promise<ToolResult> {
  let args: any;
  try {
    args = JSON.parse(argsStr);
  } catch {
    return {
      tool: name,
      success: false,
      result: `Invalid arguments for ${name}: ${argsStr}`,
    };
  }

  switch (name) {
    case "set_reminder":
      return await setReminder(args);
    case "list_reminders":
      return await listReminders();
    case "complete_reminder":
      return await completeReminder(args);
    case "save_note":
      return await saveNote(args);
    case "list_notes":
      return await listNotes();
    case "get_weather":
      return await getWeather(args);
    default:
      return {
        tool: name,
        success: false,
        result: `Unknown tool: ${name}`,
      };
  }
}

// --- Reminder tools --------------------------------------------------------

async function setReminder(args: {
  title: string;
  when: string; // ISO date string or natural language
}): Promise<ToolResult> {
  if (!args.title || !args.when) {
    return {
      tool: "set_reminder",
      success: false,
      result: "set_reminder requires 'title' and 'when' fields",
    };
  }

  // Parse the date — accept ISO strings or relative times
  let triggerAt: Date;
  try {
    triggerAt = new Date(args.when);
    if (isNaN(triggerAt.getTime())) {
      // Try to parse relative times like "in 2 hours", "at 6pm"
      triggerAt = parseRelativeTime(args.when);
    }
  } catch {
    triggerAt = parseRelativeTime(args.when);
  }

  if (isNaN(triggerAt.getTime())) {
    return {
      tool: "set_reminder",
      success: false,
      result: `Could not parse time: "${args.when}". Use ISO format or relative like "in 2 hours".`,
    };
  }

  const reminder = await db.reminder.create({
    data: {
      title: args.title,
      triggerAt,
    },
  });

  return {
    tool: "set_reminder",
    success: true,
    result: `Reminder set: "${args.title}" for ${triggerAt.toLocaleString()}`,
    data: { id: reminder.id, title: reminder.title, triggerAt: reminder.triggerAt },
  };
}

async function listReminders(): Promise<ToolResult> {
  const now = new Date();
  const reminders = await db.reminder.findMany({
    where: {
      completed: false,
      triggerAt: { gte: now },
    },
    orderBy: { triggerAt: "asc" },
    take: 10,
  });

  if (reminders.length === 0) {
    return {
      tool: "list_reminders",
      success: true,
      result: "No upcoming reminders.",
      data: [],
    };
  }

  const summary = reminders
    .map(
      (r) =>
        `- "${r.title}" at ${r.triggerAt.toLocaleString()}`
    )
    .join("\n");

  return {
    tool: "list_reminders",
    success: true,
    result: `Upcoming reminders:\n${summary}`,
    data: reminders,
  };
}

async function completeReminder(args: {
  id?: string;
  title?: string;
}): Promise<ToolResult> {
  if (!args.id && !args.title) {
    return {
      tool: "complete_reminder",
      success: false,
      result: "complete_reminder requires 'id' or 'title'",
    };
  }

  const where = args.id ? { id: args.id } : { title: { contains: args.title } };
  const reminder = await db.reminder.updateMany({
    where: { ...where, completed: false },
    data: { completed: true },
  });

  return {
    tool: "complete_reminder",
    success: reminder.count > 0,
    result:
      reminder.count > 0
        ? `Completed ${reminder.count} reminder(s)`
        : "No matching reminder found",
  };
}

// --- Note tools ------------------------------------------------------------

async function saveNote(args: {
  title: string;
  content: string;
  tags?: string;
}): Promise<ToolResult> {
  if (!args.title || !args.content) {
    return {
      tool: "save_note",
      success: false,
      result: "save_note requires 'title' and 'content'",
    };
  }

  const note = await db.note.create({
    data: {
      title: args.title,
      content: args.content,
      tags: args.tags || "",
    },
  });

  return {
    tool: "save_note",
    success: true,
    result: `Note saved: "${args.title}"`,
    data: { id: note.id, title: note.title },
  };
}

async function listNotes(): Promise<ToolResult> {
  const notes = await db.note.findMany({
    orderBy: { updatedAt: "desc" },
    take: 10,
  });

  if (notes.length === 0) {
    return {
      tool: "list_notes",
      success: true,
      result: "No notes saved yet.",
      data: [],
    };
  }

  const summary = notes
    .map((n) => `- "${n.title}"${n.tags ? ` [${n.tags}]` : ""}`)
    .join("\n");

  return {
    tool: "list_notes",
    success: true,
    result: `Recent notes:\n${summary}`,
    data: notes,
  };
}

// --- Weather tool ----------------------------------------------------------

async function getWeather(args: {
  location: string;
}): Promise<ToolResult> {
  if (!args.location) {
    return {
      tool: "get_weather",
      success: false,
      result: "get_weather requires 'location'",
    };
  }

  try {
    // Use Open-Meteo's free geocoding + weather API (no key required)
    // Step 1: Geocode the location
    const geoRes = await fetch(
      `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(
        args.location
      )}&count=1&language=en&format=json`
    );
    const geoData = await geoRes.json();

    if (!geoData.results || geoData.results.length === 0) {
      return {
        tool: "get_weather",
        success: false,
        result: `Could not find location: "${args.location}"`,
      };
    }

    const { latitude, longitude, name, country } = geoData.results[0];

    // Step 2: Get current weather
    const weatherRes = await fetch(
      `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m&timezone=auto`
    );
    const weatherData = await weatherRes.json();

    const temp = Math.round(weatherData.current?.temperature_2m ?? 0);
    const humidity = weatherData.current?.relative_humidity_2m ?? 0;
    const windSpeed = Math.round(weatherData.current?.wind_speed_10m ?? 0);
    const code = weatherData.current?.weather_code ?? 0;

    const description = weatherCodeToString(code);

    return {
      tool: "get_weather",
      success: true,
      result: `Weather in ${name}, ${country}: ${temp}°C, ${description}. Humidity: ${humidity}%, Wind: ${windSpeed} km/h`,
      data: { location: `${name}, ${country}`, temp, description, humidity, windSpeed },
    };
  } catch (err) {
    return {
      tool: "get_weather",
      success: false,
      result: `Weather lookup failed: ${err instanceof Error ? err.message : "unknown error"}`,
    };
  }
}

// --- Helpers ---------------------------------------------------------------

function parseRelativeTime(str: string): Date {
  const now = new Date();
  const lower = str.toLowerCase().trim();

  // "in X hours/minutes/days"
  const relMatch = lower.match(/in\s+(\d+)\s+(hour|minute|day|week)s?/);
  if (relMatch) {
    const num = parseInt(relMatch[1]);
    const unit = relMatch[2];
    const ms = {
      minute: 60 * 1000,
      hour: 60 * 60 * 1000,
      day: 24 * 60 * 60 * 1000,
      week: 7 * 24 * 60 * 60 * 1000,
    }[unit];
    return new Date(now.getTime() + num * ms);
  }

  // "at HH:MM" or "HH:MM" today (or tomorrow if already past)
  const timeMatch = lower.match(/(?:at\s+)?(\d{1,2}):?(\d{2})?\s*(am|pm)?/);
  if (timeMatch) {
    let hours = parseInt(timeMatch[1]);
    const minutes = timeMatch[2] ? parseInt(timeMatch[2]) : 0;
    const ampm = timeMatch[3];
    if (ampm === "pm" && hours < 12) hours += 12;
    if (ampm === "am" && hours === 12) hours = 0;

    const result = new Date(now);
    result.setHours(hours, minutes, 0, 0);
    if (result <= now) {
      result.setDate(result.getDate() + 1); // tomorrow
    }
    return result;
  }

  // "tomorrow"
  if (lower.includes("tomorrow")) {
    const result = new Date(now);
    result.setDate(result.getDate() + 1);
    result.setHours(9, 0, 0, 0); // default 9am
    return result;
  }

  return new Date(NaN); // invalid
}

function weatherCodeToString(code: number): string {
  const map: Record<number, string> = {
    0: "Clear sky",
    1: "Mainly clear",
    2: "Partly cloudy",
    3: "Overcast",
    45: "Foggy",
    48: "Depositing rime fog",
    51: "Light drizzle",
    53: "Moderate drizzle",
    55: "Dense drizzle",
    61: "Slight rain",
    63: "Moderate rain",
    65: "Heavy rain",
    71: "Slight snow fall",
    73: "Moderate snow fall",
    75: "Heavy snow fall",
    77: "Snow grains",
    80: "Slight rain showers",
    81: "Moderate rain showers",
    82: "Violent rain showers",
    95: "Thunderstorm",
    96: "Thunderstorm with slight hail",
    99: "Thunderstorm with heavy hail",
  };
  return map[code] || `Weather code ${code}`;
}

// --- Tool descriptions for the LLM ----------------------------------------
// This is injected into the system prompt so the LLM knows what tools
// are available and how to call them.

export const TOOL_DESCRIPTIONS = `# Tools available

You can call tools by emitting a tool tag in your response. The format is:

§tool:TOOL_NAME|JSON_ARGUMENTS§

IMPORTANT: The tool executes AFTER you finish speaking. So you must INCLUDE the expected result in your response text — don't just say "let me check." State the result as if you already know it. For example, instead of "Let me check the weather", say "The weather in Bangalore is..." and also emit the tool tag to verify.

The tool tag is stripped from the visible response. Tool results are saved but not shown to the user — you must speak them.

Available tools:

## set_reminder
Set a reminder for the user. After emitting the tag, confirm: "Reminder set: [title] for [time]".
Arguments: {"title": "string", "when": "ISO date or natural language like 'in 2 hours' or 'at 6pm' or 'tomorrow'"}
Example: §tool:set_reminder|{"title":"Call mom","when":"at 6pm"}§

## list_reminders
List upcoming reminders. Emit the tag, then list any reminders you know about.
Example: §tool:list_reminders|{}§

## complete_reminder
Mark a reminder as completed.
Arguments: {"title": "string (partial match)"} or {"id": "string"}
Example: §tool:complete_reminder|{"title":"Call mom"}§

## save_note
Save a note to the user's journal. After emitting, confirm: "Saved a note: [title]".
Arguments: {"title": "string", "content": "string", "tags": "optional comma-separated"}
Example: §tool:save_note|{"title":"Meeting notes","content":"Discussed Q3 roadmap","tags":"work,meeting"}§

## list_notes
List recent notes.
Example: §tool:list_notes|{}§

## get_weather
Get current weather. Emit the tag, then state the weather you expect. The actual data will be stored but you should speak it.
Arguments: {"location": "city name"}
Example: §tool:get_weather|{"location":"Bangalore"}§

Use tools when the user asks for something actionable. Don't use tools for casual conversation.`;
