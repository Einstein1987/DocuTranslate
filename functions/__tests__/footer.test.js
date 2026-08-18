const fs = require('fs');
const path = require('path');

const projectRoot = path.join(__dirname, '..', '..');

describe('pied de page du développeur', () => {
  test.each(['index.html', 'pdf.html'])(
    '%s affiche le développeur, la licence et le code source',
    (fileName) => {
      const html = fs.readFileSync(path.join(projectRoot, fileName), 'utf8');

      expect(html).toMatch(/<footer[^>]+class="app-footer"/u);
      expect(html).toMatch(/Développé par <strong>Jérémy VIOLETTE<\/strong>/u);
      expect(html).toMatch(/src="IMG\/logo_dev\.png"/u);
      expect(html).toMatch(/DocuTranslate\/blob\/main\/LICENSE/u);
      expect(html).toMatch(/>Licence MIT<\/a>/u);
      expect(html).toMatch(/>Code source<\/a>/u);
    }
  );
});
