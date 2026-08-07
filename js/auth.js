// auth.js
import { db, auth } from "./firebase-config.js";
import { doc, getDoc } from "firebase/firestore";
import {
    onAuthStateChanged,
    signInWithEmailAndPassword,
    createUserWithEmailAndPassword,
    signOut
} from "firebase/auth";
import { TrickLibrary } from "./library.js";
import { AppController } from "./app.js";

// 這個 app 本來就是用「暱稱」當作雲端資料的識別碼（Firestore 文件 ID），
// 不是用電子郵件。改接 Firebase Authentication 之後，為了不用改動既有的資料結構
// （招式進度、對戰對手查詢都還是照暱稱查 users/{暱稱}），改成幫每個暱稱組一個
// 「暱稱@kendama.local」這樣格式正確、但不是真的信箱的帳號給 Firebase Authentication 用；
// 暱稱本身依然是 Firestore 文件 ID，兩邊的字串完全一致，方便之後在 Firestore 安全性規則裡
// 直接比對 request.auth.token.email == (暱稱 + '@kendama.local') 來限制只有本人能寫入。
const EMAIL_DOMAIN = '@kendama.local';

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

        // 改用 Firebase Authentication 自己的登入狀態監聽器，取代原本自己用 localStorage
        // 記錄「上次登入的人」。瀏覽器重新整理、關掉再打開，只要 Firebase 的登入 session
        // 還在，這裡就會自動觸發並幫你登入；登出時也會自動觸發、切回訪客模式。
        onAuthStateChanged(auth, (user) => {
            if (user && user.email) {
                const nickname = this.emailToNickname(user.email);
                this.loginAs(nickname);
            } else {
                this.currentUser = null;
                window.currentUser = null;
                if (this.domStatus) this.domStatus.innerText = "未登入";
                if (this.domTrigger) this.domTrigger.innerText = "帳號登入";
                TrickLibrary.resetLocalTricks();
                AppController.onUserSwitched();
            }
        });
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

    nicknameToEmail(nickname) {
        return `${nickname}${EMAIL_DOMAIN}`;
    },

    emailToNickname(email) {
        return email.endsWith(EMAIL_DOMAIN) ? email.slice(0, -EMAIL_DOMAIN.length) : email;
    },

    // 新增：把 Firebase Authentication 回傳的錯誤代碼轉成看得懂的中文訊息
    formatAuthError(e) {
        if (e && e.message === '__WRONG_PASSWORD__') return '密碼錯誤，請再試一次';
        const code = e && e.code;
        if (code === 'auth/weak-password') return '密碼至少要 6 個字元';
        if (code === 'auth/invalid-email') return '暱稱包含 Firebase 帳號系統無法使用的字元，請換一個暱稱再試一次';
        if (code === 'auth/too-many-requests') return '嘗試次數過多，請稍後再試';
        if (code === 'auth/network-request-failed') return '網路連線失敗，請檢查網路後再試一次';
        return `登入時發生錯誤：${e && e.message ? e.message : e}`;
    },

    // 修正：登入方式從「只輸入暱稱」改成「暱稱 + 密碼」，並改接 Firebase Authentication 驗證：
    // - 全新暱稱：Firebase 裡還沒有對應的帳號，登入會失敗，改成直接註冊一個新帳號。
    // - 舊帳號（本來就有練習資料，但還沒註冊過 Firebase 帳號）：一樣是登入失敗、改成註冊，
    //   等於用這次輸入的密碼幫舊帳號「補設」密碼；雲端的招式進度是照暱稱存的，不會受影響。
    // - 已經註冊過的帳號：Firebase 直接驗證密碼是否正確，錯誤會統一被判斷成「密碼錯誤」。
    async handleLogin() {
        const usernameEl = document.getElementById('login-username');
        const passwordEl = document.getElementById('login-password');
        const raw = usernameEl ? usernameEl.value.trim() : "";
        const rawPassword = passwordEl ? passwordEl.value : "";

        if (this.domError) this.domError.textContent = '';

        if (!raw) { alert('請輸入暱稱！'); return; }
        if (!rawPassword) { alert('請輸入密碼！'); return; }
        if (rawPassword.length < 6) {
            if (this.domError) this.domError.textContent = '密碼至少要 6 個字元（Firebase 帳號系統的限制）';
            return;
        }

        const username = this.sanitizeUsername(raw);
        if (!username) {
            alert('暱稱含有不允許的字元（例如 / . # $ [ ]），請重新輸入！');
            return;
        }

        const email = this.nicknameToEmail(username);

        if (this.domSubmit) this.domSubmit.disabled = true;
        if (this.domError) this.domError.textContent = '登入中...';

        try {
            try {
                await signInWithEmailAndPassword(auth, email, rawPassword);
            } catch (signInError) {
                // 登入失敗有兩種可能：這個暱稱還沒註冊過、或密碼打錯了。
                // 新版 Firebase 為了防止帳號列舉，兩種情況可能回傳同一種錯誤代碼，沒辦法直接分辨，
                // 所以改成：先查一下這個暱稱本來是不是就有練習資料（判斷是不是舊帳號要補設密碼），
                // 再嘗試直接註冊；如果註冊失敗顯示「帳號已經存在」，才代表原本真的是密碼打錯了。
                let isExistingProfile = false;
                try {
                    const snap = await getDoc(doc(db, "users", username));
                    isExistingProfile = snap.exists();
                } catch (checkError) {
                    // 讀取失敗就當作不知道，不影響後續流程
                }

                try {
                    await createUserWithEmailAndPassword(auth, email, rawPassword);
                    if (isExistingProfile) {
                        alert('這是還沒設定過密碼的舊帳號，已經把你剛剛輸入的密碼設為這個帳號的登入密碼，下次請用同一組密碼登入。');
                    }
                } catch (registerError) {
                    if (registerError.code === 'auth/email-already-in-use') {
                        throw new Error('__WRONG_PASSWORD__');
                    }
                    throw registerError;
                }
            }

            // onAuthStateChanged 監聽器會自動接手呼叫 loginAs()，這裡只要關閉視窗即可
            if (this.domSubmit) this.domSubmit.disabled = false;
            if (this.domError) this.domError.textContent = '';
            this.closeModal();
        } catch (e) {
            if (this.domSubmit) this.domSubmit.disabled = false;
            console.error('登入失敗:', e);
            if (this.domError) this.domError.textContent = this.formatAuthError(e);
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
        // 先把目前使用者還沒送出的計數存檔盡量存完，再登出
        if (this.currentUser) {
            await TrickLibrary.flushSave();
        }

        try {
            await signOut(auth);
        } catch (e) {
            console.error('登出失敗:', e);
        }
        // 登出後 onAuthStateChanged 會自動偵測到、切回訪客模式，不用在這裡手動處理狀態
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
