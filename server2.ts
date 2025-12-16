import { type ServerWebSocket } from "bun";

// --- Types ---
type WebSocketData = {
  id: string;
  name: string;
  role: "host" | "viewer";
};

type WS = ServerWebSocket<WebSocketData>;

type SignalMessage = 
  | { type: "join"; id: string; role: "host" | "viewer"; name: string }
  | { type: "offer"; offer: RTCSessionDescriptionInit; targetId: string }
  | { type: "answer"; answer: RTCSessionDescriptionInit; targetId: string }
  | { type: "ice-candidate"; candidate: RTCIceCandidate; targetId: string }
  | { type: "chat"; message: string; sender: string; timestamp: string }
  | { type: "user-list"; users: any[] }
  | { type: "peer-joined"; id: string; role: string; name: string }
  | { type: "peer-left"; id: string; name: string }
  | { type: "ping" } | { type: "pong" };

const clients = new Map<string, WS>();

// --- Server ---
const server = Bun.serve<WebSocketData>({
  port: 3000,
  async fetch(req, server) {
    const url = new URL(req.url);
    if (url.pathname === "/") return new Response(html, { headers: { "Content-Type": "text/html" } });
    
    if (url.pathname === "/ws") {
      const success = server.upgrade(req, {
        data: { id: "", name: "", role: "viewer" },
      });
      return success ? undefined : new Response("Upgrade failed", { status: 500 });
    }
    return new Response("Not found", { status: 404 });
  },

  websocket: {
    open(ws) {},
    message(ws, msg) {
      try {
        const data = JSON.parse(typeof msg === "string" ? msg : new TextDecoder().decode(msg)) as SignalMessage;

        if (data.type === "ping") {
          ws.send(JSON.stringify({ type: "pong" }));
          return;
        }

        if (data.type === "join") {
          ws.data.id = data.id;
          ws.data.role = data.role;
          ws.data.name = data.name;
          clients.set(data.id, ws);
          broadcastUserList();
          broadcast({ type: "peer-joined", id: data.id, role: data.role, name: data.name }, ws);
        } 
        else if (data.type === "offer" || data.type === "answer" || data.type === "ice-candidate") {
          const targetWs = clients.get(data.targetId);
          if (targetWs) {
            const payload = { ...data, senderId: ws.data.id };
            targetWs.send(JSON.stringify(payload));
          }
        } 
        else if (data.type === "chat") {
          broadcast(data, null);
        }
      } catch (err) {
        console.error("WS Error:", err);
      }
    },
    close(ws) {
      if (ws.data.id) {
        clients.delete(ws.data.id);
        broadcastUserList();
        broadcast({ type: "peer-left", id: ws.data.id, name: ws.data.name }, ws);
      }
    },
  },
});

function broadcast(msg: any, exclude: WS | null) {
  const str = JSON.stringify(msg);
  for (const client of clients.values()) {
    if (client !== exclude && client.readyState === 1) client.send(str);
  }
}

function broadcastUserList() {
  const users = Array.from(clients.values()).map((c) => ({
    id: c.data.id,
    name: c.data.name,
    role: c.data.role,
  }));
  broadcast({ type: "user-list", users }, null);
}

console.log(`Server running at http://localhost:${server.port}`);

const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Discord Clone Stream</title>
<link href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0/css/all.min.css" rel="stylesheet">
<style>
:root {
  --bg-tertiary: #202225;
  --bg-secondary: #2f3136;
  --bg-primary: #36393f;
  --bg-floating: #18191c;
  --channel-textarea: #40444b;
  --header-primary: #ffffff;
  --header-secondary: #b9bbbe;
  --text-normal: #dcddde;
  --text-muted: #72767d;
  --interactive-normal: #b9bbbe;
  --interactive-hover: #dcddde;
  --interactive-active: #ffffff;
  --brand: #5865F2;
  --brand-hover: #4752c4;
  --danger: #ed4245;
  --success: #3ba55c;
  --font: "gg sans", "Inter", "Helvetica Neue", Helvetica, Arial, sans-serif;
}

