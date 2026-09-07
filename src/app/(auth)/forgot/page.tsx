import type { Metadata } from "next";
import RecoverForm from "@/components/RecoverForm";

export const metadata: Metadata = { title: "Recover your account" };

export default function ForgotPage() {
  return <RecoverForm />;
}
