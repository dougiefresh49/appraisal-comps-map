"use client";

import * as React from "react";
import Link from "next/link";

interface Props {
  children: React.ReactNode;
}

export default function PhotosLayout({ children }: Props) {
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="py-8">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          {/* Header */}
          <div className="mb-8">
            <div className="mb-4 flex items-center gap-4">
              <Link
                href="/projects"
                className="flex items-center gap-2 text-gray-600 transition-colors hover:text-gray-900"
              >
                <svg
                  className="h-5 w-5"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M15 19l-7-7 7-7"
                  />
                </svg>
                <span className="text-sm font-medium">Back to Projects</span>
              </Link>
            </div>
            <h1 className="mb-2 text-3xl font-bold text-gray-900">
              Photo Management
            </h1>
            <p className="text-gray-600">
              Drag and drop photos to reorder, click &quot;Edit&quot; to change
              labels, then save your changes.
            </p>
          </div>
          {children}
        </div>
      </div>
    </div>
  );
}
