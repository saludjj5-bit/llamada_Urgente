import { useState, useEffect } from 'react';
import { db, UserRole, UserProfile, handleFirestoreError, OperationType } from '../firebase';
import { collection, onSnapshot, doc, updateDoc, deleteDoc, query, orderBy, addDoc, serverTimestamp } from 'firebase/firestore';
import { Shield, ShieldAlert, ShieldCheck, User as UserIcon, Trash2, X, Check, Users, Plus, Info, UserPlus, Edit2 } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../lib/utils';

interface Group {
  id: string;
  name: string;
  description?: string;
  parentGroupId?: string | null;
  createdAt: any;
}

interface AdminPanelProps {
  onClose: () => void;
  currentUserRole: UserRole | null;
  currentUserGroupId: string | null;
}

export default function AdminPanel({ onClose, currentUserRole, currentUserGroupId }: AdminPanelProps) {
  const [activeTab, setActiveTab] = useState<'users' | 'groups'>('users');
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [loading, setLoading] = useState(true);
  
  // User creation state
  const [newUserEmail, setNewUserEmail] = useState('');
  const [newUserRole, setNewUserRole] = useState<UserRole>(UserRole.USUARIO);
  const [newUserGroup, setNewUserGroup] = useState('none');
  const [isAddingUser, setIsAddingUser] = useState(false);
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');

  // Group creation state
  const [newGroupName, setNewGroupName] = useState('');
  const [isCreatingGroup, setIsCreatingGroup] = useState(false);
  const [editingGroupId, setEditingGroupId] = useState<string | null>(null);
  const [editGroupName, setEditGroupName] = useState('');
  const [expandedGroupId, setExpandedGroupId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    if (success || error) {
      const timer = setTimeout(() => {
        setSuccess(null);
        setError(null);
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [success, error]);

  useEffect(() => {
    const qUsers = query(collection(db, 'users'), orderBy('createdAt', 'desc'));
    const unsubUsers = onSnapshot(qUsers, (snapshot) => {
      const usersData = snapshot.docs.map(doc => {
        const data = doc.data();
        return {
          ...data,
          uid: doc.id, // Use document ID as UID for the list
          actualUid: data.uid // Keep the actual auth UID if it exists
        };
      }) as any[];
      setUsers(usersData);
    });

    const qGroups = query(collection(db, 'groups'), orderBy('createdAt', 'desc'));
    const unsubGroups = onSnapshot(qGroups, (snapshot) => {
      const groupsData = snapshot.docs.map(doc => ({
        ...doc.data(),
        id: doc.id
      })) as Group[];
      setGroups(groupsData);
      setLoading(false);
    });

    return () => {
      unsubUsers();
      unsubGroups();
    };
  }, []);

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newUserEmail.trim()) return;

    try {
      const groupToAssign = currentUserRole === UserRole.ADMIN2 ? currentUserGroupId : (newUserGroup === 'none' ? null : newUserGroup);
      
      await addDoc(collection(db, 'users'), {
        email: newUserEmail.toLowerCase().trim(),
        role: newUserRole,
        groupId: groupToAssign,
        uid: null, // Allow null initially
        displayName: null,
        createdAt: serverTimestamp()
      });
      setNewUserEmail('');
      setIsAddingUser(false);
      setSuccess("Usuario autorizado con éxito.");
    } catch (err: any) {
      handleFirestoreError(err, OperationType.CREATE, 'users');
    }
  };

  const handleUpdateRole = async (uid: string, newRole: UserRole) => {
    try {
      await updateDoc(doc(db, 'users', uid), { role: newRole });
    } catch (error) {
      console.error("Error updating role:", error);
    }
  };

  const handleUpdateName = async (uid: string) => {
    if (!editName.trim()) return;
    try {
      await updateDoc(doc(db, 'users', uid), { displayName: editName.trim() });
      setEditingUserId(null);
      setSuccess("Nombre actualizado.");
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `users/${uid}`);
    }
  };

  const handleUpdateGroup = async (uid: string, groupId: string) => {
    try {
      await updateDoc(doc(db, 'users', uid), {
        groupId: groupId === 'none' ? null : groupId
      });
    } catch (error) {
      console.error("Error updating group:", error);
    }
  };

  const handleDeleteUser = async (uid: string) => {
    try {
      await deleteDoc(doc(db, 'users', uid));
      setSuccess("Usuario eliminado.");
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `users/${uid}`);
    }
  };

  const handleCreateGroup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newGroupName.trim()) return;
    try {
      const docRef = await addDoc(collection(db, 'groups'), {
        name: newGroupName,
        parentGroupId: currentUserRole === UserRole.ADMIN2 ? currentUserGroupId : null,
        createdAt: serverTimestamp()
      });
      await updateDoc(docRef, { id: docRef.id });
      setNewGroupName('');
      setIsCreatingGroup(false);
      setSuccess("Grupo creado.");
    } catch (err: any) {
      handleFirestoreError(err, OperationType.CREATE, 'groups');
    }
  };

  const handleDeleteGroup = async (id: string) => {
    try {
      const usersInGroup = users.filter(u => (u as any).groupId === id);
      for (const u of usersInGroup) {
        await updateDoc(doc(db, 'users', u.uid), { groupId: null });
      }
      await deleteDoc(doc(db, 'groups', id));
      setSuccess("Grupo eliminado.");
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `groups/${id}`);
    }
  };

  const handleUpdateGroupName = async (groupId: string) => {
    if (!editGroupName.trim()) return;
    try {
      await updateDoc(doc(db, 'groups', groupId), {
        name: editGroupName,
      });
      setEditingGroupId(null);
      setSuccess("Nombre de grupo actualizado.");
    } catch (err: any) {
      handleFirestoreError(err, OperationType.UPDATE, `groups/${groupId}`);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center p-2 bg-black/40 backdrop-blur-sm"
    >
      <div className="bg-white w-full max-w-md rounded-2xl border border-gray-200 shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header - Compact */}
        <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between bg-gray-50">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-blue-600" />
            <h2 className="text-sm font-bold uppercase tracking-wider text-gray-900">Admin</h2>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100">
            <X className="w-4 h-4 text-gray-400" />
          </button>
        </div>

        {/* Tabs - Compact */}
        <div className="flex p-1 bg-gray-100 border-b border-gray-200">
          <button
            onClick={() => setActiveTab('users')}
            className={cn(
              "flex-1 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-widest transition-all",
              activeTab === 'users' ? "bg-white text-gray-900 shadow-sm" : "text-gray-400"
            )}
          >
            Usuarios
          </button>
          {(currentUserRole === UserRole.ADMIN || currentUserRole === UserRole.ADMIN2) && (
            <button
              onClick={() => setActiveTab('groups')}
              className={cn(
                "flex-1 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-widest transition-all",
                activeTab === 'groups' ? "bg-white text-gray-900 shadow-sm" : "text-gray-400"
              )}
            >
              Grupos
            </button>
          )}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-3 space-y-4 relative">
          <AnimatePresence>
            {success && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="absolute top-2 left-3 right-3 z-10 bg-green-500/90 text-white text-[10px] font-bold py-1.5 px-3 rounded-lg shadow-lg flex items-center gap-2"
              >
                <Check className="w-3 h-3" />
                {success}
              </motion.div>
            )}
            {error && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="absolute top-2 left-3 right-3 z-10 bg-red-500/90 text-white text-[10px] font-bold py-1.5 px-3 rounded-lg shadow-lg flex items-center gap-2"
              >
                <ShieldAlert className="w-3 h-3" />
                {error}
              </motion.div>
            )}
          </AnimatePresence>

          {loading ? (
            <div className="flex justify-center py-8">
              <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : activeTab === 'users' ? (
            <div className="space-y-3">
              {/* Add User Form */}
              {!isAddingUser ? (
                <button
                  onClick={() => setIsAddingUser(true)}
                  className="w-full py-2 border border-dashed border-gray-200 rounded-xl text-[10px] font-bold uppercase tracking-widest text-gray-400 hover:text-blue-600 hover:border-blue-500/40 transition-all flex items-center justify-center gap-2"
                >
                  <UserPlus className="w-3 h-3" />
                  Autorizar Usuario
                </button>
              ) : (
                <form onSubmit={handleCreateUser} className="bg-blue-50 border border-blue-100 rounded-xl p-3 space-y-2">
                  <input
                    type="email"
                    placeholder="Correo electrónico"
                    value={newUserEmail}
                    onChange={(e) => setNewUserEmail(e.target.value)}
                    className="w-full bg-white border border-gray-200 rounded-lg px-3 py-1.5 text-xs outline-none focus:border-blue-500/50"
                    autoFocus
                  />
                    <div className="flex gap-2">
                      <select
                        value={newUserRole}
                        onChange={(e) => setNewUserRole(e.target.value as UserRole)}
                        className="flex-1 bg-white border border-gray-200 rounded-lg px-2 py-1.5 text-[10px] font-bold outline-none"
                      >
                        {currentUserRole === UserRole.ADMIN && <option value={UserRole.ADMIN}>Admin</option>}
                        <option value={UserRole.ADMIN2}>Admin 2</option>
                        <option value={UserRole.USUARIO}>Usuario</option>
                      </select>
                      {currentUserRole === UserRole.ADMIN ? (
                        <select
                          value={newUserGroup}
                          onChange={(e) => setNewUserGroup(e.target.value)}
                          className="flex-1 bg-white border border-gray-200 rounded-lg px-2 py-1.5 text-[10px] font-bold outline-none"
                        >
                          <option value="none">Sin Grupo</option>
                          {groups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
                        </select>
                      ) : (
                        <div className="flex-1 bg-white border border-gray-200 rounded-lg px-2 py-1.5 text-[10px] font-bold text-gray-400 flex items-center">
                          {groups.find(g => g.id === currentUserGroupId)?.name || "Sin Grupo"}
                        </div>
                      )}
                    </div>
                  <div className="flex gap-2 pt-1">
                    <button type="submit" className="flex-1 py-1.5 bg-blue-600 text-white text-[10px] font-bold rounded-lg uppercase shadow-lg shadow-blue-500/20">Añadir</button>
                    <button type="button" onClick={() => setIsAddingUser(false)} className="px-3 py-1.5 bg-gray-100 text-gray-500 text-[10px] font-bold rounded-lg uppercase">Cancelar</button>
                  </div>
                </form>
              )}

              {/* Users List - Very Compact */}
              <div className="space-y-1.5">
                {users
                  .filter(u => currentUserRole === UserRole.ADMIN || (u as any).groupId === currentUserGroupId)
                  .map((u) => (
                    <div key={u.uid} className="bg-gray-50 border border-gray-100 rounded-xl p-2 flex flex-col gap-2">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <div className="w-6 h-6 rounded-full bg-white border border-gray-100 flex items-center justify-center flex-shrink-0 relative">
                            <UserIcon className="w-3 h-3 text-gray-400" />
                            {u.isTalking && (
                              <div className="absolute -top-1 -right-1 w-2 h-2 bg-blue-500 rounded-full border border-white animate-pulse" title="Hablando" />
                            )}
                            {!(u as any).actualUid && !u.isTalking && (
                              <div className="absolute -top-1 -right-1 w-2 h-2 bg-yellow-500 rounded-full border border-white" title="Pendiente de ingreso" />
                            )}
                          </div>
                          <div className="min-w-0 flex-1">
                            {editingUserId === u.uid ? (
                              <div className="flex gap-1 items-center">
                                <input
                                  type="text"
                                  value={editName}
                                  onChange={(e) => setEditName(e.target.value)}
                                  className="flex-1 bg-white border border-blue-500/50 rounded px-2 py-0.5 text-[10px] outline-none"
                                  autoFocus
                                  onKeyDown={(e) => e.key === 'Enter' && handleUpdateName(u.uid)}
                                />
                                <button onClick={() => handleUpdateName(u.uid)} className="p-1 text-green-600">
                                  <Check className="w-3 h-3" />
                                </button>
                                <button onClick={() => setEditingUserId(null)} className="p-1 text-red-400">
                                  <X className="w-3 h-3" />
                                </button>
                              </div>
                            ) : (
                              <p 
                                className="text-[10px] font-bold truncate leading-tight text-gray-900 cursor-pointer hover:text-blue-600 flex items-center gap-1"
                                onClick={() => {
                                  setEditingUserId(u.uid);
                                  setEditName(u.displayName || u.email.split('@')[0]);
                                }}
                              >
                                {u.displayName || u.email.split('@')[0]}
                                {!(u as any).actualUid && <span className="ml-1 text-[8px] text-yellow-600 font-normal">(Pendiente)</span>}
                                <Plus className="w-2 h-2 opacity-0 group-hover:opacity-100" />
                              </p>
                            )}
                            <p className="text-[8px] text-gray-400 truncate leading-tight">{u.email}</p>
                          </div>
                        </div>
                        <button onClick={() => handleDeleteUser(u.uid)} className="p-1.5 text-red-500/40 hover:text-red-500">
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                      <div className="flex gap-1.5">
                        <select
                          value={u.role}
                          onChange={(e) => handleUpdateRole(u.uid, e.target.value as UserRole)}
                          disabled={currentUserRole === UserRole.ADMIN2 && u.role === UserRole.ADMIN}
                          className="flex-1 bg-white border border-gray-200 rounded-lg px-2 py-1 text-[9px] font-bold outline-none"
                        >
                          {currentUserRole === UserRole.ADMIN && <option value={UserRole.ADMIN}>Admin</option>}
                          <option value={UserRole.ADMIN2}>Admin 2</option>
                          <option value={UserRole.USUARIO}>Usuario</option>
                        </select>
                        {currentUserRole === UserRole.ADMIN ? (
                          <select
                            value={(u as any).groupId || 'none'}
                            onChange={(e) => handleUpdateGroup(u.uid, e.target.value)}
                            className="flex-1 bg-white border border-gray-200 rounded-lg px-2 py-1 text-[9px] font-bold outline-none"
                          >
                            <option value="none">Sin Grupo</option>
                            {groups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
                          </select>
                        ) : (
                          <div className="flex-1 bg-white border border-gray-200 rounded-lg px-2 py-1 text-[9px] font-bold text-gray-400 flex items-center">
                            {groups.find(g => g.id === (u as any).groupId)?.name || "Sin Grupo"}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {!isCreatingGroup ? (
                <button
                  onClick={() => setIsCreatingGroup(true)}
                  className="w-full py-2 border border-dashed border-gray-200 rounded-xl text-[10px] font-bold uppercase tracking-widest text-gray-400 hover:text-purple-600 transition-all flex items-center justify-center gap-2"
                >
                  <Plus className="w-3 h-3" />
                  Nuevo Grupo
                </button>
              ) : (
                <form onSubmit={handleCreateGroup} className="bg-purple-50 border border-purple-100 rounded-xl p-3 space-y-2">
                  <input
                    type="text"
                    placeholder="Nombre del grupo"
                    value={newGroupName}
                    onChange={(e) => setNewGroupName(e.target.value)}
                    className="w-full bg-white border border-gray-200 rounded-lg px-3 py-1.5 text-xs outline-none focus:border-purple-500/50"
                    autoFocus
                  />
                  <div className="flex gap-2">
                    <button type="submit" className="flex-1 py-1.5 bg-purple-600 text-white text-[10px] font-bold rounded-lg uppercase shadow-lg shadow-purple-500/20">Crear</button>
                    <button type="button" onClick={() => setIsCreatingGroup(false)} className="px-3 py-1.5 bg-gray-100 text-gray-500 text-[10px] font-bold rounded-lg uppercase">X</button>
                  </div>
                </form>
              )}

              <div className="space-y-1.5">
                {groups
                  .filter(g => currentUserRole === UserRole.ADMIN || g.id === currentUserGroupId || g.parentGroupId === currentUserGroupId)
                  .map((g) => {
                    const groupMembers = users.filter(u => (u as any).groupId === g.id);
                    return (
                      <div key={g.id} className="bg-gray-50 border border-gray-100 rounded-xl p-2 space-y-2">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2 min-w-0 flex-1">
                            <Users className="w-3 h-3 text-purple-600 flex-shrink-0" />
                            {editingGroupId === g.id ? (
                              <div className="flex items-center gap-1 flex-1">
                                <input
                                  type="text"
                                  value={editGroupName}
                                  onChange={(e) => setEditGroupName(e.target.value)}
                                  className="flex-1 bg-white border border-purple-200 rounded px-2 py-0.5 text-[10px] outline-none"
                                  autoFocus
                                />
                                <button onClick={() => handleUpdateGroupName(g.id)} className="p-1 text-green-600 hover:bg-green-50 rounded">
                                  <ShieldCheck className="w-3 h-3" />
                                </button>
                                <button onClick={() => setEditingGroupId(null)} className="p-1 text-gray-400 hover:bg-gray-100 rounded">
                                  X
                                </button>
                              </div>
                            ) : (
                              <div className="flex flex-col min-w-0">
                                <div className="flex items-center gap-2">
                                  <span className="text-[10px] font-bold text-gray-900 truncate">{g.name}</span>
                                  <button 
                                    onClick={() => {
                                      setEditingGroupId(g.id);
                                      setEditGroupName(g.name);
                                    }}
                                    className="p-1 text-gray-300 hover:text-purple-600 transition-colors"
                                  >
                                    <Edit2 className="w-2.5 h-2.5" />
                                  </button>
                                </div>
                                {g.parentGroupId && (
                                  <span className="text-[7px] text-purple-400 font-black uppercase tracking-tighter">Sub-grupo</span>
                                )}
                              </div>
                            )}
                          </div>
                          <div className="flex items-center gap-1">
                            <button 
                              onClick={() => setExpandedGroupId(expandedGroupId === g.id ? null : g.id)}
                              className="p-1.5 text-gray-400 hover:text-purple-600 transition-colors"
                              title="Ver integrantes"
                            >
                              <UserIcon className="w-3 h-3" />
                              <span className="text-[8px] ml-0.5 font-bold">{groupMembers.length}</span>
                            </button>
                            {(currentUserRole === UserRole.ADMIN || g.parentGroupId === currentUserGroupId) && (
                              <button onClick={() => handleDeleteGroup(g.id)} className="p-1.5 text-red-500/40 hover:text-red-500">
                                <Trash2 className="w-3 h-3" />
                              </button>
                            )}
                          </div>
                        </div>

                        {/* Members List */}
                        <AnimatePresence>
                          {expandedGroupId === g.id && (
                            <motion.div
                              initial={{ height: 0, opacity: 0 }}
                              animate={{ height: 'auto', opacity: 1 }}
                              exit={{ height: 0, opacity: 0 }}
                              className="overflow-hidden"
                            >
                              <div className="pt-2 border-t border-gray-100 space-y-1">
                                {groupMembers.length > 0 ? (
                                  groupMembers.map(m => (
                                    <div key={m.uid} className="flex items-center justify-between px-2 py-1 bg-white rounded-lg border border-gray-50">
                                      <div className="flex items-center gap-2">
                                        <div className={cn(
                                          "w-1.5 h-1.5 rounded-full",
                                          (m as any).isTalking ? "bg-blue-500 animate-pulse" : "bg-gray-200"
                                        )} />
                                        <span className="text-[9px] text-gray-600 font-medium">
                                          {m.displayName || m.email.split('@')[0]}
                                        </span>
                                      </div>
                                      <span className="text-[7px] text-gray-300 uppercase font-bold">{(m as any).role}</span>
                                    </div>
                                  ))
                                ) : (
                                  <p className="text-[8px] text-gray-400 italic text-center py-1">Sin integrantes</p>
                                )}
                              </div>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                    );
                  })}
              </div>
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
}
