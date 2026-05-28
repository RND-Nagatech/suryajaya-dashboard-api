const ENC_KEY = "B3r4sput1h";

function encryptascii(str) {
  if (!str) return "";
  const key = ENC_KEY;
  let result = "";
  let nkey = 0;

  for (let i = 0; i < str.length; i++) {
    result += (str.charCodeAt(i) + key.charCodeAt(nkey)).toString(16);
    nkey = (nkey + 1) % key.length;
  }
  return result.toUpperCase();
}

function decryptascii(str) {
  if (!str) return "";
  const key = ENC_KEY;
  let result = "";
  let nkey = 0;
  let i = 0;

  while (i < str.length) {
    const hex = str.substring(i, i + 2);
    if (hex.length < 2) break;
    const charCode = parseInt(hex, 16) - key.charCodeAt(nkey);
    result += String.fromCharCode(charCode);
    nkey = (nkey + 1) % key.length;
    i += 2;
  }
  return result;
}

module.exports = { encryptascii, decryptascii };
