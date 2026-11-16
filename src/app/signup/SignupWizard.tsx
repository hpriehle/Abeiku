"use client";

import { useEffect, useState } from "react";
import { apiRequest, type ApiResult } from "@/lib/admin/api-client";
import { formatPrice, tierForRooms, trialEndsAt, type BillingProvider, type Tier } from "@/lib/billing/plans";
import { CONTACT_EMAIL, TRIAL_DAYS } from "@/lib/site";
import { SignupShell, H1_FONT } from "./SignupShell";

type Step = "loading" | "account" | "hotel" | "calendars" | "plan" | "ready" | "ended";
const STEPS: Step[] = ["account", "hotel", "calendars", "plan"];

interface State {
  hotel: { name: string; town: string; rooms: number | null; contactEmail: string; calendars: Record<string, string | null> | null };
  billing: { access: string; status: string | null; tier: Tier | null; legacy: boolean; exempt: boolean };
}

const input =
  "w-full min-h-12 px-3 rounded-lg border border-[#868e9c] bg-white text-base text-gray-900 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-[#2D4A3E] focus:border-transparent";
const label = "block text-sm font-medium text-gray-800 mb-1";
const hint = "mt-1 text-sm text-gray-600";
const primary =
  "inline-flex w-full items-center justify-center min-h-12 px-5 rounded-lg bg-[#2D4A3E] text-white text-base font-semibold hover:bg-[#1E3329] disabled:bg-gray-200 disabled:text-gray-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2D4A3E]";
const secondary =
  "inline-flex w-full items-center justify-center min-h-12 px-5 rounded-lg border border-[#868e9c] bg-white text-base font-semibold text-gray-800 hover:bg-gray-50";

function Progress({ step }: { step: Step }) {
  const i = STEPS.indexOf(step);
  if (i < 0) return null;
  return (
    <div className="mb-5">
      <p className="text-sm font-medium text-gray-700">Step {i + 1} of {STEPS.length}</p>
      <div className="mt-2 grid grid-cols-4 gap-1.5" aria-hidden="true">
        {STEPS.map((s, j) => (
          <span key={s} className={`h-1.5 rounded-full ${j <= i ? "bg-[#2D4A3E]" : "bg-gray-200"}`} />
        ))}
      </div>
    </div>
  );
}

function ErrorBox({ text }: { text: string | null }) {
  if (!text) return null;
  return (
    <div role="alert" className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
      {text}
    </div>
  );
}

