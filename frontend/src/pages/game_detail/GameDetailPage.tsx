import type { ReactElement } from 'react';
import { useParams, Link } from 'react-router-dom';

export default function GameDetailPage(): ReactElement {
  const { slug } = useParams<{ slug: string }>();

  return (
    <div className="max-w-6xl mx-auto px-4 py-12">
      <Link
        to="/"
        className="text-blue-500 hover:underline mb-8 inline-block text-sm"
      >
        &larr; Back to Search
      </Link>

      <div className="bg-[#161b22] border border-gray-800 rounded-2xl p-8 shadow-xl">
        <h1 className="text-4xl font-extrabold text-white mb-4">
          {slug?.replace(/-/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase())}
        </h1>
        <p className="text-gray-400 text-lg">
          Game details for{' '}
          <span className="text-blue-400 font-mono">"{slug}"</span> will appear
          here.
        </p>

        <div className="mt-12 p-6 border border-dashed border-gray-700 rounded-xl text-center">
          <p className="text-gray-500 italic">
            This page is currently under construction. In the future, it will
            show system requirements, FPS estimates, and technical features.
          </p>
        </div>
      </div>
    </div>
  );
}
