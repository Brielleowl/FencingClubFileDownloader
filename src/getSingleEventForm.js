const playwright = require("playwright");
const { selectors } = require("@playwright/test");
const fs = require("fs");
const path = require("path");
const XLSX = require("xlsx");

const TOURNAMENTS_URL = "https://fencingtimelive.com";

function getWeaponType(eventName) {
  if (eventName.includes("Foil")) return "Foil";
  if (eventName.includes("Saber")) return "Saber";
  if (eventName.includes("Épée")) return "Épée";
  return "";
}

async function main(eventyName, eventType) {
  const browser = await playwright.chromium.launch({
    headless: false, // setting this to true will not run the UI
  });

  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(TOURNAMENTS_URL);

  await page.click("text=USA");
  await page.waitForTimeout(1000);
  await page.click(`text=${eventType}`);
  await page.waitForTimeout(1000);
  await page.click("text=Last 10 days");

  const searchBar = page.locator("#searchBox");
  searchBar.type(eventyName);
  await page.click("#searchBut");
  await page.waitForTimeout(1000);

  const noFound10Days = await page.isVisible(".no-records-found");
  if (noFound10Days) {
    await page.click("text=Last 30 days");
    await page.waitForTimeout(2000);
    const noFound30Days = await page.isVisible(".no-records-found");
    if (noFound30Days) {
      browser.close();
      throw Error("No tournaments found");
    }
  }
  await page.waitForTimeout(2000);
  // click the first search result
  // page.click("tag=table >> tbody >> tr >> td");
  const firstRow = await page.$("table.tournTable tbody tr");
  firstRow.click();

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

    eventPage.goto(`${TOURNAMENTS_URL}${link}`);
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
  await browser.close();
}

module.exports = {
  main,
};
