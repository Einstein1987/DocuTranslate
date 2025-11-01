// ============================================================
// DOCUTRANSLATE.JS - VERSION CORRIGÉE ET OPTIMISÉE
// ============================================================
// Système de logging conditionnel
// Code factorisé (Google Docs + PDF)
// Compteur de quota MyMemory
// Sélection langue source
// Messages d'erreur améliorés
// ============================================================

// Configuration PDF.js
pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.10.377/pdf.worker.min.js';

// ============================================================
// SYSTÈME DE LOGGING CONDITIONNEL
// ============================================================

const DEBUG_MODE = false; // Mettre à true pour activer les logs

const Logger = {
  log(...args) {
    if (DEBUG_MODE) console.log(...args);
  },
  warn(...args) {
    if (DEBUG_MODE) console.warn(...args);
  },
  error(...args) {
    console.error(...args); // Les erreurs sont toujours affichées
  },
  info(...args) {
    if (DEBUG_MODE) console.info(...args);
  }
};

// ============================================================
// CONFIGURATION
// ============================================================

const CONFIG = {
  TRANSLATION_ENDPOINT: '/.netlify/functions/translate-libre',
  CACHE_EXPIRY: 24 * 60 * 60 * 1000, // 24 heures
  SPEECH_CHUNK_SIZE: 200,
  DAILY_WORD_LIMIT: 10000, // Limite MyMemory
  WARNING_THRESHOLD: 8000, // Seuil d'avertissement (80%)
  CRITICAL_THRESHOLD: 9500 // Seuil critique (95%)
};

// ============================================================
// GESTION DU QUOTA QUOTIDIEN
// ============================================================

const QuotaManager = {
  _getTodayKey() {
    const today = new Date();
    return `quota_${today.getFullYear()}_${today.getMonth()}_${today.getDate()}`;
  },

  _getUsage() {
    try {
      const key = this._getTodayKey();
      const data = localStorage.getItem(key);
      return data ? parseInt(data) : 0;
    } catch (error) {
      Logger.error('Erreur lecture quota:', error);
      return 0;
    }
  },

  _setUsage(words) {
    try {
      const key = this._getTodayKey();
      localStorage.setItem(key, words.toString());
    } catch (error) {
      Logger.error('Erreur écriture quota:', error);
    }
  },

  getRemaining() {
    const used = this._getUsage();
    return Math.max(0, CONFIG.DAILY_WORD_LIMIT - used);
  },

  getUsed() {
    return this._getUsage();
  },

  addUsage(words) {
    const current = this._getUsage();
    const newTotal = current + words;
    this._setUsage(newTotal);
    this.updateDisplay();
    return newTotal;
  },

  canTranslate(estimatedWords) {
    return this.getRemaining() >= estimatedWords;
  },

  updateDisplay() {
    const quotaDisplay = document.getElementById('quotaDisplay');
    const quotaText = document.getElementById('quotaText');
    
    if (!quotaDisplay || !quotaText) return;

    const used = this.getUsed();
    const remaining = this.getRemaining();
    const percentage = (used / CONFIG.DAILY_WORD_LIMIT) * 100;

    let color, icon, bgColor;
    
    if (percentage >= 95) {
      color = '#c0392b';
      bgColor = '#fadbd8';
      icon = '🔴';
    } else if (percentage >= 80) {
      color = '#e67e22';
      bgColor = '#fdebd0';
      icon = '🟠';
    } else if (percentage >= 50) {
      color = '#f39c12';
      bgColor = '#fcf3cf';
      icon = '🟡';
    } else {
      color = '#27ae60';
      bgColor = '#d5f4e6';
      icon = '🟢';
    }

    quotaText.innerHTML = `${icon} <strong>${remaining.toLocaleString()}</strong> mots restants aujourd'hui`;
    quotaDisplay.style.background = bgColor;
    quotaDisplay.style.color = color;
    quotaDisplay.style.border = `2px solid ${color}`;
  },

  reset() {
    this._setUsage(0);
    this.updateDisplay();
  }
};

