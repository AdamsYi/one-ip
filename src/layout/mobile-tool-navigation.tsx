import { useEffect, useRef } from "react";
import { Link, NavLink, useLocation } from "react-router-dom";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { UnderlineHover } from "@/components/underline-hover";
import { t } from "@/i18n";
import type { NavigationItem } from "./navigation-menus";

export function MobileToolNavigation({
  label,
  overviewPath,
  items,
}: {
  label: string;
  overviewPath: string;
  items: readonly NavigationItem[];
}) {
  const { pathname } = useLocation();
  const navRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const viewport = navRef.current?.querySelector<HTMLElement>(
      "[data-slot=scroll-area-viewport]",
    );
    const selected = navRef.current?.querySelector<HTMLElement>(
      '[aria-current="page"]',
    );
    if (!viewport || !selected) return;
    const parent = viewport.getBoundingClientRect();
    const child = selected.getBoundingClientRect();
    const offset =
      child.left < parent.left
        ? child.left - parent.left - 8
        : child.right > parent.right
          ? child.right - parent.right + 8
          : 0;
    if (offset) viewport.scrollBy({ left: offset, behavior: "instant" });
  }, [pathname, items]);

  return (
    <nav ref={navRef} className="mobile-tool-navigation" aria-label={label}>
      <ScrollArea>
        <div className="mobile-tool-navigation-links">
          <UnderlineHover asChild>
            <Link
              to={overviewPath}
              aria-current={
                pathname.replace(/\/+$/, "") === overviewPath
                  ? "page"
                  : undefined
              }
            >
              {t("navigation.overviewTab")}
            </Link>
          </UnderlineHover>
          {items.map((item) => (
            <UnderlineHover key={item.path} asChild>
              <NavLink to={item.path}>{item.label}</NavLink>
            </UnderlineHover>
          ))}
        </div>
        <ScrollBar orientation="horizontal" />
      </ScrollArea>
    </nav>
  );
}
