const fetch = require('node-fetch');

exports.handler = async function(event, context) {
  try {
    const { url } = JSON.parse(event.body);

    if (!url) {
      return {
        statusCode: 400,
        body: 'URL manquante dans la requête.'
      };
    }

    const response = await fetch(url);
    if (!response.ok) {
      return { statusCode: response.status, body: 'Erreur lors de la récupération du document.' };
    }
    
    const data = await response.text();
    return {
      statusCode: 200,
      body: data
    };
  } catch (error) {
    return {
      statusCode: 500,
      body: 'Erreur serveur: ' + error.message
    };
  }
};
