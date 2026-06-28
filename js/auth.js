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

        if (this.domTrigger) this.domTrigger.addEventListener('click', () => this.openModal());
        if (this.domClose) this.domClose.addEventListener('click', () => this.closeModal());
        if (this.domSubmit) this.domSubmit.addEventListener('click', () => this.handleLogin());
        
        const lastUser = localStorage.getItem('kendama_last_user');
        if (lastUser) { 
            this.loginAs(lastUser); 
        } else {
            // 🌟 核心修正：沒登入時，直接使用本地 254 個招式驅動網頁，功能完全正常開放！
            if (this.domStatus) this.domStatus.innerText = "🟢 未登入 (功能皆可使用，進度將不儲存)";
            AppController.onUserSwitched();
        }
    },
    openModal() { if (this.domLoginModal) this.domLoginModal.classList.remove('hidden'); },
    closeModal() { if (this.domLoginModal) this.domLoginModal.classList.add('hidden'); },
    handleLogin() {
        const usernameEl = document.getElementById('login-username');
        const username = usernameEl ? usernameEl.value.trim() : "";
        if (!username) { alert('請輸入暱稱！'); return; }
        this.loginAs(username);
        this.closeModal();
    },
    async loginAs(username) {
        this.currentUser = username;
        window.currentUser = username; 
        localStorage.setItem('kendama_last_user', username);
        
        if (this.domStatus) this.domStatus.innerText = `👤 選手: ${username} (雲端同步中)`;
        if (this.domTrigger) this.domTrigger.innerText = `👤 切換帳號`;

        try {
            // 1. 下載雲端次數並安全合流到 254 個招式內
            await TrickLibrary.loadUserProgress(username);
            // 2. 🌟 下載完成後立刻將 254 個最新結構覆蓋回雲端，幫舊帳號的 Firestore 升級！
            await TrickLibrary.saveUserProgress(username);
            
            AppController.onUserSwitched();
        } catch (error) {
            console.error("帳號切換加載失敗:", error);
            AppController.onUserSwitched();
        }
    }
};