const mimePrefix = "=?UTF-8?B?";
const mimeSuffix = "?=";

const decodeStatus = document.getElementById("decodeStatus");
const encodeStatus = document.getElementById("encodeStatus");
const decodePage = document.getElementById("decodePage");
const encodePage = document.getElementById("encodePage");
const decodeNav = document.getElementById("decodeNav");
const encodeNav = document.getElementById("encodeNav");
const themeToggleButton = document.getElementById("themeToggleButton");
const themeToggleIcon = document.getElementById("themeToggleIcon");
const themeToggleLabel = document.getElementById("themeToggleLabel");
const storageKey = "mime-converter-state-v1";
const defaultTheme = "dark";
const secretClickThreshold = 6;
const secretClickWindowMs = 3000;
const spaceToggleLockDurationMs = 3000;

let decodeInputEditor;
let decodeOutputEditor;
let encodeInputEditor;
let encodeOutputEditor;
let themeState = normalizeThemeState();
let themeClickTimestamps = [];
let spaceToggleLockTimerId = 0;
const monacoRootUrl = new URL("./vendor/monaco/", window.location.href).toString();

require.config({
  paths: {
    vs: "./vendor/monaco/vs",
  },
});

window.MonacoEnvironment = {
  getWorkerUrl() {
    return `data:text/javascript;charset=utf-8,${encodeURIComponent(`
      self.MonacoEnvironment = { baseUrl: ${JSON.stringify(monacoRootUrl)} };
      importScripts(${JSON.stringify(`${monacoRootUrl}vs/base/worker/workerMain.js`)});
    `)}`;
  },
};

require(["vs/editor/editor.main"], () => {
  const initialThemeState = loadThemePreference();
  applyTheme(initialThemeState.theme, initialThemeState.previousTheme, initialThemeState.spaceLockUntil);
  initEditors();
  initActions();
  restoreState();
  syncPageFromHash();
  handleDecodeInput();
  handleEncodeInput();
  window.addEventListener("resize", layoutEditors);
  window.addEventListener("hashchange", handleHashChange);
});

function initEditors() {
  decodeInputEditor = createEditor("decodeInputEditor", "plaintext", true, "Вставьте MIME сюда");
  decodeOutputEditor = createEditor("decodeOutputEditor", "plaintext", true, "Результат появится здесь");
  encodeInputEditor = createEditor("encodeInputEditor", "plaintext", true, "Вставьте текст сюда");
  encodeOutputEditor = createEditor("encodeOutputEditor", "plaintext", true, "Результат появится здесь");

  decodeInputEditor.onDidChangeModelContent(() => {
    handleDecodeInput();
    updateJsonButtons();
    persistState();
  });
  decodeOutputEditor.onDidChangeModelContent(() => {
    updateJsonButtons();
    persistState();
  });
  encodeInputEditor.onDidChangeModelContent(() => {
    handleEncodeInput();
    updateJsonButtons();
    persistState();
  });
  encodeOutputEditor.onDidChangeModelContent(() => {
    updateJsonButtons();
    persistState();
  });
}

function createEditor(containerId, language, editable, placeholder) {
  return monaco.editor.create(document.getElementById(containerId), {
    value: "",
    language,
    theme: getMonacoTheme(),
    automaticLayout: true,
    minimap: { enabled: false },
    lineNumbers: "on",
    roundedSelection: false,
    scrollBeyondLastLine: false,
    wordWrap: "on",
    fontSize: 14,
    fontFamily: "Consolas, 'Courier New', monospace",
    tabSize: 2,
    readOnly: !editable,
    renderLineHighlight: "line",
    padding: { top: 14, bottom: 14 },
    placeholder,
  });
}

