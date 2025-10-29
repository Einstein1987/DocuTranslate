// ============================================================
// DOCUTRANSLATE.JS - VERSION OPTIMISÉE LIBRETRANSLATE
// ============================================================
// Version simplifiée sans compteur ni historique
// Avec : Cache, Barre de progression, Copier/Télécharger
// ============================================================

// Configuration PDF.js
pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.10.377/pdf.worker.min.js';

// ============================================================
// CONFIGURATION
// ============================================================

const CONFIG = {
  TRANSLATION_ENDPOINT: '/.netlify/functions/translate-libre',
  CACHE_EXPIRY: 24 * 60 * 60 * 1000, // 24 heures
  SPEECH_CHUNK_SIZE: 200
};

// ============================================================
// MODULE DE CACHE
// ============================================================

const TranslationCache = {
  _generateKey(docId, lang) {
    return `docutranslate_${docId}_${lang}`;
  },

  set(docId, lang, translation) {
    try {
      const key = this._generateKey(docId, lang);
      const data = {
        translation,
        timestamp: Date.now()
      };
      localStorage.setItem(key, JSON.stringify(data));
    } catch (error) {
      console.error('Erreur cache:', error);
      if (error.name === 'QuotaExceededError') {
        this.clearOld();
      }
    }
  },

  get(docId, lang) {
    try {
      const key = this._generateKey(docId, lang);
      const item = localStorage.getItem(key);
      
      if (!item) return null;
      
      const data = JSON.parse(item);
      
      // Vérifier l'expiration
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
      console.error('Erreur nettoyage cache:', error);
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
      showNotification(`Cache vidé (${cleared} traductions)`, 'success');
    } catch (error) {
      console.error('Erreur vidage cache:', error);
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
  hideProgressBar(); // Supprimer l'ancienne si existe
  
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
      // Mise à jour progression extraction
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
    console.error('Erreur extraction PDF:', error);
    throw new Error('Impossible d\'extraire le texte du PDF');
  }
}

// ============================================================
// TRADUCTION
// ============================================================

async function translateText(text, targetLanguage) {
  if (!text || text.trim() === '') {
    throw new Error('Aucun texte à traduire');
  }
  
  try {
    updateProgress(50, '🌍 Traduction en cours', 'Connexion à l\'API...');
    
    const response = await fetch(CONFIG.TRANSLATION_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        text: text,
        target_lang: targetLanguage,
      }),
    });
    
    updateProgress(70, '🌍 Traduction en cours', 'Réception de la traduction...');
    
    if (!response.ok) {
      if (response.status === 429) {
        const data = await response.json();
        throw new Error(data.error || 'Trop de requêtes. Veuillez patienter quelques minutes.');
      }
      
      if (response.status === 400) {
        const data = await response.json();
        throw new Error(data.error || 'Erreur dans la requête');
      }
      
      throw new Error(`Erreur serveur (${response.status})`);
    }
    
    const data = await response.json();
    
    if (!data.translations || data.translations.length === 0) {
      throw new Error('Aucune traduction reçue de l\'API');
    }
    
    updateProgress(90, '✨ Finalisation', 'Formatage du texte...');
    
    let translatedText = data.translations[0].text;
    
    // Améliorer le formatage
    translatedText = translatedText.replace(/([.?!])\s+/g, "$1\n\n");
    
    return translatedText;
  } catch (error) {
    console.error('Erreur traduction:', error);
    throw error;
  }
}

// ============================================================
// TRADUCTION GOOGLE DOCS
// ============================================================

