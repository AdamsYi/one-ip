import { t } from "@/i18n";

export const siteCategories = [
  ["all", t("common.all")],
  ["ai", t("categories.ai")],
  ["crypto", t("categories.crypto")],
  ["ecommerce", t("categories.ecommerce")],
  ["media", t("categories.media")],
  ["social", t("categories.social")],
  ["dev", t("categories.development")],
  ["tools", t("categories.tools")],
  ["domestic", t("categories.domestic")],
  ["static", t("categories.static")],
  ["speed", t("categories.speed")],
] as const;

export const siteCategoryLabels: Record<string, string> =
  Object.fromEntries(siteCategories);
