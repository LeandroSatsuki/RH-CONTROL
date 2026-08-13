import ExcelJS from "exceljs";

export async function downloadExcel(
  rows: Record<string, unknown>[],
  sheetName: string,
  fileName: string
) {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet(sheetName.slice(0, 31));
  const headers = Array.from(new Set(rows.flatMap(row => Object.keys(row))));
  worksheet.columns = headers.map(header => ({ header, key: header, width: Math.max(12, Math.min(32, header.length + 4)) }));
  rows.forEach(row => {
    if (!Object.keys(row).length) worksheet.addRow([]);
    else worksheet.addRow(Object.fromEntries(headers.map(header => [header, row[header] ?? ""])));
  });
  worksheet.getRow(1).font = { bold: true };
  worksheet.views = [{ state: "frozen", ySplit: 1 }];
  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([new Uint8Array(buffer)], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName.endsWith(".xlsx") ? fileName : `${fileName}.xlsx`;
  link.click();
  URL.revokeObjectURL(url);
}

export async function readFirstExcelSheet(buffer: ArrayBuffer): Promise<Record<string, unknown>[]> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  const worksheet = workbook.worksheets[0];
  if (!worksheet) return [];
  const headers: string[] = [];
  worksheet.getRow(1).eachCell({ includeEmpty: true }, (cell, column) => {
    headers[column - 1] = cellText(cell.value);
  });
  const rows: Record<string, unknown>[] = [];
  worksheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    const record: Record<string, unknown> = {};
    headers.forEach((header, index) => {
      if (header) record[header] = cellValue(row.getCell(index + 1).value);
    });
    if (Object.values(record).some(value => String(value ?? "").trim())) rows.push(record);
  });
  return rows;
}

function cellValue(value: ExcelJS.CellValue): unknown {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (value && typeof value === "object") {
    if ("result" in value) return value.result ?? "";
    if ("text" in value) return value.text;
    if ("richText" in value) return value.richText.map(part => part.text).join("");
  }
  return value ?? "";
}

function cellText(value: ExcelJS.CellValue) {
  return String(cellValue(value)).trim();
}