async function translateGoogleDoc() {
  if (AppState.isTranslating) {
    showNotification('⚠️ Une traduction est déjà en cours', 'warning');
    return;
  }
  
  const urlInput = document.getElementById('urlInput');
  const url = urlInput.value.trim();
  const targetLanguage = document.getElementById('languageSelect').value;
  
  if (!url) {
    showNotification('⚠️ Veuillez entrer une URL Google Docs', 'error');
    urlInput.focus();
    return;
  }
  
  // Extraire l'ID du document
  const docIdMatch = url.match(/[-\w]{25,}/);
  if (!docIdMatch) {
    showNotification('⚠️ URL Google Docs invalide', 'error');
    return;
  }
  
  const docId = docIdMatch[0];
  
  // Vérifier le cache
  const cached = TranslationCache.get(docId, targetLanguage);
  if (cached) {
    showNotification('⚡ Traduction chargée depuis le cache (instantané !)', 'success');
    const translatedTextContainer = document.getElementById('translatedText');
    translatedTextContainer.innerText = cached;
    AppState.currentTranslation = cached;
    return;
  }
  
  const pdfUrl = `https://docs.google.com/document/d/${docId}/export?format=pdf`;
  
  AppState.isTranslating = true;
  showProgressBar();
  updateProgress(0, '🚀 Démarrage', 'Initialisation...');
  
  try {
    // Récupérer le PDF
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
      throw new Error(error.error || `Erreur lors du chargement (${response.status})`);
    }
    
    updateProgress(10, '📄 Chargement du document', 'Téléchargement en cours...');
    
    const blob = await response.blob();
    const urlBlob = URL.createObjectURL(blob);
    
    // Afficher le PDF original
    const documentViewer = document.getElementById('originalDocument');
    documentViewer.src = urlBlob;
    
    // Extraire le texte
    updateProgress(15, '📖 Extraction du texte', 'Analyse du document...');
    
    const pdfData = new Uint8Array(await blob.arrayBuffer());
    const text = await extractTextFromPDF(pdfData);
    
    console.log(`📝 Texte extrait : ${text.length} caractères`);
    
    // Traduire
    updateProgress(45, '🌍 Traduction en cours', 'Envoi à LibreTranslate...');
    
    const translatedText = await translateText(text, targetLanguage);
    
    // Afficher la traduction
    updateProgress(95, '✅ Traduction terminée', 'Affichage...');
    
    const translatedTextContainer = document.getElementById('translatedText');
    translatedTextContainer.innerText = translatedText;
    AppState.currentTranslation = translatedText;
    
    // Sauvegarder dans le cache
    TranslationCache.set(docId, targetLanguage, translatedText);
    
    updateProgress(100, '🎉 Terminé !', 'Succès');
    
    setTimeout(() => {
      hideProgressBar();
      showNotification('✅ Traduction terminée avec succès', 'success');
    }, 500);
    
  } catch (error) {
    console.error('Erreur:', error);
    hideProgressBar();
    showNotification(`❌ ${error.message}`, 'error');
  } finally {
    AppState.isTranslating = false;
  }
}

// ============================================================
// TRADUCTION PDF LOCAL
// ============================================================

async function translatePDF() {
  if (AppState.isTranslating) {
    showNotification('⚠️ Une traduction est déjà en cours', 'warning');
    return;
  }
  
  const fileInput = document.getElementById('pdfInput');
  const file = fileInput.files[0];
  const targetLanguage = document.getElementById('languageSelect').value;
  
  if (!file) {
    showNotification('⚠️ Veuillez sélectionner un fichier PDF', 'error');
    return;
  }
  
  if (file.type !== 'application/pdf') {
    showNotification('⚠️ Le fichier doit être un PDF', 'error');
    return;
  }
  
  if (file.size > 10 * 1024 * 1024) {
    showNotification('⚠️ Le fichier est trop volumineux (max 10 MB)', 'error');
    return;
  }
  
  // ID unique pour le cache
  const docId = `pdf_${file.name}_${file.size}`;
  
  // Vérifier le cache
  const cached = TranslationCache.get(docId, targetLanguage);
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
    const reader = new FileReader();
    
    reader.onload = async function() {
      try {
        updateProgress(10, '📄 Chargement du PDF', 'Lecture du fichier...');
        
        const pdfData = new Uint8Array(reader.result);
        
        // Afficher le PDF original
        const documentViewer = document.getElementById('originalDocument');
        documentViewer.src = URL.createObjectURL(new Blob([pdfData], { type: 'application/pdf' }));
        
        // Extraire le texte
        updateProgress(15, '📖 Extraction du texte', 'Analyse du document...');
        
        const text = await extractTextFromPDF(pdfData);
        
        console.log(`📝 Texte extrait : ${text.length} caractères`);
        
        // Traduire
        updateProgress(45, '🌍 Traduction en cours', 'Envoi à LibreTranslate...');
        
        const translatedText = await translateText(text, targetLanguage);
        
        // Afficher la traduction
        updateProgress(95, '✅ Traduction terminée', 'Affichage...');
        
        const translatedTextContainer = document.getElementById('translatedText');
        translatedTextContainer.innerText = translatedText;
        AppState.currentTranslation = translatedText;
        
        // Sauvegarder dans le cache
        TranslationCache.set(docId, targetLanguage, translatedText);
        
        updateProgress(100, '🎉 Terminé !', 'Succès');
        
        setTimeout(() => {
          hideProgressBar();
          showNotification('✅ Traduction terminée avec succès', 'success');
        }, 500);
        
      } catch (error) {
        console.error('Erreur:', error);
        hideProgressBar();
        showNotification(`❌ ${error.message}`, 'error');
        AppState.isTranslating = false;
      }
    };
    
    reader.onerror = function() {
      hideProgressBar();
      showNotification('❌ Erreur lors de la lecture du fichier', 'error');
      AppState.isTranslating = false;
    };
    
    reader.readAsArrayBuffer(file);
    
  } catch (error) {
    console.error('Erreur:', error);
    hideProgressBar();
    showNotification(`❌ ${error.message}`, 'error');
    AppState.isTranslating = false;
  }
}

