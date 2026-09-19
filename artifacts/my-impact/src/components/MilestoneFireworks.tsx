import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";

interface MilestoneFireworksProps {
  badgeId: string;
  colour: string;
  children: ReactNode;
}

const PARTICLES = [
  { x: -42, y: -30, size: 5, delay: 0 },
  { x: -18, y: -45, size: 4, delay: 0.03 },
  { x: 18, y: -43, size: 5, delay: 0.06 },
  { x: 43, y: -25, size: 4, delay: 0.02 },
  { x: 47, y: 17, size: 5, delay: 0.08 },
  { x: 24, y: 36, size: 4, delay: 0.04 },
  { x: -24, y: 38, size: 5, delay: 0.07 },
  { x: -47, y: 15, size: 4, delay: 0.05 },
] as const;

const BURST_DURATION_MS = 850;

export function MilestoneFireworks({
  badgeId,
  colour,
  children,
}: MilestoneFireworksProps) {
  const reduceMotion = useReducedMotion();
  const [burstKey, setBurstKey] = useState(0);
  const [isBurstVisible, setIsBurstVisible] = useState(false);
  const isBurstingRef = useRef(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const celebrate = useCallback(() => {
    if (reduceMotion || isBurstingRef.current) return;
    isBurstingRef.current = true;
    setBurstKey((key) => key + 1);
    setIsBurstVisible(true);
    timeoutRef.current = setTimeout(() => {
      isBurstingRef.current = false;
      setIsBurstVisible(false);
      timeoutRef.current = null;
    }, BURST_DURATION_MS);
  }, [reduceMotion]);

  useEffect(() => () => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
  }, []);

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      className="relative isolate bg-white rounded-xl p-4 flex flex-col gap-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
      style={{ border: `2px solid ${colour}` }}
      tabIndex={0}
      data-testid={`card-earned-milestone-${badgeId}`}
      onPointerEnter={(event) => {
        if (event.pointerType === "mouse" || event.pointerType === "pen") celebrate();
      }}
      onFocus={celebrate}
    >
      <AnimatePresence>
        {isBurstVisible && !reduceMotion && (
          <motion.div
            key={burstKey}
            className="pointer-events-none absolute inset-1 z-0 overflow-hidden rounded-lg"
            aria-hidden="true"
            data-testid={`fireworks-${badgeId}`}
            initial={{ opacity: 1 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            {PARTICLES.map((particle, index) => (
              <motion.span
                key={index}
                className="absolute left-1/2 top-1/2 rounded-full"
                style={{
                  width: particle.size,
                  height: particle.size,
                  backgroundColor: index % 3 === 0 ? "var(--brand-orange-bright)" : colour,
                  boxShadow: `0 0 5px ${index % 3 === 0 ? "var(--brand-orange-bright)" : colour}`,
                }}
                initial={{ x: 0, y: 0, scale: 0, opacity: 0 }}
                animate={{
                  x: particle.x,
                  y: particle.y,
                  scale: [0, 1, 0.5],
                  opacity: [0, 0.85, 0],
                }}
                transition={{
                  duration: BURST_DURATION_MS / 1000,
                  delay: particle.delay,
                  ease: "easeOut",
                }}
              />
            ))}
          </motion.div>
        )}
      </AnimatePresence>
      <div className="relative z-10">{children}</div>
    </motion.div>
  );
}