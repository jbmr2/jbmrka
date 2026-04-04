import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut } from 'firebase/auth';
import { getDatabase } from 'firebase/database';
import { getStorage } from 'firebase/storage';

const firebaseConfig = {
  apiKey: "AIzaSyDhcJoxezAZApJijfjjDVBta8kdo_gx56c",
  authDomain: "jbmrscoretech-kabadi.firebaseapp.com",
  databaseURL: "https://jbmrscoretech-kabadi-default-rtdb.firebaseio.com",
  projectId: "jbmrscoretech-kabadi",
  storageBucket: "jbmrscoretech-kabadi.firebasestorage.app",
  messagingSenderId: "860115216622",
  appId: "1:860115216622:web:b71eff56a06baaa4246bff"
};

const app = initializeApp(firebaseConfig);
export const db = getDatabase(app);
export const auth = getAuth(app);
export const storage = getStorage(app);

export const loginWithGoogle = async () => {
  const provider = new GoogleAuthProvider();
  try {
    await signInWithPopup(auth, provider);
  } catch (error) {
    console.error("Error signing in with Google", error);
    throw error;
  }
};

export const logout = async () => {
  try {
    await signOut(auth);
  } catch (error) {
    console.error("Error signing out", error);
    throw error;
  }
};

