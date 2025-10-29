const fetch = require('node-fetch');

// ============================================================
// TRANSLATE-MYMEMORY.JS - API MyMemory (VRAIMENT GRATUIT)
// ============================================================
//
// MyMemory Translated est une API de traduction vraiment gratuite :
// ✅ Complètement gratuit jusqu'à 10,000 mots/jour
// ✅ Pas de clé API requise
// ✅ Fiable et rapide
// ✅ Bonne qualité de traduction
//
// API : https://mymemory.translated.net
// Limite : 10,000 mots/jour (largement suffisant pour un usage éducatif)
// ============================================================

const CONFIG = {
  MAX_TEXT_LENGTH: 50000,
  RATE_LIMIT_PER_IP_HOUR: 100, // Généreux car API gratuite
  REQUEST_TIMEOUT: 30000,
  
  // Mapping des codes langue
  LANGUAGE_MAP: {
    'DE': 'de-DE',
    'EN': 'en-GB',
    'ES': 'es-ES',
    'FR': 'fr-FR',
    'IT': 'it-IT',
    'PT-PT': 'pt-PT',
    'PT-BR': 'pt-BR',
    'RU': 'ru-RU',
    'TR': 'tr-TR'
  }
};

const rateLimitStore = new Map();

function checkRateLimit(ip) {
  const now = Date.now();
  const hour = Math.floor(now / 3600000);
  const key = `${ip}-${hour}`;
  
  const count = rateLimitStore.get(key) || 0;
  
  if (count >= CONFIG.RATE_LIMIT_PER_IP_HOUR) {
    return { 
      allowed: false, 
      error: `Limite horaire atteinte (${CONFIG.RATE_LIMIT_PER_IP_HOUR} traductions/heure)`
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
 * Découpe le texte en morceaux si nécessaire (MyMemory a une limite de 500 caractères par requête)
 */
function splitText(text, maxLength = 500) {
  if (text.length <= maxLength) {
    return [text];
  }
  
  const chunks = [];
  const sentences = text.match(/[^.!?]+[.!?]+/g) || [text];
  let currentChunk = '';
  
  for (const sentence of sentences) {
    if ((currentChunk + sentence).length > maxLength && currentChunk) {
      chunks.push(currentChunk.trim());
      currentChunk = sentence;
    } else {
      currentChunk += sentence;
    }
  }
  
  if (currentChunk.trim()) {
    chunks.push(currentChunk.trim());
  }
  
  return chunks;
}

/**
 * Traduit avec MyMemory API
 */
async function translateWithMyMemory(text, targetLang) {
  const targetLanguageCode = CONFIG.LANGUAGE_MAP[targetLang] || targetLang;
  
  console.log(`[MyMemory] Traduction: ${text.length} chars vers ${targetLanguageCode}`);
  
  try {
    // Découper le texte si nécessaire
    const chunks = splitText(text, 500);
    console.log(`[MyMemory] ${chunks.length} morceaux à traduire`);
    
    const translations = [];
    
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      console.log(`[MyMemory] Traduction morceau ${i + 1}/${chunks.length} (${chunk.length} chars)`);
      
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), CONFIG.REQUEST_TIMEOUT);

      // Construire l'URL avec les paramètres
      const params = new URLSearchParams({
        q: chunk,
        langpair: `auto|${targetLanguageCode}`
      });

      const response = await fetch(`https://api.mymemory.translated.net/get?${params}`, {
        method: 'GET',
        signal: controller.signal
      });

      clearTimeout(timeout);

      if (!response.ok) {
        throw new Error(`MyMemory API erreur ${response.status}`);
      }

      const data = await response.json();
      console.log(`[MyMemory] Réponse ${i + 1}:`, JSON.stringify(data).substring(0, 100));
      
      if (!data.responseData || !data.responseData.translatedText) {
        throw new Error('Pas de traduction dans la réponse MyMemory');
      }
      
      translations.push(data.responseData.translatedText);
      
      // Petit délai entre les requêtes pour éviter le rate limiting
      if (i < chunks.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 300));
      }
    }
    
    const fullTranslation = translations.join(' ');
    console.log(`[MyMemory] Traduction complète: ${fullTranslation.length} chars`);
    
    return {
      translations: [{
        text: fullTranslation,
        detected_source_language: 'auto'
      }]
    };

  } catch (error) {
    console.error('[MyMemory] Erreur:', error.message);
    throw error;
  }
}

exports.handler = async function(event, context) {
  console.log('[HANDLER] Nouvelle requête');
  
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json',
    'X-Content-Type-Options': 'nosniff',
    'X-Powered-By': 'MyMemory'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ error: 'Méthode non autorisée' })
    };
  }

  try {
    const clientIp = event.headers['x-forwarded-for']?.split(',')[0].trim() || 
                     event.headers['client-ip'] || 
                     'unknown';

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

    if (!target_lang || !CONFIG.LANGUAGE_MAP[target_lang]) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ 
          error: `Langue non supportée. Langues : ${Object.keys(CONFIG.LANGUAGE_MAP).join(', ')}`
        })
      };
    }

    console.log(`[HANDLER] ${trimmedText.length} chars → ${target_lang} (IP: ${clientIp.substring(0, 10)}...)`);

    const result = await translateWithMyMemory(trimmedText, target_lang);

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify(result)
    };

  } catch (error) {
    console.error('[HANDLER] Erreur:', error.message);
    
    if (error.name === 'AbortError') {
      return {
        statusCode: 504,
        headers,
        body: JSON.stringify({ 
          error: 'Timeout. Réessayez dans quelques instants.'
        })
      };
    }
    
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ 
        error: 'Erreur lors de la traduction: ' + error.message
      })
    };
  }
};

// ============================================================
// INSTRUCTIONS D'INSTALLATION
// ============================================================
//
// 1. Remplacez functions/translate-libre.js par ce fichier
//
// 2. Renommez-le en translate-libre.js (gardez le même nom
//    car docutranslate.js appelle /.netlify/functions/translate-libre)
//
// 3. Commit et push sur GitHub
//
// 4. Netlify redéploiera automatiquement
//
// 5. Attendez 2-3 minutes et testez !
//
// ✅ Avantages de MyMemory :
// - Vraiment gratuit (10,000 mots/jour)
// - Pas de clé API nécessaire
// - Bonne qualité de traduction
// - API stable et fiable
//
// 📊 Limite : 10,000 mots/jour
// Pour un usage scolaire c'est largement suffisant !
// Si vous dépassez, vous pouvez créer un compte gratuit
// sur https://mymemory.translated.net pour augmenter la limite.
//
// ============================================================
