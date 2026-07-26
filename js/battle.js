// js/battle.js
// 對戰功能：輸入對方暱稱 -> 比對雙方招式庫 -> 篩選並勾選要對戰的招式、設定雙方血量 -> 開始對戰，
// 每輪抽一個招式，記錄「你沒接到」「對方沒接到」或「雙方都接到」，血量扣到 0 就輸了。
import { TrickLibrary } from "./library.js";

export const BattleSystem = {
    opponentName: null,
    opponentTricks: null,   // 對手的招式快照（陣列），由 TrickLibrary.fetchUserTricksSnapshot() 取得
    comparedTricks: [],     // 比對過雙方狀態、已分類的招式清單（在進入 select 階段時計算一次）
    selectedTrickIds: new Set(), // 使用者勾選要加入本次對戰的招式 id
    battlePool: [],          // 確認後鎖定的對戰招式池
    battleHistory: [],       // 已經抽過的招式 id，避免連續重複抽到同一個
    currentTrick: null,      // 目前這輪抽到的招式

    maxHp: 3,   // 雙方血量上限（用 ken 的血量顆數計算），可在選招式時調整
    myHp: 3,
    oppHp: 3,
    gameOver: false,

    init() {
        this.domStageInput = document.getElementById('battle-stage-input');
        this.domStageSelect = document.getElementById('battle-stage-select');
        this.domStagePlay = document.getElementById('battle-stage-play');

        this.domOpponentInput = document.getElementById('battle-opponent-input');
        this.domStartBtn = document.getElementById('btn-battle-start');
        this.domInputError = document.getElementById('battle-input-error');

        this.domHpInput = document.getElementById('battle-hp-input');
        this.domFilterCategory = document.getElementById('battle-filter-category');
        this.domFilterSubcategory = document.getElementById('battle-filter-subcategory');
        this.domTrickList = document.getElementById('battle-trick-list');
        this.domSelectSummary = document.getElementById('battle-select-summary');
        this.domConfirmBtn = document.getElementById('btn-battle-confirm');
        this.domOppNameLabel1 = document.getElementById('battle-opp-name-label-1');

        this.domOppNameLabel2 = document.getElementById('battle-opp-name-label-2');
        this.domMyHpDots = document.getElementById('battle-my-hp');
        this.domOppHpDots = document.getElementById('battle-opp-hp');
        this.domDrawResult = document.getElementById('battle-draw-result');
        this.domResultMessage = document.getElementById('battle-result-message');
        this.domRoundActions = document.getElementById('battle-round-actions');
        this.domMissMeBtn = document.getElementById('btn-battle-miss-me');
        this.domBothSuccessBtn = document.getElementById('btn-battle-both-success');
        this.domMissOppBtn = document.getElementById('btn-battle-miss-opp');
        this.domRestartBtn = document.getElementById('btn-battle-restart');

        if (this.domStartBtn) this.domStartBtn.onclick = () => this.handleStart();
        if (this.domOpponentInput) {
            this.domOpponentInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') this.handleStart();
            });
        }

        if (this.domFilterCategory) {
            this.domFilterCategory.onchange = () => {
                this.updateSubcategoryOptions();
                this.renderTrickList();
            };
        }
        if (this.domFilterSubcategory) this.domFilterSubcategory.onchange = () => this.renderTrickList();

        if (this.domTrickList) {
            this.domTrickList.addEventListener('change', (e) => {
                if (!e.target.classList || !e.target.classList.contains('battle-checkbox')) return;
                const id = e.target.getAttribute('data-id');
                if (e.target.checked) {
                    this.selectedTrickIds.add(id);
                } else {
                    this.selectedTrickIds.delete(id);
                }
                this.updateSelectSummary();
            });
        }

        if (this.domConfirmBtn) this.domConfirmBtn.onclick = () => this.confirmSelection();
        if (this.domMissMeBtn) this.domMissMeBtn.onclick = () => this.recordRound('miss-me');
        if (this.domBothSuccessBtn) this.domBothSuccessBtn.onclick = () => this.recordRound('both-success');
        if (this.domMissOppBtn) this.domMissOppBtn.onclick = () => this.recordRound('miss-opp');
        if (this.domRestartBtn) this.domRestartBtn.onclick = () => this.resetToInput();
    },

    // 每次從其他頁面切換進「對戰」頁面時呼叫，重置成一開始輸入暱稱的畫面
    onEnterBattlePage() {
        this.resetToInput();
    },

    resetToInput() {
        this.opponentName = null;
        this.opponentTricks = null;
        this.comparedTricks = [];
        this.selectedTrickIds = new Set();
        this.battlePool = [];
        this.battleHistory = [];
        this.currentTrick = null;
        this.gameOver = false;

        if (this.domOpponentInput) this.domOpponentInput.value = '';
        if (this.domInputError) this.domInputError.textContent = '';
        if (this.domHpInput) this.domHpInput.value = this.maxHp;

        this.showStage('input');
    },

    showStage(stage) {
        if (this.domStageInput) this.domStageInput.classList.toggle('hidden', stage !== 'input');
        if (this.domStageSelect) this.domStageSelect.classList.toggle('hidden', stage !== 'select');
        if (this.domStagePlay) this.domStagePlay.classList.toggle('hidden', stage !== 'play');
    },

    async handleStart() {
        if (!this.domOpponentInput) return;
        const raw = this.domOpponentInput.value.trim();

        if (!window.currentUser) {
            if (this.domInputError) this.domInputError.textContent = '請先登入帳號才能使用對戰功能';
            return;
        }
        if (!raw) {
            if (this.domInputError) this.domInputError.textContent = '請輸入對方的暱稱';
            return;
        }
        if (raw === window.currentUser) {
            if (this.domInputError) this.domInputError.textContent = '不能輸入自己的暱稱';
            return;
        }

        if (this.domInputError) this.domInputError.textContent = '搜尋中...';
        if (this.domStartBtn) this.domStartBtn.disabled = true;

        const oppTricks = await TrickLibrary.fetchUserTricksSnapshot(raw);

        if (this.domStartBtn) this.domStartBtn.disabled = false;

        if (!oppTricks) {
            if (this.domInputError) this.domInputError.textContent = '找不到這個暱稱的玩家，請確認暱稱是否正確';
            return;
        }

        this.opponentName = raw;
        this.opponentTricks = oppTricks;
        if (this.domInputError) this.domInputError.textContent = '';
        if (this.domOppNameLabel1) this.domOppNameLabel1.textContent = raw;
        if (this.domOppNameLabel2) this.domOppNameLabel2.textContent = raw;

        this.comparedTricks = this.buildComparedTricks();
        this.selectedTrickIds = new Set();
        this.initFilterOptions();
        this.renderTrickList();
        this.showStage('select');
    },

    // 比對雙方招式庫。只比較非自訂招式（雙方都用同一份 defaultTricks 為基準，避免自訂招式 id 對不上）。
    // 三種分類：
    // - both-mastered：雙方都已經用「移除熟練招式」標記為已熟練
    // - one-mastered：只有一方已經用「移除熟練招式」標記為已熟練（另一方不論解鎖與否）
    // - one-unlocked：雙方都還沒被標記為已熟練，但至少一方已解鎖
    // 雙方都還沒解鎖的招式不列入對戰候選（兩邊都不會，沒辦法拿來對戰）。
    buildComparedTricks() {
        const myTricks = TrickLibrary.tricks.filter(t => !t.isCustom);
        const getStatus = (t) => {
            if (!t) return 'locked';
            if (t.isMastered) return 'mastered';
            if (t.isUnlocked) return 'unlocked';
            return 'locked';
        };

        return myTricks.map(mine => {
            const opp = this.opponentTricks.find(t => t.id === mine.id);
            const myStatus = getStatus(mine);
            const oppStatus = getStatus(opp);

            let group = null;
            if (myStatus === 'mastered' && oppStatus === 'mastered') {
                group = 'both-mastered';
            } else if (myStatus === 'mastered' || oppStatus === 'mastered') {
                group = 'one-mastered';
            } else if (myStatus === 'unlocked' || oppStatus === 'unlocked') {
                group = 'one-unlocked';
            }

            return {
                id: mine.id,
                name: mine.name,
                category: mine.category,
                subcategory: mine.subcategory,
                myStatus,
                oppStatus,
                group
            };
        }).filter(t => t.group !== null);
    },

    initFilterOptions() {
        if (!this.domFilterCategory) return;
        const categories = [...new Set(this.comparedTricks.map(t => t.category).filter(Boolean))];

        this.domFilterCategory.innerHTML = '<option value="">全部大分類</option>' +
            categories.map(c => `<option value="${c}">${c}</option>`).join('');

        this.updateSubcategoryOptions();
    },

    updateSubcategoryOptions() {
        if (!this.domFilterSubcategory) return;
        const selectedCat = this.domFilterCategory ? this.domFilterCategory.value : '';
        const subs = [...new Set(
            this.comparedTricks
                .filter(t => !selectedCat || t.category === selectedCat)
                .map(t => t.subcategory)
                .filter(Boolean)
        )];

        this.domFilterSubcategory.innerHTML = '<option value="">全部小分類</option>' +
            subs.map(s => `<option value="${s}">${s}</option>`).join('');
    },

    renderTrickList() {
        if (!this.domTrickList) return;

        const selectedCat = this.domFilterCategory ? this.domFilterCategory.value : '';
        const selectedSub = this.domFilterSubcategory ? this.domFilterSubcategory.value : '';

        const groupLabels = {
            'both-mastered': '雙方都熟練',
            'one-mastered': '一方熟練',
            'one-unlocked': '一方解鎖'
        };
        const groupOrder = { 'both-mastered': 0, 'one-mastered': 1, 'one-unlocked': 2 };

        const filtered = this.comparedTricks
            .filter(t => (!selectedCat || t.category === selectedCat) && (!selectedSub || t.subcategory === selectedSub))
            .sort((a, b) => groupOrder[a.group] - groupOrder[b.group]);

        if (filtered.length === 0) {
            this.domTrickList.innerHTML = `<div style="text-align:center; color:#95a5a6; padding: 20px;">沒有符合條件的招式</div>`;
            this.updateSelectSummary();
            return;
        }

        this.domTrickList.innerHTML = filtered.map(t => `
            <div class="battle-item side-${t.myStatus} opp-${t.oppStatus}">
                <input type="checkbox" class="battle-checkbox" data-id="${t.id}" ${this.selectedTrickIds.has(t.id) ? 'checked' : ''}>
                <div class="battle-item-info">
                    <span class="battle-group-tag">${groupLabels[t.group]}</span>
                    <strong>${t.name}</strong>
                </div>
            </div>
        `).join('');

        this.updateSelectSummary();
    },

    updateSelectSummary() {
        if (this.domSelectSummary) {
            this.domSelectSummary.textContent = `已選擇 ${this.selectedTrickIds.size} 個招式`;
        }
    },

    confirmSelection() {
        if (this.selectedTrickIds.size === 0) {
            alert('請至少勾選一個招式再開始對戰！');
            return;
        }

        const hpValue = this.domHpInput ? parseInt(this.domHpInput.value, 10) : 3;
        this.maxHp = (Number.isFinite(hpValue) && hpValue > 0) ? hpValue : 3;
        this.myHp = this.maxHp;
        this.oppHp = this.maxHp;
        this.gameOver = false;

        this.battlePool = this.comparedTricks.filter(t => this.selectedTrickIds.has(t.id));
        this.battleHistory = [];

        this.renderHpDots();
        this.setRoundActionsEnabled(true);
        if (this.domResultMessage) this.domResultMessage.classList.add('hidden');

        this.showStage('play');
        this.drawNextTrick();
    },

    // 用小圓點表示血量（對應 ken 的血量顆數），扣掉的血量用空心點表示
    renderHpDots() {
        const renderDots = (current) => {
            let html = '';
            for (let i = 0; i < this.maxHp; i++) {
                html += `<span class="hp-dot ${i < current ? 'filled' : 'empty'}"></span>`;
            }
            return html;
        };
        if (this.domMyHpDots) this.domMyHpDots.innerHTML = renderDots(this.myHp);
        if (this.domOppHpDots) this.domOppHpDots.innerHTML = renderDots(this.oppHp);
    },

    setRoundActionsEnabled(enabled) {
        if (this.domRoundActions) this.domRoundActions.classList.toggle('hidden', !enabled);
    },

    drawNextTrick() {
        if (this.battlePool.length === 0 || !this.domDrawResult) return;

        let available = this.battlePool.filter(t => !this.battleHistory.includes(t.id));
        if (available.length === 0) {
            this.battleHistory = [];
            available = this.battlePool;
        }

        const picked = available[Math.floor(Math.random() * available.length)];
        this.battleHistory.push(picked.id);
        this.currentTrick = picked;

        this.domDrawResult.innerText = TrickLibrary.formatTrickLabel(picked);
    },

    // 記錄這一輪的結果：'miss-me'（你沒接到）／'both-success'（雙方都接到）／'miss-opp'（對方沒接到）
    recordRound(outcome) {
        if (this.gameOver) return;

        if (outcome === 'miss-me') {
            this.myHp = Math.max(0, this.myHp - 1);
        } else if (outcome === 'miss-opp') {
            this.oppHp = Math.max(0, this.oppHp - 1);
        }

        this.renderHpDots();

        if (this.myHp <= 0 || this.oppHp <= 0) {
            this.endGame();
            return;
        }

        this.drawNextTrick();
    },

    endGame() {
        this.gameOver = true;
        this.setRoundActionsEnabled(false);

        if (this.domResultMessage) {
            const winnerText = this.myHp <= 0 && this.oppHp <= 0
                ? '平手！雙方血量同時扣到 0'
                : (this.myHp <= 0 ? `${this.opponentName || '對方'} 獲勝！` : '你獲勝了！');
            this.domResultMessage.textContent = winnerText;
            this.domResultMessage.classList.remove('hidden');
        }
    }
};
