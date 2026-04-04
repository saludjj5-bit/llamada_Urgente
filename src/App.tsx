import { useState, useEffect, useCallback } from 'react';
import { Sparkles, Radio, Mic, MicOff, Power, PowerOff, Volume2, VolumeX, AlertCircle, LogIn, LogOut, User as UserIcon, Shield, ShieldAlert, ShieldCheck, Settings, Share2, Trash2, Download, Users } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useWalkieTalkie } from './hooks/useWalkieTalkie';
import { cn } from './lib/utils';
import { auth, signIn, logOut, db, UserRole, handleFirestoreError, OperationType, UserProfile } from './firebase';
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

  const handleNewRecording = useCallback((newRec: any) => {
    if (isHistoryOpen) {
      setRecordings((prev: any[]) => [newRec, ...prev]);
    }
  }, [isHistoryOpen]);

  // --- MANTENIMIENTO DEL SEGUNDO PLANO (COE) ---
  useEffect(() => {
    let wakeLock: any = null;
    const requestWakeLock = async () => {
      try {
        if ('wakeLock' in navigator) {
          wakeLock = await (navigator as any).wakeLock.request('screen');
        }
      } catch (err) { }
    };
    
    // Fantasma Web (1ms WAV Loop)
    const silentAudio = new Audio("data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA");
    silentAudio.loop = true;
    silentAudio.volume = 0.01;
    
    const activateCOEMode = () => {
      silentAudio.play().catch(() => {});
      requestWakeLock();
      document.removeEventListener('touchstart', activateCOEMode);
      document.removeEventListener('click', activateCOEMode);
    };
    
    document.addEventListener('touchstart', activateCOEMode);
    document.addEventListener('click', activateCOEMode);
    
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') requestWakeLock();
    };
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibility);
      document.removeEventListener('touchstart', activateCOEMode);
      document.removeEventListener('click', activateCOEMode);
      if (wakeLock !== null) wakeLock.release().catch(() => {});
    };
  }, []);
  // ----------------------------------------------

  const {
    isConnected,
    isTalking,
    isReceiving,
    error: walkieError,
    connect,
    disconnect,
    startTalking,
    stopTalking,
    playRecording
  } = useWalkieTalkie(userGroupId, handleNewRecording);

  const [isMuted, setIsMuted] = useState(false);
  const [isPressed, setIsPressed] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    if (success) {
      const timer = setTimeout(() => setSuccess(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [success]);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setAuthError(null);
      if (currentUser) {
        const userDocRef = doc(db, 'users', currentUser.uid);
        const unsubProfile = onSnapshot(userDocRef, (docSnap) => {
          if (docSnap.exists()) {
            const data = docSnap.data();
            setUserRole(data.role as UserRole);
            setUserGroupId(data.groupId || null);
            setAuthError(null);
            
            if (data.groupId) {
              const groupRef = doc(db, 'groups', data.groupId);
              onSnapshot(groupRef, (gSnap) => {
                if (gSnap.exists()) {
                  setUserGroupName(gSnap.data().name);
                } else {
                  setUserGroupName(null);
                }
              }, (err) => {
                handleFirestoreError(err, OperationType.GET, `groups/${data.groupId}`);
              });
            } else {
              setUserGroupName(null);
            }
            
            if (currentUser.email === 'saludjj5@gmail.com' && data.role !== UserRole.ADMIN) {
              updateDoc(userDocRef, { role: UserRole.ADMIN });
            }
          } else if (currentUser.email !== 'saludjj5@gmail.com') {
            setAuthError("No tienes autorización para acceder.");
          }
          setIsAuthLoading(false);
        }, (err) => {
          setAuthError(err.message);
          setIsAuthLoading(false);
        });
        return () => unsubProfile();
      } else {
        setUserRole(null);
        setIsAuthLoading(false);
      }
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (userRole) {
      const usersRef = collection(db, 'users');
      const unsubUsers = onSnapshot(usersRef, (snap) => {
        const usersData = snap.docs.map(doc => ({ ...doc.data() } as UserProfile));
        setAllUsers(usersData);
        if (userGroupId) {
          const talker = usersData.find(u => 
            u.groupId === userGroupId && u.isTalking === true && u.uid !== user?.uid
          );
          setTalkingUser(talker || null);
        }
      });
      const groupsRef = collection(db, 'groups');
      const unsubGroups = onSnapshot(groupsRef, (snap) => {
        setAllGroups(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      });
      return () => { unsubUsers(); unsubGroups(); };
    }
  }, [userRole, userGroupId, user?.uid]);

  useEffect(() => {
    const handleVisibilityChange = async () => {
      // Modificado para no matar el status de Talking prematuramente.
      if (document.visibilityState === 'hidden' && isPressed) {
        setIsPressed(false);
        if (user) {
          try { await updateDoc(doc(db, 'users', user.uid), { isTalking: false }); } catch (err) {}
        }
        stopTalking();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [isPressed, user, stopTalking]);

  useEffect(() => {
    return () => {
      if (user && isPressed) { updateDoc(doc(db, 'users', user.uid), { isTalking: false }).catch(console.error); }
    };
  }, [user, isPressed]);

  const fetchHistory = async () => {
    if (!userGroupId && userRole !== UserRole.ADMIN) return;
    setIsLoadingHistory(true);
    try {
      const gid = userRole === UserRole.ADMIN ? 'all' : userGroupId;
      const response = await fetch(`/api/recordings/${gid}`);
      if (response.ok) {
        const data = await response.json();
        setRecordings(data);
      }
    } catch {} finally { setIsLoadingHistory(false); }
  };

  useEffect(() => { if (isHistoryOpen) fetchHistory(); }, [isHistoryOpen, userGroupId]);

  const handleDeleteRecording = async (filename: string) => {
    if (!window.confirm("¿Estás seguro de eliminar esta grabación?")) return;
    try {
      const response = await fetch(`/api/recordings/${encodeURIComponent(filename)}`, { method: 'DELETE' });
      if (response.ok) {
        setRecordings(prev => prev.filter(r => r.filename !== filename));
        setSuccess("Grabación eliminada.");
      }
    } catch (err) {}
  };

  const handleDownloadRecording = async (filename: string, displayName: string) => {
    try {
      const response = await fetch(`/api/recordings/play/${encodeURIComponent(filename)}`);
      if (!response.ok) throw new Error("Failed to fetch recording");
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${displayName}_${new Date().getTime()}.raw`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      setSuccess("Descarga iniciada.");
    } catch (err) {}
  };

  const handleSignIn = async () => {
    if (!emailInput || !passInput) {
      setAuthError("Ingresa tu correo y contraseña.");
      return;
    }
    setIsAuthLoading(true);
    try {
      setAuthError(null);
      await signIn(emailInput, passInput);
    } catch (err: any) {
      setAuthError(err.message);
      setIsAuthLoading(false);
    }
  };

  const handleToggleConnection = () => { isConnected ? disconnect() : connect(); };

  const handlePressStart = async (e?: React.MouseEvent | React.TouchEvent) => {
    if (e) e.preventDefault();
    if (!isConnected || isPressed) return;
    setIsPressed(true);
    if (user) {
      try { await updateDoc(doc(db, 'users', user.uid), { isTalking: true }); } catch (err) {}
      startTalking(user.uid, user.displayName || user.email?.split('@')[0] || "Usuario");
    }
  };

  const handlePressEnd = async (e?: React.MouseEvent | React.TouchEvent) => {
    if (e) e.preventDefault();
    if (!isPressed) return;
    setIsPressed(false);
    if (user) {
      try { await updateDoc(doc(db, 'users', user.uid), { isTalking: false }); } catch (err) {}
    }
    stopTalking();
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
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1, ease: "linear" }} className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!user || authError) {
    return (
      <div className="min-h-screen bg-white text-gray-900 flex flex-col items-center justify-center p-4">
        <div className="fixed inset-0 overflow-hidden pointer-events-none">
          <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] rounded-full bg-blue-600/5 blur-[120px]" />
          <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] rounded-full bg-purple-600/5 blur-[120px]" />
        </div>
        
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="relative z-10 text-center space-y-8 max-w-sm w-full">
          <div className="space-y-4">
            <div className="w-20 h-20 bg-red-500/10 rounded-3xl border border-red-500/20 flex items-center justify-center mx-auto">
              <Radio className="w-10 h-10 text-red-500" />
            </div>
            <h1 className="text-4xl font-bold tracking-tight text-gray-900">EMERGENCIA</h1>
            <p className="text-gray-500">{authError ? "Acceso Restringido" : "Inicia sesión para comenzar tu sesión de walkie-talkie."}</p>
          </div>

          {authError && (
            <div className="p-4 bg-red-500/5 border border-red-500/10 rounded-2xl flex items-center gap-3 text-red-600 text-sm text-left">
              <ShieldAlert className="w-5 h-5 flex-shrink-0" />
              <p>{authError}</p>
            </div>
          )}

          <div className="space-y-3 text-left">
            <input 
              type="email" 
              placeholder="Correo electrónico" 
              value={emailInput}
              onChange={(e) => setEmailInput(e.target.value)}
              className="w-full px-4 py-3 rounded-xl border border-gray-200 bg-gray-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all text-gray-900"
            />
            <input 
              type="password" 
              placeholder="Contraseña" 
              value={passInput}
              onChange={(e) => setPassInput(e.target.value)}
              className="w-full px-4 py-3 rounded-xl border border-gray-200 bg-gray-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all text-gray-900 shadow-sm"
              onKeyDown={(e) => e.key === 'Enter' && handleSignIn()}
            />
            
            <button
              onClick={handleSignIn}
              className="w-full py-4 mt-2 bg-blue-600 text-white font-bold rounded-2xl flex items-center justify-center gap-3 hover:bg-blue-700 transition-all shadow-lg shadow-blue-500/20"
            >
              <LogIn className="w-5 h-5" />
              Entrar
            </button>
            
            {authError && (
              <button
                onClick={() => { setAuthError(null); setEmailInput(''); setPassInput(''); logOut(); setIsAuthLoading(false); }}
                className="w-full py-2 text-gray-400 hover:text-gray-600 text-xs font-bold uppercase tracking-widest text-center"
              >
                Limpiar Error y Cancelar
              </button>
            )}
          </div>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white text-gray-900 font-sans selection:bg-blue-500/30 flex flex-col items-center justify-center p-4 overflow-hidden">
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] rounded-full bg-blue-600/5 blur-[120px]" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] rounded-full bg-purple-600/5 blur-[120px]" />
      </div>

      <div className="fixed top-0 left-0 right-0 p-4 flex items-center justify-between z-20">
        <div className="flex items-center gap-3 bg-white/80 border border-gray-200 px-3 py-2 rounded-2xl shadow-sm backdrop-blur-md">
          <div className="w-8 h-8 rounded-full bg-blue-500/10 flex items-center justify-center">
            {user.photoURL ? (
              <img src={user.photoURL} alt="User" className="w-full h-full rounded-full" referrerPolicy="no-referrer" />
            ) : (
              <UserIcon className="w-4 h-4 text-blue-500" />
            )}
          </div>
          <div className="flex flex-col">
            <span className="text-[10px] font-bold text-gray-900 leading-none">{user.displayName || user.email?.split('@')[0]}</span>
            <div className="flex items-center gap-1 mt-1">
              {getRoleIcon(userRole)}
              <span className="text-[8px] font-black uppercase tracking-widest text-gray-400">{userRole}</span>
              {userGroupName && (
                <>
                  <span className="text-[8px] text-gray-200">•</span>
                  <span className="text-[8px] font-bold text-blue-600 uppercase tracking-widest">{userGroupName}</span>
                </>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {userRole === UserRole.ADMIN && (
            <button onClick={() => setIsMonitorOpen(!isMonitorOpen)} className={cn("p-3 rounded-2xl border transition-all", isMonitorOpen ? "bg-blue-600 text-white border-blue-600" : "bg-white text-gray-400")}>
              <Radio className="w-5 h-5" />
            </button>
          )}
          {(userRole === UserRole.ADMIN || userRole === UserRole.ADMIN2) && (
            <button onClick={() => setIsAdminPanelOpen(true)} className="p-3 rounded-2xl bg-white border border-gray-200 text-gray-400">
              <Settings className="w-5 h-5" />
            </button>
          )}
          {(userRole === UserRole.ADMIN || userRole === UserRole.ADMIN2) && (
            <button onClick={() => setIsHistoryOpen(true)} className="p-3 rounded-2xl bg-white border border-gray-200 text-gray-400">
              <Volume2 className="w-5 h-5" />
            </button>
          )}
          <button onClick={logOut} className="p-3 rounded-2xl bg-white border border-gray-200 text-gray-400 hover:bg-red-50 hover:text-red-500">
            <LogOut className="w-5 h-5" />
          </button>
        </div>
      </div>

      <AnimatePresence>
        {isAdminPanelOpen && <AdminPanel onClose={() => setIsAdminPanelOpen(false)} currentUserRole={userRole} currentUserGroupId={userGroupId} />}
      </AnimatePresence>

      <div className="relative w-full max-w-md flex flex-col items-center gap-8 mt-16">
        <div className="text-center space-y-2">
          <h1 className="text-4xl font-black tracking-tighter text-gray-900 uppercase">EMERGENCIA</h1>
          <motion.div initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="inline-flex items-center gap-3 px-6 py-2.5 rounded-2xl bg-red-600 text-white mx-auto">
            <Radio className="w-5 h-5 animate-pulse" />
            <span className="text-sm font-black uppercase">{userGroupName || "Sin Grupo"}</span>
          </motion.div>
        </div>

        <div className="relative w-72 h-[450px] bg-gray-50 rounded-[60px] border-[8px] border-gray-100 shadow-2xl flex flex-col items-center p-6">
          <div className="w-full h-24 grid grid-cols-6 gap-2 opacity-10 mb-6">
            {Array.from({ length: 24 }).map((_, i) => <div key={i} className="w-1.5 h-1.5 rounded-full bg-gray-900" />)}
          </div>

          <div className="w-full h-32 bg-white rounded-3xl border border-gray-100 p-4 shadow-inner flex flex-col items-center justify-center gap-2">
            <div className="flex items-center gap-2">
              <div className={cn("w-2 h-2 rounded-full", isConnected ? "bg-green-500 animate-pulse" : "bg-red-500")} />
              <span className="text-[10px] font-bold uppercase tracking-widest text-gray-400">{isConnected ? "Connected" : "Offline"}</span>
            </div>
            
            <div className="w-full text-center">
              {!userGroupId ? (
                <p className="text-[10px] text-red-500 font-black uppercase animate-pulse">Sin Grupo Asignado</p>
              ) : isTalking ? (
                <div className="flex flex-col items-center gap-1">
                  <span className="text-[8px] font-black uppercase text-red-600 animate-pulse">Transmitiendo</span>
                </div>
              ) : talkingUser ? (
                <div className="flex flex-col items-center gap-1">
                  <span className="text-[8px] font-black uppercase text-blue-600 animate-pulse">Recibiendo</span>
                  <p className="text-[10px] font-black">{talkingUser.displayName || talkingUser.email}</p>
                </div>
              ) : (
                <p className="text-[10px] text-gray-400 italic">Esperando señal...</p>
              )}
            </div>
          </div>

          <div className="flex-1 flex flex-col items-center justify-center w-full gap-8">
            <motion.button
              onMouseDown={handlePressStart} onMouseUp={handlePressEnd} onMouseLeave={handlePressEnd}
              onTouchStart={handlePressStart} onTouchEnd={handlePressEnd}
              disabled={!isConnected}
              animate={{ scale: isPressed ? 0.9 : 1, backgroundColor: isPressed ? "#3b82f6" : isConnected ? "#2563eb" : "#3f3f46" }}
              className="w-32 h-32 rounded-full flex items-center justify-center shadow-2xl"
            >
              <div className="w-28 h-28 rounded-full border-4 border-white/10 flex flex-col items-center justify-center gap-2">
                {isTalking ? <Mic className="w-10 h-10 text-white animate-pulse" /> : <MicOff className="w-10 h-10 text-white/40" />}
                <span className="text-[10px] text-white/60">TALK</span>
              </div>
            </motion.button>
            <div className="flex items-center gap-4">
              <button onClick={handleToggleConnection} className="p-3 rounded-2xl bg-white border border-gray-200">
                <Power className="w-5 h-5 text-gray-400" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
