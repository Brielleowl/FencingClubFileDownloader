const playwright = require("playwright");
const { selectors } = require("@playwright/test");
const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");
const XLSX = require("xlsx");

// 用带 www 的地址，和 Google 登录回调的域名保持一致，避免登录后 cookie 对不上
const TOURNAMENTS_URL = "https://www.fencingtimelive.com";
// 持久化浏览器目录：登录 cookie 保存在这里，登录一次即可长期复用
const USER_DATA_DIR = path.join(__dirname, "..", ".chrome-profile");

function getWeaponType(eventName) {
  if (eventName.includes("Foil")) return "Foil";
  if (eventName.includes("Saber")) return "Saber";
  if (eventName.includes("Épée")) return "Épée";
  return "";
}

// 关掉可能还占用着本项目专属配置目录的 Chrome（比如 login.js 打开后只关了窗口、
// 进程还在后台），否则 Playwright 会报 "profile is already in use"。
// 只针对用了 USER_DATA_DIR 的进程，不影响你日常用的 Chrome。
async function releaseProfileLock() {
  try {
    execSync(`pkill -f ${JSON.stringify(USER_DATA_DIR)}`);
    // 给进程一点时间退出、释放锁
    await new Promise((r) => setTimeout(r, 1500));
  } catch (e) {
    // 没有匹配的进程时 pkill 返回非零会抛错，忽略即可
  }
  // 清掉可能残留的锁文件
  for (const lock of ["SingletonLock", "SingletonCookie", "SingletonSocket"]) {
    try {
      fs.rmSync(path.join(USER_DATA_DIR, lock), { force: true });
    } catch (e) {}
  }
}

