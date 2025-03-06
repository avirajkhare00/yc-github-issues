import { Issue } from '../services/githubService';
import Image from 'next/image';

interface IssueCardProps {
  issue: Issue;
}

export default function IssueCard({ issue }: IssueCardProps) {
  // Format date to be more readable
  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  return (
    <div className="border border-gray-200 dark:border-gray-800 rounded-lg p-4 hover:shadow-md transition-shadow">
      <div className="flex items-center gap-2 mb-2">
        <Image
          src={issue.user.avatar_url}
          alt={`${issue.user.login}'s avatar`}
          width={24}
          height={24}
          className="rounded-full"
        />
        <a 
          href={issue.user.html_url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-sm text-gray-600 dark:text-gray-400 hover:underline"
        >
          {issue.user.login}
        </a>
      </div>
      
      <h3 className="text-lg font-semibold mb-2 line-clamp-2">
        <a 
          href={issue.html_url}
          target="_blank"
          rel="noopener noreferrer"
          className="hover:text-blue-600 dark:hover:text-blue-400"
        >
          {issue.title}
        </a>
      </h3>
      
      <div className="text-sm text-gray-500 dark:text-gray-400 mb-3">
        <span>#{issue.number}</span>
        <span className="mx-2">•</span>
        <span>Updated {formatDate(issue.updated_at)}</span>
      </div>
      
      <div className="mb-3">
        <a 
          href={`https://github.com/${issue.repository_name}`}
          target="_blank"
          rel="noopener noreferrer"
          className="text-sm font-medium text-gray-700 dark:text-gray-300 hover:underline"
        >
          {issue.repository_name}
        </a>
      </div>
      
      <div className="flex flex-wrap gap-2">
        {issue.labels.map((label) => (
          <span
            key={label.name}
            className="px-2 py-1 text-xs rounded-full"
            style={{
              backgroundColor: `#${label.color}`,
              color: parseInt(label.color, 16) > 0xffffff / 2 ? '#000' : '#fff'
            }}
          >
            {label.name}
          </span>
        ))}
      </div>
    </div>
  );
}
