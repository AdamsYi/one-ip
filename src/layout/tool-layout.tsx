import { Outlet } from "react-router-dom";
import { PageHelpAlert } from "@/components/page-help-alert";

export function ToolLayout() {
  return (
    <>
      <PageHelpAlert />
      <Outlet />
    </>
  );
}
