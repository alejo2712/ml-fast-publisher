/**
 * Generates tests/fixtures/test-products-appliances.xlsx
 * Run: npx tsx scripts/generate-test-xlsx.ts
 */
import * as XLSX from 'xlsx';
import * as path from 'path';
import * as fs from 'fs';

// Exact headers from src/lib/csv/template.ts + descripcion_corta (required input)
const HEADERS = [
  'titulo',
  'descripcion_corta',
  'tipo_producto',
  'marca',
  'modelo',
  'condicion',
  'precio',
  'stock',
  'sku',
  'color',
  'voltaje',
  'capacidad_litros',
  'capacidad_kg',
  'potencia_watts',
  'tecnologia',
  'garantia',
  'envio',
  'retiro_en_persona',
  'envio_gratis',
  'imagenes',
  'descripcion_larga',
];

// ML CDN images (valid HTTPS URLs — parser only checks protocol)
const IMG = {
  heladera: 'https://http2.mlstatic.com/D_NQ_NP_heladera-samsung-320l.jpg',
  heladera2: 'https://http2.mlstatic.com/D_NQ_NP_heladera-samsung-320l-lateral.jpg',
  lavarropas: 'https://http2.mlstatic.com/D_NQ_NP_lavarropas-lg-9kg.jpg',
  microondas: 'https://http2.mlstatic.com/D_NQ_NP_microondas-whirlpool-25l.jpg',
  airfryer: 'https://http2.mlstatic.com/D_NQ_NP_freidora-philips-4l.jpg',
  airfryer2: 'https://http2.mlstatic.com/D_NQ_NP_freidora-philips-4l-lateral.jpg',
  aspiradora: 'https://http2.mlstatic.com/D_NQ_NP_aspiradora-dyson-v10.jpg',
  licuadora: 'https://http2.mlstatic.com/D_NQ_NP_licuadora-oster-750w.jpg',
  licuadora2: 'https://http2.mlstatic.com/D_NQ_NP_licuadora-oster-750w-accesorios.jpg',
  licuadora3: 'https://http2.mlstatic.com/D_NQ_NP_licuadora-oster-750w-vaso.jpg',
  horno: 'https://http2.mlstatic.com/D_NQ_NP_horno-electrico-ultracomb.jpg',
  lavarropas2: 'https://http2.mlstatic.com/D_NQ_NP_lavarropas-electrolux-8kg.jpg',
};

// ─── 6 VALID ROWS ────────────────────────────────────────────────────────────

