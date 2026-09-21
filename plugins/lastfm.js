import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execFile } from 'child_process';
import { promisify } from 'util';
import puppeteer from 'puppeteer';
import yts from 'yt-search';

const execFileAsync = promisify(execFile);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATA_FILE = path.join(__dirname, 'lastfm_users.json');

const API_KEY = process.env.LASTFM_API_KEY || global.lastfmApiKey || '2b5ad3cff5841ce372b93c32c314a463';

function readUsers() {
  try {
    if (fs.existsSync(DATA_FILE)) {
      return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    }
  } catch (err) {
    console.error('Errore lettura lastfm_users.json:', err);
  }
  return {};
}

function saveUser(userId, username) {
  try {
    const users = readUsers();
    users[userId] = username;
    fs.writeFileSync(DATA_FILE, JSON.stringify(users, null, 2), 'utf8');
  } catch (err) {
    console.error('Errore scrittura lastfm_users.json:', err);
  }
}

async function downloadMedia(query, format = 'mp3') {
  const search = await yts(query);
  const entry = search?.videos?.[0];
  if (!entry) throw new Error('Nessun video trovato su YouTube.');

  const source = entry.url;
  const tmpDir = path.join(__dirname, '..', 'tmp');
  if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });

  const token = Date.now().toString(36) + Math.random().toString(36).substring(2, 5);
  const outputPath = path.join(tmpDir, `${token}.${format}`);

  const cookiesPath = path.resolve('cookies.txt');
  const cookieArgs = fs.existsSync(cookiesPath) ? ['--cookies', cookiesPath] : [];

  const ytdlpArgs = [
    '--no-playlist',
    '--no-check-certificates',
    '--geo-bypass',
    ...cookieArgs,
    '--user-agent',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    '--referer',
    'https://www.youtube.com/'
  ];

  if (format === 'mp3') {
    ytdlpArgs.push('-x', '--audio-format', 'mp3', '--audio-quality', '0');
  } else if (format === 'mp4') {
    ytdlpArgs.push('-f', 'bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best');
  }

  ytdlpArgs.push(source, '-o', outputPath);

  await execFileAsync('yt-dlp', ytdlpArgs, { timeout: 180000 });

  if (!fs.existsSync(outputPath)) {
    throw new Error(`Errore durante la generazione del file ${format.toUpperCase()}`);
  }

  return {
    path: outputPath,
    title: entry.title,
    cleanup: () => {
      try { if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath); } catch {}
    }
  };
}

