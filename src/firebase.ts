import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged, User } from 'firebase/auth';
import { getFirestore, doc, getDoc, setDoc, updateDoc, deleteDoc, serverTimestamp, onSnapshot, collection, query, where, getDocs } from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const googleProvider = new GoogleAuthProvider();

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

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId: string | undefined;
    email: string | null | undefined;
    emailVerified: boolean | undefined;
    isAnonymous: boolean | undefined;
    providerInfo: any[];
  }
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      providerInfo: auth.currentUser?.providerData.map(provider => ({
        providerId: provider.providerId,
        displayName: provider.displayName,
        email: provider.email,
        photoUrl: provider.photoURL
      })) || []
    },
    operationType,
    path
  }
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

export interface UserProfile {
  uid: string;
  email: string;
  displayName: string | null;
  role: UserRole;
  groupId: string | null;
  isTalking?: boolean;
  createdAt: any;
}

export const signIn = async () => {
  try {
    const result = await signInWithPopup(auth, googleProvider);
    const user = result.user;
    
    // Check if user is the primary admin
    const isPrimaryAdmin = user.email === 'saludjj5@gmail.com';
    
    // Check if user profile exists by UID
    const userDocRef = doc(db, 'users', user.uid);
    let userDoc;
    try {
      userDoc = await getDoc(userDocRef);
    } catch (err) {
      return handleFirestoreError(err, OperationType.GET, `users/${user.uid}`);
    }
    
    // If not found by UID, check if there's a pre-authorized user by email
    if (!userDoc.exists()) {
      const userEmail = user.email?.toLowerCase().trim();
      if (!userEmail && !isPrimaryAdmin) {
        await signOut(auth);
        throw new Error("No se pudo obtener el correo de tu cuenta de Google.");
      }

      const usersRef = collection(db, 'users');
      const q = query(usersRef, where('email', '==', userEmail));
      let querySnapshot;
      try {
        querySnapshot = await getDocs(q);
      } catch (err) {
        return handleFirestoreError(err, OperationType.LIST, 'users');
      }
      
      if (!querySnapshot.empty) {
        // Found a pre-authorized user! Update it with the UID
        const existingDoc = querySnapshot.docs[0];
        const existingData = existingDoc.data();
        
        try {
          // We delete the old doc (which might have a random ID) and create a new one with UID
          await deleteDoc(doc(db, 'users', existingDoc.id));
          await setDoc(userDocRef, {
            ...existingData,
            uid: user.uid,
            displayName: user.displayName,
            createdAt: existingData.createdAt || serverTimestamp()
          });
        } catch (err) {
          return handleFirestoreError(err, OperationType.WRITE, `users/${user.uid}`);
        }
      } else if (isPrimaryAdmin) {
        // Auto-create for primary admin if not exists
        try {
          await setDoc(userDocRef, {
            uid: user.uid,
            email: user.email,
            displayName: user.displayName,
            role: UserRole.ADMIN,
            createdAt: serverTimestamp()
          });
        } catch (err) {
          return handleFirestoreError(err, OperationType.CREATE, `users/${user.uid}`);
        }
      } else {
        // Not authorized
        await signOut(auth);
        throw new Error("Acceso denegado. Tu correo no ha sido autorizado por un administrador.");
      }
    } else {
      // User exists, check if primary admin needs role update
      const data = userDoc.data();
      if (isPrimaryAdmin && data.role !== UserRole.ADMIN) {
        try {
          await updateDoc(userDocRef, { role: UserRole.ADMIN });
        } catch (err) {
          return handleFirestoreError(err, OperationType.UPDATE, `users/${user.uid}`);
        }
      }
    }
    
    return user;
  } catch (error: any) {
    if (error.code === 'auth/popup-closed-by-user') {
      throw new Error("La ventana de inicio de sesión fue cerrada.");
    }
    console.error("Error signing in:", error);
    throw error;
  }
};

export const logOut = () => signOut(auth);
