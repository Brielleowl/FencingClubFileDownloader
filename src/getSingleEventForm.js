const playwright = require("playwright");
const { selectors } = require('@playwright/test');
const fs = require('fs');
const https = require('https');
const saveAs = require('file-saver');

const FENCING_URL = "https://www.fencingtimelive.com/";
const TEST_EVENT_NAME = 'Portland RYC';
const TOURNAMENTS_URL = 'https://fencingtimelive.com';
async function main (eventyName){
  const createTagNameEngine = () => ({
    // Returns the first element matching given selector in the root's subtree.
    query(root, selector) {
      return root.querySelector(selector);
    },

    // Returns all elements matching given selector in the root's subtree.
    queryAll(root, selector) {
      return Array.from(root.querySelectorAll(selector));
    }
  });

  await selectors.register('tag', createTagNameEngine);
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
  const noFound = page.getByText('No tournaments found');
  console.log('noFound', noFound)
  if (noFound) {
    throw Error("No tournaments found");
  }
  // click the first search result
  page.click("tag=table >> tbody >> tr >> td");
  
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
