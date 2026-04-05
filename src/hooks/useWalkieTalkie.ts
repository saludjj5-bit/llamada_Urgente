// 2. src/hooks/useWalkieTalkie.ts (Lógica robusta de audio)
import { useEffect, useRef, useState, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';

const SOCKET_URL = 'https://llamada-urgente-2.onrender.com';

export const useWalkieTalkie = (groupId: string | null, onNewRecording?: (recording: any) => void) => {
  const [isConnected, setIsConnected] = useState(false);
  const [isTalking, setIsTalking] = useState(false);
  const [isReceiving, setIsReceiving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const socketRef = useRef<Socket | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const connect = useCallback(() => {
    if (!groupId) return;
    if (socketRef.current?.connected) socketRef.current.disconnect();
    const socket = io(SOCKET_URL, { transports: ['websocket'], reconnection: true });
    socketRef.current = socket;
    socket.on('connect', () => { setIsConnected(true); setError(null); socket.emit('join-group', groupId); });
    socket.on('disconnect', () => setIsConnected(false));
    socket.on('audio-receive', async ({ data }) => {
      setIsReceiving(true);
      try {
        const blob = new Blob([data], { type: 'audio/webm' });
        const url = URL.createObjectURL(blob);
        if (audioRef.current) { audioRef.current.src = url; await audioRef.current.play(); }
        setTimeout(() => setIsReceiving(false), 500);
      } catch { setIsReceiving(false); }
    });
    socket.on('new-recording', (recording) => { if (onNewRecording) onNewRecording(recording); });
  }, [groupId, onNewRecording]);

  const disconnect = useCallback(() => {
    if (socketRef.current) { socketRef.current.disconnect(); socketRef.current = null; }
    setIsConnected(false);
    setIsTalking(false);
  }, []);

  const startTalking = useCallback((userId: string, displayName: string) => {
    if (!socketRef.current?.connected || !groupId || isTalking) return;
    navigator.mediaDevices.getUserMedia({ audio: true }).then(stream => {
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];
      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0 && socketRef.current?.connected) {
          event.data.arrayBuffer().then(buffer => {
            socketRef.current?.emit('audio-data', { groupId, data: buffer });
          });
        }
      };
      mediaRecorder.start(100);
      setIsTalking(true);
      socketRef.current?.emit('audio-start', { groupId, userId, displayName });
    }).catch(() => setError('Permiso denegado'));
  }, [groupId, isTalking]);

  const stopTalking = useCallback(() => {
    if (mediaRecorderRef.current) {
      if (mediaRecorderRef.current.state === 'recording') mediaRecorderRef.current.stop();
      mediaRecorderRef.current.stream.getTracks().forEach(t => t.stop());
      mediaRecorderRef.current = null;
    }
    setIsTalking(false);
    socketRef.current?.emit('audio-end', { groupId });
  }, [groupId]);

  useEffect(() => {
    audioRef.current = new Audio();
    return () => { disconnect(); };
  }, [disconnect]);

  return { isConnected, isTalking, isReceiving, error, connect, disconnect, startTalking, stopTalking };
};
