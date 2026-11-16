import BadgeEditor from "@/components/BadgeEditor";

export default function Home() {
  return (
    <main className="flex-1">
      <h1 className="px-4 pt-4 text-center text-lg font-bold text-slate-900 md:hidden">
        Create your REPEXSA 2026 badge
      </h1>
      <BadgeEditor />
    </main>
  );
}
