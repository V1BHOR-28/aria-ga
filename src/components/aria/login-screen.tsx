"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Lock, ArrowRight, Loader2 } from "lucide-react";
import { Logo, Wordmark } from "@/components/aria/logo";

interface LoginScreenProps {
  onLogin: (password: string) => Promise<boolean>;
}

export function LoginScreen({ onLogin }: LoginScreenProps) {
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    Promise.resolve().then(() => setMounted(true));
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password.trim() || loading) return;

    setLoading(true);
    setError(null);

    const success = await onLogin(password);
    if (!success) {
      setError("Wrong password. Try again.");
      setLoading(false);
    }
    // If success, the parent component will unmount this screen
  };

  return (
    <div className="fixed inset-0 z-50 bg-[#16110e] flex items-center justify-center overflow-hidden">
      {/* Ambient background */}
      <motion.div
        className="absolute inset-0 opacity-40"
        animate={{
          background: [
            "radial-gradient(circle at 30% 30%, #7fd1c415 0%, transparent 50%)",
            "radial-gradient(circle at 70% 70%, #f5a06b12 0%, transparent 50%)",
            "radial-gradient(circle at 30% 30%, #7fd1c415 0%, transparent 50%)",
          ],
        }}
        transition={{ duration: 12, repeat: Infinity, ease: "easeInOut" }}
      />

      <div className="relative z-10 w-full max-w-sm px-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={mounted ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.5 }}
          className="text-center"
        >
          {/* Logo */}
          <div className="flex justify-center mb-8">
            <Logo size={72} animated />
          </div>

          <Wordmark size="text-2xl" className="block mb-2" />

          <div className="flex items-center justify-center gap-2 mb-8 text-[#6b5f54]">
            <Lock className="w-3 h-3" />
            <span className="text-[11px] uppercase tracking-wider">
              Private — sign in to continue
            </span>
          </div>

          {/* Login form */}
          <form onSubmit={handleSubmit} className="space-y-3">
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Password"
              autoFocus
              disabled={loading}
              className="w-full bg-[#1f1814] border border-white/10 rounded-xl px-4 py-3 text-sm text-[#ece5dc] placeholder:text-[#6b5f54] focus:outline-none focus:ring-2 focus:ring-[#7fd1c4]/40 focus:border-transparent transition-all"
            />

            {error && (
              <motion.p
                initial={{ opacity: 0, y: -5 }}
                animate={{ opacity: 1, y: 0 }}
                className="text-xs text-red-400 text-left pl-1"
              >
                {error}
              </motion.p>
            )}

            <button
              type="submit"
              disabled={loading || !password.trim()}
              className="w-full flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-[#7fd1c4] text-[#16110e] text-sm font-medium hover:bg-[#a5e5db] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Signing in…
                </>
              ) : (
                <>
                  Sign in
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>

          <p className="text-[10px] text-[#4a3f38] mt-8 leading-relaxed">
            This is your private ARIA instance. No one else has access.
          </p>
        </motion.div>
      </div>
    </div>
  );
}
