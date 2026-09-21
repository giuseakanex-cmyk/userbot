import Baileys, { useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion, Browsers } from '@chatunity/baileys';
import pino from 'pino';
import qrcode from 'qrcode-terminal';
import chalk from 'chalk';
import fs from 'fs/promises';
import { watch } from 'fs';
import path from 'path';
import readline from 'readline';

const makeWASocket = typeof Baileys === 'function' ? Baileys : (Baileys.default || Baileys.makeWASocket);

const PREFIX = '.';
global.plugins = new Map();
global.antiPaymentActive = true;

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const question = (text) => new Promise((resolve) => rl.question(text, resolve));
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function showStartupAnimation() {
  console.clear();

  const asciiArt = [
    "  ██╗   ██╗███████╗███████╗██████╗     ██████╗  ██████╗ ████████╗",
    "  ██║   ██║██╔════╝██╔════╝██╔══██╗    ██╔══██╗██╔═══██╗╚══██╔══╝",
    "  ██║   ██║███████╗█████╗  ██████╔╝    ██████╔╝██║   ██║   ██║   ",
    "  ██║   ██║╚════██║██╔══╝  ██╔══██╗    ██╔══██╗██║   ██║   ██║   ",
    "  ╚██████╔╝███████║███████╗██║  ██║    ██████╔╝╚██████╔╝   ██║   ",
    "   ╚═════╝ ╚══════╝╚══════╝╚═╝  ╚═╝    ╚═════╝  ╚═════╝    ╚═╝   "
  ];

  const colors = [
    chalk.bold.red,
    chalk.bold.magenta,
    chalk.bold.cyan,
    chalk.bold.blue,
    chalk.bold.green,
    chalk.bold.yellow,
    chalk.bold.white
  ];

  for (let frame = 0; frame < 15; frame++) {
    console.clear();
    const color = colors[frame % colors.length];
    const subColor = colors[(frame + 3) % colors.length];

    console.log('\n' + color(asciiArt.join('\n')));
    console.log(subColor('\n        ⚡ [ SYSTEM INITIALIZING - USER BOT ON TOP ] ⚡\n'));
    await sleep(60);
  }

  console.clear();

  const lineGradients = [
    chalk.bold.red,
    chalk.bold.magenta,
    chalk.bold.cyan,
    chalk.bold.blue,
    chalk.bold.green,
    chalk.bold.yellow
  ];

  asciiArt.forEach((line, index) => {
    console.log(lineGradients[index % lineGradients.length](line));
  });

  console.log('\n');
  const creditText = "      ✦ ─── [ Pensato e Codificato by Gius ] ─── ✦      ";

  process.stdout.write('  ');
  for (let char of creditText) {
    process.stdout.write(chalk.bold.cyan(char));
    await sleep(15);
  }
  console.log('\n\n');

  const steps = [
    'Caricamento Core System...',
    'Inizializzazione Moduli Plugin...',
    'Sincronizzazione Protocollo WhatsApp...',
    'Verifica Cifratura Socket Chrome...'
  ];

  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    const totalBlocks = 20;

    for (let progress = 1; progress <= totalBlocks; progress++) {
      const filled = '█'.repeat(progress);
      const empty = '░'.repeat(totalBlocks - progress);
      const percent = Math.floor((progress / totalBlocks) * 100);

      const barColor = percent < 40 ? chalk.bold.red : (percent < 80 ? chalk.bold.yellow : chalk.bold.green);

      process.stdout.write(
        `\r  ${chalk.bold.magenta('⚡')} ${chalk.bold.white(step.padEnd(38))} [${barColor(filled)}${chalk.gray(empty)}] ${chalk.bold.cyan(percent + '%')}`
      );
      await sleep(10);
    }
    console.log(` ${chalk.bold.green('✔')}`);
  }

  console.log('\n' + chalk.bold.magenta('  ══════════════════════════════════════════════════════════════') + '\n');
  await sleep(200);
}

