import {
  initializeApp,
  getApps,
} from "https://www.gstatic.com/firebasejs/12.2.1/firebase-app.js";
import {
  getAuth,
  onAuthStateChanged,
} from "https://www.gstatic.com/firebasejs/12.2.1/firebase-auth.js";

const config = {
  apiKey: "AIzaSyCw0GNrUYIvwPYY5LpCgnuFYi7a903qAuE",
  authDomain: "aldhfyantree-f3273.firebaseapp.com",
  projectId: "aldhfyantree-f3273",
  appId: "1:436236972378:web:e57101eeb8c3b41a2b8363",
};
const app =
  getApps().find((item) => item.name === "[DEFAULT]") || initializeApp(config);
const button =
  document.querySelector("#headerAuthBtn") ||
  document.querySelector(".topbar > .primary.nav-link");
const admins = ["+966552806075", "+16505553434"];
onAuthStateChanged(getAuth(app), (user) => {
  if (!button) return;
  if (!user) {
    button.textContent = "تسجيل دخول";
    button.href = "index.html?login=1";
    return;
  }
  if (admins.includes(user.phoneNumber)) {
    button.textContent = "لوحة الإدارة";
    button.href = "index.html?review=1";
  } else {
    button.textContent = "حسابي";
    button.href = "index.html";
  }
});
