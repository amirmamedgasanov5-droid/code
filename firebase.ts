
import { initializeApp, getApps, getApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getDatabase } from "firebase/database";

// Main Firebase configuration: ar-ridwan-c32fc (Used for Auth, Journal, Schedule, Awards, Parent Portal, etc.)
const firebaseConfig = {
  apiKey: "AIzaSyACcFBTjiHZIJHeQb90JuzZqwpkJqaso7s",
  authDomain: "ar-ridwan-c32fc.firebaseapp.com",
  projectId: "ar-ridwan-c32fc",
  storageBucket: "ar-ridwan-c32fc.firebasestorage.app",
  messagingSenderId: "202224403778",
  appId: "1:202224403778:web:ecd0aa33cd0972a4a874db",
  measurementId: "G-HECRECG4L2"
};

// Secondary Firebase configuration: madrasa-lms-68dd5 (STRICTLY for books / library collection only)
const booksFirebaseConfig = {
  apiKey: "AIzaSyDaHf0HAvVgA6b1Oda11kj9RRGWPswVgEo",
  authDomain: "madrasa-lms-68dd5.firebaseapp.com",
  projectId: "madrasa-lms-68dd5",
  storageBucket: "madrasa-lms-68dd5.firebasestorage.app",
  messagingSenderId: "84954940809",
  appId: "1:84954940809:web:7d6e6c63a7933e68a0cd58",
  databaseURL: "https://madrasa-lms-68dd5-default-rtdb.firebaseio.com/"
};

// Initialize main app
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();

// Initialize secondary books app strictly for books
const booksApp = getApps().some(a => a.name === "booksApp") 
  ? getApp("booksApp") 
  : initializeApp(booksFirebaseConfig, "booksApp");

// Export main instances for general use (Auth, Main Database, Realtime DB)
export const auth = getAuth(app);
export const db = getFirestore(app);
export const rtdb = getDatabase(app);

// Export books database strictly for books collection
export const booksDb = getFirestore(booksApp);


