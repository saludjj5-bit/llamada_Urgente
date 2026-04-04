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
  const [user, setUser] = useState<User | null>(null);
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
      setRecordings(prev => [newRec, ...prev]);
    }
  }, [isHistoryOpen]);

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
        // Listen to user profile for role changes
        const userDocRef = doc(db, 'users', currentUser.uid);
        const unsubProfile = onSnapshot(userDocRef, (docSnap) => {
          if (docSnap.exists()) {
            const data = docSnap.data();
            setUserRole(data.role as UserRole);
            setUserGroupId(data.groupId || null);
            console.log("User Group ID loaded:", data.groupId);
            setAuthError(null);
            
            // Fetch group name if exists
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
            
            // Force update if it's the admin email and role is not admin
            if (currentUser.email === 'saludjj5@gmail.com' && data.role !== UserRole.ADMIN) {
              updateDoc(userDocRef, { role: UserRole.ADMIN });
            }
          } else if (currentUser.email !== 'saludjj5@gmail.com') {
            // This case should be handled by the signIn function, 
            // but as a fallback if the doc is deleted while logged in:
            setAuthError("No tienes autorización para acceder.");
          }
          setIsAuthLoading(false);
        }, (err) => {
          console.error("Profile snapshot error:", err);
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
        
        // Find if anyone in my group is talking (excluding myself)
        if (userGroupId) {
          const talker = usersData.find(u => 
            u.groupId === userGroupId && 
            u.isTalking === true && 
            u.uid !== user?.uid
          );
          setTalkingUser(talker || null);
        }
      });

      const groupsRef = collection(db, 'groups');
      const unsubGroups = onSnapshot(groupsRef, (snap) => {
        setAllGroups(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      });

      return () => {
        unsubUsers();
        unsubGroups();
      };
    }
  }, [userRole, userGroupId, user?.uid]);

  useEffect(() => {
    const handleVisibilityChange = async () => {
      if (document.visibilityState === 'hidden' && isPressed) {
        setIsPressed(false);
        if (user) {
          try {
            await updateDoc(doc(db, 'users', user.uid), { isTalking: false });
          } catch (err) {
            console.error("Error resetting talking status on background:", err);
          }
        }
        stopTalking();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [isPressed, user]);

  useEffect(() => {
    return () => {
      if (user && isPressed) {
        updateDoc(doc(db, 'users', user.uid), { isTalking: false }).catch(console.error);
      }
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
    } catch (err) {
      console.error("Error fetching history:", err);
    } finally {
      setIsLoadingHistory(false);
    }
  };

  useEffect(() => {
    if (isHistoryOpen) {
      fetchHistory();
    }
  }, [isHistoryOpen, userGroupId]);

  const handleDeleteRecording = async (filename: string) => {
    if (!window.confirm("¿Estás seguro de eliminar esta grabación?")) return;
    try {
      const response = await fetch(`/api/recordings/${encodeURIComponent(filename)}`, {
        method: 'DELETE'
      });
      if (response.ok) {
        setRecordings(prev => prev.filter(r => r.filename !== filename));
        setSuccess("Grabación eliminada.");
      } else {
        const errData = await response.json();
        console.error("Delete failed:", errData);
      }
    } catch (err) {
      console.error("Error deleting recording:", err);
    }
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
    } catch (err) {
      console.error("Error downloading:", err);
    }
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


  const handleToggleConnection = () => {
    if (isConnected) {
      disconnect();
    } else {
      connect();
    }
  };

  const handlePressStart = async (e?: React.MouseEvent | React.TouchEvent) => {
    if (e) e.preventDefault();
    if (!isConnected || isPressed) return;
    setIsPressed(true);
    if (user) {
      try {
        await updateDoc(doc(db, 'users', user.uid), { isTalking: true });
      } catch (err) {
        console.error("Error updating talking status:", err);
      }
      startTalking(user.uid, user.displayName || user.email?.split('@')[0] || "Usuario");
    }
  };

  const handlePressEnd = async (e?: React.MouseEvent | React.TouchEvent) => {
    if (e) e.preventDefault();
    if (!isPressed) return;
    setIsPressed(false);
    if (user) {
      try {
        await updateDoc(doc(db, 'users', user.uid), { isTalking: false });
      } catch (err) {
        console.error("Error updating talking status:", err);
      }
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
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ repeat: Infinity, duration: 1, ease: "linear" }}
          className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full"
        />
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
        
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="relative z-10 text-center space-y-8 max-w-sm w-full"
        >
          <div className="space-y-4">
            <div className="w-20 h-20 bg-red-500/10 rounded-3xl border border-red-500/20 flex items-center justify-center mx-auto">
              <Radio className="w-10 h-10 text-red-500" />
            </div>
            <h1 className="text-4xl font-bold tracking-tight text-gray-900">EMERGENCIA</h1>
            <p className="text-gray-500">
              {authError ? "Acceso Restringido" : "Inicia sesión para comenzar tu sesión de walkie-talkie."}
            </p>
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
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white text-gray-900 font-sans selection:bg-blue-500/30 flex flex-col items-center justify-center p-4 overflow-hidden">
      {/* Background Effects */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] rounded-full bg-blue-600/5 blur-[120px]" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] rounded-full bg-purple-600/5 blur-[120px]" />
      </div>

      {/* Top Bar */}
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
            <span className="text-[10px] font-bold text-gray-900 leading-none">{user.displayName}</span>
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
            <button
              onClick={() => setIsMonitorOpen(!isMonitorOpen)}
              className={cn(
                "p-3 rounded-2xl border transition-all",
                isMonitorOpen 
                  ? "bg-blue-600 text-white border-blue-600 shadow-lg shadow-blue-500/20" 
                  : "bg-white border-gray-200 text-gray-400 hover:bg-gray-50"
              )}
            >
              <Radio className="w-5 h-5" />
            </button>
          )}
          {(userRole === UserRole.ADMIN || userRole === UserRole.ADMIN2) && (
            <button
              onClick={() => setIsAdminPanelOpen(true)}
              className="p-3 rounded-2xl bg-white border border-gray-200 text-gray-400 hover:bg-gray-50 transition-all shadow-sm"
            >
              <Settings className="w-5 h-5" />
            </button>
          )}
          {(userRole === UserRole.ADMIN || userRole === UserRole.ADMIN2) && (
            <button
              onClick={() => setIsHistoryOpen(true)}
              className="p-3 rounded-2xl bg-white border border-gray-200 text-gray-400 hover:bg-gray-50 transition-all shadow-sm"
              title="Historial"
            >
              <Volume2 className="w-5 h-5" />
            </button>
          )}
          <button
            onClick={logOut}
            className="p-3 rounded-2xl bg-white border border-gray-200 text-gray-400 hover:bg-gray-50 transition-all shadow-sm"
          >
            <LogOut className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Admin Panel Modal */}
      <AnimatePresence>
        {isAdminPanelOpen && (
          <AdminPanel 
            onClose={() => setIsAdminPanelOpen(false)} 
            currentUserRole={userRole}
            currentUserGroupId={userGroupId}
          />
        )}
      </AnimatePresence>

      {/* History Modal */}
      <AnimatePresence>
        {isHistoryOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm"
          >
            <motion.div
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.9, y: 20 }}
              className="bg-white w-full max-w-sm rounded-[32px] shadow-2xl overflow-hidden flex flex-col max-h-[80vh]"
            >
              <div className="p-6 border-b border-gray-100 flex items-center justify-between bg-gray-50">
                <div>
                  <h2 className="text-lg font-black text-gray-900 uppercase tracking-tight">Historial</h2>
                  <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">Últimas transmisiones</p>
                </div>
                <div className="flex items-center gap-2">
                  <button 
                    onClick={fetchHistory}
                    className="p-2 rounded-full hover:bg-gray-200 transition-colors text-gray-400"
                    title="Actualizar"
                  >
                    <Radio className="w-4 h-4" />
                  </button>
                  <button 
                    onClick={() => setIsHistoryOpen(false)}
                    className="p-2 rounded-full hover:bg-gray-200 transition-colors"
                  >
                    <PowerOff className="w-5 h-5 text-gray-400" />
                  </button>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto p-4 space-y-4 scrollbar-hide">
                {isLoadingHistory ? (
                  <div className="flex flex-col items-center justify-center py-12 gap-4">
                    <div className="w-8 h-8 border-4 border-blue-600/20 border-t-blue-600 rounded-full animate-spin" />
                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Cargando...</p>
                  </div>
                ) : recordings.length === 0 ? (
                  <div className="text-center py-12">
                    <Radio className="w-12 h-12 text-gray-100 mx-auto mb-4" />
                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">No hay grabaciones</p>
                  </div>
                ) : (
                  (() => {
                    const grouped: Record<string, any[]> = recordings.reduce((acc: Record<string, any[]>, rec) => {
                      const gid = rec.groupId || 'unknown';
                      if (!acc[gid]) acc[gid] = [];
                      acc[gid].push(rec);
                      return acc;
                    }, {});

                    return Object.entries(grouped).map(([gid, recs]) => (
                      <div key={gid} className="space-y-2">
                        {userRole === UserRole.ADMIN && (
                          <div className="flex items-center gap-2 px-2">
                            <Users className="w-3 h-3 text-blue-600" />
                            <span className="text-[10px] font-black text-blue-600 uppercase tracking-widest">
                              Grupo: {allGroups.find(g => g.id === gid)?.name || gid}
                            </span>
                          </div>
                        )}
                        <div className="space-y-1">
                          {recs.map((rec) => (
                            <div key={rec.filename} className="bg-white border border-gray-100 rounded-xl p-2 flex items-center justify-between group hover:border-blue-200 transition-all shadow-sm">
                              <div className="min-w-0 flex-1 flex items-center gap-3">
                                <div className="flex flex-col min-w-0">
                                  <p className="text-[10px] font-black text-gray-900 uppercase truncate">{rec.displayName}</p>
                                  <p className="text-[8px] text-gray-400 font-bold">
                                    {new Date(rec.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} • {(rec.size / 1024).toFixed(1)} KB
                                  </p>
                                </div>
                              </div>
                              <div className="flex items-center gap-1">
                                <button
                                  onClick={() => playRecording(rec.filename)}
                                  className="p-2 rounded-lg bg-blue-50 text-blue-600 hover:bg-blue-600 hover:text-white transition-all"
                                  title="Reproducir"
                                >
                                  <Volume2 className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  onClick={() => handleDownloadRecording(rec.filename, rec.displayName)}
                                  className="p-2 rounded-lg bg-green-50 text-green-600 hover:bg-green-600 hover:text-white transition-all opacity-0 group-hover:opacity-100"
                                  title="Descargar"
                                >
                                  <Download className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  onClick={() => handleDeleteRecording(rec.filename)}
                                  className="p-2 rounded-lg bg-red-50 text-red-600 hover:bg-red-600 hover:text-white transition-all opacity-0 group-hover:opacity-100"
                                  title="Eliminar"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ));
                  })()
                )}
              </div>
              
              <div className="p-4 bg-gray-50 border-t border-gray-100">
                <p className="text-[8px] text-gray-400 text-center uppercase font-bold tracking-widest">
                  Almacenamiento rotativo: 100MB máx.
                </p>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="relative w-full max-w-md flex flex-col items-center gap-8">
        {/* Header */}
        <div className="text-center space-y-2">
          <h1 className="text-4xl font-black tracking-tighter text-gray-900 uppercase">
            EMERGENCIA
          </h1>
          <motion.div
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="inline-flex items-center gap-3 px-6 py-2.5 rounded-2xl bg-red-600 border-2 border-red-500 shadow-xl shadow-red-600/20 text-white mx-auto"
          >
            <Radio className="w-5 h-5 animate-pulse" />
            <span className="text-sm font-black uppercase tracking-[0.2em]">
              {userGroupName || "Sin Grupo"}
            </span>
          </motion.div>
        </div>

        {/* Device Body */}
        <div className="relative w-72 h-[450px] bg-gray-50 rounded-[60px] border-[8px] border-gray-100 shadow-2xl flex flex-col items-center p-6 overflow-hidden">
          {/* Speaker Grille */}
          <div className="w-full h-24 grid grid-cols-6 gap-2 opacity-10 mb-6">
            {Array.from({ length: 24 }).map((_, i) => (
              <div key={i} className="w-1.5 h-1.5 rounded-full bg-gray-900" />
            ))}
          </div>

          {/* Status Display */}
          <div className="w-full h-32 bg-white rounded-3xl border border-gray-100 p-4 shadow-inner flex flex-col items-center justify-center gap-2 overflow-hidden">
            <div className="flex items-center gap-2">
              <div className={cn(
                "w-2 h-2 rounded-full",
                isConnected ? "bg-green-500 animate-pulse" : "bg-red-500"
              )} />
              <span className="text-[10px] font-bold uppercase tracking-widest text-gray-400">
                {isConnected ? "Connected" : "Offline"}
              </span>
              {!isConnected && userGroupId && (
                <button 
                  onClick={connect}
                  className="text-[8px] font-black uppercase text-blue-600 hover:underline"
                >
                  Reconectar
                </button>
              )}
            </div>
            
            <div className="w-full text-center">
              {!userGroupId ? (
                <p className="text-[10px] text-red-500 font-black uppercase tracking-widest animate-pulse">
                  Sin Grupo Asignado
                </p>
              ) : isTalking ? (
                <div className="flex flex-col items-center gap-1">
                  <span className="text-[8px] font-black uppercase tracking-[0.2em] text-red-600 animate-pulse">Transmitiendo</span>
                  <p className="text-[10px] font-black text-gray-900 uppercase truncate px-2">
                    {user?.displayName || user?.email?.split('@')[0] || "Tú"}
                  </p>
                </div>
              ) : talkingUser ? (
                <div className="flex flex-col items-center gap-1">
                  <span className="text-[8px] font-black uppercase tracking-[0.2em] text-blue-600 animate-pulse">Recibiendo</span>
                  <p className="text-[10px] font-black text-gray-900 uppercase truncate px-2">
                    {talkingUser.displayName || talkingUser.email.split('@')[0]}
                  </p>
                </div>
              ) : (
                <p className="text-[10px] text-gray-400 truncate px-2 italic">
                  Esperando señal...
                </p>
              )}
            </div>

            {isTalking && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="flex items-center gap-1"
              >
                {[1, 2, 3, 4, 5].map((i) => (
                  <motion.div
                    key={i}
                    animate={{ height: [4, 12, 4] }}
                    transition={{ repeat: Infinity, duration: 0.5, delay: i * 0.1 }}
                    className="w-1 bg-blue-500 rounded-full"
                  />
                ))}
              </motion.div>
            )}
          </div>

          {/* Main PTT Button */}
          <div className="flex-1 flex flex-col items-center justify-center w-full gap-8">
            <motion.button
              onMouseDown={(e) => handlePressStart(e)}
              onMouseUp={(e) => handlePressEnd(e)}
              onMouseLeave={(e) => handlePressEnd(e)}
              onTouchStart={(e) => handlePressStart(e)}
              onTouchEnd={(e) => handlePressEnd(e)}
              disabled={!isConnected}
              animate={{
                scale: isPressed ? 0.9 : 1,
                backgroundColor: isPressed ? "#3b82f6" : isConnected ? "#2563eb" : "#3f3f46"
              }}
              className={cn(
                "w-32 h-32 rounded-full flex items-center justify-center shadow-2xl transition-shadow",
                isConnected ? "shadow-blue-500/20 cursor-pointer" : "cursor-not-allowed opacity-50"
              )}
            >
              <div className="w-28 h-28 rounded-full border-4 border-white/10 flex flex-col items-center justify-center gap-2">
                {isTalking ? (
                  <Mic className="w-10 h-10 text-white animate-pulse" />
                ) : (
                  <MicOff className="w-10 h-10 text-white/40" />
                )}
                <span className="text-[10px] font-black uppercase tracking-tighter text-white/60">
                  Talk
                </span>
              </div>
            </motion.button>

            {/* Side Controls */}
            <div className="flex items-center gap-4">
              <button
                onClick={handleToggleConnection}
                className={cn(
                  "p-3 rounded-2xl border transition-all",
                  isConnected 
                    ? "bg-red-500/10 border-red-500/20 text-red-500 hover:bg-red-500/20" 
                    : "bg-green-500/10 border-green-500/20 text-green-500 hover:bg-green-500/20"
                )}
              >
                {isConnected ? <PowerOff className="w-5 h-5" /> : <Power className="w-5 h-5" />}
              </button>
              
              <button
                onClick={() => setIsMuted(!isMuted)}
                className="p-3 rounded-2xl bg-white border border-gray-200 text-gray-400 hover:bg-gray-50 transition-all shadow-sm"
              >
                {isMuted ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
              </button>
            </div>
          </div>
        </div>

        {/* Monitor Panel (Admin Only) */}
        <AnimatePresence>
          {isMonitorOpen && userRole === UserRole.ADMIN && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="w-full bg-white border border-gray-200 rounded-[32px] p-6 shadow-xl overflow-hidden"
            >
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-sm font-black uppercase tracking-widest text-gray-900">Monitor de Grupos</h2>
                <div className="flex items-center gap-1.5 px-2 py-1 rounded-full bg-green-500/10 text-green-600 text-[10px] font-bold uppercase">
                  <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                  En Vivo
                </div>
              </div>
              
              <div className="grid grid-cols-1 gap-3 max-h-[200px] overflow-y-auto scrollbar-hide">
                {allGroups.map(group => {
                  const groupMembers = allUsers.filter(u => u.groupId === group.id);
                  const onlineMembers = groupMembers.filter(u => u.uid); // Simplified online check (if they have a UID they logged in)
                  
                  return (
                    <div key={group.id} className="bg-gray-50 border border-gray-100 rounded-2xl p-3">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-[10px] font-black uppercase tracking-widest text-blue-600">{group.name}</span>
                        <span className="text-[8px] font-bold text-gray-400">{groupMembers.length} Miembros</span>
                      </div>
                      <div className="flex flex-wrap gap-1">
                        {groupMembers.map(member => (
                          <div 
                            key={member.uid} 
                            className={cn(
                              "px-2 py-0.5 rounded-full text-[8px] font-bold border transition-all duration-300",
                              member.isTalking 
                                ? "bg-blue-500 border-blue-600 text-white animate-pulse shadow-lg shadow-blue-500/20" 
                                : member.uid 
                                  ? "bg-green-50 border-green-100 text-green-600" 
                                  : "bg-gray-100 border-gray-200 text-gray-400"
                            )}
                          >
                            {member.isTalking && <span className="mr-1">●</span>}
                            {member.displayName || member.email.split('@')[0]}
                          </div>
                        ))}
                        {groupMembers.length === 0 && (
                          <span className="text-[8px] text-gray-300 italic">Sin miembros</span>
                        )}
                      </div>
                    </div>
                  );
                })}
                {allGroups.length === 0 && (
                  <p className="text-[10px] text-gray-400 italic text-center py-4">
                    No hay grupos registrados.
                  </p>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Success Message */}
        <AnimatePresence>
          {success && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 10 }}
              className="flex items-center gap-2 px-4 py-3 rounded-2xl bg-green-500/5 border border-green-500/10 text-green-600 text-sm"
            >
              <ShieldCheck className="w-4 h-4" />
              {success}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Error Message */}
        <AnimatePresence>
          {walkieError && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 10 }}
              className="flex items-center gap-2 px-4 py-3 rounded-2xl bg-red-500/5 border border-red-500/10 text-red-600 text-sm"
            >
              <AlertCircle className="w-4 h-4" />
              {walkieError}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Instructions */}
        <div className="text-center">
          <p className="text-[10px] text-gray-400 uppercase tracking-widest font-medium">
            1. Enciende el dispositivo <br />
            2. Mantén presionado TALK para hablar <br />
            3. Suelta para escuchar a tu grupo
          </p>
        </div>
      </div>
    </div>
  );
}
