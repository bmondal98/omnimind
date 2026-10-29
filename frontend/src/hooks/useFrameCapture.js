import { useEffect, useRef, useState } from 'react';
import { FRAME_INTERVAL_MS, FRAME_JPEG_QUALITY, FRAME_MAX_WIDTH } from '../config.js';
import { sendFrame } from '../api.js';

/**
 * While `isActive`, grabs a JPEG frame from the video every FRAME_INTERVAL_MS
 * via an offscreen canvas and hands it to sendFrame().
 * Returns the frame count and a preview of the latest frame.
 */
export function useFrameCapture(videoRef, isActive) {
  const canvasRef = useRef(null);
  const previewUrlRef = useRef(null);
  const [frameCount, setFrameCount] = useState(0);
  const [lastFrame, setLastFrame] = useState(null); // { url, width, height, sizeKB, timestamp }

  useEffect(() => {
    if (!isActive) return undefined;

    setFrameCount(0);
    if (!canvasRef.current) canvasRef.current = document.createElement('canvas');
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    let busy = false; // skip a tick if the previous encode hasn't finished
    let cancelled = false;

    const capture = () => {
      const video = videoRef.current;
      if (busy || !ctx || !video || video.readyState < 2 || !video.videoWidth) return;
      busy = true;

      // Downscale to FRAME_MAX_WIDTH, keeping the aspect ratio.
      const scale = Math.min(1, FRAME_MAX_WIDTH / video.videoWidth);
      const width = Math.round(video.videoWidth * scale);
      const height = Math.round(video.videoHeight * scale);
      canvas.width = width;
      canvas.height = height;
      ctx.drawImage(video, 0, 0, width, height);
      const timestamp = new Date().toISOString();

      canvas.toBlob(
        (blob) => {
          busy = false;
          if (cancelled || !blob) return;

          const sizeKB = Number((blob.size / 1024).toFixed(1));
          console.log('[frame]', { timestamp, width, height, sizeKB, blob });

          // Swap the preview URL, revoking the previous one.
          if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
          previewUrlRef.current = URL.createObjectURL(blob);
          setLastFrame({ url: previewUrlRef.current, width, height, sizeKB, timestamp });
          setFrameCount((n) => n + 1);

          sendFrame(blob, timestamp).catch((err) => console.error('[frame] sendFrame failed', err));
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

  return { frameCount, lastFrame };
}
