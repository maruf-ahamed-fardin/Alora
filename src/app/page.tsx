import Link from "next/link";

export default function Home() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-3 px-4 text-center">
      <h1 className="text-4xl font-semibold tracking-tight">Alora</h1>
      <p className="text-base opacity-70">
        Intelligent conversations, beautifully connected.
      </p>
      <Link
        href="/playground"
        className="mt-4 rounded-full bg-emerald-600 px-5 py-2.5 text-sm font-medium text-white"
      >
        Open test chat
      </Link>
    </main>
  );
}
