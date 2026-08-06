// auth.js
import { db } from "./firebase-config.js";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { TrickLibrary } from "./library.js";
import { AppController } from "./app.js";

export const AuthSystem = {
    currentUser: null,
    init() {
        this.domLoginModal = document.getElementById('modal-login');
        this.domTrigger = document.getElementById('btn-login-trigger');
        this.domClose = document.getElementById('btn-login-close');
        this.domSubmit = document.getElementById('btn-login-submit');
        this.domStatus = document.getElementById('user-status');
        this.domError = document.getElementById('login-error');
        // 新增：登出按鈕（原本整個 app 完全沒有登出功能，一旦登入過就再也回不到訪客模式）
        this.domLogout = document.getElementById('btn-logout');

        if (this.domTrigger) this.domTrigger.addEventListener('click', () => this.openModal());
        if (this.domClose) this.domClose.addEventListener('click', () => this.closeModal());
        if (this.domSubmit) this.domSubmit.addEventListener('click', () => this.handleLogin());
        if (this.domLogout) this.domLogout.addEventListener('click', () => this.handleLogout());

        const lastUser = localStorage.getItem('kendama_last_user');
        if (lastUser) {
            this.loginAs(lastUser);
        } else {
            // 核心修正：沒登入時，直接使用本地 254 個招式驅動網頁，功能完全正常開放！
            if (this.domStatus) this.domStatus.innerText = "未登入";
            AppController.onUserSwitched();
        }
    },

    openModal() {
        // 有登入時才顯示登出按鈕
        if (this.domLogout) this.domLogout.classList.toggle('hidden', !this.currentUser);
        if (this.domError) this.domError.textContent = '';
        const passwordEl = document.getElementById('login-password');
        if (passwordEl) passwordEl.value = '';
        if (this.domLoginModal) this.domLoginModal.classList.remove('hidden');
    },
    closeModal() { if (this.domLoginModal) this.domLoginModal.classList.add('hidden'); },

    // 新增：Firestore 文件 ID 不可包含 "/"，也不能是空字串，
    // 原本完全沒有驗證，使用者輸入 "abc/def" 這類暱稱會直接讓 Firestore 寫入失敗，
    // 且沒有任何錯誤提示，使用者完全不知道進度沒被存到雲端。
    sanitizeUsername(raw) {
        let name = (raw || '').trim();
        name = name.replace(/[\/\.\#\$\[\]]/g, ''); // Firestore doc ID 禁用字元
        if (name.length > 20) name = name.slice(0, 20);
        return name;
    },

    // 新增：把密碼雜湊成 SHA-256（十六進位字串）再存到 Firestore，不會直接存明文密碼。
    // 提醒：這個專案沒有後端伺服器、也沒有接 Firebase Authentication，
    // Firestore 目前是開放讀寫的規則，所以這組密碼只能防止「別人不小心/隨手」用你的暱稱登入、
    // 蓋掉你的雲端進度，沒辦法防止真的懂得直接呼叫 Firestore API 的人繞過這層檢查。
    async hashPassword(password) {
        const encoder = new TextEncoder();
        const data = encoder.encode(password);
        const hashBuffer = await crypto.subtle.digest('SHA-256', data);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    },

    // 修正：登入方式從「只輸入暱稱」改成「暱稱 + 密碼」。
    // - 全新暱稱：直接用這組帳密註冊一個新帳號。
    // - 舊帳號但還沒設定過密碼：這次輸入的密碼直接設為這個帳號的登入密碼（等於幫舊帳號補設密碼）。
    // - 舊帳號已經有密碼：比對雜湊值，不符合就擋下來，不會讓人隨便打別人的暱稱就登入蓋掉資料。
    async handleLogin() {
        const usernameEl = document.getElementById('login-username');
        const passwordEl = document.getElementById('login-password');
        const raw = usernameEl ? usernameEl.value.trim() : "";
        const rawPassword = passwordEl ? passwordEl.value : "";

        if (this.domError) this.domError.textContent = '';

        if (!raw) { alert('請輸入暱稱！'); return; }
        if (!rawPassword) { alert('請輸入密碼！'); return; }

        const username = this.sanitizeUsername(raw);
        if (!username) {
            alert('暱稱含有不允許的字元（例如 / . # $ [ ]），請重新輸入！');
            return;
        }

        if (this.domSubmit) this.domSubmit.disabled = true;
        if (this.domError) this.domError.textContent = '驗證中...';

        try {
            const userDocRef = doc(db, "users", username);
            const userSnap = await getDoc(userDocRef);
            const passwordHash = await this.hashPassword(rawPassword);

            if (!userSnap.exists()) {
                // 全新帳號：直接用這組帳密註冊
                await setDoc(userDocRef, { passwordHash }, { merge: true });
            } else {
                const cloudData = userSnap.data();
                if (!cloudData.passwordHash) {
                    // 舊帳號還沒設定過密碼：把這次輸入的密碼補設為這個帳號的密碼
                    await setDoc(userDocRef, { passwordHash }, { merge: true });
                    if (this.domSubmit) this.domSubmit.disabled = false;
                    alert('這是還沒設定過密碼的舊帳號，已經把你剛剛輸入的密碼設為這個帳號的登入密碼，下次請用同一組密碼登入。');
                } else if (cloudData.passwordHash !== passwordHash) {
                    if (this.domSubmit) this.domSubmit.disabled = false;
                    if (this.domError) this.domError.textContent = '密碼錯誤，請再試一次';
                    return;
                }
            }

            if (this.domSubmit) this.domSubmit.disabled = false;
            if (this.domError) this.domError.textContent = '';
            this.loginAs(username);
            this.closeModal();
        } catch (e) {
            if (this.domSubmit) this.domSubmit.disabled = false;
            console.error('登入驗證失敗:', e);
            if (this.domError) this.domError.textContent = `登入時發生錯誤：${e && e.message ? e.message : e}`;
        }
    },

    // 新增：登出。回到訪客模式，並清空本地暫存與待儲存的計時器，
    // 避免登出後如果剛好有 debounce 儲存還沒送出，被誤存到「舊帳號」的雲端資料。
    async handleLogout() {
        if (!confirm('確定要登出嗎？登出後將以訪客模式使用（進度不會儲存）。')) return;
        await this.logout();
        this.closeModal();
    },

    async logout() {
        // 先把目前使用者還沒送出的計數存檔盡量存完，再切換身份
        if (this.currentUser) {
            await TrickLibrary.flushSave();
        }

        this.currentUser = null;
        window.currentUser = null;
        localStorage.removeItem('kendama_last_user');

        if (this.domStatus) this.domStatus.innerText = "未登入";
        if (this.domTrigger) this.domTrigger.innerText = "帳號登入";

        TrickLibrary.resetLocalTricks();
        AppController.onUserSwitched();
    },

    async loginAs(username) {
        // 修正：切換帳號前，先把「上一位使用者」還沒送出的 debounce 存檔強制送出。
        // 原本沒有這一步，如果剛按完 +1 還沒滿 800ms 就立刻切換帳號，
        // 待送出的計時器仍會用「新帳號的名字」把「舊帳號的資料」寫進 Firestore，造成資料錯置。
        if (this.currentUser && this.currentUser !== username) {
            await TrickLibrary.flushSave();
        }

        this.currentUser = username;
        window.currentUser = username;
        localStorage.setItem('kendama_last_user', username);

        if (this.domStatus) this.domStatus.innerText = `選手: ${username}`;
        if (this.domTrigger) this.domTrigger.innerText = `切換帳號`;

        try {
            // 1. 下載雲端次數並安全合流到目前的招式庫內
            const needsResave = await TrickLibrary.loadUserProgress(username);

            // 2. 修正：原本不論如何都會立刻重新上傳一次，等於每次登入都多打一次 Firestore。
            // 現在只在「真的需要」時才寫回（全新帳號 or 雲端招式數量比本地舊，代表要升級舊帳號資料結構）。
            if (needsResave) {
                await TrickLibrary.saveUserProgress(username);
            }

            AppController.onUserSwitched();
        } catch (error) {
            console.error("帳號切換加載失敗:", error);
            AppController.onUserSwitched();
        }
    }
};
