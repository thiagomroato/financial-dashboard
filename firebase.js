import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const firebaseConfig = {
   apiKey: "AIzaSyChd7Fs6qstzc3uMdOrcoC-4KMWH24MqZw",
  authDomain: "financial-dashboard-a2b16.firebaseapp.com",
  projectId: "financial-dashboard-a2b16",
  storageBucket: "financial-dashboard-a2b16.firebasestorage.app",
  messagingSenderId: "538205467615",
  appId: "1:538205467615:web:24326fa7f323902059ca6a",
  measurementId: "G-6JXMBQH9G1"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);

{
  "functions": [
    {
      "source": "functions"
    }
  ]
}
