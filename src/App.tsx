import { useState, useEffect, useCallback, useRef } from 'react';
import { Radio, Mic, MicOff, LogOut, ShieldCheck, Users, Signal, SignalLow, Loader2, PlayCircle, Clock } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useWalkieTalkie } from './hooks/useWalkieTalkie';
import { cn } from './lib/utils';
import { auth, signIn, logOut, db, UserRole, UserProfile } from './firebase';
import { onAuthStateChanged, User } from 'firebase/auth';
import { doc, onSnapshot, updateDoc, collection } from 'firebase/firestore';

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [emailInput, setEmailInput] = useState('');
  const [passInput, setPassInput] = useState('');
  const [userRole, setUserRole] = useState<UserRole | null>(null);
  const [userGroupId, setUserGroupId] = useState<string | null>(null);
  const [userGroupName, setUserGroupName] = useState<string | null>(null);
  const [isAuthLoading, setIsAuthLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);
  const [allUsers, setAllUsers] = useState<UserProfile[]>([]);
  const [talkingUser, setTalkingUser] = useState<UserProfile | null>(null);
  
  // Lógica de PTT Conmutador (Toggle)
  const [isTransmitting, setIsTransmitting] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);

  const activeGroupId = userGroupId;
  const { isConnected, isTalking, isReceiving, connect, disconnect, startTalking, stopTalking } = useWalkieTalkie(activeGroupId);

  // AUTO-CONEXIÓN AL INICIAR SESIÓN
  useEffect(() => {
    if (user && activeGroupId && !isConnected && !isConnecting) {
      setIsConnecting(true);
      connect();
      // Pequeño retardo para dar sensación de sincronización
      setTimeout(() => setIsConnecting(false), 2000);
    }
  }, [user, activeGroupId, isConnected, connect]);

  // SERVICIO EN SEGUNDO PLANO (NATIVO ANDROID)
  useEffect(() => {
    const manageForeground = async () => {
      try {
        const { ForegroundService } = await import('@capawesome-team/capacitor-android-foreground-service');
        if (isConnected) {
          await ForegroundService.start({ id: 101, title: 'COE MC', body: 'Radio Activa - Canal: ' + (userGroupName || 'Emergencia'), importance: 3 });
        } else {
          await ForegroundService.stop();
        }
      } catch (e) { console.log("Web mode"); }
    };
    manageForeground();
  }, [isConnected, userGroupName]);

  // LÓGICA DE BOTÓN TOGGLE (CONMUTADOR)
  const handleToggleTalk = async () => {
    if (!isConnected || !user) return;
    
    if (!isTransmitting) {
      setIsTransmitting(true);
      try {
        await updateDoc(doc(db, 'users', user.uid), { isTalking: true });
        startTalking(user.uid, user.displayName || user.email?.split('@')[0] || "Usuario");
      } catch { setIsTransmitting(false); }
    } else {
      setIsTransmitting(false);
      try {
        await updateDoc(doc(db, 'users', user.uid), { isTalking: false });
        stopTalking();
      } catch {}
    }
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
    if (userGroupId) {
      onSnapshot(collection(db, 'users'), (s) => {
        const users = s.docs.map(d => d.data() as UserProfile);
        setAllUsers(users.filter(u => u.groupId === userGroupId));
        const talker = users.find(u => u.isTalking && u.uid !== user?.uid && u.groupId === userGroupId);
        setTalkingUser(talker || null);
      });
    }
  }, [userGroupId, user]);

  if (isAuthLoading) return <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center space-y-4"><Loader2 className="w-12 h-12 text-blue-500 animate-spin" /><p className="text-blue-200 font-bold animate-pulse">Sincronizando Sistema...</p></div>;

  if (!user) return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col items-center justify-center p-6 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-blue-900/20 via-slate-950 to-slate-950">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="text-center space-y-10 max-w-sm w-full">
        <div className="relative inline-block">
          <h1 className="text-6xl font-black text-red-600 tracking-tighter italic">COE MC</h1>
          <div className="absolute -top-4 -right-4 bg-red-600 text-white px-2 py-0.5 text-[10px] font-bold rounded rotate-12">SEGURIDAD</div>
        </div>
        
        <div className="space-y-4 glass p-8 rounded-3xl">
          <div className="space-y-2">
            <input type="email" placeholder="Usuario / Correo" value={emailInput} onChange={e => setEmailInput(e.target.value)} className="w-full p-4 bg-slate-900/50 border border-slate-800 rounded-2xl outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all" />
            <input type="password" placeholder="Contraseña" value={passInput} onChange={e => setPassInput(e.target.value)} className="w-full p-4 bg-slate-900/50 border border-slate-800 rounded-2xl outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all" />
          </div>
          <button onClick={() => signIn(emailInput, passInput)} className="w-full py-5 bg-gradient-to-r from-blue-600 to-blue-700 text-white font-black rounded-2xl shadow-lg shadow-blue-900/40 active:scale-95 transition-transform flex items-center justify-center gap-2">
            <LogIn className="w-5 h-5"/> ACCESO AL CANAL
          </button>
        </div>
      </motion.div>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col p-6 overflow-hidden bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-slate-900 via-slate-950 to-slate-950">
      {/* Header Premium */}
      <div className="flex justify-between items-center mb-8 glass p-3 px-5 rounded-2xl">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-red-600 rounded-xl flex items-center justify-center shadow-lg shadow-red-900/40"><ShieldCheck className="text-white w-6 h-6"/></div>
          <div>
            <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">Grupo Vigente</p>
            <p className="text-sm font-black text-slate-100 uppercase">{userGroupName || "Radioperador"}</p>
          </div>
        </div>
        <button onClick={logOut} className="p-3 bg-slate-900 hover:bg-slate-800 rounded-xl border border-slate-800 transition-colors"><LogOut className="w-5 h-5 text-slate-400"/></button>
      </div>

      {/* Main Connection Display */}
      <div className="flex-1 flex flex-col items-center justify-center space-y-12">
        <div className="text-center relative">
          <motion.h1 
            initial={{ scale: 0.9 }} 
            animate={{ scale: 1 }} 
            className="text-7xl font-black text-red-600 tracking-tighter mb-2 italic uppercase break-words px-4"
          >
            {userGroupName || "COE MC"}
          </motion.h1>
          <div className={cn(
            "px-6 py-2 rounded-full font-black text-xs tracking-widest flex items-center gap-2 mx-auto w-fit transition-all duration-700",
            isConnected ? "bg-green-600/10 text-green-500 border border-green-500/30" : (isConnecting ? "bg-blue-600/10 text-blue-500 border border-blue-500/30" : "bg-slate-900 text-slate-500 border border-slate-800")
          )}>
            {isConnecting ? <Loader2 className="w-3 h-3 animate-spin"/> : <Signal className={cn("w-3 h-3", isConnected ? "animate-pulse" : "")}/>}
            {isConnecting ? "SINCRONIZANDO..." : (isConnected ? "EN LÍNEA" : "DESCONECTADO")}
          </div>
        </div>

        {/* PTT Circular Button (Toggle Mode) */}
        <div className="relative group">
          {/* Animated Aura */}
          <AnimatePresence>
            {isTransmitting && (
              <motion.div initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1.4, opacity: [0, 0.2, 0] }} transition={{ repeat: Infinity, duration: 1.5 }} exit={{ scale: 0.8, opacity: 0 }} className="absolute inset-0 bg-red-600 rounded-full blur-3xl z-0" />
            )}
          </AnimatePresence>

          <button
            onClick={handleToggleTalk}
            disabled={!isConnected}
            className={cn(
              "w-64 h-64 rounded-full relative z-10 flex flex-col items-center justify-center gap-2 transition-all shadow-2xl active:scale-95 border-8",
              isTransmitting ? "bg-red-600 border-red-500 shadow-red-900/80" : (isConnected ? "bg-blue-800 border-blue-900 shadow-blue-950/80" : "bg-slate-900 border-slate-800 opacity-50")
            )}
          >
            {isTransmitting ? <Mic className="w-24 h-24 text-white animate-pulse" /> : <MicOff className="w-24 h-24 text-white/40" />}
            <span className="text-white font-black tracking-widest text-lg uppercase">{isTransmitting ? "AL AIRE" : "TRANSMITIR"}</span>
            <div className="h-2 w-20 bg-black/20 rounded-full overflow-hidden mt-2">
               {isTransmitting && <motion.div animate={{ width: ['0%', '100%', '0%'] }} transition={{ repeat: Infinity, duration: 2 }} className="h-full bg-white"/>}
            </div>
          </button>

          {/* Receiving Indicator Overlay */}
          <AnimatePresence>
            {isReceiving && (
              <motion.div initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 20, opacity: 0 }} className="absolute -top-12 left-1/2 -translate-x-1/2 glass px-6 py-2 rounded-2xl flex items-center gap-3 border-red-500/50 shadow-lg shadow-red-900/20">
                <div className="w-2 h-2 bg-red-500 rounded-full animate-ping" />
                <p className="text-xs font-black text-red-500 uppercase">RECIBIENDO: {talkingUser?.displayName || "ENTRANTE"}</p>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Radar - Operadores Conectados */}
        <div className="w-full max-w-sm glass rounded-3xl p-6">
          <div className="flex items-center justify-between mb-4">
             <div className="flex items-center gap-2">
                <Users className="w-4 h-4 text-blue-400"/>
                <h3 className="text-[10px] font-black uppercase tracking-widest text-slate-400">Radioperadores Disponibles</h3>
             </div>
             <span className="bg-blue-500/10 text-blue-500 text-[10px] px-2 py-0.5 rounded-full font-bold">{allUsers.length}</span>
          </div>
          <div className="grid grid-cols-2 gap-3 max-h-32 overflow-y-auto pr-2">
            {allUsers.map((u) => (
              <div key={u.uid} className={cn("p-3 rounded-2xl flex items-center gap-2 border transition-colors", u.isTalking ? "bg-red-600/10 border-red-500/50" : "bg-slate-900/50 border-slate-800")}>
                <div className={cn("w-6 h-6 rounded-lg flex items-center justify-center text-[10px] font-bold", u.isTalking ? "bg-red-600 text-white" : "bg-blue-600 text-white")}>
                  {u.displayName?.[0] || 'U'}
                </div>
                <div className="min-w-0">
                  <p className="text-[10px] font-bold truncate leading-tight">{u.displayName}</p>
                  <p className="text-[8px] text-slate-500 uppercase tracking-tighter">{u.isTalking ? "Transmitiendo" : "En Espera"}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Footer / Info */}
      <div className="mt-8 text-center border-t border-slate-900 pt-8">
         <p className="text-[8px] text-slate-600 font-bold uppercase tracking-[0.2em]">Cifrado de Extremo a Extremo • Transmisión Cero Latencia</p>
      </div>
    </div>
  );
}
