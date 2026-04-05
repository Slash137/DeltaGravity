import type { Context } from 'grammy';

export interface TelegramContextInfo {
  key: string;
  chatId: number;
  threadId?: number;
  label: string;
}

export const getTelegramContextInfo = (ctx: Context): TelegramContextInfo => {
  const chatId = ctx.chat?.id;
  if (typeof chatId !== 'number') {
    throw new Error('No se pudo determinar el chat de Telegram.');
  }

  const threadId = 'message' in ctx && ctx.message && 'message_thread_id' in ctx.message
    ? (ctx.message as { message_thread_id?: number }).message_thread_id
    : undefined;
  const chatTitle =
    ('title' in (ctx.chat ?? {}) && typeof ctx.chat?.title === 'string' && ctx.chat.title) ||
    ctx.from?.username ||
    ctx.from?.first_name ||
    `${chatId}`;
  const label = threadId ? `${chatTitle} / topic ${threadId}` : chatTitle;

  return {
    key: threadId ? `${chatId}:${threadId}` : `${chatId}`,
    chatId,
    threadId,
    label,
  };
};