export async function loadPlugins() {
  global.plugins.clear();
  try {
    const pluginsDir = path.join(process.cwd(), 'plugins');
    const files = await fs.readdir(pluginsDir);

    for (const file of files.filter(f => f.endsWith('.js'))) {
      try {
        const fileUrl = `./plugins/${file}?v=${Date.now()}`;
        const pluginModule = await import(fileUrl);
        const plugin = pluginModule.default;

        if (plugin && plugin.name) {
          global.plugins.set(plugin.name, plugin);
        }
      } catch (err) {
        console.error(chalk.red(`[PLUGIN ERROR] Impossibile caricare ${file}:`), err.message);
      }
    }
    console.log(chalk.bold.green(`[PLUGINS] Caricati ${global.plugins.size} plugin con successo.`));
  } catch (err) {
    console.error(chalk.red('[PLUGINS ERROR] Errore lettura cartella plugins:'), err);
  }
}


let watchTimeout = null;
function watchPlugins() {
  const pluginsDir = path.join(process.cwd(), 'plugins');
  try {
    watch(pluginsDir, (eventType, filename) => {
      if (filename && filename.endsWith('.js')) {
        if (watchTimeout) clearTimeout(watchTimeout);
        watchTimeout = setTimeout(async () => {
          console.log(chalk.bold.yellow(`\n🔄 [HOT-RELOAD] Rilevata modifica in "${filename}". Ricaricamento plugin in corso...`));
          await loadPlugins();
        }, 300);
      }
    });
    console.log(chalk.bold.cyan('[HOT-RELOAD] Watcher attivo sulla cartella plugins/'));
  } catch (err) {
    console.error(chalk.red('[HOT-RELOAD ERROR] Impossibile avviare il watcher:'), err.message);
  }
}

