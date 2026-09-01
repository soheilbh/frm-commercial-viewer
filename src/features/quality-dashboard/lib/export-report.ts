'use client';

import { themeBackgroundColor } from '@/features/quality-dashboard/lib/kpi-threshold-colors';

type ExportFormat = 'png' | 'pdf';

type CaptureOptions = {
  cacheBust: boolean;
  pixelRatio: number;
  backgroundColor: string;
  width: number;
  height: number;
  canvasWidth: number;
  canvasHeight: number;
  style: Record<string, string>;
};

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function syncCloneHeights(source: HTMLElement, clone: HTMLElement) {
  const sourceCharts = source.querySelectorAll('.recharts-responsive-container');
  const clonedCharts = clone.querySelectorAll('.recharts-responsive-container');
  clonedCharts.forEach((node, index) => {
    const original = sourceCharts[index] as HTMLElement | undefined;
    const height = original?.getBoundingClientRect().height ?? 0;
    if (height > 0) {
      const el = node as HTMLElement;
      el.style.height = `${height}px`;
      el.style.minHeight = `${height}px`;
    }
  });
}

const EXPORT_COLOR_VARS = [
  '--foreground',
  '--background',
  '--card',
  '--card-foreground',
  '--muted',
  '--muted-foreground',
  '--border',
  '--primary',
  '--destructive',
  '--chart-1',
  '--chart-2',
  '--chart-3',
  '--chart-4',
  '--chart-5',
  '--commercial-good',
  '--commercial-bad',
  '--commercial-feed',
  '--commercial-output',
  '--commercial-quality',
  '--commercial-quality-muted',
  '--commercial-pre-moisture',
  '--commercial-post-moisture',
  '--commercial-mix-plastics',
  '--commercial-mix-organic',
  '--commercial-mix-pvc',
  '--commercial-mix-beverage',
  '--commercial-mix-others',
  '--threshold-within',
  '--threshold-near',
  '--threshold-above',
  '--color-feed',
  '--color-output',
  '--color-value',
  '--color-input',
  '--color-chlorine',
  '--color-pvc',
  '--color-plastics',
  '--color-organic',
  '--color-beverage',
  '--color-others'
] as const;

function normalizeCanvasColor(color: string): string {
  if (!color) return color;
  const rgb = oklchToRgb(color);
  if (rgb) return rgb;
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) return color;
  ctx.fillStyle = '#000';
  ctx.fillStyle = color;
  return ctx.fillStyle || color;
}

function oklchToRgb(color: string): string | null {
  const match = color
    .trim()
    .match(/^oklch\(\s*([0-9.]+%?)\s+([0-9.]+)\s+([0-9.]+)(?:deg)?(?:\s*\/\s*([0-9.]+%?))?\s*\)$/i);
  if (!match) return null;

  const lRaw = match[1];
  const l = lRaw.endsWith('%') ? Number.parseFloat(lRaw) / 100 : Number.parseFloat(lRaw);
  const c = Number.parseFloat(match[2]);
  const h = (Number.parseFloat(match[3]) * Math.PI) / 180;
  const alphaRaw = match[4];
  const alpha = alphaRaw
    ? alphaRaw.endsWith('%')
      ? Number.parseFloat(alphaRaw) / 100
      : Number.parseFloat(alphaRaw)
    : 1;

  if (![l, c, h, alpha].every(Number.isFinite)) return null;

  const a = c * Math.cos(h);
  const b = c * Math.sin(h);
  const l_ = l + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = l - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = l - 0.0894841775 * a - 1.291485548 * b;
  const l3 = l_ ** 3;
  const m3 = m_ ** 3;
  const s3 = s_ ** 3;

  const linearR = 4.0767416621 * l3 - 3.3077115913 * m3 + 0.2309699292 * s3;
  const linearG = -1.2684380046 * l3 + 2.6097574011 * m3 - 0.3413193965 * s3;
  const linearB = -0.0041960863 * l3 - 0.7034186147 * m3 + 1.707614701 * s3;

  const toByte = (value: number) => {
    const v = Math.min(1, Math.max(0, value));
    const srgb = v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055;
    return Math.round(Math.min(1, Math.max(0, srgb)) * 255);
  };

  const r = toByte(linearR);
  const g = toByte(linearG);
  const blue = toByte(linearB);
  if (alpha < 1) return `rgba(${r}, ${g}, ${blue}, ${Math.max(0, Math.min(1, alpha))})`;
  return `rgb(${r}, ${g}, ${blue})`;
}