export default {
  name: 'cur',
  aliases: ['nowplaying', 'np', 'topalbum', 'topalbums', 'ta', 'setlastfm', 'lastfm', 'mp3', 'mp4'],
  noPrefix: true,
  description: 'Genera la card Last.fm o scarica il brano in MP3/MP4',

  async run({ sock, msg, from, sender, command, args, sendText }) {
    const cmd = command ? command.toLowerCase() : '';
    const userId = sender ? sender.split('@')[0].split(':')[0] : 'default';

    if (cmd === 'setlastfm' || (cmd === 'lastfm' && args[0] === 'set')) {
      const username = cmd === 'setlastfm' ? args[0] : args[1];
      if (!username) {
        return sendText('⚠️ Specifica un username di Last.fm.\n\nEsempio: *setlastfm tuo_username*');
      }
      
      saveUser(userId, username);
      return sendText(`✅ Username Last.fm salvato permanentemente per il tuo profilo: *${username}*`);
    }

    const savedUsers = readUsers();
    let user = savedUsers[userId];

    if (args[0] && !['mp3', 'mp4', 'set'].includes(args[0].toLowerCase())) {
      user = args[0];
    }

    if (!user) {
      return sendText('⚠️ Nessun username Last.fm impostato.\n\nUsa prima: *setlastfm tuo_username* oppure scrivi *cur tuo_username*');
    }

    const isMp3 = cmd === 'mp3' || args[0]?.toLowerCase() === 'mp3';
    const isMp4 = cmd === 'mp4' || args[0]?.toLowerCase() === 'mp4';

    if (isMp3 || isMp4) {
      try {
        await sendText(`🔎 Recupero ascolto corrente per *${user}* e ricerca audio/video...`);

        const recentUrl = `https://ws.audioscrobbler.com/2.0/?method=user.getrecenttracks&user=${encodeURIComponent(user)}&api_key=${API_KEY}&format=json&limit=1`;
        const recentRes = await fetch(recentUrl, { headers: { 'User-Agent': 'Mozilla/5.0' } });
        const recentData = await recentRes.json();

        if (recentData.error || !recentData.recenttracks?.track) {
          return sendText(`❌ Impossibile recuperare gli ascolti recenti per *${user}*.`);
        }

        let tracks = recentData.recenttracks.track;
        if (!Array.isArray(tracks)) tracks = [tracks];
        if (tracks.length === 0) return sendText(`❌ Nessun ascolto trovato per *${user}*.`);

        const track = tracks[0];
        const trackName = track.name || 'Sconosciuto';
        const artistName = track.artist?.['#text'] || track.artist?.name || 'Sconosciuto';
        const query = `${artistName} - ${trackName}`;

        const format = isMp4 ? 'mp4' : 'mp3';
        const media = await downloadMedia(query, format);

        if (isMp3) {
          await sock.sendMessage(from, {
            audio: { url: media.path },
            mimetype: 'audio/mpeg',
            fileName: `${artistName} - ${trackName}.mp3`,
            ptt: false
          }, { quoted: msg });
        } else {
          await sock.sendMessage(from, {
            video: { url: media.path },
            mimetype: 'video/mp4',
            caption: `🎥 *${artistName} - ${trackName}*`
          }, { quoted: msg });
        }

        media.cleanup();
        return;
      } catch (err) {
        console.error('Errore download media:', err);
        return sendText(`❌ Errore durante il download: ${err.message}`);
      }
    }

    if (['cur', 'nowplaying', 'np', 'lastfm'].includes(cmd)) {
      let browser;
      try {
        const recentUrl = `https://ws.audioscrobbler.com/2.0/?method=user.getrecenttracks&user=${encodeURIComponent(user)}&api_key=${API_KEY}&format=json&limit=1`;
        const recentRes = await fetch(recentUrl, {
          headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }
        });
        const recentData = await recentRes.json();

        if (recentData.error) {
          return sendText(`❌ Errore Last.fm per *${user}*: ${recentData.message || 'Utente non trovato'}`);
        }

        if (!recentData.recenttracks || !recentData.recenttracks.track) {
          return sendText(`❌ Impossibile recuperare i dati per l'utente: *${user}*`);
        }

        let tracks = recentData.recenttracks.track;
        if (!Array.isArray(tracks)) tracks = [tracks];
        if (tracks.length === 0) return sendText(`❌ Nessun ascolto recente trovato per l'utente: *${user}*`);

        const track = tracks[0];
        const trackName = track.name || 'Sconosciuto';
        const artistName = track.artist?.['#text'] || track.artist?.name || 'Sconosciuto';
        const albumName = track.album?.['#text'] || 'Singolo / N.D.';
        const isPlaying = track['@attr']?.nowplaying === 'true';

        let coverUrl = 'https://lastfm.freetls.fastly.net/i/u/300x300/2a96cbd8b46e442fc41c2b86b821562f.png';
        if (Array.isArray(track.image)) {
          const largeImg = track.image.find(i => i.size === 'extralarge') || track.image.find(i => i.size === 'large') || track.image[track.image.length - 1];
          if (largeImg && largeImg['#text'] && largeImg['#text'].startsWith('http')) {
            coverUrl = largeImg['#text'];
          }
        }

        let userPlaycount = '0';
        let globalPlaycount = '0';
        let listeners = '0';

        try {
          const infoUrl = `https://ws.audioscrobbler.com/2.0/?method=track.getInfo&track=${encodeURIComponent(trackName)}&artist=${encodeURIComponent(artistName)}&username=${encodeURIComponent(user)}&api_key=${API_KEY}&format=json`;
          const infoRes = await fetch(infoUrl, {
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }
          });
          const infoData = await infoRes.json();

          if (infoData.track) {
            userPlaycount = Number(infoData.track.userplaycount || 0).toLocaleString('it-IT');
            globalPlaycount = Number(infoData.track.playcount || 0).toLocaleString('it-IT');
            listeners = Number(infoData.track.listeners || 0).toLocaleString('it-IT');
          }
        } catch (e) {
          console.error('Errore recupero info estese track:', e);
        }

        const statusText = isPlaying ? 'In Riproduzione' : 'Ultimo Ascolto';

        const htmlContent = `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <style>
            @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;600;700;800&display=swap');
            
            * {
              box-sizing: border-box;
              margin: 0;
              padding: 0;
              font-family: 'Plus Jakarta Sans', -apple-system, sans-serif;
            }

            body {
              width: 1000px;
              height: 560px;
              display: flex;
              align-items: center;
              justify-content: center;
              position: relative;
              overflow: hidden;
              background: #09090b;
            }

            .bg-blur {
              position: absolute;
              top: -10%;
              left: -10%;
              width: 120%;
              height: 120%;
              background-image: url('${coverUrl}');
              background-size: cover;
              background-position: center;
              filter: blur(70px) brightness(0.35) saturate(1.4);
            }

            .card {
              position: relative;
              z-index: 2;
              width: 920px;
              height: 480px;
              background: rgba(18, 18, 22, 0.65);
              backdrop-filter: blur(30px);
              -webkit-backdrop-filter: blur(30px);
              border: 1px solid rgba(255, 255, 255, 0.12);
              border-radius: 32px;
              padding: 32px;
              display: flex;
              gap: 36px;
              box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.7);
            }

            .left-container {
              display: flex;
              flex-direction: column;
              align-items: center;
              gap: 16px;
              flex-shrink: 0;
            }

            .cover-wrapper {
              position: relative;
              width: 320px;
              height: 320px;
              border-radius: 24px;
              overflow: hidden;
              box-shadow: 0 16px 32px rgba(0, 0, 0, 0.5);
              border: 1px solid rgba(255, 255, 255, 0.15);
            }

            .cover {
              width: 100%;
              height: 100%;
              object-fit: cover;
            }

            .status-badge {
              display: inline-flex;
              align-items: center;
              gap: 8px;
              padding: 8px 16px;
              background: rgba(255, 255, 255, 0.08);
              border: 1px solid rgba(255, 255, 255, 0.15);
              border-radius: 100px;
              backdrop-filter: blur(10px);
            }

            .status-dot {
              width: 8px;
              height: 8px;
              background-color: ${isPlaying ? '#22c55e' : '#a1a1aa'};
              border-radius: 50%;
              box-shadow: ${isPlaying ? '0 0 10px #22c55e' : 'none'};
            }

            .status-text {
              color: #f4f4f5;
              font-size: 13px;
              font-weight: 700;
              letter-spacing: 0.5px;
            }

            .right-container {
              flex: 1;
              display: flex;
              flex-direction: column;
              justify-content: space-between;
            }

            .header-info {
              display: flex;
              flex-direction: column;
              gap: 6px;
            }

            .user-tag {
              font-size: 14px;
              font-weight: 700;
              color: #38bdf8;
              letter-spacing: 0.5px;
              text-transform: uppercase;
            }

            .track-title {
              color: #ffffff;
              font-size: 34px;
              font-weight: 800;
              line-height: 1.2;
              display: -webkit-box;
              -webkit-line-clamp: 2;
              -webkit-box-orient: vertical;
              overflow: hidden;
            }

            .artist-name {
              color: #e4e4e7;
              font-size: 22px;
              font-weight: 600;
            }

            .album-name {
              color: #a1a1aa;
              font-size: 15px;
              font-weight: 500;
            }

            .stats-grid {
              display: grid;
              grid-template-columns: 1fr 1fr;
              gap: 12px;
            }

            .stat-card {
              background: rgba(255, 255, 255, 0.04);
              border: 1px solid rgba(255, 255, 255, 0.08);
              border-radius: 18px;
              padding: 14px 18px;
            }

            .stat-label {
              color: #71717a;
              font-size: 11px;
              font-weight: 700;
              letter-spacing: 1px;
              text-transform: uppercase;
              margin-bottom: 4px;
            }

            .stat-value {
              color: #ffffff;
              font-size: 20px;
              font-weight: 800;
            }
          </style>
        </head>
        <body>
          <div class="bg-blur"></div>
          <div class="card">
            <div class="left-container">
              <div class="cover-wrapper">
                <img class="cover" src="${coverUrl}" />
              </div>
              <div class="status-badge">
                <div class="status-dot"></div>
                <span class="status-text">${statusText}</span>
              </div>
            </div>

            <div class="right-container">
              <div class="header-info">
                <div class="user-tag">@${user}</div>
                <div class="track-title">${trackName}</div>
                <div class="artist-name">${artistName}</div>
                <div class="album-name">💿 ${albumName}</div>
              </div>

              <div class="stats-grid">
                <div class="stat-card">
                  <div class="stat-label">I TUOI ASCOLTI</div>
                  <div class="stat-value">${userPlaycount}</div>
                </div>
                <div class="stat-card">
                  <div class="stat-label">ASCOLTI GLOBALI</div>
                  <div class="stat-value">${globalPlaycount}</div>
                </div>
                <div class="stat-card">
                  <div class="stat-label">ASCOLTATORI TOTALI</div>
                  <div class="stat-value">${listeners}</div>
                </div>
                <div class="stat-card">
                  <div class="stat-label">STATO</div>
                  <div class="stat-value" style="color: ${isPlaying ? '#22c55e' : '#a1a1aa'};">
                    ${isPlaying ? 'Online' : 'Offline'}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </body>
        </html>
        `;

        browser = await puppeteer.launch({
          headless: 'new',
          args: ['--no-sandbox', '--disable-setuid-sandbox']
        });
        const page = await browser.newPage();
        await page.setViewport({ width: 1000, height: 560 });
        await page.setContent(htmlContent, { waitUntil: 'networkidle0' });

        const imageBuffer = await page.screenshot({ type: 'png' });

        const captionText = 
`🎧 *LAST.FM NOW PLAYING*

🎵 *Brano:* ${trackName}
👤 *Artista:* ${artistName}
💿 *Album:* ${albumName}

📊 *I tuoi scrobble:* ${userPlaycount}
🌐 *Ascolti globali:* ${globalPlaycount}
👤 *Utente:* @${user}

⬇️ *SCARICA MEDIA:*
• Scrivi *cur mp3* per l'audio 🎵
• Scrivi *cur mp4* per il video 🎥`;

        return await sock.sendMessage(from, {
          image: Buffer.from(imageBuffer),
          caption: captionText
        }, { quoted: msg });

      } catch (err) {
        return sendText(`❌ Errore durante la generazione dell'immagine: ${err.message}`);
      } finally {
        if (browser) await browser.close();
      }
    }
  }
};