* { margin: 0; padding: 0; box-sizing: border-box; }

body {
  font-family: var(--font);
  background: var(--bg-tertiary);
  color: var(--text-normal);
  height: 100vh;
  overflow: hidden;
  user-select: none;
}

/* --- Modal --- */
.modal-layer {
  position: fixed; top: 0; left: 0; width: 100%; height: 100%;
  background: rgba(0,0,0,0.85);
  z-index: 1000;
  display: flex; align-items: center; justify-content: center;
  opacity: 0; pointer-events: none; transition: opacity 0.2s;
}
.modal-layer.active { opacity: 1; pointer-events: auto; }

.modal {
  background: var(--bg-primary);
  width: 440px;
  border-radius: 5px;
  box-shadow: 0 0 0 1px rgba(32,34,37,.6), 0 2px 10px 0 rgba(0,0,0,.2);
  display: flex; flex-direction: column;
  overflow: hidden;
  transform: scale(0.95); transition: transform 0.2s;
}
.modal-layer.active .modal { transform: scale(1); }

.modal-header { padding: 24px; text-align: center; }
.modal-header h2 { font-weight: 700; font-size: 24px; color: var(--header-primary); margin-bottom: 8px; }
.modal-header p { color: var(--header-secondary); font-size: 14px; }

.modal-content { padding: 0 24px 24px 24px; }
.input-group { margin-bottom: 20px; }
.input-label { 
  display: block; color: var(--header-secondary); 
  font-size: 12px; font-weight: 700; text-transform: uppercase; 
  margin-bottom: 8px; 
}
.discord-input {
  width: 100%; background: var(--bg-tertiary); border: 1px solid rgba(0,0,0,0.3);
  padding: 10px; border-radius: 3px; color: var(--text-normal);
  font-size: 16px; outline: none; transition: border-color 0.2s;
}
.discord-input:focus { border-color: var(--brand); }

.quality-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 15px; }
.select-wrapper { position: relative; }
.discord-select {
  width: 100%; appearance: none;
  background: var(--bg-tertiary); border: 1px solid rgba(0,0,0,0.3);
  padding: 10px; border-radius: 3px; color: var(--text-normal);
  cursor: pointer; font-size: 14px; outline: none;
}
.select-arrow {
  position: absolute; right: 10px; top: 50%; transform: translateY(-50%);
  color: var(--text-muted); pointer-events: none; font-size: 12px;
}

.modal-footer {
  background: var(--bg-secondary); padding: 16px 24px;
  display: flex; justify-content: flex-end; gap: 10px;
}
.btn {
  padding: 10px 24px; border: none; border-radius: 3px;
  font-size: 14px; font-weight: 500; color: white; cursor: pointer;
  transition: background 0.2s;
}
.btn-brand { background: var(--brand); }
.btn-brand:hover { background: var(--brand-hover); }
.btn-grey { background: transparent; color: var(--text-normal); }
.btn-grey:hover { text-decoration: underline; }

/* --- Main Layout --- */
.app {
  display: grid;
  grid-template-columns: 240px 1fr 300px; /* Sidebar | Stage | Chat */
  height: 100vh;
}

/* Sidebar (Users) */
.sidebar {
  background: var(--bg-secondary);
  display: flex; flex-direction: column;
}
.sidebar-header {
  height: 48px; padding: 0 16px; 
  display: flex; align-items: center; 
  box-shadow: 0 1px 0 rgba(4,4,5,0.2), 0 1.5px 0 rgba(6,6,7,0.05), 0 2px 0 rgba(4,4,5,0.05);
  font-weight: 600; color: var(--header-primary);
}
.user-list { flex: 1; overflow-y: auto; padding: 10px 8px; }
.user-category {
  padding: 18px 8px 4px 8px; font-size: 12px; font-weight: 700;
  color: var(--header-secondary); text-transform: uppercase;
}
.user-item {
  display: flex; align-items: center; gap: 10px;
  padding: 8px; border-radius: 4px; margin-bottom: 2px;
  cursor: pointer; opacity: 0.9;
}
.user-item:hover { background: rgba(79,84,92,0.16); opacity: 1; }
.avatar {
  width: 32px; height: 32px; border-radius: 50%;
  background: var(--brand); color: white;
  display: flex; align-items: center; justify-content: center;
  font-size: 14px; font-weight: 600;
}
.user-info { display: flex; flex-direction: column; }
.user-name { font-size: 14px; font-weight: 500; color: var(--header-primary); }
.user-tag { font-size: 11px; color: var(--header-secondary); }
.badge-live {
  background: var(--danger); color: white; 
  font-size: 9px; padding: 2px 4px; border-radius: 3px; 
  margin-left: auto; font-weight: 700; text-transform: uppercase;
}

