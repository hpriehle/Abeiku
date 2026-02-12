"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";

const inputClass =
  "w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#2D4A3E] focus:border-transparent";

type Step =
  | "idle"
  | "validating"
  | "account_valid"
  | "sending"
  | "awaiting_confirmation"
  | "confirming"
  | "verified";

interface MoMoVerificationWizardProps {
  initialPhone: string | null;
  isVerified: boolean;
  hasPendingVerification: boolean;
  verificationSentAt: string | null;
  currency: string;
  feeLabel: string | null;
  onVerified?: () => void;
}

export function MoMoVerificationWizard({
  initialPhone,
  isVerified,
  hasPendingVerification,
  verificationSentAt,
  currency,
  feeLabel,
  onVerified,
}: MoMoVerificationWizardProps) {
  const router = useRouter();

  // Phone input: 9 digits (without 233 prefix)
  const [phoneDigits, setPhoneDigits] = useState(() => {
    if (initialPhone?.startsWith("233")) return initialPhone.slice(3);
    return "";
  });
  const [step, setStep] = useState<Step>(() => {
    if (isVerified) return "verified";
    if (hasPendingVerification) return "awaiting_confirmation";
    return "idle";
  });
  const [error, setError] = useState("");
  const [amountInput, setAmountInput] = useState("");

  // Countdown timer for expiry
  const [minutesLeft, setMinutesLeft] = useState<number | null>(null);

  useEffect(() => {
    if (step !== "awaiting_confirmation" || !verificationSentAt) {
      setMinutesLeft(null);
      return;
    }
    function updateTimer() {
      const sentAt = new Date(verificationSentAt!).getTime();
      const remaining = Math.max(0, 30 - (Date.now() - sentAt) / (1000 * 60));
      setMinutesLeft(Math.ceil(remaining));
      if (remaining <= 0) {
        setStep("idle");
        setError("Verification expired. Please try again.");
      }
    }
    updateTimer();
    const interval = setInterval(updateTimer, 30000);
    return () => clearInterval(interval);
  }, [step, verificationSentAt]);

  const fullPhone = `233${phoneDigits}`;
  const phoneValid = /^[0-9]{9}$/.test(phoneDigits);

  async function handleValidate() {
    setError("");
    setStep("validating");
    try {
      const res = await fetch("/api/admin/momo/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: fullPhone }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Validation failed");
        setStep("idle");
        return;
      }
      if (!data.active) {
        setError("This number does not have an active MoMo account. Check the number and try again.");
        setStep("idle");
        return;
      }
      setStep("account_valid");
    } catch {
      setError("Unable to reach MoMo. Try again.");
      setStep("idle");
    }
  }

  async function handleSendVerification() {
    setError("");
    setStep("sending");
    try {
      const res = await fetch("/api/admin/momo/send-verification", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: fullPhone }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to send verification");
        setStep("account_valid");
        return;
      }
      setStep("awaiting_confirmation");
      // Start expiry timer from now
      setMinutesLeft(30);
    } catch {
      setError("Failed to send. Try again.");
      setStep("account_valid");
    }
  }

  async function handleConfirm() {
    setError("");
    setStep("confirming");
    try {
      const res = await fetch("/api/admin/momo/confirm-verification", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount: amountInput }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Verification failed");
        setStep(res.status === 410 ? "idle" : "awaiting_confirmation");
        return;
      }
      if (data.verified) {
        setStep("verified");
        onVerified?.();
        router.refresh();
      } else {
        setError(data.error || "Incorrect amount. Try again.");
        setStep("awaiting_confirmation");
      }
    } catch {
      setError("Verification failed. Try again.");
      setStep("awaiting_confirmation");
    }
  }

  function handleChangeNumber() {
    setStep("idle");
    setPhoneDigits("");
    setAmountInput("");
    setError("");
  }

  const displayPhone = phoneDigits
    ? `0${phoneDigits.slice(0, 2)} ${phoneDigits.slice(2, 5)} ${phoneDigits.slice(5)}`
    : "";

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
      <h3 className="text-lg font-semibold text-gray-900 mb-1">MoMo Payout Verification</h3>
      <p className="text-sm text-gray-500 mb-4">
        Verify your MoMo number to receive guest payment disbursements.
        {feeLabel && (
          <>
            {" "}Platform service fee: <strong>{feeLabel}</strong>
          </>
        )}
      </p>

      {error && (
        <div className="bg-red-50 border border-red-100 text-red-700 text-sm rounded-lg px-4 py-3 mb-4">
          {error}
        </div>
      )}

      {/* Step 1: Phone input */}
      {(step === "idle" || step === "validating") && (
        <div className="space-y-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">MoMo Phone Number</label>
            <div className="flex gap-2">
              <span className="inline-flex items-center px-3 bg-gray-50 border border-gray-300 rounded-lg text-sm text-gray-500">
                +233
              </span>
              <input
                type="tel"
                value={phoneDigits}
                onChange={(e) => {
                  const digits = e.target.value.replace(/\D/g, "").slice(0, 9);
                  setPhoneDigits(digits);
                }}
                placeholder="551234567"
                className={inputClass}
                maxLength={9}
                disabled={step === "validating"}
              />
            </div>
            <p className="text-xs text-gray-400 mt-1">Enter your 9-digit MoMo number (without country code)</p>
          </div>
          <button
            onClick={handleValidate}
            disabled={!phoneValid || step === "validating"}
            className="px-5 py-2 bg-[#2D4A3E] text-white rounded-lg text-sm font-medium hover:bg-[#1E3329] transition-colors disabled:opacity-50"
          >
            {step === "validating" ? "Validating..." : "Validate Number"}
          </button>
        </div>
      )}

      {/* Step 2: Account valid — send test payment */}
      {(step === "account_valid" || step === "sending") && (
        <div className="space-y-3">
          <div className="flex items-center gap-2 bg-green-50 border border-green-100 rounded-lg px-4 py-3">
            <span className="text-green-600 text-lg">&#10003;</span>
            <div>
              <p className="text-sm font-medium text-green-800">Active MoMo account found</p>
              <p className="text-xs text-green-600">{displayPhone}</p>
            </div>
          </div>
          <p className="text-sm text-gray-600">
            We&apos;ll send a small amount ({currency}) to this number. You&apos;ll need to enter the exact amount to verify ownership.
          </p>
          <div className="flex gap-3">
            <button
              onClick={handleSendVerification}
              disabled={step === "sending"}
              className="px-5 py-2 bg-[#2D4A3E] text-white rounded-lg text-sm font-medium hover:bg-[#1E3329] transition-colors disabled:opacity-50"
            >
              {step === "sending" ? "Sending..." : "Send Test Payment"}
            </button>
            <button
              onClick={handleChangeNumber}
              disabled={step === "sending"}
              className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg text-sm hover:bg-gray-50 transition-colors disabled:opacity-50"
            >
              Change Number
            </button>
          </div>
        </div>
      )}

      {/* Step 3: Awaiting confirmation */}
      {(step === "awaiting_confirmation" || step === "confirming") && (
        <div className="space-y-3">
          <div className="bg-blue-50 border border-blue-100 rounded-lg px-4 py-3">
            <p className="text-sm font-medium text-blue-800">
              We sent a small amount to {displayPhone || `+${initialPhone}`}
            </p>
            <p className="text-xs text-blue-600 mt-1">
              Check your MoMo balance or transaction notifications.
              {minutesLeft != null && minutesLeft > 0 && (
                <> Expires in {minutesLeft} minute{minutesLeft !== 1 ? "s" : ""}.</>
              )}
            </p>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Enter the exact amount you received
            </label>
            <div className="flex gap-2">
              <span className="inline-flex items-center px-3 bg-gray-50 border border-gray-300 rounded-lg text-sm text-gray-500">
                {currency}
              </span>
              <input
                type="text"
                inputMode="decimal"
                value={amountInput}
                onChange={(e) => {
                  const val = e.target.value.replace(/[^0-9.]/g, "");
                  setAmountInput(val);
                }}
                placeholder="1.37"
                className={inputClass}
                disabled={step === "confirming"}
              />
            </div>
          </div>
          <div className="flex gap-3">
            <button
              onClick={handleConfirm}
              disabled={!amountInput || step === "confirming"}
              className="px-5 py-2 bg-[#2D4A3E] text-white rounded-lg text-sm font-medium hover:bg-[#1E3329] transition-colors disabled:opacity-50"
            >
              {step === "confirming" ? "Verifying..." : "Verify Amount"}
            </button>
            <button
              onClick={() => {
                setStep("idle");
                setAmountInput("");
                setError("");
              }}
              disabled={step === "confirming"}
              className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg text-sm hover:bg-gray-50 transition-colors disabled:opacity-50"
            >
              Send Again
            </button>
          </div>
        </div>
      )}

      {/* Step 4: Verified */}
      {step === "verified" && (
        <div className="space-y-3">
          <div className="flex items-center gap-2 bg-green-50 border border-green-100 rounded-lg px-4 py-3">
            <span className="text-green-600 text-lg">&#10003;</span>
            <div>
              <p className="text-sm font-medium text-green-800">MoMo number verified</p>
              <p className="text-xs text-green-600">
                {displayPhone || (initialPhone ? `+${initialPhone}` : "")}
              </p>
            </div>
          </div>
          <p className="text-sm text-gray-500">
            Guest booking payouts will be sent to this number automatically.
          </p>
          <button
            onClick={handleChangeNumber}
            className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg text-sm hover:bg-gray-50 transition-colors"
          >
            Change Number
          </button>
        </div>
      )}
    </div>
  );
}
