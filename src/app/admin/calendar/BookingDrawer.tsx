"use client";

import { useEffect, useRef } from "react";
import { Mail, MessageCircle, Phone, X } from "lucide-react";
import { stayPaymentStatus, stayTotal, type Stay } from "@/lib/bookings/calendar-view";
import { fmtDay, fmtMoney, nightsLabel, roomsLabel, SourceBadge } from "./parts";

interface Props {
  stay: Stay;
  totalRooms: number;
  currency: string;
  onClose: () => void;
  /** Opens the existing booking actions (only offered for WhatsApp / manual bookings). */
  onEdit: (bookingId: string) => void;
}

function fmtWhen(iso: string | null | undefined) {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[7.5rem_1fr] gap-2 py-2">
      <dt className="text-sm text-gray-600">{label}</dt>
      <dd className="min-w-0 text-sm text-gray-900">{children}</dd>
    </div>
  );
}

/** Read-only booking details. A side panel on wide screens, a bottom sheet on a phone. */
export function BookingDrawer({ stay, totalRooms, currency, onClose, onEdit }: Props) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const first = stay.rows[0];
  const cur = first.currency || currency;
  const total = stayTotal(stay);
  const payment = stayPaymentStatus(stay);
  const phone = stay.rows.map((r) => r.phone).find(Boolean) ?? null;
  const email = stay.rows.map((r) => r.guest_email).find(Boolean) ?? null;
  const guests = stay.rows.map((r) => r.guests).find((g) => g != null) ?? null;
  const refCode = stay.rows.map((r) => r.ref_code).find(Boolean) ?? null;
  const paidAt = stay.rows.map((r) => r.paid_at).find(Boolean) ?? null;
  const createdAt = stay.rows.map((r) => r.created_at).filter(Boolean).sort()[0] ?? null;
  const waDigits = phone ? phone.replace(/[^\d]/g, "") : "";
  const priceUnknown = total === 0 && ["airbnb", "vrbo", "booking_com", "google"].includes(stay.source.kind);

  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "Tab" && panelRef.current) {
        // Keep focus inside the drawer.
        const f = panelRef.current.querySelectorAll<HTMLElement>("a[href], button:not([disabled])");
        if (!f.length) return;
        const firstEl = f[0];
        const lastEl = f[f.length - 1];
        if (e.shiftKey && document.activeElement === firstEl) {
          e.preventDefault();
          lastEl.focus();
        } else if (!e.shiftKey && document.activeElement === lastEl) {
          e.preventDefault();
          firstEl.focus();
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      opener?.focus?.();
    };
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50">
      <button type="button" aria-label="Close booking details" tabIndex={-1} onClick={onClose} className="absolute inset-0 h-full w-full cursor-default bg-black/40" />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="drawer-title"
        className="absolute inset-x-0 bottom-0 max-h-[88vh] overflow-y-auto rounded-t-2xl bg-white shadow-xl sm:inset-y-0 sm:left-auto sm:right-0 sm:max-h-none sm:w-[26rem] sm:rounded-none"
      >
        <div className="sticky top-0 z-10 flex items-start gap-3 border-b border-gray-200 bg-white px-4 py-3 sm:px-5">
          <div className="min-w-0 flex-1">
            <h2 id="drawer-title" className={`truncate text-lg font-semibold text-gray-900 ${stay.cancelled ? "line-through" : ""}`}>
              {stay.guest_name || "No name"}
            </h2>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <SourceBadge source={stay.source} />
              {stay.cancelled && <span className="rounded-full bg-red-50 px-2 py-0.5 text-xs font-medium text-red-800">Cancelled</span>}
              {!stay.cancelled && first.booking_status !== "confirmed" && (
                <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-800">{first.booking_status.replace("_", " ")}</span>
              )}
            </div>
          </div>
          <button ref={closeRef} type="button" onClick={onClose} aria-label="Close" className="admin-btn admin-btn-ghost -mr-2 size-11 p-0">
            <X className="size-5" aria-hidden="true" />
          </button>
        </div>

        <div className="px-4 pb-6 sm:px-5">
          {stay.source.imported ? (
            <p className="mt-4 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-800">
              Read-only: this booking came from {stay.source.label}. Edit this in {stay.source.editIn}; Abeiku picks up the change on the next sync (every 15 minutes).
            </p>
          ) : null}

          {stay.rows.length > 1 && (
            <p className="mt-3 text-sm text-gray-700">
              Shown as one stay: {stay.rows.length} one-night entries in {stay.source.label}.
            </p>
          )}

          <dl className="mt-2 divide-y divide-gray-100">
            <Row label="Dates">
              {fmtDay(stay.check_in, { weekday: "short", day: "numeric", month: "short", year: "numeric" })} →{" "}
              {fmtDay(stay.check_out, { weekday: "short", day: "numeric", month: "short", year: "numeric" })}
            </Row>
            <Row label="Nights">{nightsLabel(stay.nights)}</Row>
            <Row label="Rooms">{roomsLabel(stay.rooms_count, totalRooms)}</Row>
            <Row label="Guests">{guests ?? "Not known"}</Row>
            <Row label="Amount">
              {priceUnknown ? `Not known (${stay.source.label} doesn't share it)` : fmtMoney(total, cur)}
              {!priceUnknown && <span className="ml-2 text-gray-700">· {payment}</span>}
            </Row>
            {refCode && <Row label="Partner code">{refCode}</Row>}
            {first.external_ref && stay.source.kind !== "google" && (
              <Row label="Reference">
                <span className="break-all">{first.external_ref}</span>
              </Row>
            )}
            <Row label="Came in">{fmtWhen(createdAt) ?? "Not known"}</Row>
            {paidAt && <Row label="Paid">{fmtWhen(paidAt)}</Row>}
            <Row label="Email">
              {email ? (
                <a className="inline-flex items-center gap-1.5 break-all text-[#1d4ed8] underline" href={`mailto:${email}`}>
                  <Mail className="size-4 shrink-0" aria-hidden="true" />
                  {email}
                </a>
              ) : (
                "Not known"
              )}
            </Row>
            <Row label="Phone">
              {phone ? (
                <div className="flex flex-col gap-2">
                  <span>{phone}</span>
                  <div className="flex flex-wrap gap-2">
                    <a className="admin-btn admin-btn-secondary" href={`tel:${phone.replace(/[^\d+]/g, "")}`}>
                      <Phone className="size-4" aria-hidden="true" /> Call
                    </a>
                    {waDigits && (
                      <a className="admin-btn admin-btn-secondary" href={`https://wa.me/${waDigits}`} target="_blank" rel="noopener noreferrer">
                        <MessageCircle className="size-4" aria-hidden="true" /> WhatsApp
                      </a>
                    )}
                  </div>
                </div>
              ) : (
                "Not known"
              )}
            </Row>
          </dl>

          {stay.rows.length > 1 && (
            <details className="mt-3 text-sm">
              <summary className="cursor-pointer py-2 text-gray-800">The {stay.rows.length} entries</summary>
              <ul className="mt-1 space-y-1 text-gray-700">
                {stay.rows.map((r) => (
                  <li key={r.id}>
                    {fmtDay(r.check_in)} → {fmtDay(r.check_out)} · {Number(r.total_price) ? fmtMoney(Number(r.total_price), r.currency || cur) : "no price"} · {r.payment_status}
                  </li>
                ))}
              </ul>
            </details>
          )}

          {!stay.source.imported && (
            <div className="mt-5">
              <button type="button" className="admin-btn admin-btn-primary w-full" onClick={() => onEdit(first.id)}>
                Check in, change dates or payment
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
