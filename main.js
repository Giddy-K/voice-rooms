import "./style.css";
import AgoraRTC from "agora-rtc-sdk-ng";
import AgoraRTM from "agora-rtm-sdk";

const appid = import.meta.env.VITE_AGORA_APP_ID;

let rtcToken = null;
let rtmToken = null;

const fetchTokens = async (channel, rtcUidVal, rtmUidVal) => {
  const res = await fetch(
    `/api/token?channel=${encodeURIComponent(channel)}&rtcUid=${rtcUidVal}&rtmUid=${encodeURIComponent(rtmUidVal)}`
  );
  if (!res.ok) throw new Error("Failed to fetch tokens");
  const data = await res.json();
  rtcToken = data.rtcToken;
  rtmToken = data.rtmToken;
};

const rtcUid = Math.floor(Math.random() * 2147483647);
const rtmUid = String(Math.floor(Math.random() * 2147483647));

const getRoomId = () => {
  const urlParams = new URLSearchParams(window.location.search);
  return urlParams.get("room") ? urlParams.get("room").toLowerCase() : null;
};

let roomId = getRoomId() || null;
document.getElementById("form").roomname.value = roomId;

let audioTracks = {
  localAudioTrack: null,
  remoteAudioTracks: {},
};

let micMuted = true;
let inRoom = false;
let rtcClient, rtmClient, channel, avatar;

const memberNames = new Map();

const showToast = (message, type = "info") => {
  let container = document.getElementById("toast-container");
  if (!container) {
    container = document.createElement("div");
    container.id = "toast-container";
    document.body.appendChild(container);
  }
  const toast = document.createElement("div");
  toast.className = `toast toast-${type}`;
  toast.textContent = message;
  container.appendChild(toast);
  requestAnimationFrame(() => requestAnimationFrame(() => toast.classList.add("show")));
  setTimeout(() => {
    toast.classList.remove("show");
    toast.addEventListener("transitionend", () => toast.remove(), { once: true });
  }, 3500);
};

window.addEventListener("beforeunload", (e) => {
  if (inRoom) {
    e.preventDefault();
    e.returnValue = "";
    leaveRtmChannel();
  }
});

const escapeHtml = (str) => {
  const div = document.createElement("div");
  div.textContent = str || "";
  return div.innerHTML;
};

const buildMemberCard = (memberId, { name, userRtcUid, userAvatar, isHost, micMuted: isMuted }) => {
  const isHostUser = isHost === "true";
  const micSrc = isMuted === "false" ? "icons/mic.svg" : "icons/mic-off.svg";

  return `
  <div class="speaker user-rtc-${userRtcUid}" id="${memberId}">
    <img class="user-avatar avatar-${userRtcUid}" src="${userAvatar}" />
    <p class="user-name">${escapeHtml(name)}</p>
    <span class="user-role ${isHostUser ? "host-badge" : "participant-badge"}">
      ${isHostUser ? "Host" : "Participant"}
    </span>
    <div class="mic-indicator mic-status-${userRtcUid}">
      <img class="user-mic-icon" src="${micSrc}" />
    </div>
  </div>`;
};

const updateMicDisplay = (userRtcUid, muted) => {
  const indicatorEl = document.querySelector(`.mic-status-${userRtcUid}`);
  if (!indicatorEl) return;
  const micEl = indicatorEl.querySelector(".user-mic-icon");
  if (micEl) micEl.src = muted ? "icons/mic-off.svg" : "icons/mic.svg";
  if (muted) indicatorEl.classList.remove("speaking");
};

const handleChannelMessage = (message) => {
  try {
    const data = JSON.parse(message.text);
    if (data.type === "mic-toggle") {
      updateMicDisplay(data.rtcUid, data.muted);
    }
  } catch (e) {
    console.error(e);
  }
};

const initRtm = async (name) => {
  rtmClient = AgoraRTM.createInstance(appid);
  await rtmClient.login({ uid: rtmUid, token: rtmToken });

  channel = rtmClient.createChannel(roomId);
  await channel.join();

  // First member to join is the host
  const existingMembers = await channel.getMembers();
  const isHost = existingMembers.length === 1;

  await rtmClient.addOrUpdateLocalUserAttributes({
    name: name,
    userRtcUid: rtcUid.toString(),
    userAvatar: avatar,
    isHost: isHost ? "true" : "false",
    micMuted: "true",
  });

  getChannelMembers();

  channel.on("MemberJoined", handleMemberJoined);
  channel.on("MemberLeft", handleMemberLeft);
  channel.on("ChannelMessage", handleChannelMessage);
};

const initRtc = async () => {
  rtcClient = AgoraRTC.createClient({ mode: "rtc", codec: "vp8" });
  rtcClient.on("user-published", handleUserPublished);
  rtcClient.on("user-left", handleUserLeft);

  await rtcClient.join(appid, roomId, rtcToken, rtcUid);
  audioTracks.localAudioTrack = await AgoraRTC.createMicrophoneAudioTrack();
  audioTracks.localAudioTrack.setMuted(micMuted);
  await rtcClient.publish(audioTracks.localAudioTrack);

  initVolumeIndicator();
};

