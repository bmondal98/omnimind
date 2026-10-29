import { useCallback, useEffect, useRef, useState } from 'react';

const SpeechRecognitionImpl =
  typeof window !== 'undefined' ? window.SpeechRecognition || window.webkitSpeechRecognition : undefined;

const canRecordAudio =
  typeof window !== 'undefined' &&
  !!navigator.mediaDevices?.getUserMedia &&
  typeof window.MediaRecorder !== 'undefined';

// How long to wait for speech recognition to deliver its final result after stop().
const RECOGNITION_END_TIMEOUT_MS = 2000;

const withTimeout = (promise, ms) =>
  Promise.race([promise, new Promise((resolve) => setTimeout(resolve, ms))]);

/**
 * Push-to-talk voice input.
 * - Records audio with MediaRecorder (when available).
 * - Shows a live transcript with the Web Speech API (when available).
 * - On stop, calls onResult({ transcript, audioBlob }).
 * status: 'idle' | 'starting' | 'recording' | 'processing'
 */
export function useVoiceInput({ onResult }) {
  const [status, setStatus] = useState('idle');
  const [transcript, setTranscript] = useState(''); // live: final + interim text
  const [error, setError] = useState('');
  const sessionRef = useRef(null);
  const onResultRef = useRef(onResult);

  useEffect(() => {
    onResultRef.current = onResult;
  });

  const start = useCallback(async () => {
    if (sessionRef.current) return;
    if (!canRecordAudio && !SpeechRecognitionImpl) {
      setError('Voice input is not supported in this browser. Type your question instead.');
      return;
    }

    const session = {
      stream: null,
      recorder: null,
      recorderDone: null,
      recognition: null,
      recognitionDone: null,
      finalText: '',
      interimText: '',
      cancelled: false,
    };
    sessionRef.current = session;
    setError('');
    setTranscript('');
    setStatus('starting');

    // 1. Audio recording
    if (canRecordAudio) {
      try {
        session.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      } catch (err) {
        console.error('[voice] microphone access failed', err);
        sessionRef.current = null;
        setStatus('idle');
        setError(
          err?.name === 'NotAllowedError'
            ? 'Microphone access was blocked. Allow it in your browser settings, or type instead.'
            : 'Could not access the microphone.'
        );
        return;
      }
      if (session.cancelled) {
        session.stream.getTracks().forEach((track) => track.stop());
        return;
      }

      const chunks = [];
      const recorder = new MediaRecorder(session.stream);
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunks.push(event.data);
      };
      session.recorderDone = new Promise((resolve) => {
        recorder.onstop = () => {
          session.stream.getTracks().forEach((track) => track.stop());
          resolve(chunks.length ? new Blob(chunks, { type: recorder.mimeType || 'audio/webm' }) : null);
        };
      });
      session.recorder = recorder;
      recorder.start();
    }

    // 2. Live transcript
    if (SpeechRecognitionImpl) {
      const recognition = new SpeechRecognitionImpl();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = navigator.language || 'en-US';

      recognition.onresult = (event) => {
        let finalText = '';
        let interimText = '';
        for (let i = 0; i < event.results.length; i++) {
          const result = event.results[i];
          if (result.isFinal) finalText += result[0].transcript;
          else interimText += result[0].transcript;
        }
        session.finalText = finalText;
        session.interimText = interimText;
        if (!session.cancelled) setTranscript(`${finalText} ${interimText}`.trim());
      };
      recognition.onerror = (event) => {
        if (event.error === 'no-speech' || event.error === 'aborted') return;
        console.warn('[voice] speech recognition error:', event.error);
        if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
          setError('Live transcription is unavailable, but your audio is still recorded.');
        }
      };
      session.recognitionDone = new Promise((resolve) => {
        recognition.onend = resolve;
      });

      try {
        recognition.start();
        session.recognition = recognition;
      } catch (err) {
        console.warn('[voice] could not start speech recognition', err);
        session.recognitionDone = null;
      }
    }

    setStatus('recording');
  }, []);

  const stop = useCallback(async () => {
    const session = sessionRef.current;
    if (!session || session.stopping) return;
    session.stopping = true;
    setStatus('processing');

    if (session.recorder && session.recorder.state !== 'inactive') session.recorder.stop();
    session.recognition?.stop();

    const [audioBlob] = await Promise.all([
      session.recorderDone ?? Promise.resolve(null),
      session.recognitionDone ? withTimeout(session.recognitionDone, RECOGNITION_END_TIMEOUT_MS) : null,
    ]);

    sessionRef.current = null;
    if (session.cancelled) return;

    const text = `${session.finalText} ${session.interimText}`.trim();
    console.log('[voice] recording stopped', {
      transcript: text,
      audioBlob,
      sizeKB: audioBlob ? Number((audioBlob.size / 1024).toFixed(1)) : 0,
    });

    setTranscript('');
    setStatus('idle');
    onResultRef.current?.({ transcript: text, audioBlob });
  }, []);

  const toggle = useCallback(() => {
    if (status === 'recording') stop();
    else if (status === 'idle') start();
  }, [status, start, stop]);

  // Release the mic and recognizer on unmount.
  useEffect(
    () => () => {
      const session = sessionRef.current;
      if (!session) return;
      session.cancelled = true;
      if (session.recorder && session.recorder.state !== 'inactive') session.recorder.stop();
      session.stream?.getTracks().forEach((track) => track.stop());
      session.recognition?.abort();
      sessionRef.current = null;
    },
    []
  );

  return {
    status,
    isRecording: status === 'recording',
    transcript,
    error,
    toggle,
    isSupported: canRecordAudio || !!SpeechRecognitionImpl,
    hasLiveTranscript: !!SpeechRecognitionImpl,
  };
}
