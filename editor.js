window.app.TEAM_API_URL = "https://script.google.com/macros/s/AKfycbzo46xjdD3CHkRwpj_kAFYTAivVwPRS0EcowFHFo6wQdfw7L8c4ZBUE6U5rqJ9KCNuh/exec";

window.app.editingSubjectId = null;

window.app.getPendingCloudDeletes = function() {
    if (!Array.isArray(this.state.pendingCloudDeletes)) {
        this.state.pendingCloudDeletes = [];
    }
    return this.state.pendingCloudDeletes;
};

window.app.queuePendingCloudDelete = function(subjectId) {
    const id = String(subjectId);
    const current = this.getPendingCloudDeletes();
    if (!current.includes(id)) {
        this.state.pendingCloudDeletes = [...current, id];
        this.saveToStorage();
    }
};

window.app.clearPendingCloudDelete = function(subjectId) {
    const id = String(subjectId);
    this.state.pendingCloudDeletes = this.getPendingCloudDeletes().filter(x => String(x) !== id);
    this.saveToStorage();
};

window.app.toggleAdminMode = function() {
    const studentZone = document.getElementById('student-zone');
    const editorZone = document.getElementById('editor-zone');
    const toggleBtn = document.getElementById('toggle-mode-btn');

    if (this.currentViewZone === 'student-zone') {
        studentZone.classList.remove('active');
        editorZone.classList.add('active');
        this.currentViewZone = 'editor-zone';
        toggleBtn.innerText = "Mode Étudiant";
        toggleBtn.style.backgroundColor = "#244d3b";
        toggleBtn.style.color = "#f8f7f2";
        this.switchView('editor-dashboard');
        this.renderEditorDashboard();
    } else {
        editorZone.classList.remove('active');
        studentZone.classList.add('active');
        this.currentViewZone = 'student-zone';
        toggleBtn.innerText = "Espace Éditeur";
        toggleBtn.style.backgroundColor = "var(--surface)";
        toggleBtn.style.color = "var(--accent)";
        this.switchView('dashboard');
    }
};

