import { useState, useEffect, useCallback, useRef } from 'react';
import { Radio, Mic, MicOff, LogOut, LogIn, ShieldCheck, Users, Signal, SignalLow, Loader2, PlayCircle, Clock, Crown, Settings, ShieldAlert, Zap } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
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
  const [showAdminPanel, setShowAdminPanel] = useState(false);
  const [isMonitoringAll, setIsMonitoringAll] = useState(false);
  const [monitoringGroup, setMonitoringGroup] = useState<string | null>(null);
  
  const [allUsers, setAllUsers] = useState<UserProfile[]>([]);
  const [talkingUser, setTalkingUser] = useState<UserProfile | null>(null);
  const [isTransmitting, setIsTransmitting] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);

  // Monitor Global: Si es Admin y está en modo monitor, escucha a 'all'
  const activeGroupId = isMonitoringAll ? 'all' : userGroupId;
  const { isConnected, isTalking, isReceiving, connect, disconnect, startTalking, stopTalking } = useWalkieTalkie(activeGroupId);

  const isAdmin = userRole === UserRole.ADMIN;
  const isAdmin2 = userRole === UserRole.ADMIN2;

  // Lógica para detectar qué grupo habla en modo monitor
  useEffect(() => {
    const handleGroupTalk = (e: any) => setMonitoringGroup(e.detail);
    window.addEventListener('group-talking', handleGroupTalk);
    return () => window.removeEventListener('group-talking', handleGroupTalk);
  }, []);

  // AUTO-CONEXIÓN
  useEffect(() => {
    if (user && activeGroupId && !isConnected && !isConnecting) {
      setIsConnecting(true);
      connect();
      setTimeout(() => setIsConnecting(false), 2000);
    }
  }, [user, activeGroupId, isConnected, connect]);

  // SERVICIO EN SEGUNDO PLANO
  useEffect(() => {
    const manageForeground = async () => {
      try {
        const { ForegroundService } = await import('@capawesome-team/capacitor-android-foreground-service');
        if (isConnected) {
          await ForegroundService.start({ id: 101, title: 'COE MC', body: 'Radio Activa - ' + (isMonitoringAll ? 'MONITOR GLOBAL' : userGroupName), importance: 3 });
        } else {
          await ForegroundService.stop();
        }
      } catch (e) { /* Web mode */ }
    };
    manageForeground();
  }, [isConnected, userGroupName, isMonitoringAll]);

  const handleToggleTalk = async () => {
    if (!isConnected || !user) return;
    const audio = document.querySelector('audio');
    if (audio) audio.play().catch(() => {});

    if (!isTransmitting) {
      setIsTransmitting(true);
      try {
        await updateDoc(doc(db, 'users', user.uid), { isTalking: true });
        // Si es Monitor, el ID de grupo para broadcast es 'broadcast' o 'all'
        startTalking(user.uid, user.displayName || user.email?.split('@')[0] || "Admin", isMonitoringAll ? 'all' : userGroupId!);
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
    if (userGroupId && !isMonitoringAll) {
      onSnapshot(collection(db, 'users'), (s) => {
        const users = s.docs.map(d => d.data() as UserProfile);
        const talker = users.find(u => u.isTalking && u.uid !== user?.uid && u.groupId === userGroupId);
        setTalkingUser(talker || null);
      });
    }
  }, [userGroupId, user, isMonitoringAll]);

  if (isAuthLoading) return <div className="h-screen bg-slate-950 flex flex-col items-center justify-center space-y-4"><Loader2 className="w-12 h-12 text-blue-500 animate-spin" /><p className="text-blue-200 font-bold animate-pulse">Sincronizando Sistema...</p></div>;

  if (!user) return (
    <div className="h-screen bg-slate-950 text-slate-100 flex flex-col items-center justify-center p-6">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="text-center space-y-10 max-w-sm w-full">
        <div className="relative inline-block">
          <h1 className="text-6xl font-black text-red-600 tracking-tighter italic">COE MC</h1>
          <div className="absolute -top-4 -right-4 bg-red-600 text-white px-2 py-0.5 text-[10px] font-bold rounded rotate-12">SEGURIDAD</div>
        </div>
        <div className="space-y-4 glass p-8 rounded-3xl">
          <div className="space-y-2">
            <input type="email" placeholder="Usuario / Correo" value={emailInput} onChange={e => setEmailInput(e.target.value)} className="w-full p-4 bg-slate-900/50 border border-slate-800 rounded-2xl outline-none focus:border-blue-500" />
            <input type="password" placeholder="Contraseña" value={passInput} onChange={e => setPassInput(e.target.value)} className="w-full p-4 bg-slate-900/50 border border-slate-800 rounded-2xl outline-none focus:border-blue-500" />
          </div>
          <button onClick={() => signIn(emailInput, passInput)} className="w-full py-5 bg-gradient-to-r from-blue-600 to-blue-700 text-white font-black rounded-2xl shadow-lg active:scale-95 transition-transform flex items-center justify-center gap-2">
            <LogIn className="w-5 h-5"/> ACCESO AL CANAL
          </button>
        </div>
      </motion.div>
    </div>
  );

  return (
    <div className="h-screen w-full bg-slate-950 text-slate-100 flex flex-col p-4 overflow-hidden bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-slate-900 via-slate-950 to-slate-950">
      
      <AnimatePresence>
        {showAdminPanel && <AdminPanel onClose={() => setShowAdminPanel(false)} userRole={userRole!} currentGroupId={userGroupId} />}
      </AnimatePresence>

      {/* Header Premium */}
      <div className="flex justify-between items-center mb-4 glass p-3 px-4 rounded-2xl shrink-0">
        <div className="flex items-center gap-2">
          <div className={cn("w-9 h-9 rounded-xl flex items-center justify-center shadow-lg", isAdmin ? "bg-amber-600 shadow-amber-900/40" : "bg-red-600 shadow-red-900/40")}>
            {isAdmin ? <Crown className="text-white w-5 h-5"/> : <ShieldCheck className="text-white w-5 h-5"/>}
          </div>
          <div>
            <div className="flex items-center gap-1">
                <p className="text-[8px] text-slate-500 font-bold uppercase tracking-widest">{isAdmin ? "Admin Maestro" : (isAdmin2 ? "Admin Grupo" : "Grupo")}</p>
                {(isAdmin || isAdmin2) && <span className="w-1.5 h-1.5 bg-amber-500 rounded-full animate-pulse"/>}
            </div>
            <p className="text-xs font-black text-slate-100 uppercase truncate max-w-[120px]">{isMonitoringAll ? "Monitoreo Global" : (userGroupName || "Radioperador")}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
            {(isAdmin || isAdmin2) && (
                <button onClick={() => setShowAdminPanel(true)} className="p-2.5 bg-amber-600/10 hover:bg-amber-600/20 rounded-xl border border-amber-600/30 transition-all">
                    <Settings className="w-4 h-4 text-amber-500"/>
                </button>
            )}
            <button onClick={logOut} className="p-2.5 bg-slate-900 hover:bg-slate-800 rounded-xl border border-slate-800 transition-colors"><LogOut className="w-4 h-4 text-slate-400"/></button>
        </div>
      </div>

      <div className="flex-1 flex flex-col items-center justify-evenly py-2 min-h-0">
        <div className="text-center relative shrink-0">
          <motion.h1 
            animate={{ scale: isTransmitting ? 1.05 : 1 }} 
            className={cn("text-5xl xs:text-6xl sm:text-7xl font-black tracking-tighter italic uppercase break-words px-4 leading-none transition-colors", isMonitoringAll ? "text-amber-500" : "text-red-600")}
          >
            {isMonitoringAll ? "RADAR" : (userGroupName || "COE MC")}
          </motion.h1>
          
          <div className="flex flex-col items-center gap-2 mt-3">
              <div className={cn(
                "px-4 py-1.5 rounded-full font-black text-[10px] tracking-widest flex items-center gap-2 mx-auto w-fit transition-all duration-700",
                isConnected ? "bg-green-600/10 text-green-500 border border-green-500/30" : "bg-slate-900 text-slate-500 border border-slate-800"
              )}>
                <Signal className={cn("w-3 h-3", isConnected ? "animate-pulse" : "")}/>
                {isConnected ? (isMonitoringAll ? "MONITOREO ACTIVO" : "EN LÍNEA") : "DESCONECTADO"}
              </div>

              {isAdmin && (
                <button 
                    onClick={() => setIsMonitoringAll(!isMonitoringAll)}
                    className={cn("text-[8px] font-black uppercase tracking-widest flex items-center gap-1.5 px-3 py-1 rounded-full border transition-all", isMonitoringAll ? "bg-red-600 border-red-500 text-white" : "bg-slate-900 border-slate-800 text-slate-500")}
                >
                    <ShieldAlert className="w-3 h-3"/> {isMonitoringAll ? "DESACTIVAR MONITOR" : "ACTIVAR MONITOR GLOBAL"}
                </button>
              )}
          </div>
        </div>

        <div className="relative group shrink-0 py-4">
          <AnimatePresence>
            {isTransmitting && (
              <motion.div initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1.4, opacity: [0, 0.2, 0] }} transition={{ repeat: Infinity, duration: 1.5 }} exit={{ scale: 0.8, opacity: 0 }} className={cn("absolute inset-0 rounded-full blur-3xl z-0", isMonitoringAll ? "bg-amber-600" : "bg-red-600")} />
            )}
          </AnimatePresence>

          <button
            onClick={handleToggleTalk}
            disabled={!isConnected}
            className={cn(
              "w-[50vw] h-[50vw] max-w-[220px] max-h-[220px] rounded-full relative z-10 flex flex-col items-center justify-center gap-2 transition-all shadow-2xl active:scale-95 border-8",
              isTransmitting ? (isMonitoringAll ? "bg-amber-600 border-amber-500" : "bg-red-600 border-red-500") : (isConnected ? "bg-blue-800 border-blue-900" : "bg-slate-900 border-slate-800 opacity-50")
            )}
          >
            {isTransmitting ? <Mic className="w-16 h-16 sm:w-20 sm:h-20 text-white animate-pulse" /> : <MicOff className="w-16 h-16 sm:w-20 sm:h-20 text-white/40" />}
            <span className="text-white font-black tracking-widest text-[10px] sm:text-xs uppercase">{isTransmitting ? (isMonitoringAll ? "BROADCAST ACTIVO" : "AL AIRE") : "TRANSMITIR"}</span>
            {isMonitoringAll && isTransmitting && <div className="absolute top-4 bg-white text-amber-600 text-[8px] px-2 py-0.5 rounded-full font-black animate-bounce">S.O.S</div>}
          </button>

          <AnimatePresence>
            {(isReceiving || (isMonitoringAll && monitoringGroup)) && (
              <motion.div initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 20, opacity: 0 }} className="absolute -top-10 left-1/2 -translate-x-1/2 glass px-4 py-1.5 rounded-xl flex items-center gap-2 border-red-500/50 shadow-lg shadow-red-900/20 whitespace-nowrap">
                <div className="w-2 h-2 bg-red-500 rounded-full animate-ping" />
                <p className="text-[10px] font-black text-red-500 uppercase">
                    {isMonitoringAll ? `CANAL: ${monitoringGroup}` : `RECIBIENDO...`}
                </p>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <div className="w-full max-w-sm glass rounded-3xl p-4 min-h-0 flex flex-col">
          <div className="flex items-center justify-between mb-3 shrink-0">
             <div className="flex items-center gap-2">
                <Zap className="w-4 h-4 text-blue-400 animate-pulse"/>
                <h3 className="text-[10px] font-black uppercase tracking-widest text-slate-400">{isMonitoringAll ? "Tráfico de Radio Global" : "Operadores en Canal"}</h3>
             </div>
             {isMonitoringAll && <span className="bg-red-600 text-white text-[8px] px-2 py-0.5 rounded-full font-black">LIVE</span>}
          </div>
          <div className="grid grid-cols-2 gap-2 overflow-y-auto pr-1">
            {!isMonitoringAll ? allUsers.map((u) => (
              <div key={u.uid} className={cn("p-2 rounded-xl flex items-center gap-2 border transition-colors", u.isTalking ? "bg-red-600/10 border-red-500/50" : "bg-slate-900/50 border-slate-800")}>
                <div className={cn("w-5 h-5 rounded-lg flex items-center justify-center text-[8px] font-bold shrink-0", u.isTalking ? "bg-red-600 text-white" : "bg-blue-600 text-white")}>
                  {u.displayName?.[0] || 'U'}
                </div>
                <div className="min-w-0">
                  <p className="text-[9px] font-bold truncate leading-tight uppercase">{u.displayName}</p>
                </div>
              </div>
            )) : (
              <div className="col-span-2 text-center py-4">
                 <p className="text-[10px] text-slate-500 font-bold uppercase italic">Modo Monitor: Escuchando todas las frecuencias...</p>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="py-2 text-center shrink-0">
         <p className="text-[7px] text-slate-600 font-bold uppercase tracking-[0.2em]">{isMonitoringAll ? "SISTEMA DE INTERCEPTACIÓN Y APOYO ALPHA-1" : "Canal de Seguridad COE MC • Encriptado"}</p>
      </div>
    </div>
  );
}
