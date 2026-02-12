"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import Script from "next/script";

declare global {
  interface Window {
    FB: {
      init: (params: {
        appId: string;
        xfbml: boolean;
        version: string;
      }) => void;
      login: (
        callback: (response: { authResponse?: { code?: string } }) => void,
        options: Record<string, unknown>
      ) => void;
    };
    fbAsyncInit: () => void;
  }
}

interface SessionInfo {
  phone_number_id?: string;
  waba_id?: string;
}

export function EmbeddedSignup() {
  const router = useRouter();
  const [sdkReady, setSdkReady] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState("");
  const sessionInfoRef = useRef<SessionInfo | null>(null);

  const appId = process.env.NEXT_PUBLIC_WHATSAPP_APP_ID;
  const configId = process.env.NEXT_PUBLIC_WHATSAPP_CONFIG_ID;

  // Listen for session info from the Embedded Signup popup
  const handleMessage = useCallback((event: MessageEvent) => {
    if (
      event.origin !== "https://www.facebook.com" &&
      event.origin !== "https://web.facebook.com"
    ) {
      return;
    }

    try {
      const data =
        typeof event.data === "string" ? JSON.parse(event.data) : event.data;

      if (data.type === "WA_EMBEDDED_SIGNUP") {
        // data.data contains { phone_number_id, waba_id }
        if (data.data) {
          sessionInfoRef.current = data.data;
        }
      }
    } catch {
      // Ignore non-JSON messages
    }
  }, []);

  useEffect(() => {
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [handleMessage]);

  // Initialize FB SDK when script loads
  function handleSdkLoad() {
    if (window.FB && appId) {
      window.FB.init({
        appId,
        xfbml: false,
        version: "v21.0",
      });
      setSdkReady(true);
    }
  }

  async function handleConnect() {
    if (!window.FB || !configId) return;

    setConnecting(true);
    setError("");
    sessionInfoRef.current = null;

    window.FB.login(
      async (response) => {
        const code = response.authResponse?.code;
        if (!code) {
          setConnecting(false);
          setError("Signup was cancelled or failed. Please try again.");
          return;
        }

        // Wait briefly for the session info message to arrive
        await new Promise((resolve) => setTimeout(resolve, 500));

        const sessionInfo = sessionInfoRef.current;
        if (!sessionInfo?.phone_number_id || !sessionInfo?.waba_id) {
          setConnecting(false);
          setError(
            "Could not retrieve WhatsApp account details. Please try again."
          );
          return;
        }

        try {
          const res = await fetch("/api/auth/whatsapp/callback", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              code,
              phoneNumberId: sessionInfo.phone_number_id,
              wabaId: sessionInfo.waba_id,
            }),
          });

          if (!res.ok) {
            const data = await res.json().catch(() => ({}));
            throw new Error(data.error || "Failed to connect WhatsApp");
          }

          router.refresh();
        } catch (err) {
          setError(
            err instanceof Error ? err.message : "Failed to connect WhatsApp"
          );
          setConnecting(false);
        }
      },
      {
        config_id: configId,
        response_type: "code",
        override_default_response_type: true,
        extras: {
          setup: {},
          featureType: "",
          sessionInfoVersion: "3",
        },
      }
    );
  }

  if (!appId || !configId) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
        <p className="text-sm text-gray-500">
          WhatsApp connection is not available yet. Please contact support.
        </p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
      <Script
        src="https://connect.facebook.net/en_US/sdk.js"
        onLoad={handleSdkLoad}
        strategy="lazyOnload"
      />

      <h3 className="text-lg font-semibold text-gray-900 mb-1">
        Connect WhatsApp
      </h3>
      <p className="text-sm text-gray-500 mb-4">
        Sign in with Facebook to connect your WhatsApp Business account. You can
        create a new account or use an existing one.
      </p>

      <button
        onClick={handleConnect}
        disabled={!sdkReady || connecting}
        className="px-5 py-2.5 bg-[#2D4A3E] text-white rounded-lg text-sm font-medium hover:bg-[#1E3329] transition-colors disabled:opacity-50"
      >
        {connecting
          ? "Connecting..."
          : !sdkReady
            ? "Loading..."
            : "Connect WhatsApp"}
      </button>

      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
    </div>
  );
}
