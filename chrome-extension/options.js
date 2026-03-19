const els = {
  pathName: document.getElementById("path-name"),
  targetAccuracy: document.getElementById("target-accuracy"),
  frustrationThreshold: document.getElementById("frustration-threshold"),
  coachEnabled: document.getElementById("coach-enabled"),
  autoAdvance: document.getElementById("auto-advance"),
  addForm: document.getElementById("add-step-form"),
  stepId: document.getElementById("step-id"),
  stepTitle: document.getElementById("step-title"),
  stepType: document.getElementById("step-type"),
  stepSlug: document.getElementById("step-slug"),
  stepPrereq: document.getElementById("step-prereq"),
  pathList: document.getElementById("path-list"),
  resultsList: document.getElementById("results-list"),
  saveBtn: document.getElementById("save-btn"),
  clearResultsBtn: document.getElementById("clear-results-btn"),
  status: document.getElementById("status")
};

let state = {
  pathName: "Default Path",
  targetAccuracy: 80,
  frustrationThreshold: 3,
  coachEnabled: true,
  autoAdvance: true,
  path: [],
  recentResults: []
};

function setStatus(message) {
  els.status.textContent = message;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function renderPath() {
  if (!state.path.length) {
    els.pathList.innerHTML = "<div class=\"subtle\">No steps added yet.</div>";
    return;
  }
  els.pathList.innerHTML = state.path
    .map((step, index) => {
      const prereq = step.prerequisites?.length ? step.prerequisites.join(", ") : "none";
      return `
        <div class="path-item">
          <div class="path-item__top">
            <strong>${index + 1}. ${escapeHtml(step.title)}</strong>
            <span class="chip ${step.type === "practice" ? "practice" : ""}">${escapeHtml(step.type)}</span>
          </div>
          <div><code>${escapeHtml(step.slug)}</code></div>
          <div class="subtle">id: <code>${escapeHtml(step.id)}</code> | prereq: ${escapeHtml(prereq)}</div>
          <div>
            <button type="button" data-action="up" data-id="${escapeHtml(step.id)}">Move up</button>
            <button type="button" data-action="down" data-id="${escapeHtml(step.id)}">Move down</button>
            <button type="button" data-action="remove" data-id="${escapeHtml(step.id)}">Remove</button>
          </div>
        </div>
      `;
    })
    .join("");
}

function renderResults() {
  if (!state.recentResults.length) {
    els.resultsList.innerHTML = "<div class=\"subtle\">No captured results yet.</div>";
    return;
  }
  const last = [...state.recentResults].slice(-20).reverse();
  els.resultsList.innerHTML = last
    .map((result) => {
      const date = new Date(result.completedAt || Date.now()).toLocaleString();
      return `
        <div class="result-item">
          <strong>${escapeHtml(result.stepId)}</strong>
          <div>Score: ${escapeHtml(result.score)}%</div>
          <div class="subtle">${escapeHtml(date)}</div>
        </div>
      `;
    })
    .join("");
}

function hydrateForm() {
  els.pathName.value = state.pathName || "";
  els.targetAccuracy.value = state.targetAccuracy;
  els.frustrationThreshold.value = state.frustrationThreshold;
  els.coachEnabled.checked = state.coachEnabled !== false;
  els.autoAdvance.checked = state.autoAdvance !== false;
}

function collectSettings() {
  return {
    ...state,
    pathName: els.pathName.value.trim() || "Default Path",
    targetAccuracy: Number(els.targetAccuracy.value || 80),
    frustrationThreshold: Number(els.frustrationThreshold.value || 3),
    coachEnabled: els.coachEnabled.checked,
    autoAdvance: els.autoAdvance.checked
  };
}

async function load() {
  const response = await chrome.runtime.sendMessage({ type: "KF_GET_SETTINGS" });
  if (!response?.ok) {
    setStatus(response?.error || "Could not load settings.");
    return;
  }
  state = { ...state, ...response.settings };
  hydrateForm();
  renderPath();
  renderResults();
  setStatus("Loaded.");
}

els.addForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const id = els.stepId.value.trim();
  const title = els.stepTitle.value.trim();
  const type = els.stepType.value === "practice" ? "practice" : "lesson";
  const slug = els.stepSlug.value.trim();
  const prerequisites = els.stepPrereq.value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  if (!id || !title || !slug) {
    setStatus("Step id, title, and slug are required.");
    return;
  }
  if (state.path.some((step) => step.id === id)) {
    setStatus("Step id must be unique.");
    return;
  }
  state.path.push({ id, title, type, slug, prerequisites });
  renderPath();
  els.addForm.reset();
  setStatus("Step added.");
});

els.pathList.addEventListener("click", (event) => {
  const target = event.target;
  if (!(target instanceof HTMLElement)) {
    return;
  }
  const action = target.getAttribute("data-action");
  const id = target.getAttribute("data-id");
  if (!action || !id) {
    return;
  }
  const index = state.path.findIndex((step) => step.id === id);
  if (index === -1) {
    return;
  }
  if (action === "remove") {
    state.path.splice(index, 1);
    renderPath();
    setStatus("Step removed.");
    return;
  }
  if (action === "up" && index > 0) {
    const temp = state.path[index - 1];
    state.path[index - 1] = state.path[index];
    state.path[index] = temp;
    renderPath();
    setStatus("Step moved up.");
    return;
  }
  if (action === "down" && index < state.path.length - 1) {
    const temp = state.path[index + 1];
    state.path[index + 1] = state.path[index];
    state.path[index] = temp;
    renderPath();
    setStatus("Step moved down.");
  }
});

els.saveBtn.addEventListener("click", async () => {
  const payload = collectSettings();
  const response = await chrome.runtime.sendMessage({
    type: "KF_SAVE_SETTINGS",
    settings: payload
  });
  if (!response?.ok) {
    setStatus(response?.error || "Save failed.");
    return;
  }
  state = { ...state, ...response.settings };
  renderPath();
  renderResults();
  setStatus("Settings saved.");
});

els.clearResultsBtn.addEventListener("click", async () => {
  state.recentResults = [];
  const response = await chrome.runtime.sendMessage({
    type: "KF_SAVE_SETTINGS",
    settings: collectSettings()
  });
  if (!response?.ok) {
    setStatus(response?.error || "Could not clear results.");
    return;
  }
  state = { ...state, ...response.settings };
  renderResults();
  setStatus("Results cleared.");
});

load();