const validRows = [
  // 1. Refrigerator — Samsung, fully loaded, 2 images
  {
    titulo: 'Heladera Samsung No Frost 320L Blanca',
    descripcion_corta: 'Heladera Samsung no frost 320 litros blanca nueva con freezer superior 220V garantía 24 meses',
    tipo_producto: 'heladera',
    marca: 'Samsung',
    modelo: 'RT32K5552S8',
    condicion: 'nuevo',
    precio: '289000',
    stock: '3',
    sku: 'SAM-HEL-320',
    color: 'Blanco',
    voltaje: '220V',
    capacidad_litros: '320',
    capacidad_kg: '',
    potencia_watts: '',
    tecnologia: 'No Frost',
    garantia: '24 meses',
    envio: 'me2',
    retiro_en_persona: 'si',
    envio_gratis: 'no',
    imagenes: `${IMG.heladera}|${IMG.heladera2}`,
    descripcion_larga: 'Heladera Samsung No Frost de 320 litros. Tecnología No Frost evita la formación de hielo. Ideal para familias medianas. Incluye garantía oficial Samsung de 24 meses.',
  },

  // 2. Washing machine — LG 9kg front load
  {
    titulo: 'Lavarropas LG Carga Frontal 9kg Inverter Gris',
    descripcion_corta: 'Lavarropas LG 9 kg carga frontal motor inverter nuevo gris 220V garantía 12 meses',
    tipo_producto: 'lavarropas',
    marca: 'LG',
    modelo: 'F4WV3009S6S',
    condicion: 'nuevo',
    precio: '420000',
    stock: '2',
    sku: 'LG-LAV-9KG',
    color: 'Gris',
    voltaje: '220V',
    capacidad_litros: '',
    capacidad_kg: '9',
    potencia_watts: '2000',
    tecnologia: 'Carga Frontal',
    garantia: '12 meses',
    envio: 'me2',
    retiro_en_persona: 'no',
    envio_gratis: 'si',
    imagenes: IMG.lavarropas,
    descripcion_larga: 'Lavarropas LG de 9 kg con motor inverter directo. Bajo consumo energético y menor nivel de ruido. 14 programas de lavado. Garantía oficial LG 12 meses.',
  },

  // 3. Microwave — Whirlpool 25L
  {
    titulo: 'Microondas Whirlpool 25 Litros 700W Negro',
    descripcion_corta: 'Microondas Whirlpool 25 litros 700 watts negro nuevo con grill 220V',
    tipo_producto: 'microondas',
    marca: 'Whirlpool',
    modelo: 'WM25BX',
    condicion: 'nuevo',
    precio: '95000',
    stock: '5',
    sku: 'WHP-MIC-25L',
    color: 'Negro',
    voltaje: '220V',
    capacidad_litros: '25',
    capacidad_kg: '',
    potencia_watts: '700',
    tecnologia: 'Grill',
    garantia: '12 meses',
    envio: 'me2',
    retiro_en_persona: 'si',
    envio_gratis: 'no',
    imagenes: IMG.microondas,
    descripcion_larga: 'Microondas Whirlpool de 25 litros con función grill. Panel de control digital. 5 niveles de potencia. Incluye plato giratorio de vidrio.',
  },

  // 4. Air Fryer — Philips 4.1L, 2 images
  {
    titulo: 'Freidora de Aire Philips Airfryer 4.1L Negro',
    descripcion_corta: 'Freidora de aire Philips 4.1 litros 1400 watts negra nueva sin aceite',
    tipo_producto: 'freidora de aire',
    marca: 'Philips',
    modelo: 'HD9252/91',
    condicion: 'nuevo',
    precio: '145000',
    stock: '8',
    sku: 'PHI-AF-4L',
    color: 'Negro',
    voltaje: '220V',
    capacidad_litros: '4',
    capacidad_kg: '',
    potencia_watts: '1400',
    tecnologia: 'Rapid Air',
    garantia: '12 meses',
    envio: 'me2',
    retiro_en_persona: 'si',
    envio_gratis: 'no',
    imagenes: `${IMG.airfryer}|${IMG.airfryer2}`,
    descripcion_larga: 'Freidora de aire Philips Airfryer XXL de 4.1 litros. Tecnología Rapid Air para cocinar con hasta 90% menos de grasa. Pantalla digital con 7 programas preestablecidos.',
  },

  // 5. Vacuum cleaner — Dyson V10
  {
    titulo: 'Aspiradora Dyson V10 Cyclone Inalámbrica Violeta',
    descripcion_corta: 'Aspiradora Dyson V10 inalámbrica 25.2V ciclónica violeta nueva sin bolsa',
    tipo_producto: 'aspiradora',
    marca: 'Dyson',
    modelo: 'V10 Animal Pro',
    condicion: 'nuevo',
    precio: '680000',
    stock: '1',
    sku: 'DYS-V10-ANI',
    color: 'Violeta',
    voltaje: '220V',
    capacidad_litros: '',
    capacidad_kg: '',
    potencia_watts: '525',
    tecnologia: 'Ciclónica',
    garantia: '24 meses',
    envio: 'me2',
    retiro_en_persona: 'no',
    envio_gratis: 'si',
    imagenes: IMG.aspiradora,
    descripcion_larga: 'Aspiradora inalámbrica Dyson V10 Animal Pro. Motor digital de alta velocidad. Hasta 60 minutos de autonomía. Incluye 3 accesorios. Sin bolsa, fácil de vaciar.',
  },

  // 6. Blender — Oster 750W, 3 images
  {
    titulo: 'Licuadora Oster 750W 1.5L Negra con Vaso Adicional',
    descripcion_corta: 'Licuadora Oster 750 watts 1.5 litros negra nueva 220V con vaso de vidrio',
    tipo_producto: 'licuadora',
    marca: 'Oster',
    modelo: 'BLSTHA-B00-049',
    condicion: 'nuevo',
    precio: '62000',
    stock: '10',
    sku: 'OST-LIC-750W',
    color: 'Negro',
    voltaje: '220V',
    capacidad_litros: '1.5',
    capacidad_kg: '',
    potencia_watts: '750',
    tecnologia: '',
    garantia: '12 meses',
    envio: 'me2',
    retiro_en_persona: 'si',
    envio_gratis: 'no',
    imagenes: `${IMG.licuadora}|${IMG.licuadora2}|${IMG.licuadora3}`,
    descripcion_larga: 'Licuadora Oster de 750 watts con vaso de vidrio de 1.5 litros. 5 velocidades + pulso. Cuchillas de acero inoxidable. Apta para hielo.',
  },
];

