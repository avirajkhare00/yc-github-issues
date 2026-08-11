import { Issue } from '../services/githubService';
import Image from 'next/image';

interface IssueCardProps {
  issue: Issue;
  isPR?: boolean;
}

/**
 * Renders a relative age like "3d ago", which reads faster than a date when
 * scanning for something recently active.
 * @param dateString ISO timestamp
 * @returns Short relative description
 */
function timeAgo(dateString: string) {
  const days = Math.floor((Date.now() - new Date(dateString).getTime()) / 86_400_000);

  if (days < 1) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 30) return `${days}d ago`;
  if (days < 365) return `${Math.floor(days / 30)}mo ago`;

  return `${Math.floor(days / 365)}y ago`;
}

export default function IssueCard({ issue, isPR = false }: IssueCardProps) {
  return (
    <article
      className={`group relative flex flex-col rounded-xl border p-4 transition-all hover:shadow-lg hover:-translate-y-0.5 ${
        isPR
          ? 'border-purple-200 dark:border-purple-900 bg-purple-50/50 dark:bg-purple-950/20'
          : 'border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950/40'
      }`}
    >
      <div className="flex items-center gap-2 mb-3 text-xs">
        <a
          href={`https://github.com/${issue.repository_name}`}
          target="_blank"
          rel="noopener noreferrer"
          className="font-medium text-gray-700 dark:text-gray-300 hover:text-blue-600 dark:hover:text-blue-400 truncate"
        >
          {issue.repository_name}
        </a>

        {issue.language && (
          <span className="shrink-0 px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400">
            {issue.language}
          </span>
        )}

        {isPR && (
          <span className="shrink-0 px-1.5 py-0.5 rounded bg-purple-100 dark:bg-purple-900 text-purple-800 dark:text-purple-200 font-medium">
            PR
          </span>
        )}
      </div>

      <h3 className="text-base font-semibold leading-snug mb-3 line-clamp-3">
        <a
          href={issue.html_url}
          target="_blank"
          rel="noopener noreferrer"
          className="hover:text-blue-600 dark:hover:text-blue-400 after:absolute after:inset-0"
        >
          {issue.title}
        </a>
      </h3>

      {issue.labels.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-3">
          {issue.labels.slice(0, 4).map(label => (
            <span
              key={label.name}
              className="px-1.5 py-0.5 text-[11px] rounded-full leading-tight"
              style={{
                backgroundColor: `#${label.color}`,
                color: parseInt(label.color, 16) > 0xffffff / 2 ? '#000' : '#fff'
              }}
            >
              {label.name}
            </span>
          ))}
        </div>
      )}

      <div className="mt-auto flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
        <Image
          src={issue.user.avatar_url}
          alt=""
          width={16}
          height={16}
          className="rounded-full"
        />
        <span className="truncate">{issue.user.login}</span>
        <span aria-hidden="true">·</span>
        <span className="shrink-0">#{issue.number}</span>
        <span aria-hidden="true">·</span>
        <span className="shrink-0">{timeAgo(issue.updated_at)}</span>

        <span className="ml-auto flex items-center gap-2 shrink-0">
          {issue.comments > 0 && (
            <span title={`${issue.comments} comments`}>💬 {issue.comments}</span>
          )}
          {issue.is_assigned && (
            <span
              className="px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-800"
              title="Someone is already assigned"
            >
              taken
            </span>
          )}
        </span>
      </div>
    </article>
  );
}
