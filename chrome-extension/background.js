const STORAGE_KEY = "kinderforge_settings_v1";
const DEBUG = true;
const DEBUG_LOG_KEY = "kf_bg_debug_log";

async function appendBackgroundDebug(label, payload) {
  try {
    const stored = await chrome.storage.local.get(DEBUG_LOG_KEY);
    const existing = Array.isArray(stored[DEBUG_LOG_KEY]) ? stored[DEBUG_LOG_KEY] : [];
    existing.push({
      ts: new Date().toISOString(),
      label,
      payload
    });
    await chrome.storage.local.set({ [DEBUG_LOG_KEY]: existing.slice(-400) });
  } catch (_error) {
    // Ignore debug storage failures.
  }
}

function debug(label, payload) {
  if (!DEBUG) {
    return;
  }
  if (typeof payload === "undefined") {
    console.log(`[KF BG DEBUG] ${label}`);
    return;
  }
  console.log(`[KF BG DEBUG] ${label}`, payload);
  appendBackgroundDebug(label, payload);
}

const DEFAULT_SETTINGS = {
  autoAdvance: true,
  coachEnabled: true,
  targetAccuracy: 80,
  frustrationThreshold: 3,
  pathName: "Default Path",
  path: [],
  recentResults: [],
  visitedStepIds: [],
  visitedSlugs: [],
  onboardingDismissedUntil: ""
};

function nowIso() {
  return new Date().toISOString();
}

