import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

// As suas credenciais reais do Firebase
const firebaseConfig = {
  apiKey: "AIzaSyBtQJlHjNnOfzAgPFEkTODHprfbpOZXHD0",
  authDomain: "rifa2026-6dbf3.firebaseapp.com",
  projectId: "rifa2026-6dbf3",
  storageBucket: "rifa2026-6dbf3.firebasestorage.app",
  messagingSenderId: "606975394278",
  appId: "1:606975394278:web:e9015f74a1863b4f751627",
  measurementId: "G-34MQLW2GKD"
};

// Inicializar o Firebase
const app = initializeApp(firebaseConfig);

// Exportar as ferramentas que vamos usar nos outros ficheiros
export const auth = getAuth(app);
export const db = getFirestore(app);

console.log("🔥 Ligação ao Firebase estabelecida com sucesso!");