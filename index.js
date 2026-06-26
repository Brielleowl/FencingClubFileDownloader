const {main} = require('./src/getSingleEventForm');
const express = require('express');
const app = express();
app.use(express.static('public'));
app.use(express.json());
const path = require('path');
const PORT = 8081;

const open = require('open');

// 标记是否正在处理一个下载请求：避免同时跑两个，
// 否则后一个请求会把前一个正在登录/下载的浏览器杀掉（导致 "browser has been closed"）。
let isProcessing = false;

app.post('/download', async (req, res) => {
  console.log('receiving data ...');
  const eventName = req.body.tournamentsName;
  const eventType = req.body.tournamentsType;
  console.log(req.body)
  if (isProcessing) {
    console.log('already processing, reject duplicate request');
    res.status(429).send('正在处理上一个下载，请等它完成后再试（不要重复点击）');
    return;
  }
  if (eventName != null) {
    console.log('eventName', eventName)
    isProcessing = true;
    try{
      await main(eventName, eventType);
      res.status(200).send('Download Complete');
    } catch (err) {
      res.status(500).send('Dowanload Failed' + err);
    } finally {
      isProcessing = false;
    }
  } else {
    console.log('event name is empty', eventName)
    res.status(500).send('Tournaments Name is Empty');
  }

});

app.get('/', function(req, res) {
    res.sendFile(path.join(__dirname, '/index.html'));
  });

app.listen(PORT, ()=>{
    console.log(`Server is running on http://localhost:${PORT}`);
    const url = `http://localhost:${PORT}`; // 将端口号替换为您的应用程序的端口
    open(url);
});