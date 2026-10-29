import { useCallback, useEffect, useRef, useState } from 'react';

// Map getUserMedia errors to a UI state + a human-friendly message.
function describeError(err) {
  switch (err?.name) {
    case 'NotAllowedError':
    case 'PermissionDeniedError':
    case 'SecurityError':
      return { status: 'denied', message: 'Camera access was blocked.' };
    case 'NotFoundError':
    case 'DevicesNotFoundError':
    case 'OverconstrainedError':
      return { status: 'error', message: 'No camera was found on this device.' };
    case 'NotReadableError':
    case 'TrackStartError':
      return { status: 'error', message: 'The camera is in use by another app. Close it and try again.' };
    default:
      return { status: 'error', message: err?.message || 'Could not start the camera.' };
  }
}

/**
 * Manages the camera stream.
 * status: 'idle' | 'requesting' | 'live' | 'denied' | 'error'
 * Attach `videoRef` to a <video> element that is always rendered.
 */
export function useCamera() {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const requestIdRef = useRef(0); // lets stop()/unmount cancel an in-flight start()
  const [status, setStatus] = useState('idle');
  const [error, setError] = useState('');

  const releaseStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
  }, []);

  const stop = useCallback(() => {
    requestIdRef.current += 1;
    releaseStream();
    setStatus('idle');
    setError('');
  }, [releaseStream]);

  const start = useCallback(async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      setStatus('error');
      setError(
        window.isSecureContext
          ? 'This browser does not support camera access.'
          : 'Camera access needs a secure (HTTPS) connection. See the README for opening OmniMind on a phone.'
      );
      return;
    }

    const requestId = ++requestIdRef.current;
    releaseStream();
    setStatus('requesting');
    setError('');

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: 'environment' }, // rear camera on phones
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
        audio: false,
      });

      // stop() was pressed (or we unmounted) while the permission prompt was open.
      if (requestId !== requestIdRef.current) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }

      streamRef.current = stream;
      // If the camera disappears (unplugged, permission revoked) surface an error.
      stream.getVideoTracks().forEach((track) =>
        track.addEventListener('ended', () => {
          if (streamRef.current !== stream) return;
          releaseStream();
          setStatus('error');
          setError('The camera stopped unexpectedly.');
        })
      );

      const video = videoRef.current;
      if (video) {
        video.srcObject = stream;
        await video.play().catch(() => {}); // autoplay is allowed: muted + user gesture
      }
      setStatus('live');
    } catch (err) {
      if (requestId !== requestIdRef.current) return;
      console.error('[camera] getUserMedia failed', err);
      const { status: nextStatus, message } = describeError(err);
      setStatus(nextStatus);
      setError(message);
    }
  }, [releaseStream]);

  // Always release the camera on unmount.
  useEffect(
    () => () => {
      requestIdRef.current += 1;
      releaseStream();
    },
    [releaseStream]
  );

  return { videoRef, status, error, start, stop };
}
