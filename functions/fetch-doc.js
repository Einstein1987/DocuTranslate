const fetch = require('node-fetch');

exports.handler = async function(event, context) {
  const { url } = JSON.parse(event.body);
  
  try {
    const response = await fetch(url);
    if (!response.ok) {
      return { statusCode: response.status, body: 'Error fetching the document' };
    }
    const data = await response.text();
    return {
      statusCode: 200,
      body: data
    };
  } catch (error) {
    return {
      statusCode: 500,
      body: 'Server Error: ' + error.message
    };
  }
};
