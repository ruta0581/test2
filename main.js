let ws, pc, dataChannel;
let gamepadIndex = null;
let lastGamepadCount = 0;

const wsInput = document.getElementById("wsUrl");
const connectBtn = document.getElementById("connectBtn");
const gamepadSelect = document.getElementById("gamepadSelect");
const statusIndicator = document.getElementById("status");

connectBtn.onclick = () => {
  if (ws) ws.close();
  setupConnection(wsInput.value);
};

function setupConnection(url) {
  ws = new WebSocket(url);

  ws.onmessage = async (event) => {
    const msg = JSON.parse(event.data);
    if (msg.type === "offer") {
      pc = new RTCPeerConnection();
      pc.onicecandidate = e => {
        if (e.candidate) {
          ws.send(JSON.stringify({ type: "candidate", candidate: e.candidate }));
        }
      };

      pc.ondatachannel = e => {
        dataChannel = e.channel;
        dataChannel.onopen = () => {
          sendLoop();
        };
      };

      await pc.setRemoteDescription(msg.offer);
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      ws.send(JSON.stringify({ type: "answer", answer }));
    } else if (msg.type === "candidate" && pc) {
      await pc.addIceCandidate(new RTCIceCandidate(msg.candidate));
    }
  };
}

function sendLoop() {
  const interval = setInterval(() => {
    const gp = navigator.getGamepads()[gamepadIndex];
    if (gp && dataChannel && dataChannel.readyState === "open") {
      const data = {
        buttons: gp.buttons.map(b => b.pressed ? 1 : 0),
        axes: gp.axes.map(a => Math.round(a * 1000)),
      };
      dataChannel.send(JSON.stringify(data));
    }
  }, 16);
}

function updateStatus() {
  const gamepads = navigator.getGamepads();
  const gp = gamepads[gamepadIndex];

  // 状態更新
  if (gp) {
    statusIndicator.style.backgroundColor = "limegreen";
  } else {
    statusIndicator.style.backgroundColor = "gray";
  }

  // 新しいゲームパッドが接続されたらリスト更新
  if (gamepads.length !== lastGamepadCount) {
    gamepadSelect.innerHTML = "";
    for (let i = 0; i < gamepads.length; i++) {
      const g = gamepads[i];
      if (g) {
        const option = document.createElement("option");
        option.value = g.index;
        option.text = `${g.index}: ${g.id}`;
        gamepadSelect.appendChild(option);
      }
    }
    lastGamepadCount = gamepads.length;
  }

  requestAnimationFrame(updateStatus);
}

// ゲームパッド選択
gamepadSelect.onchange = () => {
  gamepadIndex = parseInt(gamepadSelect.value);
};

// 初期化
window.addEventListener("gamepadconnected", () => {
  lastGamepadCount = 0; // 強制リロード
});
window.addEventListener("gamepaddisconnected", () => {
  lastGamepadCount = 0;
});

updateStatus();