function initActions() {
  document.getElementById("decodeSwapButton").addEventListener("click", moveDecodeOutputToEncodeInput);
  document.getElementById("decodeClearButton").addEventListener("click", clearDecodeFields);
  document.getElementById("encodeSwapButton").addEventListener("click", moveEncodeOutputToDecodeInput);
  document.getElementById("encodeClearButton").addEventListener("click", clearEncodeFields);
  themeToggleButton.addEventListener("click", handleThemeToggleClick);

  bindClipboardButtons("decodeInputPasteButton", "decodeInputCopyButton", decodeInputEditor, handleDecodeInput);
  bindClipboardButtons("decodeOutputPasteButton", "decodeOutputCopyButton", decodeOutputEditor, updateJsonButtons);
  bindClipboardButtons("encodeInputPasteButton", "encodeInputCopyButton", encodeInputEditor, handleEncodeInput);
  bindClipboardButtons("encodeOutputPasteButton", "encodeOutputCopyButton", encodeOutputEditor, updateJsonButtons);

  bindJsonButton("decodeInputFormatButton", decodeInputEditor, "format");
  bindJsonButton("decodeInputMinifyButton", decodeInputEditor, "minify");
  bindJsonButton("decodeOutputFormatButton", decodeOutputEditor, "format");
  bindJsonButton("decodeOutputMinifyButton", decodeOutputEditor, "minify");
  bindJsonButton("encodeInputFormatButton", encodeInputEditor, "format");
  bindJsonButton("encodeInputMinifyButton", encodeInputEditor, "minify");
  bindJsonButton("encodeOutputFormatButton", encodeOutputEditor, "format");
  bindJsonButton("encodeOutputMinifyButton", encodeOutputEditor, "minify");

  updateJsonButtons();
}

function bindClipboardButtons(pasteButtonId, copyButtonId, editor, afterPaste) {
  document.getElementById(pasteButtonId).addEventListener("click", async () => {
    try {
      const text = await navigator.clipboard.readText();
      setEditorValue(editor, text, detectEditorLanguage(text));
      if (typeof afterPaste === "function") {
        afterPaste();
      }
      updateJsonButtons();
      persistState();
    } catch (error) {
      const statusNode = editor === decodeInputEditor || editor === decodeOutputEditor ? decodeStatus : encodeStatus;
      renderError(statusNode, "Не удалось вставить из буфера обмена.");
    }
  });

  document.getElementById(copyButtonId).addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(editor.getValue());
    } catch (error) {
      const statusNode = editor === decodeInputEditor || editor === decodeOutputEditor ? decodeStatus : encodeStatus;
      renderError(statusNode, "Не удалось скопировать в буфер обмена.");
    }
  });
}

function bindJsonButton(buttonId, editor, mode) {
  document.getElementById(buttonId).addEventListener("click", () => {
    const text = editor.getValue();
    if (!isJsonText(text)) {
      return;
    }

    const nextText = mode === "format" ? formatJson(text) : minifyJson(text);
    const nextLanguage = "json";

    setEditorValue(editor, nextText, nextLanguage);

    if (editor === encodeInputEditor) {
      handleEncodeInput();
    } else if (editor === decodeInputEditor) {
      handleDecodeInput();
    }

    updateJsonButtons();
  });
}

function handleDecodeInput() {
  const normalized = decodeInputEditor.getValue().trim();

  if (!normalized) {
    setEditorValue(decodeOutputEditor, "", "plaintext");
    renderState(decodeStatus, "Вставьте MIME слева. Справа появится декодированный текст.");
    updateJsonButtons();
    return;
  }

  try {
    const result = decodeMimeToText(normalized);
    setEditorValue(decodeOutputEditor, result.text, result.language);
    renderState(decodeStatus, "Декодирование выполнено.");
  } catch (error) {
    setEditorValue(decodeOutputEditor, "", "plaintext");
    renderError(decodeStatus, error.message);
  }

  updateJsonButtons();
}

