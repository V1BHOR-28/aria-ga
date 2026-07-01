"use client";

import { motion } from "framer-motion";

interface LogoProps {
  size?: number;
  animated?: boolean;
  mood?: string;
  className?: string;
}

/**
 * ARIA logo — the essence mark. A soft circle with a subtle inner aperture.
 * When animated, it breathes slowly (like the orb) — used in onboarding
 * and empty states.
 */
export function Logo({ size = 40, animated = false, className = "" }: LogoProps) {
  return (
    <motion.div
      className={`relative ${className}`}
      style={{ width: size, height: size }}
      animate={
        animated
          ? {
              scale: [1, 1.04, 1],
            }
          : undefined
      }
      transition={
        animated
          ? {
              duration: 4,
              repeat: Infinity,
              ease: "easeInOut",
            }
          : undefined
      }
    >
      <svg
        width={size}
        height={size}
        viewBox="0 0 64 64"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        {/* Outer aura */}
        <circle cx="32" cy="32" r="30" fill="url(#aria-g)" opacity="0.1" />
        {/* Middle ring */}
        <circle cx="32" cy="32" r="22" fill="url(#aria-g)" opacity="0.25" />
        {/* Core */}
        <circle cx="32" cy="32" r="14" fill="url(#aria-g)" />
        {/* Inner aperture — the "voice emerging" detail */}
        <circle cx="28" cy="28" r="3.5" fill="#16110e" opacity="0.5" />
        <defs>
          <linearGradient
            id="aria-g"
            x1="20"
            y1="20"
            x2="44"
            y2="44"
            gradientUnits="userSpaceOnUse"
          >
            <stop stopColor="#a5e5db" />
            <stop offset="1" stopColor="#5a9b8f" />
          </linearGradient>
        </defs>
      </svg>
    </motion.div>
  );
}

/**
 * ARIA wordmark — "aria" in Fraunces, lowercase, wide tracking.
 * Used in the header and onboarding.
 */
export function Wordmark({
  size = "text-base",
  className = "",
}: {
  size?: string;
  className?: string;
}) {
  return (
    <span
      className={`${size} font-serif lowercase tracking-[0.25em] text-[#ece5dc] ${className}`}
      style={{ fontFeatureSettings: '"ss01"' }}
    >
      aria
    </span>
  );
}

/**
 * Full lockup — logo + wordmark, side by side.
 */
export function LogoLockup({
  size = 40,
  animated = false,
  className = "",
}: {
  size?: number;
  animated?: boolean;
  className?: string;
}) {
  return (
    <div className={`flex items-center gap-2.5 ${className}`}>
      <Logo size={size} animated={animated} />
      <Wordmark size={size > 32 ? "text-xl" : "text-base"} />
    </div>
  );
}
