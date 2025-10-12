// ============================================================
// DOCUTRANSLATE.JS - Code factorisé et amélioré
// ============================================================

// Configuration PDF.js
pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.10.377/pdf.worker.min.js';

// Variables globales
let currentTranslation = null;
let isTranslating = false;

// ============================================================
// FONCTIONS UTILITAIRES
// ============================================================

function showNotification(message, type = 'info') {
  const notification = document.createElement('div');
  notification.style.cssText = `
    position: fixed; top: 20px; left: 50%; transform: translateX(-50%);
    padding: 15px 25px;
    background-color: ${type === 'success' ? '#2ecc71' : type === 'error' ? '#e74c3c' : '#3498db'};
    color: white; border-radius: 5px; box-shadow: 0 4px 6px rgba(0,0,0,0.2);
    z-index: 10000; font-size: 16px; max-width: 80%; text-align: center;
  `;
  notification.textContent = message;
  document.body.appendChild(notification);
  
  setTimeout(() => {
    notification.style.transition = 'opacity 0.5s';
    notification.style.opacity = '0';
    setTimeout(() => notification.remove(), 500);
  }, 3000);
}

function showLoadingIndicator(message = 'Chargement...') {
  const existingLoader = document.getElementById('loadingIndicator');
  if (existingLoader) existingLoader.remove();
  
  const loader = document.createElement('div');
  loader.id = 'loadingIndicator';
  loader.style.cssText = `
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    background: rgba(0, 0, 0, 0.9);
    color: white;
    padding: 30px 40px;
    border-radius: 10px;
    z-index: 10001;
    text-align: center;
    box-shadow: 0 10px 40px rgba(0, 0, 0, 0.3);
  `;
  loader.innerHTML = `
    <div style="font-size: 20px; margin-bottom: 15px;">${message}</div>
    <div class="spinner"></div>
  `;
  document.body.appendChild(loader);
  
  // Ajouter le style du spinner
  if (!document.getElementById('spinnerStyle')) {
    const style = document.createElement('style');
    style.id = 'spinnerStyle';
    style.textContent = `
      .spinner {
        border: 4px solid rgba(255, 255, 255, 0.3);
        border-top: 4px solid white;
        border-radius: 50%;
        width: 40px;
        height: 40px;
        animation: spin 1s linear infinite;
        margin: 0 auto;
      }
      @keyframes spin {
        0% { transform: rotate(0deg); }
        100% { transform: rotate(360deg); }
      }
    `;
    document.head.appendChild(style);
  }
}

function hideLoadingIndicator() {
  const loader = document.getElementById('loadingIndicator');
  if (loader) {
    loader.style.transition = 'opacity 0.3s';
    loader.style.opacity = '0';
    setTimeout(() => loader.remove(), 300);
  }
}

// ============================================================
// EXTRACTION DE TEXTE DEPUIS PDF
// ============================================================

async function extractTextFromPDF(pdfData) {
  try {
    const pdfDoc = await pdfjsLib.getDocument({ data: pdfData }).promise;
    let text = '';
    
    for (let i = 1; i <= pdfDoc.numPages; i++) {
      const page = await pdfDoc.getPage(i);
      const textContent = await page.getTextContent();
      textContent.items.forEach(item => {
        text += item.str + ' ';
      });
    }
    
    return text.trim();
  } catch (error) {
    console.error('Erreur extraction PDF:', error);
    throw new Error('Impossible d\'extraire le texte du PDF');
  }
}

// ============================================================
// TRADUCTION VIA DEEPL
// ============================================================

async function translateText(text, targetLanguage) {
  if (!text || text.trim() === '') {
    throw new Error('Aucun texte à traduire');
  }
  
  if (text.length > 50000) {
    throw new Error('Le texte est trop long (limite : 50 000 caractères)');
  }
  
  try {
    const response = await fetch('/.netlify/functions/translate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        text: text,
        target_lang: targetLanguage,
      }),
    });
    
    if (!response.ok) {
      throw new Error(`Erreur API: ${response.status}`);
    }
    
    const data = await response.json();
    
    if (!data.translations || data.translations.length === 0) {
      throw new Error('Aucune traduction reçue de l\'API');
    }
    
    let translatedText = data.translations[0].text;
    // Ajouter des retours à la ligne après les phrases
    translatedText = translatedText.replace(/([.?!])\s*(?=[A-Z])/g, "$1\n\n");
    
    return translatedText;
  } catch (error) {
    console.error('Erreur traduction:', error);
    throw error;
  }
}

// ============================================================
// TRADUCTION DE GOOGLE DOCS
// ============================================================

