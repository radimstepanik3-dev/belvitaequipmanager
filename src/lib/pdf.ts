import type { Content, TDocumentDefinitions, TableCell } from 'pdfmake/interfaces';
import { backend } from './backend';
import { blobToDataUrl, resizeImage } from './media';
import type { CompanySettings, Machine, Media, RentalRate, ServiceOrder, ServicePart, ServiceWork } from './types';
import { fmtDate, fmtDateTime, machineTitle, money, number, today } from './util';
import { SERVICE_STATUS } from './domain';

async function pdfMake() {
  const [{ default: pm }, { default: vfs }] = await Promise.all([
    import('pdfmake/build/pdfmake'),
    import('pdfmake/build/vfs_fonts'),
  ]);
  (pm as unknown as { vfs: unknown }).vfs = (vfs as { pdfMake?: { vfs: unknown } }).pdfMake?.vfs ?? vfs;
  return pm;
}

const ACCENT = '#d97706';

function companyHeader(s: CompanySettings): Content {
  const line2 = [s.address, s.ico && `IČO: ${s.ico}`, s.dic && `DIČ: ${s.dic}`].filter(Boolean).join('  ·  ');
  const line3 = [s.phone, s.email, s.web].filter(Boolean).join('  ·  ');
  return {
    stack: [
      { text: s.company_name, fontSize: 15, bold: true, color: '#0f172a' },
      line2 ? { text: line2, fontSize: 8, color: '#475569' } : '',
      line3 ? { text: line3, fontSize: 8, color: '#475569' } : '',
    ],
    margin: [0, 0, 0, 6],
  };
}

// pdfmake mění předané objekty → pro každý dokument vytvořit nové
const hr = (): Content => ({
  canvas: [{ type: 'line', x1: 0, y1: 0, x2: 515, y2: 0, lineWidth: 1.5, lineColor: ACCENT }],
  margin: [0, 2, 0, 10],
});

const baseStyles = (): TDocumentDefinitions['styles'] => ({
  h1: { fontSize: 18, bold: true, margin: [0, 0, 0, 2] },
  h2: { fontSize: 11, bold: true, color: ACCENT, margin: [0, 12, 0, 4] },
  th: { bold: true, fontSize: 8, color: '#ffffff', fillColor: '#0f172a' },
  small: { fontSize: 8, color: '#475569' },
});

async function thumb(path: string): Promise<string | null> {
  try {
    const url = await backend.fileUrl(path);
    if (!url) return null;
    const blob = await (await fetch(url)).blob();
    return blobToDataUrl(await resizeImage(blob, 300, 0.75));
  } catch {
    return null;
  }
}

// ============================================================
//  CENÍK PŮJČOVNY
// ============================================================

export interface PriceListOptions {
  withVat: boolean;
  withPhotos: boolean;
  columns: { hour: boolean; day: boolean; weekend: boolean; week: boolean; month: boolean; deposit: boolean; operator: boolean };
}

