import { useState, useCallback, useRef, useEffect } from 'react';
import { io, Socket } from 'socket.io-client';

export function useWalkieTalkie(groupId: string | null, onNewRecording?: (data: any) => void) {
  const [isConnected, setIsConnected] = useState(false);
  const [isTalking, setIsTalking] = useState(false);
  const [isReceiving, setIsReceiving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const socketRef = useRef<Socket | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  
  const audioQueueRef = useRef<Float32Array[]>([]);
  const isPlayingRef = useRef(false);
  const nextStartTimeRef = useRef(0);

  // --- TRUCO PARA DESBLOQUEAR EL AUDIO EN CELULARES ---
  useEffect(() => {
    const unlockAudio = () => {
      if (!audioContextRef.current) {
        audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
      }
      if (audioContextRef.current.state === 'suspended') {
        audioContextRef.current.resume();
      }
    };
    // El primer toque en la pantalla encenderá la bocina lógicamente
    document.addEventListener('touchstart', unlockAudio, { once: true });
    document.addEventListener('click', unlockAudio, { once: true });
    return () => {
      document.removeEventListener('touchstart', unlockAudio);
      document.removeEventListener('click', unlockAudio);
    };
  }, []);

  const playNextInQueue = useCallback(() => {
    if (audioQueueRef.current.length === 0 || !audioContextRef.current) {
      isPlayingRef.current = false;
      setIsReceiving(false);
      return;
    }

    if (audioContextRef.current.state === 'suspended') {
      audioContextRef.current.resume();
    }

    isPlayingRef.current = true;
    setIsReceiving(true);
    const float32Data = audioQueueRef.current.shift()!;
    
    const buffer = audioContextRef.current.createBuffer(1, float32Data.length, 16000);
    buffer.getChannelData(0).set(float32Data);

    const source = audioContextRef.current.createBufferSource();
    source.buffer = buffer;
    source.connect(audioContextRef.current.destination);
    
    const currentTime = audioContextRef.current.currentTime;
    const startTime = Math.max(currentTime, nextStartTimeRef.current);
    
    source.start(startTime);
    nextStartTimeRef.current = startTime + buffer.duration;
    
    source.onended = () => {
      playNextInQueue();
    };
  }, []);

  const connect = useCallback(() => {
    if (!groupId) return;
    
    const socket = io('https://llamada-urgente-2.onrender.com', {
      path: '/socket.io',
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000
    });
    
    socketRef.current = socket;

    socket.on('connect', () => {
      setIsConnected(true);
      setError(null);
      socket.emit('join-group', groupId);
    });

    socket.on('connect_error', (err) => {
      setIsConnected(false);
      setError(`Error de conexión: ${err.message}`);
    });

    socket.on('reconnect', () => {
      setError(null);
    });

    socket.on('audio-receive', ({ data }) => {
      if (!audioContextRef.current) {
        audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
        nextStartTimeRef.current = audioContextRef.current.currentTime;
      }
      
      if (audioContextRef.current.state === 'suspended') {
        audioContextRef.current.resume();
      }

      const pcmData = new Int16Array(data);
      const float32Data = new Float32Array(pcmData.length);
      for (let i = 0; i < pcmData.length; i++) {
        float32Data[i] = pcmData[i] / 32768.0;
      }

      audioQueueRef.current.push(float32Data);
      if (!isPlayingRef.current) {
        playNextInQueue();
      }
    });

    socket.on('new-recording', (data) => {
      if (onNewRecording) onNewRecording(data);
    });

    socket.on('disconnect', () => {
      setIsConnected(false);
    });

    return () => {
      socket.disconnect();
    };
  }, [groupId, playNextInQueue, onNewRecording]);

  const startTalking = async (userId: string, displayName: string) => {
    if (!isConnected || !socketRef.current || !groupId) return;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (!audioContextRef.current) {
        audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
      }
      if (audioContextRef.current.state === 'suspended') {
        audioContextRef.current.resume();
      }
      
      socketRef.current.emit('audio-start', { groupId, userId, displayName });

      sourceRef.current = audioContextRef.current.createMediaStreamSource(stream);
      processorRef.current = audioContextRef.current.createScriptProcessor(2048, 1, 1);

      processorRef.current.onaudioprocess = (e) => {
        const inputData = e.inputBuffer.getChannelData(0);
        const pcmData = new Int16Array(inputData.length);
        for (let i = 0; i < inputData.length; i++) {
          pcmData[i] = Math.max(-1, Math.min(1, inputData[i])) * 0x7FFF;
        }
        
        socketRef.current?.emit('audio-data', { groupId, data: pcmData.buffer });
      };

      sourceRef.current.connect(processorRef.current);
      processorRef.current.connect(audioContextRef.current.destination);
      setIsTalking(true);
    } catch (err) {
      setError("No se pudo acceder al micrófono.");
    }
  };

  const stopTalking = useCallback(() => {
    if (processorRef.current) {
      processorRef.current.disconnect();
      processorRef.current = null;
    }
    if (sourceRef.current) {
      sourceRef.current.mediaStream.getTracks().forEach(t => { t.stop(); t.enabled = false; });
      sourceRef.current.disconnect();
      sourceRef.current = null;
    }
    if (socketRef.current) {
      socketRef.current.emit('audio-end');
    }
    setIsTalking(false);
  }, []);

  const playRecording = useCallback(async (filename: string) => {
    try {
      if (!audioContextRef.current) {
        audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
      }
      if (audioContextRef.current.state === 'suspended') {
        await audioContextRef.current.resume();
      }

      const response = await fetch(`https://llamada-urgente-2.onrender.com/api/recordings/play/${encodeURIComponent(filename)}`);
      if (!response.ok) throw new Error(`Failed to fetch`);
      
      const arrayBuffer = await response.arrayBuffer();
      const pcmData = new Int16Array(arrayBuffer);
      const float32Data = new Float32Array(pcmData.length);
      for (let i = 0; i < pcmData.length; i++) float32Data[i] = pcmData[i] / 32768.0;

      audioQueueRef.current.push(float32Data);
      if (!isPlayingRef.current) {
        nextStartTimeRef.current = audioContextRef.current.currentTime;
        playNextInQueue();
      }
    } catch (err) {
      setError("Error al reproducir la grabación.");
    }
  }, [playNextInQueue]);

  const disconnect = useCallback(() => {
    if (socketRef.current) {
      socketRef.current.disconnect();
      socketRef.current = null;
    }
    stopTalking();
    setIsConnected(false);
  }, [stopTalking]);

  useEffect(() => {
    if (groupId) {
      const cleanup = connect();
      return cleanup;
    }
  }, [groupId, connect]);

  return { isConnected, isTalking, isReceiving, error, connect, disconnect, startTalking, stopTalking, playRecording };
}