window.app.parseRawSubjectText = function(rawText, defaultTopic = "Général") {
    const lines = rawText
        .split(/\r?\n/)
        .map(l => l.trim())
        .filter(l => l.length > 0);

    const questions = [];
    let current = null;

    const isQuestionStart = (line) =>
        /^(?:\[[^\]]+\]\s*)?(?:q(?:uestion)?\s*\d*\s*[:.) -]|\d+\s*[.)-])\s+/i.test(line);

    const cleanQuestionStart = (line) => {
        let topic = "";
        const tagMatch = line.match(/^\[(?:notion|thème|theme|module|chapitre)?\s*:?\s*([^\]]+)\]\s*(.+)$/i);
        let body = line;
        if (tagMatch) {
            topic = tagMatch[1].trim();
            body = tagMatch[2].trim();
        }
        body = body.replace(/^(?:q(?:uestion)?\s*\d*\s*[:.) -]|\d+\s*[.)-])\s+/i, "").trim();
        return { text: body, topic: topic || defaultTopic };
    };

    const isOptionLine = (line) =>
        /^(?:[A-Ea-e1-5]\s*[).:-]|[-•*])\s+/.test(line);

    const cleanOptionLine = (line) => {
        const txt = line.replace(/^(?:[A-Ea-e1-5]\s*[).:-]|[-•*])\s+/, "").trim();
        const markedCorrect = /[✓✔]$|\s*\((?:vrai|bon|correct|juste)\)\s*$/i.test(txt);
        const cleanTxt = txt.replace(/[✓✔]$|\s*\((?:vrai|bon|correct|juste)\)\s*$/i, "").trim();
        return { text: cleanTxt, markedCorrect };
    };

    const answerMatch = (line) =>
        line.match(/^(?:réponse|reponse|bonne\s*réponse|bonne\s*reponse|corrigé|corrige|answer)\s*[:=-]\s*(.+)$/i);

    const expMatch = (line) =>
        line.match(/^(?:explication|explanation|justification|note)\s*[:=-]\s*(.+)$/i);

    const keyMatch = (line) =>
        line.match(/^(?:synthèse|synthese|point\s*clé|point\s*cle|à\s*retenir|a\s*retenir|règle|regle)\s*[:=-]\s*(.+)$/i);

    const finalizeQuestion = () => {
        if (!current || !current.question) return;
        if (current.options.length < 2) {
            current.options = ["Vrai", "Faux"];
        }
        if (typeof current.answer !== "number" || current.answer < 0 || current.answer >= current.options.length) {
            current.answer = current.explicitCorrectIndex >= 0 ? current.explicitCorrectIndex : 0;
        }
        questions.push({
            type: "QCM",
            topic: current.topic || defaultTopic,
            question: current.question,
            options: current.options,
            answer: current.answer,
            explanation: current.explanation,
            keyTakeaway: current.keyTakeaway
        });
    };

    for (const line of lines) {
        const ansM = answerMatch(line);
        const expM = expMatch(line);
        const keyM = keyMatch(line);

        if (ansM && current) {
            const rawAns = ansM[1].trim();
            const letterIdx = "ABCDE".indexOf(rawAns.charAt(0).toUpperCase());
            const numIdx = "12345".indexOf(rawAns.charAt(0));
            if (rawAns.length === 1 && letterIdx >= 0 && letterIdx < current.options.length) {
                current.answer = letterIdx;
            } else if (rawAns.length === 1 && numIdx >= 0 && numIdx < current.options.length) {
                current.answer = numIdx;
            } else {
                const foundIdx = current.options.findIndex(o => o.toLowerCase().includes(rawAns.toLowerCase()));
                current.answer = foundIdx >= 0 ? foundIdx : 0;
            }
            continue;
        }

        if (expM && current) {
            current.explanation = expM[1].trim();
            continue;
        }

        if (keyM && current) {
            current.keyTakeaway = keyM[1].trim();
            continue;
        }

        if (isQuestionStart(line)) {
            finalizeQuestion();
            const parsedQ = cleanQuestionStart(line);
            current = {
                question: parsedQ.text,
                topic: parsedQ.topic,
                options: [],
                answer: -1,
                explicitCorrectIndex: -1,
                explanation: "",
                keyTakeaway: ""
            };
            continue;
        }

        if (isOptionLine(line)) {
            if (!current) {
                current = { question: "Question", topic: defaultTopic, options: [], answer: -1, explicitCorrectIndex: -1, explanation: "", keyTakeaway: "" };
            }
            const parsedOpt = cleanOptionLine(line);
            const idx = current.options.length;
            current.options.push(parsedOpt.text);
            if (parsedOpt.markedCorrect && current.explicitCorrectIndex === -1) {
                current.explicitCorrectIndex = idx;
            }
            continue;
        }

        if (!current) {
            const parsedQ = cleanQuestionStart(line);
            current = { question: parsedQ.text, topic: parsedQ.topic, options: [], answer: -1, explicitCorrectIndex: -1, explanation: "", keyTakeaway: "" };
        } else if (current.options.length === 0) {
            current.question += " " + line;
        } else if (current.keyTakeaway) {
            current.keyTakeaway += " " + line;
        } else if (current.explanation) {
            current.explanation += " " + line;
        }
    }

    finalizeQuestion();
    return questions;
};

window.app.understandInput = function(rawInput, fallbackTitle = "", fallbackTopic = "", fallbackSynthesis = "") {
    const trimmed = rawInput.trim();
    if (!trimmed) return [];

    try {
        const json = JSON.parse(trimmed);
        const items = Array.isArray(json) ? json : [json];
        const subjects = [];

        items.forEach((item, i) => {
            const subjId = String(item.id || ("sujet_" + Date.now() + "_" + i));
            if (this.isDeletedSubject(subjId)) return;
            const topic = fallbackTopic || item.topic || item.subject || "Général";
            const synthesis = fallbackSynthesis || item.synthesis || item.summary || "";
            const qs = this.extractQuestionsFromSubject({ ...item, topic: topic });
            if (qs.length > 0) {
                subjects.push({
                    id: subjId,
                    title: fallbackTitle || item.title || `Sujet ${i + 1}`,
                    topic: topic,
                    synthesis: synthesis,
                    questions: qs
                });
            }
        });
        if (subjects.length > 0) return subjects;
    } catch (e) {}

    const effectiveTopic = fallbackTopic || "Général";
    const parsedQuestions = this.parseRawSubjectText(trimmed, effectiveTopic);
    if (parsedQuestions.length > 0) {
        const autoSynth = fallbackSynthesis || parsedQuestions
            .map(q => q.keyTakeaway)
            .filter(Boolean)
            .join(" • ");

        return [{
            id: "sujet_" + Date.now(),
            title: fallbackTitle || "Sujet de composition",
            topic: effectiveTopic,
            synthesis: autoSynth,
            questions: parsedQuestions
        }];
    }

    return [];
};

