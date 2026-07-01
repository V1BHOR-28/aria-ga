"use client";

import { useEffect, useState } from "react";
import { getMoodProfile } from "@/lib/aria/emotions";

interface EssenceOrbProps {
  mood: string | null | undefined;
  thinking?: boolean;
  size?: number;
  showLabel?: boolean;
}

/**
 * ARIA's visual essence. A pulsing orb whose color, intensity, and rhythm
 * reflect her current mood. When she's thinking, it breathes faster.
 */
export function EssenceOrb({
  mood,
  thinking = false,
  size = 160,
  showLabel = true,
}: EssenceOrbProps) {
  const profile = getMoodProfile(mood);
  const [breathPhase, setBreathPhase] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setBreathPhase((p) => p + 1);
    }, thinking ? 600 : 1800);
    return () => clearInterval(interval);
  }, [thinking]);

  const intensity = thinking ? 0.9 : profile.intensity;
  const pulseScale = 1 + Math.sin(breathPhase * 0.6) * 0.04 * intensity;
  const glowOpacity = 0.4 + Math.sin(breathPhase * 0.6) * 0.2 * intensity;

  return (
    <div
      className="flex flex-col items-center justify-center gap-3"
      style={{ width: size }}
    >
      <div
        className="relative flex items-center justify-center"
        style={{ width: size, height: size }}
      >
        {/* Outer aura */}
        <div
          className="absolute inset-0 rounded-full blur-2xl transition-all duration-1000 ease-out"
          style={{
            background: `radial-gradient(circle, ${profile.glow} 0%, transparent 70%)`,
            opacity: glowOpacity,
            transform: `scale(${pulseScale * 1.3})`,
          }}
        />
        {/* Middle ring */}
        <div
          className="absolute rounded-full blur-md transition-all duration-700"
          style={{
            inset: size * 0.12,
            background: `radial-gradient(circle, ${profile.color}cc 0%, ${profile.color}33 60%, transparent 100%)`,
            opacity: 0.7 + intensity * 0.3,
            transform: `scale(${pulseScale})`,
          }}
        />
        {/* Core */}
        <div
          className="relative rounded-full transition-all duration-700"
          style={{
            width: size * 0.55,
            height: size * 0.55,
            background: `radial-gradient(circle at 35% 35%, ${profile.glow}, ${profile.color} 60%, ${profile.color}aa 100%)`,
            boxShadow: `inset 0 0 ${size * 0.15}px ${profile.color}88, 0 0 ${size * 0.2}px ${profile.color}66`,
            transform: `scale(${pulseScale})`,
          }}
        >
          {/* Inner light shimmer */}
          <div
            className="absolute inset-0 rounded-full opacity-50"
            style={{
              background:
                "radial-gradient(circle at 30% 25%, rgba(255,255,255,0.6) 0%, transparent 40%)",
            }}
          />
          {/* Slow rotation pattern */}
          <div
            className="absolute inset-2 rounded-full opacity-30"
            style={{
              background: `conic-gradient(from ${breathPhase * 30}deg, transparent 0%, ${profile.glow}55 25%, transparent 50%, ${profile.color}55 75%, transparent 100%)`,
            }}
          />
        </div>
      </div>
      {showLabel && (
        <div className="text-center">
          <div
            className="text-sm font-medium tracking-wide transition-colors duration-700"
            style={{ color: profile.color }}
          >
            {thinking ? "thinking…" : profile.label}
          </div>
          <div className="text-xs text-muted-foreground italic mt-0.5 h-4 max-w-[180px] truncate">
            {profile.description}
          </div>
        </div>
      )}
    </div>
  );
}
