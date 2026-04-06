import { useEffect, useRef, useState, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';

const SOCKET_URL = 'https://llamada-urgente-2.onrender.com';

// MIME Type universal para Android 8+ y Web
const MIME_TYPE = 'audio/webm;codecs=opus';

export const useWalkieTalkie = (groupId: string | null, onNewRecording?: (recording: any) => void) => {
  const [isConnected, setIsConnected] = useState(false);
  const [isTalking, setIsTalking] = useState(false);
  const [isReceiving, setIsReceiving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const socketRef = useRef<Socket | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const receivingTimeoutRef = useRef<any>(null);
  
  // Referencias para el streaming de audio recibiendo
  const mediaSourceRef = useRef<MediaSource | null>(null);
  const sourceBufferRef = useRef<SourceBuffer | null>(null);
  const queueRef = useRef<ArrayBuffer[]>([]);

  const connect = useCallback(() => {
    if (!groupId) return;
    if (socketRef.current?.connected) socketRef.current.disconnect();
    
    const socket = io(SOCKET_URL, { 
        transports: ['websocket'], 
        reconnection: true,
        reconnectionAttempts: Infinity,
        reconnectionDelay: 1000
    });
    socketRef.current = socket;

    socket.on('connect', () => { 
      setIsConnected(true); 
      setError(null); 
      socket.emit('join-group', groupId); 
    });
    
    socket.on('disconnect', () => setIsConnected(false));

    // LÓGICA DE RECIBIR AUDIO EN TIEMPO REAL
    socket.on('audio-receive', async ({ data, groupId: incomingGroupId }) => {
      if (!data || data.byteLength === 0) return; // Ignorar paquetes vacíos que traban la UI

      // Monitoreo Global
      if (groupId === 'all' && incomingGroupId) {
         window.dispatchEvent(new CustomEvent('group-talking', { detail: incomingGroupId }));
      }

      setIsReceiving(true);
      
      // Control de parpadeo (Heartbeat)
      if (receivingTimeoutRef.current) clearTimeout(receivingTimeoutRef.current);
      receivingTimeoutRef.current = setTimeout(() => setIsReceiving(false), 1200);

      if (!mediaSourceRef.current || mediaSourceRef.current.readyState !== 'open') initMediaSource();
      queueRef.current.push(data);
      appendToBuffer();
    });

    socket.on('new-recording', (recording) => { if (onNewRecording) onNewRecording(recording); });

  }, [groupId, onNewRecording]);

  const initMediaSource = () => {
    if (mediaSourceRef.current) {
        try { mediaSourceRef.current.endOfStream(); } catch(e) {}
    }

    const ms = new MediaSource();
    mediaSourceRef.current = ms;
    if (audioRef.current) {
        audioRef.current.src = URL.createObjectURL(ms);
        audioRef.current.play().catch(e => console.log("Interacción requerida para audio"));
    }

    ms.addEventListener('sourceopen', () => {
      if (MediaSource.isTypeSupported(MIME_TYPE)) {
        const sb = ms.addSourceBuffer(MIME_TYPE);
        sourceBufferRef.current = sb;
        sb.addEventListener('updateend', appendToBuffer);
      } else {
        console.error("MIME type no soportado:", MIME_TYPE);
      }
    });
  };

  const appendToBuffer = () => {
    const sb = sourceBufferRef.current;
    const ms = mediaSourceRef.current;

    // Si el MediaSource se cerró inesperadamente, reiniciar
    if (ms && ms.readyState === 'closed' && queueRef.current.length > 0) {
        initMediaSource();
        return;
    }

    if (sb && !sb.updating && queueRef.current.length > 0) {
      const chunk = queueRef.current.shift();
      if (chunk) {
        try {
          sb.appendBuffer(chunk);
          // Forzar play si el audio está pausado pero hay datos entrando
          if (audioRef.current && audioRef.current.paused) {
              audioRef.current.play().catch(() => {});
          }
        } catch (e) {
          console.error("Error al añadir al buffer, reiniciando MS:", e);
          initMediaSource(); // Reiniciar ante error de buffer
        }
      }
    }
  };

  const disconnect = useCallback(() => {
    if (socketRef.current) { socketRef.current.disconnect(); socketRef.current = null; }
    setIsConnected(false);
    setIsTalking(false);
  }, []);

  const playTone = (freq: number, duration: number) => {
    try {
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, ctx.currentTime);
      gain.gain.setValueAtTime(0.1, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + duration);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + duration);
    } catch (e) {}
  };

  const startTalking = useCallback((userId: string, displayName: string, overrideGroupId?: string) => {
    const targetGroupId = overrideGroupId || groupId;
    if (!socketRef.current?.connected || !targetGroupId || isTalking) return;
    
    // Tono de inicio (Agudo)
    playTone(880, 0.1);

    navigator.mediaDevices.getUserMedia({ audio: true }).then(stream => {
      const mediaRecorder = new MediaRecorder(stream, { mimeType: MIME_TYPE });
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
      socketRef.current?.emit('audio-start', { groupId: targetGroupId, userId, displayName });
    }).catch(e => {
        console.error("Error micro:", e);
        setError('Permiso denegado de micrófono');
    });
  }, [groupId, isTalking]);

  const stopTalking = useCallback(() => {
    if (mediaRecorderRef.current) {
      if (mediaRecorderRef.current.state === 'recording') mediaRecorderRef.current.stop();
      mediaRecorderRef.current.stream.getTracks().forEach(t => t.stop());
      mediaRecorderRef.current = null;
    }

    // Tono de fin (Grave doble)
    playTone(440, 0.08);
    setTimeout(() => playTone(440, 0.08), 120);

    setIsTalking(false);
    socketRef.current?.emit('audio-end', { groupId });
  }, [groupId]);

  useEffect(() => {
    const audio = new Audio();
    audio.autoplay = true;
    audioRef.current = audio;
    
    // Al limpiar, desconectar y liberar recursos
    return () => { 
        disconnect();
        if (mediaSourceRef.current) {
            try { mediaSourceRef.current.endOfStream(); } catch(e) {}
        }
    };
  }, [disconnect]);

  return { isConnected, isTalking, isReceiving, error, connect, disconnect, startTalking, stopTalking };
};
