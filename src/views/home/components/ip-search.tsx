import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@/components/ui/input-group";
import { t } from "@/i18n";
import { ArrowRight, Search } from "lucide-react";

export function IpSearch() {
  const navigate = useNavigate();
  const [ip, setIp] = useState("");
  return (
    <form
      className="home-ip-search"
      onSubmit={(event) => {
        event.preventDefault();
        const value = ip.trim();
        if (value) navigate(`/network/ip/${encodeURIComponent(value)}`);
      }}
    >
      <InputGroup>
        <InputGroupAddon>
          <Search aria-hidden="true" />
        </InputGroupAddon>
        <InputGroupInput
          aria-label={t("home.enterIp")}
          autoCapitalize="none"
          autoCorrect="off"
          placeholder={t("home.enterIp")}
          spellCheck={false}
          value={ip}
          onChange={(event) => setIp(event.target.value)}
        />
        <InputGroupAddon align="inline-end">
          <InputGroupButton
            type="submit"
            size="icon-xs"
            aria-label={t("common.lookup")}
            title={t("common.lookup")}
            disabled={!ip.trim()}
          >
            <ArrowRight aria-hidden="true" />
          </InputGroupButton>
        </InputGroupAddon>
      </InputGroup>
    </form>
  );
}
