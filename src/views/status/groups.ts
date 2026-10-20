import { t } from "@/i18n";

export const serviceGroups = [
  { value: "全部", label: t("common.all") },
  { value: "AI", label: "AI" },
  { value: "VPS", label: "VPS" },
  { value: "云服务", label: t("status.groups.cloud") },
  { value: "开发", label: t("status.groups.development") },
  { value: "社区", label: t("status.groups.community") },
];

export function serviceGroupLabel(value: string) {
  return serviceGroups.find((group) => group.value === value)?.label ?? value;
}
