import type { Metadata } from "next";
import { UserRound } from "lucide-react";
import { redirect } from "next/navigation";
import Link from "next/link";
import { readSession } from "@/lib/admin/auth";
import { AccountForms } from "./AccountForms";

export const metadata: Metadata = { title: "Account" };

export default async function AccountPage() {
  const read = await readSession();
  if (!read.session) redirect("/admin/login");

  return (
    <div className="admin-page-narrow">
      <Link href="/admin/settings" className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-4">
        &larr; Back to Settings
      </Link>

      <div className="flex items-center gap-3 mb-6">
        <UserRound className="size-8 text-[#2D4A3E] shrink-0" aria-hidden="true" />
        <div>
          <h1 className="admin-h1">Account</h1>
          <p className="text-sm text-gray-500 mt-0.5">The email and password you sign in with.</p>
        </div>
      </div>

      <AccountForms email={read.session.email} emailVerified={read.emailVerified !== false} />
    </div>
  );
}
