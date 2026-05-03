import { useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Flame, X } from "lucide-react";

interface StreakCelebrationProps {
  milestone: number | null;
  onDismiss: () => void;
}

const COPY: Record<number, { title: string; body: string }> = {
  4: { title: "4-week streak!", body: "You've logged activity four weeks in a row. A real habit is forming." },
  12: { title: "12-week streak!", body: "Three months of consistent impact. You're proving what's possible." },
  26: { title: "26-week streak!", body: "Half a year of unbroken giving. That's serious dedication." },
  52: { title: "52-week streak!", body: "A whole year of weekly impact. You are unstoppable." },
};

export default function StreakCelebration({ milestone, onDismiss }: StreakCelebrationProps) {
  useEffect(() => {
    if (!milestone) return;
    const t = setTimeout(onDismiss, 6000);
    return () => clearTimeout(t);
  }, [milestone, onDismiss]);

  const copy = milestone ? COPY[milestone] : null;

  return (
    <AnimatePresence>
      {milestone && copy && (
        <motion.div
          key={milestone}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4"
          onClick={onDismiss}
          role="dialog"
          aria-modal="true"
          aria-labelledby="streak-celebration-title"
        >
          <motion.div
            initial={{ scale: 0.6, opacity: 0, y: 30 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.85, opacity: 0 }}
            transition={{ type: "spring", damping: 18, stiffness: 220 }}
            className="bg-white rounded-2xl shadow-2xl max-w-sm w-full p-6 text-center relative"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={onDismiss}
              className="absolute top-3 right-3 p-1 rounded-md text-muted-foreground hover:bg-muted/30"
              aria-label="Close"
            >
              <X className="w-4 h-4" />
            </button>

            <motion.div
              initial={{ rotate: -20, scale: 0.5 }}
              animate={{ rotate: [0, -10, 10, -8, 8, 0], scale: 1 }}
              transition={{ duration: 1.1, ease: "easeOut" }}
              className="w-20 h-20 rounded-full mx-auto mb-4 flex items-center justify-center"
              style={{ background: "linear-gradient(135deg,#F06127,#FFB347)" }}
            >
              <Flame className="w-10 h-10 text-white" aria-hidden="true" />
            </motion.div>

            {[0, 1, 2, 3, 4, 5].map((i) => (
              <motion.span
                key={i}
                initial={{ opacity: 0, scale: 0.4, x: 0, y: 0 }}
                animate={{
                  opacity: [1, 1, 0],
                  scale: [0.6, 1.1, 0.9],
                  x: Math.cos((i / 6) * Math.PI * 2) * 80,
                  y: Math.sin((i / 6) * Math.PI * 2) * 80,
                }}
                transition={{ duration: 1.4, delay: 0.1 + i * 0.05, ease: "easeOut" }}
                className="absolute top-[88px] left-1/2 -translate-x-1/2 text-2xl pointer-events-none"
                aria-hidden="true"
              >
                ✨
              </motion.span>
            ))}

            <h2 id="streak-celebration-title" className="text-xl font-bold text-foreground mb-2">
              {copy.title}
            </h2>
            <p className="text-sm text-muted-foreground mb-5">{copy.body}</p>
            <button
              onClick={onDismiss}
              className="w-full py-2.5 rounded-lg text-white text-sm font-bold"
              style={{ background: "#F06127" }}
            >
              Keep going
            </button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
