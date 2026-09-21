export default {
  name: 'antipayment',
  aliases: ['antipizzo'],
  description: 'Attiva o disattiva la protezione contro lo spam dei messaggi di pagamento da parte di altri',

  async run({ args, sendText }) {
    const action = args[0]?.toLowerCase();

    if (action === 'on') {
      global.antiPaymentActive = true;
      return sendText('🛡️ *Anti-Spam Payment ATTIVATO.*\nI messaggi di pagamento dagli altri utenti verranno bloccati.');
    } else if (action === 'off') {
      global.antiPaymentActive = false;
      return sendText('⚠️ *Anti-Spam Payment DISATTIVATO.*');
    }

    const state = global.antiPaymentActive ? 'ATTIVO 🟢' : 'DISATTIVATO 🔴';
    return sendText(`🛡️ *Stato Anti-Payment:* ${state}\n\nUsa:\n• *.antipayment on* per attivare\n• *.antipayment off* per disattivare`);
  }
};