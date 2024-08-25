const fetch = require('node-fetch');

exports.handler = async function(event, context) {
  try {
    const { url } = JSON.parse(event.body);

    if (!url) {
      return {
        statusCode: 400,
        headers: {
          'Access-Control-Allow-Origin': '*', // Ajout de l'en-tête CORS
          'Access-Control-Allow-Headers': 'Content-Type',
        },
        body: 'URL manquante dans la requête.'
      };
    }

    const response = await fetch(url);
    if (!response.ok) {
      return {
        statusCode: response.status,
        headers: {
          'Access-Control-Allow-Origin': '*', // Ajout de l'en-tête CORS
          'Access-Control-Allow-Headers': 'Content-Type',
        },
        body: 'Erreur lors de la récupération du document.'
      };
    }
    
    const data = await response.text();
    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*', // Ajout de l'en-tête CORS
        'Access-Control-Allow-Headers': 'Content-Type',
      },
      body: data
    };
  } catch (error) {
    return {
      statusCode: 500,
      headers: {
        'Access-Control-Allow-Origin': '*', // Ajout de l'en-tête CORS
        'Access-Control-Allow-Headers': 'Content-Type',
      },
      body: 'Erreur serveur: ' + error.message
    };
  }
};
