// macOS の uv_interface_addresses が一時的に失敗する環境向けのシム。
// Next.js が起動時に呼ぶ os.networkInterfaces() の例外で落ちないように、空のマップを返してフォールバックする。
const os = require("os");
const original = os.networkInterfaces;
os.networkInterfaces = function safeNetworkInterfaces(...args) {
  try {
    return original.apply(this, args);
  } catch (err) {
    if (!safeNetworkInterfaces.warned) {
      safeNetworkInterfaces.warned = true;
      console.warn("[dev-os-shim] os.networkInterfaces() failed, returning {}:", err.message);
    }
    return {};
  }
};
