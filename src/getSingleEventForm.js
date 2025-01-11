const playwright = require("playwright");
const { selectors } = require("@playwright/test");
const fs = require("fs");
const https = require("https");
const saveAs = require("file-saver");
const path = require("path");
const XLSX = require("xlsx");

const TOURNAMENTS_URL = "https://fencingtimelive.com";
const MONTH_MAP = {
  January: "1",
  February: "2",
  March: "3",
  April: "4",
  May: "5",
  June: "6",
  July: "7",
  August: "8",
  September: "9",
  October: "10",
  November: "11",
  December: "12",
};

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

  const noFound = await page.isVisible(".no-records-found");
  if (noFound) {
    browser.close();
    throw Error("No tournaments found");
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
  const tournName = await tournNameEle.innerText();

  const eventTableHandler = await page.locator("table");
  // get Date
  const allEventDateAndTime = await page.locator("h5").allInnerTexts();
  const formattedCSVPath = path.join(__dirname, "..", "formattedCSV");
  if (!fs.existsSync(formattedCSVPath)) {
    fs.mkdirSync(formattedCSVPath, { recursive: true });
  }
  const scheduleFilePath = path.join(
    formattedCSVPath,
    `${tournName}_schedule.csv`
  );
  const headers = "Start,Event,Day,Date,Start Time, End Time\n";
  fs.writeFileSync(scheduleFilePath, headers);

  // get eventName, StartTime, EndTime
  for (let i = 0; i < (await eventTableHandler.count()); i++) {
    // get Date and Day
    const [day, month, dateWithComma, year] = allEventDateAndTime[i].split(" ");
    const eventDate = dateWithComma.replace(",", "");
    const formattedDate = `${MONTH_MAP[month]}/${eventDate}/${year}`;

    const curTable = eventTableHandler.nth(i);
    const rowHandler = curTable.locator("tbody").nth(0).locator("tr");
    for (let i = 0; i < (await rowHandler.count()); i++) {
      // Start Time and End Time

      const row = rowHandler.nth(i).locator("td");
      const startTime = await row.nth(0).innerText();
      const eventName = await row.nth(1).innerText();
      const fullEndTime = await row.nth(2).innerText();
      if (!fullEndTime.startsWith("Finished at")) continue;
      const endTime = fullEndTime
        .split("Finished at ")[1] // Get everything after "Finished at "
        .match(/\d{1,2}:\d{2}\s?[AP]M/)[0] // Extract time in format "2:00 PM"
        .trim();
      ("3:13 PM");

      // Format: Start,Event,Day,Date,Start Time,End Time
      const csvLine = `"${startTime}","${eventName}","${day}","${formattedDate}","${startTime}","${endTime}"\n`;

      fs.appendFileSync(scheduleFilePath, csvLine, "utf8");
    }
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
    if (headers.includes("Team Name")) continue;
    const rowsLocator = eventPage.locator("#resultList tbody tr");
    const rowCount = await rowsLocator.count();
    let tableData = [];

    for (let i = 0; i < rowCount; i++) {
      const row = rowsLocator.nth(i).locator("td");
      const rowData = await row.allInnerTexts();
      tableData.push(rowData);
    }

    headers.push("Event Name", "Day", "Date", "Type");
    tableData = tableData.map((row) => [
      ...row,
      eventName,
      dayText,
      formattedDate,
      weaponType,
    ]);

    [headers, ...tableData].map((row) => row.join(",")).join("\n");

    // create summary tab
    const nameIndex = headers.indexOf("Name");
    const typeIndex = headers.length - 1; // Type 是最后一列

    const summaryData = new Map(); // Map<type, Map<name, count>>

    tableData.forEach((row) => {
      const type = row[typeIndex];
      const name = row[nameIndex];

      if (!summaryData.has(type)) {
        summaryData.set(type, new Map());
      }

      const typeMap = summaryData.get(type);
      typeMap.set(name, (typeMap.get(name) || 0) + 1);
    });

    let mainSheet;
    if (i === 0) {
      // Create new sheet with headers and first event's data
      mainSheet = XLSX.utils.aoa_to_sheet([headers, ...tableData]);
      XLSX.utils.book_append_sheet(workbook, mainSheet, "Main Data");
    } else {
      // Get existing sheet and append new data
      mainSheet = workbook.Sheets["Main Data"];
      XLSX.utils.sheet_add_aoa(mainSheet, tableData, {
        origin: -1 // This tells it to append at the end
      });
      console.log("mainSheet", mainSheet)
    }

    // const summaryRows = [["Type", "Name", "Count"]];

    // for (const [type, nameMap] of summaryData) {
    //   const duplicateNames = new Set(
    //     [...nameMap.entries()]
    //       .filter(([_, count]) => count > 1)
    //       .map(([name]) => name)
    //   );

    //   for (const [name, count] of nameMap) {
    //     summaryRows.push([type, name, count]);
    //   }
    // }

    const xlsxFilePath = path.join(
      formattedCSVPath,
      `${tournName}_processed_data.xlsx`
    );
    XLSX.writeFile(workbook, xlsxFilePath);

    eventPage.close();
  }

  await page.waitForTimeout(5000);
  await browser.close();
}

module.exports = {
  main,
};
