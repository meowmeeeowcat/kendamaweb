// app.js
import { AuthSystem } from "./auth.js";
import { TrickLibrary } from "./library.js";

export const AppController = {
    currentStableTrick: null,
    currentChallengeTrick: null,
    historyStableIds: [],
    historyChallengeIds: [],

    init() {
        // 🌟 先初始化本地資料
        TrickLibrary.init();
        // 再初始化登入狀態（會決定是否覆蓋成雲端進度）
        AuthSystem.init(); 
        
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
            if (nameEl) nameEl.innerText = "暫無熟練招式 (請先從下方解鎖)";
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
                const amount = parseInt(e.target.getAttribute('data-add'), 10);
                
                TrickLibrary.updateCount(this.currentStableTrick.id, amount);
                this.renderStableCard();
                
                // 🌟 只在有登入時同步到雲端
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

        if (btnNextStable) btnNextStable.addEventListener('click', () => this.nextStableTrick());
        if (btnNextChallenge) btnNextChallenge.addEventListener('click', () => this.nextChallengeTrick());

        if (btnChallengeSuccess) {
            btnChallengeSuccess.addEventListener('click', async () => {
                if (!this.currentChallengeTrick) return;
                
                TrickLibrary.unlockTrick(this.currentChallengeTrick.id);
                alert(`🏆 恭喜成功解鎖【${this.currentChallengeTrick.name}】！`);
                
                if (AuthSystem.currentUser) {
                    await TrickLibrary.saveUserProgress(AuthSystem.currentUser);
                }

                this.refreshStableSelect();
                this.refreshChallengeSelect();
                this.nextChallengeTrick();
                this.nextStableTrick();
            });
        }
    },

    bindSelectEvents() {
        const selectStable = document.getElementById('select-stable-trick');
        const selectChallenge = document.getElementById('select-challenge-trick');

        if (selectStable) {
            selectStable.addEventListener('change', (e) => {
                const selectedId = parseInt(e.target.value, 10);
                if (!selectedId) return;
                const found = TrickLibrary.tricks.find(t => t.id === selectedId);
                if (found) {
                    this.currentStableTrick = found;
                    this.renderStableCard();
                }
            });
        }

        if (selectChallenge) {
            selectChallenge.addEventListener('change', (e) => {
                const selectedId = parseInt(e.target.value, 10);
                if (!selectedId) return;
                const found = TrickLibrary.tricks.find(t => t.id === selectedId);
                if (found) {
                    this.currentChallengeTrick = found;
                    this.renderChallengeCard();
                }
            });
        }
    }
};