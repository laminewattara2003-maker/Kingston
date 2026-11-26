window.app = {
    state: {
        subjects: [],
        deletedIds: [],
        pendingCloudDeletes: [],
        weakQuestionsBySubject: {},
        studentName: "",
        theme: "light"
    },

    quiz: {
        subjectId: null,
        subjectTitle: "",
        allSubjectQuestions: [],
        currentQuestions: [],
        userHistory: [],
        currentIndex: 0,
        lastCorrectIndex: null,
        score: 0,
        correct: 0,
        wrong: 0,
        selectedOptionIndex: null,
        timerInterval: null,
        timeLeft: 45,
        elapsedSeconds: 0,
        isRetryMode: false
    },

    currentViewZone: 'student-zone',
    _isSyncing: false,
    _autoSyncInterval: null,

    escapeHtml(value) {
        return String(value ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    },

    escapeAttr(value) {
        return this.escapeHtml(value).replace(/`/g, '&#96;');
    },

    init() {
        this.loadFromStorage();
        this.state.deletedIds = Array.isArray(this.state.deletedIds) ? this.state.deletedIds : [];
        this.state.pendingCloudDeletes = Array.isArray(this.state.pendingCloudDeletes) ? this.state.pendingCloudDeletes : [];
        this.state.weakQuestionsBySubject = (this.state.weakQuestionsBySubject && typeof this.state.weakQuestionsBySubject === 'object')
            ? this.state.weakQuestionsBySubject
            : {};
        this.filterOutDeletedSubjects();
        this.applyTheme();
        this.populateTopicFilter();
        this.renderDashboard();
        this.initGlobalTimer();
        this.setupAutomaticSync();
    },

    isDeletedSubject(subjectId) {
        if (!subjectId) return false;
        return (this.state.deletedIds || []).includes(String(subjectId));
    },

    filterOutDeletedSubjects() {
        const deletedSet = new Set((this.state.deletedIds || []).map(String));
        this.state.subjects = (this.state.subjects || []).filter(s => !deletedSet.has(String(s.id)));
    },

    setupAutomaticSync() {
        const triggerSync = () => {
            if (navigator.onLine && this.refreshSharedCoursesForStudent) {
                this.refreshSharedCoursesForStudent(false);
            }
        };

        triggerSync();

        document.addEventListener("visibilitychange", () => {
            if (document.visibilityState === "visible") {
                triggerSync();
            }
        });

        window.addEventListener("focus", triggerSync);
        window.addEventListener("online", triggerSync);

        if (this._autoSyncInterval) clearInterval(this._autoSyncInterval);
        this._autoSyncInterval = setInterval(() => {
            const isInQuiz = document.getElementById('view-quiz')?.classList.contains('active');
            if (document.visibilityState === "visible" && navigator.onLine && !isInQuiz) {
                this.refreshSharedCoursesForStudent(false);
            }
        }, 20000);
    },

    saveToStorage() {
        try {
            localStorage.setItem('smart_composition_v3', JSON.stringify(this.state));
        } catch (e) {}
    },

    loadFromStorage() {
        try {
            const raw = localStorage.getItem('smart_composition_v3') || localStorage.getItem('smart_composition_v2');
            if (raw) {
                const parsed = JSON.parse(raw);
                this.state = {
                    ...this.state,
                    ...parsed,
                    deletedIds: Array.isArray(parsed.deletedIds) ? parsed.deletedIds : [],
                    pendingCloudDeletes: Array.isArray(parsed.pendingCloudDeletes) ? parsed.pendingCloudDeletes : [],
                    weakQuestionsBySubject: (parsed.weakQuestionsBySubject && typeof parsed.weakQuestionsBySubject === 'object')
                        ? parsed.weakQuestionsBySubject
                        : {}
                };
            }
        } catch (e) {}
    },

    toggleDarkThemeQuick() {
        const currentAttr = document.documentElement.getAttribute('data-theme');
        const current = currentAttr || this.state.theme || "light";
        const nextMode = current === "dark" ? "light" : "dark";
        this.state.theme = nextMode;
        this.applyTheme();
        this.saveToStorage();
    },

    applyTheme() {
        const mode = this.state.theme === "dark" ? "dark" : "light";
        document.documentElement.setAttribute('data-theme', mode);
        document.documentElement.style.colorScheme = mode;
        if (document.body) {
            document.body.setAttribute('data-theme', mode);
        }
        const btn = document.getElementById('theme-toggle-btn');
        if (btn) {
            btn.textContent = mode === "dark" ? "☀️" : "🌙";
        }
    },

    goHome() {
        clearInterval(this.quiz.timerInterval);
        if (this.currentViewZone === 'editor-zone') {
            this.switchView('editor-dashboard');
        } else {
            this.switchView('dashboard');
            if (this.refreshSharedCoursesForStudent) {
                this.refreshSharedCoursesForStudent(false);
            }
        }
    },

    switchView(viewId) {
        const activeZone = document.getElementById(this.currentViewZone);
        if (!activeZone) return;

        activeZone.querySelectorAll('.app-view').forEach(v => v.classList.remove('active'));
        const targetView = document.getElementById(`view-${viewId}`);
        if (targetView) targetView.classList.add('active');

        window.scrollTo({ top: 0, behavior: 'smooth' });
        if (viewId === 'dashboard') {
            this.populateTopicFilter();
            this.renderDashboard();
        }
    },

    extractQuestionsFromSubject(subject) {
        const rawList = Array.isArray(subject.questions) && subject.questions.length > 0
            ? subject.questions
            : (() => {
                const extracted = [];
                (subject.chapters || []).forEach(ch => {
                    (ch.parts || []).forEach(pt => {
                        if (Array.isArray(pt.questions)) {
                            extracted.push(...pt.questions);
                        }
                    });
                });
                return extracted;
            })();

        return rawList.map((q, idx) => ({
            ...q,
            _qid: String(q._qid || q.id || `q_${idx}_${(q.question || '').slice(0, 24)}`),
            topic: String(q.topic || subject.topic || "Général").trim() || "Général",
            keyTakeaway: String(q.keyTakeaway || q.synthesis || "").trim()
        }));
    },

    populateTopicFilter() {
        const select = document.getElementById('filter-topic-select');
        if (!select) return;
        const currentVal = select.value;
        const topics = Array.from(new Set(
            (this.state.subjects || [])
                .map(s => String(s.topic || "").trim())
                .filter(Boolean)
        )).sort((a, b) => a.localeCompare(b, 'fr'));

        select.innerHTML = '<option value="">Toutes les matières</option>';
        topics.forEach(t => {
            const opt = document.createElement('option');
            opt.value = t;
            opt.textContent = t;
            select.appendChild(opt);
        });
        if (topics.includes(currentVal)) {
            select.value = currentVal;
        }
    },

    renderDashboard() {
        this.filterOutDeletedSubjects();
        const container = document.getElementById('courses-list');
        if (!container) return;
        container.innerHTML = '';

        const searchQ = (document.getElementById('filter-search-input')?.value || "").trim().toLowerCase();
        const selectedTopic = (document.getElementById('filter-topic-select')?.value || "").trim();

        const filtered = (this.state.subjects || []).filter(subj => {
            const topic = String(subj.topic || "").trim();
            const matchesTopic = !selectedTopic || topic === selectedTopic;
            const matchesSearch = !searchQ ||
                String(subj.title || "").toLowerCase().includes(searchQ) ||
                topic.toLowerCase().includes(searchQ);
            return matchesTopic && matchesSearch;
        });

        if (filtered.length === 0) {
            container.innerHTML = `
                <div class="course-card" style="text-align:center;">
                    <p style="font-weight:700;">Aucun sujet disponible pour le moment.</p>
                    <p class="text-muted">Les sujets apparaîtront automatiquement dès leur publication.</p>
                </div>`;
            return;
        }

        const visibleCards = filtered.slice(0, 2);
        visibleCards.forEach(subj => {
            const questions = this.extractQuestionsFromSubject(subj);
            const weakIds = this.state.weakQuestionsBySubject[String(subj.id)] || [];
            const topicLabel = subj.topic ? `<span class="tag-pill">${this.escapeHtml(subj.topic)}</span>` : '';
            const weakBadge = weakIds.length > 0
                ? `<span class="tag-pill warn">🔁 ${weakIds.length} à revoir</span>`
                : '';
            const synthesisHtml = subj.synthesis
                ? `<div class="synthesis-box"><strong>Synthèse :</strong> ${this.escapeHtml(subj.synthesis)}</div>`
                : '';

            const card = document.createElement('div');
            card.className = 'course-card';
            card.innerHTML = `
                <div>
                    <h3 style="font-weight:800; font-size:1.08rem;">${this.escapeHtml(subj.title)}</h3>
                    <div class="course-tags">
                        ${topicLabel}
                        <span class="tag-pill">${questions.length} question(s)</span>
                        ${weakBadge}
                    </div>
                </div>
                ${synthesisHtml}
                <button class="btn-compose-main">✍️ Composer</button>
            `;
            card.querySelector('.btn-compose-main').onclick = () => this.prepareSubjectAndAskName(subj.id);
            container.appendChild(card);
        });
    },

    prepareSubjectAndAskName(subjectId) {
        if (this.isDeletedSubject(subjectId)) return;
        const subj = this.state.subjects.find(s => s.id === subjectId);
        if (!subj) return;

        const questions = this.extractQuestionsFromSubject(subj);
        if (questions.length === 0) {
            alert("Ce sujet ne contient pas encore de questions.");
            return;
        }

        this.quiz.subjectId = subj.id;
        this.quiz.subjectTitle = subj.title;
        this.quiz.allSubjectQuestions = questions;

        const modal = document.getElementById('student-name-modal');
        const input = document.getElementById('student-name-input');
        const err = document.getElementById('student-name-error');
        err.classList.add('hidden');
        input.value = this.state.studentName || "";
        modal.classList.remove('hidden');
        input.focus();
    },

    closeStudentNameModal() {
        document.getElementById('student-name-modal').classList.add('hidden');
    },

    confirmStudentNameAndStart() {
        const input = document.getElementById('student-name-input');
        const err = document.getElementById('student-name-error');
        const name = input.value.trim();

        if (name.length < 2) {
            err.textContent = "Entre ton nom complet (au moins 2 caractères).";
            err.classList.remove('hidden');
            return;
        }

        this.state.studentName = name;
        this.saveToStorage();
        this.closeStudentNameModal();

        const weakSet = new Set((this.state.weakQuestionsBySubject[String(this.quiz.subjectId)] || []).map(String));
        const weakList = this.quiz.allSubjectQuestions.filter(q => weakSet.has(String(q._qid))).sort(() => Math.random() - 0.5);
        const normalList = this.quiz.allSubjectQuestions.filter(q => !weakSet.has(String(q._qid))).sort(() => Math.random() - 0.5);
        const ordered = [...weakList, ...normalList];

        this.startQuiz(ordered, false);
    },

    shuffleOptionsAvoidRepeatSlot(options, currentCorrectIndex, forbiddenIndex) {
        const cleanOptions = options.map(o => String(o || "").trim());
        const n = cleanOptions.length;
        const correctValue = cleanOptions[currentCorrectIndex];
        let indices = cleanOptions.map((_, i) => i);

        for (let attempt = 0; attempt < 25; attempt++) {
            indices = cleanOptions.map((_, i) => i).sort(() => Math.random() - 0.5);
            const newPos = indices.indexOf(currentCorrectIndex);
            if (n <= 1 || forbiddenIndex === null || forbiddenIndex === undefined || newPos !== forbiddenIndex) {
                break;
            }
        }

        const shuffledOptions = indices.map(i => cleanOptions[i]);
        let newAnswerIndex = shuffledOptions.indexOf(correctValue);

        if (n > 1 && forbiddenIndex !== null && forbiddenIndex !== undefined && newAnswerIndex === forbiddenIndex) {
            const swapIdx = (forbiddenIndex + 1) % n;
            const temp = shuffledOptions[forbiddenIndex];
            shuffledOptions[forbiddenIndex] = shuffledOptions[swapIdx];
            shuffledOptions[swapIdx] = temp;
            newAnswerIndex = swapIdx;
        }

        return {
            options: shuffledOptions,
            answer: newAnswerIndex
        };
    },

    prepareQuestionForDisplay(question, forbiddenIndex) {
        const baseOptions = Array.isArray(question.options) ? question.options : [];
        const safeAnsIdx = (typeof question.answer === 'number' && question.answer >= 0 && question.answer < baseOptions.length)
            ? question.answer
            : 0;
        const correctRaw = String(baseOptions[safeAnsIdx] || "").trim();

        const shuffled = this.shuffleOptionsAvoidRepeatSlot(baseOptions, safeAnsIdx, forbiddenIndex);
        const finalAnsIdx = shuffled.options.indexOf(correctRaw);

        return {
            ...question,
            options: shuffled.options,
            answer: finalAnsIdx >= 0 ? finalAnsIdx : shuffled.answer
        };
    },

    startQuiz(questionsList, isRetry = false) {
        this.quiz.currentQuestions = questionsList;
        this.quiz.isRetryMode = isRetry;
        this.quiz.userHistory = [];
        this.quiz.currentIndex = 0;
        this.quiz.lastCorrectIndex = null;
        this.quiz.score = 0;
        this.quiz.correct = 0;
        this.quiz.wrong = 0;
        this.quiz.elapsedSeconds = 0;

        document.getElementById('quiz-participant-name').innerText = this.state.studentName;
        document.getElementById('quiz-subject-subtitle').innerText = this.quiz.subjectTitle;
        document.getElementById('quiz-timer').innerText = "00:00";

        this.switchView('quiz');
        this.showQuestion();
    },

    showQuestion() {
        const rawQuestion = this.quiz.currentQuestions[this.quiz.currentIndex];
        const question = this.prepareQuestionForDisplay(rawQuestion, this.quiz.lastCorrectIndex);
        this.quiz.currentQuestions[this.quiz.currentIndex] = question;
        this.quiz.lastCorrectIndex = question.answer;

        const total = this.quiz.currentQuestions.length;

        document.getElementById('quiz-question-number').innerText = this.quiz.isRetryMode
            ? `Erreur ${this.quiz.currentIndex + 1} / ${total}`
            : `Question ${this.quiz.currentIndex + 1} / ${total}`;
        document.getElementById('quiz-question-text').innerText = question.question;

        const topicEl = document.getElementById('quiz-current-topic');
        if (topicEl) topicEl.innerText = question.topic || "Général";

        document.getElementById('quiz-progress-line').style.width = `${((this.quiz.currentIndex + 1) / total) * 100}%`;

        this.quiz.timeLeft = 45;
        document.getElementById('question-timer-val').innerText = `${this.quiz.timeLeft}s`;

        clearInterval(this.quiz.timerInterval);
        this.quiz.timerInterval = setInterval(() => {
            this.quiz.timeLeft--;
            document.getElementById('question-timer-val').innerText = `${this.quiz.timeLeft}s`;
            if (this.quiz.timeLeft <= 0) {
                clearInterval(this.quiz.timerInterval);
                this.validateAnswer(true);
            }
        }, 1000);

        const container = document.getElementById('quiz-options-container');
        container.innerHTML = '';
        this.quiz.selectedOptionIndex = null;

        const letters = ['A', 'B', 'C', 'D', 'E'];
        question.options.forEach((opt, idx) => {
            const btn = document.createElement('button');
            btn.className = 'option-item';
            btn.innerHTML = `
                <span class="option-letter">${letters[idx] || idx + 1}</span>
                <span class="option-string">${this.escapeHtml(opt)}</span>
            `;
            btn.onclick = () => this.selectOption(idx, btn);
            container.appendChild(btn);
        });
    },

    selectOption(index, element) {
        this.quiz.selectedOptionIndex = index;
        document.querySelectorAll('.option-item').forEach(item => item.classList.remove('selected'));
        element.classList.add('selected');
    },

    validateAnswer(forcedTimeout = false) {
        clearInterval(this.quiz.timerInterval);

        if (this.quiz.selectedOptionIndex === null && !forcedTimeout) {
            alert("Choisis une option avant de valider.");
            return;
        }

        const question = this.quiz.currentQuestions[this.quiz.currentIndex];
        const isCorrect = !forcedTimeout && (this.quiz.selectedOptionIndex === question.answer);

        this.quiz.userHistory.push({
            questionObj: question,
            chosenIndex: forcedTimeout ? -1 : this.quiz.selectedOptionIndex,
            isCorrect: isCorrect
        });

        if (isCorrect) {
            this.quiz.correct++;
            this.quiz.score += 20;
        } else {
            this.quiz.wrong++;
        }

        this.nextStep();
    },

    nextStep() {
        this.quiz.currentIndex++;
        if (this.quiz.currentIndex < this.quiz.currentQuestions.length) {
            this.showQuestion();
        } else {
            clearInterval(this.quiz.timerInterval);
            this.finishComposition();
        }
    },

    updateSpacedMemory() {
        const subjKey = String(this.quiz.subjectId || "");
        if (!subjKey) return;

        const existing = new Set((this.state.weakQuestionsBySubject[subjKey] || []).map(String));
        this.quiz.userHistory.forEach(item => {
            const qid = String(item.questionObj._qid || "");
            if (!qid) return;
            if (item.isCorrect) {
                existing.delete(qid);
            } else {
                existing.add(qid);
            }
        });

        this.state.weakQuestionsBySubject[subjKey] = Array.from(existing);
        this.saveToStorage();
    },

    getEncouragementPhrase(grade) {
        if (grade >= 18) return "Excellente maîtrise sur l'ensemble du sujet.";
        if (grade >= 15) return "Très bon niveau. Quelques détails suffisent pour viser le sommet.";
        if (grade >= 12) return "Bon résultat. Parcours la correction pour renforcer les points clés.";
        if (grade >= 10) return "Moyenne atteinte. Reprends les erreurs pour consolider.";
        return "Reprends les questions ratées pour ancrer les notions essentielles.";
    },

    async finishComposition() {
        const total = this.quiz.currentQuestions.length;
        const grade = Number(((this.quiz.correct / total) * 20).toFixed(2));

        this.updateSpacedMemory();

        document.getElementById('res-student-name').innerText = this.state.studentName;
        document.getElementById('res-grade').innerText = grade.toFixed(1);
        document.getElementById('res-summary-counts').innerText = `${this.quiz.correct} / ${total} bonnes réponses`;
        document.getElementById('res-encouragement').innerText = this.getEncouragementPhrase(grade);

        const wrongItems = this.quiz.userHistory.filter(h => !h.isCorrect);
        const retryBtn = document.getElementById('btn-retry-wrong');
        if (wrongItems.length > 0) {
            retryBtn.classList.remove('hidden');
            document.getElementById('wrong-count-btn').innerText = wrongItems.length;
        } else {
            retryBtn.classList.add('hidden');
        }

        this.renderTopicBreakdown();
        this.renderCorrectionGrid();
        this.switchView('results');

        if (!this.quiz.isRetryMode) {
            await this.submitScoreToLeaderboard(grade, this.quiz.correct, total, this.quiz.elapsedSeconds);
        }
        await this.loadLeaderboard(this.quiz.subjectId);
    },

    renderTopicBreakdown() {
        const container = document.getElementById('topic-breakdown-container');
        const reviewBox = document.getElementById('spaced-review-box');
        if (!container) return;

        const stats = {};
        this.quiz.userHistory.forEach(item => {
            const topic = item.questionObj.topic || "Général";
            if (!stats[topic]) stats[topic] = { total: 0, correct: 0 };
            stats[topic].total++;
            if (item.isCorrect) stats[topic].correct++;
        });

        container.innerHTML = '';
        Object.entries(stats).forEach(([topic, st]) => {
            const row = document.createElement('div');
            row.className = 'topic-row';
            row.innerHTML = `
                <span>${this.escapeHtml(topic)}</span>
                <span>${st.correct} / ${st.total}</span>
            `;
            container.appendChild(row);
        });

        const weakCount = (this.state.weakQuestionsBySubject[String(this.quiz.subjectId)] || []).length;
        if (reviewBox) {
            if (weakCount > 0) {
                reviewBox.classList.remove('hidden');
                reviewBox.innerText = `${weakCount} question(s) à revoir prioritairement lors de la prochaine session.`;
            } else {
                reviewBox.classList.add('hidden');
            }
        }
    },

    renderCorrectionGrid() {
        const container = document.getElementById('correction-grid-container');
        container.innerHTML = '';

        this.quiz.userHistory.forEach((item, idx) => {
            const q = item.questionObj;
            const userChoice = item.chosenIndex === -1 ? "Temps écoulé" : q.options[item.chosenIndex];
            const goodChoice = q.options[q.answer];
            const keyTip = q.keyTakeaway || q.explanation || "";

            const card = document.createElement('div');
            card.className = `correction-item ${item.isCorrect ? 'is-correct' : 'is-wrong'}`;
            card.innerHTML = `
                <div class="correction-item-header">
                    <span>Q${idx + 1} • ${this.escapeHtml(q.topic || 'Général')}</span>
                    <span>${item.isCorrect ? '✅ Juste' : '❌ Faux'}</span>
                </div>
                <p class="correction-q">${this.escapeHtml(q.question)}</p>
                <p class="correction-ans"><strong>Ta réponse :</strong> ${this.escapeHtml(userChoice)}</p>
                ${!item.isCorrect ? `<p class="correction-good"><strong>Bonne réponse :</strong> ${this.escapeHtml(goodChoice)}</p>` : ''}
                ${q.explanation ? `<p class="correction-exp">${this.escapeHtml(q.explanation)}</p>` : ''}
                ${keyTip ? `<p class="correction-key">Synthèse : ${this.escapeHtml(keyTip)}</p>` : ''}
            `;
            container.appendChild(card);
        });
    },

    retryWrongQuestions() {
        const wrongQuestions = this.quiz.userHistory
            .filter(h => !h.isCorrect)
            .map(h => h.questionObj)
            .sort(() => Math.random() - 0.5);
        if (wrongQuestions.length === 0) return;
        this.startQuiz(wrongQuestions, true);
    },

    async submitScoreToLeaderboard(grade, correct, total, timeSec) {
        if (!this.TEAM_API_URL) return;
        try {
            await fetch(this.TEAM_API_URL, {
                method: "POST",
                headers: { "Content-Type": "text/plain;charset=utf-8" },
                body: JSON.stringify({
                    action: "submitScore",
                    courseId: this.quiz.subjectId,
                    name: this.state.studentName,
                    grade: grade,
                    correct: correct,
                    total: total,
                    timeSec: timeSec
                })
            });
        } catch (e) {}
    },

    async loadLeaderboard(subjectId) {
        const container = document.getElementById('leaderboard-container');
        if (!container || !this.TEAM_API_URL) return;

        container.innerHTML = '<p class="text-muted">Chargement du classement...</p>';
        try {
            const res = await fetch(`${this.TEAM_API_URL}?action=leaderboard&courseId=${encodeURIComponent(subjectId)}&_t=${Date.now()}`, {
                cache: "no-store"
            });
            const data = await res.json();
            const list = data.leaderboard || [];

            if (list.length === 0) {
                container.innerHTML = '<p class="text-muted">Aucun résultat enregistré pour ce sujet.</p>';
                return;
            }

            container.innerHTML = '';
            list.forEach((entry, idx) => {
                const rank = idx + 1;
                const medal = rank === 1 ? "🥇 1er" : rank === 2 ? "🥈 2e" : rank === 3 ? "🥉 3e" : `${rank}e`;
                const isMe = String(entry.name || "").toLowerCase() === (this.state.studentName || "").toLowerCase();

                const row = document.createElement('div');
                row.className = `leaderboard-row ${isMe ? 'is-me' : ''}`;
                row.innerHTML = `
                    <div class="lb-rank">${medal}</div>
                    <div class="lb-name">${this.escapeHtml(entry.name)} ${isMe ? '(Toi)' : ''}</div>
                    <div class="lb-grade">${Number(entry.grade).toFixed(1)}/20</div>
                `;
                container.appendChild(row);
            });
        } catch (e) {
            container.innerHTML = '<p style="color:var(--bad);">Impossible de charger le classement.</p>';
        }
    },

    downloadSubject() {
        const subj = this.state.subjects.find(s => s.id === this.quiz.subjectId);
        if (!subj) return;

        const questions = this.extractQuestionsFromSubject(subj);
        const letters = ['A', 'B', 'C', 'D', 'E'];
        const gradeText = document.getElementById('res-grade')?.innerText || "0.0";
        const safeFilename = `Sujet_${String(subj.title || "Composition").replace(/[^a-zA-Z0-9_-]+/g, '_')}.pdf`;

        const jsPDFCtor = window.jspdf && window.jspdf.jsPDF;
        if (jsPDFCtor) {
            const doc = new jsPDFCtor({ unit: "pt", format: "a4" });
            const pageWidth = doc.internal.pageSize.getWidth();
            const pageHeight = doc.internal.pageSize.getHeight();
            const margin = 42;
            const maxWidth = pageWidth - margin * 2;
            let y = 48;

            const ensureSpace = (needed) => {
                if (y + needed > pageHeight - 40) {
                    doc.addPage();
                    y = 48;
                }
            };

            doc.setFont("helvetica", "bold");
            doc.setFontSize(16);
            doc.setTextColor(36, 77, 59);
            const titleLines = doc.splitTextToSize(String(subj.title || "Sujet de composition"), maxWidth);
            doc.text(titleLines, margin, y);
            y += titleLines.length * 20 + 6;

            doc.setFont("helvetica", "normal");
            doc.setFontSize(10);
            doc.setTextColor(24, 38, 32);
            const metaLine = `Candidat : ${this.state.studentName || "Étudiant"}  |  Matière : ${subj.topic || "Général"}  |  Note : ${gradeText}/20  |  Date : ${new Date().toLocaleDateString("fr-FR")}`;
            const metaLines = doc.splitTextToSize(metaLine, maxWidth);
            doc.text(metaLines, margin, y);
            y += metaLines.length * 14 + 10;

            if (subj.synthesis) {
                ensureSpace(34);
                doc.setFont("helvetica", "bold");
                doc.text("Synthèse :", margin, y);
                doc.setFont("helvetica", "normal");
                const synthLines = doc.splitTextToSize(String(subj.synthesis), maxWidth - 56);
                doc.text(synthLines, margin + 56, y);
                y += synthLines.length * 14 + 14;
            }

            questions.forEach((q, idx) => {
                ensureSpace(64);
                doc.setFont("helvetica", "bold");
                doc.setFontSize(11);
                doc.setTextColor(24, 38, 32);
                const qLines = doc.splitTextToSize(`Question ${idx + 1} (${q.topic || "Général"}) : ${q.question}`, maxWidth);
                doc.text(qLines, margin, y);
                y += qLines.length * 15 + 4;

                doc.setFontSize(10);
                (q.options || []).forEach((opt, i) => {
                    ensureSpace(18);
                    const isGood = i === q.answer;
                    doc.setFont("helvetica", isGood ? "bold" : "normal");
                    doc.setTextColor(isGood ? 37 : 24, isGood ? 92 : 38, isGood ? 67 : 32);
                    const optLines = doc.splitTextToSize(`  ${letters[i] || i + 1}. ${opt}${isGood ? " (Bonne réponse)" : ""}`, maxWidth - 10);
                    doc.text(optLines, margin + 8, y);
                    y += optLines.length * 14 + 2;
                });

                if (q.explanation) {
                    ensureSpace(22);
                    doc.setFont("helvetica", "italic");
                    doc.setFontSize(9.5);
                    doc.setTextColor(92, 107, 99);
                    const expLines = doc.splitTextToSize(`Correction : ${q.explanation}`, maxWidth - 10);
                    doc.text(expLines, margin + 8, y);
                    y += expLines.length * 13 + 6;
                }

                y += 10;
            });

            doc.save(safeFilename);
            return;
        }

        const plainText = [
            subj.title || "Sujet de composition",
            `Candidat : ${this.state.studentName || "Étudiant"} | Matière : ${subj.topic || "Général"} | Note : ${gradeText}/20`,
            subj.synthesis ? `Synthèse : ${subj.synthesis}` : "",
            ...questions.map((q, idx) => [
                `Question ${idx + 1} (${q.topic || "Général"}) : ${q.question}`,
                ...(q.options || []).map((o, i) => `  ${letters[i] || i + 1}. ${o}${i === q.answer ? " [Bonne réponse]" : ""}`),
                q.explanation ? `  Correction : ${q.explanation}` : ""
            ].filter(Boolean).join("\n"))
        ].filter(Boolean).join("\n\n");

        const blob = new Blob([plainText], { type: "application/pdf" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = safeFilename;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
    },

    initGlobalTimer() {
        setInterval(() => {
            const quizTimerView = document.getElementById('quiz-timer');
            if (quizTimerView && document.getElementById('view-quiz').classList.contains('active')) {
                this.quiz.elapsedSeconds++;
                const mins = Math.floor(this.quiz.elapsedSeconds / 60);
                const secs = this.quiz.elapsedSeconds % 60;
                quizTimerView.innerText = `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
            }
        }, 1000);
    }
};

document.addEventListener("DOMContentLoaded", () => {
    window.app.init();
});