// ============================================================
// SYNTHÈSE VOCALE AMÉLIORÉE
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
    
    // Découper par phrases
    const sentences = trimmedPara.match(/[^.!?]+[.!?]+/g) || [trimmedPara];
    let currentChunk = '';
    
    for (const sentence of sentences) {
      const trimmedSentence = sentence.trim();
      
      if (trimmedSentence.length > maxLength) {
        if (currentChunk) {
          chunks.push(currentChunk.trim());
          currentChunk = '';
        }
        
        // Découper la phrase longue
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
    console.log('🔊 Lecture terminée');
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
    console.error(`Erreur synthèse (${AppState.speech.currentIndex + 1}/${AppState.speech.chunks.length}):`, event.error);
    
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
    console.error('Erreur speak:', error);
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
  
  // Si déjà en lecture, arrêter
  if (speechSynthesis.speaking || AppState.speech.isReading) {
    speechSynthesis.cancel();
    AppState.resetSpeech();
    document.getElementById('translatedText').style.backgroundColor = 'transparent';
    showNotification('⏹️ Lecture arrêtée', 'info');
    return;
  }
  
  const targetLanguage = document.getElementById('languageSelect').value;
  
  console.log(`🔊 Préparation lecture : ${text.length} caractères`);
  
  AppState.speech.chunks = splitTextIntelligently(text);
  console.log(`📑 ${AppState.speech.chunks.length} morceaux`);
  
  const voices = speechSynthesis.getVoices();
  const voice = voices.find(v => v.lang.toLowerCase().startsWith(targetLanguage.toLowerCase()));
  
  if (voice) {
    console.log('🎤 Voix:', voice.name);
  }
  
  AppState.speech.isReading = true;
  AppState.speech.currentIndex = 0;
  document.getElementById('translatedText').style.backgroundColor = '#e3f2fd';
  showNotification(`🔊 Lecture en cours (${AppState.speech.chunks.length} parties)`, 'info');
  
  speakNextChunk(voice, targetLanguage);
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
    console.error('Erreur copie:', err);
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
  console.log('🚀 DocuTranslate initialisé');
  console.log('🌍 API : LibreTranslate (gratuit & illimité)');
  
  // Nettoyer cache expiré
  TranslationCache.clearOld();
  
  // Charger voix
  speechSynthesis.onvoiceschanged = () => {
    const voices = speechSynthesis.getVoices();
    console.log(`🎤 ${voices.length} voix disponibles`);
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
  `;
  document.head.appendChild(style);
  
  setTimeout(() => {
    showNotification('👋 Bienvenue ! Traductions illimitées avec LibreTranslate', 'info');
  }, 500);
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
