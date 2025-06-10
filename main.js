const ws = new WebSocket("wss://rapids-bear-lives-five.trycloudflare.com/ws");

let pc;
let dataChannel;
let gamepadIndex = null;

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
        setInterval(() => {
          const gp = navigator.getGamepads()[gamepadIndex];
          if (gp && dataChannel.readyState === "open") {
            const data = {
              buttons: gp.buttons.map(b => b.pressed ? 1 : 0),
              axes: gp.axes.map(a => Math.round(a * 1000)),
            };
            dataChannel.send(JSON.stringify(data));
          }
        }, 16);
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

window.addEventListener("gamepadconnected", (e) => {
  gamepadIndex = e.gamepad.index;
});
