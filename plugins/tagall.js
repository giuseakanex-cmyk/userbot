import { cleanJid } from '../lib/libuser.js';

export default {
  name: 'tagall',
  aliases: ['hidetag', 'tag'],
  description: 'Tagga tutti i membri con testo sopra e 5 emoji casuali sotto',

  async run({ sock, from, args, sendText }) {
    if (!from.endsWith('@g.us')) {
      return sendText('Questo comando si può usare solo nei gruppi.');
    }

    const text = args.join(' ');
    if (!text) {
      return sendText('⚠️ Specifica un testo per il tagall.\n\nEsempio: *.tagall ciao*');
    }

    const groupMetadata = await sock.groupMetadata(from);
    const participants = groupMetadata.participants.map(p => cleanJid(p.id));

    const emojiPool = [
      '👑', '⚡', '🔥', '💎', '🎯', '🚀', '💣', '🌟', '✦', '💫',
      '🎲', '💥', '🌀', '🔮', '✨', '🪐', '🩸', '👾', '🎭', '🧿',
      '☠️', '🖤', '👻', '⚔️', '🛡️', '🗡️', '⛓️', '🪦', '🦅', '🦁',
      '🐺', '🐉', '☣️', '⚠️', '🚨', '🔴', '⭐', '🌌', '👺', '🌀'
    ];

    const getRandomEmojis = (count) => {
      const shuffled = [...emojiPool].sort(() => 0.5 - Math.random());
      return shuffled.slice(0, count).join(' ');
    };

    const emojiLine = getRandomEmojis(5);
    const messageBody = `${text}\n\n${emojiLine}`;

    for (let i = 1; i <= 5; i++) {
      if (i === 1) {
        await sock.sendMessage(from, {
          text: messageBody,
          mentions: participants
        });
      } else {
        await sock.sendMessage(from, {
          text: messageBody
        });
      }
      await new Promise(resolve => setTimeout(resolve, 350));
    }
  }
};
