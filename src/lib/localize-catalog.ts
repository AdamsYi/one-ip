import { isMessageKey, t } from "@/i18n";

export function localizeCatalogItem<
  T extends {
    name: string;
    nameKey?: string;
    note?: string;
    noteKey?: string;
  },
>(item: T) {
  return {
    ...item,
    name:
      item.nameKey && isMessageKey(item.nameKey) ? t(item.nameKey) : item.name,
    note:
      item.noteKey && isMessageKey(item.noteKey) ? t(item.noteKey) : item.note,
  };
}
