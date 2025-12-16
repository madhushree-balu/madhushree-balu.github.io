// server.ts - Run with: bun run server.ts
const clients = new Map();

const server = Bun.serve({
  port: 3000,
  async fetch(req) {
    const url = new URL(req.url);
    
    if (url.pathname === "/") {
      return new Response(html, {
        headers: { "Content-Type": "text/html" }
      });
    }
    
    if (url.pathname === "/ws") {
      if (server.upgrade(req)) {
        return;
      }
      return new Response("Upgrade failed", { status: 500 });
    }
    
    return new Response("Not found", { status: 404 });
  },
  
websocket: {
    message(ws, msg) {
      try {
        const data = JSON.parse(msg);
        
        if (data.type === "ping") {
          ws.send(JSON.stringify({ type: "pong" }));
        } else if (data.type === "join") {
          ws.data = { id: data.id, role: data.role, name: data.name, lastPing: Date.now() };
          clients.set(data.id, { ws, role: data.role, name: data.name, lastPing: Date.now() });
          broadcastUserList();
          broadcast({ type: "peer-joined", id: data.id, role: data.role, name: data.name }, ws);
        } else if (data.type === "get-users") {
          sendUserList(ws);
        } else {
          broadcast(data, ws);
        }
        
        if (ws.data) {
          ws.data.lastPing = Date.now();
        }
      } catch (err) {
        console.error("WebSocket message error:", err);
      }
    },
    open(ws) {
      console.log("Client connected");
      ws.data = { lastPing: Date.now() };
    },
    close(ws) {
      try {
        if (ws.data?.id) {
          clients.delete(ws.data.id);
          broadcastUserList();
          broadcast({ type: "peer-left", id: ws.data.id, name: ws.data.name }, ws);
        }
      } catch (err) {
        console.error("WebSocket close error:", err);
      }
    }
  }
});

function broadcast(msg, sender) {
  const msgStr = JSON.stringify(msg);
  for (const [id, client] of clients) {
    try {
      if (client.ws !== sender && client.ws.readyState === 1) {
        client.ws.send(msgStr);
      }
    } catch (err) {
      console.error("Broadcast error:", err);
    }
  }
}

function broadcastUserList() {
  const users = Array.from(clients.entries()).map(([id, data]) => ({
    id,
    name: data.name,
    role: data.role
  }));
  
  const msg = JSON.stringify({ type: "user-list", users });
  for (const [id, client] of clients) {
    try {
      if (client.ws.readyState === 1) {
        client.ws.send(msg);
      }
    } catch (err) {
      console.error("Broadcast user list error:", err);
    }
  }
}

function sendUserList(ws) {
  try {
    const users = Array.from(clients.entries()).map(([id, data]) => ({
      id,
      name: data.name,
      role: data.role
    }));
    
    if (ws.readyState === 1) {
      ws.send(JSON.stringify({ type: "user-list", users }));
    }
  } catch (err) {
    console.error("Send user list error:", err);
  }
}

const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Screen Share Stream</title>
<style>
* { margin: 0; padding: 0; box-sizing: border-box; }
body { 
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
  background: #0a0a0a;
  color: #fafafa;
  line-height: 1.5;
  padding: 20px;
  overflow-x: hidden;
}
.container { max-width: 1600px; margin: 0 auto; }
h1 { font-size: 24px; font-weight: 600; margin-bottom: 24px; }

.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.9);
  backdrop-filter: blur(8px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}
