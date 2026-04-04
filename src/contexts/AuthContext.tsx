import React, { createContext, useContext, useEffect, useState } from 'react';
import { User, onAuthStateChanged } from 'firebase/auth';
import { auth, db } from '../firebase';
import { ref, get, set } from 'firebase/database';

interface AuthContextType {
  user: User | null;
  isAuthReady: boolean;
}

const AuthContext = createContext<AuthContextType>({ user: null, isAuthReady: false });

export const useAuth = () => useContext(AuthContext);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [isAuthReady, setIsAuthReady] = useState(false);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      
      if (currentUser) {
        // Ensure user profile exists in Realtime DB
        try {
          const userRef = ref(db, `users/${currentUser.uid}`);
          const userSnap = await get(userRef);
          
          if (!userSnap.exists()) {
            await set(userRef, {
              uid: currentUser.uid,
              email: currentUser.email,
              displayName: currentUser.displayName,
              createdAt: new Date().toISOString()
            });
          }
        } catch (error) {
          console.error("Error with user profile in Realtime DB:", error);
        }
      }
      
      setIsAuthReady(true);
    });

    return () => unsubscribe();
  }, []);

  return (
    <AuthContext.Provider value={{ user, isAuthReady }}>
      {children}
    </AuthContext.Provider>
  );
};
