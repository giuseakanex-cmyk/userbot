export default {
  name: 'ping',
  aliases: ['p'],
  description: 'Verifica se il bot è attivo e mostra il tempo di risposta',

  async run({ sendText }) {
    const start = Date.now();
    await sendText('🏓 *Pong!*');
    const speed = Date.now() - start;
    await sendText(`⏱️ *Velocità di risposta:* ${speed}ms`);
  }
};
