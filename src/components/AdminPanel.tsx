import { useState, useEffect } from 'react';
import { Users, FolderPlus, UserPlus, Trash2, Edit3, Shield, Star, LayoutDashboard, ChevronRight, Search, X } from 'lucide-react';
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
  const [activeTab, setActiveTab] = useState<'groups' | 'users' | 'monitor'>('groups');
  const [groups, setGroups] = useState<any[]>([]);
  const [users, setUsers] = useState<UserProfile[]>([]);
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

  const handleCreateGroup = async () => {
    if (!newGroupName) return;
    await createGroup(newGroupName, isSuperAdmin ? null : currentGroupId);
    setNewGroupName('');
  };

  const handleRegisterUser = async () => {
    if (!newUserEmail || !newUserDisplay) return;
    await preRegisterUser(newUserEmail, newUserDisplay, newUserRole, newUserGroup || currentGroupId);
    setNewUserEmail(''); setNewUserDisplay('');
  };

  // Filtrar grupos/usuarios para Admin2
  const visibleGroups = isSuperAdmin ? groups : groups.filter(g => g.id === currentGroupId || g.parentGroupId === currentGroupId);
  const visibleUsers = isSuperAdmin ? users : users.filter(u => u.groupId === currentGroupId);

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md">
      <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} className="bg-slate-900 w-full max-w-4xl h-[85vh] rounded-[2rem] border border-slate-800 shadow-2xl flex flex-col overflow-hidden">
        
        {/* Sidebar / Tabs */}
        <div className="flex h-full">
          <div className="w-20 sm:w-64 border-r border-slate-800 p-6 flex flex-col gap-8">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-amber-600 rounded-xl flex items-center justify-center shadow-lg shadow-amber-900/40"><LayoutDashboard className="text-white w-6 h-6"/></div>
              <p className="hidden sm:block font-black text-slate-100 tracking-tighter">CENTRAL CONTROL</p>
            </div>
            
            <nav className="flex flex-col gap-2">
              <button onClick={() => setActiveTab('groups')} className={cn("p-4 rounded-2xl flex items-center gap-3 transition-all", activeTab === 'groups' ? "bg-blue-600 text-white shadow-lg shadow-blue-900/30" : "text-slate-400 hover:bg-slate-800")}>
                <FolderPlus className="w-5 h-5"/> <span className="hidden sm:block font-bold">Gestión Grupos</span>
              </button>
              <button onClick={() => setActiveTab('users')} className={cn("p-4 rounded-2xl flex items-center gap-3 transition-all", activeTab === 'users' ? "bg-blue-600 text-white shadow-lg shadow-blue-900/30" : "text-slate-400 hover:bg-slate-800")}>
                <UserPlus className="w-5 h-5"/> <span className="hidden sm:block font-bold">Gestión Personal</span>
              </button>
              {isSuperAdmin && (
                <button onClick={() => setActiveTab('monitor')} className={cn("p-4 rounded-2xl flex items-center gap-3 transition-all", activeTab === 'monitor' ? "bg-red-600 text-white shadow-lg shadow-red-900/30" : "text-slate-400 hover:bg-slate-800")}>
                  <Shield className="w-5 h-5"/> <span className="hidden sm:block font-bold">Monitor Global</span>
                </button>
              )}
            </nav>

            <button onClick={onClose} className="mt-auto p-4 rounded-2xl bg-slate-800 text-slate-400 hover:text-white flex items-center justify-center gap-2 font-bold mb-4">
              <X className="w-5 h-5"/> <span className="hidden sm:block">Cerrar Panel</span>
            </button>
          </div>

          {/* Main Content */}
          <div className="flex-1 flex flex-col min-w-0">
             <div className="p-8 overflow-y-auto">
                <AnimatePresence mode="wait">
                   {activeTab === 'groups' && (
                     <motion.div key="groups" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-8">
                        <div className="space-y-4">
                            <h2 className="text-2xl font-black text-white">Generar Nuevo Grupo</h2>
                            <div className="flex gap-4">
                                <input type="text" placeholder="Nombre del Grupo/Canal" value={newGroupName} onChange={e => setNewGroupName(e.target.value)} className="flex-1 p-4 bg-slate-950/50 border border-slate-800 rounded-2xl outline-none focus:border-blue-500" />
                                <button onClick={handleCreateGroup} className="px-8 py-4 bg-blue-600 text-white font-bold rounded-2xl hover:bg-blue-500 transition-colors">CREAR</button>
                            </div>
                        </div>

                        <div className="space-y-4">
                           <h3 className="text-xs font-black text-slate-500 uppercase tracking-[0.2em]">Canales Activos en el Sistema</h3>
                           <div className="grid gap-3">
                              {visibleGroups.map(g => (
                                <div key={g.id} className="p-5 glass rounded-2xl flex items-center justify-between group hover:border-blue-500/50 transition-all">
                                   <div className="flex items-center gap-4">
                                      <div className="w-12 h-12 bg-slate-800 rounded-xl flex items-center justify-center font-bold text-blue-400">#</div>
                                      <div>
                                         <p className="font-black text-slate-100 uppercase">{g.name}</p>
                                         <p className="text-[10px] text-slate-500 font-bold">ID: {g.id}</p>
                                      </div>
                                   </div>
                                   <div className="flex gap-2">
                                      {isSuperAdmin && (
                                        <button onClick={() => deleteGroup(g.id)} className="p-3 text-slate-500 hover:text-red-500 transition-colors"><Trash2 className="w-5 h-5"/></button>
                                      )}
                                   </div>
                                </div>
                              ))}
                           </div>
                        </div>
                     </motion.div>
                   )}

                   {activeTab === 'users' && (
                     <motion.div key="users" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-8">
                        <div className="space-y-4">
                            <h2 className="text-2xl font-black text-white">Pre-Registro de Personal</h2>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <input type="email" placeholder="Correo Electrónico" value={newUserEmail} onChange={e => setNewUserEmail(e.target.value)} className="p-4 bg-slate-950/50 border border-slate-800 rounded-2xl outline-none focus:border-blue-500" />
                                <input type="text" placeholder="Nombre Completo" value={newUserDisplay} onChange={e => setNewUserDisplay(e.target.value)} className="p-4 bg-slate-950/50 border border-slate-800 rounded-2xl outline-none focus:border-blue-500" />
                                <select value={newUserRole} onChange={e => setNewUserRole(e.target.value as UserRole)} className="p-4 bg-slate-950/50 border border-slate-800 rounded-2xl outline-none focus:border-blue-500 text-slate-400">
                                   <option value={UserRole.USUARIO}>Usuario Estándar</option>
                                   <option value={UserRole.ADMIN2}>Administrador Secundario (Grupo)</option>
                                   {isSuperAdmin && <option value={UserRole.ADMIN}>Administrador Maestro</option>}
                                </select>
                                <select value={newUserGroup} onChange={e => setNewUserGroup(e.target.value)} className="p-4 bg-slate-950/50 border border-slate-800 rounded-2xl outline-none focus:border-blue-500 text-slate-400">
                                   <option value="">Asignar Grupo...</option>
                                   {groups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
                                </select>
                            </div>
                            <button onClick={handleRegisterUser} className="w-full py-4 bg-blue-600 text-white font-bold rounded-2xl hover:bg-blue-500 transition-colors">AUTORIZAR ACCESO</button>
                        </div>

                        <div className="space-y-4">
                           <h3 className="text-xs font-black text-slate-500 uppercase tracking-[0.2em]">Personal con Acceso Autorizado</h3>
                           <div className="grid gap-3">
                              {visibleUsers.map(u => (
                                <div key={u.uid} className="p-5 glass rounded-2xl flex items-center justify-between">
                                   <div className="flex items-center gap-4">
                                      <div className={cn("w-12 h-12 rounded-xl flex items-center justify-center font-bold text-white", u.role === UserRole.ADMIN ? "bg-amber-600" : "bg-blue-600")}>
                                        {u.displayName?.[0] || 'U'}
                                      </div>
                                      <div>
                                         <p className="font-black text-slate-100 uppercase">{u.displayName}</p>
                                         <p className="text-[10px] text-slate-500 font-bold">{u.email} • {u.role.toUpperCase()}</p>
                                      </div>
                                   </div>
                                   <button onClick={() => deleteUser(u.uid)} className="p-3 text-slate-500 hover:text-red-500 transition-colors"><Trash2 className="w-5 h-5"/></button>
                                </div>
                              ))}
                           </div>
                        </div>
                     </motion.div>
                   )}

                   {activeTab === 'monitor' && (
                     <motion.div key="monitor" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-8">
                        <div className="p-8 bg-red-600/10 border border-red-500/20 rounded-3xl space-y-2">
                           <div className="flex items-center gap-2 text-red-500">
                              <Shield className="w-5 h-5"/>
                              <h2 className="text-xl font-black">CENTRO DE MONITOREO GLOBAL</h2>
                           </div>
                           <p className="text-xs text-red-400 font-bold uppercase tracking-widest opacity-60 italic">Escucha y visualización de todos los grupos del sistema</p>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                           {groups.map(g => (
                             <div key={g.id} className="p-6 glass rounded-3xl flex items-center justify-between border-l-4 border-l-slate-800">
                                <div>
                                   <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest leading-none mb-1">Indicativo Canal</p>
                                   <p className="text-lg font-black text-slate-100">{g.name}</p>
                                </div>
                                <div className="flex items-center gap-3">
                                   <div className="w-2 h-2 bg-slate-800 rounded-full"/>
                                   <button className="px-4 py-2 bg-slate-800 text-[10px] font-black hover:bg-slate-700 rounded-full text-slate-300 transition-all">ESCUCHAR</button>
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