export async function priceListPdf(
  machines: Machine[],
  rates: Map<string, RentalRate>,
  media: Map<string, Media>,
  s: CompanySettings,
  opt: PriceListOptions,
) {
  const pm = await pdfMake();
  const k = opt.withVat ? 1 + s.vat_rate / 100 : 1;
  const p = (v: number | null | undefined) => (v == null ? '—' : money(Math.round(v * k)));

  const cols: { key: keyof PriceListOptions['columns']; label: string; get: (r: RentalRate) => number | null }[] = [
    { key: 'hour', label: 'Hodina', get: (r) => r.price_hour },
    { key: 'day', label: 'Den', get: (r) => r.price_day },
    { key: 'weekend', label: 'Víkend', get: (r) => r.price_weekend },
    { key: 'week', label: 'Týden', get: (r) => r.price_week },
    { key: 'month', label: 'Měsíc', get: (r) => r.price_month },
    { key: 'deposit', label: 'Kauce', get: (r) => r.deposit },
    { key: 'operator', label: 'Obsluha/h', get: (r) => r.operator_hour },
  ];
  const active = cols.filter((c) => opt.columns[c.key]);

  const byCat = new Map<string, Machine[]>();
  for (const m of machines) {
    const c = m.category || 'Ostatní';
    byCat.set(c, [...(byCat.get(c) ?? []), m]);
  }

  const thumbs = new Map<string, string>();
  if (opt.withPhotos) {
    await Promise.all(
      machines.map(async (m) => {
        const cover = m.cover_media_id ? media.get(m.cover_media_id) : undefined;
        if (cover) {
          const d = await thumb(cover.path);
          if (d) thumbs.set(m.id, d);
        }
      }),
    );
  }

  const content: Content[] = [companyHeader(s), hr(), { text: s.pricelist_title, style: 'h1' }];
  content.push({
    text: `Platnost od ${fmtDate(today())}  ·  ceny ${opt.withVat ? `včetně ${s.vat_rate} % DPH` : 'bez DPH'}`,
    style: 'small',
    margin: [0, 0, 0, 8],
  });

  const widths: (string | number)[] = [...(opt.withPhotos ? [52] : []), '*', ...active.map(() => 'auto')];

  for (const [cat, list] of [...byCat.entries()].sort((a, b) => a[0].localeCompare(b[0], 'cs'))) {
    content.push({ text: cat, style: 'h2' });
    const header: TableCell[] = [
      ...(opt.withPhotos ? [{ text: '', style: 'th' }] : []),
      { text: 'Stroj', style: 'th' },
      ...active.map((c) => ({ text: c.label, style: 'th', alignment: 'right' as const })),
    ];
    const body: TableCell[][] = [header];
    for (const m of list.sort((a, b) => machineTitle(a).localeCompare(machineTitle(b), 'cs'))) {
      const r = rates.get(m.id)!;
      const params = [
        m.year && `r. v. ${m.year}`,
        m.weight_kg && `${number(m.weight_kg)} kg`,
        m.power_kw && `${number(m.power_kw)} kW`,
      ]
        .filter(Boolean)
        .join(' · ');
      const img = thumbs.get(m.id);
      body.push([
        ...(opt.withPhotos ? [img ? { image: img, fit: [48, 36] as [number, number] } : { text: '' }] : []),
        {
          stack: [
            { text: machineTitle(m), bold: true, fontSize: 9 },
            { text: [m.brand, m.model].filter(Boolean).join(' ') + (params ? `  ·  ${params}` : ''), fontSize: 7, color: '#475569' },
            r.note ? { text: r.note, fontSize: 7, italics: true, color: '#64748b' } : '',
          ],
        },
        ...active.map((c) => ({ text: p(c.get(r)), alignment: 'right' as const, fontSize: 9, noWrap: true })),
      ]);
    }
    content.push({
      table: { headerRows: 1, widths, body, dontBreakRows: true },
      layout: {
        hLineColor: () => '#e2e8f0',
        vLineWidth: () => 0,
        hLineWidth: (i: number) => (i === 1 ? 0 : 0.5),
        fillColor: (row: number) => (row > 0 && row % 2 === 0 ? '#f8fafc' : null),
        paddingTop: () => 4,
        paddingBottom: () => 4,
      },
    });
  }

  if (s.pricelist_terms) {
    content.push({ text: 'Podmínky pronájmu', style: 'h2' });
    content.push({ text: s.pricelist_terms, fontSize: 8, color: '#334155' });
  }

  const doc: TDocumentDefinitions = {
    pageSize: 'A4',
    pageMargins: [40, 36, 40, 44],
    defaultStyle: { font: 'Roboto', fontSize: 9 },
    styles: baseStyles(),
    content,
    footer: (page, pages) => ({
      columns: [
        { text: `${s.company_name}  ·  ${s.pricelist_title}`, fontSize: 7, color: '#94a3b8' },
        { text: `${page} / ${pages}`, alignment: 'right', fontSize: 7, color: '#94a3b8' },
      ],
      margin: [40, 12, 40, 0],
    }),
    info: { title: s.pricelist_title },
  };
  pm.createPdf(doc).download(`cenik-pujcovny-${today()}.pdf`);
}

// ============================================================
//  SERVISNÍ ZAKÁZKA / PRACOVNÍ LIST
// ============================================================

