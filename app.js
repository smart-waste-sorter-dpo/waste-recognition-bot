require('dotenv').config();
const express = require('express');
const { Telegraf, Markup } = require('telegraf');
const axios = require('axios');
const path = require('path');
const fs = require('fs');
const FormData = require('form-data');

const app = express();
const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);

// Инициализация файла статистики
const STATS_FILE = 'stats.json';
const ANSWERS_FILE = 'answers.json';

// Создаём файлы, если они не существуют
if (!fs.existsSync(STATS_FILE)) {
  fs.writeFileSync(STATS_FILE, JSON.stringify({ correct: 0, incorrect: 0 }, null, 2));
}

if (!fs.existsSync(ANSWERS_FILE)) {
  fs.writeFileSync(ANSWERS_FILE, JSON.stringify([], null, 2));
}

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Классификация мусора
const classes = {
  'PAPER': 'бумага',
  'GLASS': 'стекло',
  'PLASTIC': 'пластик',
  'BIODEGRADABLE': 'органические отходы',
  'CARDBOARD': 'картон',
  'METAL': 'металл',
  'TRASH': 'другое',
};

// Обработчик команды /start
bot.start((ctx) => {
  const welcomeMessage = `
🌿 *Добро пожаловать в SmartWasteApp!* 🌿

Этот бот помогает сортировать мусор, определяя его тип по фотографии. Просто отправьте фото отходов, и бот подскажет, к какой категории они относятся.

*Как пользоваться ботом:*
1. 📸 Сфотографируйте мусор
2. 🖼️ Отправьте фото в этот чат
3. 🕒 Подождите несколько секунд
4. ℹ️ Получите информацию о типе отходов и точности определения
5. ✅❌ Укажите, верен ли был ответ

*Поддерживаемые категории:*
- Бумага
- Стекло
- Пластик
- Органические отходы
- Картон
- Металл
- Другие отходы

Давайте вместе заботиться о природе! ♻️

Отправьте мне фотографию мусора для анализа...
  `;

  ctx.replyWithMarkdown(welcomeMessage);
});

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

    // Создаем папку uploads, если её нет
    if (!fs.existsSync('uploads')) {
      fs.mkdirSync('uploads');
    }

    fs.writeFileSync(filename, buffer);

    // Отправляем фото в API для классификации
    const formData = new FormData();
    formData.append('file', fs.createReadStream(filename));

    const apiResponse = await axios.post(process.env.API_ENDPOINT + '/wastes/classify/', formData, {
      headers: {
        ...formData.getHeaders(),
      }
    });

    // Отправляем результат пользователю
    const wasteType = classes[apiResponse.data.class] || 'Не удалось определить';
    const confidence = apiResponse.data.confidence ? Math.round(apiResponse.data.confidence * 100) : 0;

    const message = await ctx.replyWithMarkdown(
      `*Тип мусора:* ${wasteType}\n` +
      `*Точность:* ${confidence}%\n\n` +
      `Ответ верный?`,
      Markup.inlineKeyboard([
        Markup.button.callback('✅ Верно', 'correct'),
        Markup.button.callback('❌ Неверно', 'incorrect')
      ])
    );

    // Сохраняем информацию о файле и ответе для последующей проверки
    const answers = JSON.parse(fs.readFileSync(ANSWERS_FILE));
    answers.push({
      fileId: filename,
      predictedClass: apiResponse.data.class,
      confidence: confidence,
      messageId: message.message_id,
      timestamp: new Date().toISOString()
    });
    fs.writeFileSync(ANSWERS_FILE, JSON.stringify(answers, null, 2));

  } catch (error) {
    console.error('Error processing photo:', error);
    ctx.reply('Произошла ошибка при обработке изображения. Пожалуйста, попробуйте еще раз.');
  }
});

// Обработчик инлайн-кнопок
bot.action('correct', async (ctx) => {
  try {
    // Получаем оригинальное сообщение
    const messageText = ctx.update.callback_query.message.text.split('\n\n')[0];

    // Редактируем сообщение, удаляя кнопки
    await ctx.editMessageText(messageText, { parse_mode: 'Markdown' });

    await updateStats(true);
    await ctx.answerCbQuery('Спасибо за обратную связь!');
  } catch (error) {
    console.error('Error processing correct action:', error);
    await ctx.answerCbQuery('Произошла ошибка, попробуйте позже');
  }
});

bot.action('incorrect', async (ctx) => {
  try {
    // Получаем оригинальное сообщение
    const messageText = ctx.update.callback_query.message.text.split('\n\n')[0];

    // Редактируем сообщение, удаляя кнопки
    await ctx.editMessageText(messageText, { parse_mode: 'Markdown' });

    await updateStats(false);
    await ctx.answerCbQuery('Спасибо за обратную связь! Мы учтём это для улучшения бота.');
  } catch (error) {
    console.error('Error processing incorrect action:', error);
    await ctx.answerCbQuery('Произошла ошибка, попробуйте позже');
  }
});
// Функция обновления статистики
async function updateStats(isCorrect) {
  const stats = JSON.parse(fs.readFileSync(STATS_FILE));

  if (isCorrect) {
    stats.correct += 1;
  } else {
    stats.incorrect += 1;
  }

  fs.writeFileSync(STATS_FILE, JSON.stringify(stats, null, 2));
}

// Команда для получения статистики
bot.command('stats', async (ctx) => {
  try {
    const stats = JSON.parse(fs.readFileSync(STATS_FILE));
    ctx.replyWithMarkdown(
      `*Статистика точности бота:*\n` +
      `✅ Верных ответов: ${stats.correct}\n` +
      `❌ Неверных ответов: ${stats.incorrect}\n` +
      `📊 Точность: ${Math.round(stats.correct / (stats.correct + stats.incorrect) * 100 || 0)}%`
    );
  } catch (error) {
    console.error('Error getting stats:', error);
    ctx.reply('Произошла ошибка при получении статистики.');
  }
});

// Ручка для получения статистики через HTTP
app.get('/stats', (req, res) => {
  try {
    const stats = JSON.parse(fs.readFileSync(STATS_FILE));
    res.json({
      success: true,
      stats: {
        correct: stats.correct,
        incorrect: stats.incorrect,
        accuracy: Math.round(stats.correct / (stats.correct + stats.incorrect) * 100 || 0)
      }
    });
  } catch (error) {
    console.error('Error getting stats:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
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