/* Stage (Video) */
.stage {
  background: var(--bg-primary);
  display: flex; flex-direction: column;
  position: relative;
}
.video-container {
  flex: 1; display: flex; align-items: center; justify-content: center;
  background: black; overflow: hidden; position: relative;
  margin: 10px; border-radius: 8px;
}
video { max-width: 100%; max-height: 100%; }
.placeholder-state {
  text-align: center; color: var(--text-muted);
}
.placeholder-icon {
  width: 100px; height: 100px; border-radius: 50%;
  background: var(--bg-tertiary); margin: 0 auto 20px;
  display: flex; align-items: center; justify-content: center;
  font-size: 40px;
}

/* Control Dock */
.control-dock {
  background: var(--bg-floating);
  padding: 12px 20px;
  display: flex; align-items: center; justify-content: space-between;
}
.dock-left { display: flex; align-items: center; gap: 10px; }
.connection-status {
  font-size: 12px; font-weight: 600; color: var(--success);
  display: flex; align-items: center; gap: 6px;
}
.connection-dot { width: 6px; height: 6px; border-radius: 50%; background: currentColor; }

.dock-actions { display: flex; gap: 12px; }
.action-btn {
  width: 44px; height: 44px; border-radius: 12px;
  background: var(--bg-primary); border: none;
  color: var(--text-normal); font-size: 18px;
  cursor: pointer; transition: all 0.2s;
  display: flex; align-items: center; justify-content: center;
}
.action-btn:hover { background: var(--channel-textarea); color: var(--interactive-active); }
.action-btn.active { background: var(--success); color: white; }
.action-btn.danger { background: var(--danger); color: white; }
.action-btn:disabled { opacity: 0.5; cursor: not-allowed; }

/* Chat */
.chat-panel {
  background: var(--bg-primary);
  border-left: 1px solid var(--bg-tertiary);
  display: flex; flex-direction: column;
}
.chat-header {
  height: 48px; padding: 0 16px;
  display: flex; align-items: center; gap: 10px;
  font-weight: 600; color: var(--header-primary);
  box-shadow: 0 1px 0 rgba(4,4,5,0.2);
}
.chat-messages {
  flex: 1; overflow-y: auto; padding: 16px;
  display: flex; flex-direction: column; gap: 16px;
}
.message { display: flex; gap: 12px; }
.msg-avatar {
  width: 40px; height: 40px; border-radius: 50%;
  background: var(--bg-secondary); flex-shrink: 0;
  display: flex; align-items: center; justify-content: center;
  color: var(--header-primary); font-weight: 600;
}
.msg-content { flex: 1; min-width: 0; }
.msg-header { margin-bottom: 2px; }
.msg-author { font-weight: 500; color: var(--header-primary); margin-right: 6px; font-size: 15px; }
.msg-time { font-size: 11px; color: var(--text-muted); font-weight: 400; }
.msg-text { 
  font-size: 14px; line-height: 1.375rem; color: var(--text-normal); 
  white-space: pre-wrap; word-break: break-word;
}

.chat-input-area {
  padding: 0 16px 20px 16px;
  background: var(--bg-primary);
}
.input-wrapper {
  background: var(--channel-textarea);
  border-radius: 8px; padding: 10px;
  display: flex; align-items: center;
}
.chat-box {
  background: transparent; border: none; width: 100%;
  color: var(--text-normal); outline: none; font-size: 15px;
}