function Field(props: { id: string; label: string; hint?: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  const { id, label: text, hint: help, ...rest } = props;
  return (
    <div>
      <label htmlFor={id} className={label}>{text}</label>
      <input id={id} name={id} className={input} aria-describedby={help ? `${id}-hint` : undefined} {...rest} />
      {help && <p id={`${id}-hint`} className={hint}>{help}</p>}
    </div>
  );
}

export function SignupWizard() {
  const [step, setStep] = useState<Step>("loading");
  const [state, setState] = useState<State | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function apply(r: ApiResult<State>, preferred?: Step) {
    if (!r.ok) {
      setStep("account");
      return;
    }
    setState(r.data);
    if (r.data.billing.access === "full") setStep("ready");
    else if (r.data.billing.access === "ended") setStep("ended");
    else if (!r.data.hotel.rooms || !r.data.hotel.town) setStep("hotel");
    else setStep(preferred ?? "calendars");
  }

  async function load(preferred?: Step) {
    apply(await apiRequest<State>("/api/signup/state"), preferred);
  }

  useEffect(() => {
    const wanted = new URLSearchParams(window.location.search).get("step");
    apiRequest<State>("/api/signup/state").then((r) => apply(r, wanted === "plan" ? "plan" : undefined));
  }, []);

  async function submit(url: string, json: unknown, next: () => void | Promise<void>) {
    setBusy(true);
    setError(null);
    const r = await apiRequest(url, { method: "POST", json });
    setBusy(false);
    if (!r.ok) {
      setError(r.error);
      return;
    }
    await next();
  }

  const go = (s: Step) => {
    setError(null);
    setStep(s);
    window.scrollTo(0, 0);
  };

  return (
    <SignupShell footer={step === "account"}>
      <Progress step={step} />
      {step === "loading" && <p className="text-base text-gray-700">Loading...</p>}
      {step === "account" && <AccountStep busy={busy} onSubmit={(v) => submit("/api/signup", v, () => load())} />}
      {step === "hotel" && state && (
        <HotelStep
          state={state}
          busy={busy}
          onSubmit={(v) => submit("/api/signup/hotel", v, async () => { await load(); go("calendars"); })}
        />
      )}
      {step === "calendars" && state && (
        <CalendarsStep
          state={state}
          busy={busy}
          onBack={() => go("hotel")}
          onSkip={() => go("plan")}
          onSubmit={(v) => submit("/api/signup/calendars", v, async () => { await load(); go("plan"); })}
        />
      )}
      {step === "plan" && state && (
        <PlanStep
          state={state}
          busy={busy}
          onBack={() => go("calendars")}
          onSubmit={async (provider) => {
            setBusy(true);
            setError(null);
            const r = await apiRequest<{ url: string }>("/api/signup/card", { method: "POST", json: { provider } });
            if (!r.ok) {
              setBusy(false);
              setError(r.error);
              return;
            }
            window.location.assign(r.data.url); // the provider's card page
          }}
        />
      )}
      {step === "ready" && (
        <div>
          <h1 className="text-2xl font-bold tracking-tight" style={H1_FONT}>You are all set</h1>
          <p className="mt-3 text-base text-gray-700">Your account is ready.</p>
          <a href="/admin" className={`${primary} mt-6`}>Go to my hotel</a>
        </div>
      )}
      {step === "ended" && (
        <div>
          <h1 className="text-2xl font-bold tracking-tight" style={H1_FONT}>Your plan has ended</h1>
          <p className="mt-3 text-base text-gray-700">
            Your Abeiku plan was cancelled and has now ended. To start again, email us.
          </p>
          <a href={`mailto:${CONTACT_EMAIL}`} className={`${primary} mt-6`}>{CONTACT_EMAIL}</a>
        </div>
      )}
      <ErrorBox text={error} />
      {step !== "account" && step !== "loading" && (
        <form action="/api/admin/auth/logout" method="POST" className="mt-6 text-center">
          <button type="submit" className="text-sm font-medium text-[#2D4A3E] underline underline-offset-4">Log out</button>
        </form>
      )}
    </SignupShell>
  );
}

function AccountStep({ busy, onSubmit }: { busy: boolean; onSubmit: (v: Record<string, string | boolean>) => void }) {
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        onSubmit({
          hotelName: String(f.get("hotelName")),
          email: String(f.get("email")),
          password: String(f.get("password")),
          acceptTerms: f.get("acceptTerms") === "yes",
        });
      }}
    >
      <h1 className="text-2xl sm:text-3xl font-bold tracking-tight" style={H1_FONT}>Start your free trial</h1>
      <p className="mt-2 text-base text-gray-700">{TRIAL_DAYS} days free. Cancel any time.</p>
      <div className="mt-6 space-y-4">
        <Field id="hotelName" label="Hotel name" autoComplete="organization" required minLength={2} maxLength={100} />
        <Field id="email" label="Your email" type="email" autoComplete="email" required hint="You log in with this." />
        <Field id="password" label="Password" type="password" autoComplete="new-password" required minLength={8} hint="At least 8 characters." />
        <label htmlFor="acceptTerms" className="flex items-start gap-3 text-base text-gray-900">
          <input id="acceptTerms" name="acceptTerms" type="checkbox" value="yes" required className="mt-1 size-5 shrink-0 accent-[#2D4A3E]" />
          <span>
            I agree to the{" "}
            <a href="/terms" target="_blank" className="font-semibold text-[#2D4A3E] underline underline-offset-4">Terms</a>
            {" "}and{" "}
            <a href="/privacy" target="_blank" className="font-semibold text-[#2D4A3E] underline underline-offset-4">Privacy Policy</a>
          </span>
        </label>
      </div>
      <button type="submit" className={`${primary} mt-6`} disabled={busy}>{busy ? "Creating your account..." : "Create account"}</button>
    </form>
  );
}

function HotelStep({ state, busy, onSubmit }: { state: State; busy: boolean; onSubmit: (v: Record<string, unknown>) => void }) {
  const [rooms, setRooms] = useState(state.hotel.rooms ? String(state.hotel.rooms) : "");
  const n = Number(rooms);
  const tier = Number.isInteger(n) && n > 0 ? tierForRooms(n) : null;
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        onSubmit({ town: String(f.get("town")), rooms: n, contactEmail: String(f.get("contactEmail")) });
      }}
    >
      <h1 className="text-2xl font-bold tracking-tight" style={H1_FONT}>About {state.hotel.name}</h1>
      <div className="mt-6 space-y-4">
        <Field id="town" label="Town" placeholder="For example Busua" defaultValue={state.hotel.town} required minLength={2} maxLength={80} />
        <div>
          <label htmlFor="rooms" className={label}>Number of rooms</label>
          <input
            id="rooms"
            className={input}
            type="number"
            inputMode="numeric"
            min={1}
            max={500}
            required
            value={rooms}
            onChange={(e) => setRooms(e.target.value)}
            aria-describedby="rooms-hint"
          />
          <p id="rooms-hint" className={hint}>
            {tier
              ? `Your plan: ${formatPrice(tier, "GHS")} or ${formatPrice(tier, "USD")} a month after the free trial.`
              : "Up to 5 rooms: GH₵300 or $25 a month. 6 or more: GH₵500 or $40 a month."}
          </p>
        </div>
        <Field
          id="contactEmail"
          label="Contact email"
          type="email"
          defaultValue={state.hotel.contactEmail}
          required
          hint="Where we send booking alerts and receipts."
        />
      </div>
      <button type="submit" className={`${primary} mt-6`} disabled={busy}>{busy ? "Saving..." : "Next"}</button>
    </form>
  );
}

