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

const mimePrefix = "=?UTF-8?B?";
const mimeSuffix = "?=";

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
    decodeOutput.value = formatDecodedText(parsed.text);
    renderState(decodeStatus, decodeCounter, "Декодирование выполнено.", parsed.count);
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
    encodeOutput.value = encodeText(normalized);
    renderState(encodeStatus, encodeCounter, "Кодирование выполнено.", countRolesGuess(normalized));
  } catch (error) {
    encodeOutput.value = "";
    renderError(encodeStatus, error.message);
  }
}

function decodeRoles(rawInput) {
  const normalized = rawInput.trim();

  if (!normalized) {
    throw new Error("Поле ввода пустое.");
  }

  const base64Body = extractBase64(normalized);
  const decodedText = decodeBase64Unicode(base64Body);
  let parsedJson = null;

  try {
    parsedJson = JSON.parse(decodedText);
  } catch (error) {
    return {
      text: decodedText,
      count: countRolesGuess(decodedText),
    };
  }

  return {
    text: JSON.stringify(parsedJson, null, 2),
    count: Array.isArray(parsedJson) ? parsedJson.length : countRolesGuess(decodedText),
  };
}

function encodeText(text) {
  const base64 = encodeBase64Unicode(text);
  return `${mimePrefix}${base64}${mimeSuffix}`;
}

function extractBase64(value) {
  const mimeMatch = value.match(/^=\?UTF-8\?B\?(.+)\?=$/i);
  if (mimeMatch) {
    return mimeMatch[1];
  }

  return value;
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

function formatDecodedText(text) {
  try {
    return JSON.stringify(JSON.parse(text), null, 2);
  } catch (error) {
    return text;
  }
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
