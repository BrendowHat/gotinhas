// Configuração pública do projeto Firebase (pode ficar visível; quem protege os dados são as regras do Firestore).
export const firebaseConfig = {
  apiKey: "AIzaSyDuXbHdkAHeqvbh7QIHGR1zEv5nIb841rQ",
  authDomain: "gotinhas-7b7b9.firebaseapp.com",
  projectId: "gotinhas-7b7b9",
  storageBucket: "gotinhas-7b7b9.firebasestorage.app",
  messagingSenderId: "881824784295",
  appId: "1:881824784295:web:7bf3e547a26e814c956082",
};

// Fase 2 (notificações). Deixe vazio até configurar:
// vapidKey  → Firebase → Configurações do projeto → Cloud Messaging → Certificados push da Web → "Par de chaves"
// workerUrl → endereço do Worker no Cloudflare, ex.: https://gotinhas.SEU-USUARIO.workers.dev
export const vapidKey = "BCIwmIMFoHHDbDveZocjUYbZDjLHXOJelCKp5HJKZ83JLcwqvAIxZ666a8qcbPiAKUg2yrdlZEqWzE-9xZnwen8";
export const workerUrl = "";
