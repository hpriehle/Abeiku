// Payment callback page — Paystack redirects here after checkout
// Verifies payment status and shows result to the guest

import { verifyTransaction } from "@/lib/payments/paystack";

export default async function PaymentCallbackPage({
  searchParams,
}: {
  searchParams: Promise<{ ref?: string; reference?: string; trxref?: string }>;
}) {
  const params = await searchParams;
  const reference = params.ref || params.reference || params.trxref;

  if (!reference) {
    return (
      <div style={styles.container}>
        <div style={styles.card}>
          <h1 style={styles.heading}>Invalid Link</h1>
          <p style={styles.text}>This payment link is invalid or has expired.</p>
        </div>
      </div>
    );
  }

  let success = false;
  let errorMessage = "";

  try {
    const result = await verifyTransaction(reference);
    success = result.status;
    if (!success) {
      errorMessage = result.gateway_response || "Payment was not completed.";
    }
  } catch (err) {
    errorMessage = err instanceof Error ? err.message : "Could not verify payment.";
  }

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        {success ? (
          <>
            <div style={styles.icon}>&#10003;</div>
            <h1 style={styles.heading}>Payment Successful</h1>
            <p style={styles.text}>
              Your payment has been confirmed. You will receive a confirmation
              message on WhatsApp shortly.
            </p>
            <p style={styles.subtext}>You can close this page now.</p>
          </>
        ) : (
          <>
            <div style={{ ...styles.icon, color: "#e74c3c" }}>&#10007;</div>
            <h1 style={styles.heading}>Payment Failed</h1>
            <p style={styles.text}>{errorMessage}</p>
            <p style={styles.subtext}>
              Please return to WhatsApp and try again.
            </p>
          </>
        )}
      </div>
    </div>
  );
}

const styles = {
  container: {
    minHeight: "100vh",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F7F5F0",
    padding: "1rem",
    fontFamily: "system-ui, -apple-system, sans-serif",
  } as React.CSSProperties,
  card: {
    backgroundColor: "#fff",
    borderRadius: "12px",
    padding: "2.5rem 2rem",
    maxWidth: "400px",
    width: "100%",
    textAlign: "center" as const,
    boxShadow: "0 2px 12px rgba(0,0,0,0.08)",
  } as React.CSSProperties,
  icon: {
    fontSize: "3rem",
    color: "#2D4A3E",
    marginBottom: "1rem",
  } as React.CSSProperties,
  heading: {
    fontSize: "1.5rem",
    color: "#111",
    marginBottom: "0.75rem",
  } as React.CSSProperties,
  text: {
    fontSize: "1rem",
    color: "#555",
    lineHeight: "1.5",
    marginBottom: "0.5rem",
  } as React.CSSProperties,
  subtext: {
    fontSize: "0.875rem",
    color: "#999",
    marginTop: "1rem",
  } as React.CSSProperties,
};