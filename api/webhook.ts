import { webhookCallback } from 'grammy';
import { bot } from '../dist/bot.js'; // Usamos dist/ porque Vercel compila con el comando build

// Exportamos el manejador genérico HTTP para Vercel Serverless Functions
export default webhookCallback(bot, 'http');
