import { useEffect, useRef, useState } from 'react';

/** Becomes true (once) when the element comes within `margin` of the viewport. */
export function useNearViewport<T extends Element>(margin = '600px') {
  const ref = useRef<T | null>(null);
  const [isNear, setIsNear] = useState(false);
  useEffect(() => {
    const element = ref.current;
    if (!element || isNear) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) setIsNear(true);
      },
      { rootMargin: margin },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [isNear, margin]);
  return { ref, isNear };
}