// ============================================================
// MODULE DE CACHE
// ============================================================

const TranslationCache = {
  _generateKey(docId, sourceLang, targetLang) {
    return `docutranslate_${docId}_${sourceLang}_${targetLang}`;
  },

  set(docId, sourceLang, targetLang, translation) {
    try {
      const key = this._generateKey(docId, sourceLang, targetLang);
      const data = {
        translation,
        timestamp: Date.now()
      };
      localStorage.setItem(key, JSON.stringify(data));
    } catch (error) {
      Logger.error('Erreur cache:', error);
      if (error.name === 'QuotaExceededError') {
        this.clearOld();
      }
    }
  },

  get(docId, sourceLang, targetLang) {
    try {
      const key = this._generateKey(docId, sourceLang, targetLang);
      const item = localStorage.getItem(key);
      
      if (!item) return null;
      
      const data = JSON.parse(item);
      
      if (Date.now() - data.timestamp > CONFIG.CACHE_EXPIRY) {
        localStorage.removeItem(key);
        return null;
      }
      
      return data.translation;
    } catch (error) {
      return null;
    }
  },

  clearOld() {
    try {
      const now = Date.now();
      Object.keys(localStorage).forEach(key => {
        if (key.startsWith('docutranslate_')) {
          try {
            const data = JSON.parse(localStorage.getItem(key));
            if (now - data.timestamp > CONFIG.CACHE_EXPIRY) {
              localStorage.removeItem(key);
            }
          } catch (e) {
            localStorage.removeItem(key);
          }
        }
      });
    } catch (error) {
      Logger.error('Erreur nettoyage cache:', error);
    }
  },

  clearAll() {
    try {
      let cleared = 0;
      Object.keys(localStorage).forEach(key => {
        if (key.startsWith('docutranslate_')) {
          localStorage.removeItem(key);
          cleared++;
        }
      });
      showNotification(`✅ Cache vidé (${cleared} traductions)`, 'success');
    } catch (error) {
      Logger.error('Erreur vidage cache:', error);
    }
  }
};

// ============================================================
// ÉTAT DE L'APPLICATION
// ============================================================

const AppState = {
  currentTranslation: null,
  isTranslating: false,
  
  speech: {
    isReading: false,
    currentIndex: 0,
    chunks: []
  },
  
  reset() {
    this.currentTranslation = null;
    this.isTranslating = false;
    this.resetSpeech();
  },
  
  resetSpeech() {
    if (this.speech.isReading) {
      speechSynthesis.cancel();
    }
    this.speech = {
      isReading: false,
      currentIndex: 0,
      chunks: []
    };
  }
};

// ============================================================
// BARRE DE PROGRESSION
// ============================================================

function showProgressBar() {
  hideProgressBar();
  
  const progressContainer = document.createElement('div');
  progressContainer.id = 'progressBarContainer';
  progressContainer.style.cssText = `
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    background: rgba(0, 0, 0, 0.95);
    padding: 30px 50px;
    border-radius: 15px;
    z-index: 10001;
    min-width: 400px;
    box-shadow: 0 10px 40px rgba(0, 0, 0, 0.5);
  `;
  
  progressContainer.innerHTML = `
    <div style="text-align: center; margin-bottom: 20px;">
      <div id="progressMessage" style="color: white; font-size: 18px; margin-bottom: 5px;">
        Chargement...
      </div>
      <div id="progressSubMessage" style="color: #95a5a6; font-size: 14px;">
        Préparation
      </div>
    </div>
    <div style="background: #34495e; border-radius: 10px; overflow: hidden; height: 30px;">
      <div id="progressBarFill" style="
        background: linear-gradient(90deg, #3498db, #2ecc71);
        height: 100%;
        width: 0%;
        transition: width 0.3s ease;
        display: flex;
        align-items: center;
        justify-content: center;
        color: white;
        font-weight: bold;
        font-size: 14px;
      ">0%</div>
    </div>
  `;
  
  document.body.appendChild(progressContainer);
}

