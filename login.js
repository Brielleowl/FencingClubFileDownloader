// 一次性登录脚本：用「正常的」Google Chrome（不带任何自动化）打开登录页。
// 因为不是程序控制的浏览器，Google 不会弹「此浏览器不安全」，你可以正常登录。
// 登录成功后直接关掉这个 Chrome 窗口即可，登录状态会保存在 .chrome-profile 目录里，
// 之后运行 `node index.js` 主程序会自动复用，不用再登录。
const { spawn } = require("child_process");
const path = require("path");

const USER_DATA_DIR = path.join(__dirname, ".chrome-profile");
const CHROME_PATH =
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const LOGIN_URL = "https://www.fencingtimelive.com/account/login";

console.log("\n正在打开正常的 Chrome 让你登录 FencingTimeLive ...");
console.log("请在打开的窗口里用 Google 登录（这次不会被拦）。");
console.log("登录成功、看到网站首页后，直接关掉这个 Chrome 窗口就行。");
console.log("然后运行：node index.js\n");

const child = spawn(
  CHROME_PATH,
  [`--user-data-dir=${USER_DATA_DIR}`, "--no-first-run", LOGIN_URL],
  { detached: true, stdio: "ignore" }
);
child.unref();
