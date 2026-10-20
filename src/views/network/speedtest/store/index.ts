import { atom } from "jotai";
import { emptyResult } from "../api";

export const connectionsAtom = atom<1 | 4>(4);
export const resultAtom = atom(emptyResult());
export const speedProviderAtom = atom<"cloudflare" | "openspeedtest">(
  "cloudflare",
);
export const openSpeedtestPanelAtom = atom<
  "closed" | "loading" | "loaded" | "error"
>("closed");
