import { Component, type PropsWithChildren } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { t } from "@/i18n";

export class RouteErrorBoundary extends Component<
  PropsWithChildren,
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <Alert variant="destructive">
        <AlertTitle>{t("common.loadFailed")}</AlertTitle>
        <AlertDescription>
          <p>{t("navigation.pageCouldDisplayedRefreshPageTryAgain")}</p>
          <Button variant="outline" onClick={() => window.location.reload()}>
            {t("common.refreshPage")}
          </Button>
        </AlertDescription>
      </Alert>
    );
  }
}