function handleEncodeInput() {
  const rawText = encodeInputEditor.getValue();

  if (!rawText.trim()) {
    setEditorValue(encodeOutputEditor, "", "plaintext");
    renderState(encodeStatus, "Вставьте текст слева. Справа появится MIME.");
    updateJsonButtons();
    return;
  }

  try {
    setLanguage(encodeInputEditor, detectEditorLanguage(rawText));
    setEditorValue(encodeOutputEditor, encodeText(rawText), "plaintext");
    renderState(encodeStatus, "Кодирование выполнено.");
  } catch (error) {
    setEditorValue(encodeOutputEditor, "", "plaintext");
    renderError(encodeStatus, error.message);
  }

  updateJsonButtons();
}

function moveDecodeOutputToEncodeInput() {
  const output = decodeOutputEditor.getValue();
  window.location.hash = "#encode";
  setEditorValue(encodeInputEditor, output, detectEditorLanguage(output));
  handleEncodeInput();
  persistState();
  encodeInputEditor.focus();
}

function moveEncodeOutputToDecodeInput() {
  const output = encodeOutputEditor.getValue();
  window.location.hash = "#decode";
  setEditorValue(decodeInputEditor, output, "plaintext");
  handleDecodeInput();
  persistState();
  decodeInputEditor.focus();
}

function clearDecodeFields() {
  setEditorValue(decodeInputEditor, "", "plaintext");
  setEditorValue(decodeOutputEditor, "", "plaintext");
  renderState(decodeStatus, "Поля очищены.");
  updateJsonButtons();
  persistState();
}

function clearEncodeFields() {
  setEditorValue(encodeInputEditor, "", "plaintext");
  setEditorValue(encodeOutputEditor, "", "plaintext");
  renderState(encodeStatus, "Поля очищены.");
  updateJsonButtons();
  persistState();
}

function decodeMimeToText(rawInput) {
  const base64Body = extractBase64(rawInput.trim());
  const decodedText = decodeBase64Unicode(base64Body);

  return {
    text: decodedText,
    language: detectEditorLanguage(decodedText),
  };
}

function encodeText(text) {
  return `${mimePrefix}${encodeBase64Unicode(text)}${mimeSuffix}`;
}

function extractBase64(value) {
  const mimeMatch = value.match(/^=\?UTF-8\?B\?([\s\S]+)\?=$/i);
  if (mimeMatch) {
    return mimeMatch[1].trim();
  }
  return value.trim();
}

function isJsonText(text) {
  const trimmed = text.trim();
  if (!trimmed) {
    return false;
  }

  try {
    JSON.parse(trimmed);
    return true;
  } catch (error) {
    return false;
  }
}

function formatJson(text) {
  return JSON.stringify(JSON.parse(text), null, 2);
}

function minifyJson(text) {
  return JSON.stringify(JSON.parse(text));
}

function detectEditorLanguage(text) {
  return isJsonText(text) ? "json" : "plaintext";
}

function setEditorValue(editor, value, language) {
  const model = editor.getModel();
  if (model.getValue() !== value) {
    editor.setValue(value);
  }
  setLanguage(editor, language);
}

function setLanguage(editor, language) {
  monaco.editor.setModelLanguage(editor.getModel(), language);
}

function encodeBase64Unicode(value) {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

function decodeBase64Unicode(value) {
  let binary;

  try {
    binary = atob(value);
  } catch (error) {
    throw new Error("Строка не похожа на корректный Base64.");
  }

  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));

  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch (error) {
    throw new Error("Base64 декодировался, но это невалидный UTF-8 текст.");
  }
}

function updateJsonButtons() {
  toggleJsonButtons("decodeInput", isJsonText(decodeInputEditor.getValue()));
  toggleJsonButtons("decodeOutput", isJsonText(decodeOutputEditor.getValue()));
  toggleJsonButtons("encodeInput", isJsonText(encodeInputEditor.getValue()));
  toggleJsonButtons("encodeOutput", isJsonText(encodeOutputEditor.getValue()));
}

function toggleJsonButtons(prefix, enabled) {
  document.getElementById(`${prefix}FormatButton`).disabled = !enabled;
  document.getElementById(`${prefix}MinifyButton`).disabled = !enabled;
}

