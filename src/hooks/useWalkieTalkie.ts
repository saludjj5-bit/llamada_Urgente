import { useEffect, useRef, useState, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';

const SOCKET_URL = 'https://llamada-urgente-2.onrender.com';

// MIME Type compatible con la mayoría de navegadores para OPUS/WEBM
const MIME_TYPE = 'audio/webm; codecs="opus"';

export const useWalkieTalkie = (groupId: string | null, onNewRecording?: (recording: any) => void) => {
  const [isConnected, setIsConnected] = useState(false);
  const [isTalking, setIsTalking] = useState(false);
  const [isReceiving, setIsReceiving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const socketRef = useRef<Socket | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  
  // Referencias para el streaming de audio recibiendo
  const mediaSourceRef = useRef<MediaSource | null>(null);
  const sourceBufferRef = useRef<SourceBuffer | null>(null);
  const queueRef = useRef<ArrayBuffer[]>([]);

  const connect = useCallback(() => {
    if (!groupId) return;
    if (socketRef.current?.connected) socketRef.current.disconnect();
    
    const socket = io(SOCKET_URL, { transports: ['websocket'], reconnection: true });
    socketRef.current = socket;

    socket.on('connect', () => { 
      setIsConnected(true); 
      setError(null); 
      socket.emit('join-group', groupId); 
    });
    
    socket.on('disconnect', () => setIsConnected(false));

    // LÓGICA DE RECIBIR AUDIO EN TIEMPO REAL
    socket.on('audio-receive', async ({ data }) => {
      setIsReceiving(true);
      
      // Si no hay MediaSource activo, lo inicializamos
      if (!mediaSourceRef.current || mediaSourceRef.current.readyState !== 'open') {
        initMediaSource();
      }

      // Añadimos el fragmento a la cola para procesarlo cuando el buffer esté libre
      queueRef.current.push(data);
      appendToBuffer();
      
      // Feedback visual de recibiendo
      setTimeout(() => setIsReceiving(false), 2000);
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
      if (SourceBuffer.isTypeSupported(MIME_TYPE)) {
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
    if (sb && !sb.updating && queueRef.current.length > 0) {
      const chunk = queueRef.current.shift();
      if (chunk) {
        try {
          sb.appendBuffer(chunk);
        } catch (e) {
          console.error("Error al añadir al buffer:", e);
        }
      }
    }
  };

  const disconnect = useCallback(() => {
    if (socketRef.current) { socketRef.current.disconnect(); socketRef.current = null; }
    setIsConnected(false);
    setIsTalking(false);
  }, []);

  const startTalking = useCallback((userId: string, displayName: string) => {
    if (!socketRef.current?.connected || !groupId || isTalking) return;
    
    navigator.mediaDevices.getUserMedia({ audio: true }).then(stream => {
      // Usar MediaRecorder con intervalos pequeños para streaming
      const mediaRecorder = new MediaRecorder(stream, { mimeType: MIME_TYPE });
      mediaRecorderRef.current = mediaRecorder;
      
      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0 && socketRef.current?.connected) {
          event.data.arrayBuffer().then(buffer => {
            socketRef.current?.emit('audio-data', { groupId, data: buffer });
          });
        }
      };
      
      // Enviar datos cada 200ms para balancear fluidez y carga
      mediaRecorder.start(200);
      setIsTalking(true);
      socketRef.current?.emit('audio-start', { groupId, userId, displayName });
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
