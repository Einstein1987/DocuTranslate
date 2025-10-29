const fetch = require('node-fetch');

// ============================================================
// TRANSLATE-LIBRE.JS - API LibreTranslate (GRATUIT & ILLIMITÉ)
// ============================================================
//
// LibreTranslate est une solution open-source parfaite pour l'éducation :
// ✅ Complètement gratuit
// ✅ Pas de limite de caractères
// ✅ Respect de la vie privée (RGPD)
// ✅ Pas besoin de compte ni de carte bancaire
//
// API publique : https://libretranslate.com
// Documentation : https://libretranslate.com/docs
// ============================================================

const CONFIG = {
  MAX_TEXT_LENGTH: 50000,
  RATE_LIMIT_PER_IP_HOUR: 50, // Plus généreux car API gratuite
  REQUEST_TIMEOUT: 40000, // 40 secondes (LibreTranslate peut être plus lent)
  
  // Mapping des codes langue DeepL vers LibreTranslate
  LANGUAGE_MAP: {
    'DE': 'de',
    'EN': 'en',
    'ES': 'es',
    'FR': 'fr',
    'IT': 'it',
    'PT-PT': 'pt',
    'PT-BR': 'pt',
    'RU': 'ru',
    'TR': 'tr'
  },
  
  // APIs LibreTranslate disponibles (la première est utilisée par défaut)
  LIBRE_TRANSLATE_APIS: [
    'https://libretranslate.com', // API publique officielle
    'https://translate.argosopentech.com', // API alternative
    // Vous pouvez ajouter votre propre instance auto-hébergée ici
  ]
};

// Store pour rate limiting simple
const rateLimitStore = new Map();

/**
 * Vérifie le rate limiting
 */
function checkRateLimit(ip) {
  const now = Date.now();
  const hour = Math.floor(now / 3600000);
  const key = `${ip}-${hour}`;
  
  const count = rateLimitStore.get(key) || 0;
  
  if (count >= CONFIG.RATE_LIMIT_PER_IP_HOUR) {
    return { 
      allowed: false, 
      error: `Limite horaire atteinte. Vous pouvez faire ${CONFIG.RATE_LIMIT_PER_IP_HOUR} traductions par heure.`
    };
  }
  
  rateLimitStore.set(key, count + 1);
  
  // Nettoyage
  for (const [storeKey] of rateLimitStore) {
    const keyHour = parseInt(storeKey.split('-')[1]);
    if (keyHour < hour - 2) {
      rateLimitStore.delete(storeKey);
    }
  }
  
  return { allowed: true, remaining: CONFIG.RATE_LIMIT_PER_IP_HOUR - count - 1 };
}

/**
 * Appelle l'API LibreTranslate avec fallback
 */
