async function getActiveTab() {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  return tabs[0] || null;
}

async function refresh() {
  const [settingsRes, nextRes] = await Promise.all([
    chrome.runtime.sendMessage({ type: "KF_GET_SETTINGS" }),
    chrome.runtime.sendMessage({ type: "KF_SELECT_NEXT" })
  ]);

  const pathName = document.getElementById("path-name");
  const nextStep = document.getElementById("next-step");
  const status = document.getElementById("status");

  if (!settingsRes?.ok) {
    pathName.textContent = "Settings unavailable";
    nextStep.textContent = "Open Path settings and save a path.";
    status.textContent = settingsRes?.error || "Error loading settings.";
    return;
  }

  const settings = settingsRes.settings;
  pathName.textContent = `Path: ${settings.pathName || "Untitled"}`;

  if (!settings.path || settings.path.length === 0) {
    nextStep.textContent = "No path configured yet.";
    status.textContent = "Add lessons and practice steps in Path settings.";
    return;
  }

  if (nextRes?.nextStep) {
    const kind = nextRes.nextStep.type === "practice" ? "Practice" : "Lesson";
    nextStep.textContent = `${kind}: ${nextRes.nextStep.title}`;
    status.textContent = nextRes.nextStep.reason || "";
  } else {
    nextStep.textContent = "Path complete.";
    status.textContent = "Keep practicing to reinforce mastery.";
  }
}

document.getElementById("next-btn").addEventListener("click", async () => {
  const status = document.getElementById("status");
  const tab = await getActiveTab();
  if (!tab?.id) {
    status.textContent = "No active tab found.";
    return;
  }
  const response = await chrome.runtime.sendMessage({
    type: "KF_GOTO_NEXT",
    tabId: tab.id
  });
  if (!response?.ok) {
    status.textContent = response?.error || "Could not navigate.";
    return;
  }
  status.textContent = `Opening ${response.nextStep?.title || "next step"}...`;
});

document.getElementById("options-btn").addEventListener("click", () => {
  chrome.runtime.openOptionsPage();
});

refresh();
