const fetch = require('node-fetch');

// Configuration de sécurité
const CONFIG = {
  ALLOWED_DOMAINS: [
    'docs.google.com',
    'drive.google.com'
  ],
  
  MAX_FILE_SIZE: 10 * 1024 * 1024, // 10 MB
  REQUEST_TIMEOUT: 30000,
  RATE_LIMIT_PER_MINUTE: 10
};

const rateLimitStore = new Map();

/**
 * Vérifie si l'URL est valide et autorisée
 */
function validateUrl(urlString) {
  try {
    const url = new URL(urlString);
    
    if (url.protocol !== 'https:') {
      return { valid: false, error: 'Seul le protocole HTTPS est autorisé' };
    }
    
    if (!CONFIG.ALLOWED_DOMAINS.includes(url.hostname)) {
      return { 
        valid: false, 
        error: `Domaine non autorisé. Domaines autorisés: ${CONFIG.ALLOWED_DOMAINS.join(', ')}` 
      };
    }
    
    if (url.hostname === 'docs.google.com' && !url.pathname.includes('/export')) {
      return { valid: false, error: 'URL Google Docs invalide. Utilisez une URL d\'export.' };
    }
    
    return { valid: true, url };
  } catch (error) {
    return { valid: false, error: 'URL invalide' };
  }
}

/**
 * Vérifie le rate limiting
 */
function checkRateLimit(ip) {
  const now = Date.now();
  const minute = Math.floor(now / 60000);
  const key = `${ip}-${minute}`;
  
  const count = rateLimitStore.get(key) || 0;
  
  if (count >= CONFIG.RATE_LIMIT_PER_MINUTE) {
    return { allowed: false, error: 'Trop de requêtes. Veuillez réessayer dans une minute.' };
  }
  
  rateLimitStore.set(key, count + 1);
  
  // Nettoyer les anciennes entrées
  for (const [storeKey] of rateLimitStore) {
    const keyMinute = parseInt(storeKey.split('-')[1]);
    if (keyMinute < minute - 2) {
      rateLimitStore.delete(storeKey);
    }
  }
  
  return { allowed: true };
}

/**
 * Valide le magic number PDF (en-tête du fichier)
 * Un vrai PDF commence TOUJOURS par %PDF-
 */
function validatePDFMagicNumber(buffer) {
  if (!buffer || buffer.length < 5) {
    return false;
  }
  
  // Vérifier les 5 premiers octets : %PDF-
  // % = 0x25, P = 0x50, D = 0x44, F = 0x46, - = 0x2D
  const pdfSignature = Buffer.from([0x25, 0x50, 0x44, 0x46, 0x2D]);
  
  // Comparer les 5 premiers octets
  for (let i = 0; i < 5; i++) {
    if (buffer[i] !== pdfSignature[i]) {
      return false;
    }
  }
  
  return true;
}

/**
 * Télécharge le document avec timeout et vérification de taille
 */
async function fetchDocumentWithLimits(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => {
    controller.abort();
  }, CONFIG.REQUEST_TIMEOUT);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'DocuTranslate/1.0'
      }
    });

    clearTimeout(timeout);

    if (!response.ok) {
      return {
        success: false,
        error: `Erreur HTTP ${response.status}: ${response.statusText}`
      };
    }

    // Vérifier le Content-Type
    const contentType = response.headers.get('content-type');
    if (!contentType || !contentType.includes('application/pdf')) {
      return {
        success: false,
        error: 'Le document doit être un PDF (Content-Type invalide)'
      };
    }

    // Vérifier la taille avant de télécharger
    const contentLength = response.headers.get('content-length');
    if (contentLength && parseInt(contentLength) > CONFIG.MAX_FILE_SIZE) {
      return {
        success: false,
        error: `Fichier trop volumineux. Taille maximale: ${CONFIG.MAX_FILE_SIZE / 1024 / 1024} MB`
      };
    }

    // Télécharger avec vérification de taille progressive
    const chunks = [];
    let totalSize = 0;

    for await (const chunk of response.body) {
      totalSize += chunk.length;
      
      if (totalSize > CONFIG.MAX_FILE_SIZE) {
        return {
          success: false,
          error: `Fichier trop volumineux. Taille maximale: ${CONFIG.MAX_FILE_SIZE / 1024 / 1024} MB`
        };
      }
      
      chunks.push(chunk);
    }

    const buffer = Buffer.concat(chunks);
    
    // VALIDATION CRITIQUE : Vérifier le magic number PDF
    if (!validatePDFMagicNumber(buffer)) {
      console.error('[SECURITY] Tentative d\'upload d\'un fichier non-PDF détectée');
      return {
        success: false,
        error: 'Le fichier n\'est pas un PDF valide. Seuls les vrais fichiers PDF sont acceptés.'
      };
    }
    
    console.log('[SECURITY] Magic number PDF validé avec succès');
    
    return {
      success: true,
      buffer,
      contentType
    };

  } catch (error) {
    clearTimeout(timeout);
    
    if (error.name === 'AbortError') {
      return {
        success: false,
        error: 'Délai d\'attente dépassé. Le document est peut-être trop volumineux.'
      };
    }
    
    return {
      success: false,
      error: `Erreur réseau: ${error.message}`
    };
  }
}

/**
 * Handler principal
 */
exports.handler = async function(event, context) {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'X-XSS-Protection': '1; mode=block',
    'Strict-Transport-Security': 'max-age=31536000; includeSubDomains'
  };

  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers,
      body: ''
    };
  }

  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ error: 'Méthode non autorisée. Utilisez POST.' })
    };
  }

  try {
    const clientIp = event.headers['x-forwarded-for'] || 
                     event.headers['client-ip'] || 
                     'unknown';

    const rateLimitCheck = checkRateLimit(clientIp);
    if (!rateLimitCheck.allowed) {
      return {
        statusCode: 429,
        headers,
        body: JSON.stringify({ error: rateLimitCheck.error })
      };
    }

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

    const { url } = body;

    if (!url) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'URL manquante dans la requête' })
      };
    }

    const urlValidation = validateUrl(url);
    if (!urlValidation.valid) {
      return {
        statusCode: 403,
        headers,
        body: JSON.stringify({ error: urlValidation.error })
      };
    }

    console.log(`[INFO] Requête depuis IP: ${clientIp}, Domaine: ${urlValidation.url.hostname}`);

    const downloadResult = await fetchDocumentWithLimits(url);

    if (!downloadResult.success) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: downloadResult.error })
      };
    }

    return {
      statusCode: 200,
      headers: {
        ...headers,
        'Content-Type': 'application/pdf',
        'Content-Disposition': 'inline; filename="document.pdf"',
        'Cache-Control': 'private, max-age=3600'
      },
      body: downloadResult.buffer.toString('base64'),
      isBase64Encoded: true
    };

  } catch (error) {
    console.error('[ERROR] Erreur serveur:', error);
    
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ 
        error: 'Erreur interne du serveur. Veuillez réessayer plus tard.' 
      })
    };
  }
};
