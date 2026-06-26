# FencingClubFileDownloader
Its an automation tool to download fencing event CSV files from the website

## How to run
1. git clone or download zip file(the green top right corner)
2. cd to /FencingClubFileDownloader(there is index.js)
3. run command `npm install`
   - This also auto-installs the browser (a `postinstall` step runs `playwright install chromium`),
     so you do NOT need to run `npx playwright install` separately.
4. run command `node index`

## Login
The website now requires a login. The first time you run it, a Chrome window opens and
goes to the Google login page — sign in with your Google account there. The login is saved
in the `.chrome-profile` folder, so on later runs it logs in automatically and you won't be
asked again.

Notes:
- It uses your installed Google Chrome (best for Google login). If Chrome isn't installed,
  it automatically falls back to Playwright's bundled Chromium.
- To force a fresh login, delete the `.chrome-profile` folder and run again.
