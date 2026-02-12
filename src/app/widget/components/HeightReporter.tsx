"use client";

import { useEffect } from "react";

export function HeightReporter() {
  useEffect(() => {
    // Only send messages if we're inside an iframe
    if (window.self === window.top) return;

    function reportHeight() {
      const height = document.documentElement.scrollHeight;
      window.parent.postMessage(
        { type: "abeiku-resize", height },
        "*"
      );
    }

    // Report on initial render
    reportHeight();

    // Watch for size changes
    const observer = new ResizeObserver(reportHeight);
    observer.observe(document.body);

    return () => observer.disconnect();
  }, []);

  return null;
}