async function main(eventyName, eventType) {
  await releaseProfileLock();

  // 用真正的 Chrome（channel: chrome）+ 持久化目录启动：
  // 1) Google 在真 Chrome 里基本不会拦截登录（自动化版 Chromium 会被拦）
  // 2) 登录状态保存在 USER_DATA_DIR，登录一次以后长期复用
  const launchOptions = {
    headless: false, // setting this to true will not run the UI
    // 降低自动化指纹，尽量避免 Google 弹「此浏览器不安全」
    ignoreDefaultArgs: ["--enable-automation"],
    args: ["--disable-blink-features=AutomationControlled"],
  };
  let context;
  try {
    context = await playwright.chromium.launchPersistentContext(USER_DATA_DIR, {
      ...launchOptions,
      channel: "chrome",
    });
  } catch (e) {
    // 系统没装 Google Chrome 时，退回 Playwright 自带的 Chromium
    console.log("未找到系统 Chrome，改用 Playwright 自带的 Chromium 启动...");
    context = await playwright.chromium.launchPersistentContext(
      USER_DATA_DIR,
      launchOptions
    );
  }
  const page = context.pages()[0] || (await context.newPage());
  await page.goto(TOURNAMENTS_URL);

  // 检测登录墙：未登录时整个站点会跳转到 /account/login
  if (page.url().includes("/account/login")) {
    console.log("\n=== 需要登录 ===");
    // 自动点击「用 Google 登录」按钮
    const googleLogin = page.locator('a[href*="/login/auth/google"]');
    if (await googleLogin.count()) {
      console.log("正在自动跳转到 Google 登录...");
      await googleLogin.first().click();
    }
    console.log("请在浏览器窗口里完成 Google 登录（选账号 / 输密码）。");
    console.log("登录过一次后，以后运行会自动跳过这一步。");
    console.log("等待登录完成，最多等待 5 分钟...\n");
    // 等到回到 FencingTimeLive 首页（登录成功后会跳回来），且不再是登录页。
    // 注意：只能判断「域名」，不能判断整个 URL 字符串——因为在 Google 登录页时，
    // URL 的 redirect_uri 参数里也含有 "fencingtimelive.com"，会造成误判。
    await page.waitForURL(
      (url) => {
        const u = new URL(url.toString());
        return (
          u.hostname.endsWith("fencingtimelive.com") &&
          !u.pathname.includes("/account/login")
        );
      },
      { timeout: 300000 }
    );
    console.log("登录成功，继续...\n");
    // 登录后可能停在某个子页面，回到首页准备搜索（此时 cookie 已对上，不会再被踢回登录页）
    if (!page.url().includes("/account/login")) {
      await page.goto(TOURNAMENTS_URL);
    }
    if (page.url().includes("/account/login")) {
      await context.close();
      throw Error("登录未完成，请重试");
    }
  }

  await page.click("text=USA");
  await page.waitForTimeout(1000);
  await page.click(`text=${eventType}`);
  await page.waitForTimeout(1000);
  await page.click("text=Last 10 days");

  const searchBar = page.locator("#searchBox");
  // 用 fill 会先清空搜索框再输入，避免和上次残留的关键词拼接在一起
  await searchBar.fill(eventyName);
  await page.click("#searchBut");
  await page.waitForTimeout(1000);

  const noFound10Days = await page.isVisible(".no-records-found");
  if (noFound10Days) {
    await page.click("text=Last 30 days");
    await page.waitForTimeout(2000);
    const noFound30Days = await page.isVisible(".no-records-found");
    if (noFound30Days) {
      await context.close();
      throw Error("No tournaments found");
    }
  }
  await page.waitForTimeout(2000);
  // click the first search result
  // page.click("tag=table >> tbody >> tr >> td");
  const firstRow = await page.$("table.tournTable tbody tr");
  await firstRow.click();

  //go through all event schedule item
  await page.waitForTimeout(1000);
  const eventBodyHandler = page
    .locator(".table")
    .locator("tbody")
    .locator("tr");
  const eventCount = await page
    .locator(".table")
    .locator("tbody")
    .locator("tr")
    .count();
  // get folder(event title) name
  const tournNameEle = await page.$(".desktop.tournName");
  let tournName = await tournNameEle.innerText();
  if (tournName.includes("/")) {
    tournName = tournName.replaceAll("/", "_");
  }

  const formattedCSVPath = path.join(__dirname, "..", "formattedCSV");
  if (!fs.existsSync(formattedCSVPath)) {
    fs.mkdirSync(formattedCSVPath, { recursive: true });
  }

  // create xlsx file
  const workbook = XLSX.utils.book_new();

  for (let i = 0; i < eventCount; i++) {
    const eventPage = await context.newPage();

    const link = await eventBodyHandler
      .nth(i)
      .locator("td")
      .nth(1)
      .locator("a")
      .getAttribute("href");
    // get startTime and endTime
    const startTime = await eventBodyHandler
      .nth(i)
      .locator("td")
      .nth(0)
      .innerText();
    const fullEndTime = await eventBodyHandler
      .nth(i)
      .locator("td")
      .nth(2)
      .innerText();
    if (!fullEndTime.startsWith("Finished at")) continue;
    const endTime = fullEndTime
      .split("Finished at ")[1] // Get everything after "Finished at "
      .match(/\d{1,2}:\d{2}\s?[AP]M/)[0] // Extract time in format "2:00 PM"
      .trim();
    ("3:13 PM");

    await eventPage.goto(`${TOURNAMENTS_URL}${link}`);
    await eventPage.waitForTimeout(2000);
    const eventName = await eventPage.locator(".desktop.eventName").innerText();
    const weaponType = getWeaponType(eventName);
    const eventDate = await eventPage.locator(".desktop.eventTime").innerText();
    const [dayText, ...dateText] = eventDate.split(", ");
    const fullDate = dateText.join(", ");
    const dateObj = new Date(fullDate);
    const formattedDate = `${
      dateObj.getMonth() + 1
    }/${dateObj.getDate()}/${dateObj.getFullYear()}`;

    const headerLocator = eventPage.locator("#resultList thead tr th");
    const headers = await headerLocator.allInnerTexts();
    if (headers.includes("Team Name")) {
      await eventPage.close();
      continue;
    }
    const rowsLocator = eventPage.locator("#resultList tbody tr");
    const rowCount = await rowsLocator.count();
    let tableData = [];

    // 定义所有可能的列
    const expectedHeaders = [
      "Place",
      "Name",
      "Club(s)",
      "Class.",
      "Earned",
      "Qualified For",
    ];

    // 创建一个映射来确定每个列的位置，不存在的列将被填充为空字符串
    const headerIndexMap = expectedHeaders.map((header) =>
      headers.indexOf(header)
    );

    for (let i = 0; i < rowCount; i++) {
      const row = rowsLocator.nth(i).locator("td");
      const rowData = await row.allInnerTexts();

      // 根据预期的列创建新的行数据
      const filledRowData = headerIndexMap.map((index) =>
        index === -1 ? "" : rowData[index] || ""
      );

      tableData.push(filledRowData);
    }

    headers.push("Event Name", "Day", "Date", "Type", "Start Time", "End Time");
    tableData = tableData.map((row) => [
      ...row,
      eventName,
      dayText,
      formattedDate,
      weaponType,
      startTime,
      endTime,
    ]);

    [headers, ...tableData].map((row) => row.join(",")).join("\n");

    let mainSheet;
    if (i === 0) {
      mainSheet = XLSX.utils.aoa_to_sheet([headers, ...tableData]);
      XLSX.utils.book_append_sheet(workbook, mainSheet, "Main Data");
    } else {
      mainSheet = workbook.Sheets["Main Data"];
      XLSX.utils.sheet_add_aoa(mainSheet, tableData, {
        origin: -1,
      });
    }

    eventPage.close();
  }

  // Create summary sheet after all data is collected
  const mainSheet = workbook.Sheets["Main Data"];
  const mainData = XLSX.utils.sheet_to_json(mainSheet);

  // First, collect all names and their counts by type
  const allNamesData = new Map(); // Map<type, Map<name, count>>
  // Track which names are from Maximum Fencing Club
  const maximumFencingNames = new Set();

  mainData.forEach((row) => {
    const type = row.Type;
    const name = row.Name;
    // Track if this person is ever from Maximum Fencing Club
    if (row["Club(s)"]?.includes("Maximum Fencing Club")) {
      maximumFencingNames.add(name);
    }

    if (!allNamesData.has(type)) {
      allNamesData.set(type, new Map());
    }

    const typeMap = allNamesData.get(type);
    typeMap.set(name, (typeMap.get(name) || 0) + 1);
  });

  // Filter to only include names that appear in Maximum Fencing Club
  const summaryData = new Map();
  for (const [type, nameMap] of allNamesData) {
    const filteredNameMap = new Map();
    for (const [name, count] of nameMap) {
      if (maximumFencingNames.has(name)) {
        filteredNameMap.set(name, count);
      }
    }
    if (filteredNameMap.size > 0) {
      summaryData.set(type, filteredNameMap);
    }
  }

  // Create summary sheet
  const summaryHeaders = ["Type", "Name", "Count", "Coaching", "Travel Exp"];
  const summaryRows = [summaryHeaders];

  // Convert summary data to rows
  for (const [type, nameMap] of summaryData) {
    for (const [name, count] of nameMap) {
      summaryRows.push([type, name, count, "", ""]);
    }
  }

  const summarySheet = XLSX.utils.aoa_to_sheet(summaryRows);

  // Add red background to duplicate names
  const duplicateNames = new Set(
    [...summaryData.values()]
      .flatMap((nameMap) => [...nameMap.entries()])
      .filter(([_, count]) => count > 1)
      .map(([name]) => name)
  );

  // Style cells with duplicate names and prepare merge cells
  let currentType = null;
  let mergeStart = 1; // Start from row 1 (after header)
  let mergeCells = [];

  for (let i = 1; i < summaryRows.length; i++) {
    // Handle duplicate names highlighting
    const cellRef = XLSX.utils.encode_cell({ r: i, c: 1 }); // Column B (Name)
    const name = summaryRows[i][1];
    const type = summaryRows[i][0];

    if (duplicateNames.has(name)) {
      if (!summarySheet[cellRef].s) summarySheet[cellRef].s = {};
      summarySheet[cellRef].s.fill = {
        fgColor: { rgb: "FFFF0000" },
        patternType: "solid",
      };
    }

    // Handle type merging
    if (type !== currentType) {
      if (currentType !== null && i - mergeStart > 1) {
        mergeCells.push({
          s: { r: mergeStart, c: 0 },
          e: { r: i - 1, c: 0 },
        });
      }
      currentType = type;
      mergeStart = i;
    }
  }

  // Don't forget to merge the last group
  if (summaryRows.length - mergeStart > 1) {
    mergeCells.push({
      s: { r: mergeStart, c: 0 },
      e: { r: summaryRows.length - 1, c: 0 },
    });
  }

  // Apply merges to the sheet
  summarySheet["!merges"] = mergeCells;

  XLSX.utils.book_append_sheet(workbook, summarySheet, "Summary");

  const xlsxFilePath = path.join(
    formattedCSVPath,
    `${tournName}_processed_data.xlsx`
  );

  XLSX.writeFile(workbook, xlsxFilePath);

  await page.waitForTimeout(5000);
  await context.close();
}

module.exports = {
  main,
};
