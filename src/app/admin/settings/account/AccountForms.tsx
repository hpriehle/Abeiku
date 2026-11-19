"use client";

import { useState } from "react";
import { apiRequest } from "@/lib/admin/api-client";
import { FormStatus, type FormMessage } from "../../useAdminAction";

const MIN_LENGTH = 8;

function ChangeEmailForm({ email, emailVerified }: { email: string; emailVerified: boolean }) {
  const [newEmail, setNewEmail] = useState("");
  const [password, setPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<FormMessage>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (saving) return;
    setSaving(true);
    setMsg(null);
    try {
      const r = await apiRequest<{ message: string }>("/api/admin/account/email", {
        method: "POST",
        json: { newEmail, currentPassword: password },
        fallbackError: "We couldn't send the link. Please try again.",
      });
      if (r.ok) {
        setMsg({ kind: "ok", text: r.data.message });
        setPassword("");
      } else {
        setMsg({ kind: "error", text: r.error });
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="admin-card">
      <h3 className="text-lg font-semibold text-gray-900 mb-1">Login email</h3>
      <p className="text-sm text-gray-600 mb-4">
        You sign in with <strong>{email}</strong>
        {emailVerified ? "." : " (not confirmed yet)."} To change it, we send a link to the new address. It changes only
        when you open that link, and we let the old address know.
      </p>
      <form onSubmit={submit} className="space-y-4">
        <div>
          <label htmlFor="account-new-email" className="admin-label">New email</label>
          <input
            id="account-new-email"
            type="email"
            autoComplete="email"
            required
            value={newEmail}
            onChange={(e) => setNewEmail(e.target.value)}
            className="admin-input"
          />
        </div>
        <div>
          <label htmlFor="account-email-password" className="admin-label">Your current password</label>
          <input
            id="account-email-password"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="admin-input"
          />
        </div>
        <div className="flex items-center gap-3">
          <button type="submit" disabled={saving} className="admin-btn-primary">
            {saving ? "Sending..." : "Send confirm link"}
          </button>
          <FormStatus message={msg} />
        </div>
      </form>
    </div>
  );
}

function ChangePasswordForm() {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<FormMessage>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (saving) return;
    if (next.length < MIN_LENGTH) return setMsg({ kind: "error", text: `Use at least ${MIN_LENGTH} characters.` });
    if (next !== confirm) return setMsg({ kind: "error", text: "The two new passwords don't match." });
    setSaving(true);
    setMsg(null);
    try {
      const r = await apiRequest("/api/admin/account/password", {
        method: "POST",
        json: { currentPassword: current, newPassword: next },
        fallbackError: "We couldn't change your password. Please try again.",
      });
      if (r.ok) {
        setMsg({ kind: "ok", text: "Password changed. You're signed out everywhere else." });
        setCurrent("");
        setNext("");
        setConfirm("");
      } else {
        setMsg({ kind: "error", text: r.error });
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="admin-card">
      <h3 className="text-lg font-semibold text-gray-900 mb-1">Password</h3>
      <p className="text-sm text-gray-600 mb-4">
        Changing it signs you out on every other phone and computer. This one stays signed in.
      </p>
      <form onSubmit={submit} className="space-y-4">
        <div>
          <label htmlFor="account-current-password" className="admin-label">Current password</label>
          <input
            id="account-current-password"
            type="password"
            autoComplete="current-password"
            required
            value={current}
            onChange={(e) => setCurrent(e.target.value)}
            className="admin-input"
          />
        </div>
        <div>
          <label htmlFor="account-new-password" className="admin-label">New password</label>
          <input
            id="account-new-password"
            type="password"
            autoComplete="new-password"
            required
            minLength={MIN_LENGTH}
            value={next}
            onChange={(e) => setNext(e.target.value)}
            className="admin-input"
          />
          <p className="text-xs text-gray-500 mt-1">At least {MIN_LENGTH} characters.</p>
        </div>
        <div>
          <label htmlFor="account-confirm-password" className="admin-label">Type it again</label>
          <input
            id="account-confirm-password"
            type="password"
            autoComplete="new-password"
            required
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            className="admin-input"
          />
        </div>
        <div className="flex items-center gap-3">
          <button type="submit" disabled={saving} className="admin-btn-primary">
            {saving ? "Saving..." : "Change password"}
          </button>
          <FormStatus message={msg} />
        </div>
      </form>
    </div>
  );
}

export function AccountForms({ email, emailVerified }: { email: string; emailVerified: boolean }) {
  return (
    <div className="space-y-6">
      <ChangeEmailForm email={email} emailVerified={emailVerified} />
      <ChangePasswordForm />
    </div>
  );
}