function CalendarsStep({
  state,
  busy,
  onBack,
  onSkip,
  onSubmit,
}: {
  state: State;
  busy: boolean;
  onBack: () => void;
  onSkip: () => void;
  onSubmit: (v: Record<string, string>) => void;
}) {
  const c = state.hotel.calendars ?? {};
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        onSubmit({
          airbnb: String(f.get("airbnb") ?? ""),
          booking: String(f.get("booking") ?? ""),
          vrbo: String(f.get("vrbo") ?? ""),
          google: String(f.get("google") ?? ""),
        });
      }}
    >
      <h1 className="text-2xl font-bold tracking-tight" style={H1_FONT}>Your calendars</h1>
      <p className="mt-2 text-base text-gray-700">
        Paste the calendar links from the sites you use, so all your bookings show in one place. You can skip
        this step.
      </p>
      <div className="mt-6 space-y-4">
        <Field id="airbnb" label="Airbnb calendar link" type="url" inputMode="url" placeholder="https://www.airbnb.com/calendar/ical/..." defaultValue={c.airbnb ?? ""} hint="In Airbnb, find Export calendar and copy the link." />
        <Field id="booking" label="Booking.com calendar link" type="url" inputMode="url" placeholder="https://admin.booking.com/hotel/hoteladmin/ical..." defaultValue={c.booking ?? ""} hint="In Booking.com, find Sync calendars, then Export, and copy the link." />
        <Field id="vrbo" label="VRBO calendar link" type="url" inputMode="url" placeholder="https://www.vrbo.com/icalendar/..." defaultValue={c.vrbo ?? ""} />
        <Field id="google" label="Google calendar ID" placeholder="abc123@group.calendar.google.com" defaultValue={c.google ?? ""} hint="In Google Calendar settings, under your calendar, copy the Calendar ID." />
      </div>
      <button type="submit" className={`${primary} mt-6`} disabled={busy}>{busy ? "Saving..." : "Save and continue"}</button>
      <div className="mt-3 grid grid-cols-2 gap-3">
        <button type="button" className={secondary} onClick={onBack} disabled={busy}>Back</button>
        <button type="button" className={secondary} onClick={onSkip} disabled={busy}>Skip</button>
      </div>
    </form>
  );
}

function PlanStep({
  state,
  busy,
  onBack,
  onSubmit,
}: {
  state: State;
  busy: boolean;
  onBack: () => void;
  onSubmit: (p: BillingProvider) => void;
}) {
  const [provider, setProvider] = useState<BillingProvider>("paystack");
  const tier = state.billing.tier ?? tierForRooms(state.hotel.rooms ?? 1);
  const firstCharge = trialEndsAt(new Date()).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
  const options: { id: BillingProvider; title: string; price: string; note: string }[] = [
    { id: "paystack", title: "Pay in cedis", price: `${formatPrice(tier, "GHS")} a month`, note: "Card through Paystack" },
    { id: "stripe", title: "Pay in dollars", price: `${formatPrice(tier, "USD")} a month`, note: "Card through Stripe" },
  ];
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit(provider);
      }}
    >
      <h1 className="text-2xl font-bold tracking-tight" style={H1_FONT}>Add your card</h1>
      <p className="mt-2 text-base text-gray-700">
        {state.hotel.rooms} {state.hotel.rooms === 1 ? "room" : "rooms"}. Free for {TRIAL_DAYS} days, then your card is charged
        on {firstCharge} and each month after. Cancel before then and you pay nothing.
      </p>
      <fieldset className="mt-6">
        <legend className={label}>How do you want to pay?</legend>
        <div className="space-y-3">
          {options.map((o) => (
            <label
              key={o.id}
              className={`flex items-start gap-3 rounded-lg border p-4 cursor-pointer ${
                provider === o.id ? "border-[#2D4A3E] ring-2 ring-[#2D4A3E] bg-green-50/40" : "border-[#868e9c] bg-white"
              }`}
            >
              <input
                type="radio"
                name="provider"
                value={o.id}
                checked={provider === o.id}
                onChange={() => setProvider(o.id)}
                className="mt-1 size-5 accent-[#2D4A3E]"
              />
              <span>
                <span className="block text-base font-semibold text-gray-900">{o.title}</span>
                <span className="block text-base text-gray-900">{o.price}</span>
                <span className="block text-sm text-gray-600">{o.note}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>
      <p className="mt-4 text-sm text-gray-700">
        {provider === "paystack"
          ? "To check your card, Paystack takes GH₵1 now and we give it straight back."
          : "Stripe saves your card now. Nothing is taken today."}
      </p>
      <button type="submit" className={`${primary} mt-6`} disabled={busy}>
        {busy ? "Opening the card page..." : "Add card and start free trial"}
      </button>
      <button type="button" className={`${secondary} mt-3`} onClick={onBack} disabled={busy}>Back</button>
    </form>
  );
}
