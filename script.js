const decodeInput = document.getElementById("decodeInput");
const decodeOutput = document.getElementById("decodeOutput");
const decodeStatus = document.getElementById("decodeStatus");
const decodeCounter = document.getElementById("decodeCounter");
const encodeInput = document.getElementById("encodeInput");
const encodeOutput = document.getElementById("encodeOutput");
const encodeStatus = document.getElementById("encodeStatus");
const encodeCounter = document.getElementById("encodeCounter");
const decodePage = document.getElementById("decodePage");
const encodePage = document.getElementById("encodePage");
const decodeNav = document.getElementById("decodeNav");
const encodeNav = document.getElementById("encodeNav");

const sampleHeader = '=?UTF-8?B?WyJidHNfcG93ZXJhdHRvcm5leV9hY2Nlc3Nfd29ya193aXRoX3Bvd2VyX2F0dG9ybmV5IiwiYnRzX3Nob3BwaW5nX2NhcnRzX2FwcHJvdmluZyIsImJ0c19mdWxsX2FzcF9uYV9zZWxsX2N5Y2xlIiwidW1hX2F1dGhvcml6YXRpb24iLCJvZmZsaW5lX2FjY2VzcyJd?=';
const mimePrefix = "=?UTF-8?B?";
const mimeSuffix = "?=";

document.getElementById("decodePasteButton").addEventListener("click", () => pasteInto(decodeInput, handleDecodeInput));
document.getElementById("decodeSampleButton").addEventListener("click", loadSample);
document.getElementById("decodeClearButton").addEventListener("click", clearDecode);
document.getElementById("decodeCopyButton").addEventListener("click", () => copyText(decodeOutput.value, decodeStatus, decodeCounter, countRolesGuess(decodeOutput.value)));

document.getElementById("encodePasteButton").addEventListener("click", () => pasteInto(encodeInput, handleEncodeInput));
document.getElementById("beautifyButton").addEventListener("click", beautifyJsonInput);
document.getElementById("encodeClearButton").addEventListener("click", clearEncode);
document.getElementById("encodeCopyButton").addEventListener("click", () => copyText(encodeOutput.value, encodeStatus, encodeCounter, countRolesGuess(encodeInput.value)));

decodeInput.addEventListener("input", handleDecodeInput);
decodeInput.addEventListener("paste", () => setTimeout(handleDecodeInput, 0));
encodeInput.addEventListener("input", handleEncodeInput);
encodeInput.addEventListener("paste", () => setTimeout(handleEncodeInput, 0));
window.addEventListener("hashchange", syncPageFromHash);

syncPageFromHash();
handleDecodeInput();
handleEncodeInput();

function handleDecodeInput() {
  const normalized = decodeInput.value.trim();

  if (!normalized) {
    decodeOutput.value = "";
    renderState(decodeStatus, decodeCounter, "Вставьте MIME-заголовок, и роли появятся справа.", 0);
    return;
  }

  try {
    const parsed = decodeRoles(normalized);
    decodeOutput.value = parsed.roles.join("\n");
    renderState(decodeStatus, decodeCounter, `Найдено ролей: ${parsed.roles.length}.`, parsed.roles.length);
  } catch (error) {
    decodeOutput.value = "";
    renderError(decodeStatus, error.message);
  }
}

function handleEncodeInput() {
  const normalized = encodeInput.value.trim();

  if (!normalized) {
    encodeOutput.value = "";
    renderState(encodeStatus, encodeCounter, "Вставьте текст ролей или JSON-массив, и MIME появится справа.", 0);
    return;
  }

  try {
    const roles = parseRoleInput(normalized);
    encodeOutput.value = encodeRoles(roles);
    renderState(encodeStatus, encodeCounter, `Заголовок собран для ${roles.length} ролей.`, roles.length);
  } catch (error) {
    encodeOutput.value = "";
    renderError(encodeStatus, error.message);
  }
}

function loadSample() {
  decodeInput.value = sampleHeader;
  handleDecodeInput();
}

function clearDecode() {
  decodeInput.value = "";
  decodeOutput.value = "";
  renderState(decodeStatus, decodeCounter, "Поля очищены.", 0);
}

function clearEncode() {
  encodeInput.value = "";
  encodeOutput.value = "";
  renderState(encodeStatus, encodeCounter, "Поля очищены.", 0);
}

async function copyText(text, statusNode, counterNode, count) {
  if (!text.trim()) {
    renderError(statusNode, "Сначала получите результат, потом можно копировать.");
    return;
  }

  try {
    await navigator.clipboard.writeText(text);
    renderState(statusNode, counterNode, "Результат скопирован в буфер обмена.", count);
  } catch (error) {
    renderError(statusNode, "Не удалось скопировать текст. Возможно, браузер запретил доступ к буферу.");
  }
}

async function pasteInto(target, callback) {
  try {
    const text = await navigator.clipboard.readText();
    target.value = text;
    callback();
  } catch (error) {
    const statusNode = target === decodeInput ? decodeStatus : encodeStatus;
    renderError(statusNode, "Не удалось вставить текст из буфера обмена. Вставьте вручную.");
  }
}

function beautifyJsonInput() {
  const normalized = encodeInput.value.trim();

  if (!normalized) {
    renderError(encodeStatus, "Сначала вставьте JSON-массив.");
    return;
  }

  try {
    const parsed = JSON.parse(normalized);
    if (!Array.isArray(parsed)) {
      throw new Error("not-array");
    }
    encodeInput.value = JSON.stringify(parsed, null, 2);
    handleEncodeInput();
  } catch (error) {
    renderError(encodeStatus, "Beautify работает только для валидного JSON-массива.");
  }
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

  return value;
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

function syncPageFromHash() {
  const isEncode = window.location.hash === "#encode";
  decodePage.classList.toggle("active", !isEncode);
  encodePage.classList.toggle("active", isEncode);
  decodeNav.classList.toggle("active", !isEncode);
  encodeNav.classList.toggle("active", isEncode);
}

function renderState(statusNode, counterNode, message, count) {
  statusNode.textContent = message;
  statusNode.classList.remove("error");
  counterNode.textContent = `Ролей: ${count}`;
}

function renderError(statusNode, message) {
  statusNode.textContent = message;
  statusNode.classList.add("error");
}
