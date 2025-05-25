const socket = io();
const roomId = new URLSearchParams(window.location.search).get('room') || 'defaultRoom';

let localStream;
let peerConnections = {};
let drawing = false;
let mediaRecorder, recordedChunks = [];

function init() {
  const localVideo = document.getElementById('localVideo');
  const remoteVideos = document.getElementById('remoteVideos');
  const canvas = document.getElementById('whiteboard');
  const ctx = canvas.getContext('2d');

  navigator.mediaDevices.getUserMedia({ video: true, audio: true }).then(stream => {
    localVideo.srcObject = stream;
    localStream = stream;

    socket.emit('join-room', roomId);

    socket.on('user-joined', userId => {
      const peer = createPeer(userId);
      peerConnections[userId] = peer;
      stream.getTracks().forEach(track => peer.addTrack(track, stream));
    });

    socket.on('offer', handleOffer);
    socket.on('answer', handleAnswer);
    socket.on('ice-candidate', handleCandidate);
    socket.on('user-left', userId => {
      if (peerConnections[userId]) peerConnections[userId].close();
      delete peerConnections[userId];
      const video = document.getElementById(`video-${userId}`);
      if (video) video.remove();
    });

    socket.on('draw', ({ x, y }) => drawDot(x, y));
    socket.on('file-share', handleFileShare);

    document.getElementById('shareScreen').onclick = async () => {
      const screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true });
      screenStream.getTracks().forEach(track => {
        Object.values(peerConnections).forEach(peer => {
          const sender = peer.getSenders().find(s => s.track.kind === track.kind);
          if (sender) sender.replaceTrack(track);
        });
      });
    };

    document.getElementById('fileInput').onchange = function () {
      const file = this.files[0];
      const reader = new FileReader();
      reader.onload = () => {
        socket.emit('file-share', { filename: file.name, fileData: reader.result });
      };
      reader.readAsArrayBuffer(file);
    };

    canvas.onmousedown = () => drawing = true;
    canvas.onmouseup = () => drawing = false;
    canvas.onmousemove = e => {
      if (!drawing) return;
      const x = e.offsetX, y = e.offsetY;
      drawDot(x, y);
      socket.emit('draw', { x, y });
    };

    document.getElementById('startRec').onclick = () => {
      recordedChunks = [];
      mediaRecorder = new MediaRecorder(localStream);
      mediaRecorder.ondataavailable = e => recordedChunks.push(e.data);
      mediaRecorder.onstop = () => {
        const blob = new Blob(recordedChunks, { type: 'video/webm' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'recorded.webm';
        a.click();
      };
      mediaRecorder.start();
    };

    document.getElementById('stopRec').onclick = () => {
      mediaRecorder.stop();
    };
  });

  function createPeer(userId) {
    const peer = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] });

    peer.onicecandidate = e => {
      if (e.candidate) socket.emit('ice-candidate', { to: userId, candidate: e.candidate });
    };

    peer.ontrack = e => {
      let video = document.getElementById(`video-${userId}`);
      if (!video) {
        video = document.createElement('video');
        video.id = `video-${userId}`;
        video.autoplay = true;
        video.playsInline = true;
        remoteVideos.appendChild(video);
      }

      if (!video.srcObject) {
        video.srcObject = new MediaStream();
      }

      const alreadyExists = video.srcObject.getTracks().some(t => t.id === e.track.id);
      if (!alreadyExists) video.srcObject.addTrack(e.track);
    };

    peer.onnegotiationneeded = async () => {
      const offer = await peer.createOffer();
      await peer.setLocalDescription(offer);
      socket.emit('offer', { to: userId, offer });
    };

    return peer;
  }

  async function handleOffer({ from, offer }) {
    const peer = createPeer(from);
    peerConnections[from] = peer;

    localStream.getTracks().forEach(track => peer.addTrack(track, localStream));
    await peer.setRemoteDescription(new RTCSessionDescription(offer));
    const answer = await peer.createAnswer();
    await peer.setLocalDescription(answer);
    socket.emit('answer', { to: from, answer });
  }

  async function handleAnswer({ from, answer }) {
    await peerConnections[from].setRemoteDescription(new RTCSessionDescription(answer));
  }

  function handleCandidate({ from, candidate }) {
    peerConnections[from].addIceCandidate(new RTCIceCandidate(candidate));
  }

  function handleFileShare({ filename, fileData }) {
    const blob = new Blob([fileData]);
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    link.textContent = `Download ${filename}`;
    document.body.appendChild(link);
  }

  function drawDot(x, y) {
    ctx.fillStyle = 'black';
    ctx.fillRect(x, y, 2, 2);
  }
}

document.getElementById('joinMeeting').addEventListener('click', init);

document.getElementById('generateLink').addEventListener('click', () => {
  const url = `${window.location.origin}${window.location.pathname}?room=${roomId}`;
  document.getElementById('shareLink').value = url;
});

function copyLink() {
  const input = document.getElementById('shareLink');
  input.select();
  document.execCommand('copy');
  alert('Link copied!');
}
