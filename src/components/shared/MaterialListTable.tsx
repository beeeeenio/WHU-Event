import { Fragment } from 'react';
import { groupMaterialList } from '../../domain/materialList';
import type { MaterialListItem } from '../../domain/types';

interface Props {
  items: MaterialListItem[];
}

export function MaterialListTable({ items }: Props) {
  if (items.length === 0) {
    return <p className="text-sm text-[var(--color-text-muted)]">Keine Bauteile für diese Maße.</p>;
  }

  const groups = groupMaterialList(items);
  let displayPos = 0;

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="text-left text-[var(--color-text-muted)] border-b border-[var(--color-border)]">
            <th className="py-1.5 pr-2 font-medium">Pos</th>
            <th className="py-1.5 pr-2 font-medium">Artikel</th>
            <th className="py-1.5 pr-2 font-medium">Art.-Nr.</th>
            <th className="py-1.5 pr-2 font-medium text-right">Menge</th>
            <th className="py-1.5 font-medium">Einheit</th>
          </tr>
        </thead>
        <tbody>
          {groups.map(([gruppe, groupItems]) => (
            <Fragment key={gruppe}>
              <tr>
                <td colSpan={5} className="pt-3 pb-1 text-xs font-semibold tracking-wide text-[var(--color-accent)]">
                  {gruppe}
                </td>
              </tr>
              {groupItems.map((item) => {
                displayPos += 1;
                return (
                  <tr key={item.pos} className="border-b border-[var(--color-border)]/60">
                    <td className="py-1.5 pr-2 text-[var(--color-text-muted)]">{displayPos}</td>
                    <td className="py-1.5 pr-2 text-[var(--color-text)]">{item.artikel}</td>
                    <td className="py-1.5 pr-2 text-[var(--color-text-muted)]">{item.artikelNr ?? '–'}</td>
                    <td className="py-1.5 pr-2 text-right tabular-nums text-[var(--color-text)]">{item.menge}</td>
                    <td className="py-1.5 text-[var(--color-text-muted)]">{item.einheit}</td>
                  </tr>
                );
              })}
            </Fragment>
          ))}
        </tbody>
      </table>
    </div>
  );
}
