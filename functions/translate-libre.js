const fetch = require('node-fetch');

// ============================================================
// TRANSLATE-LIBRE.JS - VERSION CORRIGÉE
// ============================================================
// Messages d'erreur améliorés en français
// Support langue source explicite
// Meilleure gestion des erreurs
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
    'PT': 'pt',
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
      error: `Limite horaire atteinte (${CONFIG.RATE_LIMIT_PER_IP_HOUR} traductions/heure). Réessayez dans quelques minutes.`
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
 * Détecte la langue source du texte de façon améliorée
 */
function detectSourceLanguage(text) {
  const sample = text.substring(0, 500).toLowerCase();
  
  const patterns = {
    fr: {
      words: ['le', 'la', 'les', 'de', 'et', 'est', 'dans', 'pour', 'que', 'qui', 'avec', 'sur', 'une', 'par'],
      chars: /[àâäçéèêëïîôùûüÿæœ]/g
    },
    en: {
      words: ['the', 'and', 'is', 'in', 'to', 'of', 'that', 'it', 'for', 'on', 'with', 'as'],
      chars: null
    },
    es: {
      words: ['el', 'la', 'de', 'que', 'y', 'en', 'un', 'ser', 'se', 'no', 'por', 'con'],
      chars: /[áéíóúñü¿¡]/g
    },
    de: {
      words: ['der', 'die', 'und', 'in', 'den', 'von', 'zu', 'das', 'mit', 'sich'],
      chars: /[äöüß]/g
    },
    it: {
      words: ['il', 'di', 'e', 'la', 'per', 'in', 'un', 'che', 'non', 'è'],
      chars: /[àèéìíîòóùú]/g
    },
    pt: {
      words: ['o', 'de', 'a', 'e', 'é', 'que', 'do', 'da', 'em', 'um'],
      chars: /[ãáâàçéêíóôõú]/g
    }
  };
  
  const scores = {};
  const words = sample.split(/\s+/);
  
  for (const [lang, config] of Object.entries(patterns)) {
    let score = 0;
    
    for (const word of words) {
      const cleanWord = word.replace(/[^a-zàâäçéèêëïîôùûüÿæœáéíóúñüäöüßãâàêíóôõ]/g, '');
      if (config.words.includes(cleanWord)) {
        score += 2;
      }
    }
    
    if (config.chars) {
      const matches = sample.match(config.chars);
      if (matches) {
        score += matches.length;
      }
    }
    
    scores[lang] = score;
  }
  
  const detected = Object.keys(scores).reduce((a, b) => scores[a] > scores[b] ? a : b);
  console.log(`[DETECT] Langue détectée: ${detected}`, scores);
  
  return detected;
}

/**
 * Découpe le texte en morceaux de max 450 caractères
 */
function splitText(text, maxLength = 450) {
  if (text.length <= maxLength) {
    return [text];
  }
  
  const chunks = [];
  const sentences = text.match(/[^.!?]+[.!?]+/g) || [];
  
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
  
  let currentChunk = '';
  
  for (const sentence of sentences) {
    const trimmedSentence = sentence.trim();
    
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
async function translateWithMyMemory(text, sourceLang, targetLang) {
  const targetLanguageCode = CONFIG.LANGUAGE_MAP[targetLang] || targetLang.toLowerCase();
  
  // Utiliser la langue source fournie ou détecter
  let sourceLanguageCode;
  if (sourceLang) {
    sourceLanguageCode = CONFIG.LANGUAGE_MAP[sourceLang] || sourceLang.toLowerCase();
  } else {
    sourceLanguageCode = detectSourceLanguage(text);
  }
  
  console.log(`[MyMemory] Traduction: ${text.length} chars`);
  console.log(`[MyMemory] ${sourceLanguageCode} → ${targetLanguageCode}`);
  
  try {
    const chunks = splitText(text, 450);
    console.log(`[MyMemory] ${chunks.length} morceaux à traduire`);
    
    const translations = [];
    
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      console.log(`[MyMemory] Morceau ${i + 1}/${chunks.length}: ${chunk.length} chars`);
      
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), CONFIG.REQUEST_TIMEOUT);

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
        throw new Error(`Erreur API MyMemory (${response.status})`);
      }

      const data = await response.json();
      
      if (data.responseStatus !== 200) {
        console.error(`[MyMemory] Erreur API:`, data);
        
        if (data.responseStatus === 429 || (data.responseDetails && data.responseDetails.includes('LIMIT'))) {
          throw new Error('QUOTA_EXCEEDED');
        }
        
        throw new Error(data.responseDetails || 'Erreur de traduction');
      }
      
      if (!data.responseData || !data.responseData.translatedText) {
        console.error(`[MyMemory] Pas de traduction:`, data);
        throw new Error('Traduction vide reçue');
      }
      
      const translated = data.responseData.translatedText;
      console.log(`[MyMemory] ✓ Traduit: ${translated.substring(0, 50)}...`);
      
      translations.push(translated);
      
      // Délai entre requêtes
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
  console.log('[HANDLER] Nouvelle requête de traduction');
  
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json',
    'X-Content-Type-Options': 'nosniff'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ error: 'Méthode non autorisée. Utilisez POST.' })
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
        body: JSON.stringify({ error: 'Corps de requête JSON invalide' })
      };
    }

    const { text, source_lang, target_lang } = body;

    if (!text || typeof text !== 'string' || text.trim().length === 0) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Le texte à traduire est manquant ou vide' })
      };
    }

    const trimmedText = text.trim();

    if (trimmedText.length > CONFIG.MAX_TEXT_LENGTH) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ 
          error: `Texte trop long. Maximum ${CONFIG.MAX_TEXT_LENGTH} caractères (${trimmedText.length} fournis)`
        })
      };
    }

    if (!target_lang || !CONFIG.LANGUAGE_MAP[target_lang]) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ 
          error: `Langue cible invalide. Langues supportées: ${Object.keys(CONFIG.LANGUAGE_MAP).join(', ')}`
        })
      };
    }

    // La langue source est optionnelle (sera détectée automatiquement si non fournie)
    const result = await translateWithMyMemory(trimmedText, source_lang, target_lang);

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
          error: 'Délai d\'attente dépassé. Le serveur de traduction met trop de temps à répondre. Réessayez.'
        })
      };
    }
    
    if (error.message === 'QUOTA_EXCEEDED') {
      return {
        statusCode: 429,
        headers,
        body: JSON.stringify({ 
          error: 'Quota quotidien de traduction atteint (10 000 mots/jour). Réessayez demain.'
        })
      };
    }
    
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ 
        error: `Erreur de traduction: ${error.message || 'Erreur inconnue'}`
      })
    };
  }
};
