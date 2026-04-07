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

require.config({
  paths: {
    vs: "https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.52.2/min/vs",
  },
});

window.MonacoEnvironment = {
  getWorkerUrl() {
    return `data:text/javascript;charset=utf-8,${encodeURIComponent(`
      self.MonacoEnvironment = { baseUrl: 'https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.52.2/min/' };
      importScripts('https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.52.2/min/vs/base/worker/workerMain.min.js');
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

  decodeInputEditor.onDidChangeModelContent(handleDecodeInput);
  encodeInputEditor.onDidChangeModelContent(handleEncodeInput);
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
}

function handleDecodeInput() {
  const normalized = decodeInputEditor.getValue().trim();

  if (!normalized) {
    setEditorValue(decodeOutputEditor, "", "plaintext");
    renderState(decodeStatus, "Вставьте MIME слева. Справа появится декодированный текст.");
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
}

function handleEncodeInput() {
  const normalized = encodeInputEditor.getValue();

  if (!normalized.trim()) {
    setEditorValue(encodeOutputEditor, "", "plaintext");
    renderState(encodeStatus, "Вставьте текст слева. Справа появится MIME.");
    return;
  }

  try {
    const inputText = beautifyJsonIfPossible(normalized);
    if (inputText !== normalized) {
      preserveSelectionWhileUpdating(encodeInputEditor, inputText, "json");
    } else {
      setLanguage(encodeInputEditor, detectEditorLanguage(normalized));
    }

    setEditorValue(encodeOutputEditor, encodeText(inputText), "plaintext");
    renderState(encodeStatus, "Кодирование выполнено.");
  } catch (error) {
    setEditorValue(encodeOutputEditor, "", "plaintext");
    renderError(encodeStatus, error.message);
  }
}

function moveDecodeOutputToEncodeInput() {
  const output = decodeOutputEditor.getValue();
  window.location.hash = "#encode";
  setEditorValue(encodeInputEditor, beautifyJsonIfPossible(output), detectEditorLanguage(output));
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
}

function clearEncodeFields() {
  setEditorValue(encodeInputEditor, "", "plaintext");
  setEditorValue(encodeOutputEditor, "", "plaintext");
  renderState(encodeStatus, "Поля очищены.");
}

function decodeMimeToText(rawInput) {
  const base64Body = extractBase64(rawInput.trim());
  const decodedText = decodeBase64Unicode(base64Body);
  const beautified = beautifyJsonIfPossible(decodedText);

  return {
    text: beautified,
    language: detectEditorLanguage(beautified),
    count: countLines(beautified),
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

function beautifyJsonIfPossible(text) {
  const trimmed = text.trim();
  if (!trimmed) {
    return text;
  }

  try {
    return JSON.stringify(JSON.parse(trimmed), null, 2);
  } catch (error) {
    return text;
  }
}

function detectEditorLanguage(text) {
  const trimmed = text.trim();
  if (!trimmed) {
    return "plaintext";
  }

  try {
    JSON.parse(trimmed);
    return "json";
  } catch (error) {
    return "plaintext";
  }
}

function setEditorValue(editor, value, language) {
  const model = editor.getModel();
  if (model.getValue() !== value) {
    editor.setValue(value);
  }
  setLanguage(editor, language);
}

function preserveSelectionWhileUpdating(editor, value, language) {
  const selection = editor.getSelection();
  setEditorValue(editor, value, language);
  if (selection) {
    editor.setSelection(selection);
  }
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

function countLines(text) {
  const trimmed = text.trim();
  if (!trimmed) {
    return 0;
  }
  return trimmed.split(/\r?\n/).length;
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
