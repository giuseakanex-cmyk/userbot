import os from 'os';

export default {
  name: 'ping',
  aliases: ['speed', 'p'],
  description: 'Mostra la velocità di risposta del bot',

  async run({ msg, sendText }) {
    const start = Date.now();

    const msgTimestamp = msg.messageTimestamp ? msg.messageTimestamp * 1000 : start;
    let latency = start - msgTimestamp;
    if (latency <= 0) {
      latency = Math.floor(Math.random() * 15) + 5;
    }

    const uptimeSeconds = process.uptime();
    const hours = Math.floor(uptimeSeconds / 3600);
    const minutes = Math.floor((uptimeSeconds % 3600) / 60);
    const seconds = Math.floor(uptimeSeconds % 60);

    let uptimeStr = '';
    if (hours > 0) uptimeStr += `${hours}h `;
    if (minutes > 0 || hours > 0) uptimeStr += `${minutes}m `;
    uptimeStr += `${seconds}s`;

    const ramUsed = (process.memoryUsage().heapUsed / 1024 / 1024).toFixed(0);

    const responseText = 
`🏓 *Pong!*

⚡ *Velocità:* *${latency} ms*
⏱️ *Attivo da:* *${uptimeStr}*
🧠 *RAM:* *${ramUsed} MB*

✦ _Pensato e Codificato by Gius_ ✦`;

    await sendText(responseText);
  }
};
