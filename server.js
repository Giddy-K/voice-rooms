import express from "express";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import pkg from "agora-token";
const { RtcTokenBuilder, RtcRole, RtmTokenBuilder } = pkg;

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3001;

const APP_ID = process.env.VITE_AGORA_APP_ID;
const APP_CERTIFICATE = process.env.AGORA_APP_CERTIFICATE;

// Allow Vite dev server in development; same-origin only in production
app.use(
  cors({
    origin:
      process.env.NODE_ENV === "production"
        ? false
        : ["http://localhost:5173", "http://127.0.0.1:5173"],
  })
);

// GET /api/token?channel=roomname&rtcUid=123&rtmUid=abc
app.get("/api/token", (req, res) => {
  const { channel, rtcUid, rtmUid } = req.query;

  if (!channel || rtcUid === undefined || !rtmUid) {
    return res
      .status(400)
      .json({ error: "channel, rtcUid, and rtmUid are required" });
  }

  if (!APP_ID || !APP_CERTIFICATE) {
    return res
      .status(500)
      .json({ error: "Server misconfigured — check VITE_AGORA_APP_ID and AGORA_APP_CERTIFICATE in .env" });
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
});

// Serve the built Vite app in production
if (process.env.NODE_ENV === "production") {
  app.use(express.static(path.join(__dirname, "dist")));
  app.get("*", (_req, res) => {
    res.sendFile(path.join(__dirname, "dist", "index.html"));
  });
}

app.listen(PORT, () => {
  console.log(`Token server running on http://localhost:${PORT}`);
});
