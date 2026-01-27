import type { ProductRequestDetail } from '@/lib/productRequestApi';

export type IssueRow = { label: string; incorrect?: string; correct?: string };

type IssueDetailsProps = {
  issue: ProductRequestDetail['issue'];
  issueRows: IssueRow[];
};

export function IssueDetails({ issue, issueRows }: IssueDetailsProps) {
  if (!issue && issueRows.length === 0) {
    return null;
  }

  const hasIssueTypes = Boolean(issue?.issueTypes && issue.issueTypes.length > 0);

  return (
    <section>
      <div className="flex items-center gap-2">
        <h3 className="text-sm font-semibold text-gray-800">Issue details</h3>
        {hasIssueTypes && (
          <div className="flex flex-wrap gap-1">
            {issue!.issueTypes!.map((type) => (
              <span key={type} className="rounded-full bg-rose-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-rose-700">
                {type.replace('incorrect', '').replace(/([A-Z])/g, ' $1').trim()}
              </span>
            ))}
          </div>
        )}
      </div>
      {issueRows.length > 0 ? (
        <div className="mt-3 overflow-hidden rounded-xl border border-gray-100">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
              <tr>
                <th className="px-3 py-2">Field</th>
                <th className="px-3 py-2">Current</th>
                <th className="px-3 py-2">Proposed</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {issueRows.map((row) => (
                <tr key={row.label}>
                  <td className="px-3 py-2 font-medium text-gray-900">{row.label}</td>
                  <td className="px-3 py-2 text-gray-600">{row.incorrect || '—'}</td>
                  <td className="px-3 py-2 text-gray-900">{row.correct || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="mt-2 text-xs text-gray-500">Issue types selected but no correction fields provided</p>
      )}
      {issue?.additionalDetails && <p className="mt-2 rounded-lg bg-gray-50 px-3 py-2 text-xs text-gray-600">{issue.additionalDetails}</p>}
    </section>
  );
}
