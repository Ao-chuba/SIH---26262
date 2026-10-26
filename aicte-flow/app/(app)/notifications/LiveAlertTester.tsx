"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Send, CheckCircle2, AlertTriangle, ExternalLink, RefreshCw } from "lucide-react";

export function LiveAlertTester({
  gatewayStatus,
}: {
  gatewayStatus: {
    emailGateway: string;
    smsGateway: string;
    emailConfigured: boolean;
    smsConfigured: boolean;
  };
}) {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [kind, setKind] = useState<"ESCALATION" | "OVERDUE" | "REMINDER">("ESCALATION");
  const [subject, setSubject] = useState("AICTE Urgent Compliance Alert: Scrutiny Delay Notice");
  const [message, setMessage] = useState("Your institution application requires immediate attention. APH norms verification is pending.");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{
    success: boolean;
    message?: string;
    emailStatus?: string;
    emailPreviewUrl?: string;
    smsStatus?: string;
    error?: string;
  } | null>(null);

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    if (!email && !phone) {
      alert("Please enter either an email address or a phone number.");
      return;
    }
    setLoading(true);
    setResult(null);

    try {
      const res = await fetch("/api/notifications/test-dispatch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          targetEmail: email || undefined,
          targetPhone: phone || undefined,
          kind,
          subject,
          message,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setResult({ success: false, error: data.error || "Failed to dispatch" });
      } else {
        setResult({
          success: true,
          message: data.message,
          emailStatus: data.results?.emailResult?.status,
          emailPreviewUrl: data.results?.emailResult?.previewUrl,
          smsStatus: data.results?.smsResult?.status,
        });
        router.refresh();
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Network error";
      setResult({ success: false, error: msg });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      style={{
        background: "var(--card-bg)",
        border: "1.5px solid var(--border)",
        borderRadius: 14,
        padding: "16px 20px",
        marginBottom: 20,
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: 12,
        }}
      >
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: "var(--forest)" }}>
              📡 Live Notification Gateway &amp; Sandbox Dispatcher
            </h3>
            <span
              className={`badge ${gatewayStatus.emailConfigured ? "badge-green" : "badge-blue"}`}
              style={{ fontSize: 11 }}
            >
              Email: {gatewayStatus.emailGateway.replace("_", " ")}
            </span>
            <span
              className={`badge ${gatewayStatus.smsConfigured ? "badge-green" : "badge-amber"}`}
              style={{ fontSize: 11 }}
            >
              SMS: {gatewayStatus.smsGateway.replace("_", " ")}
            </span>
          </div>
          <p style={{ margin: "4px 0 0", fontSize: 13, color: "var(--forest-muted)" }}>
            Test live regulatory alerts delivered to your real email inbox or SMS number during jury demonstration.
          </p>
        </div>

        <button
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          className="btn btn-primary btn-sm"
          style={{ display: "inline-flex", alignItems: "center", gap: 6 }}
        >
          <Send size={14} />
          {isOpen ? "Close Test Console" : "Open Live Alert Console"}
        </button>
      </div>

      {isOpen && (
        <form onSubmit={handleSend} style={{ marginTop: 18, borderTop: "1px solid var(--border)", paddingTop: 16 }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 14 }}>
            <div>
              <label style={{ display: "block", fontSize: 12, fontWeight: 700, marginBottom: 5 }}>
                Recipient Email (Real Inbox / Sandbox)
              </label>
              <input
                type="email"
                placeholder="your.email@domain.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                style={{
                  width: "100%",
                  padding: "8px 12px",
                  borderRadius: 8,
                  border: "1px solid var(--border)",
                  background: "var(--surface)",
                  color: "var(--foreground)",
                }}
              />
            </div>

            <div>
              <label style={{ display: "block", fontSize: 12, fontWeight: 700, marginBottom: 5 }}>
                Recipient Phone (Mobile for SMS)
              </label>
              <input
                type="tel"
                placeholder="+91-9876543210"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                style={{
                  width: "100%",
                  padding: "8px 12px",
                  borderRadius: 8,
                  border: "1px solid var(--border)",
                  background: "var(--surface)",
                  color: "var(--foreground)",
                }}
              />
            </div>

            <div>
              <label style={{ display: "block", fontSize: 12, fontWeight: 700, marginBottom: 5 }}>
                Alert Severity Level
              </label>
              <select
                value={kind}
                onChange={(e) => setKind(e.target.value as "ESCALATION" | "OVERDUE" | "REMINDER")}
                style={{
                  width: "100%",
                  padding: "8px 12px",
                  borderRadius: 8,
                  border: "1px solid var(--border)",
                  background: "var(--surface)",
                  color: "var(--foreground)",
                }}
              >
                <option value="ESCALATION">ESCALATION (High Priority)</option>
                <option value="OVERDUE">OVERDUE (Statutory Breach)</option>
                <option value="REMINDER">REMINDER (Standard SLA)</option>
              </select>
            </div>
          </div>

          <div style={{ marginTop: 12 }}>
            <label style={{ display: "block", fontSize: 12, fontWeight: 700, marginBottom: 5 }}>Alert Subject</label>
            <input
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              style={{
                width: "100%",
                padding: "8px 12px",
                borderRadius: 8,
                border: "1px solid var(--border)",
                background: "var(--surface)",
                color: "var(--foreground)",
              }}
            />
          </div>

          <div style={{ marginTop: 12 }}>
            <label style={{ display: "block", fontSize: 12, fontWeight: 700, marginBottom: 5 }}>Message Body</label>
            <textarea
              rows={2}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              style={{
                width: "100%",
                padding: "8px 12px",
                borderRadius: 8,
                border: "1px solid var(--border)",
                background: "var(--surface)",
                color: "var(--foreground)",
              }}
            />
          </div>

          <div style={{ marginTop: 14, display: "flex", gap: 10, alignItems: "center" }}>
            <button
              type="submit"
              disabled={loading}
              className="btn btn-primary"
              style={{ display: "inline-flex", alignItems: "center", gap: 6 }}
            >
              {loading ? <RefreshCw size={14} className="animate-spin" /> : <Send size={14} />}
              {loading ? "Dispatching Alert..." : "Dispatch Alert Now"}
            </button>
            <span style={{ fontSize: 12, color: "var(--forest-muted)" }}>
              Environment API keys can be supplied via <code>.env</code> (e.g. <code>RESEND_API_KEY</code>,{" "}
              <code>FAST2SMS_API_KEY</code>).
            </span>
          </div>

          {result && (
            <div
              style={{
                marginTop: 14,
                padding: "12px 16px",
                borderRadius: 10,
                border: result.success ? "1px solid var(--accent-sage)" : "1px solid var(--accent-peach)",
                background: result.success ? "var(--highlighter-yellow-soft)" : "#fee2e2",
                display: "flex",
                flexDirection: "column",
                gap: 6,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                {result.success ? (
                  <CheckCircle2 size={16} color="var(--forest)" />
                ) : (
                  <AlertTriangle size={16} color="#991b1b" />
                )}
                <span style={{ fontWeight: 700, fontSize: 13, color: "var(--forest)" }}>
                  {result.success ? "Alert Processed" : "Dispatch Failed"}
                </span>
              </div>
              {result.error && <div style={{ fontSize: 12, color: "#991b1b" }}>{result.error}</div>}
              {result.emailStatus && (
                <div style={{ fontSize: 12 }}>
                  <strong>Email Delivery:</strong> {result.emailStatus}
                  {result.emailPreviewUrl && (
                    <a
                      href={result.emailPreviewUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{
                        marginLeft: 10,
                        fontWeight: 700,
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 4,
                        color: "var(--forest)",
                        textDecoration: "underline",
                      }}
                    >
                      View Rendered Email in Sandbox ↗
                    </a>
                  )}
                </div>
              )}
              {result.smsStatus && (
                <div style={{ fontSize: 12 }}>
                  <strong>SMS Delivery:</strong> {result.smsStatus}
                </div>
              )}
            </div>
          )}
        </form>
      )}
    </div>
  );
}