function syncPageFromHash() {
  const isEncode = window.location.hash === "#encode";
  decodePage.classList.toggle("active", !isEncode);
  encodePage.classList.toggle("active", isEncode);
  decodeNav.classList.toggle("active", !isEncode);
  encodeNav.classList.toggle("active", isEncode);
  layoutEditors();
}

function handleHashChange() {
  syncPageFromHash();
  persistState();
}

function layoutEditors() {
  if (decodeInputEditor) {
    decodeInputEditor.layout();
    decodeOutputEditor.layout();
    encodeInputEditor.layout();
    encodeOutputEditor.layout();
  }
}

function renderState(statusNode, message) {
  statusNode.textContent = message;
  statusNode.classList.remove("error");
}

function renderError(statusNode, message) {
  statusNode.textContent = message;
  statusNode.classList.add("error");
}

function readStoredState() {
  try {
    const raw = localStorage.getItem(storageKey);
    return raw ? JSON.parse(raw) : null;
  } catch (error) {
    return null;
  }
}

function normalizeThemeState(rawState = null) {
  const hasRawState = rawState && typeof rawState === "object";
  const theme = hasRawState && (rawState.theme === "light" || rawState.theme === "space")
    ? rawState.theme
    : defaultTheme;
  const previousTheme = hasRawState && rawState.previousTheme === "light" ? "light" : defaultTheme;
  const rawSpaceLockUntil = hasRawState ? Number(rawState.spaceLockUntil) : 0;
  const spaceLockUntil = theme === "space" && Number.isFinite(rawSpaceLockUntil) && rawSpaceLockUntil > Date.now()
    ? rawSpaceLockUntil
    : 0;

  return {
    theme,
    previousTheme: theme === "space" ? previousTheme : theme,
    spaceLockUntil,
  };
}

function loadThemePreference() {
  return normalizeThemeState(readStoredState());
}

function isSpaceToggleLocked() {
  return themeState.theme === "space" && themeState.spaceLockUntil > Date.now();
}

function clearSpaceToggleLockTimer() {
  if (spaceToggleLockTimerId) {
    window.clearTimeout(spaceToggleLockTimerId);
    spaceToggleLockTimerId = 0;
  }
}

function scheduleSpaceToggleUnlock() {
  clearSpaceToggleLockTimer();

  if (!isSpaceToggleLocked()) {
    return;
  }

  const remaining = Math.max(0, themeState.spaceLockUntil - Date.now());
  spaceToggleLockTimerId = window.setTimeout(() => {
    themeState = normalizeThemeState({
      theme: themeState.theme,
      previousTheme: themeState.previousTheme,
      spaceLockUntil: 0,
    });
    syncThemeToggleButton();
    persistState();
  }, remaining);
}

function syncThemeToggleButton() {
  if (!themeToggleButton) {
    return;
  }

  const isLightTheme = themeState.theme === "light";
  const isSpaceTheme = themeState.theme === "space";
  const isLocked = isSpaceToggleLocked();
  const toggleLabel = isSpaceTheme ? "Exit deep space" : "";
  const toggleTitle = isSpaceTheme ? "Exit deep space" : "Переключить тему";

  themeToggleButton.classList.toggle("theme-toggle-space", isSpaceTheme);
  themeToggleButton.classList.toggle("theme-toggle-locked", isSpaceTheme && isLocked);
  themeToggleButton.disabled = isSpaceTheme && isLocked;
  themeToggleButton.setAttribute("aria-disabled", String(isSpaceTheme && isLocked));
  themeToggleButton.setAttribute("aria-pressed", String(isLightTheme));
  themeToggleButton.setAttribute("aria-label", toggleTitle);
  themeToggleButton.setAttribute("title", toggleTitle);

  if (themeToggleIcon) {
    themeToggleIcon.textContent = isSpaceTheme ? "" : isLightTheme ? "\u263e" : "\u2600";
  }

  if (themeToggleLabel) {
    themeToggleLabel.textContent = toggleLabel;
  }
}

