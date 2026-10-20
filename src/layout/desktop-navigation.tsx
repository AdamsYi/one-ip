import { NavLink } from "react-router-dom";
import {
  NavigationMenu,
  NavigationMenuContent,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
  NavigationMenuTrigger,
} from "@/components/ui/navigation-menu";
import { t } from "@/i18n";
import { ArrowUpRight } from "lucide-react";
import type { NavigationMenus } from "./navigation-menus";
import { navigationRoutes } from "./routes";

export function DesktopNavigation({
  menus,
  activeRoute,
}: {
  menus: NavigationMenus;
  activeRoute: string;
}) {
  return (
    <NavigationMenu className="desktop-navigation" delayDuration={120}>
      <NavigationMenuList>
        {navigationRoutes.map((route) => {
          const items = menus[route.value];
          const overviewPath = route.value.replace(/\/$/, "") || "/";
          return (
            <NavigationMenuItem key={route.value} value={route.value}>
              {items ? (
                <>
                  <NavigationMenuTrigger
                    className="desktop-navigation-trigger"
                    data-current={
                      route.value === activeRoute ? "true" : undefined
                    }
                  >
                    {route.label}
                  </NavigationMenuTrigger>
                  <NavigationMenuContent>
                    <div className="desktop-navigation-panel">
                      <div className="desktop-navigation-overview">
                        <p>{route.label}</p>
                        <NavigationMenuLink asChild>
                          <NavLink to={overviewPath} end>
                            {t("navigation.overviewTab")}
                            <ArrowUpRight aria-hidden="true" />
                          </NavLink>
                        </NavigationMenuLink>
                      </div>
                      <ul className="desktop-navigation-links">
                        {items.map((item) => (
                          <li key={item.path}>
                            <NavigationMenuLink asChild>
                              <NavLink to={item.path}>{item.label}</NavLink>
                            </NavigationMenuLink>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </NavigationMenuContent>
                </>
              ) : (
                <NavigationMenuLink
                  asChild
                  className="desktop-navigation-trigger"
                >
                  <NavLink to={overviewPath} end={route.value === "/"}>
                    {route.label}
                  </NavLink>
                </NavigationMenuLink>
              )}
            </NavigationMenuItem>
          );
        })}
      </NavigationMenuList>
    </NavigationMenu>
  );
}