.modal {
  background: #18181b;
  border: 1px solid #27272a;
  border-radius: 12px;
  padding: 32px;
  max-width: 400px;
  width: 90%;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
}
.modal h2 {
  font-size: 20px;
  font-weight: 600;
  margin-bottom: 8px;
}
.modal p {
  color: #a1a1aa;
  font-size: 14px;
  margin-bottom: 20px;
}
.modal input {
  width: 100%;
  background: #0a0a0a;
  border: 1px solid #3f3f46;
  border-radius: 6px;
  padding: 12px 16px;
  font-size: 14px;
  color: #fafafa;
  margin-bottom: 16px;
}
.modal input:focus {
  outline: 2px solid #fafafa;
  outline-offset: 2px;
  border-color: #fafafa;
}
.modal button {
  width: 100%;
  background: #fafafa;
  color: #0a0a0a;
  border: none;
  padding: 12px 20px;
  border-radius: 6px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
}
.modal button:hover { background: #e4e4e7; }

.layout {
  display: grid;
  grid-template-columns: 280px 1fr 360px;
  gap: 20px;
  min-height: calc(100vh - 100px);
}

@media (max-width: 1200px) {
  .layout { grid-template-columns: 1fr; }
  .sidebar { order: 1; }
  .main-content { order: 2; }
  .chat-sidebar { order: 3; }
}

.sidebar {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.users-panel {
  background: #18181b;
  border: 1px solid #27272a;
  border-radius: 8px;
  padding: 16px;
}
.users-panel h3 {
  font-size: 16px;
  font-weight: 600;
  margin-bottom: 12px;
  color: #fafafa;
}
.user-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-height: 400px;
  overflow-y: auto;
}
.user-list::-webkit-scrollbar { width: 6px; }
.user-list::-webkit-scrollbar-track { background: transparent; }
.user-list::-webkit-scrollbar-thumb { background: #3f3f46; border-radius: 3px; }
.user-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 12px;
  background: #0a0a0a;
  border: 1px solid #27272a;
  border-radius: 6px;
  font-size: 14px;
  transition: background 0.2s;
}
.user-item:hover { background: #18181b; }
.user-avatar {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 600;
  font-size: 14px;
  color: #fff;
  flex-shrink: 0;
}
.user-info {
  flex: 1;
  min-width: 0;
}
.user-name {
  font-weight: 500;
  color: #fafafa;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.user-role {
  font-size: 11px;
  color: #71717a;
  margin-top: 2px;
}
.host-badge {
  padding: 3px 8px;
  background: #1e40af;
  color: #fff;
  border-radius: 4px;
  font-size: 10px;
  font-weight: 600;
  text-transform: uppercase;
  flex-shrink: 0;
}

.main-content {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.controls { 
  background: #18181b;
  border: 1px solid #27272a;
  border-radius: 8px;
  padding: 16px;
}
.control-row { display: flex; gap: 12px; align-items: center; flex-wrap: wrap; }
button {
  background: #fafafa;
  color: #0a0a0a;
  border: none;
  padding: 10px 20px;
  border-radius: 6px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
}
button:hover:not(:disabled) { background: #e4e4e7; transform: translateY(-1px); }
button:active:not(:disabled) { transform: translateY(0); }
button:disabled { opacity: 0.5; cursor: not-allowed; }
button.secondary {
  background: #27272a;
  color: #fafafa;
  border: 1px solid #3f3f46;
}
button.secondary:hover:not(:disabled) { background: #3f3f46; }
select {
  background: #18181b;
  color: #fafafa;
  border: 1px solid #3f3f46;
  padding: 10px 16px;
  border-radius: 6px;
  font-size: 14px;
  cursor: pointer;
  transition: border-color 0.2s;
}
select:focus { outline: none; border-color: #fafafa; }
select:hover { border-color: #52525b; }

.status {
  background: #18181b;
  border: 1px solid #27272a;
  border-radius: 8px;
  padding: 12px 16px;
  font-size: 14px;
  color: #a1a1aa;
  display: flex;
  align-items: center;
  gap: 8px;
}
.status::before {
  content: '';
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #22c55e;
  animation: pulse 2s infinite;
}
@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}

.video-grid { 
  display: grid;
  grid-template-columns: 1fr;
  gap: 20px;
}
.video-card {
  background: #18181b;
  border: 1px solid #27272a;
  border-radius: 8px;
  padding: 16px;
  overflow: hidden;
}
.video-card h3 {
  font-size: 14px;
  font-weight: 600;
  margin-bottom: 12px;
  color: #a1a1aa;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}
video {
  width: 100%;
  height: auto;
  background: #000;
  border-radius: 6px;
  margin-bottom: 12px;
  max-height: 500px;
  object-fit: contain;
}
.video-controls {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.stats {
  background: #18181b;
  border: 1px solid #27272a;
  border-radius: 8px;
  padding: 12px 16px;
  font-size: 12px;
  color: #71717a;
  font-family: 'Courier New', monospace;
  letter-spacing: 0.5px;
}

.chat-sidebar {
  display: flex;
  flex-direction: column;
  background: #18181b;
  border: 1px solid #27272a;
  border-radius: 8px;
  overflow: hidden;
  height: calc(100vh - 140px);
  position: sticky;
  top: 20px;
}

.chat-header {
  padding: 16px;
  border-bottom: 1px solid #27272a;
  background: #0a0a0a;
}
.chat-header h3 {
  font-size: 16px;
  font-weight: 600;
  color: #fafafa;
  display: flex;
  align-items: center;
  gap: 8px;
}
.chat-header h3::before {
  content: '💬';
  font-size: 18px;
}

.chat-messages {
  flex: 1;
  overflow-y: auto;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  background: #0a0a0a;
}
.chat-messages::-webkit-scrollbar { width: 8px; }
.chat-messages::-webkit-scrollbar-track { background: transparent; }
.chat-messages::-webkit-scrollbar-thumb { background: #3f3f46; border-radius: 4px; }
.chat-messages::-webkit-scrollbar-thumb:hover { background: #52525b; }

.message-group {
  display: flex;
  flex-direction: column;
  gap: 4px;
  max-width: 85%;
}
.message-group.self {
  align-self: flex-end;
  align-items: flex-end;
}
.message-group.other {
  align-self: flex-start;
  align-items: flex-start;
}

.message-sender {
  font-size: 12px;
  font-weight: 600;
  color: #a1a1aa;
  padding: 0 12px;
  margin-bottom: 2px;
}

.message-bubble {
  padding: 10px 14px;
  border-radius: 12px;
  font-size: 14px;
  line-height: 1.4;
  word-wrap: break-word;
  position: relative;
}

.message-group.self .message-bubble {
  background: linear-gradient(135deg, #2563eb 0%, #1e40af 100%);
  color: #fff;
  border-bottom-right-radius: 4px;
}

.message-group.other .message-bubble {
  background: #27272a;
  color: #fafafa;
  border-bottom-left-radius: 4px;
}

.message-time {
  font-size: 11px;
  color: rgba(255, 255, 255, 0.5);
  margin-top: 4px;
  padding: 0 4px;
}
.message-group.other .message-time {
  color: #71717a;
}

.chat-input-container {
  padding: 16px;
  border-top: 1px solid #27272a;
  background: #0a0a0a;
}
.chat-input-wrapper {
  display: flex;
  gap: 8px;
  align-items: flex-end;
}
.chat-input {
  flex: 1;
  background: #18181b;
  border: 1px solid #3f3f46;
  border-radius: 20px;
  padding: 10px 16px;
  font-size: 14px;
  color: #fafafa;
  resize: none;
  max-height: 120px;
  min-height: 40px;
  font-family: inherit;
  transition: border-color 0.2s;
}
.chat-input:focus {
  outline: none;
  border-color: #2563eb;
}
.chat-input::placeholder {
  color: #71717a;
}
.chat-send-btn {
  background: #2563eb;
  color: #fff;
  border: none;
  width: 40px;
  height: 40px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.2s;
  flex-shrink: 0;
}
.chat-send-btn:hover:not(:disabled) {
  background: #1e40af;
  transform: scale(1.05);
}
.chat-send-btn:disabled {
  background: #3f3f46;
  cursor: not-allowed;
}
.chat-send-btn svg {
  width: 20px;
  height: 20px;
}

.empty-chat {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: #71717a;
  font-size: 14px;
  text-align: center;
  padding: 20px;
}
.empty-chat-icon {
  font-size: 48px;
  margin-bottom: 12px;
  opacity: 0.5;
}
</style>
</head>
<body>
<div class="modal-overlay" id="nameModal">
  <div class="modal">
    <h2>Welcome!</h2>
    <p>Please enter your name to join the session</p>
    <input type="text" id="nameInput" placeholder="Your name" maxlength="20" autofocus>
    <button id="joinModalBtn">Join Session</button>
  </div>
</div>

<div class="container" style="display: none;" id="mainContent">
  <h1>P2P Screen Share</h1>
  
  <div class="layout">
    <div class="sidebar">
      <div class="users-panel">
        <h3>Online Users (<span id="userCount">0</span>)</h3>
        <div class="user-list" id="userList"></div>
      </div>
    </div>

    <div class="main-content">
      <div class="controls">
        <div class="control-row">
          <select id="qualitySelect">
            <option value="sd_480p">SD - 480p 30fps</option>
            <option value="hd_720p">HD - 720p 30fps</option>
            <option value="hd_720p_60">HD - 720p 60fps</option>
            <option value="hd_720p_120">HD - 720p 120fps</option>
            <option value="fhd_1080p" selected>Full HD - 1080p 30fps</option>
            <option value="fhd_1080p_60">Full HD - 1080p 60fps</option>
            <option value="fhd_1080p_120">Full HD - 1080p 120fps</option>
            <option value="qhd_1440p_60">2K - 1440p 60fps</option>
          </select>
          <button id="hostBtn">Start Sharing</button>
          <button id="viewBtn" class="secondary">Watch Stream</button>
          <button id="stopBtn" class="secondary" disabled>Stop</button>
        </div>
      </div>

      <div class="status" id="status">Ready to connect</div>

      <div class="video-grid">
        <div class="video-card">
          <h3>Your Screen</h3>
          <video id="localVideo" autoplay muted playsinline></video>
        </div>

        <div class="video-card">
          <h3>Remote View</h3>
          <video id="remoteVideo" autoplay playsinline></video>
          <div class="video-controls">
            <button id="fullscreenBtn" class="secondary" disabled>Fullscreen</button>
            <button id="recordBtn" class="secondary" disabled>Start Recording</button>
            <button id="downloadBtn" class="secondary" disabled style="display:none;">Download</button>
          </div>
        </div>
      </div>

      <div class="stats" id="stats">No active stream</div>
    </div>

    <div class="chat-sidebar">
      <div class="chat-header">
        <h3>Chat</h3>
      </div>
      <div class="chat-messages" id="chatMessages">
        <div class="empty-chat">
          <div class="empty-chat-icon">💬</div>
          <div>No messages yet<br>Start a conversation!</div>
        </div>
      </div>
      <div class="chat-input-container">
        <div class="chat-input-wrapper">
          <textarea id="chatInput" class="chat-input" placeholder="Type a message..." rows="1"></textarea>
          <button id="chatSendBtn" class="chat-send-btn">
            <svg viewBox="0 0 24 24" fill="currentColor">
              <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/>
            </svg>
          </button>
        </div>
      </div>
    </div>
  </div>
</div>

<script>
const nameModal = document.getElementById('nameModal');
const nameInput = document.getElementById('nameInput');
const joinModalBtn = document.getElementById('joinModalBtn');
const mainContent = document.getElementById('mainContent');
const userList = document.getElementById('userList');
const userCount = document.getElementById('userCount');
const wsProtocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
let ws = null;
const localVideo = document.getElementById('localVideo');
const remoteVideo = document.getElementById('remoteVideo');
const status = document.getElementById('status');
const stats = document.getElementById('stats');
const hostBtn = document.getElementById('hostBtn');
const viewBtn = document.getElementById('viewBtn');
const stopBtn = document.getElementById('stopBtn');
const qualitySelect = document.getElementById('qualitySelect');
const fullscreenBtn = document.getElementById('fullscreenBtn');
const recordBtn = document.getElementById('recordBtn');
const downloadBtn = document.getElementById('downloadBtn');
const chatMessages = document.getElementById('chatMessages');
const chatInput = document.getElementById('chatInput');
const chatSendBtn = document.getElementById('chatSendBtn');

let pc = null;
let localStream = null;
let myRole = null;
let myName = '';
let mediaRecorder = null;
let recordedChunks = [];
let statsInterval = null;
let lastBytesReceived = 0;
let lastBytesSent = 0;
let lastStatsTime = Date.now();
const myId = Math.random().toString(36).substr(2, 9);
const users = new Map();

const qualityPresets = {
  sd_480p: { width: 854, height: 480, frameRate: 30, bitrate: 600000, label: '480p 30fps' },
  hd_720p: { width: 1280, height: 720, frameRate: 30, bitrate: 1200000, label: '720p 30fps' },
  hd_720p_60: { width: 1280, height: 720, frameRate: 60, bitrate: 2000000, label: '720p 60fps' },
  hd_720p_120: { width: 1280, height: 720, frameRate: 120, bitrate: 3500000, label: '720p 120fps' },
  fhd_1080p: { width: 1920, height: 1080, frameRate: 30, bitrate: 2500000, label: '1080p 30fps' },
  fhd_1080p_60: { width: 1920, height: 1080, frameRate: 60, bitrate: 4000000, label: '1080p 60fps' },
  fhd_1080p_120: { width: 1920, height: 1080, frameRate: 120, bitrate: 6000000, label: '1080p 120fps' },
  qhd_1440p_60: { width: 2560, height: 1440, frameRate: 60, bitrate: 8000000, label: '1440p 60fps' }
};

const config = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' }
  ]
};

nameInput.addEventListener('keypress', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    joinModalBtn.click();
  }
});

joinModalBtn.addEventListener('click', () => {
  const name = nameInput.value.trim();
  if (name && name.length > 0) {
    myName = name;
    nameModal.style.display = 'none';
    mainContent.style.display = 'block';
    initializeWebSocket();
  }
});

chatInput.addEventListener('input', function() {
  this.style.height = 'auto';
  this.style.height = Math.min(this.scrollHeight, 120) + 'px';
});

chatInput.addEventListener('keypress', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    chatSendBtn.click();
  }
});

function initializeWebSocket() {
  try {
    ws = new WebSocket(\`\${wsProtocol}//\${location.host}/ws\`);
    
    ws.addEventListener('open', () => {
      status.textContent = 'Connected to signaling server';
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'join', id: myId, role: 'viewer', name: myName }));
      }
    });

    ws.addEventListener('error', (err) => {
      status.textContent = 'WebSocket error - check connection';
      console.error('WebSocket error:', err);
    });

    ws.addEventListener('close', () => {
      status.textContent = 'Disconnected from server';
    });

    ws.addEventListener('message', async (e) => {
      try {
        const data = JSON.parse(e.data);
        
        if (data.type === 'user-list') {
          updateUserList(data.users);
        } else if (data.type === 'peer-joined') {
          if (data.id !== myId) {
            users.set(data.id, { name: data.name, role: data.role });
            status.textContent = \`\${data.name} joined as \${data.role}\`;
            if (myRole === 'host' && data.role === 'viewer' && pc) {
              await createOffer();
            }
          }
        } else if (data.type === 'offer') {
          await handleOffer(data.offer);
        } else if (data.type === 'answer') {
          await handleAnswer(data.answer);
        } else if (data.type === 'ice-candidate') {
          await handleIceCandidate(data.candidate);
        } else if (data.type === 'chat') {
          displayMessage(data.message, data.sender, data.timestamp, false);
        } else if (data.type === 'peer-left') {
          users.delete(data.id);
          status.textContent = \`\${data.name || 'A user'} disconnected\`;
        }
      } catch (err) {
        console.error('Error handling message:', err);
      }
    });
  } catch (err) {
    console.error('WebSocket initialization error:', err);
    status.textContent = 'Failed to connect to server';
  }
}

function updateUserList(userArray) {
  users.clear();
  userArray.forEach(user => {
    users.set(user.id, { name: user.name, role: user.role });
  });
  
  userCount.textContent = users.size;
  userList.innerHTML = '';
  
  users.forEach((user, id) => {
    const userItem = document.createElement('div');
    userItem.className = 'user-item';
    
    const avatar = document.createElement('div');
    avatar.className = 'user-avatar';
    avatar.textContent = user.name.charAt(0).toUpperCase();
    
    const userInfo = document.createElement('div');
    userInfo.className = 'user-info';
    
    const userName = document.createElement('div');
    userName.className = 'user-name';
    userName.textContent = user.name + (id === myId ? ' (You)' : '');
    
    const userRole = document.createElement('div');
    userRole.className = 'user-role';
    userRole.textContent = user.role === 'host' ? 'Sharing screen' : 'Watching';
    
    userInfo.appendChild(userName);
    userInfo.appendChild(userRole);
    
    userItem.appendChild(avatar);
    userItem.appendChild(userInfo);
    
    if (user.role === 'host') {
      const badge = document.createElement('span');
      badge.className = 'host-badge';
      badge.textContent = 'Host';
      userItem.appendChild(badge);
    }
    
    userList.appendChild(userItem);
  });
}

hostBtn.addEventListener('click', async () => {
  myRole = 'host';
  try {
    const quality = qualityPresets[qualitySelect.value];
    
    localStream = await navigator.mediaDevices.getDisplayMedia({
      video: {
        width: { ideal: quality.width },
        height: { ideal: quality.height },
        frameRate: { ideal: quality.frameRate },
        cursor: "always"
      },
      audio: {
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
        sampleRate: 48000,
        channelCount: 2
      }
    });
    
    localVideo.srcObject = localStream;
    status.textContent = \`Sharing screen (\${quality.label}) - Waiting for viewer...\`;
    
    pc = new RTCPeerConnection(config);
    setupHostConnection(quality);
    
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'join', id: myId, role: 'host', name: myName }));
    }
    
    hostBtn.disabled = true;
    viewBtn.disabled = true;
    qualitySelect.disabled = true;
    stopBtn.disabled = false;
    
    localStream.getVideoTracks()[0].addEventListener('ended', () => {
      cleanup();
    });
    
  } catch (err) {
    status.textContent = 'Error: ' + err.message;
    console.error('Host error:', err);
    cleanup();
  }
});

viewBtn.addEventListener('click', async () => {
  myRole = 'viewer';
  status.textContent = 'Waiting for host to share screen...';
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type: 'join', id: myId, role: 'viewer', name: myName }));
  }
  hostBtn.disabled = true;
  viewBtn.disabled = true;
  stopBtn.disabled = false;
});

stopBtn.addEventListener('click', () => {
  cleanup();
  location.reload();
});

fullscreenBtn.addEventListener('click', () => {
  if (remoteVideo.requestFullscreen) {
    remoteVideo.requestFullscreen();
  } else if (remoteVideo.webkitRequestFullscreen) {
    remoteVideo.webkitRequestFullscreen();
  } else if (remoteVideo.msRequestFullscreen) {
    remoteVideo.msRequestFullscreen();
  }
});

recordBtn.addEventListener('click', () => {
  if (!mediaRecorder || mediaRecorder.state === 'inactive') {
    startRecording();
  } else {
    stopRecording();
  }
});

downloadBtn.addEventListener('click', () => {
  if (recordedChunks.length > 0) {
    const blob = new Blob(recordedChunks, { type: 'video/webm' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    a.download = \`stream-\${timestamp}.webm\`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 100);
  }
});

function startRecording() {
  if (!remoteVideo.srcObject) return;
  
  recordedChunks = [];
  const stream = remoteVideo.srcObject;
  
  try {
    const options = MediaRecorder.isTypeSupported('video/webm;codecs=vp9,opus')
      ? { mimeType: 'video/webm;codecs=vp9,opus' }
      : { mimeType: 'video/webm;codecs=vp8,opus' };
    
    mediaRecorder = new MediaRecorder(stream, options);
    
    mediaRecorder.addEventListener('dataavailable', (e) => {
      if (e.data && e.data.size > 0) {
        recordedChunks.push(e.data);
      }
    });
    
    mediaRecorder.addEventListener('stop', () => {
      recordBtn.textContent = 'Start Recording';
      downloadBtn.style.display = 'inline-block';
      status.textContent = 'Recording stopped - Ready to download';
    });
    
    mediaRecorder.start(1000);
    recordBtn.textContent = 'Stop Recording';
    status.textContent = 'Recording in progress...';
  } catch (err) {
    status.textContent = 'Recording error: ' + err.message;
    console.error('Recording error:', err);
  }
}

function stopRecording() {
  if (mediaRecorder && mediaRecorder.state !== 'inactive') {
    mediaRecorder.stop();
  }
}

chatSendBtn.addEventListener('click', () => {
  const msg = chatInput.value.trim();
  if (msg && ws && ws.readyState === WebSocket.OPEN) {
    const timestamp = new Date().toISOString();
    ws.send(JSON.stringify({ type: 'chat', message: msg, sender: myName, timestamp }));
    displayMessage(msg, myName, timestamp, true);
    chatInput.value = '';
    chatInput.style.height = 'auto';
  }
});

function displayMessage(msg, sender, timestamp, isSelf) {
  const empty = chatMessages.querySelector('.empty-chat');
  if (empty) {
    empty.remove();
  }
  
  const messageGroup = document.createElement('div');
  messageGroup.className = \`message-group \${isSelf ? 'self' : 'other'}\`;
  
  if (!isSelf) {
    const senderDiv = document.createElement('div');
    senderDiv.className = 'message-sender';
    senderDiv.textContent = sender;
    messageGroup.appendChild(senderDiv);
  }
  
  const bubble = document.createElement('div');
  bubble.className = 'message-bubble';
  bubble.textContent = msg;
  
  const time = document.createElement('div');
  time.className = 'message-time';
  try {
    const date = new Date(timestamp);
    time.textContent = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } catch (e) {
    time.textContent = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
  
  bubble.appendChild(time);
  messageGroup.appendChild(bubble);
  chatMessages.appendChild(messageGroup);
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

function setupHostConnection(quality) {
  if (!localStream || !pc) return;
  
  localStream.getTracks().forEach(t => {
    try {
      const sender = pc.addTrack(t, localStream);
      
      if (t.kind === 'video') {
        const params = sender.getParameters();
        if (!params.encodings) params.encodings = [{}];
        
        params.encodings[0].maxBitrate = quality.bitrate;
        params.encodings[0].maxFramerate = quality.frameRate;
        
        sender.setParameters(params).catch(err => {
          console.error('Error setting video parameters:', err);
        });
      }
      
      if (t.kind === 'audio') {
        const params = sender.getParameters();
        if (!params.encodings) params.encodings = [{}];
        params.encodings[0].maxBitrate = 128000;
        sender.setParameters(params).catch(err => {
          console.error('Error setting audio parameters:', err);
        });
      }
    } catch (err) {
      console.error('Error adding track:', err);
    }
  });
  
  pc.addEventListener('icecandidate', (e) => {
    if (e.candidate && ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ 
        type: 'ice-candidate', 
        candidate: e.candidate 
      }));
    }
  });
  
  pc.addEventListener('connectionstatechange', () => {
    status.textContent = 'Connection: ' + pc.connectionState;
    if (pc.connectionState === 'connected') {
      status.textContent = 'Streaming to viewer!';
      monitorStats();
    } else if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed') {
      status.textContent = 'Connection lost';
      stopStatsMonitoring();
    }
  });
}

async function createOffer() {
  if (!pc) return;
  
  try {
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'offer', offer }));
    }
  } catch (err) {
    console.error('Error creating offer:', err);
    status.textContent = 'Error creating offer: ' + err.message;
  }
}

async function handleOffer(offer) {
  try {
    pc = new RTCPeerConnection(config);
    
    pc.addEventListener('track', (e) => {
      if (e.streams && e.streams[0]) {
        remoteVideo.srcObject = e.streams[0];
        status.textContent = 'Receiving stream!';
        fullscreenBtn.disabled = false;
        recordBtn.disabled = false;
        monitorStats();
      }
    });
    
    pc.addEventListener('icecandidate', (e) => {
      if (e.candidate && ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ 
          type: 'ice-candidate', 
          candidate: e.candidate 
        }));
      }
    });
    
    pc.addEventListener('connectionstatechange', () => {
      status.textContent = 'Connection: ' + pc.connectionState;
      if (pc.connectionState === 'connected') {
        status.textContent = 'Watching stream!';
      } else if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed') {
        status.textContent = 'Connection lost';
        stopStatsMonitoring();
      }
    });
    
    await pc.setRemoteDescription(offer);
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'answer', answer }));
    }
  } catch (err) {
    console.error('Error handling offer:', err);
    status.textContent = 'Error handling offer: ' + err.message;
  }
}

async function handleAnswer(answer) {
  if (!pc) return;
  
  try {
    await pc.setRemoteDescription(answer);
  } catch (err) {
    console.error('Error handling answer:', err);
  }
}

async function handleIceCandidate(candidate) {
  if (!pc || !pc.remoteDescription) return;
  
  try {
    await pc.addIceCandidate(candidate);
  } catch (err) {
    console.error('Error adding ICE candidate:', err);
  }
}

function monitorStats() {
  if (!pc || statsInterval) return;
  
  statsInterval = setInterval(async () => {
    if (!pc) {
      stopStatsMonitoring();
      return;
    }
    
    try {
      const statsReport = await pc.getStats();
      const now = Date.now();
      const timeDiff = (now - lastStatsTime) / 1000;
      lastStatsTime = now;
      
      let infoText = '';
      
      statsReport.forEach(report => {
        if (report.type === 'inbound-rtp' && report.mediaType === 'video') {
          const fps = Math.round(report.framesPerSecond || 0);
          const bytesRecv = report.bytesReceived || 0;
          const bitrate = Math.round(((bytesRecv - lastBytesReceived) * 8) / 1000 / timeDiff);
          lastBytesReceived = bytesRecv;
          infoText += \`▼ \${fps}fps \${bitrate}kbps | \`;
        }
        if (report.type === 'outbound-rtp' && report.mediaType === 'video') {
          const bytesSent = report.bytesSent || 0;
          const bitrate = Math.round(((bytesSent - lastBytesSent) * 8) / 1000 / timeDiff);
          lastBytesSent = bytesSent;
          infoText += \`▲ \${bitrate}kbps\`;
        }
      });
      
      if (infoText) {
        stats.textContent = infoText;
      }
    } catch (err) {
      console.error('Stats error:', err);
    }
  }, 1000);
}

function stopStatsMonitoring() {
  if (statsInterval) {
    clearInterval(statsInterval);
    statsInterval = null;
  }
}

function cleanup() {
  stopStatsMonitoring();
  
  if (mediaRecorder && mediaRecorder.state !== 'inactive') {
    try {
      mediaRecorder.stop();
    } catch (err) {
      console.error('Error stopping recorder:', err);
    }
  }
  
  if (localStream) {
    localStream.getTracks().forEach(t => {
      try {
        t.stop();
      } catch (err) {
        console.error('Error stopping track:', err);
      }
    });
    localVideo.srcObject = null;
  }
  
  if (pc) {
    try {
      pc.close();
    } catch (err) {
      console.error('Error closing peer connection:', err);
    }
    pc = null;
  }
  
  if (ws && ws.readyState === WebSocket.OPEN) {
    try {
      ws.close();
    } catch (err) {
      console.error('Error closing WebSocket:', err);
    }
  }
}

window.addEventListener('beforeunload', cleanup);
</script>
</body>
</html>
`;

console.log("Server running at http://localhost:3000");