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
    
    if (socketRef.current?.connected) {
      socketRef.current.disconnect();
    }
    
    const socket = io(SOCKET_URL, {
      transports: ['websocket'],
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 1000
    });
    
    socketRef.current = socket;
    
    socket.on('connect', () => {
      console.log('Conectado al servidor');
      setIsConnected(true);
      setError(null);
      socket.emit('join-group', groupId);
    });
    
    socket.on('disconnect', () => {
      console.log('Desconectado');
      setIsConnected(false);
    });
    
    socket.on('connect_error', (err) => {
      console.error('Error de conexión:', err);
      setError('No se pudo conectar al servidor');
      setIsConnected(false);
    });
    
    socket.on('audio-receive', async ({ data }) => {
      setIsReceiving(true);
      try {
        const blob = new Blob([data], { type: 'audio/webm' });
        const url = URL.createObjectURL(blob);
        if (audioRef.current) {
          audioRef.current.src = url;
          await audioRef.current.play();
        }
        setTimeout(() => setIsReceiving(false), 500);
      } catch (err) {
        console.error('Error reproduciendo audio:', err);
        setIsReceiving(false);
      }
    });
    
    socket.on('new-recording', (recording) => {
      if (onNewRecording) onNewRecording(recording);
    });
    
  }, [groupId, onNewRecording]);
  
  const disconnect = useCallback(() => {
    if (socketRef.current) {
      if (groupId) socketRef.current.emit('leave-group', groupId);
      socketRef.current.disconnect();
      socketRef.current = null;
    }
    setIsConnected(false);
    setIsTalking(false);
  }, [groupId]);
  
  const startTalking = useCallback((userId: string, displayName: string) => {
    if (!socketRef.current?.connected || !groupId) return;
    
    navigator.mediaDevices.getUserMedia({ audio: true })
      .then(stream => {
        const mediaRecorder = new MediaRecorder(stream);
        mediaRecorderRef.current = mediaRecorder;
        audioChunksRef.current = [];
        
        mediaRecorder.ondataavailable = (event) => {
          if (event.data.size > 0) {
            audioChunksRef.current.push(event.data);
            event.data.arrayBuffer().then(buffer => {
              socketRef.current?.emit('audio-data', { groupId, data: buffer });
            });
          }
        };
        
        mediaRecorder.start(100); // Enviar cada 100ms
        setIsTalking(true);
        socketRef.current.emit('audio-start', { groupId, userId, displayName });
      })
      .catch(err => {
        console.error('Error accediendo al micrófono:', err);
        setError('No se pudo acceder al micrófono');
      });
  }, [groupId]);
  
  const stopTalking = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.stop();
      mediaRecorderRef.current.stream.getTracks().forEach(track => track.stop());
      mediaRecorderRef.current = null;
    }
    setIsTalking(false);
    socketRef.current?.emit('audio-end');
  }, []);
  
  const playRecording = useCallback((filename: string) => {
    const audio = new Audio(`https://llamada-urgente-2.onrender.com/api/recordings/play/${filename}`);
    audio.play().catch(console.error);
  }, []);
  
  useEffect(() => {
    audioRef.current = new Audio();
    return () => {
      if (socketRef.current) disconnect();
      if (audioRef.current) audioRef.current.pause();
    };
  }, [disconnect]);
  
  return {
    isConnected,
    isTalking,
    isReceiving,
    error,
    connect,
    disconnect,
    startTalking,
    stopTalking,
    playRecording
  };
};
