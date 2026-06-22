import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "404: Page Not Found",
};

export default function NotFound() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center text-center">
      <h1 className="text-4xl font-bold text-gray-800 dark:text-gray-200">
        404
      </h1>
      <p className="mt-4 text-lg text-gray-600 dark:text-gray-400">
        This page could not be found.
      </p>
      <Link
        href="/"
        className="mt-6 rounded-lg bg-blue-600 px-6 py-2 text-white transition-colors hover:bg-blue-700"
      >
        Go home
      </Link>
    </div>
  );
}
