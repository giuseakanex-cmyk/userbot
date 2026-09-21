<div align="center">

  <h1>USER BOT</h1>
  <p><b>Un UserBot per WhatsApp semplice, veloce e personalizzabile.</b></p>

  <p>
    <a href="https://nodejs.org/"><img src="https://img.shields.io/badge/Node.js-v18%2B-339933?style=for-the-badge&logo=nodedotjs&logoColor=white" alt="Node.js"></a>
    <a href="https://github.com/WhiskeySockets/Baileys"><img src="https://img.shields.io/badge/Libreria-Baileys-25D366?style=for-the-badge&logo=whatsapp&logoColor=white" alt="Baileys"></a>
    <a href="#"><img src="https://img.shields.io/badge/Accesso-Solo%20Owner-FF0055?style=for-the-badge" alt="Owner Only"></a>
  </p>

  <p>
    <a href="#-funzionalità">Funzionalità</a> •
    <a href="#-installazione">Installazione</a> •
    <a href="#-comandi">Comandi</a> •
    <a href="#-struttura-plugin">Plugin</a>
  </p>

</div>

---

## ⚙️ Funzionalità

<div align="center">

| Funzione | Descrizione |
| :--- | :--- |
| **🖥️ Avvio Animato** | Schermata di avvio in console con testo ASCII e barra di caricamento. |
| **🔑 Accesso Semplice** | Collegamento tramite **Codice di Accoppiamento** (senza scansione) o **QR Code**. |
| **🧩 Gestione Plugin** | Aggiungi, rimuovi o ricarica comandi in tempo reale senza riavviare. |
| **🛡️ Anti-Spam Pagamenti** | Blocco automatico per le richieste di pagamento inviate da altri utenti. |
| **🏓 Stato Sistema** | Comando ping pulito per controllare latenza (ms), tempo di attività e RAM. |

</div>

---

## 🛠️ Installazione

Assicurati di aver installato **Node.js** (versione 18 o superiore).

```bash
# 1. Clona la repository
git clone [https://github.com/tuousername/userbot.git](https://github.com/tuousername/userbot.git)

# 2. Entra nella cartella del progetto
cd userbot

# 3. Installa le dipendenze
npm install

# 4. Avvia il bot
node index.js


📲 Collegamento tramite Codice di Accoppiamento</b></summary>
1. Avvia il bot con ⁠node index.js⁠.
2. Seleziona l'opzione ⁠1⁠ nel terminale.
3. Inserisci il tuo numero di telefono completo di prefisso (es. ⁠393331234567⁠).
4. Apri WhatsApp sul telefono: Impostazioni > Dispositivi collegati > Collega un dispositivo > Collega con numero di telefono.
5. Inserisci il codice a 8 cifre mostrato nel terminale.


  
  
  🧩 Struttura Plugin
I comandi vengono caricati in automatico dalla cartella ⁠plugins/⁠. Ogni plugin segue questo schema semplice:

export default {
  name: 'nomecomando',
  aliases: ['alias1', 'alias2'],
  description: 'Descrizione del comando',

  async run({ sock, msg, from, args, sendText }) {
    await sendText('Risposta del comando!');
  }
};
