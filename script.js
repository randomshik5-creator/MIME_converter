const inputText = document.getElementById("inputText");
const outputText = document.getElementById("outputText");
const statusNode = document.getElementById("status");
const counterNode = document.getElementById("counter");

const sampleHeader = '=?UTF-8?B?WyJidHNfcG93ZXJhdHRvcm5leV9hY2Nlc3Nfd29ya193aXRoX3Bvd2VyX2F0dG9ybmV5IiwiYnRzX3Nob3BwaW5nX2NhcnRzX2FwcHJvdmluZyIsImJ0c19mdWxsX2FzcF9uYV9zZWxsX2N5Y2xlIiwidW1hX2F1dGhvcml6YXRpb24iLCJvZmZsaW5lX2FjY2VzcyJd?=';

const mimePrefix = "=?UTF-8?B?";
const mimeSuffix = "?=";

document.getElementById("decodeButton").addEventListener("click", handleDecode);
document.getElementById("encodeButton").addEventListener("click", handleEncode);
document.getElementById("swapButton").addEventListener("click", handleSwap);
document.getElementById("sampleButton").addEventListener("click", handleSample);
document.getElementById("clearButton").addEventListener("click", handleClear);
document.getElementById("copyButton").addEventListener("click", () => copyText(outputText.value));
document.getElementById("pasteButton").addEventListener("click", pasteText);
inputText.addEventListener("input", handleAutoConvert);
inputText.addEventListener("paste", handleDeferredAutoConvert);

function handleDecode() {
  try {
    const parsed = decodeRoles(inputText.value);
    outputText.value = parsed.roles.join("\n");
    renderState(`Декодирование выполнено. Найдено ролей: ${parsed.roles.length}.`, parsed.roles.length);
  } catch (error) {
    renderError(error.message);
  }
}

function handleEncode() {
  try {
    const roles = parseRoleInput(inputText.value);
    const header = encodeRoles(roles);
    outputText.value = header;
    renderState(`Кодирование выполнено. Заголовок собран для ${roles.length} ролей.`, roles.length);
  } catch (error) {
    renderError(error.message);
  }
}

function handleSwap() {
  const previousInput = inputText.value;
  inputText.value = outputText.value;
  outputText.value = previousInput;
  handleAutoConvert();
}

function handleSample() {
  inputText.value = sampleHeader;
  handleAutoConvert();
}

function handleClear() {
  inputText.value = "";
  outputText.value = "";
  renderState("Поля очищены.", 0);
}

async function copyText(text) {
  if (!text.trim()) {
    renderError("Сначала получите результат, потом можно копировать.");
    return;
  }

  try {
    await navigator.clipboard.writeText(text);
    renderState("Результат скопирован в буфер обмена.", countRolesGuess(outputText.value));
  } catch (error) {
    renderError("Не удалось скопировать текст. Возможно, браузер запретил доступ к буферу.");
  }
}

async function pasteText() {
  try {
    const text = await navigator.clipboard.readText();
    inputText.value = text;
    handleAutoConvert();
  } catch (error) {
    renderError("Не удалось вставить текст из буфера обмена. Вставьте вручную.");
  }
}

function handleAutoConvert() {
  const normalized = inputText.value.trim();

  if (!normalized) {
    outputText.value = "";
    renderState("Готово к работе.", 0);
    return;
  }

  try {
    if (looksLikeEncodedHeader(normalized)) {
      const parsed = decodeRoles(normalized);
      outputText.value = parsed.roles.join("\n");
      renderState(`Распознан заголовок. Найдено ролей: ${parsed.roles.length}.`, parsed.roles.length);
      return;
    }

    const roles = parseRoleInput(normalized);
    outputText.value = encodeRoles(roles);
    renderState(`Распознан список ролей. Заголовок собран для ${roles.length} ролей.`, roles.length);
  } catch (error) {
    outputText.value = "";
    renderError(error.message);
  }
}

function handleDeferredAutoConvert() {
  setTimeout(handleAutoConvert, 0);
}

function decodeRoles(rawInput) {
  const normalized = rawInput.trim();

  if (!normalized) {
    throw new Error("Поле ввода пустое.");
  }

  const base64Body = extractBase64(normalized);
  const decodedText = decodeBase64Unicode(base64Body);
  let roles;

  try {
    roles = JSON.parse(decodedText);
  } catch (error) {
    throw new Error("После декодирования получился невалидный JSON.");
  }

  if (!Array.isArray(roles) || !roles.every((item) => typeof item === "string")) {
    throw new Error("Ожидался JSON-массив строк с ролями.");
  }

  return { roles };
}

function encodeRoles(roles) {
  const json = JSON.stringify(roles);
  const base64 = encodeBase64Unicode(json);
  return `${mimePrefix}${base64}${mimeSuffix}`;
}

function parseRoleInput(rawInput) {
  const normalized = rawInput.trim();

  if (!normalized) {
    throw new Error("Поле ввода пустое.");
  }

  if (normalized.startsWith("[")) {
    let parsed;
    try {
      parsed = JSON.parse(normalized);
    } catch (error) {
      throw new Error("JSON-массив ролей не удалось разобрать.");
    }

    if (!Array.isArray(parsed) || !parsed.every((item) => typeof item === "string")) {
      throw new Error("JSON должен быть массивом строк.");
    }

    return uniqueRoles(parsed);
  }

  return uniqueRoles(
    normalized
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
  );
}

function extractBase64(value) {
  const mimeMatch = value.match(/^=\?UTF-8\?B\?(.+)\?=$/i);
  if (mimeMatch) {
    return mimeMatch[1];
  }

  if (value.startsWith("[") || value.includes("\n")) {
    throw new Error("Похоже, это уже JSON или список ролей. Для этого используйте кнопку «Роли → заголовок».");
  }

  return value;
}

function looksLikeEncodedHeader(value) {
  if (/^=\?UTF-8\?B\?.+\?=$/i.test(value)) {
    return true;
  }

  if (value.startsWith("[") || value.includes("\n")) {
    return false;
  }

  return /^[A-Za-z0-9+/=]+$/.test(value);
}

function uniqueRoles(roles) {
  const seen = new Set();
  const result = [];

  for (const role of roles) {
    if (!seen.has(role)) {
      seen.add(role);
      result.push(role);
    }
  }

  return result;
}

function encodeBase64Unicode(value) {
  const bytes = new TextEncoder().encode(value);
  return bytesToBase64(bytes);
}

function decodeBase64Unicode(value) {
  let bytes;

  try {
    bytes = base64ToBytes(value);
  } catch (error) {
    throw new Error("Строка не похожа на корректный Base64.");
  }

  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch (error) {
    throw new Error("Base64 декодировался, но это невалидный UTF-8 текст.");
  }
}

function bytesToBase64(bytes) {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

function base64ToBytes(value) {
  const binary = atob(value);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

function countRolesGuess(text) {
  const normalized = text.trim();
  if (!normalized) {
    return 0;
  }

  if (normalized.startsWith("[") && normalized.endsWith("]")) {
    try {
      const parsed = JSON.parse(normalized);
      return Array.isArray(parsed) ? parsed.length : 0;
    } catch (error) {
      return 0;
    }
  }

  return normalized.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).length;
}

function renderState(message, count) {
  statusNode.textContent = message;
  statusNode.classList.remove("error");
  counterNode.textContent = `Ролей: ${count}`;
}

function renderError(message) {
  statusNode.textContent = message;
  statusNode.classList.add("error");
}