function updateProgress(percent, message, subMessage = '') {
  const fill = document.getElementById('progressBarFill');
  const msg = document.getElementById('progressMessage');
  const subMsg = document.getElementById('progressSubMessage');
  
  if (fill) {
    fill.style.width = percent + '%';
    fill.textContent = Math.round(percent) + '%';
  }
  if (msg) msg.textContent = message;
  if (subMsg) subMsg.textContent = subMessage;
}

function hideProgressBar() {
  const progressBar = document.getElementById('progressBarContainer');
  if (progressBar) {
    progressBar.style.transition = 'opacity 0.3s';
    progressBar.style.opacity = '0';
    setTimeout(() => progressBar.remove(), 300);
  }
}

// ============================================================
// NOTIFICATIONS
// ============================================================

function showNotification(message, type = 'info') {
  const notification = document.createElement('div');
  notification.style.cssText = `
    position: fixed; top: 20px; left: 50%; transform: translateX(-50%);
    padding: 15px 25px;
    background-color: ${type === 'success' ? '#2ecc71' : type === 'error' ? '#e74c3c' : type === 'warning' ? '#f39c12' : '#3498db'};
    color: white; border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.2);
    z-index: 10000; font-size: 16px; max-width: 80%; text-align: center;
    animation: slideDown 0.3s ease-out;
  `;
  notification.textContent = message;
  document.body.appendChild(notification);
  
  setTimeout(() => {
    notification.style.animation = 'slideUp 0.3s ease-in';
    notification.style.opacity = '0';
    setTimeout(() => notification.remove(), 300);
  }, 4000);
}

// ============================================================
// EXTRACTION PDF
// ============================================================

async function extractTextFromPDF(pdfData) {
  try {
    const pdfDoc = await pdfjsLib.getDocument({ data: pdfData }).promise;
    let text = '';
    const totalPages = pdfDoc.numPages;
    
    for (let i = 1; i <= totalPages; i++) {
      const extractionPercent = 10 + (30 * i / totalPages);
      updateProgress(extractionPercent, '📖 Extraction du texte', `Page ${i}/${totalPages}`);
      
      const page = await pdfDoc.getPage(i);
      const textContent = await page.getTextContent();
      
      textContent.items.forEach(item => {
        text += item.str + ' ';
      });
      
      if (i < totalPages) {
        text += '\n\n';
      }
    }
    
    return text.trim();
  } catch (error) {
    Logger.error('Erreur extraction PDF:', error);
    throw new Error('Impossible d\'extraire le texte du PDF. Vérifiez que le fichier n\'est pas protégé ou corrompu.');
  }
}

// ============================================================
// DÉTECTION DE LANGUE AMÉLIORÉE
// ============================================================

