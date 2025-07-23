const nock = require('nock');
const handler = require('../fetch-doc').handler;

describe('fetch-doc handler', () => {
  afterEach(() => {
    nock.cleanAll();
  });

  it('returns PDF data with statusCode 200', async () => {
    const url = 'https://example.com/doc.pdf';
    const pdfData = 'PDFDATA';

    nock('https://example.com')
      .get('/doc.pdf')
      .reply(200, pdfData, {'Content-Type': 'application/pdf'});

    const event = { body: JSON.stringify({ url }) };

    const result = await handler(event, {});

    expect(result.statusCode).toBe(200);
    expect(result.isBase64Encoded).toBe(true);
    const decoded = Buffer.from(result.body, 'base64').toString();
    expect(decoded).toBe(pdfData);
    expect(result.headers['Content-Type']).toBe('application/pdf');
  });
});
