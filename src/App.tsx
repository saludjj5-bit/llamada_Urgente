import { useState, useEffect, useCallback, useRef } from 'react';
import { Radio, Mic, MicOff, LogOut, LogIn, ShieldCheck, Users, Signal, SignalLow, Loader2, PlayCircle, Clock, Crown, Settings, ShieldAlert, Zap, User, UserCheck, MessageSquare, Globe, ChevronLeft, ChevronRight, Menu } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useWalkieTalkie } from './hooks/useWalkieTalkie';
import { cn } from './lib/utils';
import { auth, signIn, logOut, db, UserRole, UserProfile } from './firebase';
import { onAuthStateChanged, User as FirebaseUser } from 'firebase/auth';
import { doc, onSnapshot, updateDoc, collection, query, orderBy } from 'firebase/firestore';
import AdminPanel from './components/AdminPanel';

type TalkMode = 'group' | 'private' | 'global';

export default function App() {
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [emailInput, setEmailInput] = useState('');
  const [passInput, setPassInput] = useState('');
  const [userRole, setUserRole] = useState<UserRole | null>(null);
  const [userGroupId, setUserGroupId] = useState<string | null>(null);
  const [userGroupName, setUserGroupName] = useState<string | null>(null);
  const [allGroups, setAllGroups] = useState<any[]>([]);
  const [isAuthLoading, setIsAuthLoading] = useState(true);
  
  // UI states
  const [showAdminPanel, setShowAdminPanel] = useState(false);
  const [isMonitoringAll, setIsMonitoringAll] = useState(false);
  const [activeGroupId, setActiveGroupId] = useState<string | null>(null);
  const [talkMode, setTalkMode] = useState<TalkMode>('group');
  const [selectedPrivateUser, setSelectedPrivateUser] = useState<UserProfile | null>(null);
  
  const [allUsers, setAllUsers] = useState<UserProfile[]>([]);
  const [talkingUser, setTalkingUser] = useState<UserProfile | null>(null);
  const [monitoringGroup, setMonitoringGroup] = useState<string | null>(null);
  
  const [isTransmitting, setIsTransmitting] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);

  // Hook Walkie-Talkie
  const connectionId = isMonitoringAll ? 'all' : (activeGroupId || userGroupId);
  const { isConnected, isTalking, isReceiving, connect, disconnect, startTalking, stopTalking } = useWalkieTalkie(connectionId);

  const isAdmin = userRole === UserRole.ADMIN;
  const isAdmin2 = userRole === UserRole.ADMIN2;

  // Cargar Grupos para Admin o Sidebar
  useEffect(() => {
    const q = query(collection(db, 'groups'), orderBy('name', 'asc'));
    return onSnapshot(q, (s) => setAllGroups(s.docs.map(d => ({ id: d.id, ...d.data() }))));
  }, []);

  // Monitor Global
  useEffect(() => {
    const handleGroupTalk = (e: any) => setMonitoringGroup(e.detail);
    window.addEventListener('group-talking', handleGroupTalk);
    return () => window.removeEventListener('group-talking', handleGroupTalk);
  }, []);

  // AUTO-CONEXIÓN
  useEffect(() => {
    if (user && connectionId && !isConnected && !isConnecting) {
      setIsConnecting(true);
      connect();
      setTimeout(() => setIsConnecting(false), 2000);
    }
  }, [user, connectionId, isConnected, connect]);

  // SEGUNDO PLANO ANDROID (AUDIO ACTIVO)
  useEffect(() => {
    const manageForeground = async () => {
      try {
        const { ForegroundService } = await import('@capawesome-team/capacitor-android-foreground-service');
        if (isConnected) {
          // Mantener audio activo configurando el servicio como mediaPlayback
          await ForegroundService.start({ 
            id: 101, 
            title: isMonitoringAll ? 'MONITOR GLOBAL ACTIVO' : 'SISTEMA DE RADIO COE MC', 
            body: 'Escuchando Canal: ' + (userGroupName || 'Principal'), 
            importance: 3,
            smallIcon: 'ic_stat_radio'
          });
        } else {
          await ForegroundService.stop();
        }
      } catch (e) { /* Web Mode */ }
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
        
        let targetId = activeGroupId || userGroupId!;
        if (talkMode === 'global' && isAdmin) targetId = 'all';
        if (talkMode === 'private' && selectedPrivateUser) targetId = selectedPrivateUser.uid;

        startTalking(user.uid, user.displayName || user.email?.split('@')[0] || "Usuario", targetId);
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
            if (!activeGroupId) setActiveGroupId(d.groupId);
            if (d.groupId) onSnapshot(doc(db, 'groups', d.groupId), (g) => setUserGroupName(g.data()?.name));
          }
          setIsAuthLoading(false);
        });
      } else { setIsAuthLoading(false); }
    });
    return () => unsub();
  }, [activeGroupId]);

  // Cargar usuarios del grupo activo
  useEffect(() => {
    if (activeGroupId) {
      return onSnapshot(collection(db, 'users'), (s) => {
        const usersInBase = s.docs.map(d => ({ uid: d.id, ...d.data() } as UserProfile));
        const filtered = usersInBase.filter(u => u.groupId === activeGroupId);
        setAllUsers(filtered);
        const talker = filtered.find(u => u.isTalking && u.uid !== user?.uid);
        setTalkingUser(talker || null);
      });
    }
  }, [activeGroupId, user]);

  if (isAuthLoading) return <div className="h-screen bg-slate-950 flex flex-col items-center justify-center space-y-4"><Loader2 className="w-12 h-12 text-blue-500 animate-spin" /><p className="text-blue-200 font-bold animate-pulse uppercase tracking-[0.2em] text-[10px]">Sincronizando Frecuencia...</p></div>;

  if (!user) return (
    <div className="h-screen bg-slate-950 text-slate-100 flex flex-col items-center justify-center p-6 bg-[grid] bg-slate-900/20">
      <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} className="text-center space-y-12 max-w-sm w-full">
        <div className="relative inline-block scale-125">
          <h1 className="text-7xl font-black text-red-600 tracking-tighter italic drop-shadow-2xl">COE MC</h1>
          <div className="absolute -top-6 -right-6 bg-red-600 text-white px-3 py-1 text-[12px] font-black rounded-lg rotate-12 shadow-xl">S.O.S</div>
        </div>
        <div className="space-y-6 glass p-10 rounded-[2.5rem] border-white/5 shadow-2xl relative">
          <div className="absolute -top-4 left-1/2 -translate-x-1/2 bg-blue-600 text-white px-4 py-1 rounded-full text-[10px] font-black tracking-widest">AUTENTICACIÓN</div>
          <div className="space-y-3">
            <input type="email" placeholder="Indicativo / Email" value={emailInput} onChange={e => setEmailInput(e.target.value)} className="w-full p-5 bg-slate-950/80 border border-slate-800 rounded-2xl outline-none focus:border-blue-500 font-bold" />
            <input type="password" placeholder="Código de Acceso" value={passInput} onChange={e => setPassInput(e.target.value)} className="w-full p-5 bg-slate-950/80 border border-slate-800 rounded-2xl outline-none focus:border-blue-500 font-bold" />
          </div>
          <button onClick={() => signIn(emailInput, passInput)} className="w-full py-6 bg-gradient-to-r from-blue-600 via-blue-700 to-blue-800 text-white font-black rounded-2xl shadow-2xl active:scale-95 transition-all text-sm uppercase tracking-widest">ESTABLECER CONEXIÓN</button>
        </div>
      </motion.div>
    </div>
  );

  return (
    <div className="h-screen w-full bg-slate-950 text-slate-100 flex overflow-hidden font-['Outfit']">
      
      <AnimatePresence>
        {showAdminPanel && <AdminPanel onClose={() => setShowAdminPanel(false)} userRole={userRole!} currentGroupId={userGroupId} />}
      </AnimatePresence>

      {/* COLUMNA IZQUIERDA: CANALES (Desktop) */}
      <div className="hidden lg:flex w-80 bg-slate-900/50 border-r border-slate-800 flex-col p-6 gap-6">
        <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 bg-red-600 rounded-xl flex items-center justify-center shadow-lg"><Radio className="text-white w-6 h-6"/></div>
            <h2 className="font-black text-slate-100 tracking-tight text-xl italic leading-none">CANALES</h2>
        </div>
        
        <div className="flex-1 overflow-y-auto space-y-2 pr-2">
            {allGroups.map(g => (
                <button 
                  key={g.id} 
                  onClick={() => setActiveGroupId(g.id)}
                  className={cn(
                    "w-full p-4 rounded-2xl flex items-center justify-between border transition-all group",
                    activeGroupId === g.id ? "bg-blue-600 border-blue-400 shadow-lg shadow-blue-900/40" : "bg-slate-950/50 border-slate-800 hover:border-slate-600"
                  )}
                >
                    <div className="flex items-center gap-3 overflow-hidden">
                        <Signal className={cn("w-3 h-3 shrink-0", activeGroupId === g.id ? "text-white" : "text-slate-600")}/>
                        <p className={cn("font-black text-sm uppercase truncate", activeGroupId === g.id ? "text-white" : "text-slate-400 group-hover:text-slate-100")}>{g.name}</p>
                    </div>
                </button>
            ))}
        </div>

        {(isAdmin || isAdmin2) && (
            <button onClick={() => setShowAdminPanel(true)} className="mt-auto p-5 rounded-2xl bg-slate-800 border border-slate-700 text-slate-100 hover:bg-slate-700 transition-all flex items-center justify-center gap-3 font-black text-xs tracking-widest shadow-xl">
                <Settings className="w-5 h-5 text-amber-500 animate-spin-slow"/> PANEL DE CONTROL
            </button>
        )}
      </div>

      {/* COLUMNA CENTRAL: PTT & STATUS */}
      <div className="flex-1 flex flex-col p-4 sm:p-8 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-slate-900 via-slate-950 to-slate-950">
        
        {/* Header Compacto (Mobile/Desktop) */}
        <div className="flex justify-between items-center mb-6 glass p-3 px-5 rounded-3xl shrink-0">
          <div className="flex items-center gap-3">
             <div className={cn("w-10 h-10 rounded-2xl flex items-center justify-center shadow-lg", isAdmin ? "bg-amber-600" : "bg-red-600")}>
                {isAdmin ? <Crown className="text-white w-6 h-6"/> : <ShieldCheck className="text-white w-6 h-6"/>}
             </div>
             <div>
                <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">{isAdmin ? "Admin Maestro" : "Identidad Verificada"}</p>
                <p className="text-xs font-black text-white uppercase truncate">{user?.displayName || user?.email?.split('@')[0]}</p>
             </div>
          </div>
          <div className="flex items-center gap-3">
             <button onClick={() => setIsMonitoringAll(!isMonitoringAll)} className={cn("p-3 rounded-2xl border transition-all lg:hidden", isMonitoringAll ? "bg-red-600 border-red-500 text-white" : "bg-slate-900 border-slate-800 text-slate-400")}>
                <ShieldAlert className="w-5 h-5"/>
             </button>
             <button onClick={logOut} className="p-3 bg-slate-800 hover:bg-red-900/20 hover:border-red-500/50 rounded-2xl border border-slate-700 transition-all group">
                <LogOut className="w-5 h-5 text-slate-400 group-hover:text-red-500"/>
             </button>
          </div>
        </div>

        <div className="flex-1 flex flex-col items-center justify-center gap-12 sm:gap-20">
            {/* Display de Canal Seleccionado */}
            <div className="text-center relative">
                <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-[12px] font-black text-blue-500 uppercase tracking-[0.5em] mb-2 leading-none">FRECUENCIA OPERATIVA</motion.p>
                <motion.h1 
                    key={activeGroupId}
                    initial={{ y: -10, opacity: 0 }} 
                    animate={{ y: 0, opacity: 1 }}
                    className={cn("text-6xl sm:text-8xl font-black italic tracking-tighter uppercase leading-none break-words", isMonitoringAll ? "text-amber-500 drop-shadow-[0_0_20px_rgba(245,158,11,0.3)]" : "text-white")}
                >
                    {isMonitoringAll ? "RADAR GLOBAL" : (allGroups.find(g => g.id === activeGroupId)?.name || "BUSCANDO...")}
                </motion.h1>
                <div className="flex items-center justify-center gap-4 mt-6">
                    <div className={cn("px-5 py-2 rounded-full font-black text-[12px] tracking-[0.2em] border flex items-center gap-3", isConnected ? "bg-green-600/10 text-green-500 border-green-500/20" : "bg-slate-900 text-slate-500 border-slate-800")}>
                        <div className={cn("w-2 h-2 rounded-full", isConnected ? "bg-green-500 animate-pulse" : "bg-slate-700")}/>
                        {isConnected ? "SISTEMA ACTIVO" : "OFFLINE"}
                    </div>
                    {isAdmin && (
                        <button onClick={() => setIsMonitoringAll(!isMonitoringAll)} className={cn("hidden lg:flex items-center gap-2 px-5 py-2 rounded-full font-black text-[11px] tracking-widest border transition-all", isMonitoringAll ? "bg-amber-600 border-amber-500 text-white" : "bg-slate-900 border-slate-800 text-slate-500 hover:text-white")}>
                            <Zap className="w-4 h-4"/> MONITOR TOTAL
                        </button>
                    )}
                </div>
            </div>

            {/* PTT Circular UI */}
            <div className="relative">
                {/* Modos de Voz (Subway Menu) */}
                <div className="absolute -top-16 left-1/2 -translate-x-1/2 flex items-center gap-2 bg-slate-900 p-2 rounded-full border border-slate-800 shadow-2xl">
                    <button onClick={() => setTalkMode('group')} className={cn("p-3 rounded-full flex items-center gap-2 transition-all", talkMode === 'group' ? "bg-blue-600 text-white shadow-lg shadow-blue-900/40" : "text-slate-500 hover:text-white")}>
                        <Users className="w-5 h-5"/>
                        {talkMode === 'group' && <span className="text-[10px] font-black uppercase">Grupo</span>}
                    </button>
                    <button onClick={() => setTalkMode('private')} className={cn("p-3 rounded-full flex items-center gap-2 transition-all", talkMode === 'private' ? "bg-purple-600 text-white shadow-lg shadow-purple-900/40" : "text-slate-500 hover:text-white")}>
                        <MessageSquare className="w-5 h-5"/>
                        {talkMode === 'private' && <span className="text-[10px] font-black uppercase">Privado</span>}
                    </button>
                    {isAdmin && (
                        <button onClick={() => setTalkMode('global')} className={cn("p-3 rounded-full flex items-center gap-2 transition-all", talkMode === 'global' ? "bg-red-600 text-white shadow-lg shadow-red-900/40" : "text-slate-500 hover:text-white")}>
                            <Globe className="w-5 h-5"/>
                            {talkMode === 'global' && <span className="text-[10px] font-black uppercase">Global</span>}
                        </button>
                    )}
                </div>

                <AnimatePresence>
                    {isTransmitting && (
                        <motion.div initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1.5, opacity: [0, 0.2, 0] }} transition={{ repeat: Infinity, duration: 1.5 }} className={cn("absolute inset-0 rounded-full blur-[60px] z-0", talkMode === 'group' ? "bg-blue-600" : (talkMode === 'private' ? "bg-purple-600" : "bg-red-600"))} />
                    )}
                </AnimatePresence>

                <button
                    onClick={handleToggleTalk}
                    disabled={!isConnected}
                    className={cn(
                        "w-56 h-56 sm:w-80 sm:h-80 rounded-full relative z-10 flex flex-col items-center justify-center gap-3 transition-all shadow-2xl active:scale-90 border-[12px] group",
                        isTransmitting 
                          ? (talkMode === 'group' ? "bg-blue-600 border-blue-500 shadow-blue-900/60" : (talkMode === 'private' ? "bg-purple-600 border-purple-500 shadow-purple-900/60" : "bg-red-600 border-red-500 shadow-red-900/60"))
                          : (isConnected ? "bg-slate-900 border-slate-800 shadow-black/80 hover:border-slate-700" : "bg-slate-950 border-slate-900 opacity-50")
                    )}
                >
                    <div className="absolute inset-4 border border-white/5 rounded-full z-0"/>
                    {isTransmitting ? <Mic className="w-20 h-20 sm:w-32 sm:h-32 text-white animate-pulse" /> : <MicOff className="w-20 h-20 sm:w-32 sm:h-32 text-slate-700 group-hover:text-blue-500/50 transition-colors" />}
                    <span className="text-white font-black tracking-[0.3em] text-sm sm:text-lg uppercase drop-shadow-lg">
                        {isTransmitting ? "TRANSMITIENDO" : "HOLD TO TALK"}
                    </span>
                    <div className="flex gap-1 h-1.5 items-center mt-2">
                        {[1,2,3,4,5].map(i => (
                            <motion.div key={i} animate={isTransmitting ? { height: [4, 18, 4] } : {}} transition={{ repeat: Infinity, duration: 0.5, delay: i * 0.1 }} className="w-1.5 bg-white/40 rounded-full"/>
                        ))}
                    </div>
                </button>

                {/* Info de Transmisión Activa */}
                <AnimatePresence>
                    {(isReceiving || monitoringGroup) && (
                        <motion.div initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 20, opacity: 0 }} className="absolute -bottom-20 left-1/2 -translate-x-1/2 glass px-10 py-5 rounded-[2rem] flex flex-col items-center gap-1 border-red-500/50 shadow-2xl min-w-[280px]">
                            <div className="flex items-center gap-3">
                                <div className="w-3 h-3 bg-red-600 rounded-full animate-ping" />
                                <p className="text-[14px] font-black text-white uppercase tracking-widest">AUDIO ENTRANTE</p>
                            </div>
                            <p className="text-xs font-bold text-red-500 uppercase">{isMonitoringAll ? `Canal: ${monitoringGroup}` : (talkingUser?.displayName || "PERSONAL EXTERNO")}</p>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>
        </div>

        {/* Footer / Credits */}
        <div className="py-4 text-center shrink-0 flex items-center justify-between px-4 border-t border-slate-900 mt-6">
            <p className="text-[9px] text-slate-700 font-bold tracking-[0.3em] uppercase hidden sm:block">SISTEMA MILITARIZADO DE ALTA DISPONIBILIDAD</p>
            <div className="flex items-center gap-4 mx-auto sm:mx-0">
                <div className="flex items-center gap-2"><div className="w-1.5 h-1.5 bg-green-500 rounded-full"/><span className="text-[8px] font-black text-slate-600 uppercase">Encriptación AES-256</span></div>
                <div className="flex items-center gap-2"><div className="w-1.5 h-1.5 bg-blue-500 rounded-full"/><span className="text-[8px] font-black text-slate-600 uppercase">Latencia {"<"} 50ms</span></div>
            </div>
        </div>
      </div>

      {/* COLUMNA DERECHA: RADAR DE GRUPO (Desktop) */}
      <div className="hidden xl:flex w-80 bg-slate-900/50 border-l border-slate-800 flex-col p-6 gap-6">
         <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center shadow-lg"><Users className="text-white w-6 h-6"/></div>
            <h2 className="font-black text-slate-100 tracking-tight text-xl italic leading-none truncate">RADAR CANAL</h2>
         </div>

         <div className="flex-1 overflow-y-auto space-y-3 pr-2">
            {allUsers.map(u => (
                <button 
                  key={u.uid} 
                  onClick={() => { if (talkMode === 'private') setSelectedPrivateUser(u); }}
                  className={cn(
                    "w-full p-4 rounded-2xl flex items-center justify-between border transition-all relative overflow-hidden group",
                    selectedPrivateUser?.uid === u.uid && talkMode === 'private' ? "border-purple-500 bg-purple-600/10" : "bg-slate-950/40 border-slate-800 hover:border-slate-700",
                    u.isTalking && "border-red-500/50 bg-red-600/5"
                  )}
                >
                    {u.isTalking && <div className="absolute top-0 right-0 p-1 bg-red-600 text-[6px] font-black text-white px-2 rounded-bl-lg">LIVE</div>}
                    <div className="flex items-center gap-3 min-w-0">
                        <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center font-black text-white relative", u.role === UserRole.ADMIN ? "bg-amber-600" : "bg-blue-600")}>
                            {u.displayName?.[0]}
                            {u.isTalking && <div className="absolute -bottom-1 -right-1 w-4 h-4 bg-red-600 rounded-full border-2 border-slate-900 flex items-center justify-center"><Zap className="w-2 h-2 text-white animate-pulse"/></div>}
                        </div>
                        <div className="text-left min-w-0">
                            <p className="font-black text-[12px] text-white truncate uppercase">{u.displayName}</p>
                            <p className="text-[8px] text-slate-600 font-bold uppercase">{u.role}</p>
                        </div>
                    </div>
                </button>
            ))}
         </div>

         {talkMode === 'private' && (
             <div className="mt-auto p-4 bg-purple-600/10 border border-purple-500/20 rounded-2xl space-y-2">
                 <p className="text-[10px] font-black text-purple-400 uppercase tracking-widest">Destinatario Privado</p>
                 <div className="flex items-center gap-2">
                     <UserCheck className="w-4 h-4 text-purple-500"/>
                     <p className="text-xs font-black truncate">{selectedPrivateUser?.displayName || "SELECCIONE USUARIO"}</p>
                 </div>
             </div>
         )}
      </div>

    </div>
  );
}
