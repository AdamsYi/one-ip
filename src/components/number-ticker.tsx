import { useLayoutEffect, useRef } from "react";
import { gsap } from "gsap";

const defaultFormat = (value: number) => value.toFixed(0);

export function NumberTicker({
  value,
  formatValue = defaultFormat,
  duration = 0.5,
  snap = 0.1,
  className,
}: {
  value: number;
  formatValue?: (value: number) => string;
  duration?: number;
  snap?: number;
  className?: string;
}) {
  const nodeRef = useRef<HTMLSpanElement>(null);
  const current = useRef({ value: Number.isFinite(value) ? value : 0 });
  useLayoutEffect(() => {
    const node = nodeRef.current;
    if (!node) return;
    const animated = current.current;
    const next = Number.isFinite(value) ? value : 0;
    const media = gsap.matchMedia();
    media.add(
      {
        reduced: "(prefers-reduced-motion: reduce)",
        normal: "(prefers-reduced-motion: no-preference)",
      },
      (context) => {
        const render = () => {
          node.textContent = formatValue(animated.value);
        };
        if (context.conditions?.reduced) {
          animated.value = next;
          render();
          return;
        }
        render();
        const tween = gsap.to(animated, {
          value: next,
          duration,
          ease: "power2.out",
          snap: { value: snap },
          onUpdate: render,
          onComplete: () => {
            animated.value = next;
            render();
          },
        });
        return () => {
          tween.kill();
        };
      },
    );
    return () => {
      const displayed = animated.value;
      media.revert();
      animated.value = displayed;
    };
  }, [value, formatValue, duration, snap]);
  return (
    <span ref={nodeRef} className={className}>
      {formatValue(Number.isFinite(value) ? value : 0)}
    </span>
  );
}
