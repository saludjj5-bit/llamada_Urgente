import { useEffect, useRef, useState, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '../firebase';

const SOCKET_URL = 'https://llamada-urgente-2.onrender.com';

// Función para detectar el mejor códec disponible
const getSupportedMimeType = () => {
  const types = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/ogg;codecs=opus',
    'audio/aac',
    'audio/wav'
  ];
  for (const type of types) {
    if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(type)) {
      return type;
    }
  }
  return '';
};

const MIME_TYPE = getSupportedMimeType();

export const useWalkieTalkie = (groupId: string | null, userId?: string, onNewRecording?: (recording: any) => void) => {
  const [isConnected, setIsConnected] = useState(false);
  const [isTalking, setIsTalking] = useState(false);
  const [isReceiving, setIsReceiving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const socketRef = useRef<Socket | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const receivingTimeoutRef = useRef<any>(null);
  const activeStreamRef = useRef<MediaStream | null>(null);
  
  // Referencias para el streaming de audio recibiendo
  const mediaSourceRef = useRef<MediaSource | null>(null);
  const sourceBufferRef = useRef<SourceBuffer | null>(null);
  const queueRef = useRef<ArrayBuffer[]>([]);

  const initMediaSource = useCallback(() => {
    if (mediaSourceRef.current) {
        try { mediaSourceRef.current.endOfStream(); } catch(e) {}
    }

    const ms = new MediaSource();
    mediaSourceRef.current = ms;
    if (audioRef.current) {
        audioRef.current.src = URL.createObjectURL(ms);
        audioRef.current.play().catch(() => {});
    }

    ms.addEventListener('sourceopen', () => {
      if (MIME_TYPE && MediaSource.isTypeSupported(MIME_TYPE)) {
        try {
          const sb = ms.addSourceBuffer(MIME_TYPE);
          sourceBufferRef.current = sb;
          sb.addEventListener('updateend', appendToBuffer);
        } catch (e) {
          console.error("Error addSourceBuffer:", e);
        }
      }
    });
  }, []);

  const appendToBuffer = useCallback(() => {
    const sb = sourceBufferRef.current;
    const ms = mediaSourceRef.current;

    if (ms && ms.readyState === 'closed' && queueRef.current.length > 0) {
        initMediaSource();
        return;
    }

    if (sb && !sb.updating && queueRef.current.length > 0) {
      const chunk = queueRef.current.shift();
      if (chunk) {
        try {
          sb.appendBuffer(chunk);
          if (audioRef.current && audioRef.current.paused) {
              audioRef.current.play().catch(() => {});
          }
        } catch (e) {
          initMediaSource(); 
        }
      }
    }
  }, [initMediaSource]);

  const disconnect = useCallback(() => {
    if (userId) updateDoc(doc(db, 'users', userId), { isOnline: false, isTalking: false }).catch(() => {});
    if (socketRef.current) { socketRef.current.disconnect(); socketRef.current = null; }
    setIsConnected(false);
    setIsTalking(false);
  }, [userId]);

  const connect = useCallback(() => {
    if (!groupId) return;
    if (socketRef.current?.connected) socketRef.current.disconnect();
    
    const socket = io(SOCKET_URL, { 
        transports: ['websocket'], 
        reconnection: true,
        reconnectionAttempts: Infinity,
        reconnectionDelay: 1000,
        timeout: 10000
    });
    socketRef.current = socket;

    socket.on('connect', () => { 
      setIsConnected(true); 
      setError(null); 
      socket.emit('join-group', groupId); 
      if (userId) updateDoc(doc(db, 'users', userId), { isOnline: true }).catch(() => {});
    });
    
    socket.on('disconnect', () => {
        setIsConnected(false);
        if (userId) updateDoc(doc(db, 'users', userId), { isOnline: false }).catch(() => {});
        if (groupId) setTimeout(() => socket.connect(), 1000);
    });

    socket.on('audio-receive', async ({ data, groupId: incomingGroupId }) => {
      if (!data || data.byteLength === 0) return; 

      if (groupId === 'all' && incomingGroupId) {
         window.dispatchEvent(new CustomEvent('group-talking', { detail: incomingGroupId }));
      }

      setIsReceiving(true);
      if (receivingTimeoutRef.current) clearTimeout(receivingTimeoutRef.current);
      receivingTimeoutRef.current = setTimeout(() => setIsReceiving(false), 1500);

      if (!mediaSourceRef.current || mediaSourceRef.current.readyState !== 'open') initMediaSource();
      queueRef.current.push(data);
      appendToBuffer();
    });

    socket.on('new-recording', (recording) => { if (onNewRecording) onNewRecording(recording); });

  }, [groupId, userId, onNewRecording, initMediaSource, appendToBuffer]);

  const playTone = (freq: number, duration: number) => {
    try {
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, ctx.currentTime);
      gain.gain.setValueAtTime(0.05, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + duration);
    } catch (e) {}
  };

  const startTalking = useCallback((userIdLocal: string, displayName: string, overrideGroupId?: string) => {
    const targetGroupId = overrideGroupId || groupId;
    if (!socketRef.current?.connected || !targetGroupId || isTalking) return;
    
    if (audioRef.current) audioRef.current.play().catch(() => {});
    playTone(880, 0.1);

    navigator.mediaDevices.getUserMedia({ audio: true }).then(stream => {
      activeStreamRef.current = stream;
      const options = MIME_TYPE ? { mimeType: MIME_TYPE } : {};
      const mediaRecorder = new MediaRecorder(stream, options);
      mediaRecorderRef.current = mediaRecorder;
      
      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0 && socketRef.current?.connected) {
          event.data.arrayBuffer().then(buffer => {
            socketRef.current?.emit('audio-data', { groupId: targetGroupId, data: buffer });
          });
        }
      };
      
      mediaRecorder.start(200);
      setIsTalking(true);
      socketRef.current?.emit('audio-start', { groupId: targetGroupId, userId: userIdLocal, displayName });
    }).catch(e => {
        setError('Error: Active micrófono en ajustes');
    });
  }, [groupId, isTalking]);

  const stopTalking = useCallback(() => {
    if (mediaRecorderRef.current) {
        try {
            if (mediaRecorderRef.current.state !== 'inactive') mediaRecorderRef.current.stop();
        } catch (e) {}
        mediaRecorderRef.current = null;
    }
    
    if (activeStreamRef.current) {
        activeStreamRef.current.getTracks().forEach(track => track.stop());
        activeStreamRef.current = null;
    }

    playTone(440, 0.08);
    setIsTalking(false);
    socketRef.current?.emit('audio-end', { groupId });
  }, [groupId]);

  useEffect(() => {
    const audio = new Audio();
    audio.autoplay = true;
    audioRef.current = audio;
    
    return () => { 
        disconnect();
    };
  }, [disconnect]);

  return { isConnected, isTalking, isReceiving, error, connect, disconnect, startTalking, stopTalking };
};
