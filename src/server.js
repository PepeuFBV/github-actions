const express = require('express');

const app = express();
const port = Number(process.env.PORT) || 3000;

app.get('/', (_request, response) => {
  response.send('CI/CD Demo');
});

app.get('/health', (_request, response) => {
  response.json({ status: 'ok' });
});

app.listen(port, () => {
  console.log(`CI/CD Demo listening on port ${port}`);
});