function detectSourceLanguage(text) {
  const sample = text.substring(0, 1000).toLowerCase();
  
  const patterns = {
    fr: {
      words: ['le', 'la', 'les', 'de', 'et', 'est', 'dans', 'pour', 'que', 'qui', 'avec', 'sur', 'une', 'par', 'ce', 'pas', 'mais', 'ou', 'son', 'ses'],
      chars: /[àâäçéèêëïîôùûüÿæœ]/g
    },
    en: {
      words: ['the', 'and', 'is', 'in', 'to', 'of', 'that', 'it', 'for', 'on', 'with', 'as', 'was', 'at', 'be', 'this', 'have', 'from', 'or', 'by'],
      chars: null
    },
    es: {
      words: ['el', 'la', 'de', 'que', 'y', 'en', 'un', 'ser', 'se', 'no', 'por', 'con', 'para', 'una', 'su', 'como', 'del', 'los', 'al', 'más'],
      chars: /[áéíóúñü¿¡]/g
    },
    de: {
      words: ['der', 'die', 'und', 'in', 'den', 'von', 'zu', 'das', 'mit', 'sich', 'des', 'auf', 'für', 'ist', 'im', 'dem', 'nicht', 'ein', 'eine', 'als'],
      chars: /[äöüß]/g
    },
    it: {
      words: ['il', 'di', 'e', 'la', 'per', 'in', 'un', 'che', 'non', 'è', 'una', 'si', 'da', 'con', 'sono', 'al', 'come', 'le', 'nel', 'del'],
      chars: /[àèéìíîòóùú]/g
    },
    pt: {
      words: ['o', 'de', 'a', 'e', 'é', 'que', 'do', 'da', 'em', 'um', 'para', 'com', 'não', 'uma', 'os', 'no', 'se', 'na', 'por', 'mais'],
      chars: /[ãáâàçéêíóôõú]/g
    }
  };
  
  const scores = {};
  const words = sample.split(/\s+/);
  
  for (const [lang, config] of Object.entries(patterns)) {
    let score = 0;
    
    // Score par mots communs
    for (const word of words) {
      const cleanWord = word.replace(/[^a-zàâäçéèêëïîôùûüÿæœáéíóúñüäöüßãâàêíóôõ]/g, '');
      if (config.words.includes(cleanWord)) {
        score += 2;
      }
    }
    
    // Score par caractères spéciaux
    if (config.chars) {
      const matches = sample.match(config.chars);
      if (matches) {
        score += matches.length;
      }
    }
    
    scores[lang] = score;
  }
  
  Logger.log('Scores détection langue:', scores);
  
  const detected = Object.keys(scores).reduce((a, b) => scores[a] > scores[b] ? a : b);
  Logger.log('Langue détectée:', detected);
  
  return detected;
}

// ============================================================
// TRADUCTION (FONCTION PRINCIPALE)
// ============================================================

async function translateText(text, sourceLang, targetLang) {
  if (!text || text.trim() === '') {
    throw new Error('Aucun texte à traduire');
  }
  
  try {
    updateProgress(50, '🌍 Traduction en cours', 'Préparation de la requête...');
    
    const response = await fetch(CONFIG.TRANSLATION_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        text: text,
        source_lang: sourceLang,
        target_lang: targetLang,
      }),
    });
    
    updateProgress(70, '🌍 Traduction en cours', 'Réception de la traduction...');
    
    if (!response.ok) {
      let errorMessage = 'Erreur lors de la traduction';
      
      try {
        const errorData = await response.json();
        
        if (response.status === 429) {
          errorMessage = `⏱️ Limite de traduction atteinte (${CONFIG.DAILY_WORD_LIMIT.toLocaleString()} mots/jour).\n\nSolutions :\n• Réessayez demain\n• Réduisez la taille du document\n• Utilisez l'API DeepL (payante mais illimitée)`;
        } else if (response.status === 400) {
          errorMessage = `❌ Requête invalide : ${errorData.error || 'Vérifiez le format du document'}`;
        } else if (response.status === 500) {
          errorMessage = `⚙️ Erreur serveur temporaire.\n\nSolutions :\n• Réessayez dans quelques instants\n• Vérifiez votre connexion Internet\n• Si le problème persiste, contactez le support`;
        } else {
          errorMessage = `❌ Erreur ${response.status} : ${errorData.error || 'Erreur inconnue'}`;
        }
      } catch (e) {
        errorMessage = `❌ Erreur réseau (code ${response.status}).\n\nVérifiez votre connexion Internet et réessayez.`;
      }
      
      throw new Error(errorMessage);
    }
    
    const data = await response.json();
    
    if (!data.translations || data.translations.length === 0) {
      throw new Error('❌ Aucune traduction reçue de l\'API.\n\nLe service de traduction est peut-être temporairement indisponible. Réessayez dans quelques minutes.');
    }
    
    updateProgress(90, '✨ Finalisation', 'Formatage du texte...');
    
    let translatedText = data.translations[0].text;
    
    // Améliorer le formatage
    translatedText = translatedText.replace(/([.?!])\s+/g, "$1\n\n");
    
    // Estimer les mots traduits
    const wordCount = text.split(/\s+/).length;
    QuotaManager.addUsage(wordCount);
    
    Logger.log(`Traduit: ${wordCount} mots`);
    
    return translatedText;
  } catch (error) {
    Logger.error('Erreur traduction:', error);
    throw error;
  }
}