async function translateGoogleDoc() {
  if (isTranslating) {
    showNotification('⚠️ Une traduction est déjà en cours', 'error');
    return;
  }
  
  const urlInput = document.getElementById('urlInput');
  const url = urlInput.value.trim();
  const targetLanguage = document.getElementById('languageSelect').value;
  
  if (!url) {
    showNotification('⚠️ Veuillez entrer une URL Google Docs', 'error');
    return;
  }
  
  // Extraire l'ID du document
  const docId = url.match(/[-\w]{25,}/);
  if (!docId) {
    showNotification('⚠️ URL Google Docs invalide', 'error');
    return;
  }
  
  const pdfUrl = `https://docs.google.com/document/d/${docId}/export?format=pdf`;
  
  isTranslating = true;
  showLoadingIndicator('📄 Chargement du document...');
  
  try {
    // Récupérer le PDF
    const response = await fetch('/.netlify/functions/fetch-doc', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ url: pdfUrl })
    });
    
    if (!response.ok) {
      throw new Error(`Erreur lors du chargement: ${response.status}`);
    }
    
    const blob = await response.blob();
    const urlBlob = URL.createObjectURL(blob);
    
    // Afficher le PDF original
    const documentViewer = document.getElementById('originalDocument');
    documentViewer.src = urlBlob;
    
    showLoadingIndicator('📖 Extraction du texte...');
    
    // Extraire le texte
    const pdfData = new Uint8Array(await blob.arrayBuffer());
    const text = await extractTextFromPDF(pdfData);
    
    console.log(`Texte extrait (${text.length} caractères)`);
    
    showLoadingIndicator('🌍 Traduction en cours...');
    
    // Traduire
    const translatedText = await translateText(text, targetLanguage);
    
    // Afficher la traduction
    const translatedTextContainer = document.getElementById('translatedText');
    translatedTextContainer.innerText = translatedText;
    currentTranslation = translatedText;
    
    hideLoadingIndicator();
    showNotification('✅ Traduction terminée avec succès', 'success');
    
  } catch (error) {
    console.error('Erreur:', error);
    hideLoadingIndicator();
    showNotification(`❌ ${error.message}`, 'error');
  } finally {
    isTranslating = false;
  }
}

// ============================================================
// TRADUCTION DE PDF LOCAL
// ============================================================

