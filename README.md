# DocuTranslate
**DocuTranslate** est une application web qui permet de traduire des documents Google Docs et PDF en plusieurs langues. Cette application utilise l'API DeepL pour fournir des traductions précises et de haute qualité. 

## Fonctionnalités
- **Traduction de Google Docs** : Entrez l'URL d'un document Google Docs pour le traduire dans la langue de votre choix.
- **Traduction de PDF** : Téléchargez un fichier PDF pour le traduire directement dans l'application.
- **Synthèse Vocale** : Écoutez le texte traduit grâce à la fonctionnalité de synthèse vocale.
- **Interface Intuitive** : Interface utilisateur simple et claire pour une utilisation facile.

## Langues Disponibles
- Allemand (DE)
- Anglais (EN)
- Espagnol (ES)
- Portugais (PT-PT, PT-BR)
- Russe (RU)
- Turc (TR)

## Utilisation
### Traduction de Google Docs
1. Ouvrez la page principale de l'application.
2. Entrez l'URL d'un document Google Docs dans le champ prévu.
3. Sélectionnez la langue cible dans le menu déroulant.
4. Cliquez sur le bouton "Traduire" pour lancer la traduction.
5. Le document original s'affiche à gauche et la traduction s'affiche à droite.

### Traduction de PDF
1. Cliquez sur le bouton "PDF" en haut à droite pour accéder à la page de traduction de PDF.
2. Téléchargez un fichier PDF en utilisant le champ de téléchargement.
3. Sélectionnez la langue cible dans le menu déroulant.
4. Cliquez sur le bouton "Traduire" pour lancer la traduction.
5. Le document PDF s'affiche à gauche et la traduction s'affiche à droite.

### Synthèse Vocale
1. Après avoir traduit un document, cliquez sur le bouton "🔊 Lecture du document traduit" sous la traduction.
2. La synthèse vocale commence et lit le texte traduit à voix haute.

## Installation
Pour exécuter cette application localement, suivez ces étapes :
1. Clonez le dépôt GitHub : `git clone https://github.com/Einstein1987/DocuTranslate.git`
2. Ouvrez le fichier `index.html` dans votre navigateur pour accéder à la traduction de Google Docs.
3. Ouvrez le fichier `pdf.html` dans votre navigateur pour accéder à la traduction de PDF.

## Sécurité et Gestion des Clés API
La clé API DeepL utilisée pour les traductions est cachée et sécurisée en utilisant une fonction serverless déployée sur Netlify. Cela permet de ne pas exposer la clé API dans le code source public.

### Configuration des Variables d'Environnement sur Netlify
1. Accédez à votre tableau de bord Netlify.
2. Sélectionnez votre site.
3. Allez dans **Site settings** > **Build & deploy** > **Environment**.
4. Ajoutez une nouvelle variable d'environnement :
   - Key : `DEEPL_API_KEY`
   - Value : votre clé API DeepL.

### Déploiement avec Netlify
1. Créez un fichier `netlify.toml` à la racine de votre projet avec le contenu suivant :
   ```toml
   [build]
     publish = "."
     command = "npm install"

   [[redirects]]
     from = "/*"
     to = "/index.html"
     status = 200

   [functions]
     directory = "functions"
2. Déployez votre site sur Netlify en suivant les instructions de leur documentation.
### API Utilisées
- **API DeepL** : Pour les traductions.
- **API PDF.js** : Pour afficher et extraire du texte à partir des fichiers PDF.
- **Web Speech API** : Pour la synthèse vocale.
## Licence
Ce projet est sous **licence MIT**. Voir le fichier [LICENSE](LICENSE) pour plus de détails.

## Auteur
Jérémy VIOLETTE - Professeur de Physique-Chimie, Collège La NACELLE (REP) de Corbeil-Essonnes (91100).

Pour toute question ou support, veuillez me contacter.

*DocuTranslate est conçu pour aider les élèves allophones inscrits en UPE2A à faciliter la traduction de documents pédagogiques.*

----------------------------------------------------------------------------------------------------------------------

# DocuTranslate 
**DocuTranslate** is a web application that translates Google Docs and PDF documents into multiple languages.
The application uses the DeepL API to provide accurate, high-quality translations.  
## Features 
- **Google Docs translation**: Enter the URL of a Google Docs document to translate it into the language of your choice.
- **PDF translation**: Download a PDF file for translation directly into the application.
- **Text-to-speech**: Listen to the translated text using the text-to-speech feature.
- **Intuitive interface**: Clear, simple user interface for ease of use.
## Available languages 
- German (DE)
- English (EN)
- Spanish (ES)
- Portuguese (PT-PT, PT-BR)
- Russian (RU)
- Turkish (TR)
## Usage 
### Google Docs translation 
1. Open the application's main page.  
2. Enter the URL of a Google Docs document in the field provided.
3. Select the target language from the drop-down menu.
4. Click on the "Translate" button to start translation.
5. The original document is displayed on the left and the translation on the right.
### PDF translation 
1. Click on the "PDF" button at top right to access the PDF translation page.
2. Upload a PDF file using the upload field.
3. Select the target language from the drop-down menu.
4. Click on the "Translate" button to start translation.
5. The PDF document is displayed on the left and the translation on the right.
### Voice synthesis 
1. After translating a document, click on the "🔊 Read translated document" button below the translation.
2. Text-to-speech starts and reads the translated text aloud.
## Installation 
To run this application locally, follow these steps :
1. Clone the GitHub repository : `git clone https://github.com/Einstein1987/DocuTranslate.git`
2. Open the file `index.html` in your browser to access Google Docs translation.
3. Open the file `pdf.html` in your browser to access the PDF translation.
## Security and API Key Management
The DeepL API key used for translations is hidden and secured using a serverless function deployed on Netlify. This ensures that the API key is not exposed in the public source code.  
### Setting up Environment Variables on Netlify 
1. Access your Netlify dashboard.
2. Select your site.
3. Go to **Site settings** > **Build & deploy** > **Environment**.
4. Add a new environment variable :
   - Key : `DEEPL_API_KEY`
   - Value : your API key DeepL.

### Deploying with Netlify
1. Create a `netlify.toml` file at the root of your project with the following contents :
   ```toml
   [build]
     publish = "."
     command = "npm install"

   [[redirects]]
     from = "/*"
     to = "/index.html"
     status = 200

   [functions]
     directory = "functions"
2. Deploy your site on Netlify following the instructions in their documentation.
### APIs used
- **API DeepL** : For translations.
- **PDF.js API** : For displaying and extracting text from PDF files.
- **Web Speech API** : For text-to-speech.

## License
This project is **licensed by MIT**. See the [LICENSE](LICENSE) file for more details.
## Author 
Jérémy VIOLETTE - Physics and Chemistry teacher, Collège La NACELLE (REP), Corbeil-Essonnes (91100).

For any questions or support, please contact me.

*DocuTranslate is designed to help allophone students enrolled in a UPE2A program to easily translate pedagogical documents.*