async function translateWithLibre(text, targetLang, sourceIp) {
  const targetLanguageCode = CONFIG.LANGUAGE_MAP[targetLang] || targetLang.toLowerCase();
  
  // Essayer chaque API dans l'ordre jusqu'à ce qu'une fonctionne
  for (let i = 0; i < CONFIG.LIBRE_TRANSLATE_APIS.length; i++) {
    const apiUrl = CONFIG.LIBRE_TRANSLATE_APIS[i];
    
    try {
      console.log(`[${new Date().toISOString()}] Tentative traduction avec ${apiUrl}...`);
      
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), CONFIG.REQUEST_TIMEOUT);

      const response = await fetch(`${apiUrl}/translate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          q: text,
          source: 'auto', // Détection automatique de la langue source
          target: targetLanguageCode,
          format: 'text'
        }),
        signal: controller.signal
      });

      clearTimeout(timeout);

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`Erreur ${apiUrl} [${response.status}]:`, errorText);
        
        // Si ce n'est pas la dernière API, essayer la suivante
        if (i < CONFIG.LIBRE_TRANSLATE_APIS.length - 1) {
          console.log('Tentative avec l\'API suivante...');
          continue;
        }
        
        // C'était la dernière API, retourner l'erreur
        throw new Error(`Toutes les APIs ont échoué. Dernière erreur: ${response.status}`);
      }

      const data = await response.json();
      
      if (!data.translatedText) {
        throw new Error('Aucune traduction reçue de LibreTranslate');
      }

      console.log(`[${new Date().toISOString()}] Traduction réussie avec ${apiUrl} (${data.translatedText.length} chars)`);

      // Retourner dans le même format que DeepL pour compatibilité
      return {
        translations: [{
          text: data.translatedText,
          detected_source_language: data.detectedLanguage?.language || 'auto'
        }]
      };

    } catch (error) {
      console.error(`Erreur avec ${apiUrl}:`, error.message);
      
      // Si c'est un timeout et qu'il reste des APIs à essayer
      if (error.name === 'AbortError' && i < CONFIG.LIBRE_TRANSLATE_APIS.length - 1) {
        console.log('Timeout, tentative avec l\'API suivante...');
        continue;
      }
      
      // Si c'était la dernière API, propager l'erreur
      if (i === CONFIG.LIBRE_TRANSLATE_APIS.length - 1) {
        throw error;
      }
    }
  }
  
  throw new Error('Toutes les APIs LibreTranslate sont indisponibles');
}

/**
 * Handler principal
 */
exports.handler = async function(event, context) {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json',
    'X-Content-Type-Options': 'nosniff',
    'X-Powered-By': 'LibreTranslate'
  };

  // Gérer preflight CORS
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  // Vérifier méthode HTTP
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ error: 'Méthode non autorisée' })
    };
  }

  try {
    // Identifier le client
    const clientIp = event.headers['x-forwarded-for']?.split(',')[0].trim() || 
                     event.headers['client-ip'] || 
                     'unknown';

    // Rate limiting
    const rateLimitCheck = checkRateLimit(clientIp);
    if (!rateLimitCheck.allowed) {
      return {
        statusCode: 429,
        headers: {
          ...headers,
          'X-RateLimit-Remaining': '0'
        },
        body: JSON.stringify({ error: rateLimitCheck.error })
      };
    }

    headers['X-RateLimit-Remaining'] = rateLimitCheck.remaining.toString();

    // Parser le body
    let body;
    try {
      body = JSON.parse(event.body || '{}');
    } catch (e) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'JSON invalide' })
      };
    }

    const { text, target_lang } = body;

    // Validation du texte
    if (!text || typeof text !== 'string' || text.trim().length === 0) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Texte manquant ou invalide' })
      };
    }

    const trimmedText = text.trim();

    if (trimmedText.length > CONFIG.MAX_TEXT_LENGTH) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ 
          error: `Texte trop long. Maximum : ${CONFIG.MAX_TEXT_LENGTH.toLocaleString()} caractères`
        })
      };
    }

    // Validation de la langue
    if (!target_lang || !CONFIG.LANGUAGE_MAP[target_lang]) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ 
          error: `Langue non supportée. Langues disponibles : ${Object.keys(CONFIG.LANGUAGE_MAP).join(', ')}`
        })
      };
    }

    // Log sécurisé
    console.log(`[${new Date().toISOString()}] LibreTranslate: ${trimmedText.length} chars → ${target_lang} (IP: ${clientIp.substring(0, 10)}...)`);

    // Traduction
    const result = await translateWithLibre(trimmedText, target_lang, clientIp);

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify(result)
    };

  } catch (error) {
    console.error('Erreur serveur:', error.message);
    
    // Gérer les timeouts
    if (error.name === 'AbortError') {
      return {
        statusCode: 504,
        headers,
        body: JSON.stringify({ 
          error: 'Délai d\'attente dépassé. Le service de traduction est peut-être surchargé. Réessayez dans quelques instants.'
        })
      };
    }
    
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ 
        error: 'Erreur lors de la traduction. Veuillez réessayer.'
      })
    };
  }
};
