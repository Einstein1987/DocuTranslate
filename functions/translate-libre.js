const fetch = require('node-fetch');

// ============================================================
// TRANSLATE-MYMEMORY.JS - VERSION CORRIGÉE
// ============================================================

const CONFIG = {
  MAX_TEXT_LENGTH: 50000,
  RATE_LIMIT_PER_IP_HOUR: 100,
  REQUEST_TIMEOUT: 30000,
  
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
 * Détecte la langue source du texte de façon simple
 */
function detectSourceLanguage(text) {
  const sample = text.substring(0, 500).toLowerCase();
  
  // Mots français communs
  const frenchWords = ['le', 'la', 'les', 'de', 'et', 'est', 'dans', 'pour', 'que', 'qui', 'avec', 'sur', 'une', 'par', 'ce', 'pas', 'mais', 'ou', 'son', 'ses'];
  
  // Mots anglais communs
  const englishWords = ['the', 'and', 'is', 'in', 'to', 'of', 'that', 'it', 'for', 'on', 'with', 'as', 'was', 'at', 'be', 'this', 'have', 'from', 'or', 'by'];
  
  // Mots espagnols communs
  const spanishWords = ['el', 'la', 'de', 'que', 'y', 'en', 'un', 'ser', 'se', 'no', 'por', 'con', 'para', 'una', 'su', 'como', 'del', 'los', 'al', 'más'];
  
  // Compter les correspondances
  let frenchCount = 0;
  let englishCount = 0;
  let spanishCount = 0;
  
  const words = sample.split(/\s+/);
  
  for (const word of words) {
    const cleanWord = word.replace(/[^a-zàâäçéèêëïîôùûüÿæœ]/g, '');
    if (frenchWords.includes(cleanWord)) frenchCount++;
    if (englishWords.includes(cleanWord)) englishCount++;
    if (spanishWords.includes(cleanWord)) spanishCount++;
  }
  
  console.log(`[DETECT] FR:${frenchCount} EN:${englishCount} ES:${spanishCount}`);
  
  // Retourner la langue avec le plus de correspondances
  if (frenchCount >= englishCount && frenchCount >= spanishCount) {
    return 'fr';
  } else if (englishCount >= spanishCount) {
    return 'en';
  } else {
    return 'es';
  }
}

/**
 * Découpe le texte en morceaux de max 450 caractères (marge de sécurité)
 */
function splitText(text, maxLength = 450) {
  if (text.length <= maxLength) {
    return [text];
  }
  
  const chunks = [];
  
  // Découper par phrases
  const sentences = text.match(/[^.!?]+[.!?]+/g) || [];
  
  // Si pas de phrases détectées, découper par mots
  if (sentences.length === 0) {
    const words = text.split(/\s+/);
    let currentChunk = '';
    
    for (const word of words) {
      if ((currentChunk + ' ' + word).length > maxLength && currentChunk) {
        chunks.push(currentChunk.trim());
        currentChunk = word;
      } else {
        currentChunk = currentChunk ? currentChunk + ' ' + word : word;
      }
    }
    
    if (currentChunk.trim()) {
      chunks.push(currentChunk.trim());
    }
    
    return chunks;
  }
  
  // Regrouper les phrases
  let currentChunk = '';
  
  for (const sentence of sentences) {
    const trimmedSentence = sentence.trim();
    
    // Si une seule phrase est trop longue, la découper par mots
    if (trimmedSentence.length > maxLength) {
      if (currentChunk.trim()) {
        chunks.push(currentChunk.trim());
        currentChunk = '';
      }
      
      const words = trimmedSentence.split(/\s+/);
      let wordChunk = '';
      
      for (const word of words) {
        if ((wordChunk + ' ' + word).length > maxLength && wordChunk) {
          chunks.push(wordChunk.trim());
          wordChunk = word;
        } else {
          wordChunk = wordChunk ? wordChunk + ' ' + word : word;
        }
      }
      
      if (wordChunk.trim()) {
        chunks.push(wordChunk.trim());
      }
    } else {
      // Ajouter la phrase au chunk actuel si ça rentre
      if ((currentChunk + ' ' + trimmedSentence).length > maxLength && currentChunk) {
        chunks.push(currentChunk.trim());
        currentChunk = trimmedSentence;
      } else {
        currentChunk = currentChunk ? currentChunk + ' ' + trimmedSentence : trimmedSentence;
      }
    }
  }
  
  if (currentChunk.trim()) {
    chunks.push(currentChunk.trim());
  }
  
  return chunks.filter(c => c.length > 0);
}

/**
 * Traduit avec MyMemory API
 */
async function translateWithMyMemory(text, targetLang) {
  const targetLanguageCode = CONFIG.LANGUAGE_MAP[targetLang] || targetLang;
  
  // Détecter la langue source
  const sourceLanguageCode = detectSourceLanguage(text);
  
  console.log(`[MyMemory] Traduction: ${text.length} chars`);
  console.log(`[MyMemory] ${sourceLanguageCode} → ${targetLanguageCode}`);
  
  try {
    // Découper le texte
    const chunks = splitText(text, 450);
    console.log(`[MyMemory] ${chunks.length} morceaux`);
    
    const translations = [];
    
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      console.log(`[MyMemory] Morceau ${i + 1}/${chunks.length}: ${chunk.length} chars`);
      
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), CONFIG.REQUEST_TIMEOUT);

      // Construire l'URL avec langpair correct
      const params = new URLSearchParams({
        q: chunk,
        langpair: `${sourceLanguageCode}|${targetLanguageCode}`
      });

      const response = await fetch(`https://api.mymemory.translated.net/get?${params}`, {
        method: 'GET',
        signal: controller.signal
      });

      clearTimeout(timeout);

      if (!response.ok) {
        console.error(`[MyMemory] HTTP ${response.status}`);
        throw new Error(`MyMemory API erreur ${response.status}`);
      }

      const data = await response.json();
      
      // Vérifier si c'est une erreur
      if (data.responseStatus !== 200) {
        console.error(`[MyMemory] Erreur:`, data);
        throw new Error(`MyMemory erreur: ${data.responseDetails || 'Erreur inconnue'}`);
      }
      
      if (!data.responseData || !data.responseData.translatedText) {
        console.error(`[MyMemory] Pas de traduction:`, data);
        throw new Error('Pas de traduction dans la réponse');
      }
      
      const translated = data.responseData.translatedText;
      console.log(`[MyMemory] ✓ Traduit: ${translated.substring(0, 50)}...`);
      
      translations.push(translated);
      
      // Délai entre les requêtes
      if (i < chunks.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }
    
    const fullTranslation = translations.join(' ');
    console.log(`[MyMemory] ✓ Complet: ${fullTranslation.length} chars`);
    
    return {
      translations: [{
        text: fullTranslation,
        detected_source_language: sourceLanguageCode
      }]
    };

  } catch (error) {
    console.error('[MyMemory] ERREUR:', error.message);
    throw error;
  }
}

exports.handler = async function(event, context) {
  console.log('[HANDLER] Requête');
  
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
        body: JSON.stringify({ error: 'Texte manquant' })
      };
    }

    const trimmedText = text.trim();

    if (trimmedText.length > CONFIG.MAX_TEXT_LENGTH) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ 
          error: `Texte trop long (max ${CONFIG.MAX_TEXT_LENGTH} chars)`
        })
      };
    }

    if (!target_lang || !CONFIG.LANGUAGE_MAP[target_lang]) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ 
          error: `Langue non supportée: ${Object.keys(CONFIG.LANGUAGE_MAP).join(', ')}`
        })
      };
    }

    const result = await translateWithMyMemory(trimmedText, target_lang);

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify(result)
    };

  } catch (error) {
    console.error('[HANDLER] ERREUR:', error.message);
    console.error('[HANDLER] Stack:', error.stack);
    
    if (error.name === 'AbortError') {
      return {
        statusCode: 504,
        headers,
        body: JSON.stringify({ 
          error: 'Timeout. Réessayez.'
        })
      };
    }
    
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ 
        error: 'Erreur: ' + error.message
      })
    };
  }
};
