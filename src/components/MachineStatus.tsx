import { AVAILABILITY, type Availability } from '../lib/domain';
import { Badge } from './ui';
import { fmtDate } from '../lib/util';

export function AvailabilityBadge({ a, detail }: { a: Availability; detail?: boolean }) {
  const info = AVAILABILITY[a.key];
  let extra = '';
  if (detail && a.booking) {
    const b = a.booking;
    if (a.key === 'pujceno' || a.key === 'po_terminu') extra = b.end_date ? ` do ${fmtDate(b.end_date)}` : '';
    else if (a.key === 'rez_pronajem') extra = ` od ${fmtDate(b.start_date)}`;
    if (b.customer_name || b.customer_company) extra += ` · ${b.customer_company || b.customer_name}`;
  }
  if (detail && a.service) extra = ` · ${a.service.number}`;
  return (
    <Badge className={info.color}>
      <span className={`h-1.5 w-1.5 rounded-full ${info.dot}`} />
      {info.label}
      {extra}
    </Badge>
  );
}
