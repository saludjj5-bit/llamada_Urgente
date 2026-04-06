import { useState, useEffect } from 'react';
import { Users, FolderPlus, UserPlus, Trash2, Edit3, Shield, Star, LayoutDashboard, ChevronRight, Search, X, Check, Save, Download, FileAudio, Play, History } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { db, UserRole, UserProfile, createGroup, deleteGroup, updateGroup, preRegisterUser, deleteUser, updateUserProfile } from '../firebase';
import { collection, onSnapshot, query, orderBy } from 'firebase/firestore';
import { cn } from '../lib/utils';

interface AdminPanelProps {
  onClose: () => void;
  userRole: UserRole;
  currentGroupId: string | null;
}

export default function AdminPanel({ onClose, userRole, currentGroupId }: AdminPanelProps) {
  const [activeTab, setActiveTab] = useState<'groups' | 'users' | 'monitor' | 'recordings'>('groups');
  const [groups, setGroups] = useState<any[]>([]);
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [recordings, setRecordings] = useState<any[]>([]);
  
  // Edición
  const [editingGroupId, setEditingGroupId] = useState<string | null>(null);
  const [editGroupName, setEditGroupName] = useState('');
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [editUserDisplay, setEditUserDisplay] = useState('');

  // Creación
  const [newGroupName, setNewGroupName] = useState('');
  const [newUserEmail, setNewUserEmail] = useState('');
  const [newUserDisplay, setNewUserDisplay] = useState('');
  const [newUserRole, setNewUserRole] = useState<UserRole>(UserRole.USUARIO);
  const [newUserGroup, setNewUserGroup] = useState('');

  const isSuperAdmin = userRole === UserRole.ADMIN;

  useEffect(() => {
    const qGroups = query(collection(db, 'groups'), orderBy('createdAt', 'desc'));
    const unsubGroups = onSnapshot(qGroups, (s) => setGroups(s.docs.map(d => ({ id: d.id, ...d.data() }))));
    const qUsers = query(collection(db, 'users'), orderBy('createdAt', 'desc'));
    const unsubUsers = onSnapshot(qUsers, (s) => setUsers(s.docs.map(d => ({ uid: d.id, ...d.data() } as UserProfile))));
    return () => { unsubGroups(); unsubUsers(); };
  }, []);

  // Cargar grabaciones
  const fetchRecordings = async () => {
    try {
        const resp = await fetch(`https://llamada-urgente-2.onrender.com/api/recordings/all`);
        const data = await resp.json();
        setRecordings(data);
    } catch (e) { console.error("Error al cargar audios:", e); }
  };

  useEffect(() => {
    if (activeTab === 'recordings') fetchRecordings();
  }, [activeTab]);

  const handleDeleteRecording = async (filename: string) => {
    if (!confirm('¿Seguro que desea eliminar esta evidencia permanentemente?')) return;
    try {
        await fetch(`https://llamada-urgente-2.onrender.com/api/recordings/${filename}`, { method: 'DELETE' });
        fetchRecordings();
    } catch (e) { console.error("Error al borrar:", e); }
  };

  const handleDownload = (filename: string) => {
    window.open(`https://llamada-urgente-2.onrender.com/api/recordings/play/${filename}`, '_blank');
  };

  const handleCreateGroup = async () => {
    if (!newGroupName) return;
    await createGroup(newGroupName, isSuperAdmin ? null : currentGroupId);
    setNewGroupName('');
  };

  const handleUpdateGroup = async (id: string) => {
    if (!editGroupName) return;
    await updateGroup(id, editGroupName);
    setEditingGroupId(null);
  };

  const handleUpdateUser = async (uid: string) => {
    if (!editUserDisplay) return;
    await updateUserProfile(uid, { displayName: editUserDisplay });
    setEditingUserId(null);
  };

  const handleRegisterUser = async () => {
    if (!newUserEmail || !newUserDisplay) return;
    await preRegisterUser(newUserEmail, newUserDisplay, newUserRole, newUserGroup || currentGroupId);
    setNewUserEmail(''); setNewUserDisplay('');
  };

  const visibleGroups = isSuperAdmin ? groups : groups.filter(g => g.id === currentGroupId || g.parentGroupId === currentGroupId);
  const visibleUsers = isSuperAdmin ? users : users.filter(u => u.groupId === currentGroupId);

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-950/90 backdrop-blur-xl">
      <motion.div initial={{ scale: 0.95, y: 20 }} animate={{ scale: 1, y: 0 }} className="bg-slate-900 w-full max-w-6xl h-[90vh] rounded-[2.5rem] border border-slate-800 shadow-2xl flex flex-col overflow-hidden">
        
        <div className="flex h-full">
          {/* Categorías Sidebar */}
          <div className="w-20 sm:w-72 border-r border-slate-800 p-8 flex flex-col gap-10 bg-slate-900/50">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-gradient-to-br from-amber-500 to-amber-700 rounded-2xl flex items-center justify-center shadow-xl shadow-amber-900/40"><Shield className="text-white w-6 h-6"/></div>
              <div className="hidden sm:block">
                  <p className="font-black text-slate-100 tracking-tighter text-xl leading-none">CENTRAL</p>
                  <p className="text-[10px] text-amber-500 font-bold uppercase tracking-widest mt-1">Operaciones Pro</p>
              </div>
            </div>
            
            <nav className="flex flex-col gap-3">
              <button onClick={() => setActiveTab('groups')} className={cn("p-4 rounded-2xl flex items-center gap-4 transition-all group", activeTab === 'groups' ? "bg-blue-600 text-white shadow-lg shadow-blue-900/30" : "text-slate-400 hover:bg-slate-800")}>
                <FolderPlus className={cn("w-6 h-6", activeTab === 'groups' ? "" : "group-hover:text-blue-400")}/> 
                <span className="hidden sm:block font-extrabold">CANALES</span>
              </button>
              <button onClick={() => setActiveTab('users')} className={cn("p-4 rounded-2xl flex items-center gap-4 transition-all group", activeTab === 'users' ? "bg-blue-600 text-white shadow-lg shadow-blue-900/30" : "text-slate-400 hover:bg-slate-800")}>
                <Users className={cn("w-6 h-6", activeTab === 'users' ? "" : "group-hover:text-blue-400")}/> 
                <span className="hidden sm:block font-extrabold">PERSONAL</span>
              </button>
              {isSuperAdmin && (
                <>
                  <button onClick={() => setActiveTab('monitor')} className={cn("p-4 rounded-2xl flex items-center gap-4 transition-all group", activeTab === 'monitor' ? "bg-red-600 text-white shadow-lg shadow-red-900/30" : "text-slate-400 hover:bg-slate-800")}>
                    <Star className={cn("w-6 h-6", activeTab === 'monitor' ? "" : "group-hover:text-red-400")}/> 
                    <span className="hidden sm:block font-extrabold">RADAR</span>
                  </button>
                  <button onClick={() => setActiveTab('recordings')} className={cn("p-4 rounded-2xl flex items-center gap-4 transition-all group", activeTab === 'recordings' ? "bg-green-600 text-white shadow-lg shadow-green-900/30" : "text-slate-400 hover:bg-slate-800")}>
                    <History className={cn("w-6 h-6", activeTab === 'recordings' ? "" : "group-hover:text-green-400")}/> 
                    <span className="hidden sm:block font-extrabold">EVIDENCIAS</span>
                  </button>
                </>
              )}
            </nav>

            <button onClick={onClose} className="mt-auto p-5 rounded-2xl bg-slate-800 border border-slate-700 text-slate-300 hover:bg-slate-700 transition-all flex items-center justify-center gap-3 font-black text-sm uppercase tracking-tighter">
              <X className="w-5 h-5"/> <span className="hidden sm:block">CERRAR PANEL</span>
            </button>
          </div>

          {/* Área de Trabajo */}
          <div className="flex-1 flex flex-col min-w-0 bg-slate-950/30">
             <div className="p-10 overflow-y-auto custom-scrollbar">
                <AnimatePresence mode="wait">
                   {activeTab === 'groups' && (
                     <motion.div key="groups" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-10">
                        <section className="space-y-6">
                            <div className="flex items-center gap-3 border-b border-slate-800 pb-4">
                                <FolderPlus className="text-blue-500 w-6 h-6"/>
                                <h2 className="text-3xl font-black text-white italic tracking-tight uppercase">GESTIÓN DE CANALES</h2>
                            </div>
                            <div className="flex gap-4 p-6 glass rounded-[2rem] border-blue-500/20">
                                <input type="text" placeholder="NOMBRE DEL NUEVO GRUPO..." value={newGroupName} onChange={e => setNewGroupName(e.target.value)} className="flex-1 p-5 bg-slate-900/50 border border-slate-800 rounded-2xl outline-none focus:border-blue-500 font-bold" />
                                <button onClick={handleCreateGroup} className="px-10 bg-blue-600 text-white font-black rounded-2xl hover:bg-blue-500 shadow-lg shadow-blue-900/40 transition-all active:scale-95">CREAR GRUPO</button>
                            </div>
                        </section>

                        <section className="space-y-6">
                           <h3 className="text-[10px] font-black text-slate-500 uppercase tracking-[0.4em] pl-2">Listado de Grupos Activos</h3>
                           <div className="grid gap-4">
                              {visibleGroups.map(g => (
                                <div key={g.id} className="p-6 glass rounded-2xl flex items-center justify-between group hover:bg-slate-800/40 border-slate-800/50 transition-all">
                                   <div className="flex items-center gap-5">
                                      <div className="w-14 h-14 bg-slate-900 rounded-2xl flex items-center justify-center font-black text-xl text-blue-500 border border-slate-800 shadow-inner">#</div>
                                      <div>
                                         {editingGroupId === g.id ? (
                                            <div className="flex gap-2">
                                                <input value={editGroupName} onChange={e => setEditGroupName(e.target.value)} className="p-2 bg-slate-950 border border-blue-500 rounded-lg outline-none font-bold" />
                                                <button onClick={() => handleUpdateGroup(g.id)} className="p-2 bg-green-600 rounded-lg"><Check className="w-4 h-4 text-white"/></button>
                                            </div>
                                         ) : (
                                            <>
                                                <p className="font-black text-slate-100 uppercase text-lg tracking-tight">{g.name}</p>
                                                <p className="text-[10px] text-slate-500 font-bold font-mono">CODE: {g.id.slice(0,8)}</p>
                                            </>
                                         )}
                                      </div>
                                   </div>
                                   <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                      <button onClick={() => { setEditingGroupId(g.id); setEditGroupName(g.name); }} className="p-3 bg-slate-800 hover:bg-blue-600 text-white rounded-xl transition-all"><Edit3 className="w-5 h-5"/></button>
                                      {isSuperAdmin && (
                                        <button onClick={() => deleteGroup(g.id)} className="p-3 bg-slate-800 hover:bg-red-600 text-white rounded-xl transition-all"><Trash2 className="w-5 h-5"/></button>
                                      )}
                                   </div>
                                </div>
                              ))}
                           </div>
                        </section>
                     </motion.div>
                   )}

                   {activeTab === 'users' && (
                     <motion.div key="users" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-10">
                        <section className="space-y-6">
                            <div className="flex items-center gap-3 border-b border-slate-800 pb-4">
                                <UserPlus className="text-blue-500 w-6 h-6"/>
                                <h2 className="text-3xl font-black text-white italic tracking-tight uppercase">REGISTRO DE PERSONAL</h2>
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-8 glass rounded-[2.5rem] border-blue-500/10">
                                <input type="email" placeholder="CORREO ELECTRÓNICO..." value={newUserEmail} onChange={e => setNewUserEmail(e.target.value)} className="p-5 bg-slate-900/50 border border-slate-800 rounded-2xl outline-none focus:border-blue-500 font-bold" />
                                <input type="text" placeholder="NOMBRE DE USUARIO..." value={newUserDisplay} onChange={e => setNewUserDisplay(e.target.value)} className="p-5 bg-slate-900/50 border border-slate-800 rounded-2xl outline-none focus:border-blue-500 font-bold" />
                                <select value={newUserRole} onChange={e => setNewUserRole(e.target.value as UserRole)} className="p-5 bg-slate-900/50 border border-slate-800 rounded-2xl text-slate-400 font-bold outline-none cursor-pointer">
                                   <option value={UserRole.USUARIO}>OPERADOR ESTÁNDAR</option>
                                   <option value={UserRole.ADMIN2}>ADMINISTRADOR SECUNDARIO</option>
                                   {isSuperAdmin && <option value={UserRole.ADMIN}>ADMINISTRADOR MAESTRO</option>}
                                </select>
                                <select value={newUserGroup} onChange={e => setNewUserGroup(e.target.value)} className="p-5 bg-slate-900/50 border border-slate-800 rounded-2xl text-slate-400 font-bold outline-none cursor-pointer">
                                   <option value="">CANAL ASIGNADO...</option>
                                   {groups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
                                </select>
                                <button onClick={handleRegisterUser} className="sm:col-span-2 py-5 bg-blue-600 text-white font-black rounded-2xl hover:bg-blue-500 shadow-xl shadow-blue-900/30 active:scale-95 transition-all uppercase tracking-widest mt-2">ALTA DE OPERADOR</button>
                            </div>
                        </section>

                        <section className="space-y-6">
                           <h3 className="text-[10px] font-black text-slate-500 uppercase tracking-[0.4em] pl-2">Personal Activo en Base</h3>
                           <div className="grid gap-4">
                              {visibleUsers.map(u => (
                                <div key={u.uid} className="p-6 glass rounded-2xl flex items-center justify-between group hover:bg-slate-800/40 border-slate-800/50 transition-all">
                                   <div className="flex items-center gap-5">
                                      <div className={cn("w-14 h-14 rounded-2xl flex items-center justify-center font-black text-white text-xl shadow-lg shadow-black/50 border", u.role === UserRole.ADMIN ? "bg-gradient-to-br from-amber-500 to-amber-700 border-amber-400/50" : "bg-gradient-to-br from-blue-500 to-blue-700 border-blue-400/50")}>
                                        {u.displayName?.[0] || 'U'}
                                      </div>
                                      <div>
                                         {editingUserId === u.uid ? (
                                            <div className="flex flex-col gap-2 min-w-[200px]">
                                                <input value={editUserDisplay} onChange={e => setEditUserDisplay(e.target.value)} className="p-2 bg-slate-950 border border-blue-500 rounded-lg outline-none font-bold text-sm" />
                                                <div className="space-y-1">
                                                  <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest pl-1">Mover a Canal:</p>
                                                  <select 
                                                    value={u.groupId || ''} 
                                                    onChange={async (e) => {
                                                      await updateUserProfile(u.uid, { groupId: e.target.value });
                                                    }}
                                                    className="w-full p-2 bg-slate-900 border border-slate-700 rounded-lg text-[11px] font-bold text-blue-400 outline-none focus:border-blue-500"
                                                  >
                                                    <option value="">SIN ASIGNAR</option>
                                                    {groups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
                                                  </select>
                                                </div>
                                                <button onClick={() => handleUpdateUser(u.uid)} className="p-2 bg-green-600 rounded-lg self-end hover:bg-green-500 transition-all shadow-lg shadow-green-900/20"><Check className="w-4 h-4 text-white"/></button>
                                            </div>
                                         ) : (
                                            <>
                                                <p className="font-black text-slate-100 uppercase text-lg leading-tight">{u.displayName}</p>
                                                <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">{u.email} • {u.role}</p>
                                            </>
                                         )}
                                      </div>
                                   </div>
                                   <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                      <button onClick={() => { setEditingUserId(u.uid); setEditUserDisplay(u.displayName || ''); }} className="p-3 bg-slate-800 hover:bg-blue-600 text-white rounded-xl transition-all"><Edit3 className="w-5 h-5"/></button>
                                      <button onClick={() => deleteUser(u.uid)} className="p-3 bg-slate-800 hover:bg-red-600 text-white rounded-xl transition-all"><Trash2 className="w-5 h-5"/></button>
                                   </div>
                                </div>
                              ))}
                           </div>
                        </section>
                     </motion.div>
                   )}

                   {activeTab === 'recordings' && (
                     <motion.div key="recordings" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-10">
                        <section className="space-y-6">
                            <div className="flex items-center gap-3 border-b border-slate-800 pb-4">
                                <History className="text-green-500 w-8 h-8"/>
                                <h2 className="text-3xl font-black text-white italic tracking-tight uppercase">EVIDENCIAS DE AUDIO</h2>
                            </div>
                            
                            <div className="space-y-8">
                                {recordings.length === 0 ? (
                                    <div className="p-20 text-center glass rounded-[3rem] border-white/5">
                                        <FileAudio className="w-20 h-20 text-slate-700 mx-auto mb-4 opacity-50"/>
                                        <p className="text-slate-500 font-black uppercase tracking-[0.2em]">No hay grabaciones recientes</p>
                                    </div>
                                ) : (
                                    // Agrupar por canal
                                    Object.entries(
                                        recordings.reduce((acc: any, rec: any) => {
                                            const gName = groups.find(g => g.id === rec.groupId)?.name || 'Canal Desconocido';
                                            if (!acc[gName]) acc[gName] = [];
                                            acc[gName].push(rec);
                                            return acc;
                                        }, {})
                                    ).map(([groupName, groupRecs]: [string, any]) => (
                                        <div key={groupName} className="space-y-4">
                                            <div className="flex items-center gap-3 px-4 py-2 bg-slate-800/30 rounded-xl border border-white/5 w-fit">
                                                <div className="w-2 h-2 bg-green-500 rounded-full shadow-[0_0_8px_rgba(34,197,94,0.8)]"/>
                                                <h3 className="text-[10px] font-black text-slate-300 uppercase tracking-[0.3em]">{groupName} ({groupRecs.length})</h3>
                                            </div>
                                            <div className="grid gap-3">
                                                {groupRecs.map((r: any) => (
                                                    <div key={r.filename} className="p-5 glass rounded-2xl flex items-center justify-between group hover:bg-slate-800/40 border-slate-800/50 transition-all border-l-[4px] border-l-green-500/40">
                                                        <div className="flex items-center gap-4">
                                                            <div className="w-10 h-10 bg-green-500/10 rounded-xl flex items-center justify-center">
                                                                <FileAudio className="text-green-500 w-5 h-5"/>
                                                            </div>
                                                            <div>
                                                                <p className="font-black text-slate-100 uppercase text-[12px] tracking-tight">{r.displayName}</p>
                                                                <div className="flex items-center gap-3 mt-1">
                                                                    <p className="text-[9px] text-slate-500 font-bold uppercase tracking-widest">{new Date(r.timestamp).toLocaleString()}</p>
                                                                    <span className="w-1 h-1 bg-slate-700 rounded-full"/>
                                                                    <p className="text-[9px] text-green-500/70 font-bold uppercase tracking-widest">{(r.size / 1024 / 1024).toFixed(2)} MB</p>
                                                                </div>
                                                            </div>
                                                        </div>
                                                        <div className="flex gap-2">
                                                            <button onClick={() => handleDownload(r.filename)} className="p-2 sm:p-3 bg-slate-800 hover:bg-green-600 text-white rounded-xl transition-all shadow-lg flex items-center gap-2">
                                                                <Download className="w-4 h-4 sm:w-5 h-5"/>
                                                            </button>
                                                            <button onClick={() => handleDeleteRecording(r.filename)} className="p-2 sm:p-3 bg-slate-800 hover:bg-red-600 text-white rounded-xl transition-all shadow-lg">
                                                                <Trash2 className="w-4 h-4 sm:w-5 h-5"/>
                                                            </button>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    ))
                                )}
                            </div>
                        </section>
                     </motion.div>
                   )}

                   {activeTab === 'monitor' && (
                     <motion.div key="monitor" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-10">
                        <div className="p-10 bg-gradient-to-r from-red-600/20 to-transparent border border-red-500/20 rounded-[3rem] relative overflow-hidden">
                           <div className="relative z-10 space-y-4">
                              <div className="flex items-center gap-4 text-red-500">
                                 <Shield className="w-8 h-8 animate-pulse"/>
                                 <h2 className="text-4xl font-black italic tracking-tighter">CENTRO DE INTERCEPTACIÓN</h2>
                              </div>
                              <p className="max-w-md text-[10px] text-slate-400 font-bold leading-relaxed opacity-70 tracking-widest uppercase">ESTADO DE ESCUCHA ACTIVA SOBRE TODOS LOS GRUPOS DEL SISTEMA. MONITOREO DE ALTA DISPONIBILIDAD ALPHA-1.</p>
                           </div>
                           <div className="absolute right-0 top-0 bottom-0 w-64 bg-slate-800/10 -skew-x-12 translate-x-32"/>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pb-10">
                           {groups.map(g => (
                             <div key={g.id} className="p-8 glass rounded-[2.5rem] flex items-center justify-between border-l-[10px] border-l-red-600/30">
                                <div className="space-y-1">
                                   <div className="flex items-center gap-2">
                                      <div className="w-2 h-2 bg-red-500 rounded-full animate-ping"/>
                                      <p className="text-[10px] font-black text-slate-500 uppercase tracking-[0.3em]">Operativo</p>
                                   </div>
                                   <p className="text-2xl font-black text-slate-100 tracking-tighter italic uppercase">{g.name}</p>
                                </div>
                             </div>
                           ))}
                        </div>
                     </motion.div>
                   )}
                </AnimatePresence>
             </div>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}