async function startBot() {
  await showStartupAnimation();
  await loadPlugins();
  watchPlugins(); 

  const { state, saveCreds } = await useMultiFileAuthState('./session_auth');

  let waVersion;
  try {
    const getVersion = fetchLatestBaileysVersion || Baileys.fetchLatestBaileysVersion;
    if (getVersion) {
      const { version } = await getVersion();
      waVersion = version;
    }
  } catch (e) {
    waVersion = undefined;
  }

  let phoneNumber = '';
  let usePairingCode = false;

  if (!state.creds.registered) {
    console.log(chalk.bold.cyan('📲 Seleziona il metodo di accesso:'));
    console.log(chalk.bold.yellow('1. Codice di Accoppiamento (Numero di Telefono)'));
    console.log(chalk.bold.yellow('2. QR Code tradizionale\n'));

    const choice = await question(chalk.bold.white('Inserisci 1 o 2: '));

    if (choice.trim() === '1') {
      usePairingCode = true;
      phoneNumber = await question(chalk.bold.yellow('\n📲 Inserisci il tuo numero con prefisso senza + (es. 393331234567): '));
      phoneNumber = phoneNumber.replace(/[^0-9]/g, '');
    }
  }

  const browserConfig = (Browsers || Baileys.Browsers) ? (Browsers || Baileys.Browsers).ubuntu('Chrome') : ['Ubuntu', 'Chrome', '20.0.04'];

  const sock = makeWASocket({
    ...(waVersion ? { version: waVersion } : {}),
    logger: pino({ level: 'silent' }),
    auth: state,
    printQRInTerminal: false,
    browser: browserConfig,
    syncFullHistory: false,
    markOnlineOnConnect: true
  });

  sock.ev.on('creds.update', saveCreds);

  let pairingCodeRequested = false;

  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr && usePairingCode && !sock.authState.creds.registered && !pairingCodeRequested) {
      pairingCodeRequested = true;
      try {
        await sleep(1000);
        const code = await sock.requestPairingCode(phoneNumber);
        const formattedCode = code?.match(/.{1,4}/g)?.join('-') || code;

        console.log(chalk.bold.magenta('\n╔══════════════════════════════════════════════════════════════╗'));
        console.log(chalk.bold.green(`║  🔑 CODICE DI ACCOPPIAMENTO:  ${chalk.bold.yellow(formattedCode)}                  ║`));
        console.log(chalk.bold.cyan('║  Apri WhatsApp > Dispositivi Collegati > Collega dispositivo ║'));
        console.log(chalk.bold.cyan('║  Seleziona "Collega con numero di telefono" e inserisci code. ║'));
        console.log(chalk.bold.magenta('╚══════════════════════════════════════════════════════════════╝\n'));
      } catch (err) {
        console.error(chalk.bold.red('❌ Errore durante la richiesta del codice:'), err.message);
        pairingCodeRequested = false;
      }
    } else if (qr && !usePairingCode && !sock.authState.creds.registered) {
      console.log(chalk.bold.magenta('\n╔══════════════════════════════════════════════════════════════╗'));
      console.log(chalk.bold.cyan('║         📲 SCANSIONA IL QR CODE CON IL TUO WHATSAPP        ║'));
      console.log(chalk.bold.magenta('╚══════════════════════════════════════════════════════════════╝\n'));
      qrcode.generate(qr, { small: true });
    }

    if (connection === 'close') {
      const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
      if (shouldReconnect) {
        console.log(chalk.bold.red('⚠️ Connessione persa, riconnessione in corso...'));
        startBot();
      } else {
        console.log(chalk.bold.red('❌ Sessione terminata. Elimina la cartella "session_auth" e riavvia.'));
      }
    } else if (connection === 'open') {
      console.log(chalk.bold.green('──────────────────────────────────────────────────────────────'));
      console.log(chalk.bold.green('  ✅ USER BOT CONNESSO E ATTIVO - OWNER ACCESS ONLY!'));
      console.log(chalk.bold.magenta('  👑 Pensato e Codificato by Gius'));
      console.log(chalk.bold.green('──────────────────────────────────────────────────────────────\n'));
    }
  });

  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return;

    for (const msg of messages) {
      if (!msg.message) continue;

      const from = msg.key.remoteJid;
      const isFromMe = msg.key.fromMe;

      const isPaymentMsg = msg.message?.requestPaymentMessage || msg.message?.extendedTextMessage?.contextInfo?.quotedMessage?.requestPaymentMessage;
      if (isPaymentMsg && !isFromMe && global.antiPaymentActive) {
        console.log(chalk.bold.yellow(`[ANTI-PAYMENT] Rilevato spam payment da un altro utente in ${from}`));
        await sock.sendMessage(from, { text: '⚠️ *Anti-Payment:* Rilevata e bloccata richiesta di pagamento da utente non autorizzato!' }, { quoted: msg });
        continue;
      }

      if (!isFromMe) continue;

      const messageContent =
        msg.message.conversation ||
        msg.message.extendedTextMessage?.text ||
        '';

      const trimContent = messageContent.trim();
      if (!trimContent) continue;

      let isPrefixed = false;
      let args = [];
      let command = '';

      if (trimContent.startsWith(PREFIX)) {
        isPrefixed = true;
        args = trimContent.slice(PREFIX.length).trim().split(/ +/);
        command = args.shift().toLowerCase();
      } else {
        args = trimContent.split(/ +/);
        command = args.shift().toLowerCase();
      }

      for (const [_, plugin] of global.plugins) {
        const validCommands = [plugin.name, ...(plugin.aliases || [])];

        if (validCommands.includes(command)) {
          if (!isPrefixed && !plugin.noPrefix) continue;

          console.log(chalk.bold.green(`[Owner Command] ${command} | Chat: ${from}`));

          const sendText = (text) => sock.sendMessage(from, { text }, { quoted: msg });

          try {
            await plugin.run({
              sock,
              msg,
              from,
              sender: sock.user.id,
              command,
              args,
              sendText
            });
          } catch (err) {
            console.error(chalk.red(`[ERRORE PLUGIN ${command}]:`), err);
            sendText(`❌ Errore durante l'esecuzione del comando: ${err.message}`);
          }
          break;
        }
      }
    }
  });
}

startBot();