/** Focus themes use client-facing ids (e.g. "health") but DB PK must be unique globally — scope by user. */
const SEP = '::';

export function encodeFocusThemeId(userId, clientId) {
  return `${userId}${SEP}${clientId}`;
}

export function decodeFocusThemeId(userId, storedId) {
  const prefix = `${userId}${SEP}`;
  if (typeof storedId === 'string' && storedId.startsWith(prefix)) {
    return storedId.slice(prefix.length);
  }
  return storedId;
}