window.app.previewParsedSubject = function() {
    const raw = document.getElementById('smart-subject-raw').value;
    const title = document.getElementById('smart-subject-title').value.trim();
    const topic = document.getElementById('smart-subject-topic').value.trim();
    const synthesis = document.getElementById('smart-subject-synthesis').value.trim();
    const previewBox = document.getElementById('smart-preview-box');

    const subjects = this.understandInput(raw, title, topic, synthesis);
    previewBox.classList.remove('hidden');

    if (subjects.length === 0) {
        previewBox.innerHTML = `<strong style="color:var(--bad);">Aucune question reconnue.</strong> Vérifie que le texte contient des questions et propositions.`;
        return;
    }

    const totalQ = subjects.reduce((acc, s) => acc + s.questions.length, 0);
    const firstQ = subjects[0].questions[0];

    previewBox.innerHTML = `
        <strong>✅ Compris :</strong> ${subjects.length} sujet(s), <strong>${totalQ} question(s)</strong> détectée(s) • Matière : <strong>${this.escapeHtml(subjects[0].topic)}</strong>.<br>
        <span class="text-muted">Aperçu Q1 [${this.escapeHtml(firstQ.topic)}] : ${this.escapeHtml(firstQ.question)} (${firstQ.options.length} choix)</span>
    `;
};

window.app.publishSmartSubject = async function() {
    const raw = document.getElementById('smart-subject-raw').value;
    const title = document.getElementById('smart-subject-title').value.trim();
    const topic = document.getElementById('smart-subject-topic').value.trim();
    const synthesis = document.getElementById('smart-subject-synthesis').value.trim();

    const subjects = this.understandInput(raw, title, topic, synthesis);
    if (subjects.length === 0) {
        alert("Impossible de comprendre ce sujet. Clique d'abord sur « Comprendre / Aperçu ».");
        return;
    }

    for (const subj of subjects) {
        this.state.deletedIds = (this.state.deletedIds || []).filter(id => String(id) !== String(subj.id));
        this.clearPendingCloudDelete(subj.id);
        this.state.subjects = this.state.subjects.filter(s => String(s.id) !== String(subj.id));
        this.state.subjects.push(subj);
        this.saveToStorage();
        await this.publishSubjectToCloud(subj.id, false);
    }

    document.getElementById('smart-subject-raw').value = "";
    document.getElementById('smart-subject-title').value = "";
    document.getElementById('smart-subject-topic').value = "";
    document.getElementById('smart-subject-synthesis').value = "";
    document.getElementById('smart-preview-box').classList.add('hidden');

    this.populateTopicFilter();
    this.renderEditorDashboard();
    alert(`✅ ${subjects.length} sujet(s) compris et publié(s) pour les étudiants.`);
};

window.app.importAndPublishSubject = function(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (e) => {
        const cleanFileTitle = file.name.replace(/\.(json|txt)$/i, "").replace(/[_-]+/g, " ");
        const topic = document.getElementById('smart-subject-topic')?.value.trim() || "";
        const synthesis = document.getElementById('smart-subject-synthesis')?.value.trim() || "";
        const subjects = this.understandInput(e.target.result, cleanFileTitle, topic, synthesis);

        event.target.value = "";
        if (subjects.length === 0) {
            alert("Fichier non reconnu. Vérifie son contenu.");
            return;
        }

        for (const subj of subjects) {
            this.state.deletedIds = (this.state.deletedIds || []).filter(id => String(id) !== String(subj.id));
            this.clearPendingCloudDelete(subj.id);
            this.state.subjects = this.state.subjects.filter(s => String(s.id) !== String(subj.id));
            this.state.subjects.push(subj);
            this.saveToStorage();
            await this.publishSubjectToCloud(subj.id, false);
        }

        this.populateTopicFilter();
        this.renderEditorDashboard();
        alert(`✅ Fichier « ${file.name} » compris et publié pour les étudiants.`);
    };
    reader.readAsText(file);
};

