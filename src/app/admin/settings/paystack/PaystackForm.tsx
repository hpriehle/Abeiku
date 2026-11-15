"use client";

import { useState, useEffect } from "react";

const inputClass =
  "admin-input";

type Step =
  | "idle"
  | "loading_banks"
  | "bank_selected"
  | "verifying_account"
  | "account_verified"
  | "creating"
  | "connected";

interface Bank {
  name: string;
  code: string;
  slug: string;
}

interface PaystackSubaccountWizardProps {
  isConnected: boolean;
  subaccountCode: string | null;
  currency: string;
  feeLabel: string | null;
  payoutMethod: "bank" | "momo" | null;
  momoPhone: string | null;
}

export function PaystackSubaccountWizard({
  isConnected,
  subaccountCode,
  currency,
  feeLabel,
  payoutMethod,
  momoPhone,
}: PaystackSubaccountWizardProps) {
  const [step, setStep] = useState<Step>(isConnected ? "connected" : "idle");
  const [banks, setBanks] = useState<Bank[]>([]);
  const [selectedBank, setSelectedBank] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [accountName, setAccountName] = useState("");
  const [error, setError] = useState("");
  const [bankSearch, setBankSearch] = useState("");

  // Payout preference state
  const [selectedPayout, setSelectedPayout] = useState<"bank" | "momo">(payoutMethod || "bank");
  const [payoutMomoPhone, setPayoutMomoPhone] = useState(() => {
    if (momoPhone?.startsWith("233")) return momoPhone.slice(3);
    return "";
  });
  const [payoutSaving, setPayoutSaving] = useState(false);
  const [payoutSuccess, setPayoutSuccess] = useState(false);

  // Fetch banks on mount
  useEffect(() => {
    if (isConnected) return;
    setStep("loading_banks");
    fetch("/api/admin/paystack/banks")
      .then((res) => res.json())
      .then((data) => {
        if (data.banks) {
          setBanks(data.banks);
          setStep("idle");
        } else {
          setError("Failed to load banks");
          setStep("idle");
        }
      })
      .catch(() => {
        setError("Failed to load banks");
        setStep("idle");
      });
  }, [isConnected]);

  const filteredBanks = banks.filter((b) =>
    b.name.toLowerCase().includes(bankSearch.toLowerCase())
  );

  async function handleVerifyAccount() {
    setError("");
    setStep("verifying_account");
    try {
      const res = await fetch("/api/admin/paystack/verify-account", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          account_number: accountNumber,
          bank_code: selectedBank,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Could not verify account");
        setStep("bank_selected");
        return;
      }
      setAccountName(data.account_name);
      setStep("account_verified");
    } catch {
      setError("Verification failed. Try again.");
      setStep("bank_selected");
    }
  }

  async function handleCreateSubaccount() {
    setError("");
    setStep("creating");
    try {
      const res = await fetch("/api/admin/paystack/create-subaccount", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          settlement_bank: selectedBank,
          account_number: accountNumber,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to set up card payments");
        setStep("account_verified");
        return;
      }
      setStep("connected");
    } catch {
      setError("Setup failed. Try again.");
      setStep("account_verified");
    }
  }

  async function handleSavePayoutPreference() {
    setError("");
    setPayoutSaving(true);
    setPayoutSuccess(false);
    try {
      const body: { payout_method: string; momo_phone?: string } = {
        payout_method: selectedPayout,
      };
      if (selectedPayout === "momo") {
        body.momo_phone = `233${payoutMomoPhone}`;
      }
      const res = await fetch("/api/admin/paystack/payout-preference", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to save payout preference");
        return;
      }
      setPayoutSuccess(true);
    } catch {
      setError("Failed to save. Try again.");
    } finally {
      setPayoutSaving(false);
    }
  }

  function handleReset() {
    setStep("idle");
    setSelectedBank("");
    setAccountNumber("");
    setAccountName("");
    setBankSearch("");
    setError("");
  }

  const selectedBankName = banks.find((b) => b.code === selectedBank)?.name;
  const momoPhoneValid = /^[0-9]{9}$/.test(payoutMomoPhone);

  return (
    <div className="space-y-6">
      {/* Card Payment Setup */}
      <div className="admin-card">
        <h3 className="text-lg font-semibold text-gray-900 mb-1">Card Payment Setup</h3>
        <p className="text-sm text-gray-500 mb-4">
          Connect your bank account to receive card payment payouts from guest bookings.
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

        {/* Loading banks */}
        {step === "loading_banks" && (
          <p className="text-sm text-gray-500">Loading banks...</p>
        )}

        {/* Step 1: Select bank and enter account number */}
        {(step === "idle" || step === "bank_selected" || step === "verifying_account") && banks.length > 0 && (
          <div className="space-y-4">
            <div>
              <label htmlFor="paystackfo-select-bank" className="admin-label">Select Bank</label>
              <input
                id="paystackfo-select-bank"
                type="text"
                value={bankSearch}
                onChange={(e) => setBankSearch(e.target.value)}
                placeholder="Search banks..."
                className={`${inputClass} mb-2`}
              />
              <select
                aria-label="Bank"
                value={selectedBank}
                onChange={(e) => {
                  setSelectedBank(e.target.value);
                  setAccountName("");
                  if (e.target.value) setStep("bank_selected");
                }}
                className={inputClass}
                disabled={step === "verifying_account"}
              >
                <option value="">Choose a bank</option>
                {filteredBanks.map((bank) => (
                  <option key={bank.code} value={bank.code}>
                    {bank.name}
                  </option>
                ))}
              </select>
            </div>

            {selectedBank && (
              <div>
                <label htmlFor="paystackfo-account-number" className="admin-label">Account Number</label>
                <input
                  id="paystackfo-account-number"
                  type="text"
                  inputMode="numeric"
                  value={accountNumber}
                  onChange={(e) => {
                    const val = e.target.value.replace(/\D/g, "").slice(0, 16);
                    setAccountNumber(val);
                  }}
                  placeholder="Enter account number"
                  className={inputClass}
                  disabled={step === "verifying_account"}
                />
              </div>
            )}

            {selectedBank && accountNumber.length >= 6 && (
              <button
                onClick={handleVerifyAccount}
                disabled={step === "verifying_account"}
                className="admin-btn-primary"
              >
                {step === "verifying_account" ? "Verifying..." : "Verify Account"}
              </button>
            )}
          </div>
        )}

        {/* Step 2: Account verified — confirm and create */}
        {(step === "account_verified" || step === "creating") && (
          <div className="space-y-4">
            <div className="bg-green-50 border border-green-100 rounded-lg px-4 py-3">
              <p className="text-sm font-medium text-green-800">Account verified</p>
              <div className="mt-2 space-y-1 text-sm text-green-700">
                <p><strong>Bank:</strong> {selectedBankName}</p>
                <p><strong>Account:</strong> {accountNumber}</p>
                <p><strong>Name:</strong> {accountName}</p>
              </div>
            </div>
            <p className="text-sm text-gray-600">
              Card payments from guests will be automatically deposited to this bank account,
              minus the platform service fee ({feeLabel || `${currency} per booking`}).
            </p>
            <div className="flex gap-3">
              <button
                onClick={handleCreateSubaccount}
                disabled={step === "creating"}
                className="admin-btn-primary"
              >
                {step === "creating" ? "Setting up..." : "Confirm & Connect"}
              </button>
              <button
                onClick={handleReset}
                disabled={step === "creating"}
                className="admin-btn-secondary"
              >
                Change Account
              </button>
            </div>
          </div>
        )}

        {/* Step 3: Connected */}
        {step === "connected" && (
          <div className="space-y-3">
            <div className="flex items-center gap-2 bg-green-50 border border-green-100 rounded-lg px-4 py-3">
              <span className="text-green-700 text-lg">&#10003;</span>
              <div>
                <p className="text-sm font-medium text-green-800">Card payments connected</p>
                {subaccountCode && (
                  <p className="text-xs text-green-700">Subaccount: {subaccountCode}</p>
                )}
              </div>
            </div>
            <p className="text-sm text-gray-500">
              Guests can now pay with credit or debit cards. Payouts will be sent to your bank account automatically.
            </p>
            <button
              onClick={handleReset}
              className="admin-btn-secondary"
            >
              Change Bank Account
            </button>
          </div>
        )}
      </div>

      {/* Payout Preference — only show when connected */}
      {step === "connected" && (
        <div className="admin-card">
          <h3 className="text-lg font-semibold text-gray-900 mb-1">Payout Preference</h3>
          <p className="text-sm text-gray-500 mb-4">
            Choose how you want to receive your booking payouts.
          </p>

          <div className="space-y-3 mb-4">
            <label
              className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                selectedPayout === "bank"
                  ? "border-[#2D4A3E] bg-[#2D4A3E]/5"
                  : "border-gray-200 hover:border-gray-300"
              }`}
            >
              <input
                type="radio"
                name="payout"
                value="bank"
                checked={selectedPayout === "bank"}
                onChange={() => setSelectedPayout("bank")}
                className="mt-0.5 accent-[#2D4A3E]"
              />
              <div>
                <p className="text-sm font-medium text-gray-900">Bank Account (Free)</p>
                <p className="text-xs text-gray-500">
                  Automatic next-day settlement to your connected bank account. No fees.
                </p>
              </div>
            </label>

            <label
              className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                selectedPayout === "momo"
                  ? "border-[#2D4A3E] bg-[#2D4A3E]/5"
                  : "border-gray-200 hover:border-gray-300"
              }`}
            >
              <input
                type="radio"
                name="payout"
                value="momo"
                checked={selectedPayout === "momo"}
                onChange={() => setSelectedPayout("momo")}
                className="mt-0.5 accent-[#2D4A3E]"
              />
              <div>
                <p className="text-sm font-medium text-gray-900">Mobile Money ({currency} 1 per payout)</p>
                <p className="text-xs text-gray-500">
                  Instant transfer to your MoMo wallet after each payment.
                </p>
              </div>
            </label>
          </div>

          {selectedPayout === "momo" && (
            <div className="mb-4">
              <label htmlFor="paystackfo-momo-phone-number" className="admin-label">MoMo Phone Number</label>
              <div className="flex gap-2">
                <span className="inline-flex items-center px-3 bg-gray-50 border border-gray-300 rounded-lg text-sm text-gray-500">
                  +233
                </span>
                <input
                  id="paystackfo-momo-phone-number"
                  type="tel"
                  value={payoutMomoPhone}
                  onChange={(e) => {
                    const digits = e.target.value.replace(/\D/g, "").slice(0, 9);
                    setPayoutMomoPhone(digits);
                  }}
                  placeholder="551234567"
                  className={inputClass}
                  maxLength={9}
                />
              </div>
            </div>
          )}

          {payoutSuccess && (
            <div className="bg-green-50 border border-green-100 text-green-700 text-sm rounded-lg px-4 py-3 mb-4">
              Payout preference saved successfully.
            </div>
          )}

          <button
            onClick={handleSavePayoutPreference}
            disabled={payoutSaving || (selectedPayout === "momo" && !momoPhoneValid)}
            className="admin-btn-primary"
          >
            {payoutSaving ? "Saving..." : "Save Preference"}
          </button>
        </div>
      )}
    </div>
  );
}