function toStepTypeFromSlug(slug) {
  const value = String(slug || "").toLowerCase();
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

function isCollectionSlug(slug) {
  const value = String(slug || "").toLowerCase();
  if (!value) {
    return true;
  }
  if (isContentSlug(value)) {
    return false;
  }
  const parts = value.split("/").filter(Boolean);
  return parts.length <= 2;
}

function lessonContainerFromPracticeSlug(slug) {
  const value = normalizeKhanSlug(slug);
  if (!value) {
    return "";
  }
  const markers = ["/e/", "/exercise", "/practice", "/quiz", "/test", "/unit-test", "/course-challenge"];
  for (const marker of markers) {
    const index = value.indexOf(marker);
    if (index > 0) {
      return value.slice(0, index);
    }
  }
  return "";
}

function unitPrefixFromSlug(slug) {
  const value = normalizeKhanSlug(slug);
  if (!value) {
    return "";
  }
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
  return value;
}

function stepPriority(step) {
  const slug = String(step?.slug || "").toLowerCase();
  if (slug.includes("/v/") || slug.includes("/video") || slug.includes("/lesson") || slug.includes("/l/")) {
    return 0;
  }
  if (slug.includes("/e/") || slug.includes("/exercise") || slug.includes("/practice")) {
    return 1;
  }
  return 2;
}

function prioritizeLessonStart(steps) {
  if (!Array.isArray(steps) || steps.length < 2) {
    return steps;
  }
  if (steps[0].type === "lesson") {
    return steps;
  }
  const lessonIndex = steps.findIndex((item) => item.type === "lesson");
  if (lessonIndex <= 0) {
    return steps;
  }
  const reordered = [...steps];
  const [lessonStep] = reordered.splice(lessonIndex, 1);
  reordered.unshift(lessonStep);
  return reordered;
}

function normalizeKhanSlug(input) {
  const raw = String(input || "").trim();
  if (!raw) {
    return "";
  }
  if (raw.startsWith("http://") || raw.startsWith("https://")) {
    try {
      const url = new URL(raw);
      if (!url.hostname.includes("khanacademy.org")) {
        return "";
      }
      const slug = url.pathname || "";
      return slug.endsWith("/") ? slug.slice(0, -1) : slug;
    } catch (_error) {
      return "";
    }
  }
  const slug = raw.startsWith("/") ? raw : `/${raw}`;
  return slug.endsWith("/") ? slug.slice(0, -1) : slug;
}

function slugToStepId(slug, fallback) {
  const cleaned = normalizeKhanSlug(slug)
    .replace(/^\/+/, "")
    .replace(/[^a-zA-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .toLowerCase();
  return cleaned || fallback || `step_${Date.now()}`;
}

function createStepFromContext(item, index) {
  const slug = normalizeKhanSlug(item?.slug || item?.url || item?.pathname);
  if (!slug) {
    return null;
  }
  const title = String(item?.title || "").trim() || `Step ${index + 1}`;
  const type = item?.type === "practice" || item?.type === "lesson"
    ? item.type
    : toStepTypeFromSlug(slug);
  const idBase = slugToStepId(slug, `step_${index + 1}`);
  return {
    id: index === 0 ? idBase : `${idBase}_${index + 1}`,
    title,
    slug,
    type,
    prerequisites: index === 0 ? [] : [slugToStepId(normalizeKhanSlug(item?.previousSlug || ""), "")].filter(Boolean)
  };
}

function uniqueBySlug(steps) {
  const seen = new Set();
  const result = [];
  for (const step of steps) {
    const slug = normalizeKhanSlug(step.slug);
    if (!slug || seen.has(slug)) {
      continue;
    }
    seen.add(slug);
    result.push({ ...step, slug });
  }
  return result;
}

function relinkPrerequisites(steps) {
  return steps.map((step, index) => {
    if (index === 0) {
      return { ...step, prerequisites: [] };
    }
    return { ...step, prerequisites: [steps[index - 1].id] };
  });
}

function buildPathFromPageContext(context) {
  const title = String(context?.title || "Khan Path").trim();
  const currentSlug = normalizeKhanSlug(context?.pathname || context?.url);
  const unitPrefix = unitPrefixFromSlug(currentSlug);
  const discovered = Array.isArray(context?.discoveredSteps) ? context.discoveredSteps : [];

  const draft = [];
  if (currentSlug) {
    const lessonContainer = lessonContainerFromPracticeSlug(currentSlug);
    if (lessonContainer && isContentSlug(lessonContainer) && !isUndesiredStartSlug(lessonContainer)) {
      draft.push(
        createStepFromContext(
          {
            slug: lessonContainer,
            title: "Lesson material",
            type: "lesson"
          },
          0
        )
      );
    }
  }

  if (currentSlug && isContentSlug(currentSlug) && !isUndesiredStartSlug(currentSlug)) {
    draft.push(
      createStepFromContext(
        {
          slug: currentSlug,
          title: title,
          type: toStepTypeFromSlug(currentSlug)
        },
        0
      )
    );
  }

  const discoveredSteps = [];
  for (let i = 0; i < discovered.length; i += 1) {
    const raw = discovered[i];
    const step = createStepFromContext(raw, i + 1);
    if (step) {
      if (
        !isCollectionSlug(step.slug) &&
        !isUndesiredStartSlug(step.slug) &&
        (!unitPrefix || step.slug.startsWith(unitPrefix))
      ) {
        discoveredSteps.push(step);
      }
    }
  }

  discoveredSteps.sort((a, b) => stepPriority(a) - stepPriority(b));
  draft.push(...discoveredSteps);

  const deduped = uniqueBySlug(draft).slice(0, 20);
  const ordered = prioritizeLessonStart(deduped).slice(0, 12);

  if (!ordered.length && currentSlug && isContentSlug(currentSlug) && !isUndesiredStartSlug(currentSlug)) {
    ordered.push(
      createStepFromContext(
        {
          slug: currentSlug,
          title,
          type: toStepTypeFromSlug(currentSlug)
        },
        0
      )
    );
  }

  const withStableIds = ordered.map((step, index) => ({
    ...step,
    id: `${slugToStepId(step.slug, `step_${index + 1}`)}_${index + 1}`
  }));

  debug("build-path", {
    currentSlug,
    discoveredCount: discovered.length,
    orderedCount: ordered.length,
    orderedSample: ordered.slice(0, 8),
    finalPath: withStableIds
  });

  return {
    pathName: title || "Khan Learning Path",
    path: relinkPrerequisites(withStableIds)
  };
}

function toNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function sanitizeStep(step) {
  if (!step || typeof step !== "object") {
    return null;
  }
  const id = String(step.id || "").trim();
  const title = String(step.title || "").trim();
  const slug = String(step.slug || "").trim();
  const type = step.type === "practice" ? "practice" : "lesson";
  const prerequisites = Array.isArray(step.prerequisites)
    ? step.prerequisites.map((item) => String(item || "").trim()).filter(Boolean)
    : [];
  if (!id || !slug) {
    return null;
  }
  if (!isContentSlug(slug)) {
    return null;
  }
  return {
    id,
    title: title || id,
    slug,
    type,
    prerequisites
  };
}

function sanitizeResult(result) {
  if (!result || typeof result !== "object") {
    return null;
  }
  const stepId = String(result.stepId || "").trim();
  const score = toNumber(result.score, 0);
  if (!stepId) {
    return null;
  }
  return {
    stepId,
    score: Math.max(0, Math.min(100, score)),
    completedAt: result.completedAt || new Date().toISOString()
  };
}

function mergeSettings(raw) {
  const base = { ...DEFAULT_SETTINGS };
  if (!raw || typeof raw !== "object") {
    return base;
  }
  const path = Array.isArray(raw.path)
    ? raw.path.map(sanitizeStep).filter(Boolean)
    : [];
  const recentResults = Array.isArray(raw.recentResults)
    ? raw.recentResults.map(sanitizeResult).filter(Boolean).slice(-200)
    : [];
  const visitedStepIds = Array.isArray(raw.visitedStepIds)
    ? raw.visitedStepIds.map((item) => String(item || "").trim()).filter(Boolean).slice(-500)
    : [];
  const visitedSlugs = Array.isArray(raw.visitedSlugs)
    ? raw.visitedSlugs.map((item) => normalizeKhanSlug(item)).filter(Boolean).slice(-800)
    : [];
  return {
    ...base,
    ...raw,
    autoAdvance: raw.autoAdvance !== false,
    coachEnabled: raw.coachEnabled !== false,
    targetAccuracy: Math.max(50, Math.min(100, toNumber(raw.targetAccuracy, base.targetAccuracy))),
    frustrationThreshold: Math.max(1, Math.min(10, toNumber(raw.frustrationThreshold, base.frustrationThreshold))),
    pathName: String(raw.pathName || base.pathName),
    path,
    recentResults,
    visitedStepIds,
    visitedSlugs
  };
}

async function getSettings() {
  const stored = await chrome.storage.local.get(STORAGE_KEY);
  return mergeSettings(stored[STORAGE_KEY]);
}

async function saveSettings(settings) {
  const merged = mergeSettings(settings);
  await chrome.storage.local.set({ [STORAGE_KEY]: merged });
  return merged;
}

function statsByStepId(results) {
  const stats = {};
  for (const result of results) {
    if (!stats[result.stepId]) {
      stats[result.stepId] = {
        attempts: 0,
        avgScore: 0,
        failures: 0,
        success: 0,
        lastScore: 0,
        lastCompletedAt: ""
      };
    }
    const item = stats[result.stepId];
    item.attempts += 1;
    item.avgScore += result.score;
    item.lastScore = result.score;
    item.lastCompletedAt = result.completedAt;
    if (result.score >= 80) {
      item.success += 1;
    } else if (result.score < 60) {
      item.failures += 1;
    }
  }
  for (const key of Object.keys(stats)) {
    const item = stats[key];
    item.avgScore = item.attempts > 0 ? item.avgScore / item.attempts : 0;
  }
  return stats;
}

function prerequisitesMet(step, doneIds) {
  if (!step.prerequisites || step.prerequisites.length === 0) {
    return true;
  }
  return step.prerequisites.every((prereq) => doneIds.has(prereq));
}

function selectNextStep(settings) {
  const path = contentPath(settings);
  if (!path.length) {
    return null;
  }

  const results = settings.recentResults || [];
  const stats = statsByStepId(results);
  const doneIds = new Set(
    Object.keys(stats).filter((stepId) => {
      const item = stats[stepId];
      return item.success > 0 && item.avgScore >= settings.targetAccuracy;
    })
  );

  let strugglingCandidate = null;
  for (const step of path) {
    const item = stats[step.id];
    if (!item) {
      continue;
    }
    const struggling = item.failures >= settings.frustrationThreshold;
    if (struggling && prerequisitesMet(step, doneIds)) {
      strugglingCandidate = step;
      break;
    }
  }
  if (strugglingCandidate) {
    return {
      ...strugglingCandidate,
      reason: "Practice this again to reduce frustration"
    };
  }

  for (const step of path) {
    if (!doneIds.has(step.id) && prerequisitesMet(step, doneIds)) {
      return {
        ...step,
        reason: "Next unlocked step in your learning path"
      };
    }
  }

  const fallback = {
    ...path[path.length - 1],
    reason: "Path complete - keep reinforcing this step"
  };
  debug("select-next-fallback", fallback);
  return fallback;
}

function stepToUrl(step) {
  if (!step || !step.slug) {
    return null;
  }
  if (!isContentSlug(step.slug)) {
    return null;
  }
  if (step.slug.startsWith("http://") || step.slug.startsWith("https://")) {
    return step.slug;
  }
  const slug = step.slug.startsWith("/") ? step.slug : `/${step.slug}`;
  return `https://www.khanacademy.org${slug}`;
}

function stepToPathname(step) {
  const url = stepToUrl(step);
  return url ? normalizePathname(url) : "";
}

function findStepBySlug(path, slug) {
  const target = normalizeKhanSlug(slug);
  if (!target) {
    return null;
  }
  for (const step of path || []) {
    if (normalizeKhanSlug(step.slug) === target) {
      return step;
    }
  }
  return null;
}

function isSlugVisited(settings, slug) {
  const normalized = normalizeKhanSlug(slug);
  if (!normalized) {
    return false;
  }
  if ((settings.visitedSlugs || []).includes(normalized)) {
    return true;
  }
  const step = findStepBySlug(settings.path || [], slug);
  if (!step) {
    return false;
  }
  const visited = new Set(settings.visitedStepIds || []);
  return visited.has(step.id);
}

async function markVisitedStep(settings, stepId = "", currentPath = "") {
  const visited = new Set(settings.visitedStepIds || []);
  const visitedSlugs = new Set((settings.visitedSlugs || []).map((slug) => normalizeKhanSlug(slug)).filter(Boolean));
  const normalizedStepId = String(stepId || "").trim();
  const normalizedPath = normalizeKhanSlug(currentPath);
  if (normalizedStepId) {
    visited.add(normalizedStepId);
  }
  if (normalizedPath) {
    visitedSlugs.add(normalizedPath);
  }
  if (!normalizedStepId) {
    const byPath = findStepBySlug(settings.path || [], currentPath);
    if (byPath?.id) {
      visited.add(byPath.id);
    }
  }
  if (
    visited.size === (settings.visitedStepIds || []).length &&
    visitedSlugs.size === (settings.visitedSlugs || []).length
  ) {
    return settings;
  }
  return saveSettings({
    ...settings,
    visitedStepIds: Array.from(visited),
    visitedSlugs: Array.from(visitedSlugs)
  });
}

function findUnvisitedStepForSlugList(settings, slugs, expectedType, unitPrefix = "") {
  const visited = new Set(settings.visitedStepIds || []);
  for (const rawSlug of slugs || []) {
    const slug = normalizeKhanSlug(rawSlug);
    if (!slug) {
      continue;
    }
    if (unitPrefix && !slug.startsWith(unitPrefix)) {
      continue;
    }
    const step = findStepBySlug(settings.path || [], slug);
    if (!step) {
      continue;
    }
    if (expectedType && step.type !== expectedType) {
      continue;
    }
    if (visited.has(step.id)) {
      continue;
    }
    return step;
  }
  return null;
}

function contentPath(settings) {
  return (settings.path || []).filter((step) => isContentSlug(step.slug));
}

function selectManualAdvanceStep(settings, currentPath, options = {}) {
  const path = contentPath(settings);
  if (!path.length) {
    return null;
  }
  const visited = new Set(settings.visitedStepIds || []);
  const currentUnitPrefix = unitPrefixFromSlug(currentPath);
  const scopedPath = currentUnitPrefix
    ? path.filter((step) => unitPrefixFromSlug(step.slug) === currentUnitPrefix)
    : path;
  const hasUnvisitedInScope = scopedPath.some((step) => !visited.has(step.id));
  const workingPath = scopedPath.length && hasUnvisitedInScope ? scopedPath : path;
  const preferredPracticeSlugs = Array.isArray(options.preferredPracticeSlugs)
    ? options.preferredPracticeSlugs.map((slug) => normalizeKhanSlug(slug)).filter(Boolean)
    : [];
  const currentIndex = workingPath.findIndex((step) => stepToPathname(step) === currentPath);

  const findUnvisitedAfter = (steps, index) => {
    for (let i = index + 1; i < steps.length; i += 1) {
      if (!visited.has(steps[i].id)) {
        return steps[i];
      }
    }
    return null;
  };

  const findAnyUnvisited = (steps) => steps.find((step) => !visited.has(step.id)) || null;

  if ((currentPath.includes("/v/") || currentPath.includes("/video")) && preferredPracticeSlugs.length) {
    const preferredPracticeStep = findUnvisitedStepForSlugList(
      settings,
      preferredPracticeSlugs,
      "practice",
      currentUnitPrefix
    );
    if (preferredPracticeStep) {
      return {
        ...preferredPracticeStep,
        reason: "Continuing to practice for this lesson"
      };
    }
  }

  if (currentIndex >= 0 && workingPath[currentIndex].type === "practice") {
    const lessonAfterPractice = workingPath.find(
      (step, index) => index > currentIndex && step.type === "lesson" && !visited.has(step.id)
    );
    if (lessonAfterPractice) {
      return {
        ...lessonAfterPractice,
        reason: "Continuing to the next lesson video"
      };
    }
    const lessonBeforePractice = workingPath.find(
      (step, index) => index < currentIndex && step.type === "lesson" && !visited.has(step.id)
    );
    if (lessonBeforePractice) {
      return {
        ...lessonBeforePractice,
        reason: "Opening lesson material before practice"
      };
    }

    const unvisitedAfter = findUnvisitedAfter(workingPath, currentIndex);
    if (unvisitedAfter) {
      return {
        ...unvisitedAfter,
        reason: "Skipping ahead to the next unvisited step"
      };
    }
  }

  if (currentIndex === -1) {
    const firstUnvisitedLesson = workingPath.find((step) => step.type === "lesson" && !visited.has(step.id));
    if (firstUnvisitedLesson) {
      return {
        ...firstUnvisitedLesson,
        reason: "Starting with lesson material"
      };
    }
    return {
      ...workingPath[0],
      reason: "Starting at the first step in your learning path"
    };
  }

  const unvisitedAfter = findUnvisitedAfter(workingPath, currentIndex);
  if (unvisitedAfter) {
    return {
      ...unvisitedAfter,
      reason: "Skipping ahead to the next unvisited step"
    };
  }

  const anyUnvisited = findAnyUnvisited(path);
  if (anyUnvisited) {
    return {
      ...anyUnvisited,
      reason: "Continuing to the next unvisited step"
    };
  }

  if (currentIndex < workingPath.length - 1) {
    return {
      ...workingPath[currentIndex + 1],
      reason: "Skipping ahead to the next step"
    };
  }
  return {
    ...workingPath[currentIndex],
    reason: "You are already on the final step"
  };
}

function normalizePathname(urlValue) {
  try {
    const parsed = new URL(urlValue);
    const path = parsed.pathname.replace(/\/+$/, "");
    return path || "/";
  } catch (_error) {
    return "";
  }
}

async function gotoNextStep(tabId) {
  const settings = await getSettings();
  const nextStep = selectNextStep(settings);
  const url = stepToUrl(nextStep);
  if (!url) {
    return {
      ok: false,
      error: "No learning path configured."
    };
  }

  const tab = await chrome.tabs.get(tabId);
  const currentPath = normalizePathname(tab?.url || "");
  const targetPath = normalizePathname(url);
  if (currentPath && targetPath && currentPath === targetPath) {
    debug("goto-next-skipped", {
      currentPath,
      targetPath,
      nextStep
    });
    return {
      ok: true,
      nextStep,
      url,
      skipped: true,
      reason: "Already on the recommended step"
    };
  }

  debug("goto-next-update", {
    currentPath,
    targetPath,
    nextStep,
    url
  });
  await chrome.tabs.update(tabId, { url });
  return {
    ok: true,
    nextStep,
    url
  };
}

async function gotoNextStepManual(tabId, preferredLessonSlugs = [], preferredPracticeSlugs = []) {
  let settings = await getSettings();
  const tab = await chrome.tabs.get(tabId);
  const currentPath = normalizePathname(tab?.url || "");
  const currentUnitPrefix = unitPrefixFromSlug(currentPath);

  if (currentPath.includes("/e/") && Array.isArray(preferredLessonSlugs) && preferredLessonSlugs.length) {
    const preferred = preferredLessonSlugs
      .map((slug) => normalizeKhanSlug(slug))
      .filter((slug) => slug && slug !== currentPath && !isUndesiredStartSlug(slug));
    const lessonTargetStep = findUnvisitedStepForSlugList(
      settings,
      preferred,
      "lesson",
      currentUnitPrefix
    );
    if (lessonTargetStep) {
      const lessonTarget = normalizeKhanSlug(lessonTargetStep.slug);
      const preferredUrl = `https://www.khanacademy.org${lessonTarget}`;
      debug("goto-next-manual-preferred-video", {
        currentPath,
        currentUnitPrefix,
        preferred,
        lessonTarget,
        preferredUrl
      });
      await chrome.tabs.update(tabId, { url: preferredUrl });
      return {
        ok: true,
        nextStep: {
          ...lessonTargetStep,
          reason: "Opening lesson video before practice"
        },
        url: preferredUrl,
        preferred: true
      };
    }
  }

  const currentStep = findStepBySlug(settings.path || [], currentPath);
  const derivedLessonPath = lessonContainerFromPracticeSlug(currentPath);
  if (!currentStep && derivedLessonPath && !isUndesiredStartSlug(derivedLessonPath) && derivedLessonPath !== currentPath) {
    const derivedUrl = `https://www.khanacademy.org${derivedLessonPath}`;
    debug("goto-next-manual-derived-lesson", {
      currentPath,
      derivedLessonPath,
      derivedUrl
    });
    await chrome.tabs.update(tabId, { url: derivedUrl });
    return {
      ok: true,
      nextStep: {
        id: slugToStepId(derivedLessonPath, "derived_lesson"),
        title: "Lesson material",
        slug: derivedLessonPath,
        type: "lesson",
        reason: "Opening lesson material before practice"
      },
      url: derivedUrl,
      derived: true
    };
  }

  const nextStep = selectManualAdvanceStep(settings, currentPath, { preferredPracticeSlugs });
  const url = stepToUrl(nextStep);
  if (!url) {
    return {
      ok: false,
      error: "No learning path configured."
    };
  }
  const targetPath = normalizePathname(url);
  if (currentPath && targetPath && currentPath === targetPath) {
    debug("goto-next-manual-skipped", {
      currentPath,
      targetPath,
      nextStep
    });
    return {
      ok: true,
      nextStep,
      url,
      skipped: true,
      reason: nextStep.reason || "Already on the recommended step"
    };
  }
  debug("goto-next-manual-update", {
    currentPath,
    targetPath,
    nextStep,
    url
  });
  await chrome.tabs.update(tabId, { url });
  return {
    ok: true,
    nextStep,
    url
  };
}

chrome.runtime.onInstalled.addListener(async () => {
  const settings = await getSettings();
  await saveSettings(settings);
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || typeof message !== "object") {
    sendResponse({ ok: false, error: "Invalid message" });
    return;
  }

  const run = async () => {
    debug("message", { type: message.type, message });
    switch (message.type) {
      case "KF_GET_SETTINGS": {
        const settings = await getSettings();
        return { ok: true, settings };
      }
      case "KF_SAVE_SETTINGS": {
        const settings = await saveSettings(message.settings || {});
        return { ok: true, settings };
      }
      case "KF_RECORD_RESULT": {
        const settings = await getSettings();
        const result = sanitizeResult(message.result);
        if (!result) {
          return { ok: false, error: "Invalid result payload" };
        }
        settings.recentResults = [...settings.recentResults, result].slice(-200);
        const saved = await saveSettings(settings);
        const nextStep = selectNextStep(saved);
        return { ok: true, nextStep, settings: saved };
      }
      case "KF_SELECT_NEXT": {
        const settings = await getSettings();
        const nextStep = selectNextStep(settings);
        return { ok: true, nextStep };
      }
      case "KF_GOTO_NEXT": {
        let tabId = sender?.tab?.id;
        if (typeof message.tabId === "number") {
          tabId = message.tabId;
        }
        if (typeof tabId !== "number") {
          return { ok: false, error: "No tab id available" };
        }
        const settings = await getSettings();
        const currentPath = normalizePathname(sender?.tab?.url || "");
        const currentStep = findStepBySlug(settings.path || [], currentPath);
        if (message.manualAdvance) {
          await markVisitedStep(settings, currentStep?.id || "", currentPath);
          return gotoNextStepManual(
            tabId,
            message.preferredLessonSlugs || [],
            message.preferredPracticeSlugs || []
          );
        }
        return gotoNextStep(tabId);
      }
      case "KF_OPEN_OPTIONS": {
        await chrome.runtime.openOptionsPage();
        return { ok: true };
      }
      case "KF_START_PATH_FROM_PAGE": {
        const settings = await getSettings();
        const built = buildPathFromPageContext(message.context || {});
        if (!built.path.length) {
          return { ok: false, error: "Could not detect a Khan lesson from this page." };
        }
        const nextSettings = {
          ...settings,
          coachEnabled: true,
          pathName: built.pathName,
          path: built.path,
          recentResults: [],
          visitedStepIds: [],
          visitedSlugs: [],
          onboardingDismissedUntil: ""
        };
        const saved = await saveSettings(nextSettings);
        debug("start-path-saved", saved);
        return { ok: true, settings: saved, nextStep: selectNextStep(saved) };
      }
      case "KF_MARK_STEP_VISITED": {
        const settings = await getSettings();
        const stepId = String(message.stepId || "").trim();
        if (!stepId) {
          return { ok: false, error: "Missing step id" };
        }
        const visited = new Set(settings.visitedStepIds || []);
        visited.add(stepId);
        const saved = await saveSettings({ ...settings, visitedStepIds: Array.from(visited) });
        return { ok: true, settings: saved };
      }
      case "KF_SNOOZE_ONBOARDING": {
        const settings = await getSettings();
        const minutes = Math.max(5, Math.min(1440, Number(message.minutes || 120)));
        const until = new Date(Date.now() + minutes * 60 * 1000).toISOString();
        const saved = await saveSettings({ ...settings, onboardingDismissedUntil: until });
        return { ok: true, settings: saved };
      }
      case "KF_GET_BG_DEBUG_LOG": {
        const stored = await chrome.storage.local.get(DEBUG_LOG_KEY);
        return { ok: true, entries: Array.isArray(stored[DEBUG_LOG_KEY]) ? stored[DEBUG_LOG_KEY] : [] };
      }
      case "KF_CLEAR_BG_DEBUG_LOG": {
        await chrome.storage.local.set({ [DEBUG_LOG_KEY]: [] });
        return { ok: true };
      }
      default:
        return { ok: false, error: `Unknown message type: ${message.type}` };
    }
  };

  run().then(sendResponse).catch((error) => {
    sendResponse({ ok: false, error: String(error) });
  });
  return true;
});