function resolveColorVarInContext(context: HTMLElement, cssVarName: string): string {
  const probe = document.createElement('span');
  probe.style.color = `var(${cssVarName})`;
  probe.style.display = 'none';
  context.appendChild(probe);
  const resolved = getComputedStyle(probe).color;
  context.removeChild(probe);
  return normalizeCanvasColor(resolved || getComputedStyle(context).getPropertyValue(cssVarName).trim());
}

function collectResolvedExportColors(source: HTMLElement): Record<string, string> {
  const context = (source.querySelector('.commercial-report-body') as HTMLElement | null) ?? source;
  const colors: Record<string, string> = {};
  EXPORT_COLOR_VARS.forEach((name) => {
    const value = resolveColorVarInContext(context, name);
    if (value) colors[name] = value;
  });
  return colors;
}

function applyResolvedExportColors(clonedDocument: Document, clonedElement: HTMLElement, colors: Record<string, string>) {
  const targets = [
    clonedDocument.documentElement,
    clonedDocument.body,
    clonedElement,
    ...(Array.from(clonedElement.querySelectorAll('.commercial-report-body')) as HTMLElement[])
  ].filter(Boolean) as HTMLElement[];

  targets.forEach((target) => {
    Object.entries(colors).forEach(([name, value]) => {
      target.style.setProperty(name, value);
    });
  });
}

function freezeChartVariables(source: HTMLElement, clone: HTMLElement) {
  const sourceCharts = Array.from(source.querySelectorAll('[data-chart]')) as HTMLElement[];
  const clonedCharts = Array.from(clone.querySelectorAll('[data-chart]')) as HTMLElement[];

  clonedCharts.forEach((chart, index) => {
    const original = sourceCharts[index];
    if (!original) return;
    EXPORT_COLOR_VARS.forEach((name) => {
      if (!name.startsWith('--color-')) return;
      const value = resolveColorVarInContext(original, name);
      if (value) chart.style.setProperty(name, value);
    });
  });
}

function isPaintValue(value: string | null): boolean {
  if (!value) return false;
  const text = value.trim();
  return Boolean(text) && text !== 'none' && !text.startsWith('url(');
}

function freezeSvgPaints(source: HTMLElement, clone: HTMLElement) {
  const sourceNodes = Array.from(source.querySelectorAll('svg *')) as SVGElement[];
  const clonedNodes = Array.from(clone.querySelectorAll('svg *')) as SVGElement[];

  clonedNodes.forEach((node, index) => {
    const original = sourceNodes[index];
    if (!original) return;
    const computed = getComputedStyle(original);

    const fillAttr = original.getAttribute('fill') ?? node.getAttribute('fill');
    if (isPaintValue(fillAttr)) {
      const fill = normalizeCanvasColor(computed.fill);
      if (fill && fill !== 'none') node.setAttribute('fill', fill);
    }

    const strokeAttr = original.getAttribute('stroke') ?? node.getAttribute('stroke');
    if (isPaintValue(strokeAttr)) {
      const stroke = normalizeCanvasColor(computed.stroke);
      if (stroke && stroke !== 'none') node.setAttribute('stroke', stroke);
    }
  });
}

function freezePngPaintsInPlace(element: HTMLElement): () => void {
  const restores: Array<() => void> = [];

  const chartNodes = Array.from(element.querySelectorAll('[data-chart]')) as HTMLElement[];
  chartNodes.forEach((chart) => {
    EXPORT_COLOR_VARS.forEach((name) => {
      if (!name.startsWith('--color-')) return;
      const previous = chart.style.getPropertyValue(name);
      const value = resolveColorVarInContext(chart, name);
      if (!value) return;
      chart.style.setProperty(name, value);
      restores.push(() => {
        if (previous) chart.style.setProperty(name, previous);
        else chart.style.removeProperty(name);
      });
    });
  });

  const svgNodes = Array.from(element.querySelectorAll('svg *')) as SVGElement[];
  svgNodes.forEach((node) => {
    const computed = getComputedStyle(node);
    const fillAttr = node.getAttribute('fill');
    if (isPaintValue(fillAttr)) {
      const previous = fillAttr;
      const fill = normalizeCanvasColor(computed.fill);
      if (fill && fill !== 'none') {
        node.setAttribute('fill', fill);
        restores.push(() => {
          if (previous == null) node.removeAttribute('fill');
          else node.setAttribute('fill', previous);
        });
      }
    }

    const strokeAttr = node.getAttribute('stroke');
    if (isPaintValue(strokeAttr)) {
      const previous = strokeAttr;
      const stroke = normalizeCanvasColor(computed.stroke);
      if (stroke && stroke !== 'none') {
        node.setAttribute('stroke', stroke);
        restores.push(() => {
          if (previous == null) node.removeAttribute('stroke');
          else node.setAttribute('stroke', previous);
        });
      }
    }
  });

  return () => {
    for (let i = restores.length - 1; i >= 0; i -= 1) {
      restores[i]();
    }
  };
}

