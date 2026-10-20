import { useEffect, useState } from "react";
import { t } from "@/i18n";
import { Check, Copy } from "lucide-react";
import { toast } from "sonner";
import { Button } from "./ui/button";

type CopyButtonProps = {
  value: string;
  className?: string;
};

export function CopyButton({ value, className }: CopyButtonProps) {
  const [copyState, setCopyState] = useState({ value, copied: false });
  if (copyState.value !== value) setCopyState({ value, copied: false });
  const copied = copyState.value === value && copyState.copied;
  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => {
      setCopyState((previous) =>
        previous === copyState ? { ...previous, copied: false } : previous,
      );
    }, 2000);
    return () => clearTimeout(timer);
  }, [copied, copyState]);
  const label = copied ? t("common.copied") : t("common.copy");
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-sm"
      className={className}
      aria-label={label}
      title={label}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setCopyState((previous) =>
            previous === copyState ? { value, copied: true } : previous,
          );
        } catch {
          toast.error(
            t("common.couldCopyAutomaticallySelectPressHoldLinkCopy"),
          );
        }
      }}
    >
      {copied ? (
        <Check className="size-3.5" aria-hidden="true" />
      ) : (
        <Copy className="size-3.5" aria-hidden="true" />
      )}
      <span className="sr-only" role="status">
        {copied ? label : ""}
      </span>
    </Button>
  );
}
