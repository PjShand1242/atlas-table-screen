// Sends transactional email via Resend. In Option A we send from Resend's shared
// onboarding address; swap FROM to your own domain once it's verified.
const FROM = process.env.RESEND_FROM || "Atlas <onboarding@resend.dev>";

export async function sendResetEmail(to, link) {
  const key = process.env.RESEND_API_KEY;
  if (!key) throw new Error("RESEND_API_KEY not set");
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { "Authorization": "Bearer " + key, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: FROM,
      to: [to],
      subject: "Reset your Atlas password",
      html: `
        <div style="font-family:Georgia,serif;max-width:480px;margin:0 auto;color:#26201a">
          <h2 style="font-size:22px">Atlas of Table &amp; Screen</h2>
          <p>Someone asked to reset the password for your account. If that was you,
             click below to choose a new one. This link expires in 1 hour.</p>
          <p><a href="${link}" style="display:inline-block;background:#7a5c3e;color:#fff;
             text-decoration:none;padding:12px 20px;border-radius:8px">Reset my password</a></p>
          <p style="color:#8a7f72;font-size:13px">If you didn't ask for this, you can ignore
             this email — nothing will change.</p>
        </div>`,
    }),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error("email send failed: " + t.slice(0, 200));
  }
  return true;
}