function buildCaptureOptions(element: HTMLElement, pixelRatio: number): CaptureOptions {
  const rect = element.getBoundingClientRect();
  const width = Math.ceil(Math.max(element.offsetWidth, element.scrollWidth, rect.width));
  const height = Math.ceil(Math.max(element.offsetHeight, element.scrollHeight, rect.height));

  if (width < 1 || height < 1) {
    throw new Error('Report is not ready for export. Enable A4 layout and try again.');
  }

  const backgroundColor = themeBackgroundColor();

  return {
    cacheBust: true,
    pixelRatio,
    backgroundColor,
    width,
    height,
    canvasWidth: width,
    canvasHeight: height,
    style: {
      margin: '0',
      position: 'relative',
      left: '0',
      top: '0',
      transform: 'none',
      zoom: '1',
      backgroundColor
    }
  };
}

async function waitForPaint() {
  await document.fonts.ready;
  await new Promise<void>((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  });
}

/** Native print → Save as PDF keeps real text (searchable / OCR-friendly). */
async function exportElementPrintPdf(filenameBase: string) {
  const previousTitle = document.title;
  document.title = filenameBase;
  await new Promise<void>((resolve) => {
    const onAfterPrint = () => {
      window.removeEventListener('afterprint', onAfterPrint);
      document.title = previousTitle;
      resolve();
    };
    window.addEventListener('afterprint', onAfterPrint);
    window.print();
  });
}

async function withLightReportMode<T>(work: () => Promise<T>): Promise<T> {
  const root = document.documentElement;
  const previousClassName = root.className;
  const previousColorScheme = root.style.colorScheme;

  root.classList.remove('dark');
  root.classList.add('light');
  root.style.colorScheme = 'light';

  try {
    await waitForPaint();
    return await work();
  } finally {
    root.className = previousClassName;
    root.style.colorScheme = previousColorScheme;
  }
}

export async function exportReportElement(
  element: HTMLElement,
  format: ExportFormat,
  filenameBase: string
) {
  await waitForPaint();

  if (format === 'pdf') {
    await withLightReportMode(() => exportElementPrintPdf(filenameBase));
    return;
  }

  const { toPng } = await import('html-to-image');
  const dataUrl = await withLightReportMode(async () => {
    const restorePaints = freezePngPaintsInPlace(element);
    try {
      await waitForPaint();
      return await toPng(element, buildCaptureOptions(element, 2));
    } finally {
      restorePaints();
    }
  });
  const response = await fetch(dataUrl);
  const blob = await response.blob();
  downloadBlob(blob, `${filenameBase}.png`);
}

function exportTimestampSlug(date: Date, timeZone = 'Europe/Amsterdam'): string {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  })
    .formatToParts(date)
    .reduce<Record<string, string>>((acc, part) => {
      if (part.type !== 'literal') acc[part.type] = part.value;
      return acc;
    }, {});

  return `${parts.year}-${parts.month}-${parts.day}-${parts.hour}${parts.minute}`;
}

export function reportFilename(
  title: string,
  generatedAt: string,
  options?: {
    weekNumber?: number | null;
    exportedAt?: Date;
    timeZone?: string;
  }
): string {
  const day = generatedAt.slice(0, 10);
  const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  const week = options?.weekNumber ? `-w${options.weekNumber}` : '';
  const exportedAt = options?.exportedAt
    ? `-export-${exportTimestampSlug(options.exportedAt, options.timeZone)}`
    : '';
  return `${slug}${week}-${day}${exportedAt}`;
}
