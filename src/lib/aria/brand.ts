// ARIA — Brand System
//
// Design tokens, logo, and brand primitives. Imported across the app
// for consistent visual identity.

// ---------- Color tokens ----------
// Deeper background for better contrast, warm off-white text, teal accent
// used sparingly for active states and ARIA's signature.
export const BRAND = {
  // Backgrounds — deeper than before for premium feel
  bg: {
    base: "#16110e",      // app background (was #1a1614)
    surface: "#1f1814",   // cards, popovers
    elevated: "#281f1a",  // modals, active states
    inset: "#100c0a",     // wells, code blocks
  },
  // Text
  text: {
    primary: "#ece5dc",   // main text (slightly warmer than before)
    secondary: "#a89c8e", // muted text
    tertiary: "#6b5f54",  // placeholder, hints
  },
  // Accent — ARIA's signature teal. Used sparingly.
  accent: {
    base: "#7fd1c4",
    soft: "#7fd1c433",    // 20% opacity for backgrounds
    glow: "#7fd1c466",    // 40% opacity for glows
  },
  // Mood colors — same as emotions.ts but centralized
  mood: {
    warm: "#f5a06b",
    curious: "#7fd1c4",
    amused: "#e8c470",
    thoughtful: "#a5a8d8",
    concerned: "#e08a8a",
    excited: "#f0789a",
    calm: "#8ab8d4",
    playful: "#c89ae0",
    reflective: "#9ab0c0",
    honest: "#d4a574",
    frustrated: "#d87060",
    neutral: "#b0a8a0",
  },
  // Borders
  border: {
    subtle: "#ffffff0d",  // 5%
    default: "#ffffff14", // 8%
    strong: "#ffffff24",  // 14%
  },
} as const;

// ---------- Typography ----------
// Inter for UI (clean, neutral), Fraunces for wordmark/headlines (warmth),
// JetBrains Mono for metadata/code.
export const FONTS = {
  sans: "var(--font-geist-sans), Inter, system-ui, sans-serif",
  serif: "Fraunces, Georgia, serif",
  mono: "var(--font-geist-mono), 'JetBrains Mono', monospace",
} as const;

// Type scale — consistent across the app
export const TYPE = {
  // Display — onboarding, hero moments
  hero: "text-4xl md:text-5xl font-light tracking-tight",
  heroSerif: "text-4xl md:text-5xl font-light tracking-tight",
  // Headings
  h1: "text-2xl font-medium tracking-tight",
  h2: "text-lg font-medium tracking-tight",
  h3: "text-base font-medium",
  // Body
  body: "text-sm leading-relaxed",
  bodyLg: "text-base leading-relaxed",
  // UI
  label: "text-[10px] uppercase tracking-wider font-medium",
  caption: "text-xs text-secondary",
  // Mono
  mono: "text-xs font-mono",
} as const;

// ---------- Motion ----------
// Subtle, fast, never precious. Power users want snappy.
export const MOTION = {
  fast: { duration: 0.15, ease: "easeOut" },
  default: { duration: 0.25, ease: "easeOut" },
  slow: { duration: 0.4, ease: [0.4, 0, 0.2, 1] },
  spring: { type: "spring", damping: 25, stiffness: 300 },
  springSoft: { type: "spring", damping: 30, stiffness: 200 },
} as const;

// ---------- Logo ----------
// The ARIA mark: a soft circle (the essence orb) with a subtle inner
// aperture — suggests presence, attention, a voice emerging.
// Designed to render at 16px (favicon) through 128px (onboarding).
export const ARIA_LOGO_SVG = `<svg width="64" height="64" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
  <circle cx="32" cy="32" r="28" fill="url(#aria-g)" opacity="0.15"/>
  <circle cx="32" cy="32" r="20" fill="url(#aria-g)" opacity="0.3"/>
  <circle cx="32" cy="32" r="12" fill="url(#aria-g)"/>
  <circle cx="28" cy="28" r="3" fill="#16110e" opacity="0.4"/>
  <defs>
    <linearGradient id="aria-g" x1="20" y1="20" x2="44" y2="44" gradientUnits="userSpaceOnUse">
      <stop stop-color="#a5e5db"/>
      <stop offset="1" stop-color="#5a9b8f"/>
    </linearGradient>
  </defs>
</svg>`;

// Wordmark — "ARIA" in Fraunces, lowercase tracking, warm
export const ARIA_WORDMARK_CLASS = "font-serif text-lg tracking-[0.2em] lowercase";

// ---------- Spacing rhythm ----------
// 4px base. Most spacing uses these tokens.
export const SPACE = {
  xs: "gap-1",      // 4px
  sm: "gap-2",      // 8px
  md: "gap-3",      // 12px
  lg: "gap-4",      // 16px
  xl: "gap-6",      // 24px
  "2xl": "gap-8",   // 32px
} as const;
