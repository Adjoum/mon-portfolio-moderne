// cv-extractor/src/rtf.mjs
// RTF → texte, sans dépendance : lecture des seuls mots de contrôle de texte (\par, \line, \tab,
// \'hh, \uN). Les groupes de métadonnées, polices, couleurs, styles, images (\pict), objets
// embarqués (\object) et champs (\field, liens) sont ignorés : rien n'est exécuté ni chargé.

const SKIP_DESTINATIONS = new Set([
  'fonttbl', 'colortbl', 'stylesheet', 'info', 'pict', 'object', 'objdata', 'themedata', 'datastore',
  'latentstyles', 'listtable', 'listoverridetable', 'rsidtbl', 'generator', 'xmlnstbl', 'header', 'footer',
  'headerl', 'headerr', 'footerl', 'footerr', 'fldinst', 'filetbl', 'revtbl', 'pgdsctbl', 'operator',
  'author', 'company', 'title', 'subject', 'keywords', 'comment', 'doccomm', 'bkmkstart', 'bkmkend', 'nonshppict',
]);

const MAX_DEPTH = 200;

export function rtfToText(source) {
  if (!source.startsWith('{\\rtf')) throw Object.assign(new Error('not rtf'), { code: 'EXTRACT_INVALID_FILE' });
  const out = [];
  // Pile des groupes : { skip, ucSkip }
  const stack = [{ skip: false, uc: 1 }];
  let pendingSkip = 0;   // caractères de repli à ignorer après \uN
  let i = 0;
  const emit = s => { if (!stack.at(-1).skip) out.push(s); };

  while (i < source.length) {
    const c = source[i];
    if (c === '{') {
      if (stack.length > MAX_DEPTH) throw Object.assign(new Error('depth'), { code: 'EXTRACT_INVALID_FILE' });
      stack.push({ ...stack.at(-1) });
      i++;
      continue;
    }
    if (c === '}') {
      if (stack.length > 1) stack.pop();
      i++;
      continue;
    }
    if (c === '\\') {
      const next = source[i + 1];
      if (next === undefined) break;
      // Destination facultative : {\*\nom …} ignorée entièrement
      if (next === '*') {
        stack.at(-1).skip = true;
        i += 2;
        continue;
      }
      if (next === '\'') {
        const hex = source.slice(i + 2, i + 4);
        if (pendingSkip > 0) pendingSkip--;
        else if (/^[0-9a-fA-F]{2}$/.test(hex)) emit(new TextDecoder('windows-1252').decode(Uint8Array.of(parseInt(hex, 16))));
        i += 4;
        continue;
      }
      if (/[\\{}]/.test(next)) {
        emit(next);
        i += 2;
        continue;
      }
      if (next === '~') { emit('\xA0'); i += 2; continue; }
      if (next === '-' || next === '_') { i += 2; continue; }
      const match = /^([a-zA-Z]{1,32})(-?\d{1,10})? ?/.exec(source.slice(i + 1, i + 46));
      if (!match) { i += 2; continue; }
      const [all, word, num] = match;
      i += 1 + all.length;
      if (SKIP_DESTINATIONS.has(word)) { stack.at(-1).skip = true; continue; }
      if (word === 'uc') { stack.at(-1).uc = Math.max(0, Math.min(4, Number(num ?? 1))); continue; }
      if (word === 'u') {
        let code = Number(num ?? 0);
        if (code < 0) code += 65536;
        emit(String.fromCodePoint(code));
        pendingSkip = stack.at(-1).uc;
        continue;
      }
      if (word === 'par' || word === 'line' || word === 'sect' || word === 'page' || word === 'row') emit('\n');
      else if (word === 'tab' || word === 'cell') emit('\t');
      else if (word === 'bullet') emit('•');
      else if (word === 'emdash') emit('—');
      else if (word === 'endash') emit('–');
      else if (word === 'lquote') emit('‘');
      else if (word === 'rquote') emit('’');
      else if (word === 'ldblquote') emit('“');
      else if (word === 'rdblquote') emit('”');
      else if (word === 'bin') {
        // Données binaires : sautées sans lecture
        i += Math.max(0, Number(num ?? 0));
      }
      continue;
    }
    if (c === '\r' || c === '\n') { i++; continue; }
    if (pendingSkip > 0) { pendingSkip--; i++; continue; }
    emit(c);
    i++;
  }
  return out.join('');
}