// ─── 3 PARTIALLY INVALID (warnings — missing optional validated fields) ────────

const warningRows = [
  // 7. Missing images → warnings
  {
    titulo: 'Horno Eléctrico Ultracomb 42L Plateado',
    descripcion_corta: 'Horno eléctrico Ultracomb 42 litros plateado nuevo 1500 watts convección',
    tipo_producto: 'horno',
    marca: 'Ultracomb',
    modelo: 'HO-42CB',
    condicion: 'nuevo',
    precio: '115000',
    stock: '4',
    sku: 'ULT-HOR-42L',
    color: 'Plateado',
    voltaje: '220V',
    capacidad_litros: '42',
    capacidad_kg: '',
    potencia_watts: '1500',
    tecnologia: 'Convección',
    garantia: '12 meses',
    envio: 'me2',
    retiro_en_persona: 'si',
    envio_gratis: 'no',
    imagenes: '',   // ← missing images → warning
    descripcion_larga: 'Horno eléctrico Ultracomb de 42 litros con función convección. Temperatura regulable de 100 a 280°C. Incluye bandeja y asadera.',
  },

  // 8. Missing condition → warnings
  {
    titulo: 'Lavarropas Electrolux 8kg Carga Superior Blanco',
    descripcion_corta: 'Lavarropas Electrolux 8 kg carga superior blanco 220V garantía 12 meses',
    tipo_producto: 'lavarropas',
    marca: 'Electrolux',
    modelo: 'EWT1085HW',
    condicion: '',   // ← missing condition → warning
    precio: '195000',
    stock: '2',
    sku: 'ELX-LAV-8KG',
    color: 'Blanco',
    voltaje: '220V',
    capacidad_litros: '',
    capacidad_kg: '8',
    potencia_watts: '500',
    tecnologia: 'Carga Superior',
    garantia: '12 meses',
    envio: 'me2',
    retiro_en_persona: 'si',
    envio_gratis: 'no',
    imagenes: IMG.lavarropas2,
    descripcion_larga: 'Lavarropas Electrolux de 8 kg con 12 programas de lavado. Sistema de agitador central. Bajo consumo de agua.',
  },

  // 9. Missing brand → warnings (brand is required by category config for most appliances)
  {
    titulo: 'Microondas 20L 800W Blanco Nuevo',
    descripcion_corta: 'Microondas 20 litros 800 watts blanco nuevo sin marca conocida 220V',
    tipo_producto: 'microondas',
    marca: '',       // ← missing brand → warning
    modelo: '',
    condicion: 'nuevo',
    precio: '55000',
    stock: '6',
    sku: 'MIC-GEN-20L',
    color: 'Blanco',
    voltaje: '220V',
    capacidad_litros: '20',
    capacidad_kg: '',
    potencia_watts: '800',
    tecnologia: '',
    garantia: '6 meses',
    envio: 'not_specified',
    retiro_en_persona: 'si',
    envio_gratis: 'no',
    imagenes: IMG.microondas,
    descripcion_larga: '',
  },
];

// ─── 3 INTENTIONALLY BROKEN (errors) ─────────────────────────────────────────

