import pkg from "agora-token";
const { RtcTokenBuilder, RtcRole, RtmTokenBuilder } = pkg;

// Vercel serverless function — GET /api/token?channel=x&rtcUid=y&rtmUid=z
export default function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { channel, rtcUid, rtmUid } = req.query;

  if (!channel || rtcUid === undefined || !rtmUid) {
    return res.status(400).json({ error: "channel, rtcUid, and rtmUid are required" });
  }

  const APP_ID = process.env.VITE_AGORA_APP_ID;
  const APP_CERTIFICATE = process.env.AGORA_APP_CERTIFICATE;

  if (!APP_ID || !APP_CERTIFICATE) {
    return res.status(500).json({ error: "Server misconfigured — set VITE_AGORA_APP_ID and AGORA_APP_CERTIFICATE in Vercel environment variables" });
  }

  const expiresAt = Math.floor(Date.now() / 1000) + 3600; // 1 hour

  const rtcToken = RtcTokenBuilder.buildTokenWithUid(
    APP_ID,
    APP_CERTIFICATE,
    channel,
    parseInt(rtcUid),
    RtcRole.PUBLISHER,
    expiresAt
  );

  const rtmToken = RtmTokenBuilder.buildToken(
    APP_ID,
    APP_CERTIFICATE,
    rtmUid,
    expiresAt
  );

  res.json({ rtcToken, rtmToken });
}
