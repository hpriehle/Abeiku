"use client";

import { useCallback, useRef, useState } from "react";
import { singleFlight, type ApiResult } from "@/lib/admin/api-client";

/**
 * Runs one admin action at a time. `pending` holds the key of the running
 * action (for button labels), `error` the friendly message of the last failure.
 * A second call while one is running is ignored (no double submits).
 */
export function useAdminAction() {
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const flight = useRef(singleFlight());

  const run = useCallback(
    async <T,>(key: string, fn: () => Promise<ApiResult<T>>): Promise<ApiResult<T> | null> => {
      return flight.current(async () => {
        setPending(key);
        setError(null);
        try {
          const result = await fn();
          if (!result.ok) setError(result.error);
          return result;
        } finally {
          setPending(null);
        }
      });
    },
    []
  );

  return { pending, busy: pending !== null, error, setError, run };
}

/** Red notice used for failed admin actions. Announced to screen readers. */
export function ErrorNotice({
  message,
  onDismiss,
  className = "",
}: {
  message: string | null | undefined;
  onDismiss?: () => void;
  className?: string;
}) {
  if (!message) return null;
  return (
    <div role="alert" className={`admin-error ${className}`}>
      <span className="flex-1">{message}</span>
      {onDismiss && (
        <button type="button" onClick={onDismiss} aria-label="Dismiss message" className="admin-error-dismiss">
          &times;
        </button>
      )}
    </div>
  );
}

export type FormMessage = { kind: "ok" | "error"; text: string } | null;

/** Inline result of a form save: green "saved" text or a red error. */
export function FormStatus({ message }: { message: FormMessage }) {
  if (!message) return null;
  return message.kind === "ok" ? (
    <span role="status" className="text-sm text-green-700">
      {message.text}
    </span>
  ) : (
    <span role="alert" className="text-sm text-red-700">
      {message.text}
    </span>
  );
}
