const options = {
    method: 'GET',
    headers: {
      cookie: 'lang=en-US; _csrf=RN-BvU99qTe3L2g0qQ2LruWw',
      'User-Agent': 'insomnia/8.2.0'
    }
  };
(async () => {
    const res = await fetch('https://fencingtimelive.com/events/results/download/A728AECC74CC4160949C7B437E10E3F0', options)
    .then(response => response.text())
    .then(response => console.log(response))
    .catch(err => console.error(err));
    console.log('res', res);
})()
