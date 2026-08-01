// js/battle.js
// 對戰功能：輸入對方暱稱 -> 比對雙方招式庫 -> 依分類邏輯勾選招式（預設全部勾選）-> 開始對戰，
// 每輪抽一個招式，哪一邊沒接到就點亮那一邊一個 KEN 字母，先點滿 K-E-N 三個字母的那一邊輸。
import { TrickLibrary } from "./library.js";

const KEN_LETTERS = ['K', 'E', 'N'];

export const BattleSystem = {
    opponentName: null,
    opponentTricks: null,   // 對手的招式快照（陣列），由 TrickLibrary.fetchUserTricksSnapshot() 取得
    comparedTricks: [],     // 比對過雙方狀態、已標記 tags 的招式清單（在進入 select 階段時計算一次）
    selectedTrickIds: new Set(), // 使用者勾選要加入本次對戰的招式 id（進入 select 階段時預設全選）
    battlePool: [],          // 確認後鎖定的對戰招式池
    battleHistory: [],       // 已經抽過的招式 id，避免連續重複抽到同一個
    currentTrick: null,      // 目前這輪抽到的招式

    myMarks: [],   // 3 個 KEN 字母的點亮狀態（true=已點亮）
    oppMarks: [],
    gameOver: false,

    init() {
        this.domStageInput = document.getElementById('battle-stage-input');
        this.domStageSelect = document.getElementById('battle-stage-select');
        this.domStagePlay = document.getElementById('battle-stage-play');

        this.domOpponentInput = document.getElementById('battle-opponent-input');
        this.domStartBtn = document.getElementById('btn-battle-start');
        this.domInputError = document.getElementById('battle-input-error');

        this.domChkBothMastered = document.getElementById('chk-battle-both-mastered');
        this.domChkAMastered = document.getElementById('chk-battle-a-mastered');
        this.domChkBMastered = document.getElementById('chk-battle-b-mastered');
        this.domChkAUnlocked = document.getElementById('chk-battle-a-unlocked');
        this.domChkBUnlocked = document.getElementById('chk-battle-b-unlocked');

        this.domFilterCategory = document.getElementById('battle-filter-category');
        this.domFilterSubcategory = document.getElementById('battle-filter-subcategory');
        this.domSelectAllCheckbox = document.getElementById('chk-battle-select-all');
        this.domTrickList = document.getElementById('battle-trick-list');
        this.domSelectSummary = document.getElementById('battle-select-summary');
        this.domConfirmBtn = document.getElementById('btn-battle-confirm');
        this.domOppNameLabel1 = document.getElementById('battle-opp-name-label-1');

        this.domOppNameLabel2 = document.getElementById('battle-opp-name-label-2');
        this.domMyMarks = document.getElementById('battle-my-marks');
        this.domOppMarks = document.getElementById('battle-opp-marks');
        this.domDrawResult = document.getElementById('battle-draw-result');
        this.domResultMessage = document.getElementById('battle-result-message');
        this.domBothSuccessBtn = document.getElementById('btn-battle-both-success');
        this.domRestartBtn = document.getElementById('btn-battle-restart');

        if (this.domStartBtn) this.domStartBtn.onclick = () => this.handleStart();
        if (this.domOpponentInput) {
            this.domOpponentInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') this.handleStart();
            });
        }

        [this.domChkBothMastered, this.domChkAMastered, this.domChkBMastered, this.domChkAUnlocked, this.domChkBUnlocked].forEach(chk => {
            if (chk) chk.onchange = () => this.renderTrickList();
        });

        if (this.domFilterCategory) {
            this.domFilterCategory.onchange = () => {
                this.updateSubcategoryOptions();
                this.renderTrickList();
            };
        }
        if (this.domFilterSubcategory) this.domFilterSubcategory.onchange = () => this.renderTrickList();

        if (this.domSelectAllCheckbox) {
            this.domSelectAllCheckbox.onchange = (e) => {
                const visible = this.getFilteredTricks();
                visible.forEach(t => {
                    if (e.target.checked) {
                        this.selectedTrickIds.add(t.id);
                    } else {
                        this.selectedTrickIds.delete(t.id);
                    }
                });
                this.renderTrickList();
            };
        }

        if (this.domTrickList) {
            this.domTrickList.addEventListener('change', (e) => {
                if (!e.target.classList || !e.target.classList.contains('battle-checkbox')) return;
                const id = e.target.getAttribute('data-id');
                if (e.target.checked) {
                    this.selectedTrickIds.add(id);
                } else {
                    this.selectedTrickIds.delete(id);
                }
                this.syncSelectAllCheckbox();
                this.updateSelectSummary();
            });
        }

        if (this.domConfirmBtn) this.domConfirmBtn.onclick = () => this.confirmSelection();
        if (this.domBothSuccessBtn) this.domBothSuccessBtn.onclick = () => this.drawNextTrick();
        if (this.domRestartBtn) this.domRestartBtn.onclick = () => this.resetToInput();

        if (this.domMyMarks) {
            this.domMyMarks.addEventListener('click', (e) => {
                const btn = e.target.closest('.mark-btn');
                if (!btn) return;
                this.toggleMark('me', parseInt(btn.getAttribute('data-index'), 10));
            });
        }
        if (this.domOppMarks) {
            this.domOppMarks.addEventListener('click', (e) => {
                const btn = e.target.closest('.mark-btn');
                if (!btn) return;
                this.toggleMark('opp', parseInt(btn.getAttribute('data-index'), 10));
            });
        }
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

        // 分類邏輯 checkbox 每次重新開始都回到預設全部勾選
        [this.domChkBothMastered, this.domChkAMastered, this.domChkBMastered, this.domChkAUnlocked, this.domChkBUnlocked].forEach(chk => {
            if (chk) chk.checked = true;
        });

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

        const result = await TrickLibrary.fetchUserTricksSnapshot(raw);

        if (this.domStartBtn) this.domStartBtn.disabled = false;

        if (result.status === 'error') {
            if (this.domInputError) {
                this.domInputError.textContent = `讀取對手資料時發生錯誤：${result.error && result.error.message ? result.error.message : '請檢查網路連線後再試一次'}`;
            }
            return;
        }
        if (result.status === 'not-found') {
            if (this.domInputError) this.domInputError.textContent = '找不到這個暱稱的玩家，請確認暱稱是否正確';
            return;
        }

        this.opponentName = raw;
        this.opponentTricks = result.tricks;
        if (this.domInputError) this.domInputError.textContent = '';
        if (this.domOppNameLabel1) this.domOppNameLabel1.textContent = raw;
        if (this.domOppNameLabel2) this.domOppNameLabel2.textContent = raw;

        this.comparedTricks = this.buildComparedTricks();
        // 預設全部勾選：一進入選招式畫面，所有比對出來的招式都先勾好，使用者只需要取消不要的
        this.selectedTrickIds = new Set(this.comparedTricks.map(t => t.id));

        this.initFilterOptions();
        this.renderTrickList();
        this.showStage('select');
    },

    // 比對雙方招式庫。只比較非自訂招式（雙方都用同一份 defaultTricks 為基準，避免自訂招式 id 對不上）。
    // 每個招式標記一組 tags（可以同時符合多個），用來對應選招式畫面上方的 5 個分類 checkbox：
    // - both-mastered：雙方都已經用「移除熟練招式」標記為已熟練
    // - a-mastered：你（A）已經標記為已熟練
    // - b-mastered：對方（B）已經標記為已熟練
    // - a-unlocked：你（A）已解鎖但還沒被標記為已熟練
    // - b-unlocked：對方（B）已解鎖但還沒被標記為已熟練
    // 雙方都還沒解鎖的招式（沒有任何 tag）不列入對戰候選。
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

            const tags = [];
            if (myStatus === 'mastered' && oppStatus === 'mastered') tags.push('both-mastered');
            if (myStatus === 'mastered') tags.push('a-mastered');
            if (oppStatus === 'mastered') tags.push('b-mastered');
            if (myStatus === 'unlocked') tags.push('a-unlocked');
            if (oppStatus === 'unlocked') tags.push('b-unlocked');

            return {
                id: mine.id,
                name: mine.name,
                category: mine.category,
                subcategory: mine.subcategory,
                myStatus,
                oppStatus,
                tags
            };
        }).filter(t => t.tags.length > 0);
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

    // 新增：套用上方 5 個分類 checkbox（只要招式符合其中一個「勾選中」的 tag 就顯示，OR 邏輯），
    // 再套用大小分類篩選，回傳最終要顯示（也是最終會被拿去對戰）的招式清單
    getFilteredTricks() {
        const selectedCat = this.domFilterCategory ? this.domFilterCategory.value : '';
        const selectedSub = this.domFilterSubcategory ? this.domFilterSubcategory.value : '';

        const enabledTags = new Set();
        if (this.domChkBothMastered && this.domChkBothMastered.checked) enabledTags.add('both-mastered');
        if (this.domChkAMastered && this.domChkAMastered.checked) enabledTags.add('a-mastered');
        if (this.domChkBMastered && this.domChkBMastered.checked) enabledTags.add('b-mastered');
        if (this.domChkAUnlocked && this.domChkAUnlocked.checked) enabledTags.add('a-unlocked');
        if (this.domChkBUnlocked && this.domChkBUnlocked.checked) enabledTags.add('b-unlocked');

        return this.comparedTricks.filter(t => {
            if (selectedCat && t.category !== selectedCat) return false;
            if (selectedSub && t.subcategory !== selectedSub) return false;
            return t.tags.some(tag => enabledTags.has(tag));
        });
    },

    // 依照 tags 決定要顯示的分類標籤文字（雙方都熟練時不重複顯示 A/B 熟練招）
    getDisplayLabels(t) {
        const labels = [];
        if (t.tags.includes('both-mastered')) {
            labels.push('雙方都熟練');
        } else {
            if (t.tags.includes('a-mastered')) labels.push('A 熟練招');
            if (t.tags.includes('b-mastered')) labels.push('B 熟練招');
        }
        if (t.tags.includes('a-unlocked')) labels.push('A 已解鎖招');
        if (t.tags.includes('b-unlocked')) labels.push('B 已解鎖招');
        return labels;
    },

    getPriority(t) {
        if (t.tags.includes('both-mastered')) return 0;
        if (t.tags.includes('a-mastered') || t.tags.includes('b-mastered')) return 1;
        return 2;
    },

    renderTrickList() {
        if (!this.domTrickList) return;

        const filtered = this.getFilteredTricks().sort((a, b) => this.getPriority(a) - this.getPriority(b));

        if (filtered.length === 0) {
            this.domTrickList.innerHTML = `<div style="text-align:center; color:#95a5a6; padding: 20px;">沒有符合條件的招式</div>`;
            this.updateSelectSummary();
            this.syncSelectAllCheckbox();
            return;
        }

        this.domTrickList.innerHTML = filtered.map(t => `
            <div class="battle-item side-${t.myStatus} opp-${t.oppStatus}">
                <input type="checkbox" class="battle-checkbox" data-id="${t.id}" ${this.selectedTrickIds.has(t.id) ? 'checked' : ''}>
                <div class="battle-item-info">
                    ${this.getDisplayLabels(t).map(l => `<span class="battle-group-tag">${l}</span>`).join('')}
                    <strong>${t.name}</strong>
                </div>
            </div>
        `).join('');

        this.updateSelectSummary();
        this.syncSelectAllCheckbox();
    },

    syncSelectAllCheckbox() {
        if (!this.domSelectAllCheckbox) return;
        const visible = this.getFilteredTricks();
        const selectedCount = visible.filter(t => this.selectedTrickIds.has(t.id)).length;
        this.domSelectAllCheckbox.checked = visible.length > 0 && selectedCount === visible.length;
        this.domSelectAllCheckbox.indeterminate = selectedCount > 0 && selectedCount < visible.length;
    },

    updateSelectSummary() {
        if (this.domSelectSummary) {
            this.domSelectSummary.textContent = `已選擇 ${this.selectedTrickIds.size} 個招式`;
        }
    },

    confirmSelection() {
        // 對戰池只取「目前篩選條件下看得到、而且有勾選」的招式，
        // 被 checkbox 篩選掉、目前沒顯示出來的招式即使之前勾過也不會算進去。
        const visible = this.getFilteredTricks();
        this.battlePool = visible.filter(t => this.selectedTrickIds.has(t.id));

        if (this.battlePool.length === 0) {
            alert('請至少勾選一個招式再開始對戰！');
            return;
        }

        this.battleHistory = [];
        this.myMarks = new Array(KEN_LETTERS.length).fill(false);
        this.oppMarks = new Array(KEN_LETTERS.length).fill(false);
        this.gameOver = false;

        this.renderMarks();
        if (this.domResultMessage) this.domResultMessage.classList.add('hidden');
        if (this.domBothSuccessBtn) this.domBothSuccessBtn.disabled = false;

        this.showStage('play');
        this.drawNextTrick();
    },

    // 用 K-E-N 三個字母代表每一邊的失誤次數，哪一邊沒接到就點亮那一邊的一個字母；
    // 再點一次已經點亮的字母可以取消（修正誤觸）。點滿 K-E-N 的那一邊輸了。
    renderMarks() {
        const renderSide = (container, marks) => {
            if (!container) return;
            container.innerHTML = marks.map((lit, i) => `
                <button type="button" class="mark-btn ${lit ? 'lit' : ''}" data-index="${i}" ${this.gameOver ? 'disabled' : ''}>${KEN_LETTERS[i]}</button>
            `).join('');
        };
        renderSide(this.domMyMarks, this.myMarks);
        renderSide(this.domOppMarks, this.oppMarks);
    },

    toggleMark(side, index) {
        if (this.gameOver) return;
        const marks = side === 'me' ? this.myMarks : this.oppMarks;
        if (!marks || index < 0 || index >= marks.length) return;

        const wasLit = marks[index];
        marks[index] = !wasLit;
        this.renderMarks();

        // 只有「新點亮」才代表這一輪出現了失誤，需要檢查是否遊戲結束、並抽下一招；
        // 取消點亮（修正誤觸）不會觸發這些動作。
        if (!wasLit) {
            if (this.checkGameOver()) return;
            this.drawNextTrick();
        }
    },

    checkGameOver() {
        const myFull = this.myMarks.every(Boolean);
        const oppFull = this.oppMarks.every(Boolean);
        if (!myFull && !oppFull) return false;

        this.gameOver = true;
        if (this.domBothSuccessBtn) this.domBothSuccessBtn.disabled = true;
        this.renderMarks();

        if (this.domResultMessage) {
            const text = myFull && oppFull
                ? '平手！雙方同時點滿 K-E-N'
                : (myFull ? `${this.opponentName || '對方'} 獲勝！` : '你獲勝了！');
            this.domResultMessage.textContent = text;
            this.domResultMessage.classList.remove('hidden');
        }
        return true;
    },

    drawNextTrick() {
        if (this.gameOver || this.battlePool.length === 0 || !this.domDrawResult) return;

        let available = this.battlePool.filter(t => !this.battleHistory.includes(t.id));
        if (available.length === 0) {
            this.battleHistory = [];
            available = this.battlePool;
        }

        const picked = available[Math.floor(Math.random() * available.length)];
        this.battleHistory.push(picked.id);
        this.currentTrick = picked;

        this.domDrawResult.innerText = TrickLibrary.formatTrickLabel(picked);
    }
};
