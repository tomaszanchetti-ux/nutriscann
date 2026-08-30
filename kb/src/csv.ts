/**
 * Parser de CSV.
 *
 * Los CSVs de USDA vienen con todos los campos entre comillas y con comas
 * adentro de las descripciones ("Milk, NFS"). Partir por comas rompe el
 * archivo en silencio: las columnas se corren y el alimento sale con la
 * categoría metida en el nombre. Por eso el parser es una máquina de estados
 * que respeta comillas, comillas escapadas ("") y saltos de línea dentro de un
 * campo.
 *
 * Lee por chunks y entrega fila por fila: `food_nutrient.csv` pesa decenas de
 * megas y no hay motivo para tenerlo entero en memoria.
 */
import { createReadStream } from "node:fs";
import { basename } from "node:path";

/** Una fila ya mapeada a sus columnas por el encabezado. */
export type CsvRow = Record<string, string>;

/**
 * Filas cuya cantidad de celdas no coincide con el encabezado.
 *
 * El parser NO es estricto a propósito: rellena las que faltan con "" y
 * descarta las que sobran, porque una fila rara al final de un CSV de USDA no
 * puede voltear el catálogo entero. Pero descartar en silencio sí sería un
 * problema, así que se cuentan y el build las muestra. Un número distinto de
 * cero es una señal para ir a mirar, no una falla.
 */
export interface CsvAnomalies {
  rows: number;
  /** Cuántas filas anómalas por archivo. */
  byFile: Record<string, number>;
}

let anomalies: CsvAnomalies = { rows: 0, byFile: {} };

/** Arranca el conteo de cero. Lo llama el pipeline al empezar cada corrida. */
export function resetCsvAnomalies(): void {
  anomalies = { rows: 0, byFile: {} };
}

/** Devuelve una copia del conteo acumulado desde el último reset. */
export function getCsvAnomalies(): CsvAnomalies {
  return { rows: anomalies.rows, byFile: { ...anomalies.byFile } };
}

const COMMA = 44;
const NEWLINE = 10;
const QUOTE = 34;
const CARRIAGE_RETURN = 13;

/** Máquina de estados que va cortando campos y filas a medida que llega texto. */
class RowSplitter {
  private field = "";
  private row: string[] = [];
  private inQuotes = false;
  /**
   * Comilla vista adentro de un campo citado. Todavía no se sabe si cierra el
   * campo o es la primera mitad de un escape (""): depende del carácter
   * siguiente, que puede estar en el chunk que todavía no llegó.
   */
  private quotePending = false;

  /** Empuja un pedazo de texto y devuelve las filas que quedaron completas. */
  push(chunk: string): string[][] {
    const rows: string[][] = [];
    const n = chunk.length;
    let i = 0;

    while (i < n) {
      if (this.inQuotes) {
        if (this.quotePending) {
          this.quotePending = false;
          if (chunk.charCodeAt(i) === QUOTE) {
            this.field += '"';
            i += 1;
          } else {
            // La comilla anterior cerraba el campo: el carácter actual se
            // procesa como texto fuera de comillas, sin consumirlo acá.
            this.inQuotes = false;
          }
          continue;
        }
        const closing = chunk.indexOf('"', i);
        if (closing === -1) {
          this.field += chunk.slice(i);
          break;
        }
        this.field += chunk.slice(i, closing);
        i = closing + 1;
        this.quotePending = true;
        continue;
      }

      // Fuera de comillas: se avanza hasta el próximo carácter significativo.
      let j = i;
      while (j < n) {
        const code = chunk.charCodeAt(j);
        if (code === COMMA || code === NEWLINE || code === QUOTE || code === CARRIAGE_RETURN) break;
        j += 1;
      }
      if (j > i) this.field += chunk.slice(i, j);
      if (j >= n) break;

      i = j + 1;
      const code = chunk.charCodeAt(j);
      if (code === QUOTE) {
        this.inQuotes = true;
      } else if (code === COMMA) {
        this.row.push(this.field);
        this.field = "";
      } else if (code === NEWLINE) {
        this.row.push(this.field);
        this.field = "";
        rows.push(this.row);
        this.row = [];
      }
      // CARRIAGE_RETURN: se descarta (archivos con finales de línea de Windows).
    }
    return rows;
  }

  /** Cierra el archivo: la última fila puede venir sin salto de línea final. */
  flush(): string[][] {
    this.quotePending = false;
    this.inQuotes = false;
    if (this.field !== "" || this.row.length > 0) {
      this.row.push(this.field);
      const last = this.row;
      this.row = [];
      this.field = "";
      return [last];
    }
    return [];
  }
}

/**
 * Recorre un CSV entregando cada fila al callback. Devuelve cuántas filas de
 * datos leyó (sin contar el encabezado).
 */
export async function readCsv(
  filePath: string,
  onRow: (row: CsvRow) => void,
): Promise<number> {
  const splitter = new RowSplitter();
  let header: string[] | null = null;
  let count = 0;

  const emit = (cells: string[]): void => {
    if (header === null) {
      header = cells.map((cell) => cell.trim());
      return;
    }
    // Una línea vacía al final del archivo no es un dato.
    if (cells.length === 1 && cells[0] === "") return;
    if (cells.length !== header.length) {
      anomalies.rows += 1;
      const name = basename(filePath);
      anomalies.byFile[name] = (anomalies.byFile[name] ?? 0) + 1;
    }
    const row: CsvRow = {};
    for (let i = 0; i < header.length; i += 1) {
      row[header[i] as string] = cells[i] ?? "";
    }
    count += 1;
    onRow(row);
  };

  const stream = createReadStream(filePath, { encoding: "utf8" });
  for await (const chunk of stream) {
    for (const cells of splitter.push(chunk as string)) emit(cells);
  }
  for (const cells of splitter.flush()) emit(cells);

  if (header === null) throw new Error(`El CSV está vacío: ${filePath}`);
  return count;
}

/** Igual que `readCsv`, pero devuelve todas las filas. Solo para tablas chicas. */
export async function readCsvAll(filePath: string): Promise<CsvRow[]> {
  const rows: CsvRow[] = [];
  await readCsv(filePath, (row) => rows.push(row));
  return rows;
}

/** Parsea un CSV que ya está en memoria (lo usan los tests). */
export function parseCsvText(text: string): CsvRow[] {
  const splitter = new RowSplitter();
  const cellRows = [...splitter.push(text), ...splitter.flush()];
  const [header, ...rest] = cellRows;
  if (header === undefined) return [];
  const columns = header.map((cell) => cell.trim());
  return rest
    .filter((cells) => !(cells.length === 1 && cells[0] === ""))
    .map((cells) => {
      const row: CsvRow = {};
      for (let i = 0; i < columns.length; i += 1) row[columns[i] as string] = cells[i] ?? "";
      return row;
    });
}
