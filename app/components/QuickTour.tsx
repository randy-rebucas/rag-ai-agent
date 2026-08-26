import { useCallback, useEffect, useRef, useState } from "react";

export type TourStep = {
  selector: string;
  title: string;
  body: string;
};

const TOUR_SEEN_KEY = "rag-ai-agent:tourSeen";
const HIGHLIGHT_PADDING = 8;
const CARD_WIDTH = 320;
const CARD_MARGIN = 16;

type Rect = { top: number; left: number; width: number; height: number };

function rectFromElement(el: Element): Rect {
  const r = el.getBoundingClientRect();
  return { top: r.top, left: r.left, width: r.width, height: r.height };
}

function buildClipPath(rect: Rect | null): string {
  if (!rect) return "polygon(0 0, 100% 0, 100% 100%, 0 100%)";
  const top = Math.max(rect.top - HIGHLIGHT_PADDING, 0);
  const left = Math.max(rect.left - HIGHLIGHT_PADDING, 0);
  const right = rect.left + rect.width + HIGHLIGHT_PADDING;
  const bottom = rect.top + rect.height + HIGHLIGHT_PADDING;
  return (
    `polygon(evenodd, 0px 0px, 100% 0px, 100% 100%, 0px 100%, 0px 0px, ` +
    `${left}px ${top}px, ${left}px ${bottom}px, ${right}px ${bottom}px, ${right}px ${top}px, ${left}px ${top}px)`
  );
}

/** Whether the merchant has already seen the tour (checked before auto-starting it on mount). */
export function hasSeenTour(): boolean {
  try {
    return window.localStorage.getItem(TOUR_SEEN_KEY) === "true";
  } catch {
    return false;
  }
}

function markTourSeen() {
  try {
    window.localStorage.setItem(TOUR_SEEN_KEY, "true");
  } catch {
    // Storage unavailable — the tour will just replay next time, harmless.
  }
}

export function QuickTour({
  steps,
  active,
  onFinish,
}: {
  steps: TourStep[];
  active: boolean;
  onFinish: () => void;
}) {
  const [stepIndex, setStepIndex] = useState(0);
  const [rect, setRect] = useState<Rect | null>(null);
  const cardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (active) setStepIndex(0);
  }, [active]);

  // Just re-measures the current target — never scrolls. Used for resize/scroll
  // listeners, which would otherwise re-trigger scrollIntoView and loop forever.
  const measure = useCallback(() => {
    if (!active) return;
    const step = steps[stepIndex];
    if (!step) return;
    const el = document.querySelector(step.selector);
    setRect(el ? rectFromElement(el) : null);
  }, [active, stepIndex, steps]);

  // Scrolls the new step's target into view once, then re-measures a few
  // times while the smooth scroll (and any custom-element layout) settles.
  useEffect(() => {
    if (!active) return;
    const step = steps[stepIndex];
    if (!step) return;

    const el = document.querySelector(step.selector);
    el?.scrollIntoView({ block: "center", behavior: "smooth" });

    const timeouts = [0, 150, 350, 600].map((delay) =>
      setTimeout(() => {
        const target = document.querySelector(step.selector);
        setRect(target ? rectFromElement(target) : null);
      }, delay),
    );
    return () => timeouts.forEach(clearTimeout);
  }, [active, stepIndex, steps]);

  useEffect(() => {
    if (!active) return;
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    return () => {
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
    };
  }, [active, measure]);

  const finish = useCallback(() => {
    markTourSeen();
    onFinish();
  }, [onFinish]);

  if (!active) return null;

  const step = steps[stepIndex];
  if (!step) return null;

  const isLast = stepIndex === steps.length - 1;

  const cardTop = rect
    ? rect.top > window.innerHeight / 2
      ? Math.max(rect.top - HIGHLIGHT_PADDING - 12 - 180, CARD_MARGIN)
      : rect.top + rect.height + HIGHLIGHT_PADDING + 12
    : window.innerHeight / 2 - 90;
  const cardLeft = rect
    ? Math.min(Math.max(rect.left, CARD_MARGIN), window.innerWidth - CARD_WIDTH - CARD_MARGIN)
    : window.innerWidth / 2 - CARD_WIDTH / 2;

  return (
    <>
      <div
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 9999,
          background: "rgba(15, 17, 20, 0.6)",
          clipPath: buildClipPath(rect),
          transition: "clip-path 200ms ease-out",
        }}
        onClick={finish}
      />
      {rect && (
        <div
          style={{
            position: "fixed",
            top: rect.top - HIGHLIGHT_PADDING,
            left: rect.left - HIGHLIGHT_PADDING,
            width: rect.width + HIGHLIGHT_PADDING * 2,
            height: rect.height + HIGHLIGHT_PADDING * 2,
            borderRadius: "10px",
            boxShadow: "0 0 0 2px var(--p-color-border-focus, #2c6ecb)",
            zIndex: 10000,
            pointerEvents: "none",
            transition: "top 200ms ease-out, left 200ms ease-out, width 200ms ease-out, height 200ms ease-out",
          }}
        />
      )}
      <div
        ref={cardRef}
        style={{
          position: "fixed",
          top: cardTop,
          left: cardLeft,
          width: CARD_WIDTH,
          zIndex: 10001,
        }}
      >
        <s-box padding="base" borderWidth="base" borderRadius="base" background="strong">
          <s-stack direction="block" gap="small-300">
            <s-text type="strong">{step.title}</s-text>
            <s-text tone="neutral">{step.body}</s-text>
            <s-stack direction="inline" justifyContent="space-between" alignItems="center">
              <s-stack direction="inline" gap="small-100" alignItems="center">
                {steps.map((_, i) => (
                  <div
                    key={i}
                    style={{
                      width: "6px",
                      height: "6px",
                      borderRadius: "999px",
                      background:
                        i === stepIndex
                          ? "var(--p-color-bg-fill-info, #2c6ecb)"
                          : "var(--p-color-bg-fill-secondary, #d3d3d3)",
                    }}
                  />
                ))}
              </s-stack>
              <s-stack direction="inline" gap="small-100">
                <s-button variant="tertiary" onClick={finish}>
                  Skip
                </s-button>
                {stepIndex > 0 && (
                  <s-button variant="tertiary" onClick={() => setStepIndex((i) => i - 1)}>
                    Back
                  </s-button>
                )}
                <s-button variant="primary" onClick={() => (isLast ? finish() : setStepIndex((i) => i + 1))}>
                  {isLast ? "Done" : "Next"}
                </s-button>
              </s-stack>
            </s-stack>
          </s-stack>
        </s-box>
      </div>
    </>
  );
}