/* Responsive */
@media (max-width: 900px) {
  .app { grid-template-columns: 1fr; }
  .sidebar, .chat-panel { display: none; }
}
</style>
</head>
<body>

<!-- Join Modal -->
<div class="modal-layer active" id="loginModal">
  <div class="modal">
    <div class="modal-header">
      <h2>Join Server</h2>
      <p>Enter your nickname to enter the channel.</p>
    </div>
    <div class="modal-content">
      <div class="input-group">
        <label class="input-label">USERNAME</label>
        <input type="text" id="usernameInput" class="discord-input" maxlength="20" autofocus>
      </div>
    </div>
    <div class="modal-footer">
      <button class="btn btn-brand" id="loginBtn">Join Session</button>
    </div>
  </div>
</div>

<!-- Stream Settings Modal -->
<div class="modal-layer" id="streamModal">
  <div class="modal">
    <div class="modal-header">
      <h2>Stream Quality</h2>
      <p>Select your preferred stream settings.</p>
    </div>
    <div class="modal-content">
      <div class="quality-grid">
        <div class="input-group">
          <label class="input-label">Resolution</label>
          <div class="select-wrapper">
            <select id="resSelect" class="discord-select">
              <option value="480">480p</option>
              <option value="720" selected>720p</option>
              <option value="1080">1080p</option>
              <option value="1440">1440p</option>
              <option value="2160">4K Source</option>
            </select>
            <i class="fas fa-chevron-down select-arrow"></i>
          </div>
        </div>
        <div class="input-group">
          <label class="input-label">Frame Rate</label>
          <div class="select-wrapper">
            <select id="fpsSelect" class="discord-select">
              <option value="15">15 FPS</option>
              <option value="30" selected>30 FPS</option>
              <option value="60">60 FPS</option>
            </select>
            <i class="fas fa-chevron-down select-arrow"></i>
          </div>
        </div>
      </div>
    </div>
    <div class="modal-footer">
      <button class="btn btn-grey" id="cancelStreamBtn">Cancel</button>
      <button class="btn btn-brand" id="goLiveBtn">Go Live</button>
    </div>
  </div>
</div>

<div class="app" style="opacity: 0.1" id="app"> <!-- Hidden until login -->
  
  <!-- Sidebar -->
  <aside class="sidebar">
    <div class="sidebar-header">
      <i class="fas fa-hashtag" style="margin-right:8px; color:var(--text-muted)"></i> general
    </div>
    <div class="user-list" id="userList">
      <!-- Users injected here -->
    </div>
  </aside>

  <!-- Main Stage -->
  <main class="stage">
    <div class="video-container">
      <div class="placeholder-state" id="placeholder">
        <div class="placeholder-icon">
          <i class="fas fa-gamepad"></i>
        </div>
        <h3>No one is streaming</h3>
        <p>Waiting for a host to start...</p>
      </div>
      <video id="mainVideo" autoplay playsinline style="display:none"></video>
    </div>

    <div class="control-dock">
      <div class="dock-left">
        <div class="connection-status">
          <div class="connection-dot"></div>
          <span id="connStatus">Voice Connected</span>
        </div>
      </div>
      <div class="dock-actions">
        <!-- Share Screen -->
        <button class="action-btn" id="shareTriggerBtn" title="Share Screen">
          <i class="fas fa-desktop"></i>
        </button>
        <!-- Stop Share (Hidden initially) -->
        <button class="action-btn danger" id="stopShareBtn" title="Stop Streaming" style="display:none">
          <i class="fas fa-times"></i>
        </button>
        
        <div style="width:1px; background:var(--bg-tertiary); height:24px; margin:0 4px;"></div>
        
        <button class="action-btn" id="fsBtn" title="Fullscreen">
          <i class="fas fa-expand"></i>
        </button>
      </div>
    </div>
  </main>

  <!-- Chat -->
  <aside class="chat-panel">
    <div class="chat-header">
      <i class="fas fa-comment-alt" style="margin-right:8px; color:var(--text-muted)"></i> Stream Chat
    </div>
    <div class="chat-messages" id="chatList">
      <!-- Messages -->
    </div>
    <div class="chat-input-area">
      <div class="input-wrapper">
        <input type="text" class="chat-box" id="chatInput" placeholder="Message #general">
      </div>
    </div>
  </aside>

