const express = require('express');

const app = express();

app.get('/', (_request, response) => {
  response.send('CI/CD Demo');
});

app.get('/health', (_request, response) => {
  response.json({ status: 'ok' });
});

module.exports = app;
