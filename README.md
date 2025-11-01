# DocuTranslate

**DocuTranslate** est une application web qui permet de traduire des documents Google Docs et PDF en plusieurs langues.

## ⚠️ Limitations importantes

### API de traduction : MyMemory
- **Quota quotidien** : 10 000 mots/jour GRATUITS
- **Limite par requête** : 500 caractères maximum
- **Qualité** : Correcte pour un usage éducatif, mais peut être imprécise pour des textes techniques

### Pour un usage professionnel intensif
Si vous avez besoin de traduire plus de 10 000 mots par jour ou si vous nécessitez une qualité supérieure, nous recommandons l'utilisation de **l'API DeepL** (payante mais illimitée et de meilleure qualité).

Pour basculer vers DeepL :
1. Créez un compte sur https://www.deepl.com/pro-api
2. Remplacez l'endpoint dans le fichier `scripts/docutranslate.js` :
   ```javascript
   TRANSLATION_ENDPOINT: 'https://api-free.deepl.com/v2/translate'
   ```
3. Ajoutez votre clé API DeepL dans les variables d'environnement Netlify

## Fonctionnalités

- **Traduction de Google Docs** : Entrez l'URL d'un document Google Docs public pour le traduire
- **Traduction de PDF** : Téléchargez un fichier PDF (max 10 MB) pour le traduire
- **Sélection de la langue source** : Choisissez la langue du document original ou utilisez la détection automatique
- **Compteur de quota** : Visualisez en temps réel votre quota restant de mots pour la journée
- **Cache intelligent** : Les traductions sont mises en cache pendant 24h pour un rechargement instantané
- **Synthèse Vocale** : Écoutez le texte traduit grâce à la fonctionnalité text-to-speech
- **Export** : Copiez ou téléchargez vos traductions en format TXT

## Langues disponibles

- Allemand (DE)
- Anglais (EN)
- Espagnol (ES)
- Français (FR)
- Italien (IT)
- Portugais (PT-PT, PT-BR)
- Russe (RU)
- Turc (TR)

## Installation

### Prérequis
- Node.js 14+
- Compte Netlify (pour le déploiement)

### Installation locale
```bash
git clone https://github.com/Einstein1987/DocuTranslate.git
cd DocuTranslate
npm install
```

### Tester localement
1. Ouvrez `index.html` dans votre navigateur pour la traduction de Google Docs
2. Ouvrez `pdf.html` dans votre navigateur pour la traduction de PDF

### Déploiement sur Netlify
1. Créez un fichier `netlify.toml` à la racine (déjà inclus)
2. Déployez sur Netlify via :
   - L'interface web de Netlify (connectez votre dépôt GitHub)
   - Ou la CLI Netlify : `netlify deploy --prod`

## Sécurité

### Protection des données
- Validation stricte des URLs (whitelist de domaines)
- Vérification du "magic number" PDF (signature `%PDF-`) pour éviter l'upload de fichiers malveillants
- Rate limiting (10 requêtes/minute par IP)
- Headers de sécurité HTTP (CSP, X-Frame-Options, etc.)
- Limite de taille de fichier (10 MB)

### Fichiers sensibles
Aucune clé API n'est exposée dans le code source. Toutes les requêtes de traduction passent par des fonctions serverless Netlify qui gèrent les clés de manière sécurisée.

## Architecture technique

```
DocuTranslate/
├── index.html              # Page principale (Google Docs)
├── pdf.html                # Page traduction PDF
├── scripts/
│   └── docutranslate.js    # Logique principale (factorisation, cache, quota)
├── styles/
│   └── styles.css          # Styles responsive
├── functions/              # Fonctions serverless Netlify
│   ├── fetch-doc.js        # Récupération sécurisée des documents
│   └── translate-libre.js  # Interface avec API MyMemory
└── netlify.toml            # Configuration Netlify
```

## Améliorations apportées dans cette version

### ✅ Corrections majeures
- Correction des messages mensongers (suppression de "illimité", "LibreTranslate")
- Ajout d'un **compteur de quota** visuel en temps réel
- **Sélection de la langue source** (au lieu d'une détection automatique peu fiable)
- Messages d'erreur **clairs et actionnables** en français
- Validation stricte du **magic number PDF** côté serveur

### 🎨 Améliorations UX
- Barre de progression détaillée pendant la traduction
- Notifications contextuelles (succès, erreur, avertissement)
- Interface responsive et moderne
- Boutons Copier / Télécharger / Écouter

### 🔧 Qualité du code
- **Système de logging conditionnel** (activable en dev uniquement)
- **Code factorisé** : une seule fonction pour Google Docs et PDF
- Suppression des `console.log` en production
- Cache optimisé avec nettoyage automatique

## Support et Contact

**Auteur** : Jérémy VIOLETTE  
**Établissement** : Collège La NACELLE (REP) - Corbeil-Essonnes (91100)  
**Fonction** : Professeur de Physique-Chimie

*DocuTranslate est conçu pour aider les élèves allophones inscrits en UPE2A à faciliter la traduction de documents pédagogiques.*

Pour toute question ou support, veuillez me contacter via le dépôt GitHub.

## Licence

Ce projet est sous **licence MIT**. Voir le fichier [LICENSE](LICENSE) pour plus de détails.

---

## Notes de développement

### Mode DEBUG
Pour activer les logs en développement, modifiez dans `scripts/docutranslate.js` :
```javascript
const DEBUG_MODE = true; // Mettre à false en production
```

### Réinitialiser le quota (debug uniquement)
Ouvrez la console du navigateur et tapez :
```javascript
resetQuota()
```

### Vider le cache
```javascript
clearCache()
```