const initVolumeIndicator = async () => {
  AgoraRTC.setParameter("AUDIO_VOLUME_INDICATION_INTERVAL", 200);
  rtcClient.enableAudioVolumeIndicator();

  rtcClient.on("volume-indicator", (volumes) => {
    volumes.forEach((volume) => {
      try {
        const avatarEl = document.querySelector(`.avatar-${volume.uid}`);
        const micIndicatorEl = document.querySelector(`.mic-status-${volume.uid}`);
        const isSpeaking = volume.level >= 50;

        if (avatarEl) {
          avatarEl.style.borderColor = isSpeaking ? "#00ff00" : "#fff";
          avatarEl.classList.toggle("speaking", isSpeaking);
        }
        if (micIndicatorEl) {
          micIndicatorEl.classList.toggle("speaking", isSpeaking);
        }
      } catch (error) {
        console.error(error);
      }
    });
  });
};

const handleUserPublished = async (user, mediaType) => {
  await rtcClient.subscribe(user, mediaType);
  if (mediaType === "audio") {
    audioTracks.remoteAudioTracks[user.uid] = [user.audioTrack];
    user.audioTrack.play();
  }
};

const handleUserLeft = async (user) => {
  delete audioTracks.remoteAudioTracks[user.uid];
};

const handleMemberJoined = async (MemberId) => {
  const attrs = await rtmClient.getUserAttributesByKeys(MemberId, [
    "name", "userRtcUid", "userAvatar", "isHost", "micMuted",
  ]);
  memberNames.set(MemberId, attrs.name || "Someone");
  document.getElementById("members").insertAdjacentHTML("beforeend", buildMemberCard(MemberId, attrs));
  showToast(`${attrs.name || "Someone"} joined the room`, "info");
};

const handleMemberLeft = async (MemberId) => {
  const name = memberNames.get(MemberId) || "Someone";
  memberNames.delete(MemberId);
  document.getElementById(MemberId)?.remove();
  showToast(`${name} left the room`, "warning");
};

const getChannelMembers = async () => {
  const members = await channel.getMembers();
  for (let i = 0; i < members.length; i++) {
    const attrs = await rtmClient.getUserAttributesByKeys(members[i], [
      "name", "userRtcUid", "userAvatar", "isHost", "micMuted",
    ]);
    memberNames.set(members[i], attrs.name || "Someone");
    document.getElementById("members").insertAdjacentHTML("beforeend", buildMemberCard(members[i], attrs));
  }
};

const toggleMic = async (e) => {
  micMuted = !micMuted;

  e.target.src = micMuted ? "icons/mic-off.svg" : "icons/mic.svg";
  e.target.style.backgroundColor = micMuted ? "indianred" : "ivory";

  audioTracks.localAudioTrack.setMuted(micMuted);
  updateMicDisplay(rtcUid.toString(), micMuted);

  if (channel) {
    channel.sendMessage({
      text: JSON.stringify({ type: "mic-toggle", rtcUid: rtcUid.toString(), muted: micMuted }),
    });
    rtmClient.addOrUpdateLocalUserAttributes({ micMuted: micMuted ? "true" : "false" });
  }
};

const lobbyForm = document.getElementById("form");

const enterRoom = async (e) => {
  e.preventDefault();

  if (!avatar) {
    showToast("Please select an avatar before entering.", "warning");
    return;
  }

  roomId = e.target.roomname.value.toLowerCase();
  window.history.replaceState(null, null, `?room=${roomId}`);

  try {
    await fetchTokens(roomId, rtcUid, rtmUid);
  } catch (err) {
    showToast("Failed to connect. Check your configuration and try again.", "error");
    return;
  }

  initRtc();
  const displayName = e.target.displayname.value;
  initRtm(displayName);

  inRoom = true;
  lobbyForm.style.display = "none";
  document.getElementById("room-header").style.display = "flex";
  document.getElementById("room-name").innerText = roomId;
};

const leaveRtmChannel = async () => {
  await channel.leave();
  await rtmClient.logout();
};

const leaveRoom = async () => {
  audioTracks.localAudioTrack.stop();
  audioTracks.localAudioTrack.close();
  rtcClient.unpublish();
  rtcClient.leave();
  leaveRtmChannel();

  inRoom = false;
  memberNames.clear();

  // Reset mic state for next session
  micMuted = true;
  document.getElementById("mic-icon").src = "icons/mic-off.svg";
  document.getElementById("mic-icon").style.backgroundColor = "indianred";

  document.getElementById("form").style.display = "block";
  document.getElementById("room-header").style.display = "none";
  document.getElementById("members").innerHTML = "";
};

lobbyForm.addEventListener("submit", enterRoom);
document.getElementById("leave-icon").addEventListener("click", leaveRoom);
document.getElementById("mic-icon").addEventListener("click", toggleMic);

const avatarEls = document.getElementsByClassName("avatar-selection");
for (let i = 0; i < avatarEls.length; i++) {
  avatarEls[i].addEventListener("click", () => {
    for (let j = 0; j < avatarEls.length; j++) {
      avatarEls[j].style.borderColor = "#fff";
      avatarEls[j].style.opacity = 0.5;
    }
    avatar = avatarEls[i].src;
    avatarEls[i].style.borderColor = "#00ff00";
    avatarEls[i].style.opacity = 1;
  });
}