// ============================================================
// FONCTION FACTORISÉE : TRADUCTION DE DOCUMENT
// ============================================================

async function performDocumentTranslation(docType, docId, sourceLang, targetLang) {
  if (AppState.isTranslating) {
    showNotification('⚠️ Une traduction est déjà en cours', 'warning');
    return;
  }
  
  // Auto-détection si nécessaire
  const sourceLanguage = sourceLang === 'auto' ? null : sourceLang;
  
  // Vérifier le cache
  const cacheKey = sourceLanguage || 'auto';
  const cached = TranslationCache.get(docId, cacheKey, targetLang);
  if (cached) {
    showNotification('⚡ Traduction chargée depuis le cache (instantané !)', 'success');
    const translatedTextContainer = document.getElementById('translatedText');
    translatedTextContainer.innerText = cached;
    AppState.currentTranslation = cached;
    return;
  }
  
  AppState.isTranslating = true;
  showProgressBar();
  updateProgress(0, '🚀 Démarrage', 'Initialisation...');
  
  try {
    let text, displayBlob;
    
    if (docType === 'gdoc') {
      // Traitement Google Docs
      const pdfUrl = `https://docs.google.com/document/d/${docId}/export?format=pdf`;
      
      updateProgress(5, '📄 Chargement du document', 'Connexion à Google Drive...');
      
      const response = await fetch('/.netlify/functions/fetch-doc', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ url: pdfUrl })
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || `❌ Impossible de charger le document Google Docs.\n\nVérifiez que :\n• Le document est bien PUBLIC\n• L'URL est correcte\n• Vous avez une connexion Internet`);
      }
      
      updateProgress(10, '📄 Chargement du document', 'Téléchargement en cours...');
      
      const blob = await response.blob();
      displayBlob = URL.createObjectURL(blob);
      
      updateProgress(15, '📖 Extraction du texte', 'Analyse du document...');
      
      const pdfData = new Uint8Array(await blob.arrayBuffer());
      text = await extractTextFromPDF(pdfData);
      
    } else if (docType === 'pdf') {
      // Traitement PDF local
      const fileInput = document.getElementById('pdfInput');
      const file = fileInput.files[0];
      
      if (!file) {
        throw new Error('❌ Aucun fichier sélectionné.\n\nVeuillez choisir un fichier PDF à traduire.');
      }
      
      if (file.type !== 'application/pdf') {
        throw new Error('❌ Le fichier doit être un PDF.\n\nFormat accepté : .pdf uniquement');
      }
      
      if (file.size > 10 * 1024 * 1024) {
        throw new Error('❌ Le fichier est trop volumineux (max 10 MB).\n\nSolutions :\n• Compressez le PDF\n• Divisez-le en plusieurs parties\n• Utilisez un fichier plus léger');
      }
      
      updateProgress(10, '📄 Chargement du PDF', 'Lecture du fichier...');
      
      const arrayBuffer = await file.arrayBuffer();
      const pdfData = new Uint8Array(arrayBuffer);
      
      displayBlob = URL.createObjectURL(new Blob([pdfData], { type: 'application/pdf' }));
      
      updateProgress(15, '📖 Extraction du texte', 'Analyse du document...');
      
      text = await extractTextFromPDF(pdfData);
    }
    
    Logger.log(`Texte extrait : ${text.length} caractères`);
    
    if (!text || text.trim().length < 10) {
      throw new Error('❌ Impossible d\'extraire du texte du document.\n\nCauses possibles :\n• Le PDF est une image scannée (utilisez un OCR)\n• Le document est vide\n• Le PDF est protégé ou corrompu');
    }
    
    // Afficher le document original
    const documentViewer = document.getElementById('originalDocument');
    documentViewer.src = displayBlob;
    
    // Vérifier le quota
    const estimatedWords = text.split(/\s+/).length;
    if (!QuotaManager.canTranslate(estimatedWords)) {
      const remaining = QuotaManager.getRemaining();
      throw new Error(`❌ Quota quotidien dépassé !\n\n📊 Mots restants : ${remaining.toLocaleString()}\n📝 Document à traduire : ~${estimatedWords.toLocaleString()} mots\n\nSolutions :\n• Réessayez demain (réinitialisation à minuit)\n• Traduisez un document plus court\n• Utilisez l'API DeepL (payante mais illimitée)`);
    }
    
    if (QuotaManager.getRemaining() < CONFIG.WARNING_THRESHOLD) {
      showNotification(`⚠️ Attention : Il vous reste seulement ${QuotaManager.getRemaining().toLocaleString()} mots aujourd'hui`, 'warning');
    }
    
    // Détection automatique si nécessaire
    let finalSourceLang = sourceLanguage;
    if (!finalSourceLang) {
      updateProgress(45, '🔍 Détection de la langue', 'Analyse du texte...');
      finalSourceLang = detectSourceLanguage(text);
      Logger.log(`Langue source détectée : ${finalSourceLang}`);
    }
    
    // Traduire
    updateProgress(50, '🌍 Traduction en cours', 'Connexion à MyMemory API...');
    
    const translatedText = await translateText(text, finalSourceLang, targetLang);
    
    // Afficher la traduction
    updateProgress(95, '✅ Traduction terminée', 'Affichage...');
    
    const translatedTextContainer = document.getElementById('translatedText');
    translatedTextContainer.innerText = translatedText;
    AppState.currentTranslation = translatedText;
    
    // Sauvegarder dans le cache
    TranslationCache.set(docId, finalSourceLang, targetLang, translatedText);
    
    updateProgress(100, '🎉 Terminé !', 'Succès');
    
    setTimeout(() => {
      hideProgressBar();
      showNotification('✅ Traduction terminée avec succès', 'success');
    }, 500);
    
  } catch (error) {
    Logger.error('Erreur:', error);
    hideProgressBar();
    
    // Afficher l'erreur avec retours à la ligne préservés
    const errorDiv = document.createElement('div');
    errorDiv.style.cssText = 'white-space: pre-line; text-align: left; max-width: 600px; margin: 0 auto;';
    errorDiv.textContent = error.message;
    
    const notification = document.createElement('div');
    notification.style.cssText = `
      position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%);
      padding: 25px 35px; background-color: #e74c3c; color: white;
      border-radius: 12px; box-shadow: 0 10px 40px rgba(0,0,0,0.3);
      z-index: 10000; font-size: 16px; max-width: 90%;
      animation: slideDown 0.3s ease-out;
    `;
    notification.appendChild(errorDiv);
    
    const closeBtn = document.createElement('button');
    closeBtn.textContent = '✕ Fermer';
    closeBtn.style.cssText = 'margin-top: 20px; padding: 10px 20px; background: white; color: #e74c3c; border: none; border-radius: 5px; cursor: pointer; font-weight: bold; width: 100%;';
    closeBtn.onclick = () => notification.remove();
    notification.appendChild(closeBtn);
    
    document.body.appendChild(notification);
    
    setTimeout(() => notification.remove(), 15000);
    
  } finally {
    AppState.isTranslating = false;
  }
}

