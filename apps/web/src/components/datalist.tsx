import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';

export interface Column<T> {
  header: string;
  cell: (row: T) => ReactNode;
  className?: string;
  /** Hide this column in the compact card layout. */
  hideOnCard?: boolean;
}

/** A table on wide screens and stacked cards on phones — no horizontal page scrolling. */
export function DataList<T>({
  rows,
  columns,
  rowKey,
  href,
  title,
}: {
  rows: T[];
  columns: Column<T>[];
  rowKey: (row: T) => string;
  href?: (row: T) => string;
  title?: (row: T) => ReactNode;
}) {
  return (
    <>
      <div className="hidden overflow-hidden rounded-2xl border border-line bg-white md:block">
        <table className="data-table min-w-0">
          <thead>
            <tr>
              {columns.map((c) => (
                <th key={c.header} scope="col" className={c.className}>
                  {c.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={rowKey(r)} className={href ? 'hover:bg-ivory-50' : undefined}>
                {columns.map((c, i) => (
                  <td key={c.header} className={c.className}>
                    {href && i === 0 ? (
                      <Link to={href(r)} className="font-medium text-forest-800 hover:underline">
                        {c.cell(r)}
                      </Link>
                    ) : (
                      c.cell(r)
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ul className="flex flex-col gap-2 md:hidden">
        {rows.map((r) => {
          const body = (
            <>
              <div className="mb-1.5 font-semibold">{title ? title(r) : columns[0]!.cell(r)}</div>
              <dl className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-sm">
                {columns
                  .slice(1)
                  .filter((c) => !c.hideOnCard)
                  .map((c) => (
                    <div key={c.header} className="min-w-0">
                      <dt className="text-xs text-ink-muted">{c.header}</dt>
                      <dd className="min-w-0 break-words">{c.cell(r)}</dd>
                    </div>
                  ))}
              </dl>
            </>
          );
          return (
            <li key={rowKey(r)}>
              {href ? (
                <Link to={href(r)} className="card block p-3.5 hover:shadow-card">
                  {body}
                </Link>
              ) : (
                <div className="card p-3.5">{body}</div>
              )}
            </li>
          );
        })}
      </ul>
    </>
  );
}

export function FilterBar({ children, onReset }: { children: ReactNode; onReset?: () => void }) {
  return (
    <div className="card mb-4 grid gap-3 p-3.5 sm:grid-cols-2 lg:grid-cols-4">
      {children}
      {onReset && (
        <div className="flex items-end">
          <button className="btn btn-ghost btn-sm w-full sm:w-auto" onClick={onReset} type="button">
            Reset filters
          </button>
        </div>
      )}
    </div>
  );
}

export function FilterField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block min-w-0">
      <span className="label text-xs">{label}</span>
      {children}
    </label>
  );
}