</div>

<script>
// --- Config & State ---
const WS_URL = (location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/ws';
const ICE_CONFIG = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] };

const state = {
  id: Math.random().toString(36).substr(2, 9),
  name: '',
  role: 'viewer',
  ws: null,
  stream: null,
  peers: new Map() // Map<targetId, RTCPeerConnection>
};

// --- DOM Elements ---
const el = id => document.getElementById(id);

// --- Initialization ---
el('usernameInput').addEventListener('keydown', e => e.key === 'Enter' && el('loginBtn').click());

el('loginBtn').onclick = () => {
  const name = el('usernameInput').value.trim();
  if(!name) return;
  state.name = name;
  el('loginModal').classList.remove('active');
  el('app').style.opacity = '1';
  connectWS();
};

// --- WebSocket Logic ---
function connectWS() {
  state.ws = new WebSocket(WS_URL);
  
  state.ws.onopen = () => {
    send({ type: 'join', id: state.id, role: 'viewer', name: state.name });
    el('connStatus').innerText = "Connected / Voice Connected";
    el('connStatus').style.color = "var(--success)";
    // Keep alive
    setInterval(() => {
      if(state.ws.readyState === 1) send({ type: 'ping' });
    }, 30000);
  };

  state.ws.onclose = () => {
    el('connStatus').innerText = "Disconnected";
    el('connStatus').style.color = "var(--danger)";
    setTimeout(connectWS, 3000);
  };

  state.ws.onmessage = (e) => {
    const msg = JSON.parse(e.data);
    handleMessage(msg);
  };
}

function send(msg) {
  if (state.ws && state.ws.readyState === 1) state.ws.send(JSON.stringify(msg));
}

function handleMessage(msg) {
  switch(msg.type) {
    case 'user-list': updateUsers(msg.users); break;
    case 'chat': addChatMessage(msg); break;
    case 'peer-joined':
      // If I am Host, I need to call the new peer
      if (state.role === 'host') initiatePeer(msg.id);
      break;
    case 'peer-left':
      if (state.peers.has(msg.id)) {
        state.peers.get(msg.id).close();
        state.peers.delete(msg.id);
      }
      break;
    
    // WebRTC Signaling
    case 'offer': handleOffer(msg); break;
    case 'answer': handleAnswer(msg); break;
    case 'ice-candidate': handleCandidate(msg); break;
  }
}

// --- Streaming Logic (Host) ---
el('shareTriggerBtn').onclick = () => {
  el('streamModal').classList.add('active');
};

el('cancelStreamBtn').onclick = () => {
  el('streamModal').classList.remove('active');
};

el('goLiveBtn').onclick = async () => {
  const height = parseInt(el('resSelect').value);
  const fps = parseInt(el('fpsSelect').value);
  
  el('streamModal').classList.remove('active');

  try {
    state.stream = await navigator.mediaDevices.getDisplayMedia({
      video: {
        height: { ideal: height },
        frameRate: { ideal: fps }
      },
      audio: {
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false
      }
    });

    state.role = 'host';
    state.stream.getVideoTracks()[0].onended = stopStreaming;
    
    // UI Update
    el('mainVideo').srcObject = state.stream;
    el('mainVideo').style.display = 'block';
    el('mainVideo').muted = true; // Host shouldn't hear themselves
    el('placeholder').style.display = 'none';
    
    el('shareTriggerBtn').style.display = 'none';
    el('stopShareBtn').style.display = 'flex';
    
    // Notify Server
    send({ type: 'join', id: state.id, role: 'host', name: state.name });

  } catch (err) {
    console.error("Stream Error:", err);
    alert("Could not start stream. Check permissions.");
  }
};

el('stopShareBtn').onclick = stopStreaming;

