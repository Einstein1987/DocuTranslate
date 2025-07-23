const nock = require('nock');
const handler = require('../translate').handler;

describe('translate handler', () => {
  afterEach(() => {
    nock.cleanAll();
  });

  it('returns translation with statusCode 200', async () => {
    process.env.DEEPL_API_KEY = 'test';
    const responseBody = { translations: [{ text: 'Bonjour' }] };

    nock('https://api-free.deepl.com')
      .post('/v2/translate')
      .reply(200, responseBody);

    const event = { body: JSON.stringify({ text: 'Hello', target_lang: 'FR' }) };
    const result = await handler(event, {});

    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body);
    expect(body).toEqual(responseBody);
  });
});
