const mimePrefix = "=?UTF-8?B?";
const mimeSuffix = "?=";

const decodeStatus = document.getElementById("decodeStatus");
const encodeStatus = document.getElementById("encodeStatus");
const decodePage = document.getElementById("decodePage");
const encodePage = document.getElementById("encodePage");
const decodeNav = document.getElementById("decodeNav");
const encodeNav = document.getElementById("encodeNav");

let decodeInputEditor;
let decodeOutputEditor;
let encodeInputEditor;
let encodeOutputEditor;
const monacoBaseUrl = new URL("./vendor/monaco/vs/", window.location.href).toString();

require.config({
  paths: {
    vs: "./vendor/monaco/vs",
  },
});

window.MonacoEnvironment = {
  getWorkerUrl() {
    return `data:text/javascript;charset=utf-8,${encodeURIComponent(`
      self.MonacoEnvironment = { baseUrl: ${JSON.stringify(monacoBaseUrl)} };
      importScripts(${JSON.stringify(`${monacoBaseUrl}base/worker/workerMain.js`)});
    `)}`;
  },
};

require(["vs/editor/editor.main"], () => {
  initEditors();
  initActions();
  syncPageFromHash();
  handleDecodeInput();
  handleEncodeInput();
  window.addEventListener("resize", layoutEditors);
  window.addEventListener("hashchange", syncPageFromHash);
});

function initEditors() {
  decodeInputEditor = createEditor("decodeInputEditor", "plaintext", true, "Вставьте MIME сюда");
  decodeOutputEditor = createEditor("decodeOutputEditor", "plaintext", true, "Результат появится здесь");
  encodeInputEditor = createEditor("encodeInputEditor", "plaintext", true, "Вставьте текст сюда");
  encodeOutputEditor = createEditor("encodeOutputEditor", "plaintext", true, "Результат появится здесь");

  decodeInputEditor.onDidChangeModelContent(() => {
    handleDecodeInput();
    updateJsonButtons();
  });
  decodeOutputEditor.onDidChangeModelContent(updateJsonButtons);
  encodeInputEditor.onDidChangeModelContent(() => {
    handleEncodeInput();
    updateJsonButtons();
  });
  encodeOutputEditor.onDidChangeModelContent(updateJsonButtons);
}

function createEditor(containerId, language, editable, placeholder) {
  return monaco.editor.create(document.getElementById(containerId), {
    value: "",
    language,
    theme: "vs",
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
  encodeInputEditor.focus();
}

function moveEncodeOutputToDecodeInput() {
  const output = encodeOutputEditor.getValue();
  window.location.hash = "#decode";
  setEditorValue(decodeInputEditor, output, "plaintext");
  handleDecodeInput();
  decodeInputEditor.focus();
}

function clearDecodeFields() {
  setEditorValue(decodeInputEditor, "", "plaintext");
  setEditorValue(decodeOutputEditor, "", "plaintext");
  renderState(decodeStatus, "Поля очищены.");
  updateJsonButtons();
}

function clearEncodeFields() {
  setEditorValue(encodeInputEditor, "", "plaintext");
  setEditorValue(encodeOutputEditor, "", "plaintext");
  renderState(encodeStatus, "Поля очищены.");
  updateJsonButtons();
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
