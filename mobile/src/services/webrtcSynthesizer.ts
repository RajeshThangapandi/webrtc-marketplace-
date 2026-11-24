import { CallType } from '../types';

export interface AcquiredMediaResult {
  stream: MediaStream;
  isVirtualStream: boolean;
  cleanup: () => void;
}

/**
 * Acquires a hardware camera/mic MediaStream via navigator.mediaDevices.getUserMedia,
 * or synthesizes a real-time 30fps Canvas + WebAudio MediaStream when hardware is busy/unavailable
 * or when the user switches to the "Virtual Plot Boundary Drone Camera" during a call.
 */
export async function acquireMediaStream(
  callType: CallType,
  userName: string,
  userRole: string,
  propertyTitle: string,
  preferVirtualPlotCam = false
): Promise<AcquiredMediaResult> {
  if (!preferVirtualPlotCam && navigator.mediaDevices?.getUserMedia) {
    try {
      const hardwareStream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video:
          callType === 'video'
            ? { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' }
            : false,
      });
      return {
        stream: hardwareStream,
        isVirtualStream: false,
        cleanup: () => {
          hardwareStream.getTracks().forEach((track) => track.stop());
        },
      };
    } catch {
      // Fallback to live WebRTC synthesized stream if webcam/mic is locked by another tab or permission declined
    }
  }

  const combinedTracks: MediaStreamTrack[] = [];
  const cleanupCallbacks: Array<() => void> = [];

  // 1. Synthesize real WebAudio track for WebRTC audio transport
  try {
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const audioCtx = new AudioCtx();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    const dest = audioCtx.createMediaStreamDestination();
    osc.type = 'sine';
    osc.frequency.value = 440;
    gain.gain.value = 0.001; // Near-silent carrier so WebRTC audio RTP packets flow continuously
    osc.connect(gain);
    gain.connect(dest);
    osc.start();

    const audioTrack = dest.stream.getAudioTracks()[0];
    if (audioTrack) {
      combinedTracks.push(audioTrack);
    }
    cleanupCallbacks.push(() => {
      try {
        osc.stop();
        audioCtx.close();
      } catch {
        // ignore
      }
    });
  } catch {
    // ignore if AudioContext blocked
  }

  // 2. Synthesize 30fps live Canvas video track if callType === 'video'
  if (callType === 'video') {
    const canvas = document.createElement('canvas');
    canvas.width = 640;
    canvas.height = 360;
    const ctx = canvas.getContext('2d');
    let frame = 0;

    const drawFrame = () => {
      if (!ctx) return;
      frame += 1;

      // Rich emerald-dark gradient background representing aerial land telemetry + user feed
      const grad = ctx.createLinearGradient(0, 0, 640, 360);
      grad.addColorStop(0, '#052e27');
      grad.addColorStop(0.5, '#075E54');
      grad.addColorStop(1, '#0b3d36');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, 640, 360);

      // Animated topographic survey grid
      ctx.strokeStyle = 'rgba(37, 211, 102, 0.14)';
      ctx.lineWidth = 1;
      const offset = (frame * 0.7) % 40;
      for (let x = offset; x < 640; x += 40) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, 360);
        ctx.stroke();
      }
      for (let y = offset; y < 360; y += 40) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(640, y);
        ctx.stroke();
      }

      // Animated land parcel boundary polygon
      ctx.save();
      ctx.strokeStyle = '#25D366';
      ctx.lineWidth = 2.5;
      ctx.setLineDash([8, 4]);
      ctx.lineDashOffset = -frame * 0.6;
      ctx.beginPath();
      ctx.moveTo(150, 95);
      ctx.lineTo(490, 80);
      ctx.lineTo(520, 250);
      ctx.lineTo(130, 265);
      ctx.closePath();
      ctx.stroke();
      ctx.fillStyle = 'rgba(37, 211, 102, 0.10)';
      ctx.fill();
      ctx.restore();

      // Corner GPS boundary markers
      const corners = [
        [150, 95, 'NW 12.84°N'],
        [490, 80, 'NE 77.51°E'],
        [520, 250, 'SE Corner'],
        [130, 265, 'SW Road 30ft'],
      ] as const;
      corners.forEach(([cx, cy, label]) => {
        ctx.fillStyle = '#25D366';
        ctx.beginPath();
        ctx.arc(cx, cy, 5, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#d1fae5';
        ctx.font = '11px system-ui, sans-serif';
        ctx.fillText(label, Number(cx) - 24, Number(cy) - 10);
      });

      // Center user avatar pulse badge
      const pulseRadius = 38 + Math.sin(frame * 0.08) * 5;
      ctx.strokeStyle = 'rgba(37, 211, 102, 0.45)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(320, 172, pulseRadius, 0, Math.PI * 2);
      ctx.stroke();

      ctx.fillStyle = '#128C7E';
      ctx.beginPath();
      ctx.arc(320, 172, 30, 0, Math.PI * 2);
      ctx.fill();

      const initials = userName
        .split(' ')
        .map((n) => n[0])
        .join('')
        .slice(0, 2)
        .toUpperCase();
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 20px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(initials, 320, 179);

      // Top HUD bar
      ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
      ctx.fillRect(16, 14, 608, 42);
      ctx.textAlign = 'left';
      ctx.fillStyle = '#25D366';
      ctx.font = 'bold 13px system-ui, sans-serif';
      ctx.fillText(`● LIVE WEBRTC FEED  |  ${userName.toUpperCase()} (${userRole.toUpperCase()})`, 28, 34);
      ctx.fillStyle = '#e2e8f0';
      ctx.font = '11px system-ui, sans-serif';
      ctx.fillText(`Plot Context: ${propertyTitle.slice(0, 48)}`, 28, 49);

      // Live clock on top right
      const nowStr = new Date().toLocaleTimeString();
      ctx.textAlign = 'right';
      ctx.fillStyle = '#a7f3d0';
      ctx.font = 'monospace 13px sans-serif';
      ctx.fillText(nowStr, 610, 40);

      // Bottom privacy shield banner
      ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
      ctx.fillRect(16, 308, 608, 36);
      ctx.textAlign = 'center';
      ctx.fillStyle = '#ffffff';
      ctx.font = '12px system-ui, sans-serif';
      ctx.fillText(
        '🔒 LandConnect Encrypted In-App Video • Personal Phone Number Protected',
        320,
        330
      );
    };

    drawFrame();
    const intervalId = window.setInterval(drawFrame, 33);
    const canvasStream = canvas.captureStream(30);
    const videoTrack = canvasStream.getVideoTracks()[0];
    if (videoTrack) {
      combinedTracks.push(videoTrack);
    }
    cleanupCallbacks.push(() => {
      window.clearInterval(intervalId);
      canvasStream.getTracks().forEach((t) => t.stop());
    });
  }

  const finalStream = new MediaStream(combinedTracks);
  return {
    stream: finalStream,
    isVirtualStream: true,
    cleanup: () => {
      cleanupCallbacks.forEach((fn) => fn());
      finalStream.getTracks().forEach((t) => t.stop());
    },
  };
}
