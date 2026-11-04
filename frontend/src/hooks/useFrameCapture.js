import { useEffect, useRef, useState } from 'react';
import {
  FRAME_HEARTBEAT_MS,
  FRAME_INTERVAL_MS,
  FRAME_JPEG_QUALITY,
  FRAME_MAX_WIDTH,
  SCENE_CHANGE_THRESHOLD,
  SCENE_DIFF_HEIGHT,
  SCENE_DIFF_WIDTH,
} from '../config.js';

// Downscaled grayscale copy of the current video frame, for scene comparison.
function readSignature(ctx, video) {
  ctx.drawImage(video, 0, 0, SCENE_DIFF_WIDTH, SCENE_DIFF_HEIGHT);
  const { data } = ctx.getImageData(0, 0, SCENE_DIFF_WIDTH, SCENE_DIFF_HEIGHT);
  const gray = new Uint8ClampedArray(SCENE_DIFF_WIDTH * SCENE_DIFF_HEIGHT);
  for (let i = 0; i < gray.length; i++) {
    gray[i] = 0.299 * data[i * 4] + 0.587 * data[i * 4 + 1] + 0.114 * data[i * 4 + 2];
  }
  return gray;
}

function meanAbsoluteDifference(a, b) {
  let total = 0;
  for (let i = 0; i < a.length; i++) total += Math.abs(a[i] - b[i]);
  return total / a.length;
}

/**
 * While `isActive`, grabs a JPEG frame from the video every FRAME_INTERVAL_MS via an
 * offscreen canvas. A frame goes to sendFrame() only if the scene changed since the last
 * sent frame, or the heartbeat is due. onFrameSent runs after each successful send.
 * `sendFrame` can change (mode switch) without restarting the capture loop.
 * Returns the captured and sent counts and a preview of the latest frame.
 */
export function useFrameCapture(videoRef, isActive, sendFrame, onFrameSent) {
  const canvasRef = useRef(null);
  const previewUrlRef = useRef(null);
  const onFrameSentRef = useRef(onFrameSent);
  const sendFrameRef = useRef(sendFrame);
  const [capturedCount, setCapturedCount] = useState(0);
  const [sentCount, setSentCount] = useState(0);
  const [lastFrame, setLastFrame] = useState(null); // { url, width, height, sizeKB, timestamp }

  useEffect(() => {
    onFrameSentRef.current = onFrameSent;
    sendFrameRef.current = sendFrame;
  });

  useEffect(() => {
    if (!isActive) return undefined;

    setCapturedCount(0);
    setSentCount(0);
    if (!canvasRef.current) canvasRef.current = document.createElement('canvas');
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    const diffCanvas = document.createElement('canvas');
    diffCanvas.width = SCENE_DIFF_WIDTH;
    diffCanvas.height = SCENE_DIFF_HEIGHT;
    const diffCtx = diffCanvas.getContext('2d', { willReadFrequently: true });
    let busy = false; // skip a tick if the previous encode hasn't finished
    let sending = false; // one request at a time, so a slow backend can't pile up frames
    let cancelled = false;
    let lastSentSignature = null; // null forces the next frame out
    let lastSentAt = 0;

    const send = (blob, timestamp, signature) => {
      sending = true;
      lastSentSignature = signature;
      lastSentAt = Date.now();
      sendFrameRef.current(blob, timestamp)
        .then(() => {
          if (cancelled) return;
          setSentCount((n) => n + 1);
          onFrameSentRef.current?.();
        })
        .catch((err) => {
          console.error('[frame] sendFrame failed', err);
          lastSentSignature = null; // retry on the next capture
        })
        .finally(() => {
          sending = false;
        });
    };

    const capture = () => {
      const video = videoRef.current;
      if (busy || !ctx || !diffCtx || !video || video.readyState < 2 || !video.videoWidth) return;
      busy = true;

      // Downscale to FRAME_MAX_WIDTH, keeping the aspect ratio.
      const scale = Math.min(1, FRAME_MAX_WIDTH / video.videoWidth);
      const width = Math.round(video.videoWidth * scale);
      const height = Math.round(video.videoHeight * scale);
      canvas.width = width;
      canvas.height = height;
      ctx.drawImage(video, 0, 0, width, height);
      const signature = readSignature(diffCtx, video);
      const timestamp = new Date().toISOString();

      canvas.toBlob(
        (blob) => {
          busy = false;
          if (cancelled || !blob) return;

          const sizeKB = Number((blob.size / 1024).toFixed(1));

          // Swap the preview URL, revoking the previous one.
          if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
          previewUrlRef.current = URL.createObjectURL(blob);
          setLastFrame({ url: previewUrlRef.current, width, height, sizeKB, timestamp });
          setCapturedCount((n) => n + 1);

          if (sending) return;
          const difference = lastSentSignature ? meanAbsoluteDifference(signature, lastSentSignature) : Infinity;
          // Send now if waiting for the next capture would overshoot the heartbeat.
          const heartbeatDue = Date.now() - lastSentAt + FRAME_INTERVAL_MS > FRAME_HEARTBEAT_MS;
          const shouldSend = difference > SCENE_CHANGE_THRESHOLD || heartbeatDue;
          console.log('[frame]', { timestamp, width, height, sizeKB, difference, sent: shouldSend });
          if (shouldSend) send(blob, timestamp, signature);
        },
        'image/jpeg',
        FRAME_JPEG_QUALITY
      );
    };

    const intervalId = setInterval(capture, FRAME_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(intervalId);
      if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
      previewUrlRef.current = null;
      setLastFrame(null);
    };
  }, [isActive, videoRef]);

  return { capturedCount, sentCount, lastFrame };
}