window.app.openCourseCreator = function(subjectToEdit = null) {
    this.switchView('course-creator');
    const stack = document.getElementById('chapters-dynamic-stack');
    const headingEl = document.querySelector('#view-course-creator .editor-nav-header h2');
    const saveBtn = document.getElementById('btn-save-publish');

    if (stack) stack.innerHTML = '';

    if (subjectToEdit) {
        this.editingSubjectId = String(subjectToEdit.id);
        if (headingEl) headingEl.innerText = "Modifier le sujet";
        if (saveBtn) saveBtn.innerText = "💾 Enregistrer les modifications";

        const titleInput = document.getElementById('input-course-title');
        const topicInput = document.getElementById('input-course-topic');
        const synthInput = document.getElementById('input-course-synthesis');

        if (titleInput) titleInput.value = subjectToEdit.title || '';
        if (topicInput) topicInput.value = subjectToEdit.topic || '';
        if (synthInput) synthInput.value = subjectToEdit.synthesis || '';

        const questions = this.extractQuestionsFromSubject(subjectToEdit);
        if (questions.length > 0) {
            questions.forEach(q => this.addQuestionField(q));
        } else {
            this.addQuestionField();
        }
    } else {
        this.editingSubjectId = null;
        if (headingEl) headingEl.innerText = "Création manuelle";
        if (saveBtn) saveBtn.innerText = "🚀 Publier le sujet";

        const titleInput = document.getElementById('input-course-title');
        const topicInput = document.getElementById('input-course-topic');
        const synthInput = document.getElementById('input-course-synthesis');
        if (titleInput) titleInput.value = '';
        if (topicInput) topicInput.value = '';
        if (synthInput) synthInput.value = '';
        this.addQuestionField();
    }
    this.renumberQuestionFields();
};

window.app.editSubject = function(subjectId) {
    const subj = (this.state.subjects || []).find(s => String(s.id) === String(subjectId));
    if (!subj) {
        alert("Sujet introuvable.");
        return;
    }
    this.openCourseCreator(subj);
};

window.app.renumberQuestionFields = function() {
    const stack = document.getElementById('chapters-dynamic-stack');
    if (!stack) return;
    const blocks = stack.querySelectorAll('.form-element');
    blocks.forEach((block, i) => {
        const titleEl = block.querySelector('.question-block-title');
        if (titleEl) titleEl.textContent = `Question ${i + 1}`;
        const removeBtn = block.querySelector('.btn-remove-question');
        if (removeBtn) {
            removeBtn.style.display = blocks.length > 1 ? 'inline-block' : 'none';
        }
    });
};

window.app.removeQuestionField = function(btnEl) {
    const block = btnEl?.closest('.form-element');
    if (!block) return;
    const stack = document.getElementById('chapters-dynamic-stack');
    if (!stack || stack.children.length <= 1) {
        alert("Il faut conserver au moins une question.");
        return;
    }
    block.remove();
    this.renumberQuestionFields();
};

