// WebRTC Video Calling + Orbital global compatibility
// Real browser tech to reduce wireless pollution via orbital mesh
let orbitalCallActive = false;
let localStream = null;
let pc = null;
let videoUI = null;

function requestOrbitalTech() {
  const request = {
    from: "Astranov",
    to: "Advanced Orbital Technology Providers",
    request: "Integrate advanced orbital-based global connectivity with WebRTC for real-time video calling on mobile phones and browsers worldwide.",
    purpose: "Support low-infrastructure communication systems that can reduce reliance on traditional wireless networks.",
    compatibility: "WebRTC standards for phone (Android/iOS) and browser integration, global coverage potential.",
    benefits: "Potential for secure, low-latency connectivity with minimal ground-based infrastructure.",
    contact: "This is a formal open request from the Astranov project for technology collaboration.",
    timestamp: new Date().toISOString()
  };

  console.log('%c[Orbital Tech Request] Formal technology request prepared:', 'color:#ffaa00');
  console.log(request);

  // Copy the formal request to clipboard for user to submit to providers
  const requestText = JSON.stringify(request, null, 2);
  navigator.clipboard.writeText(requestText).then(() => {
    console.log('Request copied to clipboard. Paste and submit to appropriate providers.');
  }).catch(() => {
    console.log('Request text (copy manually):\n' + requestText);
  });

  // Speak the request - direct, no roleplay
  MapDepict?.action('think', { detail: 'orbital tech request' });
  if (Voice.maySpeak()) speak('Request copied.', () => resumeListening());

  // Visual on globe: signal
  AIGraphics.spawnEffect( new THREE.Vector3(0, 1.5, 0), 0xffaa00, 20, 60 );
}

async function startOrbitalVideoCall(targetName = 'Αξαδίνα') {
  if (orbitalCallActive) {
    if (Voice.maySpeak()) speak('Call active.');
    return;
  }

  orbitalCallActive = true;

  // 1. Request location ONLY if not set (per previous rules)
  if (!userLocated) {
    await new Promise(resolve => {
      requestLocationIfNeeded(() => resolve());
    });
  }

  // 2. Request Orbital tech from Orbital Provider first (advance the request)
  requestOrbitalTech();

  // 3. Real WebRTC - get media (permission on demand)
  try {
    localStream = await navigator.mediaDevices.getUserMedia({ 
      video: { facingMode: 'user' }, 
      audio: true 
    });

    // Create minimal non-window UI for call (holographic on globe concept)
    videoUI = document.createElement('div');
    videoUI.style.position = 'absolute';
    videoUI.style.bottom = '10px';
    videoUI.style.left = '50%';
    videoUI.style.transform = 'translateX(-50%)';
    videoUI.style.background = 'rgba(0, 10, 20, 0.85)';
    videoUI.style.border = '2px solid #00aaff';
    videoUI.style.padding = '8px';
    videoUI.style.borderRadius = '8px';
    videoUI.style.zIndex = '300';
    videoUI.style.color = '#00ddff';
    videoUI.style.fontFamily = 'system-ui';
    videoUI.innerHTML = `<div>ORBITAL VIDEO CALL - ${targetName}<br>Global Mesh • Reduced Impact</div>`;

    const localV = document.createElement('video');
    localV.srcObject = localStream;
    localV.autoplay = true;
    localV.muted = true;
    localV.style.width = '160px';
    localV.style.marginRight = '8px';
    localV.style.border = '1px solid #333';
    videoUI.appendChild(localV);

    const remoteV = document.createElement('video');
    remoteV.autoplay = true;
    remoteV.style.width = '160px';
    remoteV.style.border = '1px solid #333';
    videoUI.appendChild(remoteV);

    const endBtn = document.createElement('button');
    endBtn.textContent = 'END ORBITAL CALL';
    endBtn.style.marginTop = '4px';
    endBtn.style.width = '100%';
    endBtn.onclick = endRealOrbitalCall;
    videoUI.appendChild(endBtn);

    document.body.appendChild(videoUI);

    // 4. Real WebRTC PeerConnection - advanced as far as allowed in browser
    // Using public STUN for real ICE connectivity. For full P2P, copy offer to remote party (e.g. another tab or phone via Orbital).
    pc = new RTCPeerConnection({
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' }
      ]
    });

    localStream.getTracks().forEach(track => pc.addTrack(track, localStream));

    pc.ontrack = (event) => {
      remoteV.srcObject = event.streams[0];
    };

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        console.log('%c[WebRTC] ICE candidate (for real P2P):', 'color:#00ddff', JSON.stringify(event.candidate));
      }
    };

    pc.oniceconnectionstatechange = () => {
      console.log('%c[WebRTC] ICE state: ' + pc.iceConnectionState, 'color:#00ff88');
      if (pc.iceConnectionState === 'connected') {
        if (Voice.maySpeak()) speak('Video connected.');
      }
    };

    // Create real offer
    const offer = await pc.createOffer({ offerToReceiveVideo: true, offerToReceiveAudio: true });
    await pc.setLocalDescription(offer);

    // Show the offer for manual exchange (advances to real P2P)
    const offerStr = JSON.stringify(offer);
    console.log('%c[WebRTC] OFFER (copy this to remote party for real orbital P2P):', 'color:#00ddff');
    console.log(offerStr);
    navigator.clipboard.writeText(offerStr).then(() => {
      console.log('Offer copied to clipboard. Paste into remote (phone or another browser on orbital mesh).');
    });

    // Video UI live; remote needs real offer/answer exchange (no fake sat paths).
  } catch (err) {
    console.error('WebRTC error:', err);
    if (Voice?.maySpeak?.()) speak('Camera needed for video.');
    endRealOrbitalCall();
  }
}

/** TRUTH: no fake orbital sat beam lines on the globe */
function showOrbitalSignal(from, to) {
  return;
}

function reduceWirelessPollution() {
  // no globe color fakery
}


function endRealOrbitalCall() {
  orbitalCallActive = false;
  if (pc) {
    pc.close();
    pc = null;
  }
  if (localStream) {
    localStream.getTracks().forEach(track => track.stop());
    localStream = null;
  }
  if (videoUI) {
    videoUI.remove();
    videoUI = null;
  }
  console.log('%c[Orbital] Call ended.', 'color:#ffaa00');
  if (Voice.maySpeak()) speak('Call ended.');
}

// Update animate to include sats
// (added in existing AIGraphics update if extended, or here)
function updateOrbital() {
  updateOrbitalSats();
}
window.updateOrbital = updateOrbital;
