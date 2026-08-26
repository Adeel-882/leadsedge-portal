'use client';

export default function AppError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <main className="grid min-h-[70vh] place-items-center p-5"><div className="card max-w-md p-8 text-center"><p className="page-eyebrow">Something went wrong</p><h1 className="text-2xl font-bold">We couldn’t load this page</h1><p className="mt-3 text-sm leading-6 text-muted">Your data is safe. Check your connection and try again.</p><button className="button-primary mt-6" onClick={reset}>Try again</button></div></main>;
}
