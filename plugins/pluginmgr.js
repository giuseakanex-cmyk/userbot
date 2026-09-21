import fs from 'fs/promises';
import path from 'path';
import { downloadContentFromMessage } from '@chatunity/baileys';
import { loadPlugins } from '../index.js';

export default {
  name: 'plugin',
  aliases: ['reload', 'addplugin', 'editplugin', 'delplugin', 'listplugins', 'saveplugin', 'getplugin', 'viewplugin'],
  description: 'Gestisce i plugin del bot (crea, modifica, legge, elimina, ricarica)',

  async run({ msg, command, args, sendText }) {
    const pluginsDir = path.join(process.cwd(), 'plugins');

    if (command === 'reload') {
      await loadPlugins();
      return sendText('🔄 *Tutti i plugin sono stati ricaricati con successo!*');
    }

    if (command === 'listplugins' || (command === 'plugin' && args[0] === 'list')) {
      let list = '🧩 *PLUGIN INSTALLATI:*\n\n';
      for (const [name, plugin] of global.plugins) {
        list += `• *${name}* (${plugin.aliases?.join(', ') \vert{}\vert{} 'nessun alias'})\n  └ ${plugin.description || 'Nessuna descrizione'}\n`;
      }
      return sendText(list);
    }

    if (command === 'getplugin' || command === 'viewplugin' || (command === 'plugin' && args[0] === 'get')) {
      const pluginName = (command === 'getplugin' || command === 'viewplugin') ? args[0] : args[1];
      if (!pluginName) return sendText('⚠️ Specifica il nome del plugin da leggere.\nEsempio: *.getplugin test*');

      const fileName = pluginName.endsWith('.js') ? pluginName : `${pluginName}.js`;
      const filePath = path.join(pluginsDir, fileName);

      try {
        const fileContent = await fs.readFile(filePath, 'utf-8');
        return sendText(`📄 *CODICE DI ${fileName}:*\n\n\`\`\`javascript\n${fileContent}\n\`\`\``);
      } catch (err) {
        return sendText(`❌ Impossibile trovare il plugin *${fileName}*.`);
      }
    }

    if (command === 'delplugin' || (command === 'plugin' && args[0] === 'del')) {
      const pluginName = command === 'delplugin' ? args[0] : args[1];
      if (!pluginName) return sendText('⚠️ Specifica il nome del plugin da eliminare.\nEsempio: *.delplugin test*');

      const filePath = path.join(pluginsDir, `${pluginName.replace('.js', '')}.js`);
      try {
        await fs.unlink(filePath);
        await loadPlugins();
        return sendText(`🗑️ Plugin *${pluginName}* eliminato e bot ricaricato.`);
      } catch (err) {
        return sendText(`❌ Impossibile trovare o eliminare il plugin *${pluginName}*.`);
      }
    }

    if (
      command === 'addplugin' ||
      command === 'editplugin' ||
      command === 'saveplugin' ||
      (command === 'plugin' && (args[0] === 'add' || args[0] === 'edit' || args[0] === 'save'))
    ) {
      const offset = (command === 'addplugin' || command === 'editplugin' || command === 'saveplugin') ? 0 : 1;
      const pluginName = args[offset];

      if (!pluginName) {
        return sendText('⚠️ Specifica il nome del plugin.\nEsempio: rispondi a un messaggio/file con *.editplugin nomeplugin*');
      }

      let code = '';
      const quotedMsg = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;

      if (quotedMsg) {
        if (quotedMsg.conversation) {
          code = quotedMsg.conversation;
        } else if (quotedMsg.extendedTextMessage?.text) {
          code = quotedMsg.extendedTextMessage.text;
        } else if (quotedMsg.documentMessage) {
          try {
            const stream = await downloadContentFromMessage(quotedMsg.documentMessage, 'document');
            let buffer = Buffer.from([]);
            for await (const chunk of stream) {
              buffer = Buffer.concat([buffer, chunk]);
            }
            code = buffer.toString('utf-8');
          } catch (e) {
            return sendText('❌ Errore nel caricamento del file allegato.');
          }
        }
      }

      if (!code) {
        code = args.slice(offset + 1).join(' ');
      }

      if (!code.trim()) {
        return sendText('⚠️ Nessun codice trovato. Rispondi a un messaggio di testo/file con il comando oppure inserisci il codice di seguito.');
      }

      const fileName = pluginName.endsWith('.js') ? pluginName : `${pluginName}.js`;
      const filePath = path.join(pluginsDir, fileName);

      try {
        await fs.writeFile(filePath, code, 'utf-8');
        await loadPlugins();
        return sendText(`✅ Plugin *${fileName}* salvato/aggiornato e ricaricato con successo!`);
      } catch (err) {
        return sendText(`❌ Errore nel salvataggio del plugin: ${err.message}`);
      }
    }

    return sendText(
      '⚙️ *PLUGIN MANAGER*\n\n' +
      '• *.reload* -> Ricarica tutti i plugin\n' +
      '• *.listplugins* -> Lista dei plugin attivi\n' +
      '• *.getplugin <nome>* -> Mostra il codice sorgente di un plugin\n' +
      '• *.editplugin <nome>* (rispondendo a testo/file) -> Modifica un plugin\n' +
      '• *.addplugin <nome>* -> Crea un nuovo plugin\n' +
      '• *.delplugin <nome>* -> Elimina un plugin'
    );
  }
};