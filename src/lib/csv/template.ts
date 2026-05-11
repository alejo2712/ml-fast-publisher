// CSV column definitions — single source of truth for both template and parser.
// To add a column: add one entry here. Nothing else needs changing.

export interface CsvColumnDef {
  key: string;          // maps to ProductDraft field
  header: string;       // CSV header label shown to user
  required: boolean;
  example: string;
  hint: string;
}

export const CSV_COLUMNS: CsvColumnDef[] = [
  { key: 'title',        header: 'titulo',             required: false, example: 'Heladera Samsung No Frost 320L Blanca',  hint: 'Título del anuncio (máx 60 chars). Si está vacío se genera automáticamente.' },
  { key: 'input',        header: 'descripcion_corta',  required: true,  example: 'Heladera Samsung no frost 320 litros blanca usada', hint: 'Texto libre que describe el producto. Se usa para inferencia automática.' },
  { key: 'product_type', header: 'tipo_producto',      required: false, example: 'heladera', hint: 'Tipo de electrodoméstico: heladera, lavarropas, microondas, horno, etc.' },
  { key: 'brand',        header: 'marca',              required: false, example: 'Samsung',   hint: 'Marca del producto. Si está vacío se intenta inferir.' },
  { key: 'model',        header: 'modelo',             required: false, example: 'RT32K5552S8', hint: 'Número de modelo.' },
  { key: 'condition',    header: 'condicion',          required: false, example: 'usado',     hint: 'new | usado | refurbished' },
  { key: 'price',        header: 'precio',             required: true,  example: '250000',    hint: 'Precio en ARS (número sin puntos ni comas).' },
  { key: 'stock',        header: 'stock',              required: false, example: '1',         hint: 'Cantidad disponible. Default: 1.' },
  { key: 'sku',          header: 'sku',                required: false, example: 'PROD-001',  hint: 'Código interno. Opcional.' },
  { key: 'color',        header: 'color',              required: false, example: 'Blanco',    hint: 'Color del producto.' },
  { key: 'voltage',      header: 'voltaje',            required: false, example: '220V',      hint: '220V | 110V | Bivolt' },
  { key: 'capacity',     header: 'capacidad_litros',   required: false, example: '320',       hint: 'Capacidad en litros (heladeras, hornos). Solo el número.' },
  { key: 'capacity_kg',  header: 'capacidad_kg',       required: false, example: '8',         hint: 'Capacidad en kg (lavarropas). Solo el número.' },
  { key: 'watts',        header: 'potencia_watts',     required: false, example: '1200',      hint: 'Potencia en watts.' },
  { key: 'technology',   header: 'tecnologia',         required: false, example: 'No Frost',  hint: 'Ej: No Frost, Carga Frontal, Cápsulas.' },
  { key: 'warranty',     header: 'garantia',           required: false, example: '12 meses',  hint: 'Período de garantía.' },
  { key: 'shipping_mode',header: 'envio',              required: false, example: 'me2',       hint: 'Modalidad de envío: me2 (Mercado Envíos), custom, not_specified.' },
  { key: 'local_pickup', header: 'retiro_en_persona',  required: false, example: 'si',        hint: 'si | no — si el comprador puede retirar en persona.' },
  { key: 'free_shipping',header: 'envio_gratis',       required: false, example: 'no',        hint: 'si | no — si el envío es gratis.' },
  { key: 'images',       header: 'imagenes',           required: false, example: 'https://example.com/foto1.jpg|https://example.com/foto2.jpg', hint: 'URL de imágenes. Para múltiples fotos, separarlas con | (pipe).' },
  { key: 'description',  header: 'descripcion_larga',  required: false, example: '', hint: 'Descripción detallada. Se genera automáticamente si está vacío.' },
];

export const CSV_HEADERS = CSV_COLUMNS.map((c) => c.header);

export function generateCsvTemplate(): string {
  const headerRow = CSV_HEADERS.join(',');
  const hintRow = CSV_COLUMNS.map((c) => `"${c.hint.replace(/"/g, '""')}"`).join(',');
  const exampleRow = CSV_COLUMNS.map((c) => `"${c.example.replace(/"/g, '""')}"`).join(',');
  return [headerRow, hintRow, exampleRow].join('\n');
}

export function downloadCsvTemplate() {
  const content = generateCsvTemplate();
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'fastpublisher-plantilla.csv';
  a.click();
  URL.revokeObjectURL(url);
}

export async function downloadExcelTemplate() {
  // Dynamic import to avoid including xlsx in server bundle
  const XLSX = await import('xlsx');

  // Row 1: headers
  const headers = CSV_COLUMNS.map((c) => c.header);
  // Row 2: hints
  const hints = CSV_COLUMNS.map((c) => c.hint);
  // Row 3: example values
  const examples = CSV_COLUMNS.map((c) => c.example);

  const ws = XLSX.utils.aoa_to_sheet([headers, hints, examples]);

  // Style header row bold — basic column width
  const colWidths = CSV_COLUMNS.map((c) => ({ wch: Math.max(c.header.length, 18) }));
  ws['!cols'] = colWidths;

  // Mark required columns with a note
  CSV_COLUMNS.forEach((col, i) => {
    if (col.required) {
      const cellRef = XLSX.utils.encode_cell({ r: 0, c: i });
      if (ws[cellRef]) {
        ws[cellRef].v = `${col.header} (REQUERIDO)`;
      }
    }
  });

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Productos');

  // Instructions sheet
  const instrData = [
    ['INSTRUCCIONES — FastPublisher para Mercado Libre'],
    [''],
    ['1. Completá las filas desde la fila 4 en adelante (fila 1 = columnas, fila 2 = descripción, fila 3 = ejemplo).'],
    ['2. Columnas REQUERIDAS: descripcion_corta y precio. El resto se completa automáticamente.'],
    ['3. Para múltiples fotos, separá las URLs con | (pipe): https://foto1.jpg|https://foto2.jpg'],
    ['4. Condición: new (nuevo), usado, o refurbished (reacondicionado)'],
    ['5. Precio: solo el número, sin puntos ni comas. Ej: 250000'],
    ['6. Guardá el archivo y subilo en FastPublisher usando "Importar Excel/CSV"'],
  ];
  const wsInstr = XLSX.utils.aoa_to_sheet(instrData);
  wsInstr['!cols'] = [{ wch: 80 }];
  XLSX.utils.book_append_sheet(wb, wsInstr, 'Instrucciones');

  XLSX.writeFile(wb, 'fastpublisher-plantilla.xlsx');
}
