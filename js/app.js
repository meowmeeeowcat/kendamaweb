// js/app.js
import { AuthSystem } from "./auth.js";
import { TrickLibrary } from "./library.js";

export const AppController = {
    currentStableTrick: null,
    currentChallengeTrick: null,
    historyStableIds: [],
    historyChallengeIds: [],

    init() {
        // 初始化本地招式庫數據
        TrickLibrary.init();
        // 啟動登入管理系統
        AuthSystem.init(); 
        
        // 確保綁定事件
        this.bindCounterEvents();
        this.bindActionEvents();
        this.bindSelectEvents();
        
        window.AppController = this;
    },
    
    onUserSwitched() {
        this.historyStableIds = [];
        this.historyChallengeIds = [];
        this.refreshStableSelect();
        this.refreshChallengeSelect();
        this.nextStableTrick();
        this.nextChallengeTrick();
    },
    
    refreshStableSelect() {
        const selectEl = document.getElementById('select-stable-trick');
        if (!selectEl) return;
        selectEl.innerHTML = '<option value="">-- 手選熟練招式 --</option>';
        if (!TrickLibrary.tricks || TrickLibrary.tricks.length === 0) return;
        
        const unlockedTricks = TrickLibrary.tricks.filter(t => t.isUnlocked);
        unlockedTricks.forEach(t => {
            const opt = document.createElement('option');
            opt.value = t.id;
            opt.innerText = `[${t.category || '熟練'}] ${t.name}`;
            selectEl.appendChild(opt);
        });
    },

    refreshChallengeSelect() {
        const selectEl = document.getElementById('select-challenge-trick');
        if (!selectEl) return;
        selectEl.innerHTML = '<option value="">-- 手選挑戰招式 --</option>';
        if (!TrickLibrary.tricks || TrickLibrary.tricks.length === 0) return;
        
        const lockedTricks = TrickLibrary.tricks.filter(t => !t.isUnlocked);
        lockedTricks.forEach(t => {
            const opt = document.createElement('option');
            opt.value = t.id;
            opt.innerText = `[${t.category || '挑戰'}] ${t.name}`;
            selectEl.appendChild(opt);
        });
    },

    renderStableCard() {
        const card = document.getElementById('stable-trick-card');
        if (!card) return;
        
        const nameEl = card.querySelector('.trick-name');
        const targetEl = card.querySelector('.target-count');
        const todayEl = card.querySelector('.today-count');

        if (!this.currentStableTrick) {
            if (nameEl) nameEl.innerText = "暫無熟練招式 (請先從挑戰中解鎖)";
            if (targetEl) targetEl.innerText = "-";
            if (todayEl) todayEl.innerText = "-";
            return;
        }
        
        const t = this.currentStableTrick;
        const target = TrickLibrary.getTargetCount(t.totalCount);
        
        if (nameEl) nameEl.innerText = `${t.name} (${t.category || ''}/${t.subcategory || ''})`;
        if (targetEl) targetEl.innerText = target;
        if (todayEl) todayEl.innerText = t.todayCount;
    },

    renderChallengeCard() {
        const card = document.getElementById('challenge-trick-card');
        if (!card) return;
        const nameEl = card.querySelector('.trick-name');
        if (!nameEl) return;

        if (!this.currentChallengeTrick) {
            nameEl.innerText = "恭喜全招式解鎖！🎉";
            return;
        }
        const t = this.currentChallengeTrick;
        nameEl.innerText = `${t.name} (${t.category || ''}/${t.subcategory || ''})`;
    },

    nextStableTrick() {
        if (!TrickLibrary.tricks || TrickLibrary.tricks.length === 0) return;
        const pool = TrickLibrary.tricks.filter(t => t.isUnlocked);
        if (pool.length === 0) {
            this.currentStableTrick = null;
            this.renderStableCard();
            return;
        }

        let available = pool.filter(t => !this.historyStableIds.includes(t.id));
        if (available.length === 0) {
            this.historyStableIds = [];
            available = pool;
        }

        const randomTrick = available[Math.floor(Math.random() * available.length)];
        if (randomTrick) {
            this.historyStableIds.push(randomTrick.id);
            this.currentStableTrick = randomTrick;
            this.renderStableCard();
            const selectEl = document.getElementById('select-stable-trick');
            if (selectEl) selectEl.value = randomTrick.id;
        }
    },

    nextChallengeTrick() {
        if (!TrickLibrary.tricks || TrickLibrary.tricks.length === 0) return;
        const pool = TrickLibrary.tricks.filter(t => !t.isUnlocked);
        if (pool.length === 0) {
            this.currentChallengeTrick = null;
            this.renderChallengeCard();
            return;
        }

        let available = pool.filter(t => !this.historyChallengeIds.includes(t.id));
        if (available.length === 0) {
            this.historyChallengeIds = [];
            available = pool;
        }

        const randomTrick = available[Math.floor(Math.random() * available.length)];
        if (randomTrick) {
            this.historyChallengeIds.push(randomTrick.id);
            this.currentChallengeTrick = randomTrick;
            this.renderChallengeCard();
            const selectEl = document.getElementById('select-challenge-trick');
            if (selectEl) selectEl.value = randomTrick.id;
        }
    },

    bindCounterEvents() {
        document.querySelectorAll('#stable-trick-card .btn-count').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                if (!this.currentStableTrick) return;
                const amount = parseInt(e.currentTarget.getAttribute('data-add'), 10);
                
                TrickLibrary.updateCount(this.currentStableTrick.id, amount);
                this.renderStableCard();
                
                if (AuthSystem.currentUser) {
                    await TrickLibrary.saveUserProgress(AuthSystem.currentUser);
                }
            });
        });
    },

    bindActionEvents() {
        const btnNextStable = document.getElementById('btn-next-stable');
        const btnNextChallenge = document.getElementById('btn-next-challenge');
        const btnChallengeSuccess = document.getElementById('btn-challenge-success');

        if (btnNextStable) btnNextStable.onclick = () => this.nextStableTrick();
        if (btnNextChallenge) btnNextChallenge.onclick = () => this.nextChallengeTrick();

        if (btnChallengeSuccess) {
            btnChallengeSuccess.onclick = async () => {
                if (!this.currentChallengeTrick) return;
                
                const targetId = this.currentChallengeTrick.id;
                const targetName = this.currentChallengeTrick.name;
                
                // 1. 執行解鎖（此時 library.js 內部會自動將次數 +1）
                TrickLibrary.unlockTrick(targetId);
                
                // 🎯 修正核心：將剛剛解鎖成功的招式指定給當前熟練招式，以確保接下來渲染時資料正確同步
                const unlockedTrick = TrickLibrary.tricks.find(t => t.id === targetId);
                if (unlockedTrick) {
                    this.currentStableTrick = unlockedTrick;
                }

                alert(`🏆 恭喜成功解鎖【${targetName}】！`);
                
                // 2. 同步至 Firebase（因為次數已經是 1，會精準觸發歷史紀錄上傳）
                if (AuthSystem.currentUser) {
                    await TrickLibrary.saveUserProgress(AuthSystem.currentUser);
                }

                // 3. 刷新清單選項
                this.refreshStableSelect();
                this.refreshChallengeSelect();

                // 🎯 修正核心：先將資料渲染至「今日穩固」卡片中顯示剛才+1的狀態，再抽取下一輪挑戰
                this.renderStableCard(); 
                this.nextChallengeTrick();
            };
        }
    },

    bindSelectEvents() {
        const selectStable = document.getElementById('select-stable-trick');
        const selectChallenge = document.getElementById('select-challenge-trick');

        if (selectStable) {
            selectStable.onchange = (e) => {
                const selectedId = parseInt(e.target.value, 10);
                if (!selectedId) return;
                const found = TrickLibrary.tricks.find(t => t.id === selectedId);
                if (found) {
                    this.currentStableTrick = found;
                    this.renderStableCard();
                }
            };
        }

        if (selectChallenge) {
            selectChallenge.onchange = (e) => {
                const selectedId = parseInt(e.target.value, 10);
                if (!selectedId) return;
                const found = TrickLibrary.tricks.find(t => t.id === selectedId);
                if (found) {
                    this.currentChallengeTrick = found;
                    this.renderChallengeCard();
                }
            };
        }
    }
};