function stopStreaming() {
  if (state.stream) {
    state.stream.getTracks().forEach(t => t.stop());
    state.stream = null;
  }
  
  // Close all peer connections
  state.peers.forEach(pc => pc.close());
  state.peers.clear();

  state.role = 'viewer';
  
  // UI Reset
  el('mainVideo').style.display = 'none';
  el('mainVideo').srcObject = null;
  el('placeholder').style.display = 'block';
  el('shareTriggerBtn').style.display = 'flex';
  el('stopShareBtn').style.display = 'none';
  
  send({ type: 'join', id: state.id, role: 'viewer', name: state.name });
}

// --- WebRTC Core (P2P Mesh) ---

function createPeerConnection(targetId) {
  const pc = new RTCPeerConnection(ICE_CONFIG);
  
  pc.onicecandidate = e => {
    if (e.candidate) send({ type: 'ice-candidate', candidate: e.candidate, targetId });
  };

  pc.ontrack = e => {
    // If I am a viewer, this is the stream I want to see
    if (state.role === 'viewer') {
      el('mainVideo').srcObject = e.streams[0];
      el('mainVideo').style.display = 'block';
      el('mainVideo').muted = false;
      el('placeholder').style.display = 'none';
    }
  };

  state.peers.set(targetId, pc);
  return pc;
}

// Host initiates connection to new viewer
async function initiatePeer(targetId) {
  if (!state.stream) return;
  
  const pc = createPeerConnection(targetId);
  // Add tracks
  state.stream.getTracks().forEach(track => pc.addTrack(track, state.stream));
  
  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);
  
  send({ type: 'offer', offer, targetId });
}

// Viewer receives offer
async function handleOffer(msg) {
  const pc = createPeerConnection(msg.senderId);
  await pc.setRemoteDescription(msg.offer);
  
  const answer = await pc.createAnswer();
  await pc.setLocalDescription(answer);
  
  send({ type: 'answer', answer, targetId: msg.senderId });
}

async function handleAnswer(msg) {
  const pc = state.peers.get(msg.senderId);
  if (pc) await pc.setRemoteDescription(msg.answer);
}

async function handleCandidate(msg) {
  const pc = state.peers.get(msg.senderId);
  if (pc) await pc.addIceCandidate(msg.candidate);
}

// --- Chat & UI Helpers ---
el('chatInput').addEventListener('keydown', e => {
  if (e.key === 'Enter') {
    const text = el('chatInput').value.trim();
    if (text) {
      send({ type: 'chat', message: text, sender: state.name, timestamp: new Date().toISOString() });
      el('chatInput').value = '';
    }
  }
});

function addChatMessage(data) {
  const list = el('chatList');
  const div = document.createElement('div');
  div.className = 'message';
  
  const time = new Date(data.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const avatarLetter = data.sender.charAt(0).toUpperCase();
  
  div.innerHTML = \`
    <div class="msg-avatar">\${avatarLetter}</div>
    <div class="msg-content">
      <div class="msg-header">
        <span class="msg-author">\${escapeHtml(data.sender)}</span>
        <span class="msg-time">\${time}</span>
      </div>
      <div class="msg-text">\${escapeHtml(data.message)}</div>
    </div>
  \`;
  
  list.appendChild(div);
  list.scrollTop = list.scrollHeight;
}

function updateUsers(users) {
  const list = el('userList');
  list.innerHTML = '<div class="user-category">Online</div>';
  
  users.forEach(u => {
    const div = document.createElement('div');
    div.className = 'user-item';
    div.innerHTML = \`
      <div class="avatar">\${u.name.charAt(0).toUpperCase()}</div>
      <div class="user-info">
        <div class="user-name">\${escapeHtml(u.name)} \${u.id === state.id ? '(You)' : ''}</div>
        <div class="user-tag">\${u.role}</div>
      </div>
      \${u.role === 'host' ? '<div class="badge-live">LIVE</div>' : ''}
    \`;
    list.appendChild(div);
  });
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

el('fsBtn').onclick = () => {
  if (!document.fullscreenElement) {
    el('mainVideo').requestFullscreen().catch(e => console.log(e));
  } else {
    document.exitFullscreen();
  }
};
</script>
</body>
</html>`;