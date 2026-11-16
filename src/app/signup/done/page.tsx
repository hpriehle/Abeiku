import type { Metadata } from "next";
import { DoneClient } from "./DoneClient";

export const metadata: Metadata = { title: "Free trial | Abeiku" };

export default function DonePage() {
  return <DoneClient />;
}