window.app.addQuestionField = function(existingQuestion = null) {
    const stack = document.getElementById('chapters-dynamic-stack');
    if (!stack) return;

    const idx = stack.children.length + 1;
    const box = document.createElement('div');
    box.className = 'form-element';
    box.style.marginTop = '12px';

    const opts = Array.isArray(existingQuestion?.options) ? existingQuestion.options : [];
    const ansIdx = typeof existingQuestion?.answer === 'number' ? existingQuestion.answer : 0;
    const goodOpt = opts[ansIdx] !== undefined ? opts[ansIdx] : (opts[0] || '');
    const otherOpts = opts.filter((_, i) => i !== ansIdx);

    box.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:center; gap:8px;">
            <h4 class="question-block-title" style="font-weight:800; margin:0;">Question ${idx}</h4>
            <button type="button" class="btn-remove-question" onclick="window.app.removeQuestionField(this)" style="background:var(--bad-bg); color:var(--bad); border:none; border-radius:8px; padding:4px 9px; font-size:0.78rem; font-weight:700; cursor:pointer;">✕ Retirer</button>
        </div>
        <input type="text" class="input-q-topic" placeholder="Notion / Chapitre (ex. : Définition, Traitement)">
        <input type="text" class="input-q-text" placeholder="Énoncé de la question" required>
        <input type="text" class="input-q-opt1" placeholder="Bonne réponse" required>
        <input type="text" class="input-q-opt2" placeholder="Proposition 2" required>
        <input type="text" class="input-q-opt3" placeholder="Proposition 3 (facultatif)">
        <textarea class="input-q-explanation" placeholder="Explication pour la grille de correction (facultatif)" style="height:60px;"></textarea>
        <input type="text" class="input-q-key" placeholder="Point clé à retenir (facultatif)">
    `;

    if (existingQuestion) {
        box.querySelector('.input-q-topic').value = existingQuestion.topic || '';
        box.querySelector('.input-q-text').value = existingQuestion.question || '';
        box.querySelector('.input-q-opt1').value = goodOpt;
        box.querySelector('.input-q-opt2').value = otherOpts[0] || '';
        box.querySelector('.input-q-opt3').value = otherOpts[1] || '';
        box.querySelector('.input-q-explanation').value = existingQuestion.explanation || '';
        box.querySelector('.input-q-key').value = existingQuestion.keyTakeaway || '';
    }

    stack.appendChild(box);
    this.renumberQuestionFields();
};

window.app.saveCreatedSubject = async function() {
    const title = document.getElementById('input-course-title').value.trim();
    const subjectTopic = document.getElementById('input-course-topic').value.trim() || "Général";
    const synthesis = document.getElementById('input-course-synthesis').value.trim();

    if (!title) {
        alert("Entre un titre pour ce sujet.");
        return;
    }

    const blocks = document.querySelectorAll('#chapters-dynamic-stack .form-element');
    const questions = [];
    let valid = true;

    blocks.forEach(block => {
        const qTopic = block.querySelector('.input-q-topic').value.trim() || subjectTopic;
        const qText = block.querySelector('.input-q-text').value.trim();
        const qOpt1 = block.querySelector('.input-q-opt1').value.trim();
        const qOpt2 = block.querySelector('.input-q-opt2').value.trim();
        const qOpt3 = block.querySelector('.input-q-opt3').value.trim();
        const qExp = block.querySelector('.input-q-explanation').value.trim();
        const qKey = block.querySelector('.input-q-key').value.trim();

        if (!qText || !qOpt1 || !qOpt2) {
            valid = false;
            return;
        }

        const rawOptions = [qOpt1, qOpt2, qOpt3].filter(Boolean);
        const finalOptions = [...rawOptions].sort(() => Math.random() - 0.5);
        const correctIdx = finalOptions.indexOf(qOpt1);

        questions.push({
            type: "QCM",
            topic: qTopic,
            question: qText,
            options: finalOptions,
            answer: correctIdx !== -1 ? correctIdx : 0,
            explanation: qExp,
            keyTakeaway: qKey
        });
    });

    if (!valid || questions.length === 0) {
        alert("Remplis au moins la question, la bonne réponse et une proposition supplémentaire.");
        return;
    }

    const isUpdating = Boolean(this.editingSubjectId);
    const subjectId = isUpdating ? String(this.editingSubjectId) : ("sujet_" + Date.now());

    const subjectData = {
        id: subjectId,
        title: title,
        topic: subjectTopic,
        synthesis: synthesis,
        questions: questions
    };

    const btn = document.getElementById('btn-save-publish');
    btn.disabled = true;
    btn.innerText = isUpdating ? "⏳ Mise à jour..." : "⏳ Publication...";

    this.state.deletedIds = (this.state.deletedIds || []).filter(id => String(id) !== subjectId);
    this.clearPendingCloudDelete(subjectId);
    this.state.subjects = (this.state.subjects || []).filter(s => String(s.id) !== subjectId);
    this.state.subjects.push(subjectData);
    this.saveToStorage();
    await this.publishSubjectToCloud(subjectData.id, false);

    this.editingSubjectId = null;
    btn.disabled = false;
    btn.innerText = "🚀 Publier le sujet";

    this.populateTopicFilter();
    alert(isUpdating ? "✅ Modifications enregistrées et synchronisées." : "✅ Sujet publié en direct pour les étudiants.");
    this.switchView('editor-dashboard');
    this.renderEditorDashboard();
};

window.app.renderEditorDashboard = function() {
    this.filterOutDeletedSubjects();
    const list = document.getElementById('editor-courses-list');
    const countEl = document.getElementById('editor-count');
    if (countEl) countEl.innerText = this.state.subjects.length;
    if (!list) return;
    list.innerHTML = '';

    if (this.state.subjects.length === 0) {
        list.innerHTML = '<p style="color:rgba(246,244,236,0.75); text-align:center; padding:12px;">Aucun sujet publié.</p>';
        return;
    }

    this.state.subjects.forEach(subj => {
        const qCount = this.extractQuestionsFromSubject(subj).length;
        const row = document.createElement('div');
        row.className = 'course-card';

        const wrap = document.createElement('div');
        wrap.style.cssText = "display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px;";

        const infoDiv = document.createElement('div');
        const titleStrong = document.createElement('strong');
        titleStrong.style.fontSize = '1rem';
        titleStrong.textContent = subj.title || '';

        const metaDiv = document.createElement('div');
        metaDiv.className = 'text-muted';
        metaDiv.style.cssText = "font-size:0.8rem; font-weight:600;";
        metaDiv.textContent = `${subj.topic || 'Général'} • ${qCount} question(s)`;

        infoDiv.appendChild(titleStrong);
        infoDiv.appendChild(metaDiv);

        const actionsDiv = document.createElement('div');
        actionsDiv.style.cssText = "display:flex; gap:10px; align-items:center; flex-wrap:wrap;";

        const editBtn = document.createElement('button');
        editBtn.textContent = "✏️ Modifier";
        editBtn.style.cssText = "background:var(--accent-soft); border:none; color:var(--accent); font-weight:700; padding:6px 10px; border-radius:8px; cursor:pointer;";
        editBtn.onclick = () => this.editSubject(subj.id);

        const syncBtn = document.createElement('button');
        syncBtn.textContent = "☁️ Sync";
        syncBtn.style.cssText = "background:none; border:none; color:var(--accent); font-weight:700; cursor:pointer;";
        syncBtn.onclick = () => this.publishSubjectToCloud(subj.id, true);

        const delBtn = document.createElement('button');
        delBtn.textContent = "🗑️ Supprimer";
        delBtn.style.cssText = "background:none; border:none; color:var(--bad); font-weight:700; cursor:pointer;";
        delBtn.onclick = () => this.deleteSubject(subj.id);

        actionsDiv.appendChild(editBtn);
        actionsDiv.appendChild(syncBtn);
        actionsDiv.appendChild(delBtn);

        wrap.appendChild(infoDiv);
        wrap.appendChild(actionsDiv);
        row.appendChild(wrap);
        list.appendChild(row);
    });
};

window.app.publishSubjectToCloud = async function(subjectId, showNotify = false) {
    if (this.isDeletedSubject(subjectId)) return;
    const subj = this.state.subjects.find(s => String(s.id) === String(subjectId));
    if (!subj || !this.TEAM_API_URL) return;

    try {
        await fetch(this.TEAM_API_URL, {
            method: "POST",
            headers: { "Content-Type": "text/plain;charset=utf-8" },
            body: JSON.stringify({ action: "share", course: subj })
        });
        if (showNotify) alert(`✅ « ${subj.title} » est synchronisé.`);
    } catch (e) {
        if (showNotify) alert("Erreur de synchronisation.");
    }
};

window.app.flushPendingCloudDeletes = async function() {
    const pending = this.getPendingCloudDeletes();
    if (!this.TEAM_API_URL || pending.length === 0) return;

    const remaining = [];
    for (const delId of pending) {
        try {
            const res = await fetch(this.TEAM_API_URL, {
                method: "POST",
                headers: { "Content-Type": "text/plain;charset=utf-8" },
                body: JSON.stringify({ action: "delete", courseId: String(delId) })
            });
            const data = await res.json().catch(() => ({}));
            if (!data || data.status !== "ok") {
                remaining.push(String(delId));
            }
        } catch (e) {
            remaining.push(String(delId));
        }
    }
    this.state.pendingCloudDeletes = remaining;
    this.saveToStorage();
};

window.app.syncAllToCloud = async function() {
    this.filterOutDeletedSubjects();
    await this.flushPendingCloudDeletes();
    for (const s of this.state.subjects) {
        await this.publishSubjectToCloud(s.id, false);
    }
    alert("✅ Tous les sujets actifs sont synchronisés.");
};

window.app.deleteSubject = async function(subjectId) {
    const targetId = String(subjectId);
    const subj = this.state.subjects.find(s => String(s.id) === targetId);
    const label = subj ? `« ${subj.title} »` : "ce sujet";

    if (!confirm(`Supprimer définitivement ${label} de l'application et de Google Sheets ? Cette action est irréversible.`)) {
        return;
    }

    const currentDeleted = Array.isArray(this.state.deletedIds) ? this.state.deletedIds : [];
    if (!currentDeleted.includes(targetId)) {
        this.state.deletedIds = [...currentDeleted, targetId];
    }
    this.queuePendingCloudDelete(targetId);

    if (this.editingSubjectId === targetId) {
        this.editingSubjectId = null;
    }

    this.state.subjects = this.state.subjects.filter(s => String(s.id) !== targetId);
    this.saveToStorage();
    this.populateTopicFilter();
    this.renderEditorDashboard();
    if (this.currentViewZone === 'student-zone') {
        this.renderDashboard();
    }

    if (this.TEAM_API_URL) {
        try {
            const res = await fetch(this.TEAM_API_URL, {
                method: "POST",
                headers: { "Content-Type": "text/plain;charset=utf-8" },
                body: JSON.stringify({ action: "delete", courseId: targetId })
            });
            const data = await res.json().catch(() => ({}));
            if (data && data.status === "ok") {
                this.clearPendingCloudDelete(targetId);
                alert(`🗑️ ${label} a été supprimé définitivement de l'application et de Google Sheets.`);
            } else {
                alert(`🗑️ ${label} supprimé localement. La suppression distante sera renvoyée lors de la prochaine synchronisation.`);
            }
        } catch (e) {
            alert(`🗑️ ${label} supprimé localement. La suppression distante sera renvoyée dès la reconnexion.`);
        }
    }
};