const errorRows = [
  // 10. Empty descripcion_corta (required input column) → hard error
  {
    titulo: 'Heladera Drean 280L Usada',
    descripcion_corta: '',              // ← missing required input → hard error
    tipo_producto: 'heladera',
    marca: 'Drean',
    modelo: 'DRE-280',
    condicion: 'usado',
    precio: '180000',
    stock: '1',
    sku: '',
    color: 'Blanco',
    voltaje: '220V',
    capacidad_litros: '280',
    capacidad_kg: '',
    potencia_watts: '',
    tecnologia: 'No Frost',
    garantia: '3 meses',
    envio: 'me2',
    retiro_en_persona: 'si',
    envio_gratis: 'no',
    imagenes: IMG.heladera,
    descripcion_larga: '',
  },

  // 11. Garbage brand → error
  {
    titulo: 'Freidora de Aire 3L 1200W',
    descripcion_corta: 'Freidora de aire 3 litros 1200 watts nueva sin aceite negra 220V',
    tipo_producto: 'freidora de aire',
    marca: 'ASDF',              // ← garbage brand → error
    modelo: 'QWERTY-123',      // ← garbage model → error
    condicion: 'nuevo',
    precio: '75000',
    stock: '3',
    sku: '',
    color: 'Negro',
    voltaje: '220V',
    capacidad_litros: '3',
    capacidad_kg: '',
    potencia_watts: '1200',
    tecnologia: '',
    garantia: '6 meses',
    envio: 'me2',
    retiro_en_persona: 'no',
    envio_gratis: 'no',
    imagenes: IMG.airfryer,
    descripcion_larga: '',
  },

  // 12. Invalid image URL → error
  {
    titulo: 'Aspiradora Philips PowerPro 1900W Roja',
    descripcion_corta: 'Aspiradora Philips PowerPro 1900 watts roja nueva con bolsa 220V',
    tipo_producto: 'aspiradora',
    marca: 'Philips',
    modelo: 'FC9352/01',
    condicion: 'nuevo',
    precio: '210000',
    stock: '2',
    sku: 'PHI-ASP-1900W',
    color: 'Rojo',
    voltaje: '220V',
    capacidad_litros: '',
    capacidad_kg: '',
    potencia_watts: '1900',
    tecnologia: 'Con bolsa',
    garantia: '12 meses',
    envio: 'me2',
    retiro_en_persona: 'si',
    envio_gratis: 'no',
    imagenes: 'no-es-una-url-valida',  // ← invalid image URL → error
    descripcion_larga: '',
  },
];

// ─── Instructions sheet ───────────────────────────────────────────────────────

