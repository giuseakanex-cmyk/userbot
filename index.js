import Baileys, { useMultiFileAuthState, DisconnectReason } from '@chatunity/baileys';
import pino from 'pino';
import qrcode from 'qrcode-terminal';
import chalk from 'chalk';
import paymentPlugin from './plugins/payment.js';

const makeWASocket = typeof Baileys === 'function' ? Baileys : (Baileys.default || Baileys.makeWASocket);

const PREFIX = '.';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function showStartupAnimation() {
  console.clear();

  const asciiArt = `
██╗   ██╗███████╗███████╗██████╗     ███████╗██████╗  █████╗ ███╗   ███╗    ██████╗ ██████╗ ████████╗
██║   ██║██╔════╝██╔════╝██╔══██╗    ██╔════╝██╔══██╗██╔══██╗████╗ ████║    ██╔══██╗██║  ██║╚══██╔══╝
██║   ██║███████╗█████╗  ██████╔╝    ███████╗██████╔╝███████║██╔████╔██║    ██████╔╝██║  ██║   ██║   
██║   ██║╚════██║██╔══╝  ██╔══██╗    ╚════██║██╔═══╝ ██╔══██║██║╚██╔╝██║    ██╔══██╗██║  ██║   ██║   
╚██████╔╝███████║███████╗██║  ██║    ███████║██║     ██║  ██║██║ ╚═╝ ██║    ██████╔╝██████╔╝   ██║   
 ╚═════╝ ╚══════╝╚══════╝╚═╝  ╚═╝    ╚══════╝╚═╝     ╚═╝  ╚═╝╚═╝     ╚═╝    ╚═════╝ ╚═════╝    ╚═╝   
  `;

  const colors = [chalk.red, chalk.magenta, chalk.cyan, chalk.blue, chalk.green, chalk.yellow];

  for (let i = 0; i < 6; i++) {
    console.clear();
    console.log(colors[i % colors.length](asciiArt));
    console.log(chalk.bold.yellow('              ⚡ INITIALIZING USER SPAM BOT... ⚡\n'));
    await sleep(120);
  }

  console.clear();
  console.log(chalk.bold.cyan(asciiArt));

  const subTitle = "              >>> il tuo user bot di fiducia <<<              ";
  process.stdout.write(chalk.bold.magenta('\n'));
  for (let char of subTitle) {
    process.stdout.write(chalk.bold.magenta(char));
    await sleep(25);
  }
  console.log('\n\n');

  const steps = [
    'Inizializzazione moduli di rete...',
    'Caricamento libreria libuser...',
    'Integrazione plugin di spam...',
    'Generazione interfaccia QR Code...'
  ];

  for (const step of steps) {
    let dots = '';
    for (let i = 0; i < 3; i++) {
      dots += '.';
      process.stdout.write(`\r${chalk.yellow('⚡')} ${chalk.bold.white(step)} ${chalk.cyan(dots)}   `);
      await sleep(100);
    }
    console.log(` ${chalk.bold.green('✔')}`);
  }

  console.log('\n');
  await sleep(250);
}

async function startBot() {
  await showStartupAnimation();

  const { state, saveCreds } = await useMultiFileAuthState('./session_auth');

  const sock = makeWASocket({
    logger: pino({ level: 'silent' }),
    auth: state,
    printQRInTerminal: false
  });

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      console.log(chalk.bold.magenta('╔══════════════════════════════════════════════════════════════╗'));
      console.log(chalk.bold.cyan('║         📲 SCANSIONA IL QR CODE CON IL TUO WHATSAPP        ║'));
      console.log(chalk.bold.magenta('╚══════════════════════════════════════════════════════════════╝\n'));

      qrcode.generate(qr, { small: true });

      console.log(chalk.bold.yellow('\n[!] In attesa di scansione QR Code...\n'));
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
      console.log(chalk.bold.green('  ✅ USER SPAM BOT CONNESSO E PRONTO ALL\'USO!'));
      console.log(chalk.bold.magenta('  👑 il tuo user bot di fiducia'));
      console.log(chalk.bold.green('──────────────────────────────────────────────────────────────\n'));
    }
  });

  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return;

    for (const msg of messages) {
      if (!msg.message || msg.key.fromMe) continue;

      const from = msg.key.remoteJid;
      const sender = msg.key.participant || from;

      const messageContent =
        msg.message.conversation ||
        msg.message.extendedTextMessage?.text ||
        '';

      if (!messageContent.startsWith(PREFIX)) continue;

      const args = messageContent.slice(PREFIX.length).trim().split(/ +/);
      const command = args.shift().toLowerCase();

      const validCommands = [paymentPlugin.name, ...(paymentPlugin.aliases || [])];

      if (validCommands.includes(command)) {
        console.log(chalk.bold.green(`[Esecuzione] ${command} | Mittente: ${sender.split('@')[0]} | Chat: ${from}`));

        const sendText = (text) => sock.sendMessage(from, { text }, { quoted: msg });

        await paymentPlugin.run({
          sock,
          msg,
          from,
          sender,
          command,
          args,
          sendText
        });
      }
    }
  });
}

startBot();
