global.lastFmUsername ||= '';
const API_KEY = '429dcd0712b774641ef660a56ed7f74c';

export default {
  name: 'cur',
  aliases: ['nowplaying', 'np', 'topalbum', 'topalbums', 'ta', 'setlastfm', 'lastfm'],
  noPrefix: true,
  description: 'Mostra il brano in riproduzione o i top album di Last.fm',

  async run({ sock, msg, from, command, args, sendText }) {
    const cmd = command.toLowerCase();

    if (cmd === 'setlastfm' || (cmd === 'lastfm' && args[0] === 'set')) {
      const username = cmd === 'setlastfm' ? args[0] : args[1];
      if (!username) {
        return sendText('⚠️ Specifica un username di Last.fm.\n\nEsempio: *setlastfm tuo_username*');
      }
      global.lastFmUsername = username;
      return sendText(`✅ Username Last.fm impostato su: *${username}*`);
    }

    const user = global.lastFmUsername || args[0];

    if (!user) {
      return sendText('⚠️ Nessun username Last.fm impostato.\n\nUsa prima: *setlastfm tuo_username* oppure scrivi *cur tuo_username*');
    }

    if (cmd === 'cur' || cmd === 'nowplaying' || cmd === 'np') {
      try {
        const url = `https://ws.audioscrobbler.com/2.0/?method=user.getrecenttracks&user=${encodeURIComponent(user)}&api_key=${API_KEY}&format=json&limit=1`;
        const res = await fetch(url);
        const data = await res.json();

        if (data.error || !data.recenttracks || !data.recenttracks.track.length) {
          return sendText(`❌ Impossibile recuperare i dati per l'utente Last.fm: *${user}*`);
        }

        const track = data.recenttracks.track[0];
        const trackName = track.name || 'Sconosciuto';
        const artistName = track.artist?.['#text'] || 'Sconosciuto';
        const albumName = track.album?.['#text'] || 'Singolo / Nessun Album';
        const isPlaying = track['@attr']?.nowplaying === 'true';

        let coverUrl = '';
        if (Array.isArray(track.image)) {
          const largeImg = track.image.find(i => i.size === 'extralarge') || track.image.find(i => i.size === 'large') || track.image[track.image.length - 1];
          if (largeImg && largeImg['#text'] && largeImg['#text'].startsWith('http')) {
            coverUrl = largeImg['#text'];
          }
        }

        const statusStr = isPlaying ? '🟢 In riproduzione...' : '🔴 Ultimo ascolto';

        const cardText = 
          `╭─────────── 𝄢 ───────────╮\n` +
          `│  🎧  𝐍𝐎𝐖 𝐏𝐋𝐀𝐘𝐈𝐍𝐆  🎧\n` +
          `├─────────────────────────┤\n` +
          `│ 🎵 𝐓𝐫𝐚𝐜𝐤  : ${trackName}\n` +
          `│ 👤 𝐀𝐫𝐭𝐢𝐬𝐭 : ${artistName}\n` +
          `│ 💿 𝐀𝐥𝐛𝐮𝐦 : ${albumName}\n` +
          `├─────────────────────────┤\n` +
          `│ 📡 𝐒𝐭𝐚𝐭𝐮𝐬 : ${statusStr}\n` +
          `│ 👤 𝐔𝐬𝐞𝐫   : ${user}\n` +
          `╰─────────────────────────╯`;

        if (coverUrl) {
          return await sock.sendMessage(from, {
            image: { url: coverUrl },
            caption: cardText
          }, { quoted: msg });
        } else {
          return await sendText(cardText);
        }
      } catch (err) {
        return sendText(`❌ Errore durante il recupero del brano: ${err.message}`);
      }
    }

    if (cmd === 'topalbum' || cmd === 'topalbums' || cmd === 'ta') {
      try {
        const period = args[0] || '7day';
        const url = `https://ws.audioscrobbler.com/2.0/?method=user.gettopalbums&user=${encodeURIComponent(user)}&api_key=${API_KEY}&format=json&limit=5&period=${period}`;
        const res = await fetch(url);
        const data = await res.json();

        if (data.error || !data.topalbums || !data.topalbums.album) {
          return sendText(`❌ Impossibile recuperare i top album per l'utente: *${user}*`);
        }

        const albums = data.topalbums.album;
        if (!albums.length) {
          return sendText(`⚠️ Nessun album trovato per l'utente *${user}*.`);
        }

        const numbers = ['1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣'];
        let albumListStr = '';

        albums.forEach((alb, idx) => {
          const num = numbers[idx] || `${idx + 1}.`;
          const aName = alb.name || 'Sconosciuto';
          const artist = alb.artist?.name || 'Sconosciuto';
          const plays = alb.playcount || '0';
          albumListStr += `│ ${num} ${aName}\n│    └ 👤 ${artist} • 🎧 ${plays} ascolti\n`;
          if (idx < albums.length - 1) albumListStr += `│\n`;
        });

        const cardText = 
          `╭─────────── 𝄢 ───────────╮\n` +
          `│  💿  𝐓𝐎𝐏 𝐀𝐋𝐁𝐔𝐌𝐒  💿\n` +
          `├─────────────────────────┤\n` +
          albumListStr +
          `├─────────────────────────┤\n` +
          `│ 👤 𝐔𝐬𝐞𝐫   : ${user}\n` +
          `╰─────────────────────────╯`;

        return await sendText(cardText);
      } catch (err) {
        return sendText(`❌ Errore durante il recupero dei top album: ${err.message}`);
      }
    }
  }
};