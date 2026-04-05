// 3. src/App.tsx (Push-to-Talk y Foreground Service)
// [REEMPLAZA TODO EL CONTENIDO CON ESTO]
import { useState, useEffect, useCallback } from 'react';
import { Radio, Mic, MicOff, LogIn, LogOut, User as UserIcon, ShieldCheck, Shield, Settings, Volume2, Download, Trash2, X } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useWalkieTalkie } from './hooks/useWalkieTalkie';
import { cn } from './lib/utils';
import { auth, signIn, logOut, db, UserRole, UserProfile } from './firebase';
import { onAuthStateChanged, User } from 'firebase/auth';
import { doc, onSnapshot, updateDoc, collection } from 'firebase/firestore';
import AdminPanel from './components/AdminPanel';

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [emailInput, setEmailInput] = useState('');
  const [passInput, setPassInput] = useState('');
  const [userRole, setUserRole] = useState<UserRole | null>(null);
  const [userGroupId, setUserGroupId] = useState<string | null>(null);
  const [userGroupName, setUserGroupName] = useState<string | null>(null);
  const [isAuthLoading, setIsAuthLoading] = useState(true);
  const [isAdminPanelOpen, setIsAdminPanelOpen] = useState(false);
  const [isMonitorOpen, setIsMonitorOpen] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [allUsers, setAllUsers] = useState<UserProfile[]>([]);
  const [allGroups, setAllGroups] = useState<any[]>([]);
  const [talkingUser, setTalkingUser] = useState<UserProfile | null>(null);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [recordings, setRecordings] = useState<any[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [isPressed, setIsPressed] = useState(false);

  const handleNewRecording = useCallback((newRec: any) => { if (isHistoryOpen) setRecordings((prev: any[]) => [newRec, ...prev]); }, [isHistoryOpen]);
  const activeGroupId = (userRole === UserRole.ADMIN && isMonitorOpen) ? 'global-monitor' : userGroupId;
  const { isConnected, isTalking, isReceiving, connect, disconnect, startTalking, stopTalking, playRecording } = useWalkieTalkie(activeGroupId, handleNewRecording);

  // SERVICIO EN SEGUNDO PLANO (NATIVO ANDROID)
  useEffect(() => {
    const manageForeground = async () => {
      try {
        const { ForegroundService } = await import('@capawesome-team/capacitor-android-foreground-service');
        if (isConnected) {
          await ForegroundService.start({ id: 101, title: 'COE MC', body: 'Conectado al canal de emergencia', importance: 3 });
        } else {
          await ForegroundService.stop();
        }
      } catch (e) { console.log("Foreground Service no disponible en web"); }
    };
    manageForeground();
  }, [isConnected]);

  // LÓGICA MANTENER PARA HABLAR (PUSH TO TALK)
  const handleStartTalk = async () => {
    if (!isConnected || isPressed || !user) return;
    setIsPressed(true);
    try {
      await updateDoc(doc(db, 'users', user.uid), { isTalking: true });
      startTalking(user.uid, user.displayName || user.email?.split('@')[0] || "Usuario");
    } catch { setIsPressed(false); }
  };

  const handleStopTalk = async () => {
    if (!isPressed || !user) return;
    setIsPressed(false);
    try {
      await updateDoc(doc(db, 'users', user.uid), { isTalking: false });
      stopTalking();
    } catch {}
  };

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u);
      if (u) {
        onSnapshot(doc(db, 'users', u.uid), (snap) => {
          if (snap.exists()) {
            const d = snap.data(); setUserRole(d.role); setUserGroupId(d.groupId);
            if (d.groupId) onSnapshot(doc(db, 'groups', d.groupId), (g) => setUserGroupName(g.data()?.name));
          }
          setIsAuthLoading(false);
        });
      } else { setIsAuthLoading(false); }
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    if (userRole) {
      onSnapshot(collection(db, 'users'), (s) => {
        const users = s.docs.map(d => d.data() as UserProfile);
        setAllUsers(users);
        const talker = users.find(u => u.isTalking && u.uid !== user?.uid);
        setTalkingUser(talker || null);
      });
      onSnapshot(collection(db, 'groups'), (s) => setAllGroups(s.docs.map(d => ({ id: d.id, ...d.data() }))));
    }
  }, [userRole, activeGroupId, user]);

  if (isAuthLoading) return <div className="min-h-screen bg-white flex items-center justify-center">Cargando...</div>;

  if (!user) return (
    <div className="min-h-screen bg-white text-gray-900 flex flex-col items-center justify-center p-4">
      <div className="text-center space-y-8 max-w-sm w-full">
        <h1 className="text-4xl font-bold text-red-600">COE MC</h1>
        <input type="email" placeholder="Correo" value={emailInput} onChange={e => setEmailInput(e.target.value)} className="w-full p-3 border rounded-xl" />
        <input type="password" placeholder="Contraseña" value={passInput} onChange={e => setPassInput(e.target.value)} className="w-full p-3 border rounded-xl" />
        <button onClick={() => signIn(emailInput, passInput)} className="w-full py-4 bg-blue-600 text-white font-bold rounded-2xl">ENTRAR</button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-white text-gray-900 flex flex-col items-center justify-center p-4">
      <div className="fixed top-0 left-0 right-0 p-4 flex justify-between">
        <div className="bg-gray-100 p-2 rounded-xl text-xs font-bold uppercase">{userGroupName || "Sin Grupo"}</div>
        <button onClick={logOut} className="p-2 bg-gray-100 rounded-xl"><LogOut className="w-5 h-5"/></button>
      </div>

      <div className="text-center space-y-4 mb-8">
        <h1 className="text-6xl font-black text-red-600">COE MC</h1>
        <div className={cn("px-4 py-2 rounded-full text-white font-bold inline-block", isConnected ? "bg-green-600" : "bg-gray-400")}>
          {isConnected ? "EN LÍNEA" : "DESCONECTADO"}
        </div>
      </div>

      <div className="w-64 h-64 relative">
         <button
            onMouseDown={handleStartTalk}
            onMouseUp={handleStopTalk}
            onTouchStart={(e) => { e.preventDefault(); handleStartTalk(); }}
            onTouchEnd={(e) => { e.preventDefault(); handleStopTalk(); }}
            disabled={!isConnected}
            className={cn("w-full h-full rounded-full flex flex-col items-center justify-center gap-2 transition-all shadow-2xl active:scale-90", isPressed ? "bg-red-600" : "bg-blue-600")}
          >
            {isTalking ? <Mic className="w-20 h-20 text-white animate-pulse" /> : <MicOff className="w-20 h-20 text-white/50" />}
            <span className="text-white font-bold">{isPressed ? "AL AIRE" : "MANTENER PULSADO"}</span>
         </button>
         {isReceiving && <div className="absolute -top-4 left-1/2 -translate-x-1/2 bg-red-600 text-white text-[10px] px-2 py-1 rounded animate-bounce">RECIBIENDO: {talkingUser?.displayName || "ALGUIEN"}</div>}
      </div>

      <button onClick={() => isConnected ? disconnect() : connect()} className="mt-8 p-4 bg-gray-100 rounded-2xl">
        {isConnected ? "DESCONECTAR" : "CONECTAR FRECUENCIA"}
      </button>
    </div>
  );
}
