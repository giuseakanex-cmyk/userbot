export function cleanJid(jid) {
  if (!jid) return '';
  return jid.split(':')[0].split('@')[0] + '@s.whatsapp.net';
}

export function isUserBotAdmin() {
  return true;
}

export async function isUserGroupAdmin() {
  return true;
}
