const fetch = require('node-fetch');

exports.handler = async (event, context) => {
  const { text, target_lang } = JSON.parse(event.body);
  const DEEPL_API_KEY = process.env.DEEPL_API_KEY;

  try {
    const response = await fetch('https://api-free.deepl.com/v2/translate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        auth_key: DEEPL_API_KEY,
        text: text,
        target_lang: target_lang,
      }),
    });

    const data = await response.json();
    return {
      statusCode: 200,
      body: JSON.stringify(data),
    };
  } catch (error) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Erreur lors de la traduction' }),
    };
  }
};
