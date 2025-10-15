import Link from 'next/link';

export default function HomePage() {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gray-900 text-white font-sans">
      <div className="text-center">
        <h1 className="text-4xl font-bold mb-4">Welcome to Jules.google</h1>
        <p className="text-lg text-gray-400 mb-8">Your personal AI assistant.</p>
        <div className="flex justify-center space-x-4">
          <Link href="/chat" legacyBehavior>
            <a className="bg-blue-600 text-white font-bold rounded-md py-3 px-6 hover:bg-blue-500 transition duration-200">
              Go to Chat
            </a>
          </Link>
          <Link href="/code-generator" legacyBehavior>
            <a className="bg-green-600 text-white font-bold rounded-md py-3 px-6 hover:bg-green-500 transition duration-200">
              Go to Code Generator
            </a>
          </Link>
          <Link href="/admin" legacyBehavior>
            <a className="bg-purple-600 text-white font-bold rounded-md py-3 px-6 hover:bg-purple-500 transition duration-200">
              Go to Admin
            </a>
          </Link>
        </div>
      </div>
    </div>
  );
}