import { useState, useEffect, useCallback, useRef } from 'react';
import { Radio, Mic, MicOff, LogOut, LogIn, ShieldCheck, Users, Signal, SignalLow, Loader2, PlayCircle, Clock, Crown } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
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
  
  const [isTransmitting, setIsTransmitting] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);

  const activeGroupId = userGroupId;
  const { isConnected, isTalking, isReceiving, connect, disconnect, startTalking, stopTalking } = useWalkieTalkie(activeGroupId);

  const isAdmin = userRole === 'admin';

  // AUTO-CONEXIÓN AL INICIAR SESIÓN
  useEffect(() => {
    if (user && activeGroupId && !isConnected && !isConnecting) {
      setIsConnecting(true);
      connect();
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
      } catch (e) { /* Web mode */ }
    };
    manageForeground();
  }, [isConnected, userGroupName]);

  const handleToggleTalk = async () => {
    if (!isConnected || !user) return;
    
    // Activar audio si estaba bloqueado por el navegador
    const audio = document.querySelector('audio');
    if (audio) audio.play().catch(() => {});

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
            const d = snap.data(); 
            setUserRole(d.role); 
            setUserGroupId(d.groupId);
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

  if (isAuthLoading) return <div className="h-screen bg-slate-950 flex flex-col items-center justify-center space-y-4"><Loader2 className="w-12 h-12 text-blue-500 animate-spin" /><p className="text-blue-200 font-bold animate-pulse">Sincronizando Sistema...</p></div>;

  if (!user) return (
    <div className="h-screen bg-slate-950 text-slate-100 flex flex-col items-center justify-center p-6 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-blue-900/20 via-slate-950 to-slate-950">
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
    <div className="h-screen w-full bg-slate-950 text-slate-100 flex flex-col p-4 overflow-hidden bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-slate-900 via-slate-950 to-slate-950">
      {/* Header Premium - Compacto para móvil */}
      <div className="flex justify-between items-center mb-4 glass p-3 px-4 rounded-2xl shrink-0">
        <div className="flex items-center gap-2">
          <div className={cn("w-9 h-9 rounded-xl flex items-center justify-center shadow-lg shadow-red-900/40", isAdmin ? "bg-amber-600" : "bg-red-600")}>
            {isAdmin ? <Crown className="text-white w-5 h-5"/> : <ShieldCheck className="text-white w-5 h-5"/>}
          </div>
          <div>
            <div className="flex items-center gap-1">
                <p className="text-[8px] text-slate-500 font-bold uppercase tracking-widest">{isAdmin ? "Admin" : "Grupo"}</p>
                {isAdmin && <span className="w-1.5 h-1.5 bg-amber-500 rounded-full animate-pulse"/>}
            </div>
            <p className="text-xs font-black text-slate-100 uppercase truncate max-w-[120px]">{userGroupName || "Radioperador"}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
            <div className="text-right hidden sm:block mr-2">
                <p className="text-[8px] text-slate-500 font-bold uppercase">{user?.email?.split('@')[0]}</p>
            </div>
            <button onClick={logOut} className="p-2.5 bg-slate-900 hover:bg-slate-800 rounded-xl border border-slate-800 transition-colors"><LogOut className="w-4 h-4 text-slate-400"/></button>
        </div>
      </div>

      {/* Main Connection Display - Adaptativo */}
      <div className="flex-1 flex flex-col items-center justify-evenly py-2 min-h-0">
        <div className="text-center relative shrink-0">
          <motion.h1 
            initial={{ scale: 0.9 }} 
            animate={{ scale: 1 }} 
            className="text-5xl xs:text-6xl sm:text-7xl font-black text-red-600 tracking-tighter italic uppercase break-words px-4 leading-none"
          >
            {userGroupName || "COE MC"}
          </motion.h1>
          <div className={cn(
            "px-4 py-1.5 mt-2 rounded-full font-black text-[10px] tracking-widest flex items-center gap-2 mx-auto w-fit transition-all duration-700",
            isConnected ? "bg-green-600/10 text-green-500 border border-green-500/30" : (isConnecting ? "bg-blue-600/10 text-blue-500 border border-blue-500/30" : "bg-slate-900 text-slate-500 border border-slate-800")
          )}>
            {isConnecting ? <Loader2 className="w-3 h-3 animate-spin"/> : <Signal className={cn("w-3 h-3", isConnected ? "animate-pulse" : "")}/>}
            {isConnecting ? "SINCRONIZANDO..." : (isConnected ? "EN LÍNEA" : "DESCONECTADO")}
          </div>
        </div>

        {/* PTT Circular Button - Escalado dinámico */}
        <div className="relative group shrink-0 py-4">
          <AnimatePresence>
            {isTransmitting && (
              <motion.div initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1.4, opacity: [0, 0.2, 0] }} transition={{ repeat: Infinity, duration: 1.5 }} exit={{ scale: 0.8, opacity: 0 }} className="absolute inset-0 bg-red-600 rounded-full blur-3xl z-0" />
            )}
          </AnimatePresence>

          <button
            onClick={handleToggleTalk}
            disabled={!isConnected}
            className={cn(
              "w-[50vw] h-[50vw] max-w-[240px] max-h-[240px] rounded-full relative z-10 flex flex-col items-center justify-center gap-2 transition-all shadow-2xl active:scale-95 border-8",
              isTransmitting ? "bg-red-600 border-red-500 shadow-red-900/80" : (isConnected ? "bg-blue-800 border-blue-900 shadow-blue-950/80" : "bg-slate-900 border-slate-800 opacity-50")
            )}
          >
            {isTransmitting ? <Mic className="w-16 h-16 sm:w-20 sm:h-20 text-white animate-pulse" /> : <MicOff className="w-16 h-16 sm:w-20 sm:h-20 text-white/40" />}
            <span className="text-white font-black tracking-widest text-sm sm:text-base uppercase">{isTransmitting ? "AL AIRE" : "TRANSMITIR"}</span>
            <div className="h-1.5 w-16 bg-black/20 rounded-full overflow-hidden mt-2">
               {isTransmitting && <motion.div animate={{ width: ['0%', '100%', '0%'] }} transition={{ repeat: Infinity, duration: 2 }} className="h-full bg-white"/>}
            </div>
          </button>

          {/* Receiving Indicator Overlay */}
          <AnimatePresence>
            {isReceiving && (
              <motion.div initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 20, opacity: 0 }} className="absolute -top-10 left-1/2 -translate-x-1/2 glass px-4 py-1.5 rounded-xl flex items-center gap-2 border-red-500/50 shadow-lg shadow-red-900/20 whitespace-nowrap">
                <div className="w-2 h-2 bg-red-500 rounded-full animate-ping" />
                <p className="text-[10px] font-black text-red-500 uppercase">RECIBIENDO: {talkingUser?.displayName || "ENTRANTE"}</p>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Radar - Operadores Conectados - Scroll interno */}
        <div className="w-full max-w-sm glass rounded-3xl p-4 min-h-0 flex flex-col">
          <div className="flex items-center justify-between mb-3 shrink-0">
             <div className="flex items-center gap-2">
                <Users className="w-4 h-4 text-blue-400"/>
                <h3 className="text-[10px] font-black uppercase tracking-widest text-slate-400">Radioperadores Disponibles</h3>
             </div>
             <span className={cn("text-[10px] px-2 py-0.5 rounded-full font-bold", isAdmin ? "bg-amber-500/10 text-amber-500" : "bg-blue-500/10 text-blue-500")}>
                {allUsers.length} ACTIVOS
             </span>
          </div>
          <div className="grid grid-cols-2 gap-2 overflow-y-auto pr-1">
            {allUsers.map((u) => (
              <div key={u.uid} className={cn("p-2 rounded-xl flex items-center gap-2 border transition-colors", u.isTalking ? "bg-red-600/10 border-red-500/50" : "bg-slate-900/50 border-slate-800")}>
                <div className={cn("w-5 h-5 rounded-lg flex items-center justify-center text-[8px] font-bold shrink-0", u.isTalking ? "bg-red-600 text-white" : "bg-blue-600 text-white")}>
                  {u.displayName?.[0] || 'U'}
                </div>
                <div className="min-w-0">
                  <p className="text-[9px] font-bold truncate leading-tight uppercase">{u.displayName}</p>
                  <p className="text-[7px] text-slate-500 uppercase tracking-tighter truncate">{u.isTalking ? "Transmitiendo" : "En Espera"}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Footer / Info */}
      <div className="py-2 text-center shrink-0">
         <p className="text-[7px] text-slate-600 font-bold uppercase tracking-[0.2em]">{isAdmin ? "SISTEMA INTEGRAL DE MONITOREO ADMINISTRATIVO" : "Cifrado de Extremo a Extremo • Transmisión Cero Latencia"}</p>
      </div>
    </div>
  );
}
