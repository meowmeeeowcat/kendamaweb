// auth.js
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
            if (this.domStatus) this.domStatus.innerText = "未登入 (功能皆可使用，進度將不儲存)";
            AppController.onUserSwitched();
        }
    },

    openModal() {
        // 有登入時才顯示登出按鈕
        if (this.domLogout) this.domLogout.classList.toggle('hidden', !this.currentUser);
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

    handleLogin() {
        const usernameEl = document.getElementById('login-username');
        const raw = usernameEl ? usernameEl.value.trim() : "";
        if (!raw) { alert('請輸入暱稱！'); return; }

        const username = this.sanitizeUsername(raw);
        if (!username) {
            alert('暱稱含有不允許的字元（例如 / . # $ [ ]），請重新輸入！');
            return;
        }

        this.loginAs(username);
        this.closeModal();
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

        if (this.domStatus) this.domStatus.innerText = "未登入 (功能皆可使用，進度將不儲存)";
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