const instrRows: string[][] = [
  ['INSTRUCCIONES — FastPublisher para Mercado Libre'],
  [''],
  ['CAMPOS OBLIGATORIOS'],
  ['descripcion_corta', 'OBLIGATORIO — Texto libre que describe el producto. Se usa para inferencia automática de marca, tipo y atributos.'],
  ['precio',            'OBLIGATORIO — Precio en ARS. Solo el número, sin puntos ni comas. Ejemplo: 250000'],
  [''],
  ['CONDICIÓN'],
  ['condicion', 'Valores aceptados: nuevo (o "new"), usado, refurbished (o "reacondicionado")'],
  [''],
  ['TIPO DE PRODUCTO (tipo_producto)'],
  ['', 'heladera, lavarropas, secadora, lavavajillas, horno, cocina, freezer, microondas,'],
  ['', 'freidora de aire, licuadora, cafetera, pava eléctrica, aspiradora, plancha, tostadora, mixer'],
  [''],
  ['IMÁGENES (imagenes)'],
  ['', 'Ingresar URLs HTTPS completas. Para múltiples fotos, separarlas con | (pipe):'],
  ['', 'https://ejemplo.com/foto1.jpg|https://ejemplo.com/foto2.jpg'],
  ['', 'Las URLs deben comenzar con https:// o http://'],
  [''],
  ['MODO DRY-RUN (simulación)'],
  ['', 'Por defecto la plataforma está en modo DRY-RUN = no publica nada real en Mercado Libre.'],
  ['', 'En modo dry-run podés verificar que todos los datos son correctos antes de publicar.'],
  ['', 'Para publicar realmente, el administrador debe desactivar MERCADOLIBRE_DRY_RUN.'],
  [''],
  ['ENVÍO'],
  ['envio',             'me2 (Mercado Envíos), custom, not_specified'],
  ['retiro_en_persona', 'si / no'],
  ['envio_gratis',      'si / no'],
  [''],
  ['REFERENCIA COMPLETA DE COLUMNAS'],
  ['Columna', 'Obligatoria', 'Descripción', 'Ejemplo'],
  ['titulo',            'No',  'Título del anuncio (máx 60 chars). Se genera si está vacío.',     'Heladera Samsung No Frost 320L Blanca'],
  ['descripcion_corta', 'SÍ',  'Descripción libre para inferencia automática.',                   'Heladera Samsung no frost 320L blanca nueva'],
  ['tipo_producto',     'No',  'Tipo de electrodoméstico para sobreescribir la inferencia.',       'heladera'],
  ['marca',             'No',  'Marca del producto.',                                              'Samsung'],
  ['modelo',            'No',  'Número de modelo.',                                                'RT32K5552S8'],
  ['condicion',         'No',  'nuevo | usado | refurbished',                                      'nuevo'],
  ['precio',            'SÍ',  'Precio en ARS. Solo el número.',                                   '250000'],
  ['stock',             'No',  'Cantidad disponible. Default: 1.',                                 '1'],
  ['sku',               'No',  'Código interno.',                                                  'PROD-001'],
  ['color',             'No',  'Color del producto.',                                              'Blanco'],
  ['voltaje',           'No',  '220V | 110V | Bivolt',                                            '220V'],
  ['capacidad_litros',  'No',  'Capacidad en litros (heladeras, hornos).',                        '320'],
  ['capacidad_kg',      'No',  'Capacidad en kg (lavarropas).',                                   '8'],
  ['potencia_watts',    'No',  'Potencia en watts.',                                              '1200'],
  ['tecnologia',        'No',  'Ej: No Frost, Carga Frontal, Cápsulas.',                         'No Frost'],
  ['garantia',          'No',  'Período de garantía.',                                            '12 meses'],
  ['envio',             'No',  'me2 | custom | not_specified',                                    'me2'],
  ['retiro_en_persona', 'No',  'si | no',                                                         'si'],
  ['envio_gratis',      'No',  'si | no',                                                         'no'],
  ['imagenes',          'No',  'URLs HTTPS separadas por | para múltiples fotos.',                'https://foto1.jpg|https://foto2.jpg'],
  ['descripcion_larga', 'No',  'Descripción detallada. Se genera si está vacío.',                 ''],
];

// ─── Build workbook ───────────────────────────────────────────────────────────

function buildRow(data: Record<string, string>): string[] {
  return HEADERS.map((h) => data[h] ?? '');
}

const allRows = [
  ...validRows.map(buildRow),
  ...warningRows.map(buildRow),
  ...errorRows.map(buildRow),
];

const ws = XLSX.utils.aoa_to_sheet([HEADERS, ...allRows]);
ws['!cols'] = HEADERS.map((h) => ({ wch: Math.max(h.length + 4, 18) }));

const wb = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(wb, ws, 'Productos');

const wsInstr = XLSX.utils.aoa_to_sheet(instrRows);
wsInstr['!cols'] = [{ wch: 22 }, { wch: 12 }, { wch: 70 }, { wch: 45 }];
XLSX.utils.book_append_sheet(wb, wsInstr, 'Instrucciones');

const outDir = path.resolve(__dirname, '../tests/fixtures');
fs.mkdirSync(outDir, { recursive: true });

const outPath = path.join(outDir, 'test-products-appliances.xlsx');
XLSX.writeFile(wb, outPath);

console.log(`\nGenerated: ${outPath}`);
console.log(`Rows: ${allRows.length} total`);
console.log(`  ✅ 6 valid (should be ok/warnings with images)`);
console.log(`  ⚠️  3 partial (warnings — missing images, condition, or brand)`);
console.log(`  ❌ 3 broken (errors — invalid price, garbage brand, invalid image URL)`);
