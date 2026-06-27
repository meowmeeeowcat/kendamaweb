import { AuthSystem } from "./auth.js";
import { TrickLibrary } from "./library.js";

export const AppController = {
    currentStableTrick: null,
    currentChallengeTrick: null,
    historyStableIds: [],
    historyChallengeIds: [],

    init() {
        AuthSystem.init();
        TrickLibrary.init();
        this.nextStableTrick();
        this.nextChallengeTrick();
        this.bindCounterEvents();
        this.bindActionEvents();
    },
    onUserSwitched() {
        this.historyStableIds = [];
        this.historyChallengeIds = [];
        this.nextStableTrick();
        this.nextChallengeTrick();
    },
    nextStableTrick() {
        const availableTricks = TrickLibrary.tricks.filter(t => t.isUnlocked && !this.historyStableIds.includes(t.id));
        if (availableTricks.length === 0) {
            document.querySelector('#stable-trick-card .trick-name').innerText = "🎉 熟練池全數複習完畢！";
            document.querySelector('#stable-trick-card .target-count').innerText = "-";
            document.querySelector('#stable-trick-card .today-count').innerText = "-";
            this.currentStableTrick = null;
            return;
        }
        const randomIndex = Math.floor(Math.random() * availableTricks.length);
        this.currentStableTrick = availableTricks[randomIndex];
        this.historyStableIds.push(this.currentStableTrick.id);
        this.renderStableCard();
    },
    nextChallengeTrick() {
        const availableTricks = TrickLibrary.tricks.filter(t => !t.isUnlocked && !this.historyChallengeIds.includes(t.id));
        if (availableTricks.length === 0) {
            document.querySelector('#challenge-trick-card .trick-name').innerText = "🏆 已通關所有新招式！";
            document.querySelector('#challenge-trick-card .today-count').innerText = "-";
            this.currentChallengeTrick = null;
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
    },
    renderChallengeCard() {
        if (!this.currentChallengeTrick) return;
        document.querySelector('#challenge-trick-card .trick-name').innerText = this.currentChallengeTrick.name;
        document.querySelector('#challenge-trick-card .today-count').innerText = this.currentChallengeTrick.todayCount;
    },
    bindCounterEvents() {
        document.querySelectorAll('#stable-trick-card .btn-count').forEach(btn => {
            btn.addEventListener('click', (e) => {
                if (!this.currentStableTrick) return;
                const amount = parseInt(e.target.getAttribute('data-add'), 10);
                this.currentStableTrick = TrickLibrary.updateCount(this.currentStableTrick.id, amount);
                this.renderStableCard();
            });
        });
        document.querySelectorAll('#challenge-trick-card .btn-count').forEach(btn => {
            btn.addEventListener('click', (e) => {
                if (!this.currentChallengeTrick) return;
                const amount = parseInt(e.target.getAttribute('data-add'), 10);
                this.currentChallengeTrick = TrickLibrary.updateCount(this.currentChallengeTrick.id, amount);
                this.renderChallengeCard();
            });
        });
    },
    bindActionEvents() {
        document.getElementById('btn-stable-complete').addEventListener('click', () => this.nextStableTrick());
        document.getElementById('btn-challenge-complete').addEventListener('click', () => {
            if (!this.currentChallengeTrick) return;
            TrickLibrary.unlockTrick(this.currentChallengeTrick.id);
            this.nextChallengeTrick();
        });
        document.getElementById('btn-challenge-skip').addEventListener('click', () => this.nextChallengeTrick());
    }
};

document.addEventListener("DOMContentLoaded", () => {
    AppController.init();
});