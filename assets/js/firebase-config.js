// Import the functions you need from the SDKs you need
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { getDatabase, ref, set, get, child } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js";

// Your web app's Firebase configuration
const firebaseConfig = {
    apiKey: "AIzaSyClnebKYLp3nVI5izrYqNb5GnTOKADFzOE",
    authDomain: "gamanager-90624.firebaseapp.com",
    databaseURL: "https://gamanager-90624-default-rtdb.asia-southeast1.firebasedatabase.app",
    projectId: "gamanager-90624",
    storageBucket: "gamanager-90624.firebasestorage.app",
    messagingSenderId: "281844737898",
    appId: "1:281844737898:web:9c20d6ceac7798f8176713"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const database = getDatabase(app);
const provider = new GoogleAuthProvider();

export { auth, database, provider, signInWithPopup, signOut, onAuthStateChanged, ref, set, get, child };
