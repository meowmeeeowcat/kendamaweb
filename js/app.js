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
        this.bindSelectEvents(); // 🌟 新增：綁定下拉選單事件
    },
    
    onUserSwitched() {
        this.historyStableIds = [];
        this.historyChallengeIds = [];
        this.nextStableTrick();
        this.nextChallengeTrick();
    },
    
    // 🌟 新增：動態刷新「今日穩固」下拉選單的選項
    refreshStableSelect() {
        const selectEl = document.getElementById('select-stable-trick');
        if (!selectEl || !TrickLibrary.tricks) return;
        
        // 保留預設的第一個選項
        selectEl.innerHTML = '<option value="">-- 手選熟練招式 --</option>';
        
        // 只撈出已解鎖的招式
        const unlockedTricks = TrickLibrary.tricks.filter(t => t.isUnlocked);
        unlockedTricks.forEach(t => {
            const opt = document.createElement('option');
            opt.value = t.id;
            opt.innerText = t.name;
            // 如果剛好是當前選中的招式，就讓選單預先選中它
            if (this.currentStableTrick && t.id === this.currentStableTrick.id) {
                opt.selected = true;
            }
            selectEl.appendChild(opt);
        });
    },

    // 🌟 新增：動態刷新「新招式挑戰」下拉選單的選項
    refreshChallengeSelect() {
        const selectEl = document.getElementById('select-challenge-trick');
        if (!selectEl || !TrickLibrary.tricks) return;
        
        selectEl.innerHTML = '<option value="">-- 手選挑戰招式 --</option>';
        
        // 只撈出未解鎖（上鎖）的招式
        const lockedTricks = TrickLibrary.tricks.filter(t => !t.isUnlocked);
        lockedTricks.forEach(t => {
            const opt = document.createElement('option');
            opt.value = t.id;
            opt.innerText = t.name;
            if (this.currentChallengeTrick && t.id === this.currentChallengeTrick.id) {
                opt.selected = true;
            }
            selectEl.appendChild(opt);
        });
    },
    
    nextStableTrick() {
        if (!TrickLibrary.tricks || TrickLibrary.tricks.length === 0) return;
        
        const availableTricks = TrickLibrary.tricks.filter(t => t.isUnlocked && !this.historyStableIds.includes(t.id));
        if (availableTricks.length === 0) {
            document.querySelector('#stable-trick-card .trick-name').innerText = "🎉 熟練池全數複習完畢！";
            document.querySelector('#stable-trick-card .target-count').innerText = "-";
            document.querySelector('#stable-trick-card .today-count').innerText = "-";
            this.currentStableTrick = null;
            this.refreshStableSelect();
            return;
        }
        const randomIndex = Math.floor(Math.random() * availableTricks.length);
        this.currentStableTrick = availableTricks[randomIndex];
        this.historyStableIds.push(this.currentStableTrick.id);
        this.renderStableCard();
    },
    
    nextChallengeTrick() {
        if (!TrickLibrary.tricks || TrickLibrary.tricks.length === 0) return;
        
        const availableTricks = TrickLibrary.tricks.filter(t => !t.isUnlocked && !this.historyChallengeIds.includes(t.id));
        if (availableTricks.length === 0) {
            document.querySelector('#challenge-trick-card .trick-name').innerText = "🏆 已通關所有新招式！";
            document.querySelector('#challenge-trick-card .today-count').innerText = "-";
            this.currentChallengeTrick = null;
            this.refreshChallengeSelect();
            return;
        }
        const randomIndex = Math.floor(Math.random() * availableTricks.length);
        this.currentChallengeTrick = availableTricks[randomIndex];
        this.historyChallengeIds.push(this.currentChallengeTrick.id);
        this.renderChallengeCard();
    },
    
    renderStableCard() {
        if (!this.currentStableTrick) return;
        const target = TrickLibrary.getTargetCount(this.currentStableTrick.totalCount);
        document.querySelector('#stable-trick-card .trick-name').innerText = this.currentStableTrick.name;
        document.querySelector('#stable-trick-card .target-count').innerText = target;
        document.querySelector('#stable-trick-card .today-count').innerText = this.currentStableTrick.todayCount;
        this.refreshStableSelect(); // 卡片切換時，同步刷新選單指標
    },
    
    renderChallengeCard() {
        if (!this.currentChallengeTrick) return;
        document.querySelector('#challenge-trick-card .trick-name').innerText = this.currentChallengeTrick.name;
        document.querySelector('#challenge-trick-card .today-count').innerText = this.currentChallengeTrick.todayCount;
        this.refreshChallengeSelect(); // 卡片切換時，同步刷新選單指標
    },
    
    bindCounterEvents() {
        document.querySelectorAll('#stable-trick-card .btn-count').forEach(btn => {
            btn.addEventListener('click', (e) => {
                if (!this.currentStableTrick) return;
                const amount = parseInt(btn.getAttribute('data-add'), 10);
                this.currentStableTrick = TrickLibrary.updateCount(this.currentStableTrick.id, amount);
                this.renderStableCard();
            });
        });
        document.querySelectorAll('#challenge-trick-card .btn-count').forEach(btn => {
            btn.addEventListener('click', (e) => {
                if (!this.currentChallengeTrick) return;
                const amount = parseInt(btn.getAttribute('data-add'), 10);
                this.currentChallengeTrick = TrickLibrary.updateCount(this.currentChallengeTrick.id, amount);
                this.renderChallengeCard();
            });
        });
    },
    
    bindActionEvents() {
        // 隨機換招按鈕
        document.getElementById('btn-stable-complete').addEventListener('click', () => this.nextStableTrick());
        document.getElementById('btn-challenge-skip').addEventListener('click', () => this.nextChallengeTrick());
        
        // 挑戰成功按鈕：將這招解鎖（移入熟練池）並抽選下一招
        document.getElementById('btn-challenge-complete').addEventListener('click', () => {
            if (!this.currentChallengeTrick) return;
            
            // 1. 將該招式在資料庫內解鎖 (isUnlocked 變 true)
            TrickLibrary.unlockTrick(this.currentChallengeTrick.id);
            
            // 2. 彈出成功通知
            alert(`🏆 恭喜成功解鎖【${this.currentChallengeTrick.name}】！該招式已正式移入今日穩固（熟練池）。`);
            
            // 3. 重新抽選下一隻新招式挑戰
            this.nextChallengeTrick();
            
            // 4. 同步讓熟練池也更新一下招式（讓新解鎖的招式有機會立刻被抽到）
            this.nextStableTrick();
        });
    },

    // 🌟 新增：監聽使用者手動選擇選單的動作
    bindSelectEvents() {
        // 監聽今日穩固選單
        document.getElementById('select-stable-trick').addEventListener('change', (e) => {
            const selectedId = parseInt(e.target.value, 10);
            if (!selectedId) return;
            
            const found = TrickLibrary.tricks.find(t => t.id === selectedId);
            if (found) {
                this.currentStableTrick = found;
                this.renderStableCard();
            }
        });

        // 監聽新招式挑戰選單
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

document.addEventListener("DOMContentLoaded", () => {
    AppController.init();
});