// app.js
import { AuthSystem } from "./auth.js";
import { TrickLibrary } from "./library.js";

export const AppController = {
    currentStableTrick: null,
    currentChallengeTrick: null,
    historyStableIds: [],
    historyChallengeIds: [],

    init() {
        TrickLibrary.init();
        AuthSystem.init(); 
        
        this.bindCounterEvents();
        this.bindActionEvents();
        this.bindSelectEvents(); // 綁定下拉選單事件
        
        // 將 Controller 掛載到 window 上，確保跨模組互相呼叫正常
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
    
    // 🌟 動態刷新「今日穩固（熟練池）」下拉選單
    refreshStableSelect() {
        const selectEl = document.getElementById('select-stable-trick');
        if (!selectEl || !TrickLibrary.tricks) return;
        
        selectEl.innerHTML = '<option value=\"\">-- 手選熟練招式 --</option>';
        
        // 過濾出目前「已解鎖」的所有招式供首頁直接選擇
        const unlockedTricks = TrickLibrary.tricks.filter(t => t.isUnlocked);
        unlockedTricks.forEach(t => {
            const opt = document.createElement('option');
            opt.value = t.id;
            // 加上分類前綴，方便使用者在超長列表中尋找
            opt.innerText = `[${t.category}] ${t.name}`;
            selectEl.appendChild(opt);
        });
    },

    // 🌟 動態刷新「新招式挑戰（未解鎖）」下拉選單
    refreshChallengeSelect() {
        const selectEl = document.getElementById('select-challenge-trick');
        if (!selectEl || !TrickLibrary.tricks) return;
        
        selectEl.innerHTML = '<option value=\"\">-- 手選挑戰招式 --</option>';
        
        // 過濾出目前「尚未解鎖」的所有招式
        const lockedTricks = TrickLibrary.tricks.filter(t => !t.isUnlocked);
        lockedTricks.forEach(t => {
            const opt = document.createElement('option');
            opt.value = t.id;
            opt.innerText = `[${t.category}] ${t.name}`;
            selectEl.appendChild(opt);
        });
    },

    renderStableCard() {
        const card = document.getElementById('stable-trick-card');
        if (!card) return;
        if (!this.currentStableTrick) {
            card.querySelector('.trick-name').innerText = "暫無熟練招式";
            card.querySelector('.target-count').innerText = "-";
            card.querySelector('.today-count').innerText = "-";
            return;
        }
        const t = this.currentStableTrick;
        const target = TrickLibrary.getTargetCount(t.totalCount);
        
        card.querySelector('.trick-name').innerText = `${t.name} (${t.category}/${t.subcategory})`;
        card.querySelector('.target-count').innerText = target;
        card.querySelector('.today-count').innerText = t.todayCount;
    },

    renderChallengeCard() {
        const card = document.getElementById('challenge-trick-card');
        if (!card) return;
        if (!this.currentChallengeTrick) {
            card.querySelector('.trick-name').innerText = "恭喜全招式解鎖！";
            return;
        }
        const t = this.currentChallengeTrick;
        card.querySelector('.trick-name').innerText = `${t.name} (${t.category}/${t.subcategory})`;
    },

    nextStableTrick() {
        // 從已解鎖招式中隨機抽選
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
        this.historyStableIds.push(randomTrick.id);
        this.currentStableTrick = randomTrick;
        
        this.renderStableCard();
        
        // 聯動更新下拉選單的反白選取狀態
        const selectEl = document.getElementById('select-stable-trick');
        if (selectEl) selectEl.value = randomTrick.id;
    },

    nextChallengeTrick() {
        // 從未解鎖招式中隨機抽選
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
        this.historyChallengeIds.push(randomTrick.id);
        this.currentChallengeTrick = randomTrick;
        
        this.renderChallengeCard();

        const selectEl = document.getElementById('select-challenge-trick');
        if (selectEl) selectEl.value = randomTrick.id;
    },

    bindCounterEvents() {
        document.querySelectorAll('#stable-trick-card .btn-count').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                if (!this.currentStableTrick) return;
                const amount = parseInt(e.target.getAttribute('data-add'), 10);
                
                TrickLibrary.updateCount(this.currentStableTrick.id, amount);
                this.renderStableCard();
                
                if (AuthSystem.currentUser) {
                    await TrickLibrary.saveUserProgress(AuthSystem.currentUser);
                }
            });
        });
    },

    bindActionEvents() {
        document.getElementById('btn-next-stable').addEventListener('click', () => this.nextStableTrick());
        document.getElementById('btn-next-challenge').addEventListener('click', () => this.nextChallengeTrick());

        document.getElementById('btn-challenge-success').addEventListener('click', async () => {
            if (!this.currentChallengeTrick) return;
            
            TrickLibrary.unlockTrick(this.currentChallengeTrick.id);
            alert(`🏆 恭喜成功解鎖【${this.currentChallengeTrick.name}】！該招式已移入熟練池。`);
            
            if (AuthSystem.currentUser) {
                await TrickLibrary.saveUserProgress(AuthSystem.currentUser);
            }

            this.refreshStableSelect();
            this.refreshChallengeSelect();
            this.nextChallengeTrick();
            this.nextStableTrick();
        });
    },

    bindSelectEvents() {
        document.getElementById('select-stable-trick').addEventListener('change', (e) => {
            const selectedId = parseInt(e.target.value, 10);
            if (!selectedId) return;
            
            const found = TrickLibrary.tricks.find(t => t.id === selectedId);
            if (found) {
                this.currentStableTrick = found;
                this.renderStableCard();
            }
        });

        document.getElementById('select-challenge-trick').addEventListener('change', (e) => {
            const selectedId = parseInt(e.target.value, 10);
            if (!selectedId) return;
            
            const found = TrickLibrary.tricks.find(t => t.id === selectedId);
            if (found) {
                this.currentChallengeTrick = found;
                this.renderChallengeCard();
            }
        });
    }
};