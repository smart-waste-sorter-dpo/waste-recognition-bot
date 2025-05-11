const fs = require('fs');
const ExcelJS = require('exceljs');

// Конфигурация
const ANSWERS_FILE = 'answers.json';
const OUTPUT_EXCEL = 'waste_classification_report.xlsx';

async function createExcelReport() {
  // Создаем новую книгу Excel
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('Отчет по классификации');

  // Заголовки столбцов
  worksheet.columns = [
    { header: 'Фото', key: 'photo', width: 30 },
    { header: 'Тип мусора', key: 'wasteType', width: 20 },
    { header: 'Точность (%)', key: 'confidence', width: 15 },
  ];

  // Читаем данные из JSON
  const answers = JSON.parse(fs.readFileSync(ANSWERS_FILE));
  const classes = {
    'PAPER': 'бумага',
    'GLASS': 'стекло',
    'PLASTIC': 'пластик',
    'BIODEGRADABLE': 'органические отходы',
    'CARDBOARD': 'картон',
    'METAL': 'металл',
    'TRASH': 'другое'
  };

  // Добавляем данные в таблицу
  for (const answer of answers) {
    const photoPath = answer.fileId; // путь к файлу сохранен в fileId

    // Добавляем изображение в Excel
    let imageId;
    if (fs.existsSync(photoPath)) {
      imageId = workbook.addImage({
        filename: photoPath,
        extension: 'jpeg'
      });

      worksheet.addImage(imageId, {
        tl: { col: 0, row: worksheet.rowCount + 1 },
        ext: { width: 210, height: 210 }
      });
    }

    // Добавляем строку с данными
    worksheet.addRow({
      wasteType: classes[answer.predictedClass] || answer.predictedClass,
      confidence: answer.confidence,

    });

    // Устанавливаем высоту строки для изображения
    worksheet.lastRow.height = 180;
  }

  // Сохраняем файл Excel
  await workbook.xlsx.writeFile(OUTPUT_EXCEL);
  console.log(`Отчет сохранен в файл: ${OUTPUT_EXCEL}`);

  return OUTPUT_EXCEL;
}

// Для самостоятельного запуска скрипта:
(async () => {
  if (require.main === module) {
    await createExcelReport();
  }
})();
