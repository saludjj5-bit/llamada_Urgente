import { useState, useEffect, useCallback, useRef } from 'react';
import { Radio, Mic, MicOff, LogOut, LogIn, ShieldCheck, Users, Signal, SignalLow, Loader2, PlayCircle, Clock, Crown, Settings, ShieldAlert, Zap, User, UserCheck, MessageSquare, Globe, ChevronLeft, ChevronRight, Menu, Volume2, VolumeX } from 'lucide-react';
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
  const [audioUnlocked, setAudioUnlocked] = useState(false);

  const isAdmin = userRole === UserRole.ADMIN;
  const isAdmin2 = userRole === UserRole.ADMIN2;
  const isAnyAdmin = isAdmin || isAdmin2;

  // Hook Walkie-Talkie (V9.0: Sincronizado con Usuario)
  const connectionId = isMonitoringAll && isAdmin ? 'all' : (activeGroupId || userGroupId);
  const { isConnected, isTalking, isReceiving, error, connect, disconnect, startTalking, stopTalking } = useWalkieTalkie(
    connectionId,
    user?.uid
  );

  // Cargar Grupos para Admin o Sidebar
  useEffect(() => {
    const q = query(collection(db, 'groups'), orderBy('name', 'asc'));
    return onSnapshot(q, (s) => setAllGroups(s.docs.map(d => ({ id: d.id, ...d.data() }))));
  }, []);

  // Monitor Global
  useEffect(() => {
    if (!isAdmin) return;
    const handleGroupTalk = (e: any) => setMonitoringGroup(e.detail);
    window.addEventListener('group-talking', handleGroupTalk);
    return () => window.removeEventListener('group-talking', handleGroupTalk);
  }, [isAdmin]);

  // AUTO-CONEXIÓN & RECONEXIÓN
  useEffect(() => {
    let interval: any;
    if (user && connectionId && !isConnected && !isConnecting) {
      setIsConnecting(true);
      connect();
      setTimeout(() => setIsConnecting(false), 2000);
    }
    
    // Intentar mantener viva la conexión si se cae (especialmente en segundo plano)
    if (user && !isConnected) {
        interval = setInterval(() => { if (!isConnecting) connect(); }, 5000);
    }
    return () => clearInterval(interval);
  }, [user, connectionId, isConnected, connect, isConnecting]);

  // SEGUNDO PLANO ANDROID (AUDIO ACTIVADOR)
  useEffect(() => {
    const manageForeground = async () => {
      try {
        const { ForegroundService } = await import('@capawesome-team/capacitor-android-foreground-service');
        if (isConnected) {
          await ForegroundService.requestPermissions();
          await ForegroundService.start({ 
            id: 101, 
            title: 'COE MC - TERMINAL ACTIVA', 
            body: isMonitoringAll ? 'ESCUCHANDO TODOS LOS GRUPOS' : `CANAL: ${userGroupName || 'Principal'}`, 
            importance: 5,
            smallIcon: 'ic_stat_radio'
          });
        }
      } catch (e) { /* Web Logic */ }
    };
    manageForeground();
  }, [isConnected, userGroupName, isMonitoringAll]);

  // ESCUCHA DE BOTONES FÍSICOS (RADIOS POC / VOLUMEN)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.key === 'VolumeUp' || e.key === 'VolumeDown') && isConnected && !isTransmitting) {
        e.preventDefault();
        handleToggleTalk();
      }
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      if ((e.key === 'VolumeUp' || e.key === 'VolumeDown') && isTransmitting) {
        e.preventDefault();
        handleToggleTalk();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [isConnected, isTransmitting, talkMode, activeGroupId]);

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

  if (isAuthLoading) return <div className="h-screen bg-slate-950 flex flex-col items-center justify-center space-y-4"><Loader2 className="w-12 h-12 text-green-500 animate-spin" /><p className="text-green-200 font-black animate-pulse uppercase tracking-[0.2em] text-[10px]">Sincronizando Canal Seguro...</p></div>;

  if (!user) return (
    <div className="h-screen bg-slate-950 text-slate-100 flex flex-col items-center justify-center p-6 bg-[grid] bg-slate-900/20">
      <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} className="text-center space-y-12 max-w-sm w-full">
        <div className="relative inline-block scale-125">
          <h1 className="text-7xl font-black text-green-500 tracking-tighter italic drop-shadow-[0_0_15px_rgba(34,197,94,0.4)]">COE MC</h1>
          <div className="absolute -top-6 -right-6 bg-blue-600 text-white px-3 py-1 text-[12px] font-black rounded-lg rotate-12 shadow-xl">V9.0</div>
        </div>
        <div className="space-y-6 glass p-10 rounded-[2.5rem] border-white/5 shadow-2xl relative">
          <div className="absolute -top-4 left-1/2 -translate-x-1/2 bg-blue-600 text-white px-4 py-1 rounded-full text-[10px] font-black tracking-widest">AUTENTICACIÓN</div>
          <div className="space-y-3">
            <input type="email" placeholder="Usuario / Email" value={emailInput} onChange={e => setEmailInput(e.target.value)} className="w-full p-5 bg-slate-950/80 border border-slate-800 rounded-2xl outline-none focus:border-blue-500 font-bold" />
            <input type="password" placeholder="Código de Acceso" value={passInput} onChange={e => setPassInput(e.target.value)} className="w-full p-5 bg-slate-950/80 border border-slate-800 rounded-2xl outline-none focus:border-blue-500 font-bold" />
          </div>
          <button onClick={() => signIn(emailInput, passInput)} className="w-full py-6 bg-gradient-to-r from-blue-600 via-blue-700 to-blue-800 text-white font-black rounded-2xl shadow-2xl active:scale-95 transition-all text-sm uppercase tracking-widest">INGRESAR AL SISTEMA</button>
        </div>
      </motion.div>
    </div>
  );

  return (
    <div className="h-screen w-full fixed inset-0 bg-slate-950 text-slate-100 flex overflow-hidden font-['Outfit'] select-none">
      
      <AnimatePresence>
        {showAdminPanel && <AdminPanel onClose={() => setShowAdminPanel(false)} userRole={userRole!} currentGroupId={userGroupId} />}
      </AnimatePresence>

      {/* COLUMNA IZQUIERDA: PANEL DE CONTROL (REDISEÑADO) */}
      <div className="hidden lg:flex w-80 bg-slate-900/60 border-r border-slate-800 flex-col p-6 gap-6">
        <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 bg-green-600 rounded-xl flex items-center justify-center shadow-lg shadow-green-900/20"><Radio className="text-white w-6 h-6"/></div>
            <h2 className="font-black text-slate-100 tracking-tight text-xl italic leading-none truncate">FRECUENCIAS</h2>
        </div>
        
        {isAnyAdmin ? (
            <div className="flex-1 overflow-y-auto space-y-2 pr-2 custom-scrollbar">
                {allGroups.map(g => (
                    <button 
                    key={g.id} 
                    onClick={() => setActiveGroupId(g.id)}
                    className={cn(
                        "w-full p-4 rounded-2xl flex items-center justify-between border transition-all group",
                        activeGroupId === g.id ? "bg-green-600 border-green-400 shadow-lg shadow-green-900/30" : "bg-slate-950/50 border-slate-800 hover:border-slate-700"
                    )}
                    >
                        <div className="flex items-center gap-3 overflow-hidden">
                            <Signal className={cn("w-3 h-3 shrink-0", activeGroupId === g.id ? "text-white" : "text-green-600")}/>
                            <p className={cn("font-black text-[11px] uppercase truncate", activeGroupId === g.id ? "text-white" : "text-slate-400 group-hover:text-slate-100")}>{g.name}</p>
                        </div>
                    </button>
                ))}
            </div>
        ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-center p-6 glass rounded-[2.5rem] space-y-4">
                <ShieldCheck className="w-12 h-12 text-green-500 opacity-20"/>
                <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest leading-relaxed">SISTEMA CERRADO<br/>CANAL ÚNICO ACTIVADO</p>
            </div>
        )}

        {isAnyAdmin && (
            <button onClick={() => setShowAdminPanel(true)} className="mt-auto p-5 rounded-2xl bg-slate-800 border border-slate-700 text-slate-100 hover:bg-slate-700 transition-all flex items-center justify-center gap-3 font-black text-xs tracking-widest shadow-xl uppercase">
                <Settings className="w-5 h-5 text-amber-500"/> PANEL CENTRAL
            </button>
        )}
      </div>

      {/* COLUMNA CENTRAL: CONSOLA TÁCTICA */}
      <div className="flex-1 flex flex-col p-4 sm:p-8 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-slate-900 via-slate-950 to-slate-950 relative">
        
        {/* Status Header */}
        <div className="flex justify-between items-center mb-6 glass p-3 px-5 rounded-3xl shrink-0">
          <div className="flex items-center gap-3">
             <div className={cn("w-10 h-10 rounded-2xl flex items-center justify-center shadow-lg", isAdmin ? "bg-amber-600" : "bg-green-600")}>
                {isAdmin ? <Crown className="text-white w-6 h-6"/> : <User className="text-white w-6 h-6"/>}
             </div>
             <div>
                <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest leading-none">Identificativo</p>
                <p className="text-xs font-black text-white uppercase truncate mt-1">{user?.displayName || user?.email?.split('@')[0]}</p>
             </div>
          </div>
          <div className="flex items-center gap-2">
             <div className={cn("px-4 py-2 rounded-xl text-[10px] font-black flex items-center gap-2 border", isConnected ? "bg-green-500/10 text-green-500 border-green-500/20" : "bg-red-500/10 text-red-500 border-red-500/20")}>
                <div className={cn("w-1.5 h-1.5 rounded-full", isConnected ? "bg-green-500" : "bg-red-500")}/>
                {isConnected ? "EN LÍNEA" : "OFFLINE"}
             </div>
             <button onClick={logOut} className="p-3 bg-slate-800 hover:bg-red-900/20 rounded-2xl border border-slate-700 transition-all">
                <LogOut className="w-5 h-5 text-slate-400 hover:text-red-500"/>
             </button>
          </div>
        </div>

        <div className="flex-1 flex flex-col items-center justify-center gap-12">
            {/* Display de Frecuencia */}
            <div className="text-center relative">
                <div className="flex items-center justify-center gap-2 mb-3">
                    <Signal className="w-4 h-4 text-green-500"/>
                    <p className="text-[12px] font-black text-green-500 uppercase tracking-[0.6em] leading-none">CANAL OPERATIVO</p>
                </div>
                <motion.h1 
                    key={activeGroupId || userGroupId}
                    initial={{ y: -10, opacity: 0 }} 
                    animate={{ y: 0, opacity: 1 }}
                    className={cn("text-6xl sm:text-9xl font-black italic tracking-tighter uppercase leading-none break-words text-white drop-shadow-[0_0_30px_rgba(255,255,255,0.1)]", isReceiving && "text-red-500 drop-shadow-[0_0_30px_rgba(239,68,68,0.3)]")}
                >
                    {isMonitoringAll ? "RADAR TOTAL" : (allGroups.find(g => g.id === activeGroupId)?.name || userGroupName || "COE ALPHA")}
                </motion.h1>
            </div>

            {/* NEON PTT BUTTON (REDISEÑADO ALTO CONTRASTE) */}
            <div className="relative">
                {isAnyAdmin && (
                   <div className="absolute -top-16 left-1/2 -translate-x-1/2 flex items-center gap-2 bg-slate-900/90 p-2 rounded-full border border-slate-800 shadow-2xl backdrop-blur-xl">
                      <button onClick={() => setTalkMode('group')} className={cn("p-4 rounded-full flex items-center gap-2 transition-all", talkMode === 'group' ? "bg-green-600 text-white shadow-lg shadow-green-900/40" : "text-slate-500 hover:text-white")}>
                          <Users className="w-5 h-5"/>
                      </button>
                      <button onClick={() => setTalkMode('private')} className={cn("p-4 rounded-full flex items-center gap-2 transition-all", talkMode === 'private' ? "bg-purple-600 text-white shadow-lg shadow-purple-900/40" : "text-slate-500 hover:text-white")}>
                          <MessageSquare className="w-5 h-5"/>
                      </button>
                      {isAdmin && (
                          <button onClick={() => setTalkMode('global')} className={cn("p-4 rounded-full flex items-center gap-2 transition-all", talkMode === 'global' ? "bg-red-600 text-white shadow-lg shadow-red-900/40" : "text-slate-500 hover:text-white")}>
                              <Globe className="w-5 h-5"/>
                          </button>
                      )}
                   </div>
                )}

                <AnimatePresence>
                    {isTransmitting && (
                        <motion.div 
                          initial={{ scale: 0.8, opacity: 0 }} 
                          animate={{ scale: 1.6, opacity: [0, 0.4, 0] }} 
                          transition={{ repeat: Infinity, duration: 2 }} 
                          className={cn("absolute inset-0 rounded-full blur-[80px] z-0", talkMode === 'group' ? "bg-green-500" : (talkMode === 'private' ? "bg-purple-500" : "bg-red-500"))} 
                        />
                    )}
                </AnimatePresence>

                <button
                    onMouseDown={handleToggleTalk}
                    onMouseUp={handleToggleTalk}
                    onTouchStart={handleToggleTalk}
                    onTouchEnd={handleToggleTalk}
                    disabled={!isConnected}
                    className={cn(
                        "w-60 h-60 sm:w-96 sm:h-96 rounded-full relative z-10 flex flex-col items-center justify-center gap-4 transition-all shadow-[0_0_60px_rgba(0,0,0,0.8)] active:scale-95 border-[12px] overflow-hidden",
                        isTransmitting 
                          ? (talkMode === 'group' ? "bg-green-500 border-green-300 shadow-[0_0_100px_rgba(34,197,94,0.6)]" : (talkMode === 'private' ? "bg-purple-600 border-purple-400" : "bg-red-600 border-red-400"))
                          : (isConnected ? "bg-slate-900 border-slate-800 hover:border-green-600/30" : "bg-slate-950 border-slate-900 opacity-50")
                    )}
                >
                    <div className="absolute inset-0 bg-gradient-to-tr from-white/5 to-transparent pointer-events-none"/>
                    
                    {isTransmitting ? (
                        <Zap className="w-24 h-24 sm:w-40 sm:h-40 text-white drop-shadow-2xl" />
                    ) : (
                        <Mic className={cn("w-24 h-24 sm:w-40 sm:h-40 transition-colors", isConnected ? "text-green-500" : "text-slate-800")} />
                    )}

                    <span className={cn("font-black tracking-[0.4em] text-sm sm:text-2xl uppercase", isTransmitting ? "text-white drop-shadow-lg" : "text-green-500/50")}>
                        {isTransmitting ? "EN AIRE" : "TRANSMITIR"}
                    </span>

                    {isTransmitting && (
                        <div className="flex gap-2 h-2 items-center">
                            {[1,2,3,4,5,6].map(i => (
                                <motion.div key={i} animate={{ height: [4, 24, 4] }} transition={{ repeat: Infinity, duration: 0.4, delay: i * 0.08 }} className="w-2 bg-white rounded-full"/>
                            ))}
                        </div>
                    )}
                </button>

                {/* Receptor Status (Discreto) */}
                <AnimatePresence>
                    {(isReceiving || monitoringGroup) && (
                        <motion.div initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.8, opacity: 0 }} className="absolute -bottom-16 left-1/2 -translate-x-1/2 flex flex-col items-center gap-1 z-30">
                            <div className="flex items-center gap-2 bg-red-600/20 px-4 py-2 rounded-full border border-red-500/30">
                                <Volume2 className="text-red-500 w-4 h-4 animate-pulse" />
                                <p className="text-[10px] font-black text-white uppercase tracking-widest">TRANSMITIENDO: {isMonitoringAll ? monitoringGroup : (talkingUser?.displayName || "RADIO")}</p>
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>
        </div>

        {/* Footer info */}
        <div className="py-6 text-center border-t border-slate-900 mt-auto">
            <p className="text-[10px] text-slate-500 font-black tracking-[0.3em] uppercase">2026 - CELULAR 921873749</p>
        </div>
      </div>

      {/* COLUMNA DERECHA: RADAR DE PERSONAL (Desktop) */}
      <div className="hidden xl:flex w-80 bg-slate-900/60 border-l border-slate-800 flex-col p-6 gap-6">
         <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center shadow-lg"><Users className="text-white w-6 h-6"/></div>
            <h2 className="font-black text-slate-100 tracking-tight text-xl italic leading-none truncate">PERSONAL</h2>
         </div>

         <div className="flex-1 overflow-y-auto space-y-3 pr-2 custom-scrollbar">
            {allUsers.map(u => (
                <button 
                  key={u.uid} 
                  onClick={() => { if (talkMode === 'private') setSelectedPrivateUser(u); }}
                  className={cn(
                    "w-full p-4 rounded-2xl flex items-center justify-between border transition-all relative overflow-hidden group",
                    selectedPrivateUser?.uid === u.uid && talkMode === 'private' ? "border-purple-500 bg-purple-600/10 scale-95" : "bg-slate-950/40 border-slate-800 hover:border-slate-700",
                    u.isTalking && "border-green-500/50 bg-green-500/5"
                  )}
                >
                    {u.isTalking && <div className="absolute top-0 right-0 p-1 bg-green-600 text-[6px] font-black text-white px-2 rounded-bl-lg animate-pulse">TRANSMITIENDO</div>}
                    <div className="flex items-center gap-3 min-w-0">
                        <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center font-black text-white relative shadow-inner", u.role === UserRole.ADMIN ? "bg-amber-600" : "bg-blue-600")}>
                            {u.displayName?.[0]}
                            {/* Blue/Grey Status Dot */}
                            <div className={cn("absolute -top-1 -right-1 w-3 h-3 rounded-full border-2 border-slate-900 shadow-lg", u.isOnline ? "bg-blue-500 animate-pulse" : "bg-slate-600")} />
                        </div>
                        <div className="text-left min-w-0">
                            <div className="flex items-center gap-1.5 min-w-0">
                                <p className="font-black text-[12px] text-white truncate uppercase tracking-tight">{u.displayName}</p>
                                {u.isOnline && <span className="w-1 h-1 bg-blue-500 rounded-full animate-pulse shrink-0"/>}
                            </div>
                            <p className="text-[8px] text-slate-600 font-bold uppercase">{u.role}</p>
                        </div>
                    </div>
                </button>
            ))}
         </div>

         {talkMode === 'private' && (
             <div className="mt-auto p-5 bg-purple-600/10 border border-purple-500/20 rounded-[2rem] space-y-3 animate-in fade-in slide-in-from-bottom-4">
                 <div className="flex items-center gap-2">
                    <UserCheck className="w-4 h-4 text-purple-400"/>
                    <p className="text-[10px] font-black text-purple-400 uppercase tracking-widest">Enlace Privado</p>
                 </div>
                 <p className="text-xs font-black truncate border-l-2 border-purple-500 pl-3">{selectedPrivateUser?.displayName || "SELECCIONAR..."}</p>
             </div>
         )}
      </div>

    </div>
  );
}