function handleThemeToggleClick() {
  if (themeState.theme === "space") {
    if (isSpaceToggleLocked()) {
      return;
    }

    themeClickTimestamps = [];
    exitSpaceMode();
    persistState();
    return;
  }

  const didEnterSpaceMode = registerThemeToggleClick();
  if (didEnterSpaceMode) {
    persistState();
    return;
  }

  toggleTheme();
  persistState();
}

function registerThemeToggleClick() {
  const now = Date.now();
  themeClickTimestamps = themeClickTimestamps.filter((timestamp) => now - timestamp <= secretClickWindowMs);
  themeClickTimestamps.push(now);

  if (themeClickTimestamps.length >= secretClickThreshold) {
    themeClickTimestamps = [];
    enterSpaceMode(getNextStandardTheme());
    return true;
  }

  return false;
}

function getNextStandardTheme(theme = themeState.theme) {
  return theme === "light" ? defaultTheme : "light";
}

function toggleTheme() {
  const nextTheme = getNextStandardTheme();
  applyTheme(nextTheme, nextTheme, 0);
}

function enterSpaceMode(previousTheme = themeState.theme === "light" ? "light" : defaultTheme) {
  applyTheme("space", previousTheme, Date.now() + spaceToggleLockDurationMs);
}

function exitSpaceMode() {
  applyTheme(themeState.previousTheme, themeState.previousTheme, 0);
}

function applyTheme(theme, previousTheme = themeState.previousTheme, spaceLockUntil = 0) {
  themeState = normalizeThemeState({ theme, previousTheme, spaceLockUntil });

  document.documentElement.classList.toggle("theme-light", themeState.theme === "light");
  document.documentElement.classList.toggle("theme-space", themeState.theme === "space");
  document.body.classList.toggle("theme-light", themeState.theme === "light");
  document.body.classList.toggle("theme-space", themeState.theme === "space");

  syncThemeToggleButton();
  scheduleSpaceToggleUnlock();

  if (typeof monaco !== "undefined") {
    monaco.editor.setTheme(getMonacoTheme());
  }
}

function getMonacoTheme() {
  return themeState.theme === "light" ? "vs" : "vs-dark";
}

function persistState() {
  if (!decodeInputEditor || !encodeInputEditor) {
    return;
  }

  const state = {
    activeHash: window.location.hash === "#encode" ? "#encode" : "#decode",
    decodeInput: decodeInputEditor.getValue(),
    decodeOutput: decodeOutputEditor.getValue(),
    encodeInput: encodeInputEditor.getValue(),
    encodeOutput: encodeOutputEditor.getValue(),
    theme: themeState.theme,
    previousTheme: themeState.previousTheme,
    spaceLockUntil: themeState.spaceLockUntil,
  };

  try {
    localStorage.setItem(storageKey, JSON.stringify(state));
  } catch (error) {
    // Ignore storage failures silently to avoid breaking the tool.
  }
}

function restoreState() {
  try {
    const state = readStoredState();
    if (!state) {
      return;
    }

    if (typeof state.decodeInput === "string") {
      setEditorValue(decodeInputEditor, state.decodeInput, detectEditorLanguage(state.decodeInput));
    }
    if (typeof state.decodeOutput === "string") {
      setEditorValue(decodeOutputEditor, state.decodeOutput, detectEditorLanguage(state.decodeOutput));
    }
    if (typeof state.encodeInput === "string") {
      setEditorValue(encodeInputEditor, state.encodeInput, detectEditorLanguage(state.encodeInput));
    }
    if (typeof state.encodeOutput === "string") {
      setEditorValue(encodeOutputEditor, state.encodeOutput, detectEditorLanguage(state.encodeOutput));
    }

    if (state.activeHash === "#encode" || state.activeHash === "#decode") {
      window.location.hash = state.activeHash;
    }

    const restoredThemeState = normalizeThemeState(state);
    applyTheme(restoredThemeState.theme, restoredThemeState.previousTheme, restoredThemeState.spaceLockUntil);
  } catch (error) {
    // Ignore malformed stored data and continue with defaults.
  }
}
