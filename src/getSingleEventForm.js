const playwright = require("playwright");
const { selectors } = require('@playwright/test');
const fs = require('fs');
const https = require('https');
const saveAs = require('file-saver');

const FENCING_URL = "https://www.fencingtimelive.com/";
const TOURNAMENTS_URL = 'https://fencingtimelive.com';
async function main (eventyName){
  const browser = await playwright.chromium.launch({
    headless: false, // setting this to true will not run the UI
  });
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(FENCING_URL);

  await page.click("text=USA")
  await page.waitForTimeout(1000);
  await page.click("text=Regional")
  await page.waitForTimeout(1000);
  await page.click("text=Last 10 days")

  const searchBar = page.locator('#searchBox');
  searchBar.type(eventyName);
  await page.click("#searchBut")
  await page.waitForTimeout(1000);

  const noFound = await page.isVisible(".no-records-found");
  if (noFound) {
    browser.close();
    throw Error("No tournaments found");
  }
  await page.waitForTimeout(2000);
  // click the first search result
  // page.click("tag=table >> tbody >> tr >> td");
  const firstRow = await page.$('table.tournTable tbody tr');
  firstRow.click();
  
  //go through all event schedule item 
  await page.waitForTimeout(1000);
  const eventBodyHandler = page.locator('.table').locator('tbody').locator('tr');
  const eventCount = await page.locator('.table').locator('tbody').locator('tr').count();

  for (let i=0; i<eventCount; i++) {
    const newPage = await context.newPage();
    
    const link = await eventBodyHandler.nth(i).locator('td').nth(1).locator('a').getAttribute('href');
    newPage.goto(`${TOURNAMENTS_URL}${link}`)
    await page.waitForTimeout(3000);
    const href = await newPage.locator('#butDownload').getAttribute('href');
    const [download] = await Promise.all([
      newPage.waitForEvent('download'),
      newPage.locator('#butDownload').click(),
    ]);

    const suggestedFilename = await newPage.title();
    const filePath = './' + suggestedFilename + '.csv';
    await download.saveAs(filePath);

    newPage.close();

  }

  await page.waitForTimeout(5000);
  await browser.close();
  
};


module.exports = {
  main
}
