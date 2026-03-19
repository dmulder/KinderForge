(function initKinderForgeCoach() {
  const DEBUG = true;
  const LOG_THROTTLE_MS = 3000;
  const LOG_TIMERS = new Map();
  const PERSISTENT_DEBUG_KEY = "kf_debug_log";

  function toSerializable(value) {
    try {
      return JSON.parse(JSON.stringify(value));
    } catch (_error) {
      return String(value);
    }
  }

  function appendPersistentDebug(label, payload) {
    try {
      const existingRaw = window.localStorage.getItem(PERSISTENT_DEBUG_KEY);
      const existing = existingRaw ? JSON.parse(existingRaw) : [];
      const next = Array.isArray(existing) ? existing : [];
      next.push({
        ts: new Date().toISOString(),
        path: window.location.pathname,
        label,
        payload: toSerializable(payload)
      });
      const trimmed = next.slice(-300);
      window.localStorage.setItem(PERSISTENT_DEBUG_KEY, JSON.stringify(trimmed));
    } catch (_error) {
      // Ignore debug persistence failures.
    }
  }

  function debug(label, payload) {
    if (!DEBUG) {
      return;
    }
    const now = Date.now();
    const previous = LOG_TIMERS.get(label) || 0;
    if (now - previous < LOG_THROTTLE_MS) {
      return;
    }
    LOG_TIMERS.set(label, now);
    if (typeof payload === "undefined") {
      console.log(`[KF DEBUG] ${label}`);
      appendPersistentDebug(label, null);
      return;
    }
    console.log(`[KF DEBUG] ${label}`, payload);
    appendPersistentDebug(label, payload);
  }

  const STATE = {
    banner: null,
    onboarding: null,
    nextStep: null,
    settings: null,
    activeStep: null,
    activeScore: null,
    startedPathThisSession: false,
    autoPlayedForPath: "",
    visitedMarked: new Set()
  };

  function normalizePath(path) {
    if (!path) {
      return "";
    }
    const base = path.split("?")[0].split("#")[0].replace(/\/+$/, "");
    return base || "/";
  }

  function normalizeSlug(input) {
    const raw = String(input || "").trim();
    if (!raw) {
      return "";
    }
    if (raw.startsWith("http://") || raw.startsWith("https://")) {
      try {
        const parsed = new URL(raw);
        if (!parsed.hostname.includes("khanacademy.org")) {
          return "";
        }
        return normalizePath(parsed.pathname);
      } catch (_error) {
        return "";
      }
    }
    return normalizePath(raw.startsWith("/") ? raw : `/${raw}`);
  }

  function currentPath() {
    return normalizePath(window.location.pathname);
  }

  function unitPrefixFromPracticePath(pathname) {
    const value = normalizePath(pathname || "");
    const markers = [
      "/e/",
      "/exercise",
      "/practice",
      "/v/",
      "/video",
      "/lesson",
      "/l/",
      "/quiz",
      "/test",
      "/unit-test",
      "/course-challenge"
    ];
    for (const marker of markers) {
      const index = value.indexOf(marker);
      if (index > 0) {
        return value.slice(0, index);
      }
    }
    return "";
  }

  function toStepType(pathname) {
    const value = String(pathname || "").toLowerCase();
    if (
      value.includes("/e/") ||
      value.includes("/exercise") ||
      value.includes("/practice") ||
      value.includes("course-challenge") ||
      value.includes("unit-test") ||
      value.includes("/quiz") ||
      value.includes("/test")
    ) {
      return "practice";
    }
    return "lesson";
  }

  function isUndesiredStartSlug(slug) {
    const value = String(slug || "").toLowerCase();
    return (
      value.includes("course-challenge") ||
      value.includes("unit-test") ||
      value.includes("/quiz") ||
      value.includes("/test")
    );
  }

  function hasStrongContentMarker(slug) {
    const value = String(slug || "").toLowerCase();
    return (
      value.includes("/e/") ||
      value.includes("/exercise") ||
      value.includes("/practice") ||
      value.includes("/v/") ||
      value.includes("/video") ||
      value.includes("/lesson") ||
      value.includes("/l/")
    );
  }

function isContentSlug(slug) {
    const value = String(slug || "").toLowerCase();
    if (!value || value === "/") {
      return false;
    }
  if (hasStrongContentMarker(value)) {
    return true;
  }
  const parts = value.split("/").filter(Boolean);
  return parts.length >= 4;
}

  function stepPriorityBySlug(slug) {
    const value = String(slug || "").toLowerCase();
    if (value.includes("/v/") || value.includes("/video") || value.includes("/lesson") || value.includes("/l/")) {
      return 0;
    }
    if (value.includes("/e/") || value.includes("/exercise") || value.includes("/practice")) {
      return 1;
    }
    return 2;
  }

  function looksLikeKhanLearningPage(pathname) {
    if (!pathname || pathname === "/") {
      return false;
    }
    const parts = pathname.split("/").filter(Boolean);
    return parts.length >= 2;
  }

  function parseScoreFromPage() {
    const bodyText = (document.body?.innerText || "").slice(0, 16000);
    const patterns = [
      /(\d{1,3})\s*%/g,
      /Score\s*[:\-]\s*(\d{1,3})/gi,
      /(\d{1,3})\s*\/\s*100/g,
      /you\s+scored\s+(\d{1,3})/gi
    ];
    for (const pattern of patterns) {
      let match = pattern.exec(bodyText);
      while (match) {
        const value = Number(match[1]);
        if (Number.isFinite(value) && value >= 0 && value <= 100) {
          return value;
        }
        match = pattern.exec(bodyText);
      }
    }
    return null;
  }

  function likelyCompletePage() {
    const title = (document.title || "").toLowerCase();
    const text = (document.body?.innerText || "").toLowerCase();
    const hints = [
      "completed",
      "you got",
      "great job",
      "next skill",
      "mastered",
      "keep practicing",
      "let's keep going"
    ];
    if (hints.some((hint) => title.includes(hint))) {
      return true;
    }
    return hints.some((hint) => text.includes(hint));
  }

  function findActiveStep(settings) {
    const targetPath = currentPath();
    for (const step of settings.path || []) {
      const stepPath = normalizeSlug(step.slug);
      if (stepPath && stepPath === targetPath) {
        return step;
      }
    }
    return null;
  }

  function readBestPageTitle() {
    const heading = document.querySelector("h1");
    const headingText = String(heading?.textContent || "").trim();
    if (headingText && headingText.length > 3) {
      return headingText;
    }
    const full = String(document.title || "").trim();
    if (!full) {
      return "";
    }
    return full.split("|")[0].trim();
  }

  function displayStepTitle(step) {
    const raw = String(step?.title || "").trim();
    const lower = raw.toLowerCase();
    if (!raw || lower === "level up" || lower === "practice") {
      return readBestPageTitle() || raw || "Current step";
    }
    return raw;
  }

  function getCourseLinkCandidates() {
    const links = Array.from(document.querySelectorAll("a[href]"));
    const prefix = unitPrefixFromPracticePath(currentPath());
    const items = [];
    const seen = new Set();
    for (const link of links) {
      const href = String(link.getAttribute("href") || "").trim();
      const slug = normalizeSlug(href);
      if (!slug || slug === currentPath()) {
        continue;
      }
      const isLearningLink = slug.split("/").filter(Boolean).length >= 2;
      if (!isLearningLink || seen.has(slug)) {
        continue;
      }
      if (!isContentSlug(slug)) {
        continue;
      }
      if (prefix && !slug.startsWith(prefix)) {
        continue;
      }
      if (isUndesiredStartSlug(slug)) {
        continue;
      }
      const text = String(
        link.getAttribute("aria-label") || link.getAttribute("title") || link.textContent || ""
      ).trim();
      if (!text) {
        continue;
      }
      seen.add(slug);
      items.push({ slug, title: text, type: toStepType(slug) });
      if (items.length >= 10) {
        break;
      }
    }
    const sorted = items.sort((a, b) => stepPriorityBySlug(a.slug) - stepPriorityBySlug(b.slug));
    debug("discovered-candidates", {
      currentPath: currentPath(),
      prefix,
      count: sorted.length,
      sample: sorted.slice(0, 8)
    });
    return sorted;
  }

  function getPreferredLessonSlugsFromPage() {
    const prefix = unitPrefixFromPracticePath(currentPath());
    const links = Array.from(document.querySelectorAll("a[href]"));
    const seen = new Set();
    const videos = [];

    const normalizedCurrent = currentPath();
    const currentAnchors = links.filter((link) => {
      const href = String(link.getAttribute("href") || "").trim();
      return normalizeSlug(href) === normalizedCurrent;
    });

    const nearbyVideoCandidates = [];
    for (const anchor of currentAnchors) {
      const container = anchor.closest("li, article, section, ul, ol, nav, div");
      if (!container) {
        continue;
      }
      const localVideoLinks = Array.from(container.querySelectorAll("a[href*='/v/'], a[href*='/video']"));
      for (const videoLink of localVideoLinks) {
        const href = String(videoLink.getAttribute("href") || "").trim();
        const slug = normalizeSlug(href);
        if (!slug) {
          continue;
        }
        nearbyVideoCandidates.push(slug);
      }
    }

    for (const slug of nearbyVideoCandidates) {
      if (seen.has(slug)) {
        continue;
      }
      if (prefix && !slug.startsWith(prefix)) {
        continue;
      }
      seen.add(slug);
      videos.push(slug);
      if (videos.length >= 4) {
        break;
      }
    }

    for (const link of links) {
      if (videos.length >= 4) {
        break;
      }
      const href = String(link.getAttribute("href") || "").trim();
      const slug = normalizeSlug(href);
      if (!slug || seen.has(slug)) {
        continue;
      }
      if (!slug.includes("/v/") && !slug.includes("/video")) {
        continue;
      }
      if (prefix && !slug.startsWith(prefix)) {
        continue;
      }
      seen.add(slug);
      videos.push(slug);
    }

    debug("preferred-lesson-slugs", {
      currentPath: currentPath(),
      prefix,
      count: videos.length,
      videos
    });
    return videos;
  }

  function getPreferredPracticeSlugsFromPage() {
    const prefix = unitPrefixFromPracticePath(currentPath());
    const links = Array.from(document.querySelectorAll("a[href]"));
    const seen = new Set();
    const practices = [];

    const normalizedCurrent = currentPath();
    const currentAnchors = links.filter((link) => {
      const href = String(link.getAttribute("href") || "").trim();
      return normalizeSlug(href) === normalizedCurrent;
    });

    for (const anchor of currentAnchors) {
      const container = anchor.closest("li, article, section, ul, ol, nav, div");
      if (!container) {
        continue;
      }
      const localPracticeLinks = Array.from(
        container.querySelectorAll("a[href*='/e/'], a[href*='/exercise'], a[href*='/practice']")
      );
      for (const practiceLink of localPracticeLinks) {
        const slug = normalizeSlug(String(practiceLink.getAttribute("href") || "").trim());
        if (!slug || seen.has(slug) || slug === normalizedCurrent) {
          continue;
        }
        if (prefix && !slug.startsWith(prefix)) {
          continue;
        }
        seen.add(slug);
        practices.push(slug);
      }
    }

    for (const link of links) {
      if (practices.length >= 4) {
        break;
      }
      const slug = normalizeSlug(String(link.getAttribute("href") || "").trim());
      if (!slug || seen.has(slug) || slug === normalizedCurrent) {
        continue;
      }
      const isPractice = slug.includes("/e/") || slug.includes("/exercise") || slug.includes("/practice");
      if (!isPractice) {
        continue;
      }
      if (prefix && !slug.startsWith(prefix)) {
        continue;
      }
      seen.add(slug);
      practices.push(slug);
    }

    debug("preferred-practice-slugs", {
      currentPath: currentPath(),
      prefix,
      count: practices.length,
      practices
    });
    return practices;
  }

  function onboardingSnoozed(settings) {
    const until = settings?.onboardingDismissedUntil;
    if (!until) {
      return false;
    }
    const ts = Date.parse(until);
    return Number.isFinite(ts) && Date.now() < ts;
  }

  function ensureBanner() {
    if (STATE.banner && document.body.contains(STATE.banner)) {
      return STATE.banner;
    }
    const root = document.createElement("div");
    root.className = "kf-coach";
    root.innerHTML = `
      <div class="kf-coach__title">KinderForge Guide</div>
      <div class="kf-coach__status" id="kf-status">Loading...</div>
      <div class="kf-coach__actions">
        <button id="kf-next-btn" type="button">Jump to next</button>
        <button id="kf-options-btn" type="button" class="secondary">Path settings</button>
      </div>
    `;
    document.body.appendChild(root);
    const nextBtn = root.querySelector("#kf-next-btn");
    const optionsBtn = root.querySelector("#kf-options-btn");
    nextBtn.addEventListener("click", async () => {
      const preferredLessonSlugs = getPreferredLessonSlugsFromPage();
      const preferredPracticeSlugs = getPreferredPracticeSlugsFromPage();
      debug("jump-next-click", {
        currentPath: currentPath(),
        activeStep: STATE.activeStep,
        nextStep: STATE.nextStep,
        preferredLessonSlugs,
        preferredPracticeSlugs
      });
      const response = await chrome.runtime.sendMessage({
        type: "KF_GOTO_NEXT",
        manualAdvance: true,
        preferredLessonSlugs,
        preferredPracticeSlugs
      });
      debug("jump-next-response", response);
      if (!response?.ok) {
        setStatus(response?.error || "Could not jump to next step.");
        return;
      }
      if (response.skipped) {
        setStatus(response.reason || "You are already on this step.");
      }
    });
    optionsBtn.addEventListener("click", async () => {
      const response = await chrome.runtime.sendMessage({ type: "KF_OPEN_OPTIONS" });
      if (!response?.ok) {
        setStatus(response?.error || "Could not open Path settings.");
      }
    });
    STATE.banner = root;
    return root;
  }

  function ensureOnboardingPrompt() {
    if (STATE.onboarding && document.body.contains(STATE.onboarding)) {
      return STATE.onboarding;
    }
    const card = document.createElement("div");
    card.className = "kf-onboarding";
    card.innerHTML = `
      <div class="kf-onboarding__title">Start a learning path from this lesson?</div>
      <div class="kf-onboarding__text">
        KinderForge can automatically build a starter path from your current Khan page and nearby lesson links.
      </div>
      <div class="kf-onboarding__actions">
        <button id="kf-start-path" type="button">Start path</button>
        <button id="kf-not-now" type="button" class="secondary">Not now</button>
      </div>
    `;
    document.body.appendChild(card);

    const startBtn = card.querySelector("#kf-start-path");
    const notNowBtn = card.querySelector("#kf-not-now");

    startBtn.addEventListener("click", async () => {
      await startPathFromCurrentPage();
      card.remove();
      STATE.onboarding = null;
    });

    notNowBtn.addEventListener("click", async () => {
      await chrome.runtime.sendMessage({ type: "KF_SNOOZE_ONBOARDING", minutes: 180 });
      card.remove();
      STATE.onboarding = null;
      setStatus("Okay - prompt hidden for a while.");
    });

    STATE.onboarding = card;
    return card;
  }

  function removeOnboarding() {
    if (STATE.onboarding && document.body.contains(STATE.onboarding)) {
      STATE.onboarding.remove();
    }
    STATE.onboarding = null;
  }

  function setStatus(text) {
    const banner = ensureBanner();
    const status = banner.querySelector("#kf-status");
    if (status) {
      status.textContent = text;
    }
  }

  function maybeAutoPlayLessonVideo() {
    if (!STATE.activeStep) {
      return;
    }
    if (STATE.activeStep.type === "practice") {
      return;
    }
    const key = `${currentPath()}:${STATE.activeStep.id}`;
    if (STATE.autoPlayedForPath === key) {
      return;
    }
    const selectors = [
      'button[aria-label*="Play"]',
      'button[data-testid*="play"]',
      'button[title*="Play"]',
      '.ytp-large-play-button',
      '.ytp-play-button'
    ];
    for (const selector of selectors) {
      const button = document.querySelector(selector);
      if (button instanceof HTMLElement) {
        button.click();
        STATE.autoPlayedForPath = key;
        break;
      }
    }
  }

  function markActiveStepVisited() {
    if (!STATE.activeStep?.id) {
      return;
    }
    if (STATE.visitedMarked.has(STATE.activeStep.id)) {
      return;
    }
    STATE.visitedMarked.add(STATE.activeStep.id);
    chrome.runtime.sendMessage({ type: "KF_MARK_STEP_VISITED", stepId: STATE.activeStep.id }).then((res) => {
      debug("mark-visited-response", { stepId: STATE.activeStep.id, res });
    });
  }

  async function startPathFromCurrentPage() {
    const discovered = getCourseLinkCandidates();
    const preferredLessonSlugs = getPreferredLessonSlugsFromPage();
    const preferredDiscovered = preferredLessonSlugs.map((slug, index) => ({
      slug,
      title: `Lesson video ${index + 1}`,
      type: "lesson"
    }));
    const mergedDiscovered = [...preferredDiscovered, ...discovered];
    if ((!isContentSlug(currentPath()) || isUndesiredStartSlug(currentPath())) && !discovered.length) {
      setStatus("Open a specific lesson, video, or exercise first.");
      return;
    }

    const context = {
      title: document.title,
      pathname: window.location.pathname,
      url: window.location.href,
      discoveredSteps: mergedDiscovered
    };
    debug("start-path-context", context);
    const response = await chrome.runtime.sendMessage({
      type: "KF_START_PATH_FROM_PAGE",
      context
    });
    debug("start-path-response", response);
    if (!response?.ok) {
      setStatus(response?.error || "Could not start path from this page.");
      return;
    }
    STATE.settings = response.settings;
    if (!Array.isArray(STATE.settings.path) || STATE.settings.path.length === 0) {
      setStatus("No concrete exercise/video links found here. Open a specific lesson first.");
      return;
    }
    STATE.activeStep = findActiveStep(STATE.settings);
    STATE.nextStep = response.nextStep || null;
    STATE.startedPathThisSession = true;
    if (STATE.activeStep) {
      setStatus(`Path started. Current step: ${STATE.activeStep.title}`);
    } else if (STATE.nextStep) {
      setStatus(`Path started. Next: ${STATE.nextStep.title}`);
    } else {
      setStatus("Path started.");
    }
  }

  async function loadSettingsAndNextStep() {
    const [settingsResponse, nextResponse] = await Promise.all([
      chrome.runtime.sendMessage({ type: "KF_GET_SETTINGS" }),
      chrome.runtime.sendMessage({ type: "KF_SELECT_NEXT" })
    ]);
    if (!settingsResponse?.ok) {
      setStatus("Unable to load settings.");
      return;
    }
    debug("settings-response", settingsResponse);
    debug("select-next-response", nextResponse);
    STATE.settings = settingsResponse.settings;
    STATE.activeStep = findActiveStep(STATE.settings);
    STATE.nextStep = nextResponse?.nextStep || null;

    if (STATE.settings.coachEnabled === false) {
      setStatus("Coach paused. Enable it in Path settings.");
      removeOnboarding();
      return;
    }

    const hasPath = Array.isArray(STATE.settings.path) && STATE.settings.path.length > 0;
    if (!hasPath) {
      setStatus("No path yet.");
      if (!onboardingSnoozed(STATE.settings) && looksLikeKhanLearningPage(currentPath())) {
        ensureOnboardingPrompt();
      }
      return;
    }

    removeOnboarding();
    if (STATE.activeStep) {
      const label = STATE.activeStep.type === "practice" ? "Practice" : "Lesson";
      setStatus(`${label}: ${displayStepTitle(STATE.activeStep)}`);
      markActiveStepVisited();
      maybeAutoPlayLessonVideo();
      debug("active-step", {
        currentPath: currentPath(),
        activeStep: STATE.activeStep
      });
    } else if (STATE.nextStep) {
      setStatus(`Next up: ${displayStepTitle(STATE.nextStep)}`);
      debug("next-step-no-active", {
        currentPath: currentPath(),
        nextStep: STATE.nextStep
      });
    } else {
      setStatus("Path is complete. Great progress.");
      debug("path-complete", { currentPath: currentPath() });
    }
  }

  async function maybeRecordCompletion() {
    if (!STATE.settings || STATE.settings.coachEnabled === false) {
      return;
    }
    if (!STATE.activeStep) {
      return;
    }
    if (!likelyCompletePage()) {
      return;
    }
    const parsedScore = parseScoreFromPage();
    if (parsedScore === null) {
      return;
    }

    const fingerprint = `${STATE.activeStep.id}:${parsedScore}:${currentPath()}`;
    if (STATE.activeScore === fingerprint) {
      return;
    }
    STATE.activeScore = fingerprint;

    const response = await chrome.runtime.sendMessage({
      type: "KF_RECORD_RESULT",
      result: {
        stepId: STATE.activeStep.id,
        score: parsedScore,
        completedAt: new Date().toISOString()
      }
    });
    debug("record-result-response", response);
    if (!response?.ok) {
      setStatus("Result capture failed; continue manually.");
      return;
    }

    const next = response.nextStep;
    if (next) {
      setStatus(`Saved ${parsedScore}%. Next: ${next.title}`);
      if (STATE.settings.autoAdvance) {
        setTimeout(() => {
          chrome.runtime.sendMessage({ type: "KF_GOTO_NEXT" }).then((navRes) => {
            debug("auto-advance-response", navRes);
            if (navRes?.ok && navRes?.skipped) {
              setStatus(navRes.reason || "Waiting on this step.");
            }
          });
        }, 2200);
      }
    } else {
      setStatus(`Saved ${parsedScore}%. Path complete.`);
    }
  }

  async function boot() {
    debug("boot", {
      href: window.location.href,
      title: document.title,
      path: currentPath()
    });
    window.kfGetDebugLog = function kfGetDebugLog() {
      try {
        return JSON.parse(window.localStorage.getItem(PERSISTENT_DEBUG_KEY) || "[]");
      } catch (_error) {
        return [];
      }
    };
    window.kfClearDebugLog = function kfClearDebugLog() {
      window.localStorage.removeItem(PERSISTENT_DEBUG_KEY);
      return true;
    };
    ensureBanner();
    await loadSettingsAndNextStep();
    await maybeRecordCompletion();

    let lastPath = currentPath();
    const observer = new MutationObserver(() => {
      maybeRecordCompletion();
    });
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true
    });

    window.setInterval(() => {
      const path = currentPath();
      if (path !== lastPath) {
        lastPath = path;
        loadSettingsAndNextStep();
      }
    }, 1200);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot, { once: true });
  } else {
    boot();
  }
})();
