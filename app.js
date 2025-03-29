require('dotenv').config();
const express = require('express');
const { Telegraf } = require('telegraf');
const axios = require('axios');
const path = require('path');
const fs = require('fs');
const FormData = require('form-data');

const app = express();
const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);

// Middleware для обработки multipart/form-data
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Обработчик команды /start
bot.start((ctx) => {
  ctx.reply(
    'Привет! Отправь мне фотографию мусора, и я определю его тип. ' +
    'Можно отправить несколько фотографий сразу.'
  );
});

const classes = {
  'PAPER': 'бумага',
  'GLASS': 'стекло',
  'PLASTIC': 'пластик',
  'BIODEGRADABLE': 'органические отходы',
  'CARDBOARD': 'картон',
  'METAL': 'металл',
  'TRASH': 'другое',
}

// Обработчик для фотографий
bot.on('photo', async (ctx) => {
  try {
    // Получаем фото с самым высоким разрешением
    const photo = ctx.message.photo.pop();
    const fileLink = await ctx.telegram.getFileLink(photo.file_id);

    // Скачиваем фото
    const response = await axios.get(fileLink, { responseType: 'arraybuffer' });
    const buffer = Buffer.from(response.data, 'binary');
    const filename = path.join('uploads', `${Date.now()}.jpg`);

    fs.writeFileSync(filename, buffer);

    // Отправляем фото в API для классификации
    const formData = new FormData();
    formData.append('file', fs.createReadStream(filename));

    const apiResponse = await axios.post(process.env.API_ENDPOINT + '/wastes/classify/', formData, {
      headers: {
        ...formData.getHeaders(),
      }
    });

    // Удаляем временный файл
    fs.unlinkSync(filename);

    // Отправляем результат пользователю
    const wasteType = classes[apiResponse.data.class] || 'Не удалось определить';
    const confidence = apiResponse.data.confidence ? Math.round(apiResponse.data.confidence * 100) : 0;

    ctx.replyWithMarkdown(
      `*Тип мусора:* ${wasteType}\n` +
      `*Точность:* ${confidence}%`
    );

  } catch (error) {
    console.error('Error processing photo:', error);
    ctx.reply('Произошла ошибка при обработке изображения. Пожалуйста, попробуйте еще раз.');
  }
});

// Вебхук для Telegram бота
// app.use(bot.webhookCallback('/telegram-webhook'));
// bot.telegram.setWebhook(`${process.env.BASE_URL}/telegram-webhook`);

bot.launch();

// Запуск сервера
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
