'use client';

import ExcelJS from 'exceljs';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { formatCurrencyBr, formatDateBr } from '@/lib/domain/cpf';
import type { PaymentRecord, ThemeConfig, TuitionRecord } from '@/lib/domain/types';

export interface ReportExportColumn {
  header: string;
  key: string;
  align?: 'left' | 'right' | 'center';
}

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function fetchLogoDataUrl(theme: ThemeConfig): Promise<string | null> {
  const url = theme.logoFileId
    ? `/api/files/${encodeURIComponent(theme.logoFileId)}`
    : '/images/elefante-rosa-logo.jpg';
  try {
    const resp = await fetch(url, { credentials: 'include' });
    if (!resp.ok) return null;
    const blob = await resp.blob();
    return await new Promise<string>((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(String(reader.result));
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

export async function exportReportToExcel(params: {
  title: string;
  installationName: string;
  subtitle?: string;
  columns: ReportExportColumn[];
  rows: Array<Record<string, string | number>>;
  fileName: string;
}): Promise<void> {
  const { title, installationName, subtitle, columns, rows, fileName } = params;
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'ELEFANTE ROSA – 3 CARROS ESCOLARES';
  workbook.created = new Date();

  const sheet = workbook.addWorksheet('Relatório');

  sheet.addRow([`ELEFANTE ROSA – 3 CARROS ESCOLARES (${installationName})`]);
  sheet.addRow([title]);
  if (subtitle) sheet.addRow([subtitle]);
  sheet.addRow([`Gerado em: ${new Date().toLocaleString('pt-BR')}`]);
  sheet.addRow([]);

  sheet.getRow(1).font = { bold: true, size: 13 };
  sheet.getRow(2).font = { bold: true, size: 11 };

  const headerRow = sheet.addRow(columns.map((c) => c.header));
  headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  headerRow.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFE11D62' },
  };

  for (const row of rows) {
    sheet.addRow(columns.map((c) => row[c.key] ?? ''));
  }

  columns.forEach((col, i) => {
    const column = sheet.getColumn(i + 1);
    let maxLen = col.header.length;
    for (const r of rows) {
      const len = String(r[col.key] ?? '').length;
      if (len > maxLen) maxLen = len;
    }
    column.width = Math.min(48, Math.max(12, maxLen + 4));
  });

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  downloadBlob(blob, fileName.endsWith('.xlsx') ? fileName : `${fileName}.xlsx`);
}

export async function exportReportToPdf(params: {
  title: string;
  installationName: string;
  subtitle?: string;
  columns: ReportExportColumn[];
  rows: Array<Record<string, string | number>>;
  theme: ThemeConfig;
  fileName: string;
}): Promise<void> {
  const { title, installationName, subtitle, columns, rows, theme, fileName } = params;
  const doc = new jsPDF({
    orientation: columns.length > 5 ? 'landscape' : 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const logoDataUrl = await fetchLogoDataUrl(theme);
  if (logoDataUrl) {
    try {
      doc.addImage(logoDataUrl, 'JPEG', 14, 10, 16, 16);
    } catch {
      // ignore invalid image format
    }
  }

  const startX = logoDataUrl ? 34 : 14;
  doc.setFontSize(13);
  doc.setTextColor(theme.secondaryColor || '#0f172a');
  doc.text(`ELEFANTE ROSA – 3 CARROS ESCOLARES`, startX, 16);

  doc.setFontSize(10);
  doc.setTextColor('#475569');
  doc.text(`${installationName} · ${title}`, startX, 22);
  if (subtitle) {
    doc.setFontSize(8.5);
    doc.text(subtitle, startX, 27);
  }
  doc.setFontSize(8);
  doc.text(`Emissão: ${new Date().toLocaleString('pt-BR')}`, 14, 34);

  autoTable(doc, {
    startY: 38,
    head: [columns.map((c) => c.header)],
    body: rows.map((r) => columns.map((c) => String(r[c.key] ?? ''))),
    styles: { fontSize: 8.5, cellPadding: 2.5 },
    headStyles: { fillColor: theme.primaryColor || '#e11d62', textColor: '#ffffff' },
    alternateRowStyles: { fillColor: '#f8fafc' },
  });

  doc.save(fileName.endsWith('.pdf') ? fileName : `${fileName}.pdf`);
}

export async function exportPaymentReceiptPdf(params: {
  installationName: string;
  childName: string;
  guardianName: string;
  tuition: TuitionRecord;
  payment: PaymentRecord;
  theme: ThemeConfig;
}): Promise<void> {
  const { installationName, childName, guardianName, tuition, payment, theme } = params;
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

  const logoDataUrl = await fetchLogoDataUrl(theme);
  if (logoDataUrl) {
    try {
      doc.addImage(logoDataUrl, 'JPEG', 16, 14, 18, 18);
    } catch {
      // ignore
    }
  }

  const x = logoDataUrl ? 38 : 16;
  doc.setFontSize(14);
  doc.setTextColor('#0f172a');
  doc.text('ELEFANTE ROSA – 3 CARROS ESCOLARES', x, 20);
  doc.setFontSize(10);
  doc.setTextColor('#475569');
  doc.text(`${installationName} · Comprovante de Pagamento`, x, 26);

  doc.setDrawColor('#e2e8f0');
  doc.line(16, 36, 194, 36);

  doc.setFontSize(11);
  doc.setTextColor('#0f172a');
  const lines: Array<[string, string]> = [
    ['Recibo Nº:', payment.id],
    ['Criança:', childName],
    ['Responsável:', guardianName],
    [
      'Referência:',
      `${String(tuition.referenceMonth).padStart(2, '0')}/${tuition.referenceYear} (Venc. ${formatDateBr(tuition.dueDate)})`,
    ],
    ['Valor da Mensalidade:', formatCurrencyBr(tuition.amount)],
    ['Valor Pago Neste Lançamento:', formatCurrencyBr(payment.amount)],
    ['Total Pago na Mensalidade:', formatCurrencyBr(tuition.paidAmount)],
    [
      'Saldo Restante:',
      formatCurrencyBr(Math.max(0, tuition.amount - tuition.paidAmount)),
    ],
    ['Forma de Pagamento:', payment.method.toUpperCase()],
    ['Data do Pagamento:', formatDateBr(payment.paymentDate)],
    ['Registrado por:', payment.recordedByName],
  ];

  let y = 46;
  for (const [label, value] of lines) {
    doc.setFont('helvetica', 'bold');
    doc.text(label, 16, y);
    doc.setFont('helvetica', 'normal');
    doc.text(value, 78, y);
    y += 8;
  }

  if (payment.notes) {
    y += 4;
    doc.setFont('helvetica', 'bold');
    doc.text('Observações:', 16, y);
    doc.setFont('helvetica', 'normal');
    doc.text(payment.notes, 16, y + 6, { maxWidth: 176 });
  }

  doc.setFontSize(8.5);
  doc.setTextColor('#64748b');
  doc.text(
    `Documento emitido em ${new Date().toLocaleString('pt-BR')} · ${installationName}`,
    16,
    275
  );

  doc.save(`comprovante-${payment.id}.pdf`);
}

function rgbToHex(r: number, g: number, b: number): string {
  return (
    '#' +
    [r, g, b]
      .map((n) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0'))
      .join('')
  );
}

export async function extractDominantColorsFromImageFile(file: File): Promise<string[]> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        const size = 48;
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          URL.revokeObjectURL(url);
          resolve(['#e11d62', '#0f172a', '#be123c']);
          return;
        }
        ctx.drawImage(img, 0, 0, size, size);
        const { data } = ctx.getImageData(0, 0, size, size);
        const buckets = new Map<string, { count: number; r: number; g: number; b: number }>();

        for (let i = 0; i < data.length; i += 4) {
          const r = data[i];
          const g = data[i + 1];
          const b = data[i + 2];
          const a = data[i + 3];
          if (a < 128) continue;
          // Skip near-pure white & near-pure black background pixels
          if (r > 242 && g > 242 && b > 242) continue;
          const qr = Math.round(r / 32) * 32;
          const qg = Math.round(g / 32) * 32;
          const qb = Math.round(b / 32) * 32;
          const key = `${qr},${qg},${qb}`;
          const prev = buckets.get(key) ?? { count: 0, r: 0, g: 0, b: 0 };
          prev.count += 1;
          prev.r += r;
          prev.g += g;
          prev.b += b;
          buckets.set(key, prev);
        }

        const sorted = Array.from(buckets.values())
          .sort((a, b) => b.count - a.count)
          .slice(0, 5)
          .map((item) => rgbToHex(item.r / item.count, item.g / item.count, item.b / item.count));

        URL.revokeObjectURL(url);
        resolve(sorted.length > 0 ? sorted : ['#e11d62', '#0f172a', '#be123c']);
      } catch {
        URL.revokeObjectURL(url);
        resolve(['#e11d62', '#0f172a', '#be123c']);
      }
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(['#e11d62', '#0f172a', '#be123c']);
    };
    img.src = url;
  });
}
