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
  { key: 'title',        header: 'titulo',       required: false, example: 'Heladera Samsung No Frost 320L Blanca',  hint: 'Título del anuncio (máx 60 chars). Si está vacío se genera automáticamente.' },
  { key: 'input',        header: 'descripcion_corta', required: true,  example: 'Heladera Samsung no frost 320 litros blanca usada', hint: 'Texto libre que describe el producto. Se usa para inferencia automática.' },
  { key: 'brand',        header: 'marca',         required: false, example: 'Samsung',   hint: 'Marca del producto. Si está vacío se intenta inferir.' },
  { key: 'model',        header: 'modelo',        required: false, example: 'RT32K5552S8', hint: 'Número de modelo.' },
  { key: 'condition',    header: 'condicion',     required: false, example: 'usado',     hint: 'new | usado | refurbished' },
  { key: 'price',        header: 'precio',        required: true,  example: '250000',    hint: 'Precio en ARS (número sin puntos ni comas).' },
  { key: 'stock',        header: 'stock',         required: false, example: '1',         hint: 'Cantidad disponible. Default: 1.' },
  { key: 'sku',          header: 'sku',           required: false, example: 'PROD-001',  hint: 'Código interno. Opcional.' },
  { key: 'color',        header: 'color',         required: false, example: 'Blanco',    hint: 'Color del producto.' },
  { key: 'voltage',      header: 'voltaje',       required: false, example: '220V',      hint: '220V | 110V | Bivolt' },
  { key: 'capacity',     header: 'capacidad',     required: false, example: '320',       hint: 'Número solo (litros para heladeras/hornos, kg para lavarropas).' },
  { key: 'watts',        header: 'watts',         required: false, example: '1200',      hint: 'Potencia en watts.' },
  { key: 'technology',   header: 'tecnologia',    required: false, example: 'No Frost',  hint: 'Ej: No Frost, Carga Frontal, Cápsulas.' },
  { key: 'warranty',     header: 'garantia',      required: false, example: '12 meses',  hint: 'Período de garantía.' },
  { key: 'images',       header: 'imagen_url',    required: false, example: 'https://example.com/foto.jpg', hint: 'URL de la imagen principal. Para múltiples, separar con |' },
  { key: 'description',  header: 'descripcion_larga', required: false, example: '', hint: 'Descripción detallada. Se genera automáticamente si está vacío.' },
];

export const CSV_HEADERS = CSV_COLUMNS.map((c) => c.header);

export function generateCsvTemplate(): string {
  const headerRow = CSV_HEADERS.join(',');
  const hintRow = CSV_COLUMNS.map((c) => `"${c.hint}"`).join(',');
  const exampleRow = CSV_COLUMNS.map((c) => `"${c.example}"`).join(',');
  return [headerRow, hintRow, exampleRow].join('\n');
}

export function downloadCsvTemplate() {
  const content = generateCsvTemplate();
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'fastpublisher-template.csv';
  a.click();
  URL.revokeObjectURL(url);
}
