"use client";

import { useRouter, usePathname } from "next/navigation";
import { useEffect, useRef } from "react";

// 탭 순서
const TABS = [
  "/explore",
  "/chat",
  "/personality",
  "/mypage",
];

// 스와이프 적용할 경로 (정확히 이 경로들만)
const SWIPEABLE = ["/explore", "/chat", "/personality", "/mypage", "/team"];

export default function SwipeNav() {
  const router = useRouter();
  const pathname = usePathname();
  const touchStartX = useRef(0);
  const touchStartY = useRef(0);
  const touchStartTime = useRef(0);

  useEffect(() => {
    // 스와이프 가능한 페이지인지 확인
    const isSwipeable = SWIPEABLE.some(p => pathname === p || pathname?.startsWith(p + "/"));
    if (!isSwipeable) return;

    const currentIndex = TABS.findIndex(t => pathname === t || pathname?.startsWith(t));

    const onTouchStart = (e: TouchEvent) => {
      touchStartX.current = e.touches[0].clientX;
      touchStartY.current = e.touches[0].clientY;
      touchStartTime.current = Date.now();
    };

    const onTouchEnd = (e: TouchEvent) => {
      const dx = e.changedTouches[0].clientX - touchStartX.current;
      const dy = e.changedTouches[0].clientY - touchStartY.current;
      const dt = Date.now() - touchStartTime.current;

      if (Math.abs(dx) < 60) return;
      if (Math.abs(dy) > 80) return;
      if (dt > 400) return;
      if (currentIndex === -1) return;

      // 터치 시작점이 가로 스크롤 가능한 요소 안이면 무시
      const target = document.elementFromPoint(touchStartX.current, touchStartY.current);
      if (target) {
        let el: Element | null = target;
        while (el && el !== document.body) {
          const style = window.getComputedStyle(el);
          const ox = style.overflowX;
          if ((ox === "auto" || ox === "scroll") && el.scrollWidth > el.clientWidth + 4) {
            return;
          }
          el = el.parentElement;
        }
      }

      if (dx < 0 && currentIndex < TABS.length - 1) {
        router.push(TABS[currentIndex + 1]);
      } else if (dx > 0 && currentIndex > 0) {
        router.push(TABS[currentIndex - 1]);
      }
    };

    document.addEventListener("touchstart", onTouchStart, { passive: true });
    document.addEventListener("touchend", onTouchEnd, { passive: true });

    return () => {
      document.removeEventListener("touchstart", onTouchStart);
      document.removeEventListener("touchend", onTouchEnd);
    };
  }, [pathname, router]);

  return null;
}
