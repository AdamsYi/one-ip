export type NavigationItem = { path: string; label: string };

export type NavigationMenus = Partial<
  Record<string, readonly NavigationItem[]>
>;
