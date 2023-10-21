const {main} = require('./src/getSingleEventForm');
const express = require('express');
const app = express();
app.use(express.static('public'));
app.use(express.json());
const path = require('path');

app.post('/download', async (req, res) => {
  console.log('receiving data ...');
  const eventName = req.body.tournamentsName;
  console.log(req.body)
  if (eventName != null) {
    console.log('eventName', eventName)
    try{
      await main(eventName);
    } catch (err) {
      res.status(500).send('Dowanload Failed' + err);
    }

    
  } else {
    console.log('event name is empty', eventName)
    res.status(500).send('Tournaments Name is Empty');
  }

  

});

app.get('/', function(req, res) {
    res.sendFile(path.join(__dirname, '/index.html'));
  });

app.listen(8081);