async function translatePDF() {
  if (isTranslating) {
    showNotification('⚠️ Une traduction est déjà en cours', 'error');
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
  
  if (file.size > 10 * 1024 * 1024) { // 10 MB
    showNotification('⚠️ Le fichier est trop volumineux (max 10 MB)', 'error');
    return;
  }
  
  isTranslating = true;
  showLoadingIndicator('📄 Chargement du PDF...');
  
  try {
    const reader = new FileReader();
    
    reader.onload = async function() {
      try {
        const pdfData = new Uint8Array(reader.result);
        
        // Afficher le PDF original
        const documentViewer = document.getElementById('originalDocument');
        documentViewer.src = URL.createObjectURL(new Blob([pdfData], { type: 'application/pdf' }));
        
        showLoadingIndicator('📖 Extraction du texte...');
        
        // Extraire le texte
        const text = await extractTextFromPDF(pdfData);
        
        console.log(`Texte extrait (${text.length} caractères)`);
        
        showLoadingIndicator('🌍 Traduction en cours...');
        
        // Traduire
        const translatedText = await translateText(text, targetLanguage);
        
        // Afficher la traduction
        const translatedTextContainer = document.getElementById('translatedText');
        translatedTextContainer.innerText = translatedText;
        currentTranslation = translatedText;
        
        hideLoadingIndicator();
        showNotification('✅ Traduction terminée avec succès', 'success');
        
      } catch (error) {
        console.error('Erreur:', error);
        hideLoadingIndicator();
        showNotification(`❌ ${error.message}`, 'error');
        isTranslating = false;
      }
    };
    
    reader.onerror = function() {
      hideLoadingIndicator();
      showNotification('❌ Erreur lors de la lecture du fichier', 'error');
      isTranslating = false;
    };
    
    reader.readAsArrayBuffer(file);
    
  } catch (error) {
    console.error('Erreur:', error);
    hideLoadingIndicator();
    showNotification(`❌ ${error.message}`, 'error');
    isTranslating = false;
  }
}

// ============================================================
// SYNTHÈSE VOCALE
// ============================================================

// Variables pour gérer la lecture par morceaux
let currentUtteranceIndex = 0;
let textChunks = [];
let isReadingInProgress = false;

function readTranslatedText() {
  const text = document.getElementById('translatedText').innerText;
  
  if (!text || text === '' || text === 'Traduction en cours...') {
    showNotification('⚠️ Aucune traduction à lire', 'error');
    return;
  }
  
  const targetLanguage = document.getElementById('languageSelect').value;
  
  // Arrêter toute lecture en cours
  if (speechSynthesis.speaking || isReadingInProgress) {
    speechSynthesis.cancel();
    isReadingInProgress = false;
    currentUtteranceIndex = 0;
    textChunks = [];
    document.getElementById('translatedText').style.backgroundColor = 'transparent';
    showNotification('⏹️ Lecture arrêtée', 'info');
    return;
  }
  
  console.log(`Lecture de ${text.length} caractères en ${targetLanguage}`);
  
  // CORRECTION: Découper le texte en morceaux de maximum 200 caractères
  // pour éviter les erreurs synthesis-failed
  const MAX_CHUNK_LENGTH = 200;
  
  // Découper par phrases d'abord (plus naturel)
  const sentences = text.match(/[^.!?]+[.!?]+/g) || [text];
  textChunks = [];
  let currentChunk = '';
  
  sentences.forEach(sentence => {
    if ((currentChunk + sentence).length < MAX_CHUNK_LENGTH) {
      currentChunk += sentence;
    } else {
      if (currentChunk) textChunks.push(currentChunk.trim());
      currentChunk = sentence;
    }
  });
  
  if (currentChunk) textChunks.push(currentChunk.trim());
  
  console.log(`Texte découpé en ${textChunks.length} morceaux`);
  
  // Trouver la voix correspondante
  const voices = speechSynthesis.getVoices();
  const voice = voices.find(v => v.lang.toLowerCase().startsWith(targetLanguage.toLowerCase()));
  
  if (voice) {
    console.log('Voix utilisée:', voice.name);
  } else {
    console.warn('Aucune voix trouvée pour', targetLanguage);
  }
  
  // Démarrer la lecture
  isReadingInProgress = true;
  currentUtteranceIndex = 0;
  document.getElementById('translatedText').style.backgroundColor = '#e3f2fd';
  showNotification(`🔊 Lecture en cours... (${textChunks.length} parties)`, 'info');
  
  speakNextChunk(voice, targetLanguage);
}

function speakNextChunk(voice, targetLanguage) {
  if (!isReadingInProgress || currentUtteranceIndex >= textChunks.length) {
    // Lecture terminée
    console.log('Synthèse vocale terminée');
    document.getElementById('translatedText').style.backgroundColor = 'transparent';
    isReadingInProgress = false;
    showNotification('✅ Lecture terminée', 'success');
    return;
  }
  
  const chunk = textChunks[currentUtteranceIndex];
  const utterance = new SpeechSynthesisUtterance(chunk);
  
  if (voice) {
    utterance.voice = voice;
  }
  
  utterance.lang = targetLanguage;
  utterance.rate = 1.0;
  utterance.pitch = 1.0;
  
  utterance.onend = () => {
    currentUtteranceIndex++;
    // Petit délai entre les morceaux pour éviter les problèmes
    setTimeout(() => {
      speakNextChunk(voice, targetLanguage);
    }, 100);
  };
  
  utterance.onerror = (event) => {
    console.error(`Erreur synthèse vocale (morceau ${currentUtteranceIndex + 1}):`, event.error);
    
    // Si erreur, on essaie de continuer avec le morceau suivant
    if (event.error === 'interrupted' || event.error === 'synthesis-failed') {
      currentUtteranceIndex++;
      setTimeout(() => {
        speakNextChunk(voice, targetLanguage);
      }, 500);
    } else {
      // Erreur grave, on arrête tout
      document.getElementById('translatedText').style.backgroundColor = 'transparent';
      isReadingInProgress = false;
      showNotification('❌ Erreur lors de la lecture', 'error');
    }
  };
  
  try {
    speechSynthesis.speak(utterance);
  } catch (error) {
    console.error('Erreur lors du speak:', error);
    document.getElementById('translatedText').style.backgroundColor = 'transparent';
    isReadingInProgress = false;
    showNotification('❌ Impossible de lire le texte', 'error');
  }
}

// ============================================================
// INITIALISATION
// ============================================================

document.addEventListener('DOMContentLoaded', () => {
  console.log('DocuTranslate initialisé');
  
  // Charger les voix disponibles
  speechSynthesis.onvoiceschanged = () => {
    const voices = speechSynthesis.getVoices();
    console.log(`${voices.length} voix disponibles:`, voices.map(v => v.lang));
  };
  
  // Déclencher le chargement des voix
  speechSynthesis.getVoices();
  
  // Afficher un message de bienvenue
  setTimeout(() => {
    showNotification('👋 Bienvenue sur DocuTranslate !', 'info');
  }, 500);
});

// ============================================================
// FONCTIONS GLOBALES (appelées depuis HTML)
// ============================================================

// Pour index.html (Google Docs)
window.translateDocument = translateGoogleDoc;

// Pour pdf.html (PDF local)
window.translatePDF = translatePDF;

// Commune aux deux
window.readTranslatedText = readTranslatedText;