// ============================================================
// FONCTIONS PUBLIQUES DE TRADUCTION
// ============================================================

async function translateGoogleDoc() {
  const urlInput = document.getElementById('urlInput');
  const url = urlInput.value.trim();
  const sourceLang = document.getElementById('sourceLanguageSelect').value;
  const targetLang = document.getElementById('targetLanguageSelect').value;
  
  if (!url) {
    showNotification('⚠️ Veuillez entrer une URL Google Docs', 'error');
    urlInput.focus();
    return;
  }
  
  const docIdMatch = url.match(/[-\w]{25,}/);
  if (!docIdMatch) {
    showNotification('⚠️ URL Google Docs invalide', 'error');
    return;
  }
  
  const docId = docIdMatch[0];
  
  await performDocumentTranslation('gdoc', docId, sourceLang, targetLang);
}

async function translatePDF() {
  const fileInput = document.getElementById('pdfInput');
  const file = fileInput.files[0];
  const sourceLang = document.getElementById('sourceLanguageSelect').value;
  const targetLang = document.getElementById('targetLanguageSelect').value;
  
  if (!file) {
    showNotification('⚠️ Veuillez sélectionner un fichier PDF', 'error');
    return;
  }
  
  const docId = `pdf_${file.name}_${file.size}`;
  
  await performDocumentTranslation('pdf', docId, sourceLang, targetLang);
}

