import fs from 'fs';
import path from 'path';
import { execFile } from 'child_process';
import { fileURLToPath } from 'url';

let generateWAMessageFromContent, proto;
try {
  const baileys = await import('@whiskeysockets/baileys');
  generateWAMessageFromContent = baileys.generateWAMessageFromContent;
  proto = baileys.proto;
} catch {
  try {
    const baileys = await import('baileys');
    generateWAMessageFromContent = baileys.generateWAMessageFromContent;
    proto = baileys.proto;
  } catch (err) {
    console.error('[PLUGIN MGR] Impossibile caricare Baileys per i bottoni:', err.message);
  }
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const pluginsDir = path.resolve(__dirname, '../plugins');
const _fs = fs.promises;

function checkIsOwner(sender, msg, sock) {
  if (msg?.key?.fromMe) return true;
  if (!sender || !sock?.user) return false;
  const botNum = (sock.user.id || sock.user.jid || '').split(':')[0].replace(/\D/g, '');
  const senderNum = sender.replace(/\D/g, '');
  return botNum && senderNum === botNum;
}

function checkSyntax(filePath) {
  return new Promise((resolve) => {
    execFile('node', ['--check', filePath], (error, stdout, stderr) => {
      if (error) {
        resolve({ valid: false, error: (stderr || error.message || '').trim().slice(0, 800) });
      } else {
        resolve({ valid: true });
      }
    });
  });
}

function cleanFilename(name = '') {
  return name.trim().replace(/\.js$/i, '').replace(/[^a-zA-Z0-9_\-]/g, '');
}

function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

function extractCode(msg, args) {
  let code = '';
  const contextInfo = msg.message?.extendedTextMessage?.contextInfo
    || msg.message?.imageMessage?.contextInfo
    || msg.message?.videoMessage?.contextInfo;

  if (contextInfo?.quotedMessage) {
    const quoted = contextInfo.quotedMessage;
    code = quoted.conversation
      || quoted.extendedTextMessage?.text
      || quoted.imageMessage?.caption
      || quoted.videoMessage?.caption
      || quoted.documentMessage?.caption
      || '';
  } else {
    code = args.slice(1).join(' ');
  }

  code = code ? code.trim() : '';

  if (code.startsWith('```')) {
    code = code.replace(/^```[a-zA-Z]*\n?/, '').replace(/\n?```$/, '').trim();
  }

  return code;
}

function getBigrams(str) {
  const bigrams = [];
  for (let i = 0; i < str.length - 1; i++) {
    bigrams.push(str.substring(i, i + 2));
  }
  return bigrams;
}

function calculateSimilarity(a, b) {
  const bigramsA = getBigrams(a);
  const bigramsB = getBigrams(b);
  if (!bigramsA.length || !bigramsB.length) return 0;
  const intersection = bigramsA.filter(bigram => bigramsB.includes(bigram));
  return (2 * intersection.length) / (bigramsA.length + bigramsB.length);
}

function findSimilarFiles(searchTerm, baseDir = process.cwd(), maxResults = 5) {
  const results = [];

  function searchRecursive(dir) {
    try {
      const files = fs.readdirSync(dir);
      for (const file of files) {
        const fullPath = path.join(dir, file);
        try {
          const stat = fs.statSync(fullPath);
          if (stat.isDirectory()) {
            if (!file.includes('node_modules') && !file.includes('.git') && !file.includes('chrome-session')) {
              searchRecursive(fullPath);
            }
          } else {
            const fileName = path.basename(file, path.extname(file));
            const similarity = calculateSimilarity(searchTerm.toLowerCase(), fileName.toLowerCase());
            if (similarity > 0.25) {
              results.push({
                path: fullPath,
                name: file,
                baseName: fileName,
                similarity: similarity,
                relativePath: path.relative(baseDir, fullPath)
              });
            }
          }
        } catch {}
      }
    } catch {}
  }

  searchRecursive(baseDir);
  return results.sort((a, b) => b.similarity - a.similarity).slice(0, maxResults);
}

async function sendInteractiveButtons(sock, from, text, buttons, quotedMsg) {
  try {
    if (!generateWAMessageFromContent) {
      throw new Error('Funzione generateWAMessageFromContent non caricata.');
    }

    const nativeButtons = buttons.map(btn => ({
      name: 'quick_reply',
      buttonParamsJson: JSON.stringify({
        display_text: btn.displayText,
        id: btn.buttonId
      })
    }));

    let interactiveObj = {
      body: { text: text },
      footer: { text: '⚙️ Plugin Manager' },
      header: { title: '', hasMediaAttachment: false },
      nativeFlowMessage: {
        buttons: nativeButtons
      }
    };

    if (proto?.Message?.InteractiveMessage) {
      interactiveObj = proto.Message.InteractiveMessage.create({
        body: proto.Message.InteractiveMessage.Body.create({ text: text }),
        footer: proto.Message.InteractiveMessage.Footer.create({ text: '⚙️ Plugin Manager' }),
        header: proto.Message.InteractiveMessage.Header.create({ title: '', hasMediaAttachment: false }),
        nativeFlowMessage: proto.Message.InteractiveMessage.NativeFlowMessage.create({
          buttons: nativeButtons
        })
      });
    }

    const msgContent = {
      viewOnceMessage: {
        message: {
          interactiveMessage: interactiveObj
        }
      }
    };

    const waMsg = generateWAMessageFromContent(from, msgContent, { quoted: quotedMsg });
    return await sock.relayMessage(from, waMsg.message, { messageId: waMsg.key.id });
  } catch (err) {
    console.error('[BUTTONS ERROR, FALLBACK TO TEXT]', err.message);
    let fallbackText = text + '\n\n';
    buttons.forEach((b, i) => {
      fallbackText += `*${i + 1}.${b.displayText}*\n👉 \`${b.buttonId}\`\n\n`;
    });
    return await sock.sendMessage(from, { text: fallbackText }, { quoted: quotedMsg });
  }
}

async function triggerHotReload(sock, from, msg, filename) {
  try {
    if (typeof global.reloadPlugins !== 'function') {
      return sock.sendMessage(from, {
        text: '⚠️ Ricarica automatica non disponibile: main.js non espone ancora global.reloadPlugins.'
      }, { quoted: msg });
    }

    await global.reloadPlugins();

    await sock.sendMessage(from, {
      text: '💬 Ricarica automatica dei moduli eseguita con successo.'
    }, { quoted: msg });
  } catch (err) {
    console.error('[HOT RELOAD ERROR]', err);
    await sock.sendMessage(from, {
      text: `❌ Errore durante la ricarica automatica: ${err.message}`
    }, { quoted: msg });
  }
}

export default {
  name: 'saveplugin',
  aliases: [
    'addplugin', 'addpl', 'savepl',
    'dp', 'delplugin', 'rmplugin', 'deleteplugin',
    'getplugin', 'getfile', 'gp', 'gf', 'ottienifile', 'fileplugin', 'selectfile',
    'editpl', 'editplugin', 'listplugins', 'plugins', 'lsp'
  ],
  description: 'Gestione professionale, ricerca, salvataggio e modifica dei plugin e file del bot.',

  async run({ sock, msg, from, sender, command, args, prefix, sendText }) {
    if (!checkIsOwner(sender, msg, sock)) {
      return sock.sendMessage(from, {
        text: '❌ Accesso negato: solo il numero del bot può accedere alla gestione dei plugin.'
      }, { quoted: msg });
    }

    const p = prefix || '.';
    const cmd = command.toLowerCase();

    const reply = async (text) => {
      try {
        if (typeof sendText === 'function') {
          return await sendText(text);
        } else {
          return await sock.sendMessage(from, { text }, { quoted: msg });
        }
      } catch (err) {
        console.error('[PLUGIN MANAGER REPLY ERROR]', err);
      }
    };

    if (['listplugins', 'plugins', 'lsp'].includes(cmd)) {
      try {
        if (!fs.existsSync(pluginsDir)) {
          return reply('❌ Cartella dei plugin non trovata.');
        }

        const files = fs.readdirSync(pluginsDir).filter(f => f.endsWith('.js'));
        if (!files.length) {
          return reply('📂 Nessun plugin presente nella cartella.');
        }

        const pluginList = files.map((file, idx) => {
          const stats = fs.statSync(path.join(pluginsDir, file));
          const name = file.replace(/\.js$/, '');
          return `> *${idx + 1}.* \`${name}\` _(${formatBytes(stats.size)})_`;
        }).join('\n');

        const text = [
          '*PLUGIN INSTALLATI*',
          '───────────────',
          `> *Totale moduli:* ${files.length}`,
          '',
          pluginList,
          '',
          '───────────────',
          `_Usa \`${p}gp <nome>\` per cercare o leggere un file_`
        ].join('\n');

        return await reply(text);
      } catch (err) {
        return reply(`❌ Errore durante la lettura dei file: ${err.message}`);
      }
    }

    if (['getplugin', 'getfile', 'gp', 'gf'].includes(cmd)) {
      const query = args.join(' ').trim();
      if (!query) {
        return reply([
          '*RICERCA FILE*',
          '───────────────',
          '❌ Inserisci il nome o parte del nome del file.',
          '',
          `> *Esempi:*`,
          `> \`${p}gp slot\``,
          `> \`${p}gp menu\``
        ].join('\n'));
      }

      const similarFiles = findSimilarFiles(query, process.cwd(), 5);

      if (similarFiles.length === 0) {
        return reply(`❌ Nessun file trovato corrispondente a: "${query}"`);
      }

      if (similarFiles.length === 1) {
        const file = similarFiles[0];
        const messaggio = `📄 *FILE TROVATO:* \`${file.name}\`\n📌 *Percorso:* \`${file.relativePath}\``;

        const buttons = [
          { buttonId: `${p}ottienifile${file.path}`, displayText: '📄 Scarica File' },
          { buttonId: `${p}fileplugin${file.path}`, displayText: '📜 Leggi Codice' }
        ];

        return await sendInteractiveButtons(sock, from, messaggio, buttons, msg);
      }

      let listaFile = [
        `🔍 *RICERCA FILE: "${query}"*`,
        '───────────────',
        `Trovati ${similarFiles.length} file simili. Seleziona una delle opzioni sottostanti:`
      ].join('\n');

      const buttons = similarFiles.map((file, index) => ({
        buttonId: `${p}selectfile${file.path}`,
        displayText: `${index + 1}️⃣ ${file.name.slice(0, 20)}`
      }));

      return await sendInteractiveButtons(sock, from, listaFile, buttons, msg);
    }

    if (cmd === 'selectfile') {
      const filePath = args.join(' ').trim();
      if (!filePath || !fs.existsSync(filePath)) {
        return reply('❌ File non trovato o percorso non valido.');
      }

      if (fs.statSync(filePath).isDirectory()) {
        return reply('❌ Impossibile selezionare una cartella.');
      }

      const fileName = path.basename(filePath);
      const messaggio = `📂 *FILE SELEZIONATO:* \`${fileName}\`\n📌 *Percorso:* \`${filePath}\``;

      const buttons = [
        { buttonId: `${p}ottienifile${filePath}`, displayText: '📄 Scarica File' },
        { buttonId: `${p}fileplugin${filePath}`, displayText: '📜 Leggi Codice' }
      ];

      return await sendInteractiveButtons(sock, from, messaggio, buttons, msg);
    }

    if (cmd === 'ottienifile') {
      const filePath = args.join(' ').trim();
      if (!filePath || !fs.existsSync(filePath)) {
        return reply('❌ Specifica un percorso file valido.');
      }

      if (fs.statSync(filePath).isDirectory()) {
        return reply('❌ Impossibile scaricare una cartella.');
      }

      try {
        const buffer = await _fs.readFile(filePath);
        const fileName = path.basename(filePath);

        return await sock.sendMessage(from, {
          document: buffer,
          fileName: fileName,
          mimetype: 'application/javascript'
        }, { quoted: msg });
      } catch (err) {
        return reply(`❌ Errore durante l'invio del file: ${err.message}`);
      }
    }

    if (cmd === 'fileplugin') {
      const pathFile = args.join(' ').trim();
      if (!pathFile || !fs.existsSync(pathFile)) {
        return reply('❌ Specifica un percorso file valido.');
      }

      if (fs.statSync(pathFile).isDirectory()) {
        return reply('❌ Impossibile visualizzare una cartella.');
      }

      try {
        const fileName = path.basename(pathFile);
        const fileContent = await _fs.readFile(pathFile, 'utf8');
        const syntaxCheck = await checkSyntax(pathFile);
        const syntaxLine = syntaxCheck.valid
          ? '✅ Sintassi corretta'
          : `❌ Sintassi non valida: ${syntaxCheck.error.split('\n')[0]}`;

        const chunkSize = 3500;
        const chunks = [];
        for (let i = 0; i < fileContent.length; i += chunkSize) {
          chunks.push(fileContent.slice(i, i + chunkSize));
        }

        for (let i = 0; i < chunks.length; i++) {
          const header = chunks.length > 1
            ? `📜 *${fileName}* — parte${i + 1}/${chunks.length}\n${i === 0 ? `${syntaxLine}\n` : ''}\n`
            : `📜 *${fileName}*\n${syntaxLine}\n\n`;
          const codeSnippet = `${header}\`\`\`javascript\n${chunks[i]}\n\`\`\``;

          await sock.sendMessage(from, { text: codeSnippet }, { quoted: msg });

          if (i < chunks.length - 1) {
            await new Promise((resolve) => setTimeout(resolve, 350));
          }
        }

        return;
      } catch (err) {
        return reply(`❌ Errore di lettura file: ${err.message}`);
      }
    }

    if (['saveplugin', 'addplugin', 'addpl', 'savepl'].includes(cmd)) {
      const rawName = args[0];
      if (!rawName) {
        return reply([
          '❌ Specifica il nome del plugin.',
          '',
          `> *Uso:* Rispondi al messaggio contenente il codice con \`${p}${cmd} <nome_file>\``,
          `> *Esempio:* Rispondi al codice con \`${p}${cmd} test\``
        ].join('\n'));
      }

      const safeName = cleanFilename(rawName);
      if (!safeName) {
        return reply('❌ Nome file non valido. Usa solo lettere, numeri, trattini e underscore.');
      }

      const code = extractCode(msg, args);
      if (!code) {
        return reply('❌ Rispondi al messaggio contenente il codice o inseriscilo dopo il comando.');
      }

      const filePath = path.join(pluginsDir, `${safeName}.js`);
      const linesCount = code.split('\n').length;
      const sizeStr = formatBytes(Buffer.byteLength(code, 'utf-8'));

      try {
        fs.writeFileSync(filePath, code, 'utf-8');
        const syntaxCheck = await checkSyntax(filePath);

        const text = [
          '✅ *PLUGIN SALVATO*',
          '───────────────',
          `> *File:* \`${safeName}.js\``,
          `> *Dimensione:* ${sizeStr} (${linesCount} righe)`,
          '',
          syntaxCheck.valid
            ? '✅ *Sintassi:* corretta'
            : `❌ *Sintassi non valida:*\n\`\`\`${syntaxCheck.error}\`\`\`\n_Il file è stato salvato comunque, ma non verrà ricaricato finché non correggi l'errore._`
        ].join('\n');

        await reply(text);
        if (!syntaxCheck.valid) return;
        return await triggerHotReload(sock, from, msg, safeName);
      } catch (err) {
        return reply(`❌ Errore durante la scrittura del file: ${err.message}`);
      }
    }

    if (['dp', 'delplugin', 'rmplugin', 'deleteplugin'].includes(cmd)) {
      const rawName = args[0];
      if (!rawName) {
        return reply(`❌ Specifica il plugin da eliminare.\n\n> *Uso:* \`${p}delplugin <nome>\``);
      }

      const safeName = cleanFilename(rawName);
      const filePath = path.join(pluginsDir, `${safeName}.js`);

      if (fs.existsSync(filePath)) {
        try {
          fs.unlinkSync(filePath);

          const text = [
            '✅ *PLUGIN ELIMINATO*',
            '───────────────',
            `> *File rimosso:* \`${safeName}.js\``
          ].join('\n');

          await reply(text);
          return await triggerHotReload(sock, from, msg, safeName);
        } catch (err) {
          return reply(`❌ Errore durante l'eliminazione: ${err.message}`);
        }
      } else {
        return reply(`❌ Il plugin \`${safeName}\` non esiste.`);
      }
    }

    if (['editpl', 'editplugin'].includes(cmd)) {
      const rawName = args[0];
      if (!rawName) {
        return reply([
          '❌ Specifica il nome del plugin da modificare.',
          '',
          `> *Uso:* Rispondi al nuovo codice con \`${p}editpl <nome_plugin>\``,
          `> *Esempio:* Rispondi al nuovo codice con \`${p}editpl slot\``
        ].join('\n'));
      }

      const safeName = cleanFilename(rawName);
      const filePath = path.join(pluginsDir, `${safeName}.js`);
      const newCode = extractCode(msg, args);

      if (!fs.existsSync(filePath)) {
        return reply(`❌ Il plugin \`${safeName}\` non esiste.`);
      }

      if (!newCode) {
        return reply('❌ Rispondi al messaggio contenente il codice aggiornato.');
      }

      try {
        const linesCount = newCode.split('\n').length;
        const sizeStr = formatBytes(Buffer.byteLength(newCode, 'utf-8'));

        fs.writeFileSync(filePath, newCode, 'utf-8');
        const syntaxCheck = await checkSyntax(filePath);

        const text = [
          '✅ *PLUGIN MODIFICATO*',
          '───────────────',
          `> *File:* \`${safeName}.js\``,
          `> *Nuova dimensione:* ${sizeStr} (${linesCount} righe)`,
          '',
          syntaxCheck.valid
            ? '✅ *Sintassi:* corretta'
            : `❌ *Sintassi non valida:*\n\`\`\`${syntaxCheck.error}\`\`\`\n_Il file è stato salvato comunque, ma non verrà ricaricato finché non correggi l'errore._`
        ].join('\n');

        await reply(text);
        if (!syntaxCheck.valid) return;
        return await triggerHotReload(sock, from, msg, safeName);
      } catch (err) {
        return reply(`❌ Errore durante la modifica del file: ${err.message}`);
      }
    }
  },

  async onMessage({ sock, msg, from, sender, prefix }) {
    if (!checkIsOwner(sender, msg, sock)) return false;

    let selectedId = '';
    const m = msg.message;

    const interactive = m?.interactiveResponseMessage;
    if (interactive?.nativeFlowResponseMessage?.paramsJson) {
      try {
        const params = JSON.parse(interactive.nativeFlowResponseMessage.paramsJson);
        if (params.id) selectedId = params.id;
      } catch {}
    }

    if (!selectedId) {
      selectedId = m?.buttonsResponseMessage?.selectedButtonId
        || m?.templateButtonReplyMessage?.selectedId
        || m?.listResponseMessage?.singleSelectReply?.selectedRowId
        || '';
    }

    if (!selectedId) return false;

    const p = prefix || '.';
    if (selectedId.startsWith(p)) {
      const cleanId = selectedId.slice(p.length).trim();
      const parts = cleanId.split(/\s+/);
      const triggerCmd = parts[0]?.toLowerCase();

      if ([
        'saveplugin', 'addplugin', 'addpl', 'savepl', 'dp', 'delplugin', 'rmplugin', 'deleteplugin',
        'getplugin', 'getfile', 'gp', 'gf', 'ottienifile', 'fileplugin', 'selectfile',
        'editpl', 'editplugin', 'listplugins', 'plugins', 'lsp'
      ].includes(triggerCmd)) {
        await this.run({
          sock,
          msg,
          from,
          sender,
          prefix: p,
          command: triggerCmd,
          args: parts.slice(1),
          sendText: (text) => sock.sendMessage(from, { text }, { quoted: msg })
        });
        return true;
      }
    }
    return false;
  }
};