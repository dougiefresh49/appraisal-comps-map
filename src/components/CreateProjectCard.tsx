import Link from "next/link";

export function CreateProjectCard() {
  return (
    <Link
      href="/projects/new"
      className="group flex h-full min-h-[200px] flex-col items-center justify-center rounded-xl border-2 border-dashed border-gray-200 bg-gray-50 p-6 transition-all hover:border-blue-400 hover:bg-blue-50/50 dark:border-gray-700 dark:bg-gray-800/50 dark:hover:border-blue-500 dark:hover:bg-gray-800"
    >
      <div className="mb-4 rounded-full bg-white p-3 shadow-sm ring-1 ring-gray-200 transition-all group-hover:bg-blue-500 group-hover:ring-blue-500 dark:bg-gray-700 dark:ring-gray-600">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="24"
          height="24"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="text-gray-400 transition-colors group-hover:text-white dark:text-gray-300"
        >
          <path d="M5 12h14" />
          <path d="M12 5v14" />
        </svg>
      </div>
      <h3 className="text-sm font-semibold text-gray-900 group-hover:text-blue-700 dark:text-gray-200 dark:group-hover:text-blue-400">
        Create New Project
      </h3>
      <p className="mt-1 text-center text-xs text-gray-500 group-hover:text-blue-600/70 dark:text-gray-400 dark:group-hover:text-blue-400/70">
        Start a new appraisal project <br /> from scratch or template
      </p>
    </Link>
  );
}
