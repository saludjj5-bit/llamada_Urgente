import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword, signOut, onAuthStateChanged, User } from 'firebase/auth';
import { getFirestore, doc, getDoc, setDoc, updateDoc, deleteDoc, serverTimestamp, collection, query, where, getDocs } from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);

export enum UserRole {
  ADMIN = 'admin',
  ADMIN2 = 'admin2',
  USUARIO = 'usuario'
}

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  throw new Error(error instanceof Error ? error.message : String(error));
}

export interface UserProfile {
  uid: string;
  email: string;
  displayName: string | null;
  role: UserRole;
  groupId: string | null;
  isTalking?: boolean;
  isOnline?: boolean;
  createdAt: any;
}

export const signIn = async (email: string, pass: string) => {
  try {
    const result = await signInWithEmailAndPassword(auth, email, pass);
    const user = result.user;
    
    const isPrimaryAdmin = user.email === 'saludjj5@gmail.com';
    const userDocRef = doc(db, 'users', user.uid);
    let userDoc;
    try {
      userDoc = await getDoc(userDocRef);
    } catch (err) {
      return handleFirestoreError(err, OperationType.GET, `users/${user.uid}`);
    }
    
    if (!userDoc.exists()) {
      const userEmail = user.email?.toLowerCase().trim();
      if (!userEmail && !isPrimaryAdmin) {
        await signOut(auth);
        throw new Error("No se pudo obtener el correo.");
      }

      const usersRef = collection(db, 'users');
      const q = query(usersRef, where('email', '==', userEmail));
      const querySnapshot = await getDocs(q);
      
      if (!querySnapshot.empty) {
        const existingDoc = querySnapshot.docs[0];
        const existingData = existingDoc.data();
        
        await deleteDoc(doc(db, 'users', existingDoc.id));
        await setDoc(userDocRef, {
          ...existingData,
          uid: user.uid,
          displayName: user.displayName || email.split('@')[0],
          createdAt: existingData.createdAt || serverTimestamp()
        });
      } else if (isPrimaryAdmin) {
        await setDoc(userDocRef, {
          uid: user.uid,
          email: user.email,
          displayName: 'Admin Principal',
          role: UserRole.ADMIN,
          createdAt: serverTimestamp()
        });
      } else {
        await signOut(auth);
        throw new Error("Acceso denegado. Tu correo no ha sido autorizado por un administrador.");
      }
    } else {
       const data = userDoc.data();
       if (isPrimaryAdmin && data.role !== UserRole.ADMIN) {
         await updateDoc(userDocRef, { role: UserRole.ADMIN });
       }
    }
    
    return user;
  } catch (error: any) {
    if (error.code === 'auth/invalid-credential' || error.code === 'auth/user-not-found' || error.code === 'auth/wrong-password') {
      throw new Error("Correo o contraseña incorrectos.");
    }
    throw new Error(error.message || "Error al iniciar sesión.");
  }
};

export const logOut = () => signOut(auth);

// FUNCIONES DE GESTIÓN (ADMIN)
export const createGroup = async (name: string, parentGroupId: string | null = null) => {
  const groupRef = doc(collection(db, 'groups'));
  await setDoc(groupRef, { id: groupRef.id, name, parentGroupId, createdAt: serverTimestamp() });
  return groupRef.id;
};

export const deleteGroup = (id: string) => deleteDoc(doc(db, 'groups', id));

export const updateGroup = (id: string, name: string) => updateDoc(doc(db, 'groups', id), { name });

export const preRegisterUser = async (email: string, displayName: string, role: UserRole, groupId: string | null) => {
  const userRef = doc(collection(db, 'users'));
  await setDoc(userRef, { 
    email: email.toLowerCase().trim(), 
    displayName, 
    role, 
    groupId, 
    createdAt: serverTimestamp() 
  });
};

export const deleteUser = (uid: string) => deleteDoc(doc(db, 'users', uid));

export const updateUserProfile = (uid: string, data: Partial<UserProfile>) => updateDoc(doc(db, 'users', uid), data);

export { onAuthStateChanged, type User };
