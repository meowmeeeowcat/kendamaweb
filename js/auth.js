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

        this.domTrigger.addEventListener('click', () => this.openModal());
        this.domClose.addEventListener('click', () => this.closeModal());
        this.domSubmit.addEventListener('click', () => this.handleLogin());
        
        const lastUser = localStorage.getItem('kendama_last_user');
        if (lastUser) { 
            this.loginAs(lastUser); 
        } else {
            AppController.onUserSwitched();
        }
    },
    openModal() { this.domLoginModal.classList.remove('hidden'); },
    closeModal() { this.domLoginModal.classList.add('hidden'); },
    handleLogin() {
        const username = document.getElementById('login-username').value.trim();
        if (!username) { alert('請輸入暱稱！'); return; }
        this.loginAs(username);
        this.closeModal();
    },
    async loginAs(username) {
        this.currentUser = username;
        window.currentUser = username; 
        localStorage.setItem('kendama_last_user', username);
        
        this.domStatus.innerText = `👤 選手: ${username} (雲端同步中)`;
        this.domTrigger.innerText = `👤 切換帳號`;

        try {
            await TrickLibrary.loadUserProgress(username);
            // 登入成功加載雲端數據後，完整重新配置首頁選擇器與畫面
            AppController.onUserSwitched();
        } catch (error) {
            console.error("加載進度錯誤:", error);
            AppController.onUserSwitched();
        }
    }
};