// ============================================================
// SYNTHÈSE VOCALE
// ============================================================

function splitTextIntelligently(text, maxLength = CONFIG.SPEECH_CHUNK_SIZE) {
  const chunks = [];
  const paragraphs = text.split(/\n\n+/);
  
  for (const paragraph of paragraphs) {
    const trimmedPara = paragraph.trim();
    if (!trimmedPara) continue;
    
    if (trimmedPara.length <= maxLength) {
      chunks.push(trimmedPara);
      continue;
    }
    
    const sentences = trimmedPara.match(/[^.!?]+[.!?]+/g) || [trimmedPara];
    let currentChunk = '';
    
    for (const sentence of sentences) {
      const trimmedSentence = sentence.trim();
      
      if (trimmedSentence.length > maxLength) {
        if (currentChunk) {
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
  }
  
  return chunks.filter(c => c.length > 0);
}

function speakNextChunk(voice, targetLanguage) {
  if (!AppState.speech.isReading || AppState.speech.currentIndex >= AppState.speech.chunks.length) {
    Logger.log('Lecture terminée');
    document.getElementById('translatedText').style.backgroundColor = 'transparent';
    AppState.resetSpeech();
    showNotification('✅ Lecture terminée', 'success');
    return;
  }
  
  const chunk = AppState.speech.chunks[AppState.speech.currentIndex];
  const utterance = new SpeechSynthesisUtterance(chunk);
  
  if (voice) utterance.voice = voice;
  utterance.lang = targetLanguage;
  utterance.rate = 1.0;
  utterance.pitch = 1.0;
  
  utterance.onend = () => {
    AppState.speech.currentIndex++;
    setTimeout(() => speakNextChunk(voice, targetLanguage), 100);
  };
  
  utterance.onerror = (event) => {
    Logger.error(`Erreur synthèse (${AppState.speech.currentIndex + 1}/${AppState.speech.chunks.length}):`, event.error);
    
    if (event.error === 'interrupted' || event.error === 'synthesis-failed') {
      AppState.speech.currentIndex++;
      setTimeout(() => speakNextChunk(voice, targetLanguage), 500);
    } else {
      document.getElementById('translatedText').style.backgroundColor = 'transparent';
      AppState.resetSpeech();
      showNotification('❌ Erreur lors de la lecture', 'error');
    }
  };
  
  try {
    speechSynthesis.speak(utterance);
  } catch (error) {
    Logger.error('Erreur speak:', error);
    document.getElementById('translatedText').style.backgroundColor = 'transparent';
    AppState.resetSpeech();
    showNotification('❌ Impossible de lire le texte', 'error');
  }
}

function readTranslatedText() {
  const text = document.getElementById('translatedText').innerText;
  
  if (!text || text === '' || text.includes('apparaîtra ici')) {
    showNotification('⚠️ Aucune traduction à lire', 'warning');
    return;
  }
  
  if (speechSynthesis.speaking || AppState.speech.isReading) {
    speechSynthesis.cancel();
    AppState.resetSpeech();
    document.getElementById('translatedText').style.backgroundColor = 'transparent';
    showNotification('⏹️ Lecture arrêtée', 'info');
    return;
  }
  
  const targetLang = document.getElementById('targetLanguageSelect').value;
  
  Logger.log(`Préparation lecture : ${text.length} caractères`);
  
  AppState.speech.chunks = splitTextIntelligently(text);
  Logger.log(`${AppState.speech.chunks.length} morceaux`);
  
  const voices = speechSynthesis.getVoices();
  const voice = voices.find(v => v.lang.toLowerCase().startsWith(targetLang.toLowerCase()));
  
  if (voice) {
    Logger.log('Voix:', voice.name);
  }
  
  AppState.speech.isReading = true;
  AppState.speech.currentIndex = 0;
  document.getElementById('translatedText').style.backgroundColor = '#e3f2fd';
  showNotification(`🔊 Lecture en cours (${AppState.speech.chunks.length} parties)`, 'info');
  
  speakNextChunk(voice, targetLang);
}

// ============================================================
// FONCTIONS UTILITAIRES
// ============================================================

function copyTranslation() {
  const text = document.getElementById('translatedText').innerText;
  
  if (!text || text.includes('apparaîtra ici')) {
    showNotification('⚠️ Aucune traduction à copier', 'warning');
    return;
  }
  
  navigator.clipboard.writeText(text).then(() => {
    showNotification('✅ Texte copié dans le presse-papiers', 'success');
  }).catch(err => {
    Logger.error('Erreur copie:', err);
    showNotification('❌ Impossible de copier le texte', 'error');
  });
}

function downloadTranslation() {
  const text = document.getElementById('translatedText').innerText;
  
  if (!text || text.includes('apparaîtra ici')) {
    showNotification('⚠️ Aucune traduction à télécharger', 'warning');
    return;
  }
  
  const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `traduction_${new Date().toISOString().split('T')[0]}.txt`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  
  showNotification('✅ Traduction téléchargée', 'success');
}

// ============================================================
// INITIALISATION
// ============================================================

document.addEventListener('DOMContentLoaded', () => {
  Logger.log('DocuTranslate initialisé');
  Logger.log('API : MyMemory (gratuite, 10 000 mots/jour)');
  
  // Nettoyer cache expiré
  TranslationCache.clearOld();
  
  // Mettre à jour le quota
  QuotaManager.updateDisplay();
  
  // Charger voix
  speechSynthesis.onvoiceschanged = () => {
    const voices = speechSynthesis.getVoices();
    Logger.log(`${voices.length} voix disponibles`);
  };
  speechSynthesis.getVoices();
  
  // Styles animations
  const style = document.createElement('style');
  style.textContent = `
    @keyframes slideDown {
      from { transform: translate(-50%, -100%); opacity: 0; }
      to { transform: translate(-50%, 0); opacity: 1; }
    }
    @keyframes slideUp {
      from { transform: translate(-50%, 0); opacity: 1; }
      to { transform: translate(-50%, -100%); opacity: 0; }
    }
    .quota-display {
      padding: 12px 20px;
      border-radius: 8px;
      text-align: center;
      font-size: 16px;
      font-weight: 600;
      margin: 15px 0;
      transition: all 0.3s ease;
    }
  `;
  document.head.appendChild(style);
  
  setTimeout(() => {
    showNotification('👋 Bienvenue ! API MyMemory : 10 000 mots/jour gratuits', 'info');
  }, 1000);
});

// ============================================================
// FONCTIONS GLOBALES
// ============================================================

window.translateDocument = translateGoogleDoc;
window.translatePDF = translatePDF;
window.readTranslatedText = readTranslatedText;
window.copyTranslation = copyTranslation;
window.downloadTranslation = downloadTranslation;
window.clearCache = () => TranslationCache.clearAll();
window.resetQuota = () => QuotaManager.reset(); // Pour debug uniquement
