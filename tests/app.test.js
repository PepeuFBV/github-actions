const assert = require('node:assert/strict');
const { after, before, test } = require('node:test');
const request = require('supertest');
const app = require('../src/app');

let server;

before(() => {
  server = app.listen(0);
});

after(() => {
  server.close();
});

test('GET / returns the demo message', async () => {
  const response = await request(server).get('/');

  assert.equal(response.status, 200);
  assert.equal(response.text, 'CI/CD Demo');
});

test('GET /health returns an OK status', async () => {
  const response = await request(server).get('/health');

  assert.equal(response.status, 200);
  assert.deepEqual(response.body, { status: 'ok' });
});
