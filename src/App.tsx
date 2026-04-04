import { useState, useEffect, useCallback } from 'react';
import { Sparkles, Radio, Mic, MicOff, Power, PowerOff, Volume2, VolumeX, AlertCircle, LogIn, LogOut, User as UserIcon, Shield, ShieldAlert, ShieldCheck, Settings, Share2, Trash2, Download, Users, X } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useWalkieTalkie } from './hooks/useWalkieTalkie';
import { cn } from './lib/utils';
import { auth, signIn, logOut, db, UserRole, handleFirestoreError, OperationType, UserProfile } from './firebase';
import { onAuthStateChanged, User } from 'firebase/auth';
import { doc, onSnapshot, updateDoc, collection } from 'firebase/firestore';
import AdminPanel from './components/AdminPanel';
// LIBRERIA CORREGIDA:
import { ForegroundService } from '@capawesome/capacitor-android-foreground-service';

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

  const handleNewRecording = useCallback((newRec: any) => { if (isHistoryOpen) setRecordings((prev: any[]) => [newRec, ...prev]); }, [isHistoryOpen]);

  const activeGroupId = (userRole === UserRole.ADMIN && isMonitorOpen) ? 'global-monitor' : userGroupId;
  const { isConnected, isTalking, isReceiving, error: walkieError, connect, disconnect, startTalking, stopTalking, playRecording } = useWalkieTalkie(activeGroupId, handleNewRecording);
  
  const [isMuted, setIsMuted] = useState(false);
  const [isPressed, setIsPressed] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);

  // CONTROL ABSOLUTO DEL SEGUNDO PLANO EN SISTEMA NATIVO
  useEffect(() => {
    let wakeLock: any = null;
    const activateSecureBackground = async () => {
      // INSTRUCCION NATIVA CORREGIDA:
      try { await ForegroundService.startForegroundService({ id: 112, title: "Emergencia COE", body: "Radio activa permanente" }); } catch (err) { }
      try { if ('wakeLock' in navigator) wakeLock = await (navigator as any).wakeLock.request('screen'); } catch (err) { }
    };
    if (isConnected) activateSecureBackground();
    else try { ForegroundService.stopForegroundService(); } catch(err){}
    
    return () => { if (wakeLock !== null) wakeLock.release().catch(() => {}); }
  }, [isConnected]);

  useEffect(() => {
    const forceReconnect = () => { if (document.visibilityState === 'visible' && !isConnected && activeGroupId) connect(); };
    document.addEventListener('visibilitychange', forceReconnect);
    return () => document.removeEventListener('visibilitychange', forceReconnect);
  }, [isConnected, activeGroupId, connect]);

  useEffect(() => { if (success) { const timer = setTimeout(() => setSuccess(null), 3000); return () => clearTimeout(timer); } }, [success]);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser); setAuthError(null);
      if (currentUser) {
        const userDocRef = doc(db, 'users', currentUser.uid);
        const unsubProfile = onSnapshot(userDocRef, (docSnap) => {
          if (docSnap.exists()) {
            const data = docSnap.data();
            setUserRole(data.role as UserRole); setUserGroupId(data.groupId || null); setAuthError(null);
            if (data.groupId) {
              onSnapshot(doc(db, 'groups', data.groupId), (gSnap) => { if (gSnap.exists()) setUserGroupName(gSnap.data().name); else setUserGroupName(null); });
            } else setUserGroupName(null);
            if (currentUser.email === 'saludjj5@gmail.com' && data.role !== UserRole.ADMIN) updateDoc(userDocRef, { role: UserRole.ADMIN });
          } else if (currentUser.email !== 'saludjj5@gmail.com') setAuthError("Acceso denegado.");
          setIsAuthLoading(false);
        }, (err) => { setAuthError(err.message); setIsAuthLoading(false); });
        return () => unsubProfile();
      } else { setUserRole(null); setIsAuthLoading(false); }
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (userRole) {
      const unsubUsers = onSnapshot(collection(db, 'users'), (snap) => {
        const usersData = snap.docs.map(doc => ({ ...doc.data() } as UserProfile));
        setAllUsers(usersData);
        if (activeGroupId && !isMonitorOpen) {
          const talker = usersData.find(u => u.isTalking === true && u.uid !== user?.uid);
          setTalkingUser(talker || null);
        }
      });
      const unsubGroups = onSnapshot(collection(db, 'groups'), (snap) => { setAllGroups(snap.docs.map(doc => ({ id: doc.id, ...doc.data() }))); });
      return () => { unsubUsers(); unsubGroups(); };
    }
  }, [userRole, activeGroupId, user?.uid, isMonitorOpen]);

  const fetchHistory = async () => {
    if (!activeGroupId && userRole !== UserRole.ADMIN) return;
    setIsLoadingHistory(true);
    try {
      const gid = userRole === UserRole.ADMIN ? 'all' : (activeGroupId || 'none');
      const response = await fetch(`https://llamada-urgente-2.onrender.com/api/recordings/${gid}`);
      if (response.ok) setRecordings(await response.json());
    } catch {} finally { setIsLoadingHistory(false); }
  };

  useEffect(() => { if (isHistoryOpen) fetchHistory(); }, [isHistoryOpen, activeGroupId]);

  const handleDeleteRecording = async (filename: string) => {
    if (!window.confirm("¿Seguro de eliminar?")) return;
    try {
      const response = await fetch(`https://llamada-urgente-2.onrender.com/api/recordings/${encodeURIComponent(filename)}`, { method: 'DELETE' });
      if (response.ok) { setRecordings(prev => prev.filter(r => r.filename !== filename)); setSuccess("Eliminada."); }
    } catch (err) {}
  };

  const handleDownloadRecording = async (filename: string, displayName: string) => {
    try {
      const response = await fetch(`https://llamada-urgente-2.onrender.com/api/recordings/play/${encodeURIComponent(filename)}`);
      if (!response.ok) throw new Error("Fetch failed");
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url; a.download = `${displayName}_${new Date().getTime()}.raw`;
      document.body.appendChild(a); a.click(); window.URL.revokeObjectURL(url); document.body.removeChild(a);
      setSuccess("Descarga iniciada.");
    } catch (err) {}
  };

  const handleSignIn = async () => {
    if (!emailInput || !passInput) return setAuthError("Ingresa tu correo y contraseña.");
    setIsAuthLoading(true);
    try { setAuthError(null); await signIn(emailInput, passInput); } catch (err: any) { setAuthError(err.message); setIsAuthLoading(false); }
  };

  const handleToggleConnection = () => { isConnected ? disconnect() : connect(); };

  const handleToggleTalk = async () => {
    if (!isConnected) return;
    if (isPressed) {
      setIsPressed(false);
      if (user) try { await updateDoc(doc(db, 'users', user.uid), { isTalking: false }); } catch (err) {}
      stopTalking();
    } else {
      setIsPressed(true);
      if (user) try { await updateDoc(doc(db, 'users', user.uid), { isTalking: true }); } catch (err) {}
      startTalking(user.uid, user.displayName || user.email?.split('@')[0] || "Usuario");
    }
  };

  const getRoleIcon = (role: UserRole | null) => {
    switch (role) {
      case UserRole.ADMIN: return <ShieldCheck className="w-4 h-4 text-blue-400" />;
      case UserRole.ADMIN2: return <Shield className="w-4 h-4 text-purple-400" />;
      case UserRole.USUARIO: return <UserIcon className="w-4 h-4 text-gray-400" />;
      default: return null;
    }
  };

  if (isAuthLoading) {
    return (<div className="min-h-screen bg-white flex items-center justify-center"><motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1, ease: "linear" }} className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full" /></div>);
  }

  if (!user || authError) {
    return (
      <div className="min-h-screen bg-white text-gray-900 flex flex-col items-center justify-center p-4">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="relative z-10 text-center space-y-8 max-w-sm w-full">
          <div className="space-y-4">
            <div className="w-20 h-20 bg-red-500/10 rounded-3xl flex items-center justify-center mx-auto"><Radio className="w-10 h-10 text-red-500" /></div>
            <h1 className="text-4xl font-bold tracking-tight text-gray-900">EMERGENCIA</h1>
          </div>
          {authError && (<div className="p-4 bg-red-500/5 text-red-600 text-sm text-left"><p>{authError}</p></div>)}
          <div className="space-y-3 text-left">
            <input type="email" placeholder="Correo electrónico" value={emailInput} onChange={(e) => setEmailInput(e.target.value)} className="w-full px-4 py-3 rounded-xl border border-gray-200 bg-gray-50 outline-none" />
            <input type="password" placeholder="Contraseña" value={passInput} onChange={(e) => setPassInput(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleSignIn()} className="w-full px-4 py-3 rounded-xl border border-gray-200 bg-gray-50 outline-none" />
            <button onClick={handleSignIn} className="w-full py-4 mt-2 bg-blue-600 text-white font-bold rounded-2xl"><LogIn className="inline w-5 h-5 mr-2" /> Entrar</button>
          </div>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white text-gray-900 font-sans flex flex-col items-center justify-center p-4 overflow-hidden">
      <div className="fixed top-0 left-0 right-0 p-4 flex items-center justify-between z-20">
        <div className="flex items-center gap-3 bg-white/80 border border-gray-200 px-3 py-2 rounded-2xl shadow-sm">
          <div className="w-8 h-8 rounded-full bg-blue-500/10 flex items-center justify-center"><UserIcon className="w-4 h-4 text-blue-500" /></div>
          <div className="flex flex-col">
            <span className="text-[10px] font-bold text-gray-900 leading-none">{user.displayName || user.email?.split('@')[0]}</span>
            <div className="flex items-center gap-1 mt-1">
              {getRoleIcon(userRole)}
              <span className="text-[8px] font-black uppercase text-gray-400">{userRole}</span>
              {userGroupName && (<><span className="text-[8px] text-gray-200">•</span><span className="text-[8px] font-bold text-blue-600 uppercase">{userGroupName}</span></>)}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {userRole === UserRole.ADMIN && (<button onClick={() => setIsMonitorOpen(!isMonitorOpen)} className={cn("p-3 rounded-2xl border transition-all", isMonitorOpen ? "bg-red-600 text-white border-red-600" : "bg-white text-gray-400 border-gray-200")}><Radio className="w-5 h-5" /></button>)}
          {(userRole === UserRole.ADMIN || userRole === UserRole.ADMIN2) && (<button onClick={() => setIsHistoryOpen(true)} className="p-3 rounded-2xl bg-white border border-gray-200 text-gray-400"><Volume2 className="w-5 h-5" /></button>)}
          {(userRole === UserRole.ADMIN || userRole === UserRole.ADMIN2) && (<button onClick={() => setIsAdminPanelOpen(true)} className="p-3 rounded-2xl bg-white border border-gray-200 text-gray-400"><Settings className="w-5 h-5" /></button>)}
          <button onClick={logOut} className="p-3 rounded-2xl bg-white border border-gray-200 text-gray-400"><LogOut className="w-5 h-5" /></button>
        </div>
      </div>

      <AnimatePresence>
        {isAdminPanelOpen && <AdminPanel onClose={() => setIsAdminPanelOpen(false)} currentUserRole={userRole} currentUserGroupId={userGroupId} />}
      </AnimatePresence>

      <AnimatePresence>
        {isHistoryOpen && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 flex items-center justify-center p-2 bg-black/40 backdrop-blur-sm">
             <div className="bg-white w-full max-w-md rounded-2xl overflow-hidden flex flex-col h-[80vh] shadow-xl">
               <div className="p-4 border-b flex justify-between bg-gray-50">
                  <h3 className="font-bold text-sm tracking-widest uppercase">Historial (1000MB)</h3>
                  <button onClick={() => setIsHistoryOpen(false)}><X className="w-5"/></button>
               </div>
               <div className="flex-1 overflow-y-auto p-4 space-y-2">
                  {isLoadingHistory ? <div className="text-center text-xs">Cargando Bóveda...</div> : recordings.length === 0 ? <p className="text-xs text-center text-gray-400">Archivos Vacíos</p> :
                  recordings.map(r => (
                     <div key={r.filename} className="bg-gray-100 p-3 rounded-xl flex justify-between items-center text-xs">
                         <div className="flex flex-col">
                            <span className="font-black text-blue-600">{r.displayName}</span>
                            <span className="text-[10px] text-gray-500">{new Date(r.timestamp).toLocaleString()} ({Math.round(r.size/1024)} KB)</span>
                         </div>
                         <div className="flex gap-3">
                            <button onClick={() => playRecording(r.filename)} title="Reproducir"><Volume2 className="text-green-600 w-5"/></button>
                            <button onClick={() => handleDownloadRecording(r.filename, r.displayName)} title="Descargar Audio"><Download className="text-blue-600 w-5"/></button>
                            <button onClick={() => handleDeleteRecording(r.filename)} title="Eliminar del Servidor"><Trash2 className="text-red-500 w-5"/></button>
                         </div>
                     </div>
                  ))}
               </div>
             </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="relative w-full max-w-md flex flex-col items-center gap-8 mt-16">
        <div className="text-center space-y-2">
          <h1 className="text-4xl font-black tracking-tighter text-gray-900 uppercase">EMERGENCIA</h1>
          <motion.div className="inline-flex items-center gap-3 px-6 py-2.5 rounded-2xl text-white mx-auto bg-red-600 shadow-lg shadow-red-500/30">
            <Radio className="w-5 h-5 animate-pulse" />
            <span className="text-sm font-black uppercase">{isMonitorOpen ? "Frecuencia COE" : (userGroupName || "Sin Grupo")}</span>
          </motion.div>
        </div>

        <div className="relative w-72 h-[450px] bg-gray-50 rounded-[60px] border-[8px] border-gray-100 shadow-2xl flex flex-col items-center p-6">
          <div className="w-full h-32 bg-white rounded-3xl border border-gray-100 p-4 shadow-inner flex flex-col items-center justify-center gap-2 mt-8 relative overflow-hidden">
            {isMonitorOpen ? (
              <div className="absolute inset-0 bg-gray-900 p-3 overflow-y-auto w-full rounded-[20px]">
                 <h3 className="text-white text-[8px] uppercase font-black border-b border-gray-700 pb-1 mb-2">📡 Radar Global Activo</h3>
                 {allGroups.map(g => {
                     const talkers = allUsers.filter(u => u.groupId === g.id && u.isTalking);
                     return (
                         <div key={g.id} className="flex flex-col py-1 border-b border-gray-800">
                             <div className="flex items-center justify-between w-full">
                                <span className="text-gray-300 font-bold text-[10px] uppercase truncate max-w-[120px]">{g.name}</span>
                                {talkers.length > 0 && <Mic className="w-3 h-3 text-red-500 animate-pulse flex-shrink-0" />}
                             </div>
                             {talkers.map(t => <span key={t.uid} className="text-red-500 font-black text-[9px] animate-pulse">AL AIRE: {t.displayName}</span>)}
                         </div>
                     )
                 })}
              </div>
            ) : (
             <>
                <div className="flex items-center gap-2">
                  <div className={cn("w-2 h-2 rounded-full", isConnected ? "bg-green-500 animate-pulse" : "bg-red-500")} />
                  <span className="text-[10px] font-bold uppercase tracking-widest text-gray-400">{isConnected ? "Connected" : "Offline"}</span>
                </div>
                <div className="w-full text-center">
                  {!activeGroupId ? (<p className="text-[10px] text-red-500 font-black uppercase animate-pulse">Sin Grupo Asignado</p>) : isTalking ? (<div className="flex flex-col items-center gap-1"><span className="text-[8px] font-black uppercase text-red-600 animate-pulse">Transmitiendo</span></div>) : talkingUser ? (<div className="flex flex-col items-center gap-1"><span className="text-[8px] font-black uppercase text-blue-600 animate-pulse">Recibiendo</span><p className="text-[10px] font-black truncate">{talkingUser.displayName || talkingUser.email}</p></div>) : (<p className="text-[10px] text-gray-400 italic">Esperando señal...</p>)}
                </div>
             </>
            )}
          </div>

          <div className="flex-1 flex flex-col items-center justify-center w-full gap-8">
            <button
                onClick={handleToggleTalk}
                disabled={!isConnected}
                className={cn("w-28 h-28 rounded-full flex flex-col items-center justify-center gap-2 transition-all shadow-xl", isPressed ? "bg-red-600 scale-95" : "bg-blue-600")}
              >
                {isTalking ? <Mic className="w-10 h-10 text-white animate-pulse" /> : <MicOff className="w-10 h-10 text-white/40" />}
                <span className="text-[10px] items-center text-white font-black overflow-hidden flex flex-col">{isPressed ? "AL AIRE" : "TOCAR PARA HABLAR"}</span>
            </button>
            <div className="flex items-center gap-4">
              <button onClick={handleToggleConnection} className="p-3 rounded-2xl bg-white border border-gray-200"><Power className="w-5 h-5 text-gray-400" /></button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