window.app.refreshSharedCoursesForStudent = async function(manual) {
    if (this._isSyncing) return;
    this._isSyncing = true;

    const statusEl = document.getElementById('sync-status-msg');
    if (statusEl) statusEl.innerText = "🔄 Mise à jour automatique...";
    if (!this.TEAM_API_URL) {
        this._isSyncing = false;
        return;
    }

    await this.flushPendingCloudDeletes();

    try {
        const res = await fetch(`${this.TEAM_API_URL}?action=list&_t=${Date.now()}`, {
            cache: "no-store"
        });
        const data = await res.json();
        if (Array.isArray(data.courses)) {
            const deletedSet = new Set((this.state.deletedIds || []).map(String));
            this.state.subjects = data.courses.filter(c => c && !deletedSet.has(String(c.id)));
            this.saveToStorage();
            this.populateTopicFilter();
            if (this.currentViewZone === 'student-zone') {
                this.renderDashboard();
            } else {
                this.renderEditorDashboard();
            }
            const nowTime = new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
            if (statusEl) statusEl.innerText = `✅ Synchronisé automatiquement à ${nowTime} (${this.state.subjects.length} sujet(s))`;
            if (manual) alert(`✅ ${this.state.subjects.length} sujet(s) à jour.`);
        }
    } catch (e) {
        this.filterOutDeletedSubjects();
        if (statusEl) statusEl.innerText = "⚠️ Hors-ligne (données locales)";
        if (manual) alert("Connexion impossible pour le moment.");
    } finally {
        this._isSyncing = false;
    }
};
