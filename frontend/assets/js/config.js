// Impostazioni pubbliche dell'app. Qui non vanno mai chiavi segrete o credenziali.
// La chiave web di Firebase non e' un segreto: la sicurezza e' data dai domini autorizzati e dalle verifiche del backend.
window.CYBER_PULSE_CONFIG = Object.freeze({
  backendUrl: "https://script.google.com/macros/s/AKfycbwyAaAf8cYI2UjkHPqBl3VH2RAbTVTUYCckcBfJy3ZdeuGW9POdFfuamkULRHkyVVUP/exec",
  pageSize: 30,
  firebase: Object.freeze({
    apiKey: "AIzaSyDW0q-2X7HCo7R_OJJsrRJNakshwzCHOGE",
    authDomain: "cyber-pulse-signandlogin.firebaseapp.com",
    projectId: "cyber-pulse-signandlogin",
    storageBucket: "cyber-pulse-signandlogin.firebasestorage.app",
    messagingSenderId: "73616763362",
    appId: "1:73616763362:web:b0e639a23fa5c79881b1bb",
  }),
  firebaseSdkUrl: "https://www.gstatic.com/firebasejs/11.0.2/",
});