export async function serviceOrderPdf(
  o: ServiceOrder,
  m: Machine,
  work: ServiceWork[],
  parts: ServicePart[],
  s: CompanySettings,
) {
  const pm = await pdfMake();
  const laborHours = work.reduce((a, w) => a + (w.hours || 0), 0);
  const laborTotal = laborHours * (o.labor_rate || 0);
  const partsTotal = parts.reduce((a, p) => a + p.quantity * p.unit_price, 0);
  const total = laborTotal + partsTotal;
  const vat = (total * s.vat_rate) / 100;

  const kv = (rows: [string, string][]): Content => ({
    table: {
      widths: [110, '*'],
      body: rows.map(([k, v]) => [{ text: k, color: '#475569' }, { text: v || '—' }]),
    },
    layout: 'noBorders',
    fontSize: 9,
  });

  const content: Content[] = [
    companyHeader(s),
    hr(),
    {
      columns: [
        { text: 'Servisní zakázka – pracovní list', style: 'h1' },
        { text: o.number, style: 'h1', alignment: 'right', color: ACCENT },
      ],
    },
    { text: `Stav: ${SERVICE_STATUS[o.status].label}`, style: 'small', margin: [0, 0, 0, 6] },
    {
      columns: [
        [
          { text: 'Stroj', style: 'h2' },
          kv([
            ['Název', machineTitle(m)],
            ['Značka / typ', [m.brand, m.model].filter(Boolean).join(' ')],
            ['Výrobní číslo', m.serial_number],
            ['Rok výroby', m.year ? String(m.year) : ''],
            ['Motohodiny při příjmu', o.hours_at_intake != null ? number(o.hours_at_intake, 'mth') : ''],
          ]),
        ],
        [
          { text: 'Zákazník', style: 'h2' },
          kv([
            ['Jméno / firma', o.customer_name],
            ['Telefon', o.customer_phone],
            ['E-mail', o.customer_email],
            ['Přijato', fmtDateTime(o.received_at)],
            ['Přijal', o.received_by],
          ]),
        ],
      ],
      columnGap: 20,
    },
    { text: 'Popis závady (dle zákazníka)', style: 'h2' },
    { text: o.fault_description || '—' },
    ...(o.intake_condition || o.accessories
      ? [
          { text: 'Stav stroje při příjmu / příslušenství', style: 'h2' } as Content,
          { text: [o.intake_condition, o.accessories && `Příslušenství: ${o.accessories}`].filter(Boolean).join('\n') } as Content,
        ]
      : []),
    ...(o.diagnosis ? [{ text: 'Diagnostika', style: 'h2' } as Content, { text: o.diagnosis } as Content] : []),
    { text: 'Provedené práce', style: 'h2' },
    work.length
      ? {
          table: {
            headerRows: 1,
            widths: [60, 80, '*', 40],
            body: [
              ['Datum', 'Technik', 'Popis práce', 'Hod.'].map((t) => ({ text: t, style: 'th' })),
              ...[...work]
                .sort((a, b) => a.date.localeCompare(b.date))
                .map((w) => [fmtDate(w.date), w.technician, w.description, { text: number(w.hours), alignment: 'right' as const }]),
            ],
          },
          layout: 'lightHorizontalLines',
        }
      : { text: 'Zatím nezapsány.', style: 'small' },
    { text: 'Náhradní díly a materiál', style: 'h2' },
    parts.length
      ? {
          table: {
            headerRows: 1,
            widths: [70, '*', 45, 60, 65],
            body: [
              ['Kat. číslo', 'Název', 'Množ.', 'Cena/j.', 'Celkem'].map((t) => ({ text: t, style: 'th' })),
              ...parts.map((p) => [
                p.part_number,
                p.name,
                { text: `${number(p.quantity)} ${p.unit}`, alignment: 'right' as const },
                { text: money(p.unit_price), alignment: 'right' as const },
                { text: money(p.quantity * p.unit_price), alignment: 'right' as const },
              ]),
            ],
          },
          layout: 'lightHorizontalLines',
        }
      : { text: 'Bez náhradních dílů.', style: 'small' },
    {
      margin: [0, 14, 0, 0],
      table: {
        widths: ['*', 110],
        body: [
          [`Práce (${number(laborHours)} h × ${money(o.labor_rate)})`, { text: money(laborTotal), alignment: 'right' }],
          ['Náhradní díly', { text: money(partsTotal), alignment: 'right' }],
          [{ text: 'Celkem bez DPH', bold: true }, { text: money(total), alignment: 'right', bold: true }],
          [`DPH ${s.vat_rate} %`, { text: money(vat), alignment: 'right' }],
          [
            { text: 'Celkem s DPH', bold: true, fontSize: 11 },
            { text: money(total + vat), alignment: 'right', bold: true, fontSize: 11, color: ACCENT },
          ],
        ],
      },
      layout: 'lightHorizontalLines',
    },
    ...(o.completion_notes || o.completed_at
      ? [
          { text: 'Dokončení opravy', style: 'h2' } as Content,
          { text: [o.completed_at && `Dokončeno: ${fmtDateTime(o.completed_at)}`, o.completion_notes].filter(Boolean).join('\n') } as Content,
        ]
      : []),
    {
      margin: [0, 40, 0, 0],
      columns: [
        { stack: [{ text: '…………………………………………' }, { text: 'Za servis (podpis)', style: 'small' }] },
        { stack: [{ text: '…………………………………………' }, { text: 'Zákazník – převzal (podpis)', style: 'small' }], alignment: 'right' },
      ],
    },
  ];

  const doc: TDocumentDefinitions = {
    pageSize: 'A4',
    pageMargins: [40, 36, 40, 44],
    defaultStyle: { font: 'Roboto', fontSize: 9 },
    styles: baseStyles(),
    content,
    footer: (page, pages) => ({
      columns: [
        { text: `${s.company_name}  ·  zakázka ${o.number}`, fontSize: 7, color: '#94a3b8' },
        { text: `${page} / ${pages}`, alignment: 'right', fontSize: 7, color: '#94a3b8' },
      ],
      margin: [40, 12, 40, 0],
    }),
    info: { title: `Zakázka ${o.number}` },
  };
  pm.createPdf(doc).download(`zakazka-${o.number}.pdf`);
}
