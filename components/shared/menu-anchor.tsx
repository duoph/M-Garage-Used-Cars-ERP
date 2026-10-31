"use client";
import * as React from "react";

export interface MenuBox {
  top?: number;
  bottom?: number;
  left: number;
  width: number;
}

/** Places a portaled menu under the field, or above it when the field sits near the bottom of the screen. */
export function useMenuAnchor(open: boolean, rootRef: React.RefObject<HTMLElement | null>): MenuBox | null {
  const [box, setBox] = React.useState<MenuBox | null>(null);

  React.useLayoutEffect(() => {
    if (!open) return;
    const update = () => {
      const rect = rootRef.current?.getBoundingClientRect();
      if (!rect) {
        setBox(null);
        return;
      }
      const spaceBelow = window.innerHeight - rect.bottom;
      const openUp = spaceBelow < 220 && rect.top > spaceBelow;
      setBox(
        openUp
          ? { bottom: window.innerHeight - rect.top + 4, left: rect.left, width: rect.width }
          : { top: rect.bottom + 4, left: rect.left, width: rect.width },
      );
    };
    update();
    window.addEventListener("scroll", update, true);
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("scroll", update, true);
      window.removeEventListener("resize", update);
    };
  }, [open, rootRef]);

  return box;
}
