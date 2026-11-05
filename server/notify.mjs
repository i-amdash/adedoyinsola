// Email notifications through Resend's HTTP API (no SDK needed). Without RESEND_API_KEY
// nothing is sent and requests are still saved in the admin studio.
export function createNotifier(env = process.env) {
  const key = env.RESEND_API_KEY;
  if (!key) return null;
  const from = env.NOTIFY_FROM || "Portfolio requests <onboarding@resend.dev>";
  return async function send({ to, subject, html, text, replyTo, attachments }) {
    const recipient = env.NOTIFY_EMAIL || to;
    if (!recipient) throw new Error("No NOTIFY_EMAIL configured");
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from, to: [recipient], subject, html, text, ...(replyTo ? { reply_to: replyTo } : {}), ...(attachments ? { attachments } : {}) }),
      signal: AbortSignal.timeout(6000),
    });
    if (!res.ok) throw new Error(`Email provider answered ${res.status}: ${(await res.text()).slice(0, 200)}`);
  